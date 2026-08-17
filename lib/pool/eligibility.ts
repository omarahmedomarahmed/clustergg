// Is this server in the pool at all?
//
// ===== THE DISTINCTION THAT MAKES THE WEEK COHERENT (12 §4) =====
//
//   ELIGIBILITY — *is this server in the pool at all?*
//     **Frozen at Monday 00:00 UTC.** `linked ≥ 10` **and** a complete server
//     profile. Never re-checked mid-week (E3).
//
//   ALL THREE KPIs — *how much do they earn?*
//     **Live all week**, final at Friday's close.
//
// One is a gate and one is a score, and they move at different speeds on
// purpose. A server cannot be dropped out of a pool it has spent four days
// visibly earning in — what the pool page shows on Wednesday is what pays on
// Friday — and a server that was not ready on Monday cannot buy its way in on
// Tuesday by linking fifty members.
//
// All sponsored challenges share one gun, so this is **one check per week**,
// not one per challenge.
//
// | Case | Outcome |
// |---|---|
// | Eligible at the gun, links 50 more mid-week, 30 enter | All 30 count, live |
// | 8 linked at the gun, links 50 on Tuesday | Nothing this week. Eligible next Monday |
// | 10 at the gun, one leaves Wednesday → 9 | Stays in this week |
// | A gamer enters from an ineligible server | Recorded. That server earns nothing |

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";

/**
 * The gate. Ten linked members, and a server we can describe.
 *
 * 12 §5 — "ten linked members is not enough. A server we cannot describe is
 * one we cannot sell." The profile is a pool gate, not decoration.
 */
export const LINKED_MEMBERS_TO_UNLOCK_POOL = 10;

/**
 * The six fields, in the order the portal asks for them.
 *
 * Exported as data rather than written out as six `if`s so the completeness
 * bar, the registry's field-by-field view and this gate all count the same six
 * things. Three surfaces each deciding for themselves what "complete" means is
 * three surfaces that disagree the day a seventh field arrives.
 */
export const SERVER_PROFILE_FIELDS = [
  {
    key: "memberAgeRange",
    label: "Member age range",
    // 12 §5, stated because it is the field most likely to be filled in with
    // the wrong answer: **their members' ages**, and nothing to do with the
    // owner's own age band. Two different questions, two different places, and
    // neither is ever a substitute for the other.
    help: "Your members' ages — not your own age band, which we asked you once, separately.",
  },
  { key: "gamesPlayed", label: "Games their members play", help: "What your community actually plays." },
  { key: "community", label: "One-line bio", help: "A sentence a brand could read." },
  {
    key: "inviteUrl",
    label: "Permanent invite link",
    help: "Shown publicly, and on your community-challenge pages.",
  },
  { key: "coverImageUrl", label: "Cover image", help: "The top of your public server page." },
  { key: "announceChannelId", label: "Announcement channel", help: "Where challenge cards land." },
] as const;

export type ServerProfileFieldKey = (typeof SERVER_PROFILE_FIELDS)[number]["key"];

/** One field of the profile, and whether it is answered. */
export type ProfileFieldState = {
  key: ServerProfileFieldKey;
  label: string;
  help: string;
  done: boolean;
};

export type ProfileCompleteness = {
  fields: ProfileFieldState[];
  done: number;
  total: number;
  complete: boolean;
  /** H3 — "4 of 6 done". A progress bar on every gated thing. */
  percent: number;
};

/**
 * The completeness bar, field by field.
 *
 * Takes the guild row rather than reading one, so the portal, the registry and
 * the gun all compute it from the same six rules with no database between
 * them.
 */
export function profileCompleteness(
  guild: Partial<
    Record<ServerProfileFieldKey, string | string[] | null | undefined>
  >,
): ProfileCompleteness {
  const fields = SERVER_PROFILE_FIELDS.map((f) => {
    const value = guild[f.key];
    // An empty array is not an answered question, and neither is whitespace.
    // Both are what a half-finished form posts.
    const done = Array.isArray(value)
      ? value.length > 0
      : typeof value === "string"
        ? value.trim().length > 0
        : false;
    return { key: f.key, label: f.label, help: f.help, done };
  });
  const done = fields.filter((f) => f.done).length;
  return {
    fields,
    done,
    total: fields.length,
    complete: done === fields.length,
    percent: Math.round((done / fields.length) * 100),
  };
}

/**
 * How many gamers have this server as their **parent** and have linked an
 * account.
 *
 * A3 — **linked member count goes to the parent server only.** Not "members of
 * this guild": we do not read a Discord member list on any path the product
 * depends on (12 §7), and a membership was never what the count meant anyway.
 * The parent is who got them onto Cluster, and that is what this measures.
 *
 * Live, by construction — it is a count, taken now. E1 requires that of the
 * conversion denominator, and there is no second, frozen implementation for
 * anything else to accidentally read.
 */
export async function linkedMembersOf(db: DB, guildId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${schema.users.id})::int` })
    .from(schema.users)
    .innerJoin(
      schema.linkedGameAccounts,
      eq(schema.linkedGameAccounts.userId, schema.users.id),
    )
    .where(
      and(
        eq(schema.users.parentGuildId, guildId),
        ne(schema.users.status, "deleted"),
      ),
    );
  return row?.n ?? 0;
}

export type EligibilityReading = {
  guildId: string;
  linkedMembers: number;
  profile: ProfileCompleteness;
  eligible: boolean;
  /** Why not, in words an owner can act on. Null when they are in. */
  reason: string | null;
};

/**
 * Read the gate **right now**. Not the frozen answer — this is what the gun
 * consults, and what the portal shows as *"on track for next week"*.
 */
export async function readEligibility(
  db: DB,
  guildId: string,
): Promise<EligibilityReading | null> {
  const [guild] = await db
    .select()
    .from(schema.guilds)
    .where(eq(schema.guilds.guildId, guildId));
  if (!guild) return null;

  const linkedMembers = await linkedMembersOf(db, guildId);
  const profile = profileCompleteness(guild);
  const enough = linkedMembers >= LINKED_MEMBERS_TO_UNLOCK_POOL;

  const missing: string[] = [];
  if (!enough) {
    const short = LINKED_MEMBERS_TO_UNLOCK_POOL - linkedMembers;
    missing.push(`${short} more linked gamer${short === 1 ? "" : "s"}`);
  }
  if (!profile.complete) {
    missing.push(
      `${profile.total - profile.done} more profile field` +
        `${profile.total - profile.done === 1 ? "" : "s"}`,
    );
  }

  return {
    guildId,
    linkedMembers,
    profile,
    eligible: enough && profile.complete,
    reason:
      missing.length === 0
        ? null
        : `Not in this week's pool yet — ${missing.join(" and ")} to unlock it.`,
  };
}

/**
 * The gun's eligibility snapshot. **One check per week, for every server.**
 *
 * Called by `stampBaselinesAtGun` at Monday 00:00 UTC, beside the baselines,
 * because both are the same event: the week starting. E3 — never re-checked
 * mid-week, which is enforced by nobody else calling this.
 *
 * Idempotent per week: a cron that fires twice on Monday writes the same
 * answer, and a cron that fires on Wednesday would too — but the freeze is
 * only ever consulted through `frozenEligibility` below, which is what makes
 * the mid-week rule structural rather than a comment about cron schedules.
 */
export async function freezeEligibilityAtGun(
  db: DB,
  weekStart: Date,
): Promise<{ guildId: string; eligible: boolean }[]> {
  const guilds = await db
    .select({ guildId: schema.guilds.guildId })
    .from(schema.guilds)
    // A server that has removed the bot is not carried into a new week. A9 is
    // about credit already earned, which survives; this is about a week that
    // has not started yet.
    .where(isNull(schema.guilds.removedAt));

  const out: { guildId: string; eligible: boolean }[] = [];
  for (const { guildId } of guilds) {
    const reading = await readEligibility(db, guildId);
    if (!reading) continue;
    await db
      .update(schema.guilds)
      .set({
        eligibilityFrozenAt: weekStart,
        eligibleThisWeek: reading.eligible,
        // W6 — the **reasons**, not only the answer. By Friday the live
        // numbers have moved, so "8 linked and a missing cover image" has to
        // be captured on Monday or the record cannot say why.
        linkedAtGun: reading.linkedMembers,
        profileCompleteAtGun: reading.profile.complete,
      })
      .where(eq(schema.guilds.guildId, guildId));
    out.push({ guildId, eligible: reading.eligible });
  }
  return out;
}

/**
 * What the pool reads. **The frozen answer, or nothing.**
 *
 * ===== WHY A MISSING FREEZE IS NOT A LIVE READ =====
 *
 * The obvious fallback — "no freeze yet, so compute it now" — reintroduces
 * exactly the bug E3 forbids, because `poolDivisionFor` runs live all week and
 * would then recompute the gate on every page load. A server that completed
 * its profile on Wednesday would appear in the pool on Wednesday, and the
 * *"what the pool page shows on Wednesday is what pays on Friday"* promise
 * would be broken by the page itself.
 *
 * So a server with no freeze for this week is **not in this week's pool**.
 * That is the same answer 12 §4 gives a server that was not ready at the gun,
 * and it is the honest one: the gun is a real event, and a server the gun
 * never saw was not there when the week started.
 *
 * ===== THE FREEZE IS ONE WEEK, AND THE NEXT GUN OVERWRITES IT =====
 *
 * `eligibilityFrozenAt` carries the week it was taken for, so a stale freeze
 * can never be mistaken for a current one — without the date, a server
 * eligible in week 3 would be eligible for ever. The cost is that the freeze
 * for a **past** week is gone once the next gun fires, so `poolDivisionFor`
 * cannot recompute a closed week's run.
 *
 * That is deliberate and it matches the cycle. A week's division is computed
 * live all week and written into draft payouts at its own close, before the
 * next gun — so the closed week's numbers live in `server_payouts`, which is
 * what every historical surface reads (04 §1: `/pool` is *this* week, and the
 * grace period shows *final standings, paid*). Recomputing a closed week from
 * a gate that no longer exists is the drift `01-CYCLE`'s one-function rule
 * exists to prevent.
 */
export function isFrozenEligible(
  guild: { eligibilityFrozenAt: Date | null; eligibleThisWeek: boolean | null },
  weekStart: Date,
): boolean {
  if (!guild.eligibilityFrozenAt) return false;
  if (guild.eligibilityFrozenAt.getTime() !== weekStart.getTime()) return false;
  return guild.eligibleThisWeek === true;
}

/**
 * E2 — the portal always shows **two states**.
 *
 * *"In this week's pool"* is a fact about a gun that has already fired.
 * *"On track for next week"* is a fact about right now. An owner who only ever
 * saw the first would have no way to tell whether the work they did on
 * Wednesday achieved anything.
 */
export type PoolStates = {
  inThisWeeksPool: boolean;
  onTrackForNextWeek: boolean;
  /** Live, and therefore the one that moves when they fix something. */
  live: EligibilityReading;
};

export async function poolStatesFor(
  db: DB,
  guildId: string,
  weekStart: Date,
): Promise<PoolStates | null> {
  const [guild] = await db
    .select()
    .from(schema.guilds)
    .where(eq(schema.guilds.guildId, guildId));
  if (!guild) return null;
  const live = await readEligibility(db, guildId);
  if (!live) return null;
  return {
    inThisWeeksPool: isFrozenEligible(guild, weekStart),
    onTrackForNextWeek: live.eligible,
    live,
  };
}
