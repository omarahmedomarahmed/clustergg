import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { PRICING_DEFAULTS } from "@/lib/pricing";
import { uid } from "@/lib/utils";
import { PROVIDERS, linkableProvider, type ProviderDef } from "@/lib/providers/registry";

// Server-owner challenge requests.
//
// The growth loop only closes if a server owner has something to offer their
// members. So they build a challenge for their own community — game, length,
// trophies, prize money — and submit it. Staff approve it, and approval is what
// creates the real challenge, mints the access key, and announces it.
//
// Deliberately a REQUEST and not a challenge: an owner-created competition runs
// under our brand, on our leaderboards, with our trophies. Nothing goes live
// without a human seeing it first.

export type RequestRow = typeof schema.challengeRequests.$inferSelect;

export type NewRequest = {
  guildId: string;
  game: string;
  title: string;
  description?: string;
  format?: string;
  metric?: string | null;
  days?: number;
  prizeValue?: number;
  prizeCurrency?: string;
  prizeDescription?: string | null;
  prizes?: { first?: string[]; second?: string[]; third?: string[] } | null;
  requestedByDiscordId?: string | null;
  requestedByUserId?: string | null;
};

export type SubmitResult =
  | { ok: true; id: string }
  | { ok: false; reason: "no_game" | "no_title" | "unknown_game" | "too_many_pending" | "error" };

const MAX_PENDING_PER_GUILD = 3;

export async function submitChallengeRequest(input: NewRequest): Promise<SubmitResult> {
  const title = (input.title ?? "").trim();
  const game = (input.game ?? "").trim();
  if (!game) return { ok: false, reason: "no_game" };
  if (!title) return { ok: false, reason: "no_title" };

  // The game has to be one we actually sync stats for, or the challenge can't
  // be scored and the owner would be promising something we can't deliver.
  const provider = providerForGame(game);
  if (!provider) return { ok: false, reason: "unknown_game" };

  try {
    const db = await getDb();
    const pending = await db.select({ id: schema.challengeRequests.id })
      .from(schema.challengeRequests)
      .where(and(
        eq(schema.challengeRequests.guildId, input.guildId),
        eq(schema.challengeRequests.status, "pending"),
      ));
    if (pending.length >= MAX_PENDING_PER_GUILD) return { ok: false, reason: "too_many_pending" };

    const id = uid();
    await db.insert(schema.challengeRequests).values({
      id,
      guildId: input.guildId,
      requestedByDiscordId: input.requestedByDiscordId ?? null,
      requestedByUserId: input.requestedByUserId ?? null,
      game: provider.game,
      provider: provider.id,
      title: title.slice(0, 120),
      description: (input.description ?? "").slice(0, 1000),
      format: ["top1", "top3", "threshold_race"].includes(input.format ?? "") ? input.format! : "top3",
      metric: input.metric ?? null,
      days: clampDays(input.days),
      prizeValue: Math.max(0, Math.floor(input.prizeValue ?? 0)),
      prizeCurrency: (input.prizeCurrency ?? "USD").slice(0, 8).toUpperCase(),
      prizeDescription: input.prizeDescription ?? null,
      prizes: input.prizes ?? null,
    });
    return { ok: true, id };
  } catch { return { ok: false, reason: "error" }; }
}

function clampDays(d?: number): number {
  const n = Math.floor(Number(d ?? 7));
  return Number.isFinite(n) ? Math.min(90, Math.max(1, n)) : 7;
}

// Which provider backs a game name. Identity-only providers (Discord, Epic)
// have no stats to sync, so they can't score a challenge.
export function providerForGame(game: string): ProviderDef | null {
  return linkableProvider(game);
}

export type RequestableGame = { name: string; provider: string; logoUrl: string | null; metrics: string[] };

// Games an owner can actually build a challenge on.
//
// Three conditions, all of which must hold or the request would be dead on
// arrival: the game is active, we sync a provider for it (so it can be scored),
// and it has a planet (so the challenge has somewhere to live). Offering a game
// that fails any of these means an owner fills in a form we then have to
// reject — the worst possible first experience of the loop.
export async function requestableGames(): Promise<RequestableGame[]> {
  try {
    const db = await getDb();
    const [games, planets] = await Promise.all([
      db.select({ name: schema.games.name, logoUrl: schema.games.logoUrl, isActive: schema.games.isActive })
        .from(schema.games),
      db.select({ game: schema.spaces.game }).from(schema.spaces),
    ]);
    const hasPlanet = new Set(planets.map((p) => p.game));
    return games
      .filter((g) => g.isActive !== false && hasPlanet.has(g.name))
      .map((g) => {
        const p = providerForGame(g.name);
        return p ? { name: g.name, provider: p.id, logoUrl: g.logoUrl, metrics: p.capabilities.map((m) => m.key) } : null;
      })
      .filter((x): x is RequestableGame => !!x);
  } catch { return []; }
}

export async function listRequests(opts: { guildId?: string; status?: string } = {}): Promise<RequestRow[]> {
  try {
    const db = await getDb();
    const clauses = [
      opts.guildId ? eq(schema.challengeRequests.guildId, opts.guildId) : null,
      opts.status ? eq(schema.challengeRequests.status, opts.status) : null,
    ].filter((c): c is NonNullable<typeof c> => !!c);
    const q = db.select().from(schema.challengeRequests).orderBy(desc(schema.challengeRequests.createdAt)).limit(100);
    return clauses.length ? q.where(clauses.length === 1 ? clauses[0] : and(...clauses)) : q;
  } catch { return []; }
}

export async function getRequest(id: string): Promise<RequestRow | null> {
  try {
    const db = await getDb();
    const [r] = await db.select().from(schema.challengeRequests)
      .where(eq(schema.challengeRequests.id, id)).limit(1);
    return r ?? null;
  } catch { return null; }
}

export async function countPendingRequests(): Promise<number> {
  try {
    const db = await getDb();
    const rows = await db.select({ id: schema.challengeRequests.id })
      .from(schema.challengeRequests).where(eq(schema.challengeRequests.status, "pending"));
    return rows.length;
  } catch { return 0; }
}

// ===== Approval =====

export type ApproveResult =
  | { ok: true; challengeId: string; accessKey: string }
  | { ok: false; reason: "not_found" | "not_pending" | "no_planet" | "error" };

// Approving is what makes the challenge real: it creates the `challenges` row
// as private to the requesting server, mints the access key, and announces it
// there with the key attached. Idempotent — a second approval returns the
// challenge the first one made rather than creating a duplicate.
export async function approveRequest(
  requestId: string,
  reviewerId: string,
  overrides: { title?: string; days?: number; note?: string } = {},
): Promise<ApproveResult> {
  const req = await getRequest(requestId);
  if (!req) return { ok: false, reason: "not_found" };
  if (req.status === "approved" && req.challengeId) {
    const existing = await challengeKey(req.challengeId);
    return { ok: true, challengeId: req.challengeId, accessKey: existing ?? "" };
  }
  if (req.status !== "pending") return { ok: false, reason: "not_pending" };

  try {
    const db = await getDb();
    // A challenge lives on its game's planet, so the planet has to exist.
    const [space] = await db.select({ id: schema.spaces.id })
      .from(schema.spaces).where(eq(schema.spaces.game, req.game)).limit(1);
    if (!space) return { ok: false, reason: "no_planet" };

    // A prize pool with no trophies behind it pays out nothing.
    //
    // An owner requesting a challenge names a monetary value — "$250" — but
    // has no way to pick trophies from a Discord modal (five inputs, and
    // they'd have to know our catalogue by id). Without this, approval created
    // a challenge whose winners got a prize DESCRIPTION and an empty trophy
    // case, which is the worst possible version of "real trophies".
    const podium = req.prizes?.first?.length ? req.prizes : await podiumFor(req.game, req.prizeValue);

    const days = clampDays(overrides.days ?? req.days);
    const startAt = new Date();
    const endAt = new Date(startAt.getTime() + days * 86400000);
    const accessKey = newAccessKey();
    const challengeId = uid();

    // A brand's challenge and a server's challenge are shaped differently, and
    // the difference is who it is FOR.
    //
    // A server owner's is private to their community — that exclusivity is the
    // thing they're getting. A brand paid to reach the network, so theirs is
    // public by default and runs everywhere: gating a sponsored challenge to
    // one server would sell a brand a fraction of what they bought. Staff can
    // still narrow it to chosen servers afterwards, which is a different and
    // deliberate decision.
    const sponsored = !!req.brandId;
    const price = sponsored ? PRICING_DEFAULTS.challengePrice : 0;

    await db.insert(schema.challenges).values({
      id: challengeId,
      spaceId: space.id,
      game: req.game,
      provider: req.provider,
      title: overrides.title?.trim() || req.title,
      description: req.description,
      format: req.format,
      rules: { conditions: [] },
      pointsEngine: req.metric ? { [req.metric]: 1 } : {},
      // Private to the server that asked for it, and gated by the key we're
      // about to send them. Everyone else can watch.
      visibility: sponsored ? "public" : "private",
      guildId: req.guildId || null,
      guildIds: req.guildId ? [req.guildId] : [],
      accessKey: sponsored ? null : accessKey,
      announceHype: true,
      startAt, endAt,
      status: "active",
      cadence: "custom",
      prizes: podium,
      trophyId: podium?.first?.[0] ?? null,
      prizeDescription: req.prizeDescription
        ?? (req.prizeValue > 0 ? `${req.prizeValue} ${req.prizeCurrency} prize pool` : null),
      sponsorBrandId: req.brandId,
      sponsorCampaignId: req.campaignId,
      sponsorPrice: price,
      createdBy: reviewerId,
    });

    // Tie the challenge back to the week of the campaign that bought it, so the
    // brand's portal can show "week 2 of 4, live" rather than a loose list.
    if (req.campaignId && req.slotIndex != null) {
      const { bindSlotChallenge } = await import("@/lib/sponsored-campaigns");
      await bindSlotChallenge(req.campaignId, req.slotIndex, challengeId);
    }

    await db.update(schema.challengeRequests).set({
      status: "approved",
      challengeId,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      reviewNote: overrides.note ?? null,
    }).where(eq(schema.challengeRequests.id, requestId));

    // Announce it where it belongs, with the key. Never allowed to fail the
    // approval — staff clicked approve and the challenge exists either way.
    const { announceChallengeLaunched } = await import("@/lib/discord/announce");
    void announceChallengeLaunched(challengeId).catch(() => {});

    return { ok: true, challengeId, accessKey };
  } catch { return { ok: false, reason: "error" }; }
}

// Pick trophies worth roughly the pool the owner promised.
//
// Split 60/30/10 across the podium — the standard shape, and close enough that
// staff overriding it is a judgement call rather than a correction. Prefers a
// trophy tagged for this game so the award looks like it belongs to the
// competition it came from, and falls back to the general catalogue.
async function podiumFor(
  game: string,
  poolValue: number,
): Promise<{ first?: string[]; second?: string[]; third?: string[] } | null> {
  if (!(poolValue > 0)) return null;
  try {
    const db = await getDb();
    const all = await db.select().from(schema.trophies);
    if (!all.length) return null;

    const forGame = all.filter((t) => t.game === game);
    const pool = forGame.length ? forGame : all.filter((t) => !t.game);
    const usable = (pool.length ? pool : all).slice().sort((a, b) => b.value - a.value);
    if (!usable.length) return null;

    // The trophy closest in value to the target, without going over unless
    // everything is over — awarding more than the owner promised is our cost,
    // not theirs, so we never do it by accident.
    const closest = (target: number) => {
      const under = usable.filter((t) => t.value <= target);
      const from = under.length ? under : usable;
      return from.reduce((best, t) =>
        Math.abs(t.value - target) < Math.abs(best.value - target) ? t : best, from[0]);
    };

    return {
      first: [closest(poolValue * 0.6).id],
      second: [closest(poolValue * 0.3).id],
      third: [closest(poolValue * 0.1).id],
    };
  } catch { return null; }
}

export async function rejectRequest(requestId: string, reviewerId: string, note?: string): Promise<boolean> {
  try {
    const db = await getDb();
    await db.update(schema.challengeRequests).set({
      status: "rejected", reviewedBy: reviewerId, reviewedAt: new Date(), reviewNote: note ?? null,
    }).where(and(
      eq(schema.challengeRequests.id, requestId),
      eq(schema.challengeRequests.status, "pending"),
    ));
    return true;
  } catch { return false; }
}

async function challengeKey(challengeId: string): Promise<string | null> {
  try {
    const db = await getDb();
    const [c] = await db.select({ accessKey: schema.challenges.accessKey })
      .from(schema.challenges).where(eq(schema.challenges.id, challengeId)).limit(1);
    return c?.accessKey ?? null;
  } catch { return null; }
}

// Short, unambiguous, and typeable from a phone: no O/0/I/1.
export function newAccessKey(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 7; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

// Human-readable trophies for a request, so neither the owner nor staff has to
// read an array of ids.
export async function trophiesFor(prizes: RequestRow["prizes"]): Promise<Record<string, { name: string; imageUrl: string | null }[]>> {
  const ids = [...(prizes?.first ?? []), ...(prizes?.second ?? []), ...(prizes?.third ?? [])];
  if (!ids.length) return {};
  try {
    const db = await getDb();
    const rows = await db.select({ id: schema.trophies.id, name: schema.trophies.name, imageUrl: schema.trophies.imageUrl })
      .from(schema.trophies).where(inArray(schema.trophies.id, ids));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const pick = (list?: string[]) => (list ?? []).map((i) => byId.get(i)).filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => ({ name: t.name, imageUrl: t.imageUrl }));
    return { first: pick(prizes?.first), second: pick(prizes?.second), third: pick(prizes?.third) };
  } catch { return {}; }
}
