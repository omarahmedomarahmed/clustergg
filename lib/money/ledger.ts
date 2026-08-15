// The ledger, and the only way money moves.
//
// Four vaults, one append-only table, and no balance columns anywhere. Every
// balance on every screen — the admin console, the owner portal, the public
// pool page — is `sum(amount)` over rows that each name who moved the money
// and why.
//
// Nothing outside this module writes to `vault_ledger`. That is enforceable by
// reading, and it is the difference between "we can reconstruct any figure" and
// "we think this number is right".

import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";
import { splitOf, communitySplitOf, DEFAULT_SPLIT_BPS, type SplitBps, type CommunityTier } from "./amounts.ts";

export const VAULTS = ["income", "prize", "server", "cluster"] as const;
export type Vault = (typeof VAULTS)[number];

export const LEDGER_KINDS = [
  "challenge_sale",
  "split",
  "trophy_award",
  "redemption",
  "pool_allocation",
  "payout",
  "sweep",
  "refund",
] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export type LedgerEntry = {
  vault: Vault;
  amount: number;
  kind: LedgerKind;
  refType?: string | null;
  refId?: string | null;
  reason: string;
  actorId?: string | null;
};

/**
 * Append rows. Always several at once, and always inside one transaction.
 *
 * A split is six rows — three out of income, three into the vaults — and the
 * system only sums to zero if all six land or none of them do. Writing them
 * one at a time is how a crash halfway leaves the platform owing itself money
 * with nothing to say so.
 */
export async function post(
  db: DB,
  entries: LedgerEntry[],
  opts: { tx?: DB } = {},
): Promise<void> {
  if (entries.length === 0) return;
  for (const e of entries) {
    if (!Number.isInteger(e.amount)) {
      throw new Error(`Ledger amounts are whole cents; got ${e.amount}`);
    }
    if (!e.reason) {
      throw new Error("Every ledger row names a reason. A row nobody can explain is a row nobody can reverse.");
    }
  }
  const rows = entries.map((e) => ({
    id: uid(),
    vault: e.vault,
    amount: e.amount,
    kind: e.kind,
    refType: e.refType ?? null,
    refId: e.refId ?? null,
    reason: e.reason,
    actorId: e.actorId ?? null,
  }));

  if (opts.tx) {
    await opts.tx.insert(schema.vaultLedger).values(rows);
    return;
  }
  const { withTx } = await import("../db/tx.ts");
  await withTx(db, async (tx) => {
    await tx.insert(schema.vaultLedger).values(rows);
  });
}

/** A vault's balance. `sum(ledger)`, every time, from the rows. */
export async function balanceOf(db: DB, vault: Vault): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.vaultLedger.amount}), 0)::int` })
    .from(schema.vaultLedger)
    .where(eq(schema.vaultLedger.vault, vault));
  return row?.total ?? 0;
}

export async function allBalances(db: DB): Promise<Record<Vault, number>> {
  const rows = await db
    .select({
      vault: schema.vaultLedger.vault,
      total: sql<number>`coalesce(sum(${schema.vaultLedger.amount}), 0)::int`,
    })
    .from(schema.vaultLedger)
    .groupBy(schema.vaultLedger.vault);
  const out = { income: 0, prize: 0, server: 0, cluster: 0 };
  for (const r of rows) out[r.vault as Vault] = r.total;
  return out;
}

/**
 * The whole ledger sums to zero, always.
 *
 * Income takes money in and immediately pays it out to three vaults, so every
 * cent is in exactly one place and the four balances plus income's remainder
 * account for everything. A non-zero total means a write happened outside
 * `post`, or a split that did not balance — either way something is wrong
 * before anybody has to ask.
 */
export async function ledgerBalances(db: DB): Promise<boolean> {
  const [row] = await db.select({
    total: sql<number>`coalesce(sum(${schema.vaultLedger.amount}), 0)::int`,
  }).from(schema.vaultLedger);
  const balances = await allBalances(db);
  return (row?.total ?? 0) === balances.income + balances.prize + balances.server + balances.cluster;
}

/**
 * Route a paid invoice into the vaults. **The only place income splits.**
 *
 * M6: money enters when the invoice is PAID, never when it is issued.
 * Allocating on issue fills the vaults with money nobody has sent, and every
 * payout then draws on a promise.
 *
 * Idempotent by construction: it refuses to route an invoice that already has
 * ledger rows. A payment webhook that fires twice is not a hypothetical — it
 * is the documented behaviour of every payment provider — and the second
 * delivery would otherwise double the prize vault against trophies that do
 * not exist.
 */
export async function routePaidInvoice(
  db: DB,
  invoiceId: string,
  opts: { bps?: SplitBps; communityTier?: CommunityTier; actorId?: string | null } = {},
): Promise<{ routed: boolean; prize: number; server: number; cluster: number }> {
  const { withTx } = await import("../db/tx.ts");

  return withTx(db, async (tx) => {
    const [invoice] = await tx
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, invoiceId));
    if (!invoice) throw new Error(`No such invoice: ${invoiceId}`);
    if (!invoice.paidAt) {
      throw new Error(
        "An unpaid invoice does not reach a vault. Money enters when it is " +
          "paid, never when it is issued.",
      );
    }

    const already = await tx
      .select({ id: schema.vaultLedger.id })
      .from(schema.vaultLedger)
      .where(
        and(
          eq(schema.vaultLedger.refType, "invoice"),
          eq(schema.vaultLedger.refId, invoiceId),
        ),
      );
    if (already.length > 0) {
      return { routed: false, prize: 0, server: 0, cluster: 0 };
    }

    const total = await totalOf(tx, invoiceId);
    const split = opts.communityTier
      ? communitySplitOf(opts.communityTier)
      : splitOf(total, opts.bps ?? DEFAULT_SPLIT_BPS);

    const ref = { refType: "invoice", refId: invoiceId, actorId: opts.actorId ?? null };
    await post(
      db,
      [
        { vault: "income", amount: total, kind: "challenge_sale", reason: `Invoice ${invoiceId} paid`, ...ref },
        { vault: "income", amount: -total, kind: "split", reason: `Invoice ${invoiceId} split`, ...ref },
        { vault: "prize", amount: split.prize, kind: "split", reason: `Prize share of invoice ${invoiceId}`, ...ref },
        { vault: "server", amount: split.server, kind: "split", reason: `Server share of invoice ${invoiceId}`, ...ref },
        { vault: "cluster", amount: split.cluster, kind: "split", reason: `Cluster share of invoice ${invoiceId}`, ...ref },
      ],
      { tx },
    );

    return { routed: true, ...split };
  });
}

/** I1 — a total is its lines, recomputed. Never a stored number. */
export async function totalOf(db: DB, invoiceId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.invoiceLines.amountCents}), 0)::int` })
    .from(schema.invoiceLines)
    .where(eq(schema.invoiceLines.invoiceId, invoiceId));
  return row?.total ?? 0;
}

/** Every ledger row attached to one thing, for an admin who asks "why". */
export async function entriesFor(
  db: DB,
  refType: string,
  refIds: string[],
): Promise<schema.VaultLedgerRow[]> {
  if (refIds.length === 0) return [];
  return db
    .select()
    .from(schema.vaultLedger)
    .where(
      and(
        eq(schema.vaultLedger.refType, refType),
        inArray(schema.vaultLedger.refId, refIds),
      ),
    );
}
