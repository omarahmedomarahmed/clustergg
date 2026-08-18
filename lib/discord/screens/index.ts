// Every card family, registered.
//
// ===== IMPORTING THIS MODULE IS WHAT MAKES THE BOT EXIST =====
//
// `SCREENS` is a registry and each family file fills it as a side effect of
// being imported. So a family nobody imports is a family that does not exist —
// and the failure is silent: the interaction handler falls through to *"that
// screen has gone"*, which reads like a stale button rather than a missing
// file.
//
// One import list, in one place, imported by `/api/discord/interactions`.
// `94-surface-reach` is what stops this file being the thing that gets
// forgotten: a family module nothing imports has no path from `app/`, and the
// band goes red.

import "./home.ts";
import "./challenges.ts";
import "./games.ts";
import "./profile.ts";
import "./server.ts";

export { SCREENS } from "../interactions.ts";

/**
 * The families 04 §4 names, and the screens each is made of.
 *
 * Exported as data rather than written down in a comment, because
 * `tests/band1/61-cards.test.ts` asserts every one of them is registered —
 * *"every page on the website has a card"* is a claim somebody can check only
 * if the list is machine-readable. A family added to 04 and not to the bot is
 * then a red band rather than a discovery.
 */
export const CARD_FAMILIES = {
  home: ["home", "help", "commands", "search"],
  challenges: ["challenges", "challenge", "join", "standings", "entries"],
  games: ["games", "game", "link", "prove", "verify"],
  profile: ["profile", "gamer", "mytrophies"],
  trophies: ["trophies", "trophy", "holders"],
  server: ["server", "serverpool", "serverweek", "serverwallet", "reannounce"],
  community: ["community", "buildcommunity"],
} as const;

/**
 * The owner-only screens. **S8 — never a public message, ever.**
 *
 * Named here so the guard can assert the property on every one of them rather
 * than on the ones somebody thought to test. A screen added to the `server`
 * family without landing in this list fails the band, which is the point: the
 * list is derived from the family above, not maintained beside it.
 */
export const ADMIN_SCREENS: readonly string[] = [
  ...CARD_FAMILIES.server,
  "buildcommunity",
];
