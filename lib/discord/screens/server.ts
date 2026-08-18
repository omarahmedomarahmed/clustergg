// The Server family, and the Admin family that is never public.
//
//   Server (owner-only) — overview · pool standing · this week's challenges ·
//                         members · wallet · community · settings
//   Community (public)  — community challenges · build one
//
// ===== S7 AND S8, AND WHY S8 IS ENFORCED BY A WRAPPER =====
//
//   S7 — *"every portal page and tab also exists as an admin bot card."*
//   S8 — *"**admin cards are never public messages. Ever.** Only the owner and
//         mapped roles see them."*
//
// S8 is not set by each screen. `ownerOnly` sets `ephemeral: true` on
// everything it returns — **including the refusal**, because a refusal posted
// publicly announces to a whole server that somebody tried. A flag each screen
// remembers is a flag one screen forgets, and the one that forgets is the one
// carrying a wallet balance.
//
// ===== P1 REACHES THE CARDS TOO =====
//
// *"Only the Discord guild owner touches money."* An administrator reading the
// wallet card sees the balance and no withdraw button, with the reason on the
// card. Hiding the control instead would be a support ticket: a disabled thing
// with an explanation teaches, and a missing thing confuses.

import { ButtonStyle } from "../types.ts";
import { frame, navButton, linkButton, button, actionId } from "../components.ts";
import { siteUrl } from "../config.ts";
import { screen, type ScreenResult, type Interaction } from "../interactions.ts";
import { checkAdmin } from "../admin.ts";
import { cardReply } from "./card.ts";
import { homeTail } from "./home.ts";
import { serverCard } from "../../cards/specs.ts";
import { formatMoney } from "../../money/amounts.ts";
import type { Frame } from "../components.ts";

/**
 * Wrap an owner card. **Everything out of here is ephemeral (S8).**
 *
 * Deliberately not `admin.ts`'s `ownerOnly`, which takes a different context
 * shape — this is the screen-registry form of the same rule, and it delegates
 * the *decision* to `checkAdmin` rather than restating it. Two wrappers, one
 * authority.
 */
function adminCard(
  handler: (ctx: {
    guildId: string;
    trail: Frame[];
    frame: Frame;
    interaction: Interaction;
  }) => Promise<ScreenResult>,
) {
  return async (ctx: {
    interaction: Interaction;
    frame: Frame;
    trail: Frame[];
    guildId: string | null;
    userId: string | null;
  }): Promise<ScreenResult> => {
    const { getDb } = await import("../../db/index.ts");
    const check = await checkAdmin(await getDb(), {
      guildId: ctx.guildId,
      memberRoleIds: ctx.interaction.member?.roles ?? [],
      userId: ctx.userId,
    });
    if (!check.allowed) {
      // Ephemeral, like everything else here. S8 has no exceptions and a
      // refusal is the case where breaking it would be most embarrassing.
      return { content: check.reason, ephemeral: true };
    }
    const result = await handler({
      guildId: ctx.guildId as string,
      trail: ctx.trail,
      frame: ctx.frame,
      interaction: ctx.interaction,
    });
    return { ...result, ephemeral: true };
  };
}

/** Whether this presser is the guild owner — the only one who touches money. */
async function isGuildOwner(guildId: string, discordId: string | null): Promise<boolean> {
  if (!discordId) return false;
  const { getDb, schema } = await import("../../db/index.ts");
  const { eq } = await import("drizzle-orm");
  const db = await getDb();
  const [guild] = await db
    .select({ ownerDiscordId: schema.guilds.ownerDiscordId })
    .from(schema.guilds)
    .where(eq(schema.guilds.guildId, guildId));
  return guild?.ownerDiscordId === discordId;
}

screen(
  "server",
  adminCard(async ({ guildId, trail }) => {
    const { getDb } = await import("../../db/index.ts");
    const { ownerOverview, ownerStanding } = await import("../../portal/owner.ts");
    const { poolStatesFor } = await import("../../pool/eligibility.ts");
    const { weekFor } = await import("../../challenges/week.ts");
    const db = await getDb();
    const now = new Date();

    const overview = await ownerOverview(db, guildId, now);
    if (!overview) {
      return { content: "Cluster is not installed here.", ephemeral: true };
    }
    const standing = await ownerStanding(db, guildId, now);
    const states = await poolStatesFor(db, guildId, weekFor(now).start);

    return cardReply(
      serverCard({
        name: overview.name,
        thisWeekCents: overview.thisWeekCents,
        position: standing.position,
        of: standing.of,
        inThisWeeksPool: states?.inThisWeeksPool ?? false,
      }),
      {
        buttons: [
          navButton("This week", frame("serverweek"), trail, ButtonStyle.Primary),
          navButton("Standing", frame("serverpool"), trail),
          navButton("Wallet", frame("serverwallet"), trail),
          linkButton("The portal", `${siteUrl()}/portal/server/${guildId}`),
          ...homeTail(trail),
        ],
      },
    );
  }),
);

screen(
  "serverpool",
  adminCard(async ({ guildId, trail }) => {
    const { getDb } = await import("../../db/index.ts");
    const { ownerStanding } = await import("../../portal/owner.ts");
    const { poolStatesFor } = await import("../../pool/eligibility.ts");
    const { weekFor } = await import("../../challenges/week.ts");
    const { poolStandingHeadline, unlockNote } = await import("../../site/progress.ts");
    const db = await getDb();
    const now = new Date();

    const standing = await ownerStanding(db, guildId, now);
    const states = await poolStatesFor(db, guildId, weekFor(now).start);

    return cardReply(
      {
        title: "Your pool standing",
        // E2 — two states, from `poolStatesFor`. The bot says the same sentence
        // the portal says, because it is the same function.
        subtitle: states
          ? poolStandingHeadline(states)
          : "We have no record of this server.",
        rows: [
          {
            label: "Position",
            value: standing.position ? `${standing.position} of ${standing.of}` : "Not scored",
          },
          ...standing.kpis.map((k) => ({
            label: KPI_LABEL[k.key] ?? k.key,
            value: k.key === "entrants" ? k.value.toFixed(1) : `${(k.value * 100).toFixed(0)}%`,
          })),
          ...(states && unlockNote(states.live)
            ? [{ label: "To unlock the pool", value: unlockNote(states.live) as string }]
            : []),
        ],
        footer: standing.lever ?? "Entrants earn. Winning a challenge earns nothing directly",
      },
      { buttons: [navButton("Overview", frame("server"), trail), ...homeTail(trail)] },
    );
  }),
);

const KPI_LABEL: Record<string, string> = {
  entrants: "Exclusive entrants",
  conversion: "Conversion",
  activation: "Activation",
};

screen(
  "serverweek",
  adminCard(async ({ guildId, trail }) => {
    const { getDb } = await import("../../db/index.ts");
    const { ownerOverview } = await import("../../portal/owner.ts");
    const db = await getDb();
    const overview = await ownerOverview(db, guildId, new Date());
    const challenges = overview?.thisWeekChallenges ?? [];

    return cardReply(
      {
        title: "This week's challenges",
        subtitle:
          challenges.length === 0
            ? "Nothing is running in your server this week."
            : "Re-announcing posts the card again. It does not create a second challenge.",
        rows: challenges.map((c) => ({ label: c.title, value: c.game })),
        footer: "You are our distribution — a member who never saw the card was never going to enter",
      },
      {
        buttons: [
          challenges.length
            ? button("Re-announce all", actionId("reannounce", [guildId], trail), ButtonStyle.Primary, "📣")
            : null,
          navButton("Overview", frame("server"), trail),
          ...homeTail(trail),
        ],
      },
    );
  }),
);

screen(
  "reannounce",
  adminCard(async ({ guildId, trail }) => {
    const { getDb } = await import("../../db/index.ts");
    const { ownerOverview, reAnnounce } = await import("../../portal/owner.ts");
    const db = await getDb();
    const overview = await ownerOverview(db, guildId, new Date());
    const ids = (overview?.thisWeekChallenges ?? []).map((c) => c.id);

    // A2/A3 — even one server goes through the queue. Nothing fans out inline
    // from a request, and a card is a request.
    const result = await reAnnounce(db, guildId, ids);

    return cardReply(
      {
        title: result.error ? "We could not post" : "Queued",
        subtitle:
          result.error ??
          `${result.queued} card${result.queued === 1 ? "" : "s"} will land in your announcement channel.`,
      },
      { textOnly: true, buttons: [navButton("This week", frame("serverweek"), trail), ...homeTail(trail)] },
    );
  }),
);

screen(
  "serverwallet",
  adminCard(async ({ guildId, trail, interaction }) => {
    const { getDb } = await import("../../db/index.ts");
    const { ownerOverview } = await import("../../portal/owner.ts");
    const db = await getDb();
    // The same object the portal's Overview reads. A card that summed the
    // payout rows itself would be a second implementation of a balance, and
    // the two would disagree the first time a payout was superseded.
    const overview = await ownerOverview(db, guildId, new Date());
    const discordId = interaction.member?.user?.id ?? interaction.user?.id ?? null;
    const owner = await isGuildOwner(guildId, discordId);

    if (!overview) return { content: "Cluster is not installed here.", ephemeral: true };

    return cardReply(
      {
        title: "Wallet",
        rows: [
          { label: "Available", value: formatMoney(overview.availableCents) },
          { label: "Earned, ever", value: formatMoney(overview.lifetimeEarnedCents) },
        ],
        // P1 — said on the card, to whoever is holding it. An administrator
        // learns why they cannot rather than finding a button missing.
        footer: owner
          ? "A payout is drafted at the close and released by a person"
          : "Only the guild owner can withdraw. You can see everything and move nothing",
      },
      {
        buttons: [
          owner ? linkButton("Withdraw", `${siteUrl()}/portal/server/${guildId}/wallet`, "💸") : null,
          navButton("Overview", frame("server"), trail),
          ...homeTail(trail),
        ],
      },
    );
  }),
);

// ===== The community family. Public on purpose (C24/M24). =====

screen("community", async ({ trail }) => {
  const { communityChallenges } = await import("../../site/queries.ts");
  const list = await communityChallenges(new Date());

  return cardReply(
    {
      title: "Community challenges",
      subtitle: "Competitions servers run for their own members. Public, because that is the point.",
      rows: list.slice(0, 8).map((c) => ({ label: c.title, value: c.game })),
      footer: "To enter one you join the server. The challenge is the server's advertising",
    },
    {
      buttons: [
        ...list.slice(0, 4).map((c) => navButton(c.title.slice(0, 40), frame("challenge", c.id), trail)),
        navButton("Run one on my server", frame("buildcommunity"), trail),
        ...homeTail(trail),
      ],
    },
  );
});

screen(
  "buildcommunity",
  adminCard(async ({ guildId, trail }) => {
    const { COMMUNITY_TIERS, communityPriceCents } = await import("../../money/amounts.ts");

    return cardReply(
      {
        title: "Run a community challenge",
        subtitle: "Two tiers. That is the whole menu.",
        rows: (Object.keys(COMMUNITY_TIERS) as unknown as (1 | 2)[]).map((tier) => ({
          label: `Tier ${tier}`,
          value:
            `${formatMoney(COMMUNITY_TIERS[tier].prizeCents)} to ` +
            `${COMMUNITY_TIERS[tier].winners} winner${COMMUNITY_TIERS[tier].winners === 1 ? "" : "s"} · ` +
            `you pay ${formatMoney(communityPriceCents(tier))}`,
        })),
        // C2 — owner money never touches vault 3. Paying an owner from a pool
        // their own money funded would pay them twice, and the card says so
        // where somebody is about to spend.
        footer: "It never feeds a weekly pool — that would pay you out of your own money",
      },
      {
        buttons: [
          linkButton("Build it", `${siteUrl()}/portal/server/${guildId}/community`, "🏆"),
          navButton("Overview", frame("server"), trail),
          ...homeTail(trail),
        ],
      },
    );
  }),
);
