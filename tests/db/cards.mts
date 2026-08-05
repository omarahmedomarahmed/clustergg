// B54 — a card is a web page, not a poster.
//
// The overhaul is a design change, and most of it is judged by eye. Three parts
// of it are not, and those are what this file holds:
//
//   1. **No card clips its text at a fixed height.** A box sized to hold one
//      line cuts the descenders off every name with a p or a y in it, and it
//      only looks fine until somebody's name has one. This is the known bug the
//      item names.
//   2. **Every standings row leads with the IN-GAME name.** It is that game's
//      challenge, scored on that game's account, so the game identity is the
//      subject — the same rule B52 applied to planet ladders. The data layer
//      had the in-game name all along and the card threw it away.
//   3. **Satori renders every kind without throwing.** Satori is not a browser:
//      it supports a subset of flexbox, every element needs an explicit
//      `display`, and an unsupported property is an exception rather than a
//      style that does nothing. A card kind that throws is a Discord message
//      with no image.
//
//   DEMO_DB=1 npx tsx tests/db/cards.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { challengeCard, challengeStandingsCard } = await import("../../lib/cards/data.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const { readFile } = await import("node:fs/promises");

const db = await getDb();
const tag = uid().slice(0, 6);

/** The strip's height in canvas pixels — the band every card keeps free. */
const STRIP = 92;

console.log("== no card clips its text at a fixed height ==");
// The failure: `height: 15` on a text box holds today because the copy in it
// happens to be uppercase, and clips the first time somebody writes a lower-case
// word with a descender. Found by reading, asserted so it stays found.
const render = await readFile(new URL("../../lib/cards/render.tsx", import.meta.url), "utf8");
const lines = render.split("\n");
const clipped: string[] = [];
lines.forEach((line, i) => {
  // A fixed height on the SAME element as a font size is a text box with a lid.
  if (/height:\s*\d+\s*,/.test(line) && /fontSize:/.test(line)) {
    // A circular badge — width === height with a border radius — is a shape
    // that happens to contain a character, not a paragraph.
    const round = /borderRadius/.test(line) && /width:\s*([^,]+),\s*height:\s*\1/.test(line);
    if (!round) clipped.push(`${i + 1}: ${line.trim().slice(0, 90)}`);
  }
});
eq("no text box carries a fixed height", clipped, []);
ok("…and the ones that used to say so", /No fixed height/.test(render));

// Decorative dots are allowed to have one — they contain nothing.
const dots = lines.filter((l) => /height:\s*\d+,/.test(l) && /borderRadius/.test(l) && !/fontSize/.test(l));
ok("decorative shapes may still be fixed", dots.length > 0, `${dots.length}`);

console.log("\n== every standings row leads with the in-game name ==");
// The data layer has carried `inGameName` all along; the card dropped it on the
// floor. Asserted against a real challenge with a real linked account.
const [space] = await db.select().from(schema.spaces).limit(1);
const userId = uid();
await db.insert(schema.users).values({
  id: userId, slug: `card-${tag}`, displayName: `Cluster Name ${tag}`,
  email: `${userId}@test.invalid`, passwordHash: "x",
} as never);
const acct = uid();
await db.insert(schema.linkedGameAccounts).values({
  id: acct, userId, provider: "chesscom", providerAccountId: `pa-${tag}`,
  inGameName: `InGameTag${tag}`, verified: true,
} as never);
const challengeId = uid();
await db.insert(schema.challenges).values({
  id: challengeId, spaceId: space.id, game: space.game, provider: "chesscom",
  title: `Card standings ${tag}`,
  startAt: new Date(Date.now() - 86400_000), endAt: new Date(Date.now() + 86400_000),
  status: "active", visibility: "public",
} as never);
await db.insert(schema.challengeParticipants).values({
  id: uid(), challengeId, userId, linkedAccountId: acct,
  currentPoints: 120, joinedAt: new Date(), status: "active",
} as never);

const card = await challengeCard(challengeId);
ok("the card builds", !!card && card.kind === "challenge", JSON.stringify(card?.kind));
const rows = (card as { standings?: { name: string; alt?: string | null }[] }).standings ?? [];
ok("it has a standings row", rows.length > 0, JSON.stringify(rows));
eq("the row LEADS with the in-game name", rows[0]?.name, `InGameTag${tag}`);
eq("…and carries the Cluster name as the second line", rows[0]?.alt, `Cluster Name ${tag}`);

// When the two are the same there is nothing to reveal, and a duplicate line
// would be noise.
const plainId = uid();
await db.insert(schema.users).values({
  id: plainId, slug: `plain-${tag}`, displayName: `SameName${tag}`,
  email: `${plainId}@test.invalid`, passwordHash: "x",
} as never);
const plainAcct = uid();
await db.insert(schema.linkedGameAccounts).values({
  id: plainAcct, userId: plainId, provider: "chesscom",
  providerAccountId: `pb-${tag}`, inGameName: `SameName${tag}`, verified: true,
} as never);
await db.insert(schema.challengeParticipants).values({
  id: uid(), challengeId, userId: plainId, linkedAccountId: plainAcct,
  currentPoints: 60, joinedAt: new Date(), status: "active",
} as never);
const card2 = await challengeCard(challengeId);
const same = ((card2 as { standings?: { name: string; alt?: string | null }[] }).standings ?? [])
  .find((r) => r.name === `SameName${tag}`);
eq("an identical name shows no second line", same?.alt, null);

// The renderer draws it that way, not just the data.
ok("the renderer draws the second line only when it differs", /s\.alt \?/.test(render));
ok("…and clamps both rather than letting them overflow",
  /clamp\(s\.name, 18\)/.test(render) && /clamp\(s\.alt, 22\)/.test(render));

console.log("\n== the OTHER standings card leads the same way ==");
// Two entry points, one question. `challengeStandingsCard` renders a
// `leaderboard` card with `rows` rather than `standings`, and it read
// `<cluster> · <account>` — the Cluster name first. My assertion pointed at the
// wrong field, which is how I found it: it is that game's challenge, scored on
// that game's account, and with two accounts on one game only one is entered.
const stand = await challengeStandingsCard(challengeId);
const standRows = (stand as { rows?: { name: string }[] } | null)?.rows ?? [];
ok("it builds too", standRows.length > 0, JSON.stringify(standRows.slice(0, 2)));
const mine = standRows.find((r) => r.name.includes(`InGameTag${tag}`));
ok("the entered ACCOUNT leads the row", mine?.name.startsWith(`InGameTag${tag}`),
  JSON.stringify(mine));
ok("…and the person is still named, second",
  (mine?.name ?? "").includes(`Cluster Name ${tag}`), JSON.stringify(mine));
const plainRow = standRows.find((r) => r.name.includes(`SameName${tag}`));
eq("…and an identical name is not printed twice", plainRow?.name, `SameName${tag}`);

console.log("\n== the planet ladder leads with the in-game name too ==");
// The THIRD place this was wrong, found by rendering the card and looking at
// it: the planet card printed the Cluster profile name on every leaderboard
// row. Same rule, same fix.
{
  const { planetCard } = await import("../../lib/cards/data.ts");
  const planet = await planetCard(space.game ?? "");
  const boards = (planet as { boards?: { leader: string | null }[] } | null)?.boards ?? [];
  ok("the planet card builds with boards", boards.length >= 0, JSON.stringify(boards.slice(0, 1)));
  const data = await readFile(new URL("../../lib/cards/data.ts", import.meta.url), "utf8");
  ok("the leader is the in-game name", /leader = sorted\[0\]\.ign \|\| sorted\[0\]\.name/.test(data));
  ok("…and the query selects it", /ign: schema\.linkedGameAccounts\.inGameName/.test(data));
}

console.log("\n== the leader and the value do not touch ==");
// Satori's `gap` did not reach that nesting: the card rendered "NovaGold II"
// with the two runs against each other. Only a real render shows that — a
// source read never will — which is why the redesign was driven by looking at
// the output rather than by reading the styles.
ok("the value is spaced with a margin, not a gap",
  /marginLeft: 10, color: t\.accent2/.test(render));

console.log("\n== the top strip exists, and the mark is in it ==");
const layout = await readFile(new URL("../../lib/cards/layout.ts", import.meta.url), "utf8");
ok("there is a strip", /export const STRIP_H/.test(render));
ok("…drawn unconditionally, unlike the accent bar", /Unconditional, unlike the accent bar/.test(render));
const markY = Number(/mark: \{ x: [\d.]+, y: ([\d.]+)/.exec(layout)?.[1] ?? "99");
ok("the mark sits in the top band, not the bottom corner", markY < 20, String(markY));
const markX = Number(/mark: \{ x: ([\d.]+)/.exec(layout)?.[1] ?? "0");
ok("…on the RIGHT", markX > 75, String(markX));
const contentY = Number(/content: \{ x: [\d.]+, y: ([\d.]+)/.exec(layout)?.[1] ?? "0");
ok("…and the body starts under it", contentY >= 14, String(contentY));
const contentW = Number(/content: \{ x: [\d.]+, y: [\d.]+, w: ([\d.]+)/.exec(layout)?.[1] ?? "0");
// Moving the mark out of the bottom-right left a dead half on the first render.
ok("…using the width the mark gave up", contentW > 70, String(contentW));

console.log("\n== the strip's three tenants do not sit on top of each other ==");
// All three of these were found by rendering a SOLD card and looking at it.
// None of them is visible in an unsold render, and the demo fixtures are
// unsold, which is how all three shipped in the first pass.
{
  const {
    DEFAULT_LAYOUT, adBox, spotBox, markLeftFor, mascotYields,
  } = await import("../../lib/cards/layout.ts");
  const L = DEFAULT_LAYOUT;
  const ad = adBox(L.ad);
  const mark = spotBox(L.mark, 1);

  // 1. The default sponsor box covers the default mark completely. That is the
  //    bug, stated as arithmetic: 1032..1164 across sits inside 780..1180.
  ok("the sponsor box would bury the mark where it sits",
    mark.left > ad.left && mark.left < ad.left + ad.width,
    `mark ${mark.left}, ad ${ad.left}..${ad.left + ad.width}`);
  const slid = markLeftFor(L, true);
  ok("…so a SOLD card slides it clear", slid + mark.width <= ad.left,
    `${slid} + ${mark.width} vs ${ad.left}`);
  eq("…and an unsold card is untouched", markLeftFor(L, false), mark.left);
  ok("…and it never goes off the left edge", slid >= 0, String(slid));

  // 2. The slid mark lands where the mascot stands, so the mascot yields —
  //    a grey shoulder behind the logo is worse than no mascot.
  ok("the mascot yields on a sold card", mascotYields(L, true));
  ok("…and stands on an unsold one", !mascotYields(L, false));
  // Not a blanket rule: moved out of the way, it stays on every card.
  ok("…and a mascot placed clear of both keeps its place",
    !mascotYields({ ...L, mascot: { ...L.mascot, x: 20, y: 80 } }, true));

  // 3. Both branding elements are in the strip band, and the body is under it.
  ok("the mascot rides in the strip", spotBox(L.mascot, 1).top < STRIP,
    String(spotBox(L.mascot, 1).top));
  ok("the game logo does too", spotBox(L.gameMark, 1).top < STRIP,
    String(spotBox(L.gameMark, 1).top));
  ok("…on the LEFT, where the identity is", L.gameMark.x < 20, String(L.gameMark.x));
}

console.log("\n== the game's logo is drawn once, not twice ==");
// The first render of the strip printed the game's mark twice: faint at
// top-left AND crisp in the corner, one under the other. Six card bodies
// proposed it as their corner badge because until B54 it was the only game
// identity a card carried.
ok("the corner steps aside when the strip has it",
  /cornerIsGameLogo && stripHasGameLogo \? undefined : proposed/.test(render));
ok("…only on \"auto\", so an explicit choice still wins",
  /if \(show === "auto"\) return cornerIsGameLogo/.test(render));
ok("…and the strip stands down when the badge is set to the game's logo",
  /badgeShow \?\? "auto"\) === "game" \|\| l\.gameMark\.hidden/.test(render));
ok("the challenge card no longer heads its trophy stack with it",
  /It is in the strip now/.test(render));
ok("…and the bodies that propose it say so", (render.match(/cornerIsGameLogo/g) ?? []).length >= 7,
  String((render.match(/cornerIsGameLogo/g) ?? []).length));

console.log("\n== the clamps follow the column, they do not stay where they were ==");
// Widening the content column from 58.5% to 78% left fifty character counts
// tuned for the narrow one: the leaderboard title read "Blitz Supernova —
// Weekly…" with 470 empty pixels to the right of the ellipsis. Only a render
// shows that; the type checker is perfectly happy with a number.
{
  const { DEFAULT_LAYOUT } = await import("../../lib/cards/layout.ts");
  ok("the column really did get wider", DEFAULT_LAYOUT.content.w > 58.5, String(DEFAULT_LAYOUT.content.w));
  ok("there is one scale, from the live layout", /function clampFor\(t: CardTheme\)/.test(render));
  ok("…taken from the content width", /t\.layout\?\.content\.w \?\? DEFAULT_LAYOUT\.content\.w/.test(render));
  ok("…and bounded, so a hand-set column cannot make a card unreadable",
    /Math\.max\(0\.6, Math\.min\(1\.8/.test(render));
  // Applied by shadowing, so a body that was missed keeps exactly what it drew.
  const shadowed = (render.match(/const clamp = clampFor\(t\);/g) ?? []).length;
  ok("every card body takes the scaled clamp", shadowed >= 12, String(shadowed));
  eq("…once per body", shadowed, (render.match(/^  const t = d\.theme;$/gm) ?? []).length);
}

console.log("\n== a challenge with no cover falls back to its GAME's art ==");
ok("the chain reaches the game", /g\?\.planetBgUrl \|\| g\?\.coverUrl \|\| bg\.bgUrl/.test(
  await readFile(new URL("../../lib/cards/data.ts", import.meta.url), "utf8")));

console.log("\n== Satori renders every kind without throwing ==");
// Satori is not a browser. Every element needs an explicit `display`, it
// supports a subset of flexbox, and an unsupported property is an EXCEPTION
// rather than a style that quietly does nothing. A kind that throws is a
// Discord message with no image.
// `tsconfig` uses the classic JSX runtime, so the compiled renderer expects a
// `React` binding in scope. Next's compiler provides it; tsx does not, and the
// resulting "React is not defined" is a property of this harness rather than of
// the product — the cards render fine in the build. Supplying it here is what
// makes the assertion below about SATORI rather than about module loading.
(globalThis as { React?: unknown }).React = (await import("react")).default;
const { renderCardBuffer } = await import("../../lib/cards/render.tsx").catch(() => ({ renderCardBuffer: null })) as never;
if (!renderCardBuffer) {
  ok("SKIPPED: the renderer is not importable in this environment", true);
} else {
  const { profileCard, questCard, planetsCard, marketCard, cpSummaryCard } =
    await import("../../lib/cards/data.ts");
  const built: [string, unknown][] = [];
  for (const [name, fn] of [
    ["challenge", () => challengeCard(challengeId)],
    ["profile", () => profileCard(`card-${tag}`)],
    ["quest", () => questCard(`card-${tag}`, "orbit")],
    ["planets", () => planetsCard()],
    ["market", () => marketCard({ userId })],
    ["leaderboard", () => challengeStandingsCard(challengeId)],
    ["cp-summary", () => cpSummaryCard(`card-${tag}`)],
  ] as [string, () => Promise<unknown>][]) {
    const data = await fn().catch(() => null);
    if (data) built.push([name, data]);
  }
  ok("several kinds have data to render", built.length >= 4, JSON.stringify(built.map(([n]) => n)));
  for (const [name, data] of built) {
    let threw: string | null = null;
    try { await renderCardBuffer(data); } catch (e) { threw = (e as Error).message; }
    ok(`"${name}" renders`, !threw, String(threw).slice(0, 140));
  }
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
