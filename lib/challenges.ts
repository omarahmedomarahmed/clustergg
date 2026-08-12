import { and, asc, desc, eq, lt } from "drizzle-orm";
import { getDb, schema, type DB } from "@/lib/db";
import { uid } from "@/lib/utils";
import { awardQuestAction, getQuestCompletions } from "@/lib/quests";
import { announceChallengeJoined, announceChallengeEnded } from "@/lib/discord/announce";

// Joining a challenge, in one place.
//
// The website joins through a server action with a cookie session; the Discord
// bot joins on behalf of a gamer it identified by their Discord snowflake.
// Both must apply the SAME rules — entry gate, baseline snapshot, quest award —
// or a Discord join would quietly be worth more or less than a web join.

export type JoinResult =
  | {
    ok: true; already: boolean; game: string; title: string; account: string;
    /**
     * They asked for a DIFFERENT account than the one already entered (B38).
     *
     * Reported rather than silently ignored: a gamer who picked their second
     * account and got a bland "you're in" would reasonably believe that is the
     * account being scored, and only find out at the standings.
     */
    otherAccountRequested?: boolean;
    /** Whether a switch is still open — see `switchChallengeAccount`. */
    switchable?: boolean;
  }
  | {
    ok: false;
    reason: "not_found" | "not_active" | "no_account" | "gated" | "locked" | "bad_key" | "requirements" | "onboarding";
    /** For "requirements": the entry rules this account doesn't meet, in plain English. */
    unmet?: string[];
  };

export type EntryAccount = {
  id: string;
  inGameName: string;
  region: string | null;
  /** Already entered in this challenge — the one that carries the standing. */
  entered: boolean;
};

/**
 * Which of a gamer's accounts can enter this challenge.
 *
 * People genuinely have two League accounts — a main and a smurf, or one per
 * region — and Cluster has always linked and shown both. Entry did not: it
 * silently took the first account in the list, so a gamer whose second account
 * is the one they actually play on entered with the wrong one and watched a
 * week of play score nothing. There was no error to see, which is the worst
 * shape a bug can have.
 *
 * So the choice is surfaced. This is the one list both the website and the bot
 * ask, so the two can't offer different accounts.
 */
export async function entryAccounts(userId: string, challengeId: string): Promise<EntryAccount[]> {
  const db = await getDb();
  const [challenge] = await db.select({ provider: schema.challenges.provider })
    .from(schema.challenges).where(eq(schema.challenges.id, challengeId)).limit(1);
  if (!challenge) return [];
  const [accounts, entries] = await Promise.all([
    db.select().from(schema.linkedGameAccounts).where(and(
      eq(schema.linkedGameAccounts.userId, userId),
      eq(schema.linkedGameAccounts.provider, challenge.provider),
    )),
    db.select({ linkedAccountId: schema.challengeParticipants.linkedAccountId })
      .from(schema.challengeParticipants).where(and(
        eq(schema.challengeParticipants.challengeId, challengeId),
        eq(schema.challengeParticipants.userId, userId),
      )),
  ]);
  const entered = new Set(entries.map((e) => e.linkedAccountId));
  return accounts.map((a) => ({
    id: a.id,
    inGameName: a.inGameName,
    region: a.region ?? null,
    entered: entered.has(a.id),
  }));
}

/**
 * Is the account switch still open? (B38)
 *
 * Only before the challenge STARTS. After that a switch is a way to shop for
 * the better score: play a week on both accounts, then move your entry to
 * whichever one did better. Before the start there is nothing to shop for,
 * because nothing has been scored yet — so the window is exactly the period in
 * which changing your mind is honest.
 */
export function switchOpen(challenge: { startAt: Date | string }, now = new Date()): boolean {
  const start = new Date(challenge.startAt);
  return !Number.isNaN(start.getTime()) && now < start;
}

export type SwitchResult =
  | { ok: true; account: string }
  | { ok: false; reason: "not_found" | "not_entered" | "started" | "no_account" | "same_account"; message: string };

/**
 * Move an entry to another of the gamer's accounts, before the start.
 *
 * The baseline is re-snapshotted from the new account, because a baseline taken
 * from the old one would score the new account's whole history as if it had
 * happened during the challenge.
 */
export async function switchChallengeAccount(
  userId: string, challengeId: string, linkedAccountId: string,
): Promise<SwitchResult> {
  const db = await getDb();
  const [challenge] = await db.select().from(schema.challenges)
    .where(eq(schema.challenges.id, challengeId)).limit(1);
  if (!challenge) return { ok: false, reason: "not_found", message: "That challenge no longer exists." };

  const [entry] = await db.select({ id: schema.challengeParticipants.id, linkedAccountId: schema.challengeParticipants.linkedAccountId })
    .from(schema.challengeParticipants)
    .where(and(
      eq(schema.challengeParticipants.challengeId, challengeId),
      eq(schema.challengeParticipants.userId, userId),
    )).limit(1);
  if (!entry) return { ok: false, reason: "not_entered", message: "You have not entered this challenge yet." };

  if (!switchOpen(challenge)) {
    return {
      ok: false, reason: "started",
      message: "This challenge has already started, so the account entered is locked in. Switching after the start would let anyone play on two accounts and keep the better score.",
    };
  }

  const [account] = await db.select().from(schema.linkedGameAccounts)
    .where(and(
      eq(schema.linkedGameAccounts.id, linkedAccountId),
      eq(schema.linkedGameAccounts.userId, userId),
      eq(schema.linkedGameAccounts.provider, challenge.provider),
    )).limit(1);
  if (!account) return { ok: false, reason: "no_account", message: "That is not one of your accounts for this game." };
  if (entry.linkedAccountId === account.id) {
    return { ok: false, reason: "same_account", message: `You are already entered as ${account.inGameName}.` };
  }

  // Re-baseline from the NEW account. Carrying the old baseline over would
  // score the new account's entire history as if it happened this week.
  const stats = await db.select().from(schema.statCurrent)
    .where(eq(schema.statCurrent.linkedAccountId, account.id));
  const baseline: Record<string, number> = {};
  for (const st of stats) baseline[st.metricKey] = st.metricValue;

  await db.update(schema.challengeParticipants)
    .set({ linkedAccountId: account.id, baseline, currentPoints: 0 })
    .where(eq(schema.challengeParticipants.id, entry.id));
  return { ok: true, account: account.inGameName };
}

export async function joinChallengeFor(
  userId: string,
  challengeId: string,
  opts: {
    linkedAccountId?: string;
    source?: "web" | "discord";
    accessKey?: string | null;
    /**
     * WHICH SERVER this join came from. B86.
     *
     * Recorded at join time because it cannot be recovered later: guild
     * membership changes, and deriving it afterwards is what made one entrant
     * count for every server they belonged to. A web join has no guild and
     * stores null rather than a guess.
     */
    guildId?: string | null;
  } = {},
): Promise<JoinResult> {
  const db = await getDb();
  const [challenge] = await db.select().from(schema.challenges)
    .where(eq(schema.challenges.id, challengeId)).limit(1);
  if (!challenge) return { ok: false, reason: "not_found" };
  if (challenge.status !== "active") return { ok: false, reason: "not_active" };

  // ===== B94: FINISH SETTING UP BEFORE YOU CAN ENTER =====
  //
  // The hole this closes: a half-onboarded account could enter a competition
  // and WIN A REAL TROPHY while we still did not know their age or their
  // country — the two facts that decide whether that trophy can ever be paid.
  // The prize would sit on a profile we cannot pay, and the first anybody heard
  // of it would be the day they tried to collect.
  //
  // Checked HERE rather than on the button, because the button is not the only
  // way in: Discord has one too.
  {
    const { unlockState } = await import("@/lib/unlock");
    const state = await unlockState(db, userId);
    if (!state.unlocked) return { ok: false, reason: "onboarding" };
  }

  // Server-gated: anyone can watch, only key-holders can enter. The key was
  // sent to the server the challenge belongs to, which is what makes it that
  // community's competition without hiding it from everyone else.
  if (joinLocked(challenge)) {
    const given = (opts.accessKey ?? "").trim();
    if (!given) return { ok: false, reason: "locked" };
    if (given.toUpperCase() !== (challenge.accessKey ?? "").trim().toUpperCase()) {
      return { ok: false, reason: "bad_key" };
    }
  }

  // The account must be one of theirs AND match the challenge's provider —
  // you can't enter a Valorant challenge with a Chess account.
  const accounts = await db.select().from(schema.linkedGameAccounts)
    .where(and(
      eq(schema.linkedGameAccounts.userId, userId),
      eq(schema.linkedGameAccounts.provider, challenge.provider),
    ));
  //
  // An unknown id is NOT quietly replaced by the first account. Falling back
  // would enter someone on an account they didn't choose and report success —
  // the exact silent-wrong-account failure this whole path exists to remove.
  // No id at all still means "the only one you have", which is the common case.
  const account = opts.linkedAccountId
    ? accounts.find((a) => a.id === opts.linkedAccountId)
    : accounts[0];
  if (!account) return { ok: false, reason: "no_account" };

  // Quest-badge entry gate: require N completion badges of a given quest.
  if (challenge.gateQuestId && challenge.gateMinBadges > 0) {
    const have = await getQuestCompletions(db, userId, challenge.gateQuestId);
    if (have < challenge.gateMinBadges) return { ok: false, reason: "gated" };
  }

  // Skill entry rules — "At least Diamond I in Flex 5v5 tier".
  //
  // These are checked HERE, at the door, which they were not. The rules were
  // only consulted by the scorer, against the delta a run produced, so a Bronze
  // account could enter a Diamond-gated challenge, play all week, and end on
  // zero points with nothing on screen explaining why. Whoever built the
  // challenge would see a full leaderboard of zeroes.
  const unmet = await unmetEntryRules(db, challenge, account.id);
  if (unmet.length) return { ok: false, reason: "requirements", unmet };

  const [existing] = await db.select({
    id: schema.challengeParticipants.id,
    linkedAccountId: schema.challengeParticipants.linkedAccountId,
  })
    .from(schema.challengeParticipants)
    .where(and(
      eq(schema.challengeParticipants.challengeId, challengeId),
      eq(schema.challengeParticipants.userId, userId),
    )).limit(1);
  if (existing) {
    // B38: one gamer, one account, one challenge.
    //
    // The uniqueness itself is structural — `cp_challenge_user_idx` is unique on
    // (challenge, user) — so a second account cannot be entered whatever this
    // code does. What this branch decides is whether the gamer is TOLD, and the
    // answer has to be yes when they asked for a different account: multiple
    // accounts are meant to be a convenience, and a convenience that quietly
    // scores the wrong one is not one.
    const otherAccountRequested = existing.linkedAccountId !== account.id;
    return {
      ok: true, already: true, game: challenge.game, title: challenge.title,
      // The account that actually carries their standing, which is not
      // necessarily the one they just pressed — worth saying so.
      account: accounts.find((a) => a.id === existing.linkedAccountId)?.inGameName ?? account.inGameName,
      otherAccountRequested,
      switchable: switchOpen(challenge),
    };
  }

  // Snapshot current stats as the baseline: only activity AFTER joining counts.
  const stats = await db.select().from(schema.statCurrent)
    .where(eq(schema.statCurrent.linkedAccountId, account.id));
  const baseline: Record<string, number> = {};
  for (const s of stats) baseline[s.metricKey] = s.metricValue;

  await db.insert(schema.challengeParticipants).values({
    id: uid(), challengeId, userId, linkedAccountId: account.id, baseline,
    // WHEN this baseline was taken. B91. Stamped here so that a null can only
    // mean "written before that column existed" — which is what lets the
    // scorer rebaseline new entrants at the start line without touching a
    // challenge that was already running when this shipped.
    baselineAt: new Date(),
    joinedFrom: opts.source ?? "web",
    guildId: opts.guildId ?? null,
  }).onConflictDoNothing();
  await awardQuestAction(db, userId, "join_challenge", { refType: "challenge", refId: challengeId });

  // Tell the Discord servers watching. Deliberately not awaited into the
  // result: a failed announcement must never fail the join.
  void announceChallengeJoined(userId, challengeId).catch(() => {});

  return { ok: true, already: false, game: challenge.game, title: challenge.title, account: account.inGameName };
}

/**
 * Which of a challenge's entry rules an account fails, in plain English.
 *
 * One function so the door and the page agree. A challenge page that says "you
 * need Diamond I" and a join button that lets you in anyway is worse than
 * either alone, and that is exactly what two copies of this logic produce.
 *
 * Measured against what the account HOLDS — its synced rank, its lifetime win
 * count — because "who can enter" has no other meaning.
 */
export async function unmetEntryRules(
  db: DB,
  challenge: { provider: string; rules?: { conditions?: { metric: string; op: string; value: number }[] } | null },
  linkedAccountId: string,
): Promise<string[]> {
  const conditions = challenge.rules?.conditions ?? [];
  if (conditions.length === 0) return [];
  const [{ unmetRules }, { getProvider }] = await Promise.all([
    import("@/lib/challenge-rules"),
    import("@/lib/providers/registry"),
  ]);
  const rows = await db.select({
    metricKey: schema.statCurrent.metricKey, metricValue: schema.statCurrent.metricValue,
  }).from(schema.statCurrent).where(eq(schema.statCurrent.linkedAccountId, linkedAccountId));
  const stats: Record<string, number> = {};
  for (const r of rows) stats[r.metricKey] = r.metricValue;
  return unmetRules(conditions, stats, getProvider(challenge.provider)?.capabilities ?? []);
}

// The web URL for a challenge. There is no top-level /challenges route — a
// challenge lives on its game's planet — so links must resolve the planet slug
// rather than guessing a path that 404s.
export async function challengeUrl(base: string, challengeId: string): Promise<string> {
  try {
    const db = await getDb();
    const [ch] = await db.select({ game: schema.challenges.game })
      .from(schema.challenges).where(eq(schema.challenges.id, challengeId)).limit(1);
    if (!ch) return `${base}/planets`;
    const [space] = await db.select({ slug: schema.spaces.slug })
      .from(schema.spaces).where(eq(schema.spaces.game, ch.game)).limit(1);
    return space ? `${base}/planets/${space.slug}/challenges/${challengeId}` : `${base}/planets`;
  } catch { return `${base}/planets`; }
}

// Every live challenge. Server-gated ones are NOT hidden — they show up on the
// planet, on the homepage and in every server, with their full standings,
// trophies and countdown. Hiding them would waste the best advertising a server
// challenge has: everyone else watching a competition they can't enter.
//
// The gate is on JOINING, not on looking (see `joinLocked`).
export async function liveChallenges(game?: string | null, limit = 8) {
  const db = await getDb();
  const where = game
    ? and(eq(schema.challenges.status, "active"), eq(schema.challenges.game, game))
    : eq(schema.challenges.status, "active");
  return db.select().from(schema.challenges).where(where).orderBy(schema.challenges.endAt).limit(limit);
}

/**
 * How many rows the live standings board shows at once. G6.
 *
 * Here rather than in the route because a route module may only export the
 * handler and Next's own config keys — and because the number belongs to the
 * product, not to one endpoint: the client renders "Top 50 of 214" from it and
 * decides whether to pin the viewer's own row, so both sides must read the
 * same value or the board will claim a truncation that did not happen.
 */
export const BOARD_LIMIT = 50;

// ===== "NEVER EXISTED" IS NOT "ENDED". B10. =====
//
// `/cluster challenge:nope` and a fabricated id both answered "That challenge
// is no longer live." So did a challenge that really had ended, and so did a
// live challenge whose card image failed to render — one sentence covering
// three different situations, only one of which it described.
//
// The one it gets most wrong is the typo: telling somebody they just missed a
// competition that never existed invents a loss. On a product where challenges
// carry prize money that is a bad thing to invent.
//
// Deliberately never throws, same contract as `challengeGate` below: a lookup
// that fails should degrade to a vaguer message, never to a broken screen.
export type ChallengeExistence =
  | { exists: false }
  | { exists: true; status: string; title: string; endAt: Date | null };

export async function challengeExistence(challengeId: string): Promise<ChallengeExistence> {
  try {
    const db = await getDb();
    const [c] = await db.select({
      status: schema.challenges.status,
      title: schema.challenges.title,
      endAt: schema.challenges.endAt,
    }).from(schema.challenges).where(eq(schema.challenges.id, challengeId)).limit(1);
    return c ? { exists: true, status: c.status, title: c.title, endAt: c.endAt ?? null } : { exists: false };
  } catch {
    // A database hiccup is not evidence that the challenge is absent, and
    // saying "no such challenge" here would be the same lie in a new place.
    return { exists: true, status: "unknown", title: "", endAt: null };
  }
}

// Does joining this challenge need a key?
export function joinLocked(challenge: { visibility?: string | null; accessKey?: string | null }): boolean {
  return (challenge.visibility ?? "public") === "private" && !!challenge.accessKey;
}

// The key belongs to the server the challenge was assigned to — it was sent
// there, so the bot can show it to that server's members and nobody else.
export function keyVisibleTo(
  challenge: { guildId?: string | null },
  guildId?: string | null,
): boolean {
  return !!challenge.guildId && !!guildId && challenge.guildId === guildId;
}

export type ChallengeGate = { locked: boolean; accessKey: string | null; guildId: string | null };

// Just the gate fields, for deciding which door to show. Deliberately never
// throws: a failed lookup must render an unlocked challenge rather than a
// broken screen, because `joinChallengeFor` re-checks the key anyway.
export async function challengeGate(challengeId: string): Promise<ChallengeGate> {
  const open: ChallengeGate = { locked: false, accessKey: null, guildId: null };
  try {
    const db = await getDb();
    const [c] = await db.select({
      visibility: schema.challenges.visibility,
      accessKey: schema.challenges.accessKey,
      guildId: schema.challenges.guildId,
    }).from(schema.challenges).where(eq(schema.challenges.id, challengeId)).limit(1);
    if (!c) return open;
    return { locked: joinLocked(c), accessKey: c.accessKey ?? null, guildId: c.guildId ?? null };
  } catch { return open; }
}

// ===== Running a challenge: pause, resume, end =====

// Who is allowed to change a challenge's state.
//
// Staff can act on anything. A server owner can act only on a challenge that
// belongs to THEIR server — that's the deal: they requested it, they run it,
// and they can't touch anyone else's.
export type Controller = { staff: true } | { staff: false; guildId: string };

export type ControlResult =
  | { ok: true; status: string; title: string }
  | { ok: false; reason: "not_found" | "forbidden" | "bad_state" | "error" };

export function controlsChallenge(
  challenge: { guildId?: string | null; guildIds?: string[] | null },
  by: Controller,
): boolean {
  if (by.staff) return true;
  const holders = [challenge.guildId, ...(challenge.guildIds ?? [])].filter(Boolean);
  // Only the server it BELONGS to can run it — a server it was merely also
  // launched on is a participant, not an owner.
  return challenge.guildId === by.guildId && holders.includes(by.guildId);
}

export async function setChallengeState(
  challengeId: string,
  next: "paused" | "active" | "completed",
  by: Controller,
): Promise<ControlResult> {
  try {
    const db = await getDb();
    const [c] = await db.select().from(schema.challenges)
      .where(eq(schema.challenges.id, challengeId)).limit(1);
    if (!c) return { ok: false, reason: "not_found" };
    if (!controlsChallenge(c, by)) return { ok: false, reason: "forbidden" };
    if (c.status === "completed") return { ok: false, reason: "bad_state" };

    if (next === "completed") {
      const res = await closeChallenge(challengeId);
      return res.ok
        ? { ok: true, status: "completed", title: c.title }
        : { ok: false, reason: "error" };
    }

    // Resuming a challenge whose window already elapsed would end it again on
    // the next sweep, so give it back the time it was paused for.
    const patch: Record<string, unknown> = { status: next };
    if (next === "active" && c.endAt.getTime() <= Date.now()) {
      patch.endAt = new Date(Date.now() + 7 * 86400000);
    }
    await db.update(schema.challenges).set(patch).where(eq(schema.challenges.id, challengeId));
    return { ok: true, status: next, title: c.title };
  } catch { return { ok: false, reason: "error" }; }
}

// Every challenge a server runs or takes part in — the owner's dashboard.
export async function challengesForGuild(guildId: string) {
  try {
    const db = await getDb();
    const rows = await db.select().from(schema.challenges)
      .orderBy(desc(schema.challenges.createdAt)).limit(200);
    return rows.filter((c) => c.guildId === guildId || (c.guildIds ?? []).includes(guildId));
  } catch { return []; }
}

// ===== Ending a challenge =====

export type StandingRow = {
  userId: string; displayName: string; slug: string; avatarUrl: string | null;
  points: number; place: number; inGameName: string | null;
};

// Live standings, ranked. The same ordering is used for the in-flight
// leaderboard and for freezing final placements, so what people watched all
// week is exactly what decides the trophies.
export async function challengeStandings(challengeId: string, limit = 50): Promise<StandingRow[]> {
  try {
    const db = await getDb();
    const rows = await db.select({
      userId: schema.challengeParticipants.userId,
      points: schema.challengeParticipants.currentPoints,
      displayName: schema.users.displayName,
      slug: schema.users.slug,
      avatarUrl: schema.users.avatarUrl,
      inGameName: schema.linkedGameAccounts.inGameName,
    })
      .from(schema.challengeParticipants)
      .innerJoin(schema.users, eq(schema.challengeParticipants.userId, schema.users.id))
      .leftJoin(schema.linkedGameAccounts, eq(schema.challengeParticipants.linkedAccountId, schema.linkedGameAccounts.id))
      .where(and(
        eq(schema.challengeParticipants.challengeId, challengeId),
        eq(schema.challengeParticipants.status, "active"),
      ))
      // THE TIE-BREAK: equal points, earlier entry wins (B39).
      //
      // This ordered by points alone, so two gamers on the same score were
      // placed in whatever order the database happened to return — which can
      // differ between two reads of the same standings, and decides who gets a
      // trophy. A tie-break invented after the fact is always disputed, so this
      // one is fixed, deterministic, and stated in the rules before entry.
      //
      // Earliest entry rather than latest: the person who committed first, on
      // less information about what score would win, is the one rewarded.
      .orderBy(desc(schema.challengeParticipants.currentPoints), asc(schema.challengeParticipants.joinedAt))
      .limit(limit);
    return rows.map((r, i) => ({ ...r, place: i + 1 }));
  } catch { return []; }
}

export type CloseResult = { ok: boolean; winners: number; reason?: string };

// End a challenge for good: freeze the standings into finalPlacement, mark it
// completed, and hand out the trophies.
//
// This is deliberately idempotent — a cron, an admin button and a retry can all
// call it, and only the first one does anything.
export async function closeChallenge(challengeId: string): Promise<CloseResult> {
  const db = await getDb();
  const [c] = await db.select().from(schema.challenges)
    .where(eq(schema.challenges.id, challengeId)).limit(1);
  if (!c) return { ok: false, winners: 0, reason: "not_found" };
  if (c.status === "completed") return { ok: true, winners: 0, reason: "already_completed" };

  const standings = await challengeStandings(challengeId, 500);

  // Freeze placements first — awardChallengeTrophies reads finalPlacement, and
  // it must never see a half-written podium.
  for (const s of standings) {
    await db.update(schema.challengeParticipants)
      .set({ finalPlacement: s.place, status: "completed" })
      .where(and(
        eq(schema.challengeParticipants.challengeId, challengeId),
        eq(schema.challengeParticipants.userId, s.userId),
      ));
  }

  await db.update(schema.challenges)
    .set({ status: "completed" })
    .where(eq(schema.challenges.id, challengeId));

  const { awardChallengeTrophies } = await import("@/lib/trophies");
  await awardChallengeTrophies(db, challengeId);

  // Everyone who took part hears how they finished, not just the podium.
  for (const s of standings) {
    try {
      await db.insert(schema.notifications).values({
        id: uid(), userId: s.userId, type: "challenge",
        title: `${c.title} has ended`,
        body: s.place <= 3
          ? `You finished #${s.place} with ${s.points} points — your trophy is in your trophy case.`
          : `You finished #${s.place} of ${standings.length} with ${s.points} points.`,
        href: "/profile",
      }).onConflictDoNothing();
    } catch { /* non-fatal */ }
  }

  // Announce the winners, and WAIT for it.
  //
  // This was fire-and-forget, which in a cron or server-action request means it
  // frequently never ran: the moment the request returns the runtime may freeze
  // the function. A challenge that ends without ever announcing its podium is
  // the single most visible failure this system can have, so it is worth the
  // extra second.
  try { await announceChallengeEnded(challengeId); } catch { /* podium is frozen either way */ }

  // Open the next run.
  //
  // A weekly challenge is a series of separate runs, and this is the seam
  // between two of them: the week that just finished keeps its standings and
  // trophies forever, and week two opens immediately with the same entrants and
  // their scores reset. `openNextRun` is a no-op for a challenge that does not
  // repeat or whose last planned run this was.
  let nextRunId: string | null = null;
  try {
    const { openNextRun } = await import("@/lib/challenge-series");
    const next = await openNextRun(challengeId);
    if (next.ok) nextRunId = next.challengeId;
  } catch { /* the finished run is still correctly closed */ }

  // A sponsored campaign tracks which of its four slots is live, so it has to
  // learn that this one is done — and, when the series opened week two itself,
  // which challenge that week is. Awaited for the same reason as above.
  if (c.sponsorCampaignId) {
    try {
      const m = await import("@/lib/sponsored-campaigns");
      await m.advanceCampaign(challengeId, nextRunId);
    } catch { /* a stale campaign slot is a support ticket, not a lost podium */ }
  }

  return { ok: true, winners: Math.min(3, standings.length) };
}

// Every active challenge whose end date has passed. Run daily.
//
// Note what this REPLACES: challenge windows used to be pushed forward on every
// boot for any challenge with a daily/weekly/monthly cadence, so challenges
// never actually ended and trophies were never awarded. Cadence now describes
// how often staff intend to run a NEW one, not a window that slides forever.
export async function closeExpiredChallenges(): Promise<{ closed: number; ids: string[] }> {
  try {
    const db = await getDb();
    const due = await db.select({ id: schema.challenges.id })
      .from(schema.challenges)
      .where(and(
        eq(schema.challenges.status, "active"),
        lt(schema.challenges.endAt, new Date()),
      ));
    const ids: string[] = [];
    for (const c of due) {
      const res = await closeChallenge(c.id);
      if (res.ok && res.reason !== "already_completed") ids.push(c.id);
    }
    return { closed: ids.length, ids };
  } catch { return { closed: 0, ids: [] }; }
}
