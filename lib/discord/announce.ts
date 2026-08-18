// The three announcements. 04 §4.
//
// | When | What | Where |
// |---|---|---|
// | On admin's click | A challenge is announced | Every server, or one if community |
// | **Friday** | **Winners, once.** The card names each winner's server | Every server |
// | **Saturday** | **Pool standings, once** | Every server |
//
// ===== ONCE EACH. A BOT THAT REPEATS ITSELF GETS MUTED =====
//
// And a muted bot is a dead distribution channel — which is the whole business,
// because we do not buy entrants with advertising. So each of the three is
// written to the post queue's **ledger** (`ledgerChallengeId` + `ledgerKind`),
// whose unique index makes a second send a no-op rather than a second card.
//
// ===== NOTHING FANS OUT INLINE (A3) =====
//
// Every one of these enqueues and returns. Even a community challenge going to
// one server goes through the queue, because "it is only one server" is how the
// per-guild loop came back three times on the old platform. The cron drains it
// every five minutes.
//
// ===== WHY THESE ARE EMBEDS AND NOT RENDERED PNGs =====
//
// An interaction reply can carry a file, because it is one message being edited
// once. An announcement is one row per guild in a queue whose payload is JSON,
// and rendering a 1200×630 PNG per guild at drain time would put an image
// pipeline on the path that has to deliver to every server on the platform. The
// embed carries the same words and the same artwork URL, and the queue stays a
// queue.

import { formatMoney } from "../money/amounts.ts";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { eq, and, isNull } from "drizzle-orm";
import { rows, navId, frame, linkButton, type Button } from "./components.ts";
import { siteUrl } from "./config.ts";
import { ButtonStyle } from "./types.ts";

/** Cluster's accent, so an announcement is recognisable at a glance. */
const ACCENT = 0x7c5cff;

export type AnnounceResult = { queued: number; guilds: number };

/** Every guild that can currently be posted to. */
async function postableGuilds(db: DB, only?: string[]) {
  const wanted = only ? new Set(only) : null;
  const guilds = await db.select().from(schema.guilds).where(isNull(schema.guilds.removedAt));
  return guilds.filter(
    (g) => Boolean(g.announceChannelId) && (!wanted || wanted.has(g.guildId)),
  );
}

/**
 * A challenge has been announced. **Admin pressed the button (C1/L1).**
 *
 * Never called by a job. `announce()` in the lifecycle refuses without an
 * actor, and this is the fan-out that follows it.
 */
export async function announceChallenge(
  db: DB,
  challengeId: string,
  only?: string[],
): Promise<AnnounceResult> {
  const { enqueuePosts } = await import("./post-queue.ts");

  const [challenge] = await db
    .select()
    .from(schema.challenges)
    .where(eq(schema.challenges.id, challengeId));
  if (!challenge) return { queued: 0, guilds: 0 };

  // C24/M25 — a community challenge is announced to **its own server only**,
  // and the wording is always *"a community challenge run by this server"*.
  const targets =
    challenge.visibility === "community"
      ? await postableGuilds(db, challenge.guildId ? [challenge.guildId] : [])
      : await postableGuilds(db, only);

  const entrants = await db
    .select({ id: schema.challengeParticipants.id })
    .from(schema.challengeParticipants)
    .where(eq(schema.challengeParticipants.challengeId, challengeId));

  const queued = await enqueuePosts(
    targets.map((guild) => ({
      channelId: guild.announceChannelId as string,
      guildId: guild.guildId,
      payload: {
        embeds: [
          {
            title: challenge.title,
            description:
              challenge.visibility === "community"
                ? `A community challenge run by ${guild.name}.`
                : `${challenge.game} · this week.`,
            color: ACCENT,
            fields: [
              { name: "Prize pool", value: formatMoney(challenge.prizePoolCents), inline: true },
              { name: "Entrants", value: String(entrants.length), inline: true },
              {
                name: "Scoring",
                // B4/C14 — a joiner is told what they are getting into before
                // they press anything, not after.
                value: "From the later of Monday's gun and the moment you join.",
              },
            ],
          },
        ],
        // The Join button is the whole point of the card. Step 2 of the nine.
        components: rows([
          {
            type: 2,
            style: ButtonStyle.Primary,
            label: "Join",
            custom_id: navId(frame("challenge", challenge.id)),
            group: "action",
          } as Button,
          linkButton("On the web", `${siteUrl()}/challenges/${challenge.id}`),
        ]),
      },
    })),
    { challengeId, kind: "launch" },
  );

  return { queued: queued.queued, guilds: targets.length };
}

/**
 * Friday. **Winners, once, on every server — and the card names the server
 * each winner came from.**
 *
 * That last clause is not decoration. A server whose member won reads its own
 * name on a card that went to every other server on the platform, which is the
 * cheapest advertising the pool has — and it is why the query joins the frozen
 * parent rather than the live one: the winner belongs to the server that had
 * them when the week ran.
 */
export async function announceWinners(
  db: DB,
  challengeId: string,
): Promise<AnnounceResult> {
  const { enqueuePosts } = await import("./post-queue.ts");

  const [challenge] = await db
    .select()
    .from(schema.challenges)
    .where(eq(schema.challenges.id, challengeId));
  if (!challenge) return { queued: 0, guilds: 0 };

  const placed = await db
    .select({
      participant: schema.challengeParticipants,
      user: schema.users,
    })
    .from(schema.challengeParticipants)
    .innerJoin(schema.users, eq(schema.challengeParticipants.userId, schema.users.id))
    .where(eq(schema.challengeParticipants.challengeId, challengeId));

  const winners = placed
    .filter((p) => p.participant.placement != null)
    .sort((a, b) => (a.participant.placement ?? 0) - (b.participant.placement ?? 0))
    .slice(0, 5);

  // The names as they are now, resolved once. `parentGuildIdAtBaseline` is the
  // frozen stamp — the server that had them when the week ran, not whoever
  // has them today (A1b).
  const guildNames = new Map(
    (await db.select().from(schema.guilds)).map((g) => [g.guildId, g.name]),
  );

  const targets = await postableGuilds(db);
  const queued = await enqueuePosts(
    targets.map((guild) => ({
      channelId: guild.announceChannelId as string,
      guildId: guild.guildId,
      payload: {
        embeds: [
          {
            title: `${challenge.title} — the results`,
            description:
              winners.length === 0
                ? "Nobody scored this week."
                : "Placements are final. Trophies have landed.",
            color: ACCENT,
            fields: winners.map((w) => ({
              name: `#${w.participant.placement} ${w.user.displayName}`,
              value:
                guildNames.get(w.participant.parentGuildIdAtBaseline ?? "") ??
                "no parent server",
              inline: false,
            })),
          },
        ],
        components: rows([
          linkButton("The full standings", `${siteUrl()}/challenges/${challenge.id}`),
        ]),
      },
    })),
    { challengeId, kind: "result" },
  );

  return { queued: queued.queued, guilds: targets.length };
}

/**
 * Saturday. **Pool standings, once, on every server.**
 *
 * The figures come from `week_records`, never from a recomputation — W1/K12,
 * one function and two callers, and 05 §6 rule 3: a figure that disagrees with
 * the payout is a defect to raise, not a number to quietly recompute.
 */
export async function announcePoolStandings(
  db: DB,
  weekStart: Date,
): Promise<AnnounceResult> {
  const { enqueuePosts } = await import("./post-queue.ts");
  const { weekRecordsFor } = await import("../pool/record.ts");

  const records = await weekRecordsFor(db, weekStart);
  const ranked = [...records]
    .filter((r) => r.totalCents > 0)
    .sort((a, b) => b.totalCents - a.totalCents);

  const targets = await postableGuilds(db);
  const queued = await enqueuePosts(
    targets.map((guild) => {
      const mine = records.find((r) => r.guildId === guild.guildId);
      return {
        channelId: guild.announceChannelId as string,
        guildId: guild.guildId,
        payload: {
          embeds: [
            {
              title: "This week's pool",
              description:
                ranked.length === 0
                  ? "Nothing was allocated this week."
                  : `${ranked.length} server${ranked.length === 1 ? "" : "s"} earned a share.`,
              color: ACCENT,
              fields: [
                ...ranked.slice(0, 5).map((r, i) => ({
                  // W5 — the name **as it was**, copied at the close. A server
                  // renamed since must still read under its week-3 name.
                  name: `#${i + 1} ${r.guildName}`,
                  value: formatMoney(r.totalCents),
                  inline: true,
                })),
                // The recipient's own line, whether or not they placed. A
                // standings card that only lists the top five tells most
                // servers nothing about themselves.
                ...(mine
                  ? [
                      {
                        name: "You",
                        value: mine.eligible
                          ? `${formatMoney(mine.totalCents)} · ${mine.entrants.toFixed(1)} entrants`
                          : "Not in this week's pool — the gate is read at Monday's gun",
                        inline: false,
                      },
                    ]
                  : []),
              ],
            },
          ],
          components: rows([linkButton("The pool, live", `${siteUrl()}/pool`)]),
        },
      };
    }),
    // Keyed on the week rather than a challenge: the pool is one thing per
    // week, and the ledger's unique index is what makes "once" true.
    { challengeId: `pool:${weekStart.toISOString().slice(0, 10)}`, kind: "result" },
  );

  return { queued: queued.queued, guilds: targets.length };
}
