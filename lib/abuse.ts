// The caps do not stop a second account (B35).
//
// Per-gamer caps are meaningless if gamers are free to create. B34 already took
// most of the incentive off the gamer side — fifty fake accounts at the new
// numbers is $2.50 a day rather than $63 — but **the server-owner side is
// untouched by the repricing and is where the real money is**.
//
// Owners take 5% of sponsored spend at 500 linked members, 10% at 1,000, 25% at
// 5,000. That is a standing incentive to manufacture linked members, fake
// Discord accounts are cheap, and a tier is worth a share of brand spend for as
// long as the server exists. This file is the three defences, in the order they
// are worth building:
//
//   1. A payout holding period. Money that has left through a payout provider
//      cannot be clawed back, so a delay is the ONLY reversal mechanism that
//      exists. Everything else here is detection; this is the one that recovers
//      money.
//   2. Qualified linked accounts, not raw ones. A linked account with no proof
//      of ownership and no history is not a member, it is a row.
//   3. Creation-velocity friction. Not a wall — enough that fifty accounts is
//      work.

import { and, count, eq, gte, ilike, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/**
 * How long a server's FIRST payout waits after its tier unlocks.
 *
 * Long enough to notice manufactured growth and to have a human look; short
 * enough that an honest owner is not being punished for succeeding. It applies
 * once, to the first payout only — after that the server has a track record.
 *
 * ===== C10: this and "weekly pool" have to be said together =====
 *
 * The model pays a WEEKLY pool, and a new server's first week is therefore
 * earned in week one and paid in week five. Both statements are true and
 * quoting only the first is how an owner ends up feeling lied to on day eight.
 *
 * The hold is not shortened, because the thing it defends against is exactly a
 * server that manufactured its way to a tier and wants the money before anybody
 * looks. What changed is the wording: `PAYOUT_HOLD_PHRASE` is the one sentence
 * every surface uses, so no page can promise "paid weekly" on its own.
 */
export const PAYOUT_HOLD_DAYS = 30;

/**
 * The sentence. One copy, used everywhere the pool is described.
 *
 * A shared string rather than four hand-written variants: the review found the
 * contradiction because two pages said different things, and two pages saying
 * different things is what a constant prevents.
 */
export const PAYOUT_HOLD_PHRASE =
  `Earned weekly, paid after a ${PAYOUT_HOLD_DAYS}-day hold on your first payout — after that, weekly.`;

/**
 * How long a linked member has to have been linked before they count toward a
 * tier, and what else they need.
 *
 * A week is chosen because it is longer than a burst: manufacturing 500 accounts
 * is a day's work, and waiting a week with each of them holding a *proven* game
 * account is a different order of effort.
 */
export const QUALIFY_AFTER_DAYS = 7;

export type LinkedCounts = {
  /** Everybody with a first-link timestamp. The number owners already see. */
  raw: number;
  /** The ones that count toward a tier. */
  qualified: number;
};

/**
 * Why a member does not count. Kept as prose because owners are shown this —
 * a rule an owner cannot read is a rule they will assume is arbitrary.
 */
export const QUALIFY_RULE =
  `A linked member counts toward your tier once they have been linked for ${QUALIFY_AFTER_DAYS} days ` +
  `and have at least one game account whose ownership is proven. ` +
  `Everyone else still shows in your member count — they just do not move the tier.`;

/**
 * Qualified and raw linked counts, per guild.
 *
 * Both numbers, always, because **the rule must not be a secret**. An owner who
 * sees only the qualified count thinks members vanished; one who sees only the
 * raw count thinks they have hit a tier they have not.
 */
export async function linkedCounts(db: DB, guildIds?: string[]): Promise<Map<string, LinkedCounts>> {
  const out = new Map<string, LinkedCounts>();
  try {
    const cutoff = new Date(Date.now() - QUALIFY_AFTER_DAYS * 86400_000);
    const scope = guildIds?.length ? [eq(schema.discordGuildMembers.guildId, schema.discordGuildMembers.guildId)] : [];
    void scope;

    const rawRows = await db.select({
      guildId: schema.discordGuildMembers.guildId,
      n: sql<number>`count(${schema.discordGuildMembers.firstLinkedAt})`,
    }).from(schema.discordGuildMembers)
      .where(guildIds?.length ? inArray(schema.discordGuildMembers.guildId, guildIds) : undefined)
      .groupBy(schema.discordGuildMembers.guildId);

    // Qualified: linked before the cutoff AND holding at least one game account
    // whose ownership is PROVEN (see linked_game_accounts.verified — it means
    // proven, not "the provider's API answered").
    const qualRows = await db.select({
      guildId: schema.discordGuildMembers.guildId,
      n: sql<number>`count(distinct ${schema.discordGuildMembers.userId})`,
    }).from(schema.discordGuildMembers)
      .innerJoin(schema.linkedGameAccounts, eq(schema.linkedGameAccounts.userId, schema.discordGuildMembers.userId))
      .where(and(
        guildIds?.length ? inArray(schema.discordGuildMembers.guildId, guildIds) : undefined,
        isNotNull(schema.discordGuildMembers.firstLinkedAt),
        lt(schema.discordGuildMembers.firstLinkedAt, cutoff),
        eq(schema.linkedGameAccounts.verified, true),
      ))
      .groupBy(schema.discordGuildMembers.guildId);

    for (const r of rawRows) out.set(r.guildId, { raw: Number(r.n ?? 0), qualified: 0 });
    for (const r of qualRows) {
      const cur = out.get(r.guildId) ?? { raw: 0, qualified: 0 };
      out.set(r.guildId, { ...cur, qualified: Number(r.n ?? 0) });
    }
  } catch { /* an unreadable count must not take a billing page down */ }
  return out;
}

/** One guild's pair, for the places that only need one. */
export async function linkedCountsFor(db: DB, guildId: string): Promise<LinkedCounts> {
  return (await linkedCounts(db, [guildId])).get(guildId) ?? { raw: 0, qualified: 0 };
}

export type HoldState = {
  held: boolean;
  /** Null when nothing is holding it. */
  until: string | null;
  reason: string;
};

/**
 * Whether a server's payout is still inside its holding period.
 *
 * The hold applies to the FIRST payout only. `unlockedAt` is when the server
 * first crossed a paying tier; `hasBeenPaid` is whether any payout has ever
 * completed for it. A server that has been paid before has a track record and
 * is not held again — holding every payout forever would be a tax on the honest
 * majority to slow down a minority we can already see.
 */
export function payoutHold(
  unlockedAt: Date | string | null,
  hasBeenPaid: boolean,
  now = new Date(),
): HoldState {
  if (hasBeenPaid) return { held: false, until: null, reason: "" };
  if (!unlockedAt) {
    // No recorded unlock and no payout history. Treated as held rather than
    // released: an unknown start date is exactly the case where somebody has
    // arrived at a tier by a route we did not record.
    return {
      held: true, until: null,
      reason: `This server has never been paid and we have no record of when its tier unlocked. The first payout is held until a human confirms the growth.`,
    };
  }
  const start = new Date(unlockedAt);
  const until = new Date(start.getTime() + PAYOUT_HOLD_DAYS * 86400_000);
  if (now >= until) return { held: false, until: null, reason: "" };
  const days = Math.ceil((until.getTime() - now.getTime()) / 86400_000);
  return {
    held: true,
    until: until.toISOString(),
    reason: `First payout. Held for ${PAYOUT_HOLD_DAYS} days after the tier unlocked — ${days} day${days === 1 ? "" : "s"} left. Money that has left a payout provider cannot be brought back, so the delay is the only reversal we have.`,
  };
}

/**
 * Has this guild ever completed a payout?
 *
 * "Completed" and not "opened": a draft or a cancelled payout is not a track
 * record, and treating one as such would let somebody open and cancel a payout
 * to clear their own hold.
 */
export async function hasBeenPaid(db: DB, guildId: string): Promise<boolean> {
  try {
    const [row] = await db.select({ n: count() }).from(schema.serverPayouts)
      .where(and(eq(schema.serverPayouts.guildId, guildId), eq(schema.serverPayouts.status, "paid")));
    return Number(row?.n ?? 0) > 0;
  } catch { return false; }
}

/** Everything the payout guard needs, in one read. */
export async function payoutHoldFor(db: DB, guildId: string, now = new Date()): Promise<HoldState> {
  try {
    const [[g], paid] = await Promise.all([
      db.select({ unlockedAt: schema.discordGuilds.tierUnlockedAt })
        .from(schema.discordGuilds).where(eq(schema.discordGuilds.guildId, guildId)).limit(1),
      hasBeenPaid(db, guildId),
    ]);
    return payoutHold(g?.unlockedAt ?? null, paid, now);
  } catch {
    // Fail CLOSED. A guard that opens when the database hiccups is not a guard,
    // and the cost of being wrong here is money that cannot come back.
    return { held: true, until: null, reason: "Could not check the holding period, so the payout is held." };
  }
}

/**
 * Stamp the moment a server first reaches a paying tier.
 *
 * Idempotent and one-way: the timestamp is only ever written when it is absent,
 * so a server that dips below the threshold and climbs back does not get a fresh
 * holding period — and, more importantly, cannot be given one on purpose.
 */
export async function markTierUnlocked(db: DB, guildId: string, at = new Date()): Promise<void> {
  try {
    await db.update(schema.discordGuilds).set({ tierUnlockedAt: at })
      .where(and(eq(schema.discordGuilds.guildId, guildId), sql`${schema.discordGuilds.tierUnlockedAt} IS NULL`));
  } catch { /* stamping is best-effort; the guard fails closed without it */ }
}

export type GrowthFlag = {
  guildId: string;
  name: string;
  raw: number;
  qualified: number;
  /** Linked members added in the last 7 days. */
  recent: number;
  /** 0–1: how much of the raw count fails to qualify. */
  unqualifiedShare: number;
  reasons: string[];
};

/**
 * Servers whose linked-member growth is worth a human look before a payout.
 *
 * Deliberately NOT an automatic block. Every signal here has an innocent
 * explanation — a server really can go viral, and a new game really can arrive
 * with a wave of unverified accounts. The output is a queue for a person, and
 * the thing that actually stops the money is the holding period.
 */
export async function anomalousGrowth(db: DB): Promise<GrowthFlag[]> {
  try {
    const week = new Date(Date.now() - 7 * 86400_000);
    const [guilds, counts, recentRows] = await Promise.all([
      db.select({ guildId: schema.discordGuilds.guildId, name: schema.discordGuilds.name })
        .from(schema.discordGuilds).where(eq(schema.discordGuilds.status, "active")),
      linkedCounts(db),
      db.select({
        guildId: schema.discordGuildMembers.guildId,
        n: sql<number>`count(${schema.discordGuildMembers.firstLinkedAt})`,
      }).from(schema.discordGuildMembers)
        .where(gte(schema.discordGuildMembers.firstLinkedAt, week))
        .groupBy(schema.discordGuildMembers.guildId),
    ]);
    const recentBy = new Map(recentRows.map((r) => [r.guildId, Number(r.n ?? 0)]));

    const flags: GrowthFlag[] = [];
    for (const g of guilds) {
      const c = counts.get(g.guildId) ?? { raw: 0, qualified: 0 };
      const recent = recentBy.get(g.guildId) ?? 0;
      if (c.raw < 50) continue;   // nothing below a tier is worth a human's time
      const unqualifiedShare = c.raw > 0 ? (c.raw - c.qualified) / c.raw : 0;
      const reasons: string[] = [];
      if (unqualifiedShare >= 0.6) {
        reasons.push(`${Math.round(unqualifiedShare * 100)}% of linked members do not qualify — unproven accounts, or linked in the last ${QUALIFY_AFTER_DAYS} days.`);
      }
      if (recent >= 100 && recent / Math.max(1, c.raw) >= 0.5) {
        reasons.push(`${recent.toLocaleString()} of ${c.raw.toLocaleString()} linked members arrived in the last week.`);
      }
      if (reasons.length) flags.push({ guildId: g.guildId, name: g.name || g.guildId, raw: c.raw, qualified: c.qualified, recent, unqualifiedShare, reasons });
    }
    return flags.sort((a, b) => b.unqualifiedShare - a.unqualifiedShare || b.raw - a.raw);
  } catch { return []; }
}

// ===== Defence 3: account-creation velocity (B35) =====
//
// Deliberately last, and worth saying why it is here at all.
//
// B34 took the gamer-side incentive from $63/day to $2.50/day for fifty
// accounts, and defence 2 means those fifty move no tier until each has been
// linked a week AND proven ownership of a game account. So the cost velocity
// limits were meant to impose is already imposed, at the point where money is
// decided rather than at signup. This is not what stops the fraud any more.
//
// It is still worth having, for a narrower reason: it stops the NOISE. Fifty
// accounts created in a minute is fifty rows in every admin list, fifty entries
// in a leaderboard, and a support queue full of "who are these". A friction that
// makes fifty accounts feel like work is enough — and it must stay a friction,
// never a wall, because the person it inconveniences most is a real gamer on a
// shared university NAT.

/** Signups from one source, per window, before we make it awkward. */
export const SIGNUP_LIMIT = 10;
export const SIGNUP_WINDOW_HOURS = 24;

/**
 * The IP limit. B80.
 *
 * THE FINDING: sybil cost per account was $0.00, and the IP half of this guard
 * was never reached — `signup()` called `signupVelocity(db, { email })` and
 * passed no address, so the only thing that could ever trip was a disposable
 * email domain. An attacker using gmail aliases paid nothing at all.
 *
 * Deliberately FAR higher than `SIGNUP_LIMIT`, and that is the whole design.
 * The email-domain limit is 10 because a disposable domain is a source. An IP
 * is not: a university NAT, a mobile carrier CGNAT or an office is hundreds of
 * real people behind one address, and refusing the eleventh of those is
 * refusing a real gamer for somebody else's behaviour. Fifty in a day from one
 * address is not a busy campus, it is a script.
 *
 * It stays a friction rather than a wall for the same reason as the rest of
 * this file: the person it inconveniences most is always the honest one.
 */
export const SIGNUP_IP_LIMIT = 50;

/** A Discord account younger than this is not, by itself, a refusal. */
export const YOUNG_DISCORD_DAYS = 7;

/** Domains where a fresh address costs nothing, so the count means less. */
export const DISPOSABLE_DOMAINS = [
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "throwawaymail.com", "yopmail.com", "trashmail.com", "sharklasers.com",
];

export type VelocityVerdict = {
  /** May this signup proceed? */
  ok: boolean;
  /** How many we have already seen from this source in the window. */
  seen: number;
  limit: number;
  /** What tripped, for the admin log and for the message. */
  reasons: string[];
  /** Said to the person, if it is refused. Never accuses them of anything. */
  message: string;
};

const domainOf = (email: string) => (email.split("@")[1] ?? "").toLowerCase();

/**
 * Should this signup be slowed down?
 *
 * Counts prior signups in the window from the same source — an IP, or an email
 * domain that is not a mainstream provider. **Never counts by IP alone for a
 * mainstream domain**: a hundred people on one university NAT with gmail
 * addresses are a hundred people, and refusing the eleventh is refusing a real
 * gamer for somebody else's behaviour.
 *
 * Fails OPEN. A velocity check that cannot read the database must not stop
 * people signing up — the thing it protects is tidiness, and the thing failing
 * closed costs is customers.
 */
export async function signupVelocity(
  db: DB,
  input: { ip?: string | null; email?: string | null; discordCreatedAt?: Date | null },
): Promise<VelocityVerdict> {
  const open: VelocityVerdict = {
    ok: true, seen: 0, limit: SIGNUP_LIMIT, reasons: [], message: "",
  };
  try {
    const since = new Date(Date.now() - SIGNUP_WINDOW_HOURS * 3600_000);
    const reasons: string[] = [];
    const domain = domainOf(input.email ?? "");
    const disposable = DISPOSABLE_DOMAINS.includes(domain);

    // The count that decides. A disposable domain is a source; a mainstream one
    // is not, because "ten gmail signups today" is a Tuesday.
    let seen = 0;
    // The IP, which until B80 was never passed in and therefore never checked.
    // Counted for ANY domain — that is the point: gmail aliases were free.
    let fromIp = 0;
    if (input.ip) {
      const [row] = await db.select({ n: sql<number>`count(*)` }).from(schema.users)
        .where(and(gte(schema.users.createdAt, since), eq(schema.users.signupIp, input.ip)));
      fromIp = Number(row?.n ?? 0);
      if (fromIp >= SIGNUP_IP_LIMIT) {
        reasons.push(`${fromIp} accounts from one address in ${SIGNUP_WINDOW_HOURS}h`);
      }
    }
    if (disposable && domain) {
      const [row] = await db.select({ n: sql<number>`count(*)` }).from(schema.users)
        .where(and(gte(schema.users.createdAt, since), ilike(schema.users.email, `%@${domain}`)));
      seen = Number(row?.n ?? 0);
      if (seen >= SIGNUP_LIMIT) reasons.push(`${seen} accounts from ${domain} in ${SIGNUP_WINDOW_HOURS}h`);
    }

    // A young Discord account is a SIGNAL, never a refusal on its own — every
    // real gamer's Discord account was one day old once.
    if (input.discordCreatedAt) {
      const days = (Date.now() - input.discordCreatedAt.getTime()) / 86400_000;
      if (days < YOUNG_DISCORD_DAYS) reasons.push(`Discord account is ${Math.floor(days)} days old`);
    }

    // Refuse only when the COUNT trips. The other signals ride along for the
    // admin review queue; on their own they describe a new gamer.
    const tripped = (disposable && seen >= SIGNUP_LIMIT) || fromIp >= SIGNUP_IP_LIMIT;
    return {
      ok: !tripped,
      seen: Math.max(seen, fromIp),
      limit: SIGNUP_LIMIT,
      reasons,
      message: tripped
        // Never accuses. The person reading this is usually not the one the
        // limit is for, and telling somebody they look like a bot is how you
        // lose the one real gamer it caught.
        ? (fromIp >= SIGNUP_IP_LIMIT
          ? "We've had an unusual number of signups from your network today. Try again tomorrow, or from another connection — nothing is wrong with your account."
          : "We've had a lot of signups from that email provider today. Use a different address, or come back tomorrow — nothing is wrong with your account.")
        : "",
    };
  } catch { return open; }
}
