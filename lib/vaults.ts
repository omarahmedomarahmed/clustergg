// The four vaults, and the rule that makes them mean anything.
//
// `docs/MODEL.md` §3. Every payout comes out of a vault that money
// has actually arrived in, and a vault's balance is a SUM OF ROWS — never a
// stored number somebody edits.
//
// That is the whole design decision. A stored balance drifts, and once it has
// drifted there is no way to prove what it should have been. A summed one can
// always be recomputed from history, and every row says who moved it and why.
// The due-diligence report found a platform whose numbers could not be
// reconstructed; this is the shape that stops that happening to the money.
//
// B87/C13 turned this on. `allocateInvoice` posts the four rows the moment a
// brand's invoice is marked paid, so the vaults hold money that has ARRIVED
// rather than money that has been promised — the distinction the whole design
// rests on, and the reason allocation hangs off "paid" and not off "invoiced".

import { and, eq, gte, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { uid } from "@/lib/utils";
import { VAULTS, DEFAULT_SPLIT, SPLIT_PRESETS, platformSharePct, obligationSharePct, type Vault } from "@/lib/vault-split";

// The split itself moved to `lib/vault-split.ts` in B120 so the pure modules —
// the rate card, the financial model — can read it without pulling a database
// client into the browser bundle. Re-exported here because thirty call sites
// import it from this module and every one of them is right to.
export { VAULTS, DEFAULT_SPLIT, SPLIT_PRESETS, platformSharePct, obligationSharePct };
export type { Vault };

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
  kind: "challenge_sale" | "payout" | "transfer" | "sweep" | "adjustment" | "breakage" | "cp_credit";
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

// ===== Money arriving, and money being promised =====
//
// C13. Prizes are 50% of every dollar — the largest line — and had no vault, no
// ledger and no liability tracking at all. A prize is awarded as a TROPHY and
// becomes cash only when it is redeemed, months later or never, so the one pool
// big enough to sink us was the one nothing watched.
//
// Two events, deliberately separate:
//
//   * ALLOCATION happens when an invoice is PAID. Money in.
//   * COMMITMENT happens when a challenge awards its podium. The prize vault
//     now owes that value to a gamer, whether or not they ever redeem it.
//
// Hanging allocation off "invoiced" instead would fill the vaults with money
// nobody has sent, and every payout below would be drawing on a promise.

/** The split in force, from settings, falling back to the model's default. */
export async function currentSplit(db: DB): Promise<Record<Vault, number>> {
  try {
    const [row] = await db.select({ value: schema.platformSettings.value })
      .from(schema.platformSettings)
      .where(eq(schema.platformSettings.key, "vaults.split")).limit(1);
    const raw = row?.value as Record<string, number> | null;
    if (!raw) return DEFAULT_SPLIT;
    // A stored split that does not total 100 is not applied. It would invent or
    // lose money silently, and the default is at least a number we can defend.
    if (splitProblems(raw).length) return DEFAULT_SPLIT;
    return { prize: raw.prize, server: raw.server, cp: raw.cp, cluster: raw.cluster };
  } catch { return DEFAULT_SPLIT; }
}

/**
 * Post a paid invoice's four allocation rows. C13.
 *
 * IDEMPOTENT, because two different admin actions can mark the same invoice
 * paid and a webhook may do it a third time. The guard is a read of the ledger
 * itself rather than a flag on the invoice — a flag is a second place the truth
 * can live, and the ledger is the thing that must be right.
 *
 * Returns what was allocated, or null when there was nothing to do.
 */
export async function allocateInvoice(
  db: DB,
  invoiceId: string,
): Promise<{ total: number; allocated: Record<Vault, number> } | null> {
  const [inv] = await db.select({
    id: schema.brandInvoices.id,
    status: schema.brandInvoices.status,
  }).from(schema.brandInvoices).where(eq(schema.brandInvoices.id, invoiceId)).limit(1);
  if (!inv || inv.status !== "paid") return null;

  const [seen] = await db.select({ id: schema.vaultLedger.id }).from(schema.vaultLedger)
    .where(and(eq(schema.vaultLedger.refType, "invoice"), eq(schema.vaultLedger.refId, invoiceId)))
    .limit(1);
  if (seen) return null;

  // The invoice TOTAL is its lines, summed here rather than read from a stored
  // column, for the same reason `balances()` sums rows: a total that can drift
  // from its lines is a total that will.
  const lines = await db.select({
    quantity: schema.invoiceLines.quantity,
    unitAmount: schema.invoiceLines.unitAmount,
  }).from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, invoiceId));
  const total = Math.round(lines.reduce((s, l) => s + Number(l.quantity ?? 0) * Number(l.unitAmount ?? 0), 0) * 100) / 100;
  if (!(total > 0)) return null;

  const split = await currentSplit(db);
  const allocated = allocate(total, split);

  // Rounding is absorbed by the CLUSTER vault, never by prizes or by the two
  // pools we pay out of. Four independently rounded shares can miss the total
  // by a cent, and the only honest place for that cent is our own line.
  const sum = VAULTS.reduce((a, v) => a + allocated[v], 0);
  allocated.cluster = Math.round((allocated.cluster + (total - sum)) * 100) / 100;

  await postToLedger(db, VAULTS.map((v) => ({
    vault: v,
    amount: allocated[v],
    kind: "challenge_sale" as const,
    refType: "invoice",
    refId: invoiceId,
    reason: `${split[v]}% of invoice ${invoiceId}`,
  })));
  return { total, allocated };
}

/**
 * Undo an allocation when an invoice stops being paid.
 *
 * REVERSING ROWS, never a delete. Money that was recorded as arrived and then
 * was not is a fact about the week, and a ledger you can delete from is a
 * ledger nobody can reconcile. The balance returns to where it was; the history
 * says why.
 */
export async function reverseInvoiceAllocation(db: DB, invoiceId: string): Promise<boolean> {
  const rows = await db.select({
    vault: schema.vaultLedger.vault,
    amount: schema.vaultLedger.amount,
    kind: schema.vaultLedger.kind,
  }).from(schema.vaultLedger)
    .where(and(eq(schema.vaultLedger.refType, "invoice"), eq(schema.vaultLedger.refId, invoiceId)));
  if (!rows.length) return false;
  // Already reversed: the rows for this invoice sum to zero.
  const net = rows.reduce((a, r) => a + Number(r.amount ?? 0), 0);
  if (Math.abs(net) < 0.005) return false;

  await postToLedger(db, rows.filter((r) => r.kind === "challenge_sale").map((r) => ({
    vault: r.vault as Vault,
    amount: -Number(r.amount ?? 0),
    kind: "adjustment" as const,
    refType: "invoice",
    refId: invoiceId,
    reason: "Invoice no longer paid — allocation reversed.",
  })));
  return true;
}

// ===== CP leaving the vault. B88.1 =====
//
// THE DEFECT THIS CLOSES: nothing debited the CP vault. Sales credited it and
// nothing ever took anything out, so the balance on /admin/vaults was a running
// total of what we had SOLD rather than what was LEFT — and "how much of this
// week's allocation is still available" could not be asked at all.
//
// It matters because the whole gamer economy is about to be derived from that
// number. A ceiling computed against a balance that only grows is a ceiling
// that grows forever.
//
// WHY IT IS WRITTEN HERE AND NOT AT THE EMITTER. Every credit goes through
// `awardQuestAction`, so one call site covers every action, every quest and
// every future emitter. A debit added per-emitter is a debit somebody forgets
// on the next one.

/**
 * Record CP credited to a gamer as money leaving the CP vault.
 *
 * Takes the handle it was given and never opens its own — this runs inside the
 * award transaction, and a helper that calls `getDb()` from inside one
 * deadlocks. That has happened twice on this project.
 *
 * Never throws. A gamer who earned CP has earned it; failing the award because
 * the bookkeeping row would not write turns an accounting problem into a
 * product one. A missing row shows up as a vault that reconciles high, which is
 * visible; a refused award shows up as a gamer who thinks the site is broken.
 */
export async function debitCpVault(
  db: DB,
  entries: { userId: string; cp: number; actionKey: string; rate: number }[],
): Promise<void> {
  // A zero-CP event drains nothing. `awardQuestAction` writes a row whenever an
  // action fires, including at the ceiling, and those must not appear here or
  // the ledger fills with rows worth $0.00.
  const real = entries.filter((e) => e.cp > 0 && e.rate > 0);
  if (!real.length) return;
  try {
    await postToLedger(db, real.map((e) => ({
      vault: "cp" as const,
      // Negative: money out. Rounded to the cent the ledger stores, so the sum
      // of the rows is exactly the balance rather than nearly it.
      amount: -(Math.round((e.cp / e.rate) * 100) / 100),
      kind: "cp_credit" as const,
      refType: "user",
      refId: e.userId,
      // The action and the CP, so "where did the vault go" is answerable from
      // the ledger alone without joining quest_events.
      reason: `${e.cp} CP · ${e.actionKey}`,
    })));
  } catch { /* see above: bookkeeping must not fail an award */ }
}

/**
 * What has been credited out of the CP vault since a moment.
 *
 * Positive dollars. The counterpart to an allocation: allocated minus this is
 * what is left to spend this week.
 */
export async function cpSpentSince(db: DB, since: Date): Promise<number> {
  try {
    const [row] = await db.select({
      total: sql<number>`coalesce(sum(${schema.vaultLedger.amount}), 0)`,
    }).from(schema.vaultLedger)
      .where(and(
        eq(schema.vaultLedger.vault, "cp"),
        eq(schema.vaultLedger.kind, "cp_credit"),
        gte(schema.vaultLedger.createdAt, since),
      ));
    return Math.abs(Number(row?.total ?? 0));
  } catch { return 0; }
}
