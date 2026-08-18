// The Challenges family — this week · one challenge · join · standings ·
// my entries.
//
// This is the family the whole product exists to produce. 01-CYCLE's nine-step
// gamer view is steps 1, 2, 4, 6 and 7, and every one of them is a card here.
//
// ===== NOTHING IN THIS FILE DECIDES ANYTHING =====
//
// `enterChallenge` holds the eight-guard entry chain, in order, with ownership
// checked before rank (R8). `standingsOf` is the only implementation of a
// score. This file picks words and buttons. A join screen that pre-checked a
// guard to be helpful would be a second implementation of it — and the one that
// disagrees is always the one on the surface most people use.

import { ButtonStyle } from "../types.ts";
import { frame, navButton, backButton, linkButton, actionId, button } from "../components.ts";
import { siteUrl } from "../config.ts";
import { screen } from "../interactions.ts";
import { cardReply } from "./card.ts";
import { homeTail } from "./home.ts";
import { challengeCard, standingsCard } from "../../cards/specs.ts";
import { formatMoney } from "../../money/amounts.ts";

screen("challenges", async ({ trail }) => {
  const { liveChallenges, nextWeekChallenges } = await import("../../site/queries.ts");
  const now = new Date();
  const live = await liveChallenges(now);
  const next = await nextWeekChallenges(now);
  const shown = [...live, ...next].slice(0, 6);

  return cardReply(
    {
      title: live.length ? "Live this week" : "Next week",
      subtitle: live.length
        ? `${live.length} running · ${next.length} announced for next week`
        : "Nothing is running right now. These are announced and joinable already.",
      rows: shown.map((c) => ({
        label: c.title,
        value: `${c.game} · ${formatMoney(c.prizePoolCents)}`,
      })),
      // C7/L8 — a paid future challenge is joinable now and scores from the
      // gun, which is why next week's are on this card rather than hidden.
      footer: "Join before Monday and nothing you played beforehand counts",
    },
    {
      buttons: [
        ...shown.slice(0, 5).map((c) => navButton(c.title.slice(0, 40), frame("challenge", c.id), trail)),
        ...homeTail(trail),
      ],
    },
  );
});

screen("challenge", async ({ frame: f, trail }) => {
  const id = f.args[0];
  const { challengeDetail } = await import("../../site/queries.ts");
  const now = new Date();
  const detail = id ? await challengeDetail(id, now) : null;

  if (!detail) {
    return cardReply(
      { title: "That challenge has gone", footer: "Try this week's list." },
      { textOnly: true, buttons: [...homeTail(trail)] },
    );
  }

  const { challenge, standings } = detail;
  const spec = challengeCard(
    {
      title: challenge.title,
      game: challenge.game,
      state: challenge.state,
      prizePoolCents: challenge.prizePoolCents,
      entrants: standings.length,
      endAt: challenge.endAt,
      community:
        challenge.visibility === "community"
          ? { serverName: await serverNameOf(challenge.guildId) }
          : null,
    },
    now,
  );

  // R6 — a gate is stated **before** joining, with the range in words. A gamer
  // refused after pressing Join learned something they could have been told.
  if (challenge.rankMin || challenge.rankMax) {
    spec.rows = [
      ...(spec.rows ?? []),
      {
        label: "Rank gate",
        value: `${challenge.rankMin ?? "any"} to ${challenge.rankMax ?? "any"}, ${challenge.queue ?? "solo"} queue`,
      },
    ];
  }

  const joinable = challenge.state === "announced" || challenge.state === "live";

  return cardReply(spec, {
    buttons: [
      joinable
        ? button("Join", actionId("join", [challenge.id], trail), ButtonStyle.Primary, "🎮")
        : null,
      navButton("Standings", frame("standings", challenge.id), trail),
      linkButton("On the web", `${siteUrl()}/challenges/${challenge.id}`),
      ...homeTail(trail),
    ],
  });
});

/**
 * Join. **Every refusal is the module's own words**, unedited.
 *
 * 06 §1's refusal table asks for exactly this: which of the three onboarding
 * steps is missing, *their* rank and the range, which account they already
 * entered on. A card that softened any of those into "you cannot join" would
 * be a card somebody has to open a support thread about.
 */
screen("join", async ({ frame: f, trail, presser }) => {
  const challengeId = f.args[0];
  const { getDb } = await import("../../db/index.ts");
  const { enterChallenge } = await import("../../challenges/entry.ts");

  if (!presser.userId || !challengeId) {
    return cardReply(
      { title: "We could not tell who you are", footer: "Try /cluster and start again." },
      { textOnly: true, ephemeral: true, buttons: [...homeTail(trail)] },
    );
  }

  const db = await getDb();
  const result = await enterChallenge(db, {
    challengeId,
    userId: presser.userId,
    // A4 — **where they pressed Join**, which is half the entrant credit. The
    // other half is the parent, frozen onto the entry at the same instant as
    // the baseline. Neither is decided here.
    guildId: presser.guildId ?? undefined,
  });

  if (!result.ok) {
    return cardReply(
      { title: "Not this time", subtitle: result.reason, footer: REFUSAL_FOOTER[result.code] ?? "" },
      {
        textOnly: true,
        ephemeral: true,
        buttons: [
          result.code === "onboarding" || result.code === "no_account"
            ? navButton("Link a game account", frame("games"), trail, ButtonStyle.Primary)
            : null,
          result.code === "unproven"
            ? navButton("Prove ownership", frame("prove"), trail, ButtonStyle.Primary)
            : null,
          ...homeTail(trail),
        ],
      },
    );
  }

  return cardReply(
    {
      title: "You're in",
      // B4 — a late joiner is told, in the module's words, that scoring starts
      // now and how long is left. It is not a refusal and must not read as one.
      subtitle: result.notice ?? "Scoring starts Monday.",
      footer: "Play the game you were going to play. We read the rest",
    },
    {
      textOnly: true,
      ephemeral: true,
      buttons: [
        navButton("Standings", frame("standings", challengeId), trail),
        ...homeTail(trail),
      ],
    },
  );
});

const REFUSAL_FOOTER: Record<string, string> = {
  onboarding: "Three things: your age band, your country, and a game account.",
  unproven: "This game lets us check the account is yours, so we do.",
  same_account: "One game account belongs to one gamer. That is what stops one person scoring twice.",
  rank_below: "The range is stated on the challenge before you join.",
  rank_above: "The range is stated on the challenge before you join.",
};

screen("standings", async ({ frame: f, trail }) => {
  const id = f.args[0];
  const { challengeDetail } = await import("../../site/queries.ts");
  const now = new Date();
  const detail = id ? await challengeDetail(id, now) : null;
  if (!detail) {
    return cardReply(
      { title: "That challenge has gone" },
      { textOnly: true, buttons: [...homeTail(trail)] },
    );
  }

  const { getDb, schema } = await import("../../db/index.ts");
  const { inArray } = await import("drizzle-orm");
  const db = await getDb();
  const ids = detail.standings.map((s) => s.participant.userId);
  const names = ids.length
    ? await db
        .select({ id: schema.users.id, displayName: schema.users.displayName })
        .from(schema.users)
        .where(inArray(schema.users.id, ids))
    : [];
  const nameOf = new Map(names.map((n) => [n.id, n.displayName]));

  return cardReply(
    standingsCard(
      {
        title: detail.challenge.title,
        endAt: detail.challenge.endAt,
        rows: detail.standings.map((s) => ({
          rank: s.place,
          name: nameOf.get(s.participant.userId) ?? "A gamer",
          points: s.points,
          // S4 — always counted and always shown, scored or not.
          matches: s.deltas.matches ?? 0,
        })),
      },
      now,
    ),
    {
      buttons: [
        navButton("The challenge", frame("challenge", detail.challenge.id), trail),
        ...homeTail(trail),
      ],
    },
  );
});

screen("entries", async ({ trail, presser }) => {
  if (!presser.userId) {
    return cardReply(
      { title: "Nothing yet" },
      { textOnly: true, buttons: [...homeTail(trail)] },
    );
  }
  const { myDashboard } = await import("../../site/queries.ts");
  const dashboard = await myDashboard(presser.userId);
  const entries = dashboard?.entries ?? [];

  return cardReply(
    {
      title: "Your challenges",
      subtitle: entries.length === 0 ? "None yet. This week's list is one press away." : undefined,
      rows: entries.slice(0, 8).map((e) => ({
        label: e.challenge.title,
        value: e.participant.placement ? `#${e.participant.placement}` : "in progress",
      })),
      footer: "ClusterGG",
    },
    {
      textOnly: true,
      buttons: [
        ...entries
          .slice(0, 4)
          .map((e) => navButton(e.challenge.title.slice(0, 40), frame("challenge", e.challenge.id), trail)),
        ...homeTail(trail),
      ],
    },
  );
});

/** C27 — the wording is always *"a community challenge run by this server"*. */
async function serverNameOf(guildId: string | null): Promise<string> {
  if (!guildId) return "this server";
  const { getDb, schema } = await import("../../db/index.ts");
  const { eq } = await import("drizzle-orm");
  const db = await getDb();
  const [guild] = await db
    .select({ name: schema.guilds.name })
    .from(schema.guilds)
    .where(eq(schema.guilds.guildId, guildId));
  return guild?.name ?? "this server";
}
