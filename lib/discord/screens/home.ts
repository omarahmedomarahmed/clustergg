// The Home family — home · help · commands · search.
//
// 01-CYCLE: *"The bot is not a companion to the platform — for most gamers it
// is the entire platform."* So home is not a menu of links to the website. It
// is the first screen of the product, and every other family is one press away
// from it.
//
// I6 — a shadow account *"accrues nothing and counts as nobody until onboarding
// completes"*, so home tells an unfinished gamer what is missing rather than
// pretending they are in. That is the same `unlockState` the website reads:
// two surfaces, one derivation, no chance of the bot saying they are ready and
// the site disagreeing.

import type { DB } from "../../db/index.ts";
import { ButtonStyle } from "../types.ts";
import { frame, navButton, backButton, linkButton, type Button } from "../components.ts";
import { siteUrl } from "../config.ts";
import { screen } from "../interactions.ts";
import { cardReply } from "./card.ts";

/** The buttons every card offers, so a gamer is never one press from stuck. */
export function homeTail(trail: ReturnType<typeof frame>[]): (Button | null)[] {
  return [
    navButton("Challenges", frame("challenges"), trail, ButtonStyle.Secondary, undefined, "nav"),
    navButton("My profile", frame("profile"), trail, ButtonStyle.Secondary, undefined, "nav"),
    navButton("Help", frame("help"), trail, ButtonStyle.Secondary, undefined, "nav"),
    backButton(trail),
  ];
}

screen("home", async ({ trail, presser }) => {
  const { getDb } = await import("../../db/index.ts");
  const { unlockState } = await import("../../identity/unlock.ts");
  const { progressOf } = await import("../../identity/onboarding.ts");

  // U3 — the identity answered "under 13" and the row was deleted. The card
  // says so plainly and stores nothing, which is the whole point of keeping the
  // fingerprint: the answer cannot be retaken at any door, including this one.
  if (presser.blocked) {
    return {
      content:
        "This Discord account told us it belongs to somebody under 13, so we " +
        "closed it. Come back when you turn 13 — there will be plenty to play for.",
      ephemeral: true,
    };
  }

  const db = await getDb();
  const unlock = presser.userId ? await unlockState(db, presser.userId) : null;

  // ===== A2/A7 — "NO PARENT SERVER YET", AND THE ONLY PLACE IT CAN BE SAID ===
  //
  // `12-IDENTITY` §3 owes a gamer with no parent a sentence, and names this
  // exact route for it: *open Discord, go to a server that has Cluster and use
  // `/cluster` — that becomes your parent.* Before the slash command existed
  // there was no way for that person to reach the bot at all, so the sentence
  // had nowhere to appear and the state was invisible.
  //
  // Read after `identify` has already run, which is what makes the row honest:
  // by the time this card is drawn, a `/cluster` in a server **has** stamped
  // the parent, so the gamer who needed telling sees the server that just
  // became theirs rather than an instruction to do what they have just done.
  const parent = presser.userId ? await parentServerOf(db, presser.userId) : null;
  const parentRow = parent
    ? { label: "Your server", value: `${parent} earns when you play` }
    : {
        label: "No parent server yet",
        value: "Use /cluster in a server that has Cluster and it becomes yours",
      };

  if (unlock && !unlock.unlocked) {
    const progress = progressOf(unlock);
    return cardReply(
      {
        title: "Nearly there",
        subtitle: progress.label,
        rows: [
          ...unlock.missing.map((m) => ({ label: STEP_LABEL[m] ?? m, value: "needed" })),
          parentRow,
        ],
        footer: "Nothing counts until these are done — that is deliberate, not a delay",
      },
      {
        textOnly: true,
        buttons: [
          navButton("Link a game account", frame("games"), trail, ButtonStyle.Primary),
          linkButton("Finish on the web", `${siteUrl()}/onboarding`),
          ...homeTail(trail),
        ],
      },
    );
  }

  return cardReply(
    {
      title: "ClusterGG",
      subtitle: "One game, one week, real money. You play the game you were going to play anyway.",
      rows: [
        { label: "This week", value: "Live challenges and the countdown to Friday" },
        { label: "The pool", value: "What every server has earned so far, publicly" },
        { label: "Your trophies", value: "Worth money if you place, a collectable if you turn up" },
        parentRow,
      ],
      footer: "We reward outcomes, never Discord activity",
    },
    {
      buttons: [
        navButton("This week's challenges", frame("challenges"), trail, ButtonStyle.Primary),
        navButton("Games", frame("games"), trail),
        navButton("Trophies", frame("trophies"), trail),
        navButton("My profile", frame("profile"), trail, ButtonStyle.Secondary, undefined, "nav"),
        navButton("Help", frame("help"), trail, ButtonStyle.Secondary, undefined, "nav"),
        linkButton("The pool, live", `${siteUrl()}/pool`),
        backButton(trail),
      ],
    },
  );
});

/**
 * The name of the server that gets acquisition credit for this gamer, if any.
 *
 * A name, never an id: an id on a card is a number nobody can act on. Null
 * when there is no parent, and null when the parent's guild row has gone —
 * both are "no server to name", and A9 already says a departed parent keeps
 * what it earned and gains nothing new.
 */
async function parentServerOf(db: DB, userId: string): Promise<string | null> {
  const { schema } = await import("../../db/index.ts");
  const { eq } = await import("drizzle-orm");
  const [row] = await db
    .select({ name: schema.guilds.name })
    .from(schema.users)
    .innerJoin(schema.guilds, eq(schema.users.parentGuildId, schema.guilds.guildId))
    .where(eq(schema.users.id, userId));
  return row?.name ?? null;
}

const STEP_LABEL: Record<string, string> = {
  ageBand: "Your age band",
  country: "Your country",
  link: "A linked game account",
  guilds: "The servers you admin",
};

screen("help", async ({ trail }) => {
  // H1's `i` icon, in the bot's own grammar. The website opens an overlay; here
  // the overlay is a card, because a card is the only thing this surface has.
  return cardReply(
    {
      title: "How this works",
      rows: [
        { label: "The week", value: "Monday 00:00 UTC to Friday 00:00 UTC" },
        { label: "Scoring", value: "Wins and matches, counted. No win rate, ever" },
        { label: "When you start", value: "The later of the gun and the moment you joined" },
        { label: "Trophies", value: "Podium is money; turning up is a branded collectable" },
        { label: "Cashing out", value: "18+, a verified email, and a country we can pay" },
      ],
      footer: "Every figure here is read from the code that enforces it",
    },
    {
      textOnly: true,
      buttons: [
        navButton("Commands", frame("commands"), trail),
        linkButton("The full rules", `${siteUrl()}/rules/gamer`),
        ...homeTail(trail),
      ],
    },
  );
});

screen("commands", async ({ trail }) =>
  cardReply(
    {
      title: "Commands",
      rows: [
        { label: "/cluster", value: "Home. Everything is one press from here" },
        { label: "/challenges", value: "This week's challenges, and Join" },
        { label: "/profile", value: "Your trophies, entries and standings" },
        { label: "/server", value: "Server admins only — your pool position" },
      ],
      footer: "Every screen is a card, and every card has a way back",
    },
    { textOnly: true, buttons: [...homeTail(trail)] },
  ),
);

screen("search", async ({ trail, frame: f }) => {
  const query = (f.args[0] ?? "").trim();
  const { getDb } = await import("../../db/index.ts");
  const { schema } = await import("../../db/index.ts");
  const db = await getDb();

  const all = await db.select().from(schema.challenges);
  const hits = query
    ? all.filter(
        (c) =>
          c.title.toLowerCase().includes(query.toLowerCase()) ||
          c.game.toLowerCase().includes(query.toLowerCase()),
      )
    : [];

  return cardReply(
    {
      title: query ? `“${query}”` : "Search",
      subtitle: query
        ? `${hits.length} match${hits.length === 1 ? "" : "es"}`
        : "Type a game or a challenge name after the command.",
      rows: hits.slice(0, 6).map((c) => ({ label: c.title, value: c.game })),
      footer: "ClusterGG",
    },
    {
      textOnly: true,
      buttons: [
        ...hits
          .slice(0, 4)
          .map((c) => navButton(c.title.slice(0, 40), frame("challenge", c.id), trail)),
        ...homeTail(trail),
      ],
    },
  );
});
