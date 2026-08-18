// The Profile and Trophies families.
//
//   Profile  — my profile · another gamer · my trophies
//   Trophies — showcase · one trophy · holders
//
// T11 — `/trophies` is a **showcase, not a shop.** Nothing is for sale, there
// is no CP and no purchase, and the card says as much in its footer rather
// than leaving the question open. A card that showed a value and a button
// would read as a price whatever the button did.
//
// T13 — for our own milestone trophies, show what a gamer is **missing**. That
// is `progressFor`, the same function `/profile` reads, so the bot and the web
// cannot disagree about how close somebody is.

import { ButtonStyle } from "../types.ts";
import { frame, navButton, linkButton } from "../components.ts";
import { siteUrl } from "../config.ts";
import { screen } from "../interactions.ts";
import { cardReply } from "./card.ts";
import { homeTail } from "./home.ts";
import { profileCard, trophyCard } from "../../cards/specs.ts";
import { formatMoney } from "../../money/amounts.ts";

screen("profile", async ({ trail, presser }) => {
  if (!presser.userId) {
    return cardReply(
      { title: "Press a button and you have an account", footer: "That is all it takes." },
      { textOnly: true, buttons: [...homeTail(trail)] },
    );
  }

  const { myDashboard } = await import("../../site/queries.ts");
  const dashboard = await myDashboard(presser.userId);
  if (!dashboard) {
    return cardReply({ title: "We could not find you" }, { textOnly: true, buttons: [...homeTail(trail)] });
  }

  const { user, holdings, entries, milestones } = dashboard;
  const moneyCents = holdings
    .filter((h) => !h.holding.redeemedAt && h.trophy.valueCents > 0)
    .reduce((sum, h) => sum + h.trophy.valueCents, 0);

  const spec = profileCard({
    displayName: user.displayName,
    trophies: holdings.length,
    moneyCents,
    entries: entries.length,
  });

  // T13 — what they are missing, from `progressFor`. One unearned milestone,
  // because a card listing four is a card nobody reads to the end.
  const next = milestones.find((m) => !m.earned);
  if (next) spec.rows = [...(spec.rows ?? []), { label: "Next milestone", value: next.missing }];

  // A7/I1a — no parent server is **not** a problem to solve, and the card says
  // what it actually means rather than nagging. Everything works without one.
  if (!user.parentGuildId) {
    spec.rows = [
      ...(spec.rows ?? []),
      { label: "Parent server", value: "None — nothing is blocked; no server earns from you" },
    ];
  }

  return cardReply(spec, {
    buttons: [
      navButton("My trophies", frame("mytrophies"), trail, ButtonStyle.Primary),
      navButton("My challenges", frame("entries"), trail),
      moneyCents > 0 ? linkButton("Cash out", `${siteUrl()}/redeem`, "💰") : null,
      ...homeTail(trail),
    ],
  });
});

screen("gamer", async ({ frame: f, trail }) => {
  const slug = f.args[0];
  const { profileBySlug } = await import("../../site/queries.ts");
  const found = slug ? await profileBySlug(slug) : null;

  if (!found) {
    return cardReply(
      { title: "No such gamer" },
      { textOnly: true, buttons: [...homeTail(trail)] },
    );
  }

  // The **public** profile, deliberately: this is somebody else's card, and it
  // shows what `/u/[slug]` shows and nothing more. Age band and country are
  // compliance fields and appear on no surface at all.
  return cardReply(
    {
      title: found.user.displayName,
      rows: [
        { label: "Trophies", value: String(found.holdings.length) },
        { label: "Challenges entered", value: String(found.entries.length) },
      ],
      footer: "ClusterGG",
    },
    {
      textOnly: true,
      buttons: [
        linkButton("Their profile", `${siteUrl()}/u/${found.user.slug}`),
        ...homeTail(trail),
      ],
    },
  );
});

screen("mytrophies", async ({ trail, presser }) => {
  if (!presser.userId) {
    return cardReply({ title: "Nothing yet" }, { textOnly: true, buttons: [...homeTail(trail)] });
  }
  const { myDashboard } = await import("../../site/queries.ts");
  const dashboard = await myDashboard(presser.userId);
  const holdings = dashboard?.holdings ?? [];

  return cardReply(
    {
      title: "Your trophies",
      subtitle: holdings.length === 0 ? "None yet. Turning up earns one." : undefined,
      rows: holdings.slice(0, 8).map((h) => ({
        label: h.trophy.name,
        value:
          h.trophy.valueCents > 0
            ? `${formatMoney(h.trophy.valueCents)}${h.holding.redeemedAt ? " · cashed out" : ""}`
            : "A collectable",
      })),
      footer: "We hold every trophy for you. Nothing here expires",
    },
    {
      buttons: [
        ...holdings
          .slice(0, 4)
          .map((h) => navButton(h.trophy.name.slice(0, 40), frame("trophy", h.trophy.id), trail)),
        ...homeTail(trail),
      ],
    },
  );
});

screen("trophies", async ({ trail }) => {
  const { trophyShowcase } = await import("../../site/queries.ts");
  const showcase = await trophyShowcase();

  return cardReply(
    {
      title: "The showcase",
      subtitle: "Every trophy on the platform, and how many gamers hold each.",
      rows: showcase.slice(0, 8).map((t) => ({
        label: t.trophy.name,
        value:
          t.trophy.valueCents > 0
            ? `${formatMoney(t.trophy.valueCents)} · ${t.holders} holding`
            : `A collectable · ${t.holders} holding`,
      })),
      // T11, said out loud. The absence of a buy button is not enough: a value
      // beside a name reads as a price unless something says otherwise.
      footer: "A showcase, not a shop. Nothing here is for sale",
    },
    {
      buttons: [
        ...showcase
          .slice(0, 5)
          .map((t) => navButton(t.trophy.name.slice(0, 40), frame("trophy", t.trophy.id), trail)),
        ...homeTail(trail),
      ],
    },
  );
});

screen("trophy", async ({ frame: f, trail }) => {
  const id = f.args[0];
  const { trophyDetail } = await import("../../site/queries.ts");
  const detail = id ? await trophyDetail(id) : null;

  if (!detail) {
    return cardReply({ title: "No such trophy" }, { textOnly: true, buttons: [...homeTail(trail)] });
  }

  return cardReply(
    trophyCard({
      name: detail.trophy.name,
      valueCents: detail.trophy.valueCents,
      holders: detail.current.length,
      imageUrl: detail.trophy.imageUrl,
    }),
    {
      buttons: [
        navButton("Who holds it", frame("holders", detail.trophy.id), trail),
        linkButton("On the web", `${siteUrl()}/trophies/${detail.trophy.id}`),
        ...homeTail(trail),
      ],
    },
  );
});

screen("holders", async ({ frame: f, trail }) => {
  const id = f.args[0];
  const { trophyDetail } = await import("../../site/queries.ts");
  const detail = id ? await trophyDetail(id) : null;

  if (!detail) {
    return cardReply({ title: "No such trophy" }, { textOnly: true, buttons: [...homeTail(trail)] });
  }

  return cardReply(
    {
      title: `${detail.trophy.name} — holders`,
      subtitle: `${detail.current.length} holding now · ${detail.past.length} cashed out`,
      rows: detail.current.slice(0, 8).map((h) => ({
        label: h.user.displayName,
        value: "holding",
      })),
      footer: "ClusterGG",
    },
    {
      textOnly: true,
      buttons: [navButton("The trophy", frame("trophy", detail.trophy.id), trail), ...homeTail(trail)],
    },
  );
});
