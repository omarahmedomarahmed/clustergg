import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { payer } from "@/lib/payments";

// Money out: server owners, and the accounts we do not hold for them.
//
// ===== The two earning types =====
//
// A server owner's page shows two kinds of number and they are not the same
// kind of thing, so they are never added together:
//
//   SPONSORED SHARE — the owner's cut of what a brand paid, scaled by how many
//                     of their members are linked. This is theirs. It is what
//                     a payout draws on.
//
//   MEMBERS' WINNINGS — the prize money members of their server won. This is
//                     NOT the owner's money and is never paid to them; every
//                     cent of a prize pool belongs to the gamer who won it.
//                     It is on the page because it is the best evidence an
//                     owner has that hosting the bot did something for their
//                     community, and because an owner who thinks the prize pool
//                     is their revenue will find out at the worst moment.
//
// Both are labelled on the page in those words. The arithmetic behind the first
// one lives in lib/server-earnings.ts and is not duplicated here.
//
// ===== Who can move money =====
//
// Only an admin. An owner sees what they are owed and can ask about it; the
// release is always ours, always attributed to a named person, and always
// against lines they can check challenge by challenge.

const round2 = (n: number) => Math.round(n * 100) / 100;

export type PayoutLine = {
  id: string;
  kind: string;
  label: string;
  challengeId: string | null;
  amount: number;
};

export type Payout = {
  id: string;
  guildId: string;
  guildName: string | null;
  status: string;
  currency: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  providerKey: string | null;
  providerRef: string | null;
  collectUrl: string | null;
  note: string | null;
  requestedBy: string | null;
  requestedAt: Date | null;
  paidAt: Date | null;
  failedReason: string | null;
  createdAt: Date;
  lines: PayoutLine[];
  total: number;
};

export const PAYOUT_STATUSES = [
  "draft", "requested", "approved", "processing", "paid", "failed", "cancelled",
] as const;

/** Statuses that still represent money we owe. */
export const OPEN_STATUSES = ["draft", "requested", "approved", "processing"];

export const PAYOUT_LINE_KINDS = [
  { key: "sponsored_share", label: "Sponsored challenge share" },
  { key: "bonus", label: "Bonus" },
  { key: "adjustment", label: "Adjustment" },
] as const;

/** How a counterparty says they want to be paid. A word — never an account. */
export const METHOD_OPTIONS = [
  { key: "bank", label: "Bank transfer", note: "Local or international transfer to your bank." },
  { key: "paypal", label: "PayPal", note: "Fast, available almost everywhere, small fee." },
  { key: "wallet", label: "Mobile wallet", note: "Where your country has one — Vodafone Cash, InstaPay and similar." },
  { key: "giftcard", label: "Gift card / prepaid card", note: "No bank account needed. Redeemed in your own currency." },
  { key: "other", label: "Something else", note: "Tell us on the message thread and we'll sort it." },
] as const;

type DB = Awaited<ReturnType<typeof getDb>>;

function shapePayout(
  row: typeof schema.serverPayouts.$inferSelect,
  lines: (typeof schema.serverPayoutLines.$inferSelect)[],
): Payout {
  const shaped = lines.map((l) => ({
    id: l.id, kind: l.kind, label: l.label, challengeId: l.challengeId, amount: round2(Number(l.amount)),
  }));
  return {
    id: row.id, guildId: row.guildId, guildName: row.guildName, status: row.status,
    currency: row.currency, periodStart: row.periodStart, periodEnd: row.periodEnd,
    providerKey: row.providerKey, providerRef: row.providerRef, collectUrl: row.collectUrl,
    note: row.note, requestedBy: row.requestedBy, requestedAt: row.requestedAt,
    paidAt: row.paidAt, failedReason: row.failedReason, createdAt: row.createdAt,
    lines: shaped,
    total: round2(shaped.reduce((a, l) => a + l.amount, 0)),
  };
}

async function hydratePayouts(db: DB, rows: (typeof schema.serverPayouts.$inferSelect)[]): Promise<Payout[]> {
  if (!rows.length) return [];
  const lines = await db.select().from(schema.serverPayoutLines)
    .where(inArray(schema.serverPayoutLines.payoutId, rows.map((r) => r.id)));
  return rows.map((r) => shapePayout(r, lines.filter((l) => l.payoutId === r.id)));
}

export async function listPayouts(opts: { guildId?: string; limit?: number } = {}): Promise<Payout[]> {
  try {
    const db = await getDb();
    const rows = await db.select().from(schema.serverPayouts)
      .where(opts.guildId ? eq(schema.serverPayouts.guildId, opts.guildId) : sql`true`)
      .orderBy(desc(schema.serverPayouts.createdAt))
      .limit(opts.limit ?? 200);
    return hydratePayouts(db, rows);
  } catch { return []; }
}

export async function getPayout(id: string): Promise<Payout | null> {
  try {
    const db = await getDb();
    const [row] = await db.select().from(schema.serverPayouts).where(eq(schema.serverPayouts.id, id)).limit(1);
    if (!row) return null;
    return (await hydratePayouts(db, [row]))[0] ?? null;
  } catch { return null; }
}

/**
 * What a server has already been paid, and what is still moving.
 *
 * The number that matters is `unpaid`: an owner's page says "you have earned X"
 * from the challenge ledger, and it has to also say how much of X has already
 * left, or the same dollar gets celebrated every month.
 */
export async function payoutTotals(guildId: string): Promise<{ paid: number; open: number; lastPaidAt: Date | null }> {
  const rows = await listPayouts({ guildId, limit: 100 });
  let paid = 0, open = 0;
  let lastPaidAt: Date | null = null;
  for (const p of rows) {
    if (p.status === "paid") {
      paid = round2(paid + p.total);
      if (p.paidAt && (!lastPaidAt || p.paidAt > lastPaidAt)) lastPaidAt = p.paidAt;
    } else if (OPEN_STATUSES.includes(p.status)) open = round2(open + p.total);
  }
  return { paid, open, lastPaidAt };
}

// ===== The payout account: a preference and a provider handle =====

export type PayoutAccount = {
  ownerType: string;
  ownerId: string;
  providerKey: string;
  providerRecipientId: string | null;
  methodPreference: string | null;
  country: string | null;
  currency: string;
  status: string;
  note: string | null;
  updatedAt: Date;
};

export async function getPayoutAccount(ownerType: "server" | "gamer", ownerId: string): Promise<PayoutAccount | null> {
  try {
    const db = await getDb();
    const [row] = await db.select().from(schema.payoutAccounts)
      .where(sql`${schema.payoutAccounts.ownerType} = ${ownerType} AND ${schema.payoutAccounts.ownerId} = ${ownerId}`)
      .limit(1);
    return row ?? null;
  } catch { return null; }
}

/**
 * Record a preference.
 *
 * Everything this accepts is a word or a country code. There is no parameter
 * for an account number and adding one would be the bug — the provider's own
 * page is where those are typed, which is what `onboardingUrl` is for.
 */
export async function savePayoutPreference(
  ownerType: "server" | "gamer",
  ownerId: string,
  input: { method?: string; country?: string | null; currency?: string; providerKey?: string; providerRecipientId?: string | null; status?: string; note?: string | null },
): Promise<void> {
  const db = await getDb();
  const method = METHOD_OPTIONS.some((m) => m.key === input.method) ? input.method! : null;
  const existing = await getPayoutAccount(ownerType, ownerId);
  const patch = {
    providerKey: input.providerKey ?? existing?.providerKey ?? "manual",
    providerRecipientId: input.providerRecipientId ?? existing?.providerRecipientId ?? null,
    methodPreference: method ?? existing?.methodPreference ?? null,
    country: (input.country ?? existing?.country ?? null)?.slice(0, 2).toUpperCase() || null,
    currency: (input.currency ?? existing?.currency ?? "USD").slice(0, 3).toUpperCase(),
    status: input.status ?? (method ? "ready" : existing?.status ?? "none"),
    note: input.note ?? existing?.note ?? null,
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(schema.payoutAccounts).set(patch)
      .where(sql`${schema.payoutAccounts.ownerType} = ${ownerType} AND ${schema.payoutAccounts.ownerId} = ${ownerId}`);
  } else {
    await db.insert(schema.payoutAccounts).values({ id: uid(), ownerType, ownerId, ...patch });
  }
}

// ===== Creating and releasing a payout =====

export type NewPayoutInput = {
  guildId: string;
  guildName?: string | null;
  currency?: string;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  note?: string | null;
  requestedBy: string;
  lines: { kind: string; label: string; challengeId?: string | null; amount: number }[];
};

/**
 * Open a payout for a server, in `requested` state.
 *
 * "Requested" means an admin has asked for this money to go out — the name in
 * `requestedBy` is who. It is not paid and no provider has been called; that is
 * `sendPayout`, deliberately a second, separate action, because the review and
 * the release should not be the same click.
 */
export async function createPayout(input: NewPayoutInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const lines = input.lines.filter((l) => Number.isFinite(l.amount) && l.amount !== 0);
  if (!lines.length) return { ok: false, error: "A payout needs at least one line with an amount." };
  const total = round2(lines.reduce((a, l) => a + Number(l.amount), 0));
  if (total <= 0) return { ok: false, error: "The lines add up to nothing — check the amounts." };

  try {
    const db = await getDb();
    const id = uid();
    await db.insert(schema.serverPayouts).values({
      id,
      guildId: input.guildId,
      guildName: input.guildName ?? null,
      status: "requested",
      currency: (input.currency ?? "USD").toUpperCase(),
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      note: input.note ?? null,
      requestedBy: input.requestedBy,
      requestedAt: new Date(),
    });
    for (const l of lines) {
      await db.insert(schema.serverPayoutLines).values({
        id: uid(), payoutId: id, kind: l.kind, label: l.label,
        challengeId: l.challengeId ?? null, amount: round2(Number(l.amount)),
      });
    }
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: `Could not open the payout: ${(e as Error).message}` };
  }
}

/**
 * Hand it to the provider.
 *
 * Every outcome is written down, including failure — a payout that quietly did
 * not send is worse than one that visibly failed, because nobody chases it.
 */
export async function sendPayout(payoutId: string, to: { name: string; email?: string | null; country?: string | null }): Promise<{ ok: true; manual: boolean; link: string | null } | { ok: false; error: string }> {
  const payout = await getPayout(payoutId);
  if (!payout) return { ok: false, error: "That payout no longer exists." };
  if (payout.status === "paid") return { ok: false, error: "Already paid." };
  if (payout.total <= 0) return { ok: false, error: "Nothing to send." };

  const db = await getDb();
  const { adapter, picked } = await payer("payout");

  const res = await adapter.send({
    payoutRef: payout.id,
    to: { ref: payout.guildId, name: to.name, email: to.email ?? null, country: to.country ?? null },
    amount: { amount: payout.total, currency: payout.currency },
    memo: payout.note || `Cluster server earnings${payout.periodEnd ? ` to ${payout.periodEnd.toDateString()}` : ""}`,
  });

  if (!res.ok) {
    await db.update(schema.serverPayouts)
      .set({ status: "failed", failedReason: res.error, providerKey: adapter.key })
      .where(eq(schema.serverPayouts.id, payout.id));
    return { ok: false, error: res.error };
  }

  // The manual adapter returns no reference, which is exactly right: staff make
  // the transfer and mark it paid. Anything else has actually been submitted.
  const manual = adapter.key === "manual";
  await db.update(schema.serverPayouts).set({
    status: manual ? "approved" : "processing",
    providerKey: adapter.key,
    providerRef: res.ref || null,
    collectUrl: res.link || null,
    failedReason: null,
    ...(res.settled ? { status: "paid", paidAt: new Date() } : {}),
  }).where(eq(schema.serverPayouts.id, payout.id));

  void picked;
  return { ok: true, manual, link: res.link };
}

export async function markPayoutPaid(payoutId: string, ref?: string): Promise<void> {
  const db = await getDb();
  await db.update(schema.serverPayouts)
    .set({ status: "paid", paidAt: new Date(), providerRef: ref || undefined, failedReason: null })
    .where(eq(schema.serverPayouts.id, payoutId));
}

export async function setPayoutStatus(payoutId: string, status: string, reason?: string): Promise<void> {
  if (!PAYOUT_STATUSES.includes(status as (typeof PAYOUT_STATUSES)[number])) return;
  const db = await getDb();
  await db.update(schema.serverPayouts)
    .set({ status, failedReason: status === "failed" ? (reason ?? "Marked failed by staff") : null })
    .where(eq(schema.serverPayouts.id, payoutId));
}
