import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid, slugifyOr } from "@/lib/utils";
import { hashSession } from "@/lib/ads";
import { newPortalKey } from "@/lib/portal-auth";
import { guildStats, type GuildStats } from "@/lib/discord/guilds";
import { challengeEarning } from "@/lib/server-earnings";
import { RUNGS, ladderBadge, ladderProgress, nextRung, type Rung } from "@/lib/ladder";
import { WEEK_CLOSE_ACTOR } from "@/lib/week-close";
import { PRICING_DEFAULTS } from "@/lib/pricing";

// The server-owner portal.
//
// A server owner has no Cluster account and shouldn't need one to see what
// their community is worth. So this works exactly like the brand portal: a slug
// they can remember, a key we DM them, and their own numbers behind it.
//
// The tiers are the product. Each one is a real capability unlocked by a real
// number, so an owner recruiting for us is doing it for something concrete
// rather than for goodwill.

// ===== THE LADDER LIVES IN `lib/ladder.ts`. M3 =====
//
// A second copy of it was here — seed / monetized / broadcaster / flagship at
// 0 / 500 / 1,000 / 5,000 — with its own labels, colours and blurbs. It was the
// marketing face of a ladder whose money was decided by a DIFFERENT list in
// `lib/server-score.ts` and labelled by a THIRD in `lib/week-tiers.ts`. The
// portal could tell an owner they were a Broadcaster while the weekly close
// paid them out of the mid bracket and called them "mid".
//
// The identity fields moved onto the rung itself, so the badge an owner sees and
// the group their cheque comes out of are the same row of the same array.

export type { RungKey as TierKey, Rung as Tier } from "@/lib/ladder";
export { RUNGS as TIERS, EARN_FLOOR } from "@/lib/ladder";

/**
 * Where a server stands, for the portal's progress bar.
 *
 * `current` is null below `EARN_FLOOR` — a server with three linked members is
 * not on the bottom rung, it is not on the ladder, and the bar measures its
 * progress toward getting on.
 */
export function tierFor(linked: number): { current: Rung | null; next: Rung | null; progressPct: number } {
  const { current, next, pct } = ladderProgress(linked);
  return { current, next, progressPct: pct };
}

export function badgesFor(linked: number, challengesRun: number): { icon: string; name: string; earned: boolean }[] {
  const out = RUNGS.map((t) => ({ icon: t.icon, name: t.name, earned: linked >= t.threshold }));
  out.push({ icon: "trophy", name: "First Challenge", earned: challengesRun >= 1 });
  out.push({ icon: "flame", name: "Five Challenges", earned: challengesRun >= 5 });
  return out;
}

// ===== Identity =====

export type PortalServer = typeof schema.discordGuilds.$inferSelect;

export async function getServerBySlugOrId(slugOrId: string): Promise<PortalServer | null> {
  try {
    const db = await getDb();
    const [bySlug] = await db.select().from(schema.discordGuilds)
      .where(eq(schema.discordGuilds.slug, slugOrId)).limit(1);
    if (bySlug) return bySlug;
    const [byId] = await db.select().from(schema.discordGuilds)
      .where(eq(schema.discordGuilds.guildId, slugOrId)).limit(1);
    return byId ?? null;
  } catch { return null; }
}

// Give a server its portal identity. Called at install, and idempotent — a
// re-install must not rotate a key the owner has already saved.
export async function ensurePortal(guildId: string): Promise<{ slug: string; key: string } | null> {
  try {
    const db = await getDb();
    const [row] = await db.select().from(schema.discordGuilds)
      .where(eq(schema.discordGuilds.guildId, guildId)).limit(1);
    if (!row) return null;
    if (row.slug && row.portalKey) return { slug: row.slug, key: row.portalKey };

    // `slugifyOr`, and the fallback says SERVER. This read
    // `slugify(name) || \`server-…\`` — which looked like a per-domain default
    // and was dead code, because slugify never returned empty: it returned the
    // word "gamer". So a Discord server whose name we did not have, or whose
    // name was written in a script the old slugify stripped to nothing, was
    // published at /servers/gamer — and the first one to install took the bare
    // slug permanently (S1/S2).
    let slug = row.slug ?? slugifyOr(row.name || "", `server-${guildId.slice(-6)}`);
    if (!row.slug) {
      const [taken] = await db.select({ guildId: schema.discordGuilds.guildId })
        .from(schema.discordGuilds).where(eq(schema.discordGuilds.slug, slug)).limit(1);
      if (taken && taken.guildId !== guildId) slug = `${slug}-${guildId.slice(-4)}`;
    }
    const key = row.portalKey ?? newPortalKey();
    await db.update(schema.discordGuilds).set({ slug, portalKey: key })
      .where(eq(schema.discordGuilds.guildId, guildId));
    return { slug, key };
  } catch { return null; }
}

// Staff rotating a compromised key.
export async function rotatePortalKey(guildId: string): Promise<string | null> {
  try {
    const db = await getDb();
    const key = newPortalKey();
    await db.update(schema.discordGuilds).set({ portalKey: key })
      .where(eq(schema.discordGuilds.guildId, guildId));
    return key;
  } catch { return null; }
}

// ===== Analytics =====

// One event on a server's public challenge page. Recorded fire-and-forget:
// analytics must never be able to break a page render.
export async function recordServerEvent(
  guildId: string,
  type: "challenge_view" | "invite_click" | "member_joined",
  opts: { challengeId?: string | null; userId?: string | null; sessionId?: string | null } = {},
): Promise<void> {
  if (!guildId) return;
  try {
    const db = await getDb();
    await db.insert(schema.serverEvents).values({
      id: uid(), guildId, type,
      challengeId: opts.challengeId ?? null,
      userId: opts.userId ?? null,
      // HASHED on the way in. B104 found the beacon storing a slice of the
      // session JWT; no caller passes one here today, and this is what makes
      // sure the next one cannot reintroduce it by writing the obvious thing.
      sessionId: hashSession(opts.sessionId),
    });
  } catch { /* non-fatal */ }
}

export type FunnelRow = { challengeId: string | null; views: number; inviteClicks: number; joined: number };

// The value exchange, per challenge: people looked, people clicked through to
// your invite, people joined you. That's what a server gets out of putting a
// competition on Cluster, and it should be measured rather than asserted.
export async function serverFunnel(guildId: string, days = 30): Promise<{ totals: FunnelRow; byChallenge: FunnelRow[] }> {
  const empty: FunnelRow = { challengeId: null, views: 0, inviteClicks: 0, joined: 0 };
  try {
    const db = await getDb();
    const since = new Date(Date.now() - days * 86400000);
    const rows = await db.select({
      challengeId: schema.serverEvents.challengeId,
      type: schema.serverEvents.type,
      n: sql<number>`count(*)`,
    })
      .from(schema.serverEvents)
      .where(and(eq(schema.serverEvents.guildId, guildId), sql`${schema.serverEvents.createdAt} >= ${since}`))
      .groupBy(schema.serverEvents.challengeId, schema.serverEvents.type);

    const byId = new Map<string, FunnelRow>();
    const totals = { ...empty };
    for (const r of rows) {
      const key = r.challengeId ?? "—";
      const row = byId.get(key) ?? { challengeId: r.challengeId, views: 0, inviteClicks: 0, joined: 0 };
      const n = Number(r.n ?? 0);
      if (r.type === "challenge_view") { row.views += n; totals.views += n; }
      else if (r.type === "invite_click") { row.inviteClicks += n; totals.inviteClicks += n; }
      else if (r.type === "member_joined") { row.joined += n; totals.joined += n; }
      byId.set(key, row);
    }
    return { totals, byChallenge: [...byId.values()].sort((a, b) => b.views - a.views) };
  } catch { return { totals: empty, byChallenge: [] }; }
}

// ===== Earnings =====

export type EarningRow = {
  challengeId: string;
  title: string;
  game: string;
  brandName: string | null;
  endsAt: Date;
  ended: boolean;
  /** Entrants from THIS server, and from everywhere. */
  entrants: number;
  totalEntrants: number;
  /** How many servers carried this challenge, for the no-entrants split. */
  serversCarrying: number;
  /** What the brand paid and what the pool was. C3 removed the owner cut:
   *  a challenge no longer pays a percentage, the WEEK does. */
  price: number;
  prizePool: number;
  serverShare: number;
  /** Prize money this server's own members took home. */
  membersWon: number;
};

/**
 * One member of this server, on one podium.
 *
 * The owner asked what their community got out of running the bot, and a total
 * is a weak answer to that — "your members won $400" is a number, but "Nova
 * came first in NebulaTech's Chess week and took $100" is a story they can put
 * in their own announcements channel.
 *
 * None of this is the owner's money. That is stated on the row, not just in a
 * footnote, because an owner who quietly assumes otherwise finds out at the
 * worst possible moment.
 */
export type MemberWin = {
  userId: string;
  name: string;
  slug: string | null;
  avatarUrl: string | null;
  challengeId: string;
  challengeTitle: string;
  game: string;
  brandName: string | null;
  place: number;
  amount: number;
  at: Date;
};

export type Earnings = {
  /**
   * Where the money comes from now. C3.
   *
   * `earned` is what the weekly pool has already PAID this server; `pending` is
   * what it has opened and not yet released. Both are read from the payout rows
   * `lib/week-close.ts` writes, so the portal and the admin console cannot give
   * an owner two different answers.
   */
  nextAt: number | null;
  /** Paid so far, and opened but not yet released. */
  earned: number;
  pending: number;
  membersWon: number;
  rows: EarningRow[];
  /** Every podium a member of this server stood on. Never payable to the owner. */
  memberWins: MemberWin[];
  /** How many distinct members have won something. */
  winners: number;
};

/**
 * What this server got out of sponsored challenges, challenge by challenge.
 *
 * The rows are the CONTRIBUTION — the brand paid X, our members were N of M
 * entrants, our members won Y. The MONEY is the weekly pool, read from the
 * payout rows above. Splitting them apart is C3: an owner used to be shown a
 * per-challenge cut that no longer exists, and showing a number the payout
 * screen disagrees with is how an owner stops believing either.
 */
export async function serverEarnings(guildId: string, linked: number): Promise<Earnings> {
  const next = nextRung(linked);
  const empty: Earnings = {
    nextAt: next?.threshold ?? null,
    earned: 0, pending: 0, membersWon: 0, rows: [], memberWins: [], winners: 0,
  };
  try {
    const db = await getDb();

    // What the weekly pool has actually done for this server. C3 — this used to
    // be a percentage applied to each challenge, which meant the portal was
    // computing money rather than reporting it.
    const pool = await db.select({
      status: schema.serverPayouts.status,
      amount: sql<number>`coalesce(sum(${schema.serverPayoutLines.amount}), 0)`,
    }).from(schema.serverPayouts)
      .innerJoin(schema.serverPayoutLines, eq(schema.serverPayoutLines.payoutId, schema.serverPayouts.id))
      .where(and(
        eq(schema.serverPayouts.guildId, guildId),
        eq(schema.serverPayouts.requestedBy, WEEK_CLOSE_ACTOR),
      ))
      .groupBy(schema.serverPayouts.status);
    const paid = round2(pool.filter((r) => r.status === "paid").reduce((a, r) => a + Number(r.amount ?? 0), 0));
    const open = round2(pool.filter((r) => !["paid", "cancelled"].includes(r.status))
      .reduce((a, r) => a + Number(r.amount ?? 0), 0));
    empty.earned = paid;
    empty.pending = open;

    // Everyone this server brought to Cluster. A challenge's entrants "from
    // here" are the ones who are members of this server.
    const members = await db.select({ userId: schema.discordGuildMembers.userId })
      .from(schema.discordGuildMembers)
      .where(eq(schema.discordGuildMembers.guildId, guildId));
    const mine = new Set(members.map((m) => m.userId));
    if (!mine.size) return empty;

    // Sponsored challenges only — an unsponsored community challenge has no
    // brand money in it and therefore nothing to share.
    const challenges = await db.select({
      id: schema.challenges.id,
      title: schema.challenges.title,
      game: schema.challenges.game,
      endAt: schema.challenges.endAt,
      status: schema.challenges.status,
      price: schema.challenges.sponsorPrice,
      brandId: schema.challenges.sponsorBrandId,
      guildId: schema.challenges.guildId,
      guildIds: schema.challenges.guildIds,
    })
      .from(schema.challenges)
      .where(sql`${schema.challenges.sponsorPrice} > 0`)
      .orderBy(desc(schema.challenges.endAt))
      .limit(60);
    if (!challenges.length) return empty;

    const ids = challenges.map((c) => c.id);
    const parts = await db.select({
      challengeId: schema.challengeParticipants.challengeId,
      userId: schema.challengeParticipants.userId,
      placement: schema.challengeParticipants.finalPlacement,
    }).from(schema.challengeParticipants).where(inArray(schema.challengeParticipants.challengeId, ids));

    const brandIds = [...new Set(challenges.map((c) => c.brandId).filter((b): b is string => !!b))];
    const brandRows = brandIds.length
      ? await db.select({ id: schema.brands.id, name: schema.brands.name })
          .from(schema.brands).where(inArray(schema.brands.id, brandIds))
      : [];
    const brandName = new Map(brandRows.map((b) => [b.id, b.name]));

    // Who the winners actually are. Looked up once for every podium across
    // every challenge rather than per row — an owner's page should not fan out
    // into a query per member.
    const winnerIds = [...new Set(
      parts.filter((p) => p.placement && p.placement <= 3 && mine.has(p.userId)).map((p) => p.userId),
    )];
    const winnerRows = winnerIds.length
      ? await db.select({
          id: schema.users.id, name: schema.users.displayName,
          slug: schema.users.slug, avatarUrl: schema.users.avatarUrl,
        }).from(schema.users).where(inArray(schema.users.id, winnerIds))
      : [];
    const winnerBy = new Map(winnerRows.map((w) => [w.id, w]));

    const cfg = PRICING_DEFAULTS;
    const prizeByPlace = [cfg.prize1, cfg.prize2, cfg.prize3];
    const rows: EarningRow[] = [];
    const memberWins: MemberWin[] = [];
    for (const c of challenges) {
      const entries = parts.filter((p) => p.challengeId === c.id);
      const ours = entries.filter((p) => mine.has(p.userId));
      // Not carried here, and nobody from here entered: not this server's row.
      const carried = [c.guildId, ...(c.guildIds ?? [])].filter(Boolean);
      if (!ours.length && !carried.includes(guildId)) continue;

      const earning = challengeEarning({
        entrants: ours.length,
        totalEntrants: entries.length,
        serversCarrying: carried.length || 1,
        membersWon: ours.reduce((sum, p) => sum + (p.placement && p.placement <= 3 ? prizeByPlace[p.placement - 1] ?? 0 : 0), 0),
        cfg: { ...cfg, challengePrice: c.price || cfg.challengePrice },
      });

      for (const p of ours) {
        const place = Number(p.placement ?? 0);
        if (!place || place > 3) continue;
        const who = winnerBy.get(p.userId);
        memberWins.push({
          userId: p.userId,
          name: who?.name ?? "A member",
          slug: who?.slug ?? null,
          avatarUrl: who?.avatarUrl ?? null,
          challengeId: c.id,
          challengeTitle: c.title,
          game: c.game,
          brandName: c.brandId ? brandName.get(c.brandId) ?? null : null,
          place,
          amount: prizeByPlace[place - 1] ?? 0,
          at: c.endAt,
        });
      }
      rows.push({
        challengeId: c.id,
        title: c.title,
        game: c.game,
        brandName: c.brandId ? brandName.get(c.brandId) ?? null : null,
        endsAt: c.endAt,
        ended: c.status === "completed" || c.endAt.getTime() < Date.now(),
        entrants: ours.length,
        totalEntrants: entries.length,
        serversCarrying: carried.length || 1,
        price: earning.price,
        prizePool: earning.prizePool,
        serverShare: earning.serverShare,
        membersWon: earning.membersWon,
      });
    }

    return {
      ...empty,
      rows,
      // `earned` and `pending` are the POOL's, set above from real payout rows.
      // They are deliberately not re-derived from these challenge rows: a
      // challenge no longer carries an owner cut to sum.
      membersWon: round2(rows.reduce((s, r) => s + r.membersWon, 0)),
      // Newest first — the win an owner wants to shout about is the last one.
      memberWins: memberWins.sort((a, b) => +b.at - +a.at),
      winners: new Set(memberWins.map((w) => w.userId)).size,
    };
  } catch { return empty; }
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

// ===== The board =====

export type BoardRow = {
  guildId: string; slug: string | null; name: string; iconUrl: string | null;
  linked: number; challenges: number;
  /** Always renderable: off-ladder servers get the OFF_LADDER card, not null. */
  tier: ReturnType<typeof ladderBadge>; rank: number;
};

// Every server, ranked by the number that actually matters: how many gamers
// they brought to Cluster. Owners see where they stand, which is the entire
// point of a leaderboard.
export async function serverBoard(limit = 100): Promise<BoardRow[]> {
  try {
    const db = await getDb();
    const guilds = await db.select().from(schema.discordGuilds)
      .where(eq(schema.discordGuilds.status, "active")).limit(limit);

    const counts = await db.select({
      guildId: schema.discordGuildMembers.guildId,
      linked: sql<number>`count(${schema.discordGuildMembers.firstLinkedAt})`,
    }).from(schema.discordGuildMembers).groupBy(schema.discordGuildMembers.guildId);
    const linkedBy = new Map(counts.map((c) => [c.guildId, Number(c.linked ?? 0)]));

    const challenges = await db.select({ guildId: schema.challenges.guildId, n: sql<number>`count(*)` })
      .from(schema.challenges).groupBy(schema.challenges.guildId);
    const chBy = new Map(challenges.map((c) => [c.guildId ?? "", Number(c.n ?? 0)]));

    return guilds
      .map((g) => {
        const linked = linkedBy.get(g.guildId) ?? 0;
        return {
          guildId: g.guildId,
          slug: g.slug,
          name: g.name || g.guildId,
          iconUrl: g.iconUrl,
          linked,
          challenges: chBy.get(g.guildId) ?? 0,
          tier: ladderBadge(linked),
          rank: 0,
        };
      })
      .sort((a, b) => b.linked - a.linked || b.challenges - a.challenges)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  } catch { return []; }
}

// Everything one portal renders.
export type PortalData = {
  server: PortalServer;
  stats: GuildStats;
  tier: ReturnType<typeof tierFor>;
  /** The badge to render. Never null — see `OFF_LADDER`. */
  badge: ReturnType<typeof ladderBadge>;
  badges: ReturnType<typeof badgesFor>;
  funnel: Awaited<ReturnType<typeof serverFunnel>>;
  /** What sponsored challenges have paid this server, challenge by challenge. */
  earnings: Earnings;
  rank: number;
  totalServers: number;
};

export async function portalData(server: PortalServer): Promise<PortalData | null> {
  const stats = await guildStats(server.guildId);
  if (!stats) return null;
  const [funnel, board, challenges, earnings] = await Promise.all([
    serverFunnel(server.guildId),
    serverBoard(),
    (async () => {
      try {
        const db = await getDb();
        const rows = await db.select({ id: schema.challenges.id })
          .from(schema.challenges).where(eq(schema.challenges.guildId, server.guildId));
        return rows.length;
      } catch { return 0; }
    })(),
    serverEarnings(server.guildId, stats.linked),
  ]);
  const me = board.find((b) => b.guildId === server.guildId);
  return {
    server,
    stats,
    tier: tierFor(stats.linked),
    badge: ladderBadge(stats.linked),
    badges: badgesFor(stats.linked, challenges),
    earnings,
    funnel,
    rank: me?.rank ?? board.length + 1,
    totalServers: board.length,
  };
}

// Commands run by this server's members — the owner's view of what their
// community actually does with the bot.
export async function serverCommandFeed(guildId: string, limit = 30) {
  try {
    const db = await getDb();
    return db.select({
      command: schema.discordCommandLogs.command,
      screen: schema.discordCommandLogs.screen,
      arg: schema.discordCommandLogs.arg,
      createdAt: schema.discordCommandLogs.createdAt,
      displayName: schema.users.displayName,
      slug: schema.users.slug,
    })
      .from(schema.discordCommandLogs)
      .leftJoin(schema.users, eq(schema.discordCommandLogs.userId, schema.users.id))
      .where(eq(schema.discordCommandLogs.guildId, guildId))
      .orderBy(desc(schema.discordCommandLogs.createdAt))
      .limit(limit);
  } catch { return []; }
}
