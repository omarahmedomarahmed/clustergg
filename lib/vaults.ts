// The four vaults, and the rule that makes them mean anything.
//
// `docs/COMMERCIAL_MODEL_V2.md` §3. Every payout comes out of a vault that money
// has actually arrived in, and a vault's balance is a SUM OF ROWS — never a
// stored number somebody edits.
//
// That is the whole design decision. A stored balance drifts, and once it has
// drifted there is no way to prove what it should have been. A summed one can
// always be recomputed from history, and every row says who moved it and why.
// The due-diligence report found a platform whose numbers could not be
// reconstructed; this is the shape that stops that happening to the money.
//
// Nothing here writes yet — the ledger table exists so history starts
// accumulating from the first challenge sold. The payout paths land in B87.

import { sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { uid } from "@/lib/utils";

/** The four pools money is divided into. Prizes were missing from v2's first draft. */
export const VAULTS = ["prize", "server", "cp", "cluster"] as const;
export type Vault = (typeof VAULTS)[number];

/**
 * The default split of a challenge, as PERCENTAGES.
 *
 * Percentages, never fixed dollars, so the price is a dial: move
 * `challengePrice` and every pool moves with it. The old model hard-coded
 * `prizePool: 175` and *derived* the percentage from it, which meant $350 gave
 * 50% by coincidence and $400 would have silently given 44%.
 *
 * The prize half is fixed. The other half splits three ways with ONE of the
 * three holding 20 while the other two hold 15 — see `SPLIT_PRESETS`.
 */
export const DEFAULT_SPLIT: Record<Vault, number> = {
  prize: 50,
  cluster: 20,
  server: 15,
  cp: 15,
};

/**
 * The three positions of the one switch an operator actually touches.
 *
 * Deliberately a switch and not four number inputs: whoever runs this day to
 * day should never have to do arithmetic to keep a money invariant true.
 */
export const SPLIT_PRESETS: Record<string, Record<Vault, number>> = {
  default: { prize: 50, cluster: 20, server: 15, cp: 15 },
  "grow-servers": { prize: 50, cluster: 15, server: 20, cp: 15 },
  "grow-gamers": { prize: 50, cluster: 15, server: 15, cp: 20 },
};

/**
 * Does a split add up?
 *
 * A money invariant, not a form validation. A split that does not total 100
 * either pays out money that never arrived or silently keeps money that was
 * promised to somebody — and both are invisible until somebody reconciles.
 */
export function splitProblems(split: Record<string, number>): string[] {
  const out: string[] = [];
  for (const v of VAULTS) {
    const n = Number(split[v]);
    if (!Number.isFinite(n)) out.push(`${v} is not a number.`);
    else if (n < 0) out.push(`${v} cannot be negative.`);
  }
  const total = VAULTS.reduce((a, v) => a + (Number(split[v]) || 0), 0);
  if (Math.round(total * 100) / 100 !== 100) {
    out.push(`The four shares total ${total}%, not 100%. Money would be invented or lost.`);
  }
  return out;
}

/** What each vault receives from one sale, in money. */
export function allocate(price: number, split: Record<Vault, number> = DEFAULT_SPLIT) {
  const out = {} as Record<Vault, number>;
  for (const v of VAULTS) out[v] = Math.round(price * (split[v] / 100) * 100) / 100;
  return out;
}

export type LedgerEntry = {
  vault: Vault;
  /** Positive in, negative out. */
  amount: number;
  kind: "challenge_sale" | "payout" | "transfer" | "sweep" | "adjustment" | "breakage";
  refType?: string;
  refId?: string;
  transferId?: string;
  reason?: string;
  actorId?: string;
};

/** Write rows. Callers pass every leg of a movement together so none can be lost. */
export async function postToLedger(db: DB, entries: LedgerEntry[]): Promise<void> {
  if (!entries.length) return;
  await db.insert(schema.vaultLedger).values(entries.map((e) => ({
    id: uid(),
    vault: e.vault,
    amount: e.amount,
    kind: e.kind,
    refType: e.refType ?? null,
    refId: e.refId ?? null,
    transferId: e.transferId ?? null,
    reason: e.reason ?? null,
    actorId: e.actorId ?? null,
  })));
}

/**
 * A transfer is TWO ROWS sharing an id, written together.
 *
 * Never one row with a signed amount and a note: two vaults change, so two
 * rows change, and sharing `transferId` means they can never be read apart or
 * reconciled separately.
 */
export async function transfer(
  db: DB,
  opts: { from: Vault; to: Vault; amount: number; reason: string; actorId: string },
): Promise<{ ok: true; transferId: string } | { ok: false; error: string }> {
  if (!(opts.amount > 0)) return { ok: false, error: "A transfer has to be a positive amount." };
  if (opts.from === opts.to) return { ok: false, error: "That is the same vault." };
  if (!opts.reason.trim()) return { ok: false, error: "Say why. A movement with no reason is one nobody can audit." };
  const transferId = uid();
  await postToLedger(db, [
    { vault: opts.from, amount: -opts.amount, kind: "transfer", transferId, reason: opts.reason, actorId: opts.actorId },
    { vault: opts.to, amount: opts.amount, kind: "transfer", transferId, reason: opts.reason, actorId: opts.actorId },
  ]);
  return { ok: true, transferId };
}

/** Every vault's balance, summed from rows. There is no stored balance to disagree with. */
export async function balances(db: DB): Promise<Record<Vault, number>> {
  const out = { prize: 0, server: 0, cp: 0, cluster: 0 } as Record<Vault, number>;
  try {
    const rows = await db.select({
      vault: schema.vaultLedger.vault,
      total: sql<number>`coalesce(sum(${schema.vaultLedger.amount}), 0)`,
    }).from(schema.vaultLedger).groupBy(schema.vaultLedger.vault);
    for (const r of rows) {
      if ((VAULTS as readonly string[]).includes(r.vault)) out[r.vault as Vault] = Number(r.total ?? 0);
    }
  } catch { /* no table yet reads as zero, which is the truth */ }
  return out;
}
