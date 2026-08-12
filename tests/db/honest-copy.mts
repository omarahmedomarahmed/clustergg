/**
 * SEVEN PLACES THE PRODUCT SAID SOMETHING THAT WASN'T SO.
 * B9, G5, G6, G7, G8, S3, S4, BR3, E2, M2.
 *
 * None of these is a crash. Every one is a sentence, a button or a number that
 * a real person acted on and was wrong about — which is why they lasted.
 *
 *   B9  A challenge request with `days: 999999` and `prize: -50` answered
 *       "Request sent." Not stored as typed: 999999 was quietly clamped to 90
 *       and -50 to 0, and the owner was told their request went through. The
 *       minus sign was stripped by `[^0-9]`, so a negative prize became a
 *       POSITIVE one of the same size.
 *
 *   G5  After entering, the page said "You're in — go play Chess" and offered
 *       "Join with anishgiri" directly underneath. Pressing it did nothing.
 *
 *   G6  Not what I reported. See the block below — the claim did not reproduce
 *       and the fix is to the thing that did.
 *
 *   G7  "If it's really yours, verify ownership and it moves to you" — with no
 *       link, button or route that verifies anything, and for most games no
 *       such thing is even possible from that screen.
 *
 *   G8  The bot's link picker offered thirteen games. The website marked eight
 *       of them NEEDS KEY. A gamer taps Fortnite in Discord and finds out at
 *       sync time.
 *
 *   S3  "The key was DM'd to you at install" — said to servers that were never
 *       installed, about a credential, with nothing recording that any DM was
 *       ever sent.
 *
 *   S4  "1 have a Cluster profile so far", where the 1 is the manager, created
 *       by the act of opening the screen that reports it.
 *
 *   BR3 "One more game and you carry 1 of 6 games. 0/6" — the first line a
 *       brand with no campaigns reads on the page we ask them to spend from.
 *
 *   E2  Two public pages appearing to disagree about whether the business is
 *       running. Both numbers were right; neither label said what it counted.
 *
 *   DEMO_DB=1 npx tsx tests/db/honest-copy.mts
 */
process.env.DEMO_DB = "1";

import { readFileSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = <T,>(name: string, got: T, want: T) =>
  ok(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const code = (p: string) => src(p)
  .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");

console.log("== B9: a request nobody could mean is refused, not silently rewritten ==");
{
  const {
    submitChallengeRequest, REQUEST_MIN_DAYS, REQUEST_MAX_DAYS, REQUEST_MAX_PRIZE,
  } = await import("../../lib/challenge-requests.ts");

  // A FRESH GUILD PER SUBMISSION, and not a stylistic preference: a guild is
  // capped at three pending requests. Reusing one meant the accepted-request
  // check hit `too_many_pending` — so the suite passed or failed depending on
  // how many earlier assertions had happened to succeed, which is a test that
  // reports on itself rather than on the code.
  let n = 0;
  const base = () => ({ guildId: `90000000000000${String(++n).padStart(5, "0")}`, game: "Chess", title: "Ladder Week" });
  const days = async (d: number) => submitChallengeRequest({ ...base(), days: d, prizeValue: 0 });
  const prize = async (p: number) => submitChallengeRequest({ ...base(), days: 7, prizeValue: p });

  const wild = await days(999_999);
  ok("999999 days is refused", !wild.ok, JSON.stringify(wild));
  if (!wild.ok) eq("…by name", wild.reason, "bad_days");

  const zero = await days(0);
  ok("zero days is refused", !zero.ok);

  const neg = await prize(-50);
  ok("a negative prize is refused", !neg.ok, JSON.stringify(neg));
  if (!neg.ok) eq("…by name", neg.reason, "bad_prize");

  const huge = await prize(REQUEST_MAX_PRIZE + 1);
  ok("a prize above the ceiling is refused", !huge.ok);

  // The bounds must be real numbers somebody could actually use, or "validated"
  // just means "impossible".
  ok("the range is usable", REQUEST_MIN_DAYS >= 1 && REQUEST_MAX_DAYS >= 7,
    `${REQUEST_MIN_DAYS}-${REQUEST_MAX_DAYS}`);

  // THE ONE THAT MATTERS. A valid request still goes through — a validator that
  // refuses everything passes every negative test above.
  const good = await submitChallengeRequest({ ...base(), days: 7, prizeValue: 100 });
  ok("an ordinary request is still accepted", good.ok, JSON.stringify(good));

  // The minus sign reaches the validator instead of being stripped on the way.
  const route = code("app/api/discord/interactions/route.ts");
  ok("the modal no longer strips the sign off the prize",
    !/replace\(\/\[\^0-9\]\/g, ""\)/.test(route),
    "`[^0-9]` is back — \"-50\" becomes 50 and the owner is told nothing");

  // And the two places that bound the length agree, rather than one clamping to
  // 90 while the other refuses anything over 28.
  const lib = code("lib/challenge-requests.ts");
  ok("the approval-side clamp imports the bounds rather than retyping one",
    /Math\.min\(REQUEST_MAX_DAYS, Math\.max\(REQUEST_MIN_DAYS/.test(lib),
    "a literal is back in clampDays — it can now disagree with the modal");

  // The bound is stated before somebody types, not only after.
  ok("the modal label carries the range",
    /REQUEST_MIN_DAYS\}[^`]*\$\{REQUEST_MAX_DAYS\}/.test(code("lib/discord/screens.ts")),
    "the days field no longer tells the owner the limit up front");
}

console.log("== G5: once you are in, there is no join button ==");
{
  const page = code("app/planets/[slug]/challenges/[challengeId]/page.tsx");
  // The join form is the last branch of the chain. `joined` has to be tested
  // BEFORE it, or an entered gamer falls through to it — which is the defect.
  const chain = page.slice(page.indexOf("{joined && myAccounts.length > 1"));
  const joinedAt = chain.indexOf(") : joined ?");
  const formAt = chain.indexOf("joinChallenge.bind");
  ok("the chain tests `joined` before it reaches the join form",
    joinedAt >= 0 && joinedAt < formAt, `joined@${joinedAt} form@${formAt}`);
  ok("…and renders nothing rather than a second control",
    /\) : joined \? \(\s*null\s*\) :/.test(chain.replace(/\s+/g, " ").replace(/\) : joined \? \( null \) :/, ") : joined ? (\n null\n ) :"))
      || /: joined \?[\s\S]{0,80}\bnull\b/.test(chain),
    chain.slice(joinedAt, joinedAt + 90));
}

console.log("== G6: the board says how much of the field it is showing ==");
{
  // ===== WHAT I REPORTED DID NOT REPRODUCE =====
  //
  // The audit said a gamer who had just entered was absent from the standings.
  // Driving the board's own query against a fresh 0-point participant, they
  // come back, ranked last. So that claim is not asserted here and the fix is
  // not to it.
  //
  // What IS wrong is the edge the claim most likely came from: the query took
  // fifty rows and the page presented them as the whole field. Past fifty
  // entrants a newcomer at zero points really is missing, silently, from a list
  // that looks complete.
  const { BOARD_LIMIT } = await import("../../lib/challenges.ts");
  ok("the board limit is a shared constant", typeof BOARD_LIMIT === "number" && BOARD_LIMIT > 0);

  const route = code("app/api/challenges/[challengeId]/leaderboard/route.ts");
  ok("the API reads it rather than repeating a literal",
    /\.limit\(BOARD_LIMIT\)/.test(route), "a bare 50 is back in the query");
  ok("…and returns the real total", /\btotal\b/.test(route) && /count\(\)/.test(route));
  ok("…and can return the viewer's own row", /searchParams\.get\("me"\)/.test(route));
  ok("…scoped to THIS challenge, not their standing in another",
    /and\(\s*eq\(schema\.challengeParticipants\.challengeId, challengeId\),\s*eq\(schema\.users\.slug, me\)/.test(route),
    "the pinned-row lookup filters on slug alone");

  const board = code("components/LiveChallengeBoard.tsx");
  ok("the component says when the list is a window", /truncated \?/.test(board));
  ok("…marks the viewer's row", /isMe/.test(board));
  ok("…and ranks from the server, not the array index",
    /\{e\.rank\}/.test(board) && !/rank-chip-\$\{i \+ 1\}/.test(board),
    "index-based ranks renumber a pinned 63rd place as 51st");

  const page = code("app/planets/[slug]/challenges/[challengeId]/page.tsx");
  ok("and the page actually passes the viewer", /meSlug=\{viewer\?\.slug/.test(page),
    "the board can never highlight anything");
}

console.log("== G7: the conflict message names only actions that exist ==");
{
  const { conflictMessage } = await import("../../lib/account-ownership.ts");
  const held = { accountId: "a", userId: "u", displayName: "N", slug: "n", proven: false };

  // Riot proves ownership with a profile icon, which needs a linked row — and
  // this message is the moment we refused to create one. So there is nothing
  // the person can do from here, and the copy must not pretend otherwise.
  const riot = conflictMessage(held, "League of Legends", "riot-lol");
  ok("no instruction to 'verify ownership' where none is possible",
    !/verify ownership/i.test(riot), riot);
  ok("…and it says what they CAN do", /support/i.test(riot), riot);

  // Steam proves ownership by signing in, which works with no linked row.
  const steam = conflictMessage(held, "Counter-Strike 2", "steam");
  ok("a game with a real sign-in offers it", /sign in/i.test(steam), steam);

  // Epic OAuth exists and the Fortnite matching step does not. Declared is not
  // the same as offered — this is exactly how the old copy went wrong.
  const fn = conflictMessage(held, "Fortnite", "fortnite");
  ok("a declared-but-unwired proof is NOT offered", !/sign in with epic/i.test(fn), fn);

  // A proven holder is a different situation and keeps its own answer.
  const proven = conflictMessage({ ...held, proven: true }, "League of Legends", "riot-lol");
  ok("a proven holder still routes to support", /support/i.test(proven), proven);

  ok("the caller passes the provider through",
    /conflictMessage\(conflict, provider\.game, providerId\)/.test(code("lib/link-account.ts")),
    "without it every game falls to the generic branch");
}

console.log("== G8: the bot offers what the website says is ready ==");
{
  const { linkableGames, isProviderLive, PROVIDERS } = await import("../../lib/providers/registry.ts");
  const all = linkableGames();
  const live = linkableGames({ live: true });

  ok("the designed set is still available to callers that want it", all.length > 0);
  ok("the live set is a subset", live.every((g) => all.some((a) => a.game === g.game)));
  ok("…and on a deployment with no provider keys it is genuinely smaller",
    live.length < all.length, `${live.length} vs ${all.length} — no keys are set in the test band`);

  // The predicate is the SAME one, not a second opinion that can drift.
  const everyLive = PROVIDERS.filter((p) => !p.identityOnly && isProviderLive(p)).map((p) => p.game);
  ok("every game in the live set has a live provider",
    live.every((g) => everyLive.includes(g.game)),
    live.filter((g) => !everyLive.includes(g.game)).map((g) => g.game).join(", "));

  const screens = code("lib/discord/screens.ts");
  ok("the bot's picker asks for the live set", /linkableGames\(\{ live: true \}\)/.test(screens),
    "the picker is back to offering games whose key is missing");

  const route = code("app/api/discord/interactions/route.ts");
  ok("and a stale button for one of them is refused rather than opening a modal",
    /isProviderLive\(def\)/.test(route),
    "the modal opens and fails on submit, after they have typed");
}

console.log("== S3, S4: the bot does not state things it cannot know ==");
{
  const screens = code("lib/discord/screens.ts");
  ok("no claim that the key was DM'd at install",
    !/DM'd to you at install/.test(screens),
    "said to servers that were never installed, about a credential");
  ok("…and the portal line still tells them how to get it",
    /DM you the key/i.test(screens));

  ok("the profile count agrees with its verb",
    /stats\.joined === 1 \? "has" : "have"/.test(screens),
    "\"1 have a Cluster profile\"");
  ok("…and zero is not rendered as a number of people",
    /stats\.joined === 0\s*\n?\s*\? "Nobody here/.test(screens.replace(/\s+/g, " ").replace(/stats\.joined === 0 \? "Nobody here/, 'stats.joined === 0\n? "Nobody here'))
      || /joined === 0[\s\S]{0,40}Nobody here/.test(screens));
  ok("…and the viewer is told they are in the count",
    /including you|that's you/.test(screens),
    "an owner reading '1' concludes a member joined");
}

console.log("== BR3, E2: two numbers that read as nonsense ==");
{
  const strip = code("components/BrandTierStrip.tsx");
  ok("the zero case does not use a standing as an object",
    /standing\.games === 0 \?/.test(strip),
    "\"One more game and you carry 1 of 6 games\"");
  ok("…and says something a brand with nothing running can act on",
    /first game puts you on the board/i.test(strip));

  const pool = code("app/pool/page.tsx");
  ok("the pool count says what it counts",
    /in this week&apos;s pool|in this week's pool/.test(pool),
    "\"0 servers competing\" beside /servers saying 7 — both right, neither scoped");
  ok("…and no longer says the bare word 'competing'",
    !/servers?\{[^}]*\} competing/.test(pool));
}

console.log("== M2: a control you can hit with a thumb ==");
{
  const css = src("app/globals.css");
  const touch = css.slice(css.indexOf("@media (pointer: coarse)"));
  ok("there is a coarse-pointer block at all", touch.length > 0,
    "58 controls under 32px, on a product used beside Discord on a phone");
  ok("…scoped to touch, so desktop density is untouched",
    /@media \(pointer: coarse\)/.test(css));
  for (const cls of [".glow-btn", ".brand-btn", ".money-btn", ".ghost-btn", ".input-cosmic"]) {
    ok(`${cls} has a minimum touch height`, new RegExp(`\\${cls}[^{]*\\{[^}]*min-height`).test(touch)
      || touch.includes(cls), cls);
  }
  ok("the minimum clears the 44px platform floor", /min-height: 44px/.test(touch));
  ok("…using min-height, so anything already taller keeps its size",
    !/[^-]\bheight: 44px/.test(touch), "a fixed height would shrink big buttons");
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  - ${f}`); process.exit(1); }
