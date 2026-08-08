import { cache } from "react";
import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { uid } from "@/lib/utils";
import type { MissionConfig, QuestGameUi, QuestRule, StarterMissions } from "@/lib/quest-game";
import { lockGamer, withTx } from "@/lib/db/tx";

// ===== Action catalog =====
// The set of trackable actions the engine knows how to emit. A quest "listens"
// to any subset via its actionWeights map, so admins can point any quest at any
// action. `group` is only the default quest an action ships attached to.
export type QuestActionKey =
  | "join_challenge" | "finish_challenge" | "top3_challenge" | "win_challenge"
  | "join_planet" | "write_post" | "write_comment" | "reaction_given" | "reaction_received"
  | "follower_gained" | "message_new" | "profile_views_25"
  | "connect_account" | "stat_levelup"
  // B61's repricing. `challenge_progress` and `play_session` exist because two
  // quests had no genuinely DAILY action — conquest's only repeatable one was
  // joining, and you cannot join the same thing twice — and `share_card`
  // because "share your card in <server>" is the task the mission's
  // personalisation was written around.
  | "challenge_progress" | "play_session" | "share_card"
  | "ad_impression" | "ad_click"
  | "profile_vote_received" | "best_profile_award"
  | "botlist_vote" | "bot_added" | "redeem_trophy" | "gift_sent" | "gift_received";

/**
 * What every action pays, and how often it can pay (B34).
 *
 * **Every action has a cap.** Nine of these used to have none, which meant the
 * cost of a gamer was unbounded by construction — the only reason it looked
 * survivable was that nobody had tried. An uncapped action is not a generous
 * action, it is an unpriced one.
 *
 * The shape of the table is deliberate: rare and hard things pay more and cap
 * at one; grindable things pay little. Winning a challenge is worth a hundred
 * times a comment because it is a hundred times harder, not because a comment
 * is worthless.
 *
 * At 10,000 CP = $1 (see `DEFAULT_CP_PER_DOLLAR`) the per-action caps sum to
 * 624 CP/day and the global ceiling (`DEFAULT_DAILY_CP_CEILING`) allows 500 —
 * **five cents a day** for a gamer doing everything we want at the maximum. Our
 * worst case and our best case are the same event, which is the property this
 * table exists to have.
 */
export const ACTION_CATALOG: { key: QuestActionKey; label: string; group: string; defaultWeight: number; defaultCap: number }[] = [
  // ===== Repriced for the Daily Mission (B61) =====
  //
  // The old table could not close: everything a gamer could do in a day, at
  // every cap, was 624 CP, and stripping the actions nobody does daily left
  // 224 — against a 500 ceiling and a mission of eight tasks. So the mission's
  // arithmetic was impossible, not merely tight.
  //
  // Now every quest's MISSION POOL tops out at exactly 125, four quests make
  // 500, and any valid pair of tasks from a quest sums to 125. Prices are
  // multiples of 5 and mostly of 25, which is why no 1-CP rounding term is
  // needed any more — that was a patch for arithmetic that did not close.
  //
  // **Repricing does not raise the daily cost per gamer**: the 500 ceiling is
  // unchanged and is still the guarantee. What it changes is that the ceiling
  // becomes REACHABLE — protection on purpose rather than protection by
  // accident. A gamer who never misses now earns $0.05 a day.
  //
  // Every number here is a DEFAULT. Each quest stores its own `actionWeights`
  // and `dailyCaps`, so an admin edits any of them without a deploy.

  // Conquest — competing.
  { key: "join_challenge",   label: "Join a challenge",        group: "conquest",  defaultWeight: 25, defaultCap: 2 },
  { key: "finish_challenge", label: "Finish a challenge",      group: "conquest",  defaultWeight: 25, defaultCap: 2 },
  // The daily conquest action. Joining cannot be one: you cannot join the same
  // competition twice, so a quest about competing had nothing to do on day two.
  { key: "challenge_progress", label: "Move your score in a challenge", group: "conquest", defaultWeight: 25, defaultCap: 4 },
  // Kept, priced as before, and OUT of the mission pool: nobody wins a
  // challenge daily, and a task nobody can finish is a mission that teaches
  // gamers the mission is not for them.
  { key: "top3_challenge",   label: "Place top 3",             group: "conquest",  defaultWeight: 50, defaultCap: 1 },
  { key: "win_challenge",    label: "Win a challenge (1st)",   group: "conquest",  defaultWeight: 100, defaultCap: 1 },

  // Orbit — social identity.
  //
  // Posts, comments and reactions are GONE from the quest actions: there are no
  // posts on planets any more. Following, messaging and gifting stay, because
  // those are the social features that remain.
  //
  // `share_card` carries a 75 rather than a follower or a gift, and that is
  // deliberate: sharing a card is not farmable for value — it costs the gamer
  // nothing, gains them nothing but the CP, and spreads our cards into servers.
  // Followers, votes and gifts stay at 2 because they ARE farmable by a pair of
  // accounts, which is B35's problem arriving through a new door.
  { key: "share_card",       label: "Share a Cluster card in a server", group: "orbit", defaultWeight: 25, defaultCap: 3 },
  // Renamed with its rule (B72.2). It used to pay on every 25 RAW views of a
  // public page, which anybody could produce by reloading — no account, no
  // cost, and not even their own profile. It now pays once per signed-in
  // viewer per day, so the cap of 3 means three real gamers looked.
  { key: "profile_views_25", label: "A gamer views your profile", group: "orbit", defaultWeight: 25, defaultCap: 3 },
  { key: "follower_gained",  label: "Gain a follower",         group: "orbit",     defaultWeight: 25, defaultCap: 2 },
  { key: "profile_vote_received", label: "Someone votes for your profile", group: "orbit", defaultWeight: 25, defaultCap: 2 },
  // RETIRED with the feature (B72.3), not deleted — same treatment as posts and
  // comments. A quest whose stored `actionWeights` still names one reads zero
  // instead of throwing, and an admin who had tuned them sees a 0 rather than a
  // crash. Weight 0 means no path can pay for them.
  //
  // They were priced identically and capped at 2 precisely because any gap
  // between giving and receiving is an arbitrage a pair of accounts can farm.
  // Deleting gifting removes the arbitrage instead of bounding it.
  { key: "gift_sent",        label: "Send a gift (retired)",    group: "orbit",     defaultWeight: 0, defaultCap: 1 },
  { key: "gift_received",    label: "Receive a gift (retired)", group: "orbit",     defaultWeight: 0, defaultCap: 1 },
  { key: "message_new",      label: "Message a new gamer",     group: "orbit",     defaultWeight: 10, defaultCap: 3 },
  { key: "join_planet",      label: "Join a planet",           group: "orbit",     defaultWeight: 25, defaultCap: 1 },
  { key: "best_profile_award",    label: "Place in Best Profile",          group: "orbit", defaultWeight: 100, defaultCap: 1 },

  // Ascension — your game accounts.
  { key: "stat_levelup",     label: "A tracked stat rises",    group: "ascension", defaultWeight: 25, defaultCap: 4 },
  // The quest is about game accounts, and the thing you do with a game account
  // is play. Ascension needed a second daily action once `share_card` moved to
  // orbit where it belongs.
  { key: "play_session",     label: "Land a tracked match",    group: "ascension", defaultWeight: 25, defaultCap: 3 },
  { key: "redeem_trophy",    label: "Redeem a trophy",         group: "ascension", defaultWeight: 25, defaultCap: 2 },
  { key: "connect_account",  label: "Connect a game account",  group: "ascension", defaultWeight: 50, defaultCap: 1 },

  // Signal — growth and attention.
  // ONE CP, not five. At five, `tests/db/cp-economics.mts` showed us paying
  // $0.50 per 1,000 impressions against a floor CPM of $0.50 — every cent of
  // the ad revenue, straight back out. That suite exists for exactly this, and
  // it caught it before the price shipped. At 1 CP the payout is $0.10 per
  // 1,000, a fifth of the floor.
  { key: "ad_impression",    label: "See an ad (impression)",  group: "signal",    defaultWeight: 1, defaultCap: 25 },
  { key: "ad_click",         label: "Click an ad",             group: "signal",    defaultWeight: 25, defaultCap: 3 },
  { key: "botlist_vote",     label: "Vote for Cluster on a bot list", group: "signal", defaultWeight: 25, defaultCap: 2 },
  // Was 50 at a cap of ONE — a once-ever action. Self-limiting by nature, since
  // you run out of servers you own, so a cap of 2 is safe and it becomes
  // something a gamer can actually be asked to do.
  { key: "bot_added",        label: "Add the bot to a server", group: "signal",    defaultWeight: 25, defaultCap: 2 },

  // ===== Retired from the quest actions (B61) =====
  //
  // There are no posts on planets any more. The FEATURE is not removed yet —
  // that is a separate decision with stored rows behind it — but these pay
  // nothing, which is what "remove them from the quest actions" means. Left
  // here at weight 0 rather than deleted, so a quest whose stored
  // `actionWeights` still names one reads it as zero instead of throwing.
  { key: "write_post",       label: "Write a post (retired)",     group: "orbit", defaultWeight: 0, defaultCap: 1 },
  { key: "write_comment",    label: "Write a comment (retired)",  group: "orbit", defaultWeight: 0, defaultCap: 1 },
  { key: "reaction_given",   label: "React to a post (retired)",  group: "orbit", defaultWeight: 0, defaultCap: 1 },
  { key: "reaction_received",label: "Get a reaction (retired)",   group: "orbit", defaultWeight: 0, defaultCap: 1 },
];

/**
 * The sum of every per-action cap — what the table would pay if one person did
 * literally everything, every day.
 *
 * It is a *fixture*, asserted in `tests/db/cp-economics.mts`, so that moving a
 * weight is a deliberate act with a visible diff rather than something that
 * quietly drifts. B61's repricing moved it from 624 to its current value, which
 * is exactly the kind of change this fixture exists to make visible. It is deliberately HIGHER than the ceiling: the caps shape
 * behaviour, the ceiling is the guarantee, and the guarantee must not depend on
 * nobody happening to win a challenge and take Best Profile on the same day.
 */
export const ACTION_CAP_SUM = ACTION_CATALOG.reduce((s, a) => s + a.defaultWeight * a.defaultCap, 0);

/**
 * The hard ceiling: no gamer is credited more than this in a UTC day, across
 * every action and every quest.
 *
 * One number, not twenty. That is what makes the policy auditable — a per-action
 * table has to be re-summed every time somebody moves a weight, and this does
 * not. Editable in settings under `quests.dailyCpCeiling`.
 */
export const DEFAULT_DAILY_CP_CEILING = 500;

export const ACTION_LABEL: Record<string, string> = Object.fromEntries(ACTION_CATALOG.map((a) => [a.key, a.label]));

// Cosmic quest emblem art (Higgsfield nano_banana). Served directly from the
// CDN like the planet skins; admins can replace any of these in /admin/quests.
const HF = "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082";
// Glorified unified-style quest badges (hexagonal cosmic medals).
export const QUEST_EMBLEMS: Record<string, string> = {
  conquest: `${HF}/hf_20260717_223341_7969f811-bb66-45b0-b589-756f32d7c034.png`,
  orbit: `${HF}/hf_20260717_223622_deb3e6f8-a5ac-4ac4-a321-1b19d0facbfb.png`,
  ascension: `${HF}/hf_20260717_223625_d4b96822-41d1-4b3b-a0f0-dd9bae1d7ca7.png`,
  signal: `${HF}/hf_20260717_223627_90984c2b-6b28-41f0-8e65-558acb2adfa0.png`,
};
// The previous emblems — replaced automatically by the new badges (admin
// uploads are preserved since they won't match these).
const OLD_QUEST_EMBLEMS: string[] = [
  `${HF}/hf_20260714_193856_ea53f06e-b44d-4473-b67c-b3c2a2a736c7.png`,
  `${HF}/hf_20260714_193903_a1b522be-910a-49df-8904-b4fbbf832f97.png`,
  `${HF}/hf_20260714_193907_7a60de0d-d719-4228-860e-6ec7b44b1b31.png`,
  `${HF}/hf_20260715_113609_7865c988-053e-4808-bc82-3451222db943.png`,
];
// Big glorified Cluster Points (CP) currency icon — shown wherever CP appears.
export const CP_ICON = `${HF}/hf_20260717_223629_251d5972-a1bc-4e38-8724-1ea35bf10f18.png`;
// Gamified cosmic card backgrounds per quest (subtle, dark, text-safe).
export const QUEST_CARD_BGS: Record<string, string> = {
  conquest: `${HF}/hf_20260715_113645_4eb3d18c-2808-4d26-a38e-359ca5e78dbc.png`,
  orbit: `${HF}/hf_20260715_113649_4dcef232-cee5-4d48-b950-0d3f4907289a.png`,
  ascension: `${HF}/hf_20260715_113657_a4ea0800-d986-4490-aa9d-209106e6d192.png`,
  signal: `${HF}/hf_20260715_113701_940a9b02-30e1-413e-9a91-dabb9acb6f8f.png`,
};
// Flat-earth 3D quest MAP art (one themed world per quest), used as the
// treasure-map hero. Background-REMOVED (transparent) so the page's own space
// background shows behind the floating map, per the brief. Each is a themed world.
export const QUEST_MAP_ART: Record<string, string> = {
  conquest: `${HF}/hf_20260718_162555_8d13e694-bdd8-41bd-8360-0d1d20c1abfc.png`,
  orbit: `${HF}/hf_20260718_162600_f4c2d883-7673-4e36-9b34-dd900b24c841.png`,
  ascension: `${HF}/hf_20260718_163045_7327cc89-ffcb-4a8e-8a43-c009912d42d9.png`,
  signal: `${HF}/hf_20260718_163048_d3642044-d3b7-4ad3-a41c-88a63b515085.png`,
};
// Previous map arts (the space-background versions) + their Blob-rehosted forms —
// replaced automatically by the transparent versions. Admin uploads that aren't
// in this list are preserved.
const OLD_QUEST_MAPS: string[] = [
  `${HF}/hf_20260717_223300_12943977-905f-4e3e-9c9e-c13b988d95d9.png`,
  `${HF}/hf_20260717_223301_8726e058-02b7-439c-a7f0-d598bbcfa036.png`,
  `${HF}/hf_20260717_223318_e48ad818-64ca-4910-9f3d-39ac838d9967.png`,
  `${HF}/hf_20260717_223321_558cd40f-903d-440b-ae2f-2b01bb01cffd.png`,
  "https://k97i8qtht2q1jooh.public.blob.vercel-storage.com/uploads/quest/1AXVB8Q1upPepaf2.png",
  "https://k97i8qtht2q1jooh.public.blob.vercel-storage.com/uploads/quest/mAwM4hbLnEBcoefs.png",
  "https://k97i8qtht2q1jooh.public.blob.vercel-storage.com/uploads/quest/tGZbt6sc-47O5gmd.png",
  "https://k97i8qtht2q1jooh.public.blob.vercel-storage.com/uploads/quest/zrNCa78zgvvMoP2k.png",
];

// ===== Default quests (seeded once; fully editable afterwards) =====
type DefaultTier = { name: string; description: string; thresholdQp: number };
type DefaultQuest = {
  key: string; name: string; tagline: string; lore: string; color: string; accent2: string; icon: string;
  sortOrder: number; tiers: DefaultTier[];
};

const TIERS = (a: number, b: number, c: number, d: number, story: [string, string, string, string]): DefaultTier[] => [
  { name: "Bronze", description: story[0], thresholdQp: a },
  { name: "Silver", description: story[1], thresholdQp: b },
  { name: "Gold", description: story[2], thresholdQp: c },
  { name: "Platinum", description: story[3], thresholdQp: d },
];

export const DEFAULT_QUESTS: DefaultQuest[] = [
  {
    key: "conquest", name: "Conquest", tagline: "Win challenges across every game", icon: "trophy",
    color: "#f5b301", accent2: "#ff7847", sortOrder: 0,
    lore: "The arena spans the galaxy. Join challenges, climb the podium, and let every victory echo through the Cluster — no matter which game you conquer it in.",
    tiers: TIERS(100, 400, 1200, 3000, [
      "Enter the arena — join your first challenges.",
      "Taste the podium — start placing top 3.",
      "Serial winner — victories stack up.",
      "Galactic champion — the Cluster knows your name.",
    ]),
  },
  {
    key: "orbit", name: "Orbit", tagline: "Pull other gamers into your gravity", icon: "users",
    color: "#a78bfa", accent2: "#22d3ee", sortOrder: 1,
    lore: "No star shines alone. Join planets, post, react, follow and be followed — grow the constellation that orbits you.",
    tiers: TIERS(100, 400, 1200, 3000, [
      "First contact — join planets and start talking.",
      "Rising signal — people gather around you.",
      "Gravity well — a real community forms.",
      "Supermassive — you bend the whole feed toward you.",
    ]),
  },
  {
    key: "ascension", name: "Ascension", tagline: "Connect games and level them up", icon: "chart",
    color: "#22d3ee", accent2: "#38bdf8", sortOrder: 2,
    lore: "Every account you link is another engine on your ship. Connect more games and push each one higher — the Cluster measures the climb across all of them.",
    tiers: TIERS(120, 480, 1200, 3000, [
      "Ignition — link your first accounts.",
      "Booster stage — more games, more climb.",
      "Orbit achieved — progression across the board.",
      "Ascended — a multi-game force.",
    ]),
  },
  {
    key: "signal", name: "Signal", tagline: "Explore the Cluster and get seen", icon: "zap",
    color: "#fbbf24", accent2: "#f472b6", sortOrder: 3,
    lore: "The more of the galaxy you traverse, the stronger your signal. Just by exploring the Cluster, your beacon grows.",
    tiers: TIERS(60, 240, 720, 1800, [
      "Faint blip — start exploring.",
      "Steady beacon — you're a regular traveler.",
      "Bright pulse — the Cluster is your home.",
      "Pulsar — an ever-present signal.",
    ]),
  },
];

function weightsFor(questKey: string): Record<string, number> {
  return Object.fromEntries(ACTION_CATALOG.filter((a) => a.group === questKey).map((a) => [a.key, a.defaultWeight]));
}
function capsFor(questKey: string): Record<string, number> {
  return Object.fromEntries(ACTION_CATALOG.filter((a) => a.group === questKey).map((a) => [a.key, a.defaultCap]));
}

/**
 * What the table paid BEFORE B34, frozen.
 *
 * A quest's weights and caps live in its own row, so the catalog above only
 * seeds them — repricing the catalog alone would change nothing that already
 * exists. This is the ensureQuestArt pattern: rewrite a stored value only when
 * it still equals the old default, so an admin who deliberately set a number
 * keeps it. Nine of these had no cap at all, which is why the second map is
 * sparse.
 */
const PRE_B34_WEIGHTS: Record<string, number> = {
  join_challenge: 15, finish_challenge: 25, top3_challenge: 150, win_challenge: 400,
  join_planet: 20, write_post: 10, write_comment: 5, reaction_given: 2, reaction_received: 3,
  follower_gained: 8, message_new: 4, profile_views_25: 10,
  profile_vote_received: 15, best_profile_award: 250, botlist_vote: 50,
  connect_account: 120, stat_levelup: 25, ad_impression: 1, ad_click: 5,
};
const PRE_B34_CAPS: Record<string, number> = {
  join_challenge: 5, write_post: 10, write_comment: 20, reaction_given: 30,
  reaction_received: 50, message_new: 15, botlist_vote: 2, stat_levelup: 20,
  ad_impression: 60, ad_click: 10,
};

/**
 * Bring existing quests onto the B34 table (idempotent, runs every boot).
 *
 * Three things happen per quest, and each is conditional:
 *   - a weight still at its pre-B34 default is repriced;
 *   - an action with NO cap gets one, because "uncapped" was never a choice
 *     somebody made — it was the absence of one, and it is the whole reason
 *     this item exists;
 *   - a cap still at its pre-B34 default is retightened.
 *
 * An admin's own number is never touched. If they set `ad_impression` to 4 CP,
 * that survives — the point of the ceiling is that it does not have to be
 * defended one weight at a time.
 */
export async function repriceQuests(db: DB) {
  const quests = await db.select().from(schema.quests);
  for (const q of quests) {
    const weights = { ...(q.actionWeights ?? {}) as Record<string, number> };
    const caps = { ...(q.dailyCaps ?? {}) as Record<string, number> };
    let touched = false;
    for (const a of ACTION_CATALOG) {
      const w = weights[a.key];
      if (w !== undefined && w === PRE_B34_WEIGHTS[a.key] && w !== a.defaultWeight) {
        weights[a.key] = a.defaultWeight; touched = true;
      }
      // An action the catalog gained after this quest was created (bot_added,
      // redeem_trophy, gift_sent, gift_received) is seeded onto its own quest.
      // Without this, a database that predates B34 would carry the four new keys
      // in the catalog and in no quest, so nothing would ever pay them.
      if (weights[a.key] === undefined && a.group === q.key && PRE_B34_WEIGHTS[a.key] === undefined) {
        weights[a.key] = a.defaultWeight; touched = true;
      }
      // Otherwise only quests that actually listen get a cap — adding one to an
      // action a quest ignores would put a number in the admin's face for a row
      // that pays nothing.
      if (weights[a.key] === undefined) continue;
      const c = caps[a.key];
      if (c === undefined || (c === PRE_B34_CAPS[a.key] && c !== a.defaultCap)) {
        caps[a.key] = a.defaultCap; touched = true;
      }
    }
    if (touched) {
      await db.update(schema.quests).set({ actionWeights: weights, dailyCaps: caps })
        .where(eq(schema.quests.id, q.id));
    }
  }
}

// Idempotent seed — creates any missing default quest + its tiers by key.
export async function seedQuests(db: DB) {
  for (const q of DEFAULT_QUESTS) {
    const [existing] = await db.select({ id: schema.quests.id }).from(schema.quests).where(eq(schema.quests.key, q.key)).limit(1);
    if (existing) continue;
    const questId = uid();
    await db.insert(schema.quests).values({
      id: questId, key: q.key, name: q.name, tagline: q.tagline, lore: q.lore,
      color: q.color, accent2: q.accent2, icon: q.icon,
      logoUrl: QUEST_EMBLEMS[q.key] ?? null, cardBgUrl: QUEST_CARD_BGS[q.key] ?? null,
      actionWeights: weightsFor(q.key), dailyCaps: capsFor(q.key), sortOrder: q.sortOrder,
    }).onConflictDoNothing();
    const n = q.tiers.length;
    let i = 0;
    for (const t of q.tiers) {
      const [x, y] = mapPos(i, n);
      await db.insert(schema.questTiers).values({
        id: uid(), questId, tierIndex: i, name: t.name, description: t.description, thresholdQp: t.thresholdQp, mapX: x, mapY: y,
      });
      i++;
    }
  }
}

// Spread tier pins along a gentle left→right winding path across the map.
function mapPos(i: number, n: number): [number, number] {
  const x = Math.round(12 + 76 * (n > 1 ? i / (n - 1) : 0.5));
  const y = i % 2 === 0 ? 40 : 64;
  return [x, y];
}

// Backfill emblem art onto default quests that don't have a logo yet — never
// clobbers an admin upload. Idempotent; safe to run every boot-maintenance.
export async function ensureQuestArt(db: DB) {
  for (const [key, url] of Object.entries(QUEST_EMBLEMS)) {
    // Set the new badge where there's no logo OR the logo is a previous default
    // (so we upgrade the art without clobbering an admin's own upload).
    await db.update(schema.quests).set({ logoUrl: url })
      .where(and(eq(schema.quests.key, key), or(isNull(schema.quests.logoUrl), inArray(schema.quests.logoUrl, OLD_QUEST_EMBLEMS))));
  }
  for (const [key, url] of Object.entries(QUEST_CARD_BGS)) {
    await db.update(schema.quests).set({ cardBgUrl: url })
      .where(and(eq(schema.quests.key, key), isNull(schema.quests.cardBgUrl)));
  }
  for (const [key, url] of Object.entries(QUEST_MAP_ART)) {
    // Upgrade to the transparent map where there's none OR the current art is a
    // previous default / its Blob-rehosted form (admin uploads are preserved).
    await db.update(schema.quests).set({ mapArtUrl: url })
      .where(and(eq(schema.quests.key, key), or(isNull(schema.quests.mapArtUrl), inArray(schema.quests.mapArtUrl, OLD_QUEST_MAPS))));
  }
  // Spread map pins for any quest whose tiers are all still at the default
  // center (50/50) — so the standalone map hero shows a real path, not a stack.
  const quests = await db.select({ id: schema.quests.id }).from(schema.quests);
  for (const q of quests) {
    const tiers = await db.select().from(schema.questTiers).where(eq(schema.questTiers.questId, q.id)).orderBy(schema.questTiers.tierIndex);
    if (tiers.length > 1 && tiers.every((t) => t.mapX === 50 && t.mapY === 50)) {
      for (let i = 0; i < tiers.length; i++) {
        const [x, y] = mapPos(i, tiers.length);
        await db.update(schema.questTiers).set({ mapX: x, mapY: y }).where(eq(schema.questTiers.id, tiers[i].id));
      }
    }
  }
}

// ===== Award engine =====
function startOfUtcDay(): Date { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; }

/**
 * The CP a row actually paid.
 *
 * `NULL` is a row written before B34, when progress and payment were the same
 * number — so it coalesces to `qp_awarded`. Every read of "how much CP" goes
 * through this expression; there is no second definition anywhere.
 */
/**
 * Exported for the wallet (B18), which has to sum the same number the rest of
 * the product does. A second definition of "how much CP did this pay" is how a
 * wallet and a leaderboard end up disagreeing.
 */
export const CP_PAID_SQL = sql<number>`COALESCE(${schema.questEvents.cpAwarded}, ${schema.questEvents.qpAwarded})`;

/** The one ceiling, from settings, with the model's default when unset. */
export async function dailyCpCeiling(db: DB): Promise<number> {
  try {
    const [row] = await db.select({ value: schema.platformSettings.value })
      .from(schema.platformSettings)
      .where(eq(schema.platformSettings.key, "quests.dailyCpCeiling")).limit(1);
    const n = Number((row?.value as { cp?: number } | null)?.cp);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY_CP_CEILING;
  } catch { return DEFAULT_DAILY_CP_CEILING; }
}

/** How much CP this gamer has already been credited today (UTC). */
export async function cpEarnedToday(db: DB, userId: string): Promise<number> {
  try {
    const [row] = await db.select({ n: sql<number>`COALESCE(SUM(${CP_PAID_SQL}), 0)` })
      .from(schema.questEvents)
      .where(and(eq(schema.questEvents.userId, userId), gte(schema.questEvents.createdAt, startOfUtcDay())));
    return Number(row?.n ?? 0);
  } catch { return 0; }
}

/**
 * Credit an action: **CP once, progress everywhere** (B34.2).
 *
 * This used to pay every quest listening to an action, with the daily cap stored
 * per quest — so pointing two quests at `ad_impression` doubled both the payout
 * and the ceiling. That is a silent multiplier on cost, and it is one an admin
 * could switch on by accident from a screen that says nothing about money.
 *
 * The two ideas are now separate:
 *   - **CP is credited once per action**, to the first quest that records it,
 *     against a single global daily ceiling.
 *   - **Progress is credited to every listening quest**, so one action can still
 *     advance two quests — which is the feature the old behaviour was reaching
 *     for.
 *
 * Nothing anybody wanted is lost, and the multiplier is gone.
 *
 * The ceiling is checked once, before the loop, and the payment is clamped to
 * what is left of it — so the last award of the day pays the remainder rather
 * than being refused outright. Progress keeps counting past the ceiling: it is
 * already bounded by the per-quest caps, and stopping it would mean a tier badge
 * silently depends on how much CP somebody happened to earn that morning.
 *
 * Dedup + daily caps are still enforced per (user, quest, action, ref).
 */
export async function awardQuestAction(
  db: DB, userId: string, actionKey: QuestActionKey, ref?: { refType?: string; refId?: string },
): Promise<void> {
  // B74. The ceiling used to be read here and written to a few lines later on
  // the HTTP driver, which cannot hold a transaction — so two awards landing
  // together both read the same "already earned today", both found the same
  // room under 500, and both paid. The daily ceiling IS the cost model, so a
  // race on it is a race on the only number that keeps a gamer's cost bounded.
  //
  // Everything below now runs inside one transaction on the pooled driver,
  // behind a lock on this gamer's own row. Two gamers never wait on each other;
  // two awards for the SAME gamer are serialized, which is exactly the scope of
  // the invariant being protected.
  //
  // `db` is the caller's handle. In production the work moves to the pooled
  // connection; in demo mode `withTx` transacts on this very handle, because
  // PGlite is one in-process database and re-entering `getDb()` here deadlocks
  // against the boot seed that awards CP while `getDb()` is still resolving.
  try {
    await withTx(db, async (tx) => {
      await lockGamer(tx, userId);
      await awardQuestActionLocked(tx, userId, actionKey, ref);
    });
  } catch (e) {
    // Gamification must never block the real action underneath it — a gamer who
    // joined a challenge joined it, whatever the ledger did. But the report's
    // finding was that a bare `catch {}` made a failed write indistinguishable
    // from a successful one, so this one is narrow and it SAYS SO.
    console.error(`[cp] award failed: user=${userId} action=${actionKey}`, e);
  }
}

/**
 * May this gamer earn at all? B72.4.
 *
 * Checked INSIDE the lock, with everything else, rather than at each of the
 * twenty-odd call sites — a gate that has to be remembered at every emitter is
 * a gate that will be forgotten at one of them, and the one it is forgotten at
 * will be the one that pays a child.
 *
 * Unset earns nothing and there is NO BACKFILL: actions taken before somebody
 * answers pay zero, permanently. That is the incentive to answer early, and it
 * is why the action is still logged below — nothing should look like it
 * vanished.
 */
async function mayEarn(db: DB, userId: string): Promise<boolean> {
  const [u] = await db.select({ band: schema.users.ageBand })
    .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const { rulesFor, parseBand } = await import("@/lib/age");
  return rulesFor(parseBand(u?.band)).earn;
}

/** The body, with the lock already held. Every read below is inside the transaction. */
async function awardQuestActionLocked(
  db: DB, userId: string, actionKey: QuestActionKey, ref?: { refType?: string; refId?: string },
): Promise<void> {
  {
    // The age gate, before anything is computed. B72.4.
    if (!(await mayEarn(db, userId))) return;

    const activeQuests = await db.select().from(schema.quests).where(eq(schema.quests.isActive, true));
    const listening = activeQuests.filter((q) => Number((q.actionWeights as Record<string, number>)[actionKey] ?? 0) > 0)
      // Stable order, so "the quest that gets paid" is the same on every run and
      // in every environment rather than whatever the planner returned.
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id));
    if (listening.length === 0) return;

    const [ceiling, already] = await Promise.all([dailyCpCeiling(db), cpEarnedToday(db, userId)]);
    let room = Math.max(0, ceiling - already);
    // Set the moment any quest records this action, so the second listener pays
    // nothing however it is ordered.
    let paid = false;

    for (const quest of listening) {
      const weight = Number((quest.actionWeights as Record<string, number>)[actionKey] ?? 0);
      if (weight <= 0) continue;
      const cap = Number((quest.dailyCaps as Record<string, number>)[actionKey] ?? 0);

      if (cap > 0) {
        const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(schema.questEvents)
          .where(and(eq(schema.questEvents.userId, userId), eq(schema.questEvents.questId, quest.id),
            eq(schema.questEvents.actionKey, actionKey), gte(schema.questEvents.createdAt, startOfUtcDay())));
        if (Number(c) >= cap) continue;
      }

      // Dedup: skip if this exact (quest, action, ref) was already counted.
      const refType = ref?.refType ?? "";
      const refId = ref?.refId ?? "";
      const [dupe] = await db.select({ id: schema.questEvents.id }).from(schema.questEvents).where(and(
        eq(schema.questEvents.userId, userId), eq(schema.questEvents.questId, quest.id),
        eq(schema.questEvents.actionKey, actionKey), eq(schema.questEvents.refType, refType), eq(schema.questEvents.refId, refId),
      )).limit(1);
      if (dupe) continue;
      const cp = paid ? 0 : Math.min(weight, room);
      paid = true;
      room -= cp;
      await db.insert(schema.questEvents).values({
        id: uid(), userId, questId: quest.id, actionKey, qpAwarded: weight, cpAwarded: cp, refType, refId,
      }).onConflictDoNothing();

      // Bump QP.
      await db.insert(schema.userQuestProgress).values({ userId, questId: quest.id, qp: weight })
        .onConflictDoUpdate({
          target: [schema.userQuestProgress.userId, schema.userQuestProgress.questId],
          set: { qp: sql`${schema.userQuestProgress.qp} + ${weight}`, updatedAt: new Date() },
        });

      await unlockTiers(db, userId, quest.id, quest.name);
      await maybeCompleteQuest(db, userId, quest.id, quest.name);
    }
  }
}

// When current-cycle QP passes the top tier, the quest is "completed": award a
// completion (badge ×N), bank the CP into lifetimeQp, and re-enroll by carrying
// the remainder into a fresh cycle — so total CP keeps stacking forever.
async function maybeCompleteQuest(db: DB, userId: string, questId: string, questName: string) {
  const [prog] = await db.select({ qp: schema.userQuestProgress.qp }).from(schema.userQuestProgress)
    .where(and(eq(schema.userQuestProgress.userId, userId), eq(schema.userQuestProgress.questId, questId))).limit(1);
  const [top] = await db.select({ t: schema.questTiers.thresholdQp }).from(schema.questTiers)
    .where(and(eq(schema.questTiers.questId, questId), eq(schema.questTiers.isActive, true)))
    .orderBy(desc(schema.questTiers.thresholdQp)).limit(1);
  const maxThreshold = Number(top?.t ?? 0);
  let qp = prog?.qp ?? 0;
  if (maxThreshold <= 0 || qp < maxThreshold) return;

  let completed = 0;
  while (qp >= maxThreshold) { qp -= maxThreshold; completed++; }
  await db.update(schema.userQuestProgress)
    .set({ qp, completions: sql`${schema.userQuestProgress.completions} + ${completed}`, lifetimeQp: sql`${schema.userQuestProgress.lifetimeQp} + ${maxThreshold * completed}`, updatedAt: new Date() })
    .where(and(eq(schema.userQuestProgress.userId, userId), eq(schema.userQuestProgress.questId, questId)));
  await db.insert(schema.notifications).values({
    id: uid(), userId, type: "badge",
    title: `Quest complete: ${questName}`,
    body: `You finished ${questName}${completed > 1 ? ` ×${completed}` : ""} — re-enrolled from the start, and your total CP keeps stacking.`,
    href: "/quests",
  });
}

// Award any tier badges the user's current QP now clears.
async function unlockTiers(db: DB, userId: string, questId: string, questName: string) {
  const [prog] = await db.select({ qp: schema.userQuestProgress.qp }).from(schema.userQuestProgress)
    .where(and(eq(schema.userQuestProgress.userId, userId), eq(schema.userQuestProgress.questId, questId))).limit(1);
  const qp = prog?.qp ?? 0;
  const tiers = await db.select().from(schema.questTiers)
    .where(and(eq(schema.questTiers.questId, questId), eq(schema.questTiers.isActive, true)));
  const earned = tiers.filter((t) => qp >= t.thresholdQp);
  if (earned.length === 0) return;

  const already = await db.select({ id: schema.userQuestTiers.questTierId }).from(schema.userQuestTiers)
    .where(and(eq(schema.userQuestTiers.userId, userId), inArray(schema.userQuestTiers.questTierId, earned.map((t) => t.id))));
  const have = new Set(already.map((r) => r.id));
  for (const t of earned) {
    if (have.has(t.id)) continue;
    await db.insert(schema.userQuestTiers).values({ id: uid(), userId, questTierId: t.id }).onConflictDoNothing();
    await db.insert(schema.notifications).values({
      id: uid(), userId, type: "badge",
      title: `${t.name} unlocked in ${questName}!`,
      body: t.description, href: "/quests",
    });
  }
}

// ===== Read models =====
export type QuestGamer = { name: string; slug: string; avatarUrl: string | null; qp?: number };
export type QuestTierView = { id: string; name: string; description: string; thresholdQp: number; iconUrl: string | null; color: string | null; mapX: number; mapY: number; earned: boolean; holders: number };
export type QuestView = {
  id: string; key: string; name: string; tagline: string; lore: string; color: string; accent2: string; icon: string;
  logoUrl: string | null; cardBgUrl: string | null; coverUrl: string | null; mapArtUrl: string | null;
  mapVideoUrl: string | null;
  mapGlbUrl: string | null;
  mapGlbCfg: import("@/lib/quest-game").MapGlbCfg | null;
  pathPoints: { x: number; y: number }[] | null;
  pathPointsMobile: { x: number; y: number }[] | null;
  qp: number; tiers: QuestTierView[]; currentTierIndex: number; nextTier: QuestTierView | null;
  completions: number; totalCp: number;
  // The quest's scoring rules (action → CP + daily cap), ready for the game UI.
  rules: QuestRule[];
  // Admin-edited starter missions + per-panel game-screen overrides.
  missions: MissionConfig[] | null;
  gameUi: QuestGameUi | null;
};

async function tierHolderCountMap(db: DB, tierIds: string[]): Promise<Map<string, number>> {
  if (tierIds.length === 0) return new Map();
  const rows = await db.select({ tierId: schema.userQuestTiers.questTierId, c: sql<number>`count(*)` })
    .from(schema.userQuestTiers).where(inArray(schema.userQuestTiers.questTierId, tierIds)).groupBy(schema.userQuestTiers.questTierId);
  return new Map(rows.map((r) => [r.tierId, Number(r.c)]));
}

/**
 * The quest views, once per (request, gamer) — B55.2.
 *
 * Four queries: quests, tiers, progress, and the holder counts joined to users.
 * `FloatingOrbs` is in the GLOBAL chrome, so every page in the product paid
 * those four — including admin pages that show no quest at all — and any page
 * that also renders quests paid them twice. Measurement put this quartet at the
 * top of every surface once `platform_settings` was fixed.
 *
 * `db` is a process singleton so it is a stable cache key; the identity that
 * actually varies is the gamer.
 */
const questsFor = cache(async (db: DB, userId: string | null): Promise<QuestView[]> =>
  getUserQuestsUncached(db, userId));

export function getUserQuests(db: DB, userId: string | null): Promise<QuestView[]> {
  return questsFor(db, userId);
}

async function getUserQuestsUncached(db: DB, userId: string | null): Promise<QuestView[]> {
  const quests = await db.select().from(schema.quests).where(eq(schema.quests.isActive, true)).orderBy(schema.quests.sortOrder);
  if (quests.length === 0) return [];
  const questIds = quests.map((q) => q.id);
  const [tiers, progress] = await Promise.all([
    db.select().from(schema.questTiers).where(and(inArray(schema.questTiers.questId, questIds), eq(schema.questTiers.isActive, true))),
    userId ? db.select().from(schema.userQuestProgress).where(and(eq(schema.userQuestProgress.userId, userId), inArray(schema.userQuestProgress.questId, questIds))) : Promise.resolve([]),
  ]);
  const holders = await tierHolderCountMap(db, tiers.map((t) => t.id));
  const progByQuest = new Map(progress.map((p) => [p.questId, p]));

  return quests.map((q) => {
    const p = progByQuest.get(q.id);
    const qp = p?.qp ?? 0;
    const weights = (q.actionWeights ?? {}) as Record<string, number>;
    const caps = (q.dailyCaps ?? {}) as Record<string, number>;
    const rules: QuestRule[] = Object.entries(weights)
      .filter(([, v]) => Number(v) > 0)
      .map(([k, v]) => ({ key: k, label: ACTION_LABEL[k] ?? k, points: Number(v), cap: Number(caps[k]) > 0 ? Number(caps[k]) : undefined }))
      .sort((a, b) => b.points - a.points);
    // "Earned" reflects the CURRENT cycle (re-enroll resets the map); lifetime
    // achievements are the quest badges (completions) shown on the profile.
    const qTiers = tiers.filter((t) => t.questId === q.id).sort((a, b) => a.tierIndex - b.tierIndex)
      .map((t): QuestTierView => ({ id: t.id, name: t.name, description: t.description, thresholdQp: t.thresholdQp, iconUrl: t.iconUrl, color: t.color, mapX: t.mapX, mapY: t.mapY, earned: qp >= t.thresholdQp, holders: holders.get(t.id) ?? 0 }));
    const currentTierIndex = qTiers.reduce((acc, t, i) => (qp >= t.thresholdQp ? i : acc), -1);
    const nextTier = qTiers.find((t) => qp < t.thresholdQp) ?? null;
    const completions = p?.completions ?? 0;
    return {
      id: q.id, key: q.key, name: q.name, tagline: q.tagline, lore: q.lore, color: q.color, accent2: q.accent2, icon: q.icon,
      logoUrl: q.logoUrl, cardBgUrl: q.cardBgUrl, coverUrl: q.coverUrl, mapArtUrl: q.mapArtUrl,
      mapVideoUrl: q.mapVideoUrl,
      mapGlbUrl: q.mapGlbUrl,
      mapGlbCfg: (q.mapGlbCfg ?? null) as import("@/lib/quest-game").MapGlbCfg | null,
      pathPoints: Array.isArray(q.pathPoints) && q.pathPoints.length >= 2 ? q.pathPoints : null,
      pathPointsMobile: Array.isArray(q.pathPointsMobile) && q.pathPointsMobile.length >= 2 ? q.pathPointsMobile : null,
      qp, tiers: qTiers, currentTierIndex, nextTier,
      completions, totalCp: (p?.lifetimeQp ?? 0) + qp,
      rules,
      missions: Array.isArray(q.missionsConfig) && q.missionsConfig.length ? (q.missionsConfig as MissionConfig[]) : null,
      gameUi: (q.gameUi ?? null) as QuestGameUi | null,
    };
  });
}

// How many completion badges a gamer holds for a single quest (0 if none).
export async function getQuestCompletions(db: DB, userId: string, questId: string): Promise<number> {
  const [row] = await db.select({ c: schema.userQuestProgress.completions }).from(schema.userQuestProgress)
    .where(and(eq(schema.userQuestProgress.userId, userId), eq(schema.userQuestProgress.questId, questId))).limit(1);
  return Number(row?.c ?? 0);
}

// A gamer's TOTAL Cluster Points across all quests (lifetime + current cycles).
export async function getTotalCp(db: DB, userId: string | null): Promise<number> {
  if (!userId) return 0;
  // Summed from the EVENT ledger, not from quest progress (B34.2). Progress is
  // now credited to every listening quest while CP is credited once, so
  // `qp + lifetimeQp` across quests double-counts by exactly the multiplier this
  // item removed. The ledger is append-only and its rollover preserves the
  // total, so before the split the two agreed — this is the same number, read
  // from the side that stayed true.
  const [row] = await db.select({ c: sql<number>`COALESCE(SUM(${CP_PAID_SQL}), 0)` })
    .from(schema.questEvents).where(eq(schema.questEvents.userId, userId));
  return Number(row?.c ?? 0);
}

/**
 * What is capped out today, stated plainly (B17).
 *
 * B17's rule is **no interruption, full disclosure**. Nothing blocks and nothing
 * warns when a cap is reached — the post still posts, the ad still counts as an
 * impression for the brand, it simply stops earning. A gamer who is told they
 * have hit a limit feels metered; one who is not told feels nothing and comes
 * back tomorrow.
 *
 * But it is never hidden either. This is what the disclosure reads from: how
 * many times each action paid today, against its cap, plus the global ceiling
 * and when the whole thing resets. Somebody who goes looking finds the exact
 * figure and the reset; somebody who does not is never interrupted.
 */
export type CapStatus = {
  key: string; label: string; questName: string; color: string;
  used: number; cap: number; maxed: boolean;
};
export type CapsToday = {
  actions: CapStatus[];
  earned: number;
  ceiling: number;
  ceilingHit: boolean;
  /** UTC midnight, when every count below goes back to zero. */
  resetsAt: string;
};

export async function capsToday(db: DB, userId: string | null): Promise<CapsToday> {
  const reset = startOfUtcDay();
  reset.setUTCDate(reset.getUTCDate() + 1);
  const empty: CapsToday = { actions: [], earned: 0, ceiling: DEFAULT_DAILY_CP_CEILING, ceilingHit: false, resetsAt: reset.toISOString() };
  if (!userId) return empty;
  try {
    const [ceiling, earned] = await Promise.all([dailyCpCeiling(db), cpEarnedToday(db, userId)]);
    // One grouped read rather than one per action.
    const counts = await db.select({
      questId: schema.questEvents.questId,
      actionKey: schema.questEvents.actionKey,
      n: sql<number>`COUNT(*)`,
    }).from(schema.questEvents)
      .where(and(eq(schema.questEvents.userId, userId), gte(schema.questEvents.createdAt, startOfUtcDay())))
      .groupBy(schema.questEvents.questId, schema.questEvents.actionKey);
    if (counts.length === 0) return { ...empty, ceiling, earned, ceilingHit: ceiling > 0 && earned >= ceiling };

    const quests = await db.select().from(schema.quests)
      .where(inArray(schema.quests.id, [...new Set(counts.map((c) => c.questId))]));
    const byId = new Map(quests.map((q) => [q.id, q]));
    const actions: CapStatus[] = [];
    for (const c of counts) {
      const q = byId.get(c.questId);
      if (!q) continue;
      const cap = Number((q.dailyCaps as Record<string, number>)[c.actionKey] ?? 0);
      if (cap <= 0) continue;   // uncapped: there is no figure to disclose
      const used = Number(c.n);
      actions.push({
        key: c.actionKey, label: ACTION_LABEL[c.actionKey] ?? c.actionKey,
        questName: q.name, color: q.color, used, cap, maxed: used >= cap,
      });
    }
    // Maxed first — the whole reason somebody opens this.
    actions.sort((a, b) => Number(b.maxed) - Number(a.maxed) || b.used / b.cap - a.used / a.cap);
    return { actions, earned, ceiling, ceilingHit: ceiling > 0 && earned >= ceiling, resetsAt: reset.toISOString() };
  } catch { return empty; }
}

// ===== CP ledger (history log) =====
export type CpLedgerEntry = {
  id: string; questId: string; questKey: string; questName: string; color: string; logoUrl: string | null;
  actionKey: string; label: string; qp: number; at: string;
};
// Every CP award for a gamer (when + why), newest first. Optionally scoped to
// one quest. Backed by questEvents; the "why" comes from the action label.
export async function getCpLedger(db: DB, userId: string | null, opts?: { questId?: string; limit?: number }): Promise<CpLedgerEntry[]> {
  if (!userId) return [];
  const wheres = [eq(schema.questEvents.userId, userId)];
  if (opts?.questId) wheres.push(eq(schema.questEvents.questId, opts.questId));
  const rows = await db.select({
    id: schema.questEvents.id, questId: schema.questEvents.questId, actionKey: schema.questEvents.actionKey,
    qp: CP_PAID_SQL, at: schema.questEvents.createdAt,
    key: schema.quests.key, name: schema.quests.name, color: schema.quests.color, logoUrl: schema.quests.logoUrl,
  }).from(schema.questEvents).innerJoin(schema.quests, eq(schema.questEvents.questId, schema.quests.id))
    .where(and(...wheres)).orderBy(desc(schema.questEvents.createdAt)).limit(opts?.limit ?? 120);
  // This is the MONEY log, so rows that paid nothing are not in it. A second
  // quest advancing on the same action is real progress and shows on that
  // quest's own bar; listing it here as "0 CP" would read as a bug to the one
  // person most likely to be counting.
  return rows.filter((r) => Number(r.qp) > 0).map((r) => ({
    id: r.id, questId: r.questId, questKey: r.key, questName: r.name, color: r.color, logoUrl: r.logoUrl,
    actionKey: r.actionKey, label: ACTION_LABEL[r.actionKey] ?? r.actionKey, qp: r.qp, at: r.at.toISOString(),
  }));
}

// ===== Guided starter missions =====
// When the gamer FIRST did each of the onboarding actions (connect an account,
// join a planet, join a challenge, see an ad). Null = not yet — the game shows
// a red dot and walks them there. Sources are the real tables (so it's accurate
// even if the action pre-dates the CP ledger), ads come from the quest events.
export async function getStarterMissions(db: DB, userId: string | null): Promise<StarterMissions> {
  const none: StarterMissions = { connectAt: null, planetAt: null, challengeAt: null, adCount: 0, adDates: [] };
  if (!userId) return none;
  const iso = (d: unknown): string | null => {
    if (!d) return null;
    const dd = new Date(d as string | Date);
    return isNaN(+dd) ? null : dd.toISOString();
  };
  try {
    const adWhere = and(eq(schema.questEvents.userId, userId), inArray(schema.questEvents.actionKey, ["ad_impression", "ad_click"]));
    const [[acct], [planet], [chall], adRows, [adCountRow]] = await Promise.all([
      db.select({ at: sql<Date | null>`MIN(${schema.linkedGameAccounts.createdAt})` })
        .from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.userId, userId)),
      db.select({ at: sql<Date | null>`MIN(${schema.spaceMembers.joinedAt})` })
        .from(schema.spaceMembers).where(eq(schema.spaceMembers.userId, userId)),
      db.select({ at: sql<Date | null>`MIN(${schema.challengeParticipants.joinedAt})` })
        .from(schema.challengeParticipants).where(eq(schema.challengeParticipants.userId, userId)),
      // The earliest ad events (oldest first) so any admin-set threshold N can
      // resolve "the moment the Nth ad was seen" exactly.
      db.select({ at: schema.questEvents.createdAt }).from(schema.questEvents)
        .where(adWhere).orderBy(schema.questEvents.createdAt).limit(30),
      db.select({ c: sql<number>`count(*)` }).from(schema.questEvents).where(adWhere),
    ]);
    return {
      connectAt: iso(acct?.at), planetAt: iso(planet?.at), challengeAt: iso(chall?.at),
      adCount: Number(adCountRow?.c ?? 0),
      adDates: adRows.map((r) => iso(r.at)).filter((d): d is string => !!d),
    };
  } catch { return none; }
}

// Top questers per quest (CP leaderboard), keyed by quest id.
export async function getQuestTops(db: DB, questIds: string[], perQuest = 8): Promise<Map<string, QuestGamer[]>> {
  const out = new Map<string, QuestGamer[]>();
  if (questIds.length === 0) return out;
  const rows = await db.select({ questId: schema.userQuestProgress.questId, qp: schema.userQuestProgress.qp, name: schema.users.displayName, slug: schema.users.slug, avatarUrl: schema.users.avatarUrl })
    .from(schema.userQuestProgress).innerJoin(schema.users, eq(schema.userQuestProgress.userId, schema.users.id))
    .where(and(inArray(schema.userQuestProgress.questId, questIds), eq(schema.users.status, "active")))
    .orderBy(desc(schema.userQuestProgress.qp)).limit(perQuest * questIds.length);
  for (const r of rows) {
    const list = out.get(r.questId) ?? [];
    if (list.length < perQuest) { list.push({ name: r.name, slug: r.slug, avatarUrl: r.avatarUrl, qp: r.qp }); out.set(r.questId, list); }
  }
  return out;
}

// Full detail for one quest's standalone page: the view, who reached each tier
// (map step), and the quest's CP leaderboard — plus the light list of all
// quests for the hero toggle.
export async function getQuestByKey(db: DB, key: string, userId: string | null) {
  const all = await getUserQuests(db, userId);
  const quest = all.find((q) => q.key === key);
  if (!quest) return null;
  const tierIds = quest.tiers.map((t) => t.id);
  const [holderRows, tops] = await Promise.all([
    tierIds.length ? db.select({ tierId: schema.userQuestTiers.questTierId, name: schema.users.displayName, slug: schema.users.slug, avatarUrl: schema.users.avatarUrl, at: schema.userQuestTiers.awardedAt })
      .from(schema.userQuestTiers).innerJoin(schema.users, eq(schema.userQuestTiers.userId, schema.users.id))
      .where(and(inArray(schema.userQuestTiers.questTierId, tierIds), eq(schema.users.status, "active")))
      .orderBy(desc(schema.userQuestTiers.awardedAt)).limit(200) : Promise.resolve([]),
    getQuestTops(db, [quest.id], 20),
  ]);
  const tierHolders: Record<string, QuestGamer[]> = {};
  for (const r of holderRows) {
    const list = tierHolders[r.tierId] ?? [];
    if (list.length < 12) { list.push({ name: r.name, slug: r.slug, avatarUrl: r.avatarUrl }); tierHolders[r.tierId] = list; }
  }
  return { quest, allQuests: all, tierHolders, leaderboard: tops.get(quest.id) ?? [] };
}

// Lean quest summary for the nav bar — name, CP, art and progress-to-next-tier
// only (no tier-holder counts), so it's cheap enough to run on every page.
export type NavQuest = { key: string; name: string; color: string; accent2: string; qp: number; art: string | null; logoUrl: string | null; pct: number; nextName: string; earned: boolean };
export async function getNavQuests(db: DB, userId: string | null, limit = 4): Promise<NavQuest[]> {
  const quests = await db.select().from(schema.quests).where(eq(schema.quests.isActive, true)).orderBy(schema.quests.sortOrder).limit(limit);
  if (quests.length === 0) return [];
  const ids = quests.map((q) => q.id);
  const [tiers, progress, seenRow] = await Promise.all([
    db.select().from(schema.questTiers).where(and(inArray(schema.questTiers.questId, ids), eq(schema.questTiers.isActive, true))),
    userId ? db.select().from(schema.userQuestProgress).where(and(eq(schema.userQuestProgress.userId, userId), inArray(schema.userQuestProgress.questId, ids))) : Promise.resolve([]),
    userId ? db.select({ feedPrefs: schema.users.feedPrefs }).from(schema.users).where(eq(schema.users.id, userId)).limit(1) : Promise.resolve([]),
  ]);
  const qpBy = new Map(progress.map((p) => [p.questId, p.qp]));
  // "Seen" CP per quest (persisted in feedPrefs.questSeen) — a quest shows a red
  // dot when the gamer has earned CP in it since they last opened the quest menu.
  const seen = (((seenRow[0]?.feedPrefs ?? {}) as { questSeen?: Record<string, number> }).questSeen) ?? {};
  return quests.map((q) => {
    const qp = qpBy.get(q.id) ?? 0;
    const qTiers = tiers.filter((t) => t.questId === q.id).sort((a, b) => a.tierIndex - b.tierIndex);
    const next = qTiers.find((t) => qp < t.thresholdQp);
    const prevT = [...qTiers].reverse().find((t) => qp >= t.thresholdQp)?.thresholdQp ?? 0;
    const span = next ? next.thresholdQp - prevT : 1;
    const pct = next ? Math.max(4, Math.min(100, Math.round(((qp - prevT) / span) * 100))) : 100;
    return { key: q.key, name: q.name, color: q.color, accent2: q.accent2, qp, art: q.mapArtUrl || q.cardBgUrl || null, logoUrl: q.logoUrl, pct, nextName: next?.name ?? "Max", earned: !!userId && qp > (seen[q.key] ?? 0) };
  });
}

// Leaderboard: how many gamers have unlocked each quest's tiers, top questers.
export async function getQuestLeaderboards(db: DB) {
  const quests = await db.select().from(schema.quests).where(eq(schema.quests.isActive, true)).orderBy(schema.quests.sortOrder);
  if (quests.length === 0) return [];
  const questIds = quests.map((q) => q.id);
  const [tiers, tierCounts, topRows] = await Promise.all([
    db.select().from(schema.questTiers).where(inArray(schema.questTiers.questId, questIds)),
    db.select({ tierId: schema.userQuestTiers.questTierId, c: sql<number>`count(*)` }).from(schema.userQuestTiers).groupBy(schema.userQuestTiers.questTierId),
    db.select({ questId: schema.userQuestProgress.questId, userId: schema.userQuestProgress.userId, qp: schema.userQuestProgress.qp, name: schema.users.displayName, slug: schema.users.slug, avatarUrl: schema.users.avatarUrl })
      .from(schema.userQuestProgress).innerJoin(schema.users, eq(schema.userQuestProgress.userId, schema.users.id))
      .where(eq(schema.users.status, "active")).orderBy(desc(schema.userQuestProgress.qp)).limit(200),
  ]);
  const countByTier = new Map(tierCounts.map((r) => [r.tierId, Number(r.c)]));
  return quests.map((q) => {
    const qTiers = tiers.filter((t) => t.questId === q.id).sort((a, b) => a.tierIndex - b.tierIndex);
    const top = topRows.filter((r) => r.questId === q.id).slice(0, 10);
    return {
      quest: q,
      tiers: qTiers.map((t) => ({ id: t.id, name: t.name, thresholdQp: t.thresholdQp, holders: countByTier.get(t.id) ?? 0 })),
      top,
    };
  });
}
