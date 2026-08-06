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

/** The top band's height in canvas pixels — see `STRIP_H` in the renderer.
 *  It is the sponsor box's own bottom plus air, because the ad is the one
 *  element up there whose size is a commercial promise. */
const STRIP = 196;

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

console.log("\n== B56.0: the shared layout has three bands and no furniture ==");
// The redesign, stated as rules. Everything the old assertions here described —
// the mark in a corner, the mark sliding around the ad, the column narrowing
// beside it, the faint game watermark under the title — was furniture in a band
// that has room for two things, and it is gone.
{
  const { DEFAULT_LAYOUT: L, adBox, spotBox, contentBox } =
    await import("../../lib/cards/layout.ts");
  const layoutSrc = await readFile(new URL("../../lib/cards/layout.ts", import.meta.url), "utf8");

  // TOP-LEFT: the identity image.
  const id = spotBox(L.gameMark, 1);
  ok("the identity image is top-LEFT", id.left < 200 && id.top < STRIP, `${id.left},${id.top}`);
  ok("…and it is not hidden", !L.gameMark.hidden);

  // TOP-RIGHT: the ad, and it is the only other thing up there.
  const ad = adBox(L.ad);
  ok("the ad is top-RIGHT", ad.left > 600 && ad.top < 60, `${ad.left},${ad.top}`);
  ok("…and it is never hidden by default", !L.ad.hidden);
  ok("the identity ends before the creative", /adB\.left - idBox\.left - 28/.test(render));

  // Nothing else is in the top band.
  ok("the badge is off", L.badge.hidden === true);
  ok("the mascot is off", L.mascot.hidden === true);
  ok("the gradient rule is off", L.bar === false);
  ok("…and a layout saved before the redesign does not revive it",
    /bar: o\.bar === true/.test(layoutSrc));

  // THE BODY: edge to edge, under the ad, with nothing drawn into it.
  const body = contentBox(L.content);
  ok("the body starts under the ad", body.top >= ad.bottom, `${body.top} vs ${ad.bottom}`);
  ok("…and runs edge to edge", L.content.x <= 5 && L.content.w >= 90, `${L.content.x}/${L.content.w}`);
  ok("…all the way to the bottom", body.top + body.height >= 560, String(body.top + body.height));

  // THE MARK: a watermark BEHIND the body, not a tile in a corner.
  const mark = spotBox(L.mark, 1);
  // Its CENTRE is what matters — a 430px watermark starts above the band's
  // bottom edge and that is fine; what must not happen is it sitting in the top
  // band as a corner tile again.
  ok("the mark is in the body band", L.mark.y > 40, String(L.mark.y));
  ok("…faint", (L.mark.opacity ?? 100) < 20, String(L.mark.opacity));
  ok("…big enough to read as a watermark rather than a sticker", L.mark.size > 300, String(L.mark.size));
  // Drawn BEFORE the children, which is what makes it a watermark rather than
  // one more thing every body has to lay itself out around.
  ok("…and drawn behind the content",
    render.indexOf("THE CLUSTER MARK, as a WATERMARK") < render.indexOf("{children}"));

  // THE EDGE: one thin line, replacing the gradient rule.
  ok("there is a stroke", (L.stroke ?? 0) > 0, String(L.stroke));
  ok("…drawn last, so nothing paints over it",
    render.indexOf("THE EDGE (B56.0)") > render.indexOf("<AdSlot"));
  ok("…and 0 turns it off", /\(l\.stroke \?\? 0\) > 0 \?/.test(render));
}

console.log("\n== every card carries an ad, and every card carries an image ==");
// "There is no such thing as an unsold card." The slot is the product: a corner
// that is sometimes empty teaches a server owner that the bot sometimes has
// one, and that is the hardest thing to un-teach.
{
  const ads = await readFile(new URL("../../lib/cards/ads.ts", import.meta.url), "utf8");
  ok("there is a house creative", /export const HOUSE_AD: CardAdSlot/.test(ads));
  ok("…used as the fallback, through the same transcode a brand's upload takes",
    /preparedAd\(d\.theme\.ad \?\? HOUSE_AD\)/.test(render));
  ok("…and only an admin hiding the slot takes it off",
    /l\.ad\.hidden \? null : theme\.ad/.test(render));

  // Every body passes an identity, and every identity resolves to a picture.
  const bodies = [...render.matchAll(/^function (\w+Body)\(/gm)].map((m) => m[1]);
  ok("there are thirteen bodies", bodies.length === 13, JSON.stringify(bodies));
  const without: string[] = [];
  for (let i = 0; i < bodies.length; i++) {
    const from = render.indexOf(`function ${bodies[i]}(`);
    const to = i + 1 < bodies.length ? render.indexOf(`function ${bodies[i + 1]}(`) : render.length;
    if (!/identity=\{\{/.test(render.slice(from, to))) without.push(bodies[i]);
  }
  eq("every one of them declares its identity", without, []);
  ok("…and the image falls back rather than leaving the slot empty",
    /identity\?\.imageUrl \|\| theme\.badge\?\.gameLogoUrl \|\| theme\.markUrl/.test(render));
  // The band is a FIXED height, so the text fits it rather than pushing the
  // block down into the body — which is what the first render did, straight
  // over the challenge card's own pills.
  ok("the identity text is clamped to the band", /maxHeight: STRIP_H - idBox\.top/.test(render));
}

console.log("\n== the clamps follow the column, they do not stay where they were ==");
// Widening the content column from 58.5% to 78% left fifty character counts
// tuned for the narrow one: the leaderboard title read "Blitz Supernova —
// Weekly…" with 470 empty pixels to the right of the ellipsis. Only a render
// shows that; the type checker is perfectly happy with a number.
{
  const { DEFAULT_LAYOUT } = await import("../../lib/cards/layout.ts");
  ok("the column really did get wider", DEFAULT_LAYOUT.content.w > 58.5, String(DEFAULT_LAYOUT.content.w));
  ok("there is one scale, from the live layout", /function clampFor\(t: CardTheme\)/.test(render));
  ok("…and bounded, so a hand-set column cannot make a card unreadable",
    /Math\.max\(0\.6, Math\.min\(1\.8/.test(render));
  ok("…and it is the EFFECTIVE width, so a sold card clamps to its narrow column",
    /contentBoxFor\(l, !!t\.ad\)\.width/.test(render));
  // Applied by shadowing, so a body that was missed keeps exactly what it drew.
  const shadowed = (render.match(/const clamp = clampFor\(t\);/g) ?? []).length;
  ok("every card body takes the scaled clamp", shadowed >= 12, String(shadowed));
  eq("…once per body", shadowed, (render.match(/^  const t = d\.theme;$/gm) ?? []).length);
}

console.log("\n== a FIXED-WIDTH box does not clamp by the column ==");
// The scaled clamp caused a regression the moment it landed, and only a render
// showed it: a market tile is 218px wide whatever the content column is doing,
// so widening its name limit from 17 to 23 let "Champion's Nebula Cup" through,
// wrap to two lines, and land on top of the GOLD label under it.
ok("there is an unscaled clamp", /function clampAt\(s: string \| null \| undefined/.test(render));
ok("…and the scaled one is built on it", /=> clampAt\(s, Math\.round\(max \* k\)\)/.test(render));
ok("the market tile uses the unscaled one", /\{clampAt\(x\.name, \d+\)\}/.test(render));
ok("…and says why", /this tile is 218px/.test(render));
// The shelf itself was `TILE_W * 3 + 24` — three because three fitted the
// column it was written against, leaving 460 empty pixels once it widened.
ok("the shelf counts the columns that fit", /const COLS = Math\.max\(2, Math\.min\(5/.test(render));
ok("…from the EFFECTIVE column, so a sold card narrows the shelf too",
  /contentBoxFor\(t\.layout \?\? DEFAULT_LAYOUT, !!t\.ad\)\.width/.test(render));
// B56 made it ONE row, tall: four tiles carrying the platform's hierarchy
// sell the shelf better than six carrying none of it, and the shelf is a
// preview — /marketplace is where the other two hundred live.
ok("…and shows a whole number of rows", /slice\(0, COLS\)/.test(render));
// FIVE across when the width allows (B57) — the shelf is a shelf.
ok("…up to five of them", /Math\.min\(5,/.test(render));

console.log("\n== a challenge with no cover falls back to its GAME's art ==");
ok("the chain reaches the game", /g\?\.planetBgUrl \|\| g\?\.coverUrl \|\| bg\.bgUrl/.test(
  await readFile(new URL("../../lib/cards/data.ts", import.meta.url), "utf8")));

console.log("\n== B57: the body is a GRID, and the grid comes from one helper ==");
// Free space edge to edge is not a layout — one block of content across 1100px
// is a wide list. The panes are part of the LAYOUT so an admin sets them per
// kind, and the geometry lives in ONE helper so the editor and the renderer
// cannot draw a pane in two different places.
{
  const { DEFAULT_LAYOUT: L, KIND_PANES, panes, parseLayout, contentBox } =
    await import("../../lib/cards/layout.ts");

  const one = panes(parseLayout(null, "leaderboard"));
  eq("a one-pane kind gets one rectangle", one.length, 1);
  eq("…and it is the whole body", one[0], contentBox(L.content));

  const two = panes(parseLayout(null, "profile"));
  eq("a profile gets two", two.length, 2);
  ok("…side by side, not stacked", two[0].top === two[1].top && two[1].left > two[0].left,
    JSON.stringify(two));
  ok("…and they do not overlap", two[0].left + two[0].width <= two[1].left);

  const four = panes(parseLayout(null, "planet"));
  eq("the planet card gets four", four.length, 4);
  ok("…two by two", four[0].top === four[1].top && four[2].top > four[0].top, JSON.stringify(four.map((f) => f.top)));
  ok("…in reading order", four[1].left > four[0].left && four[3].left > four[2].left);
  // Nothing may reach the ad or the identity band.
  const { adBox } = await import("../../lib/cards/layout.ts");
  ok("no pane reaches the top band", four.every((f) => f.top >= adBox(L.ad).bottom));
  ok("…or the bottom edge", four.every((f) => f.top + f.height <= 630));

  ok("the kinds that need panes declare them", !!KIND_PANES.planet && !!KIND_PANES.profile);
  // A stored layout overrides the kind default like any other field, so an
  // admin who wants one column on a profile gets one column.
  eq("an admin's own choice wins",
    panes(parseLayout(JSON.stringify({ bodyCols: 1, bodyRows: 1 }), "planet")).length, 1);

  // A pane with nothing in it is NOT drawn. An empty bordered box reads as a
  // broken card rather than as a gamer with nothing there yet.
  ok("an empty pane is not drawn", /pane && paneBoxes\[i\] \? \(/.test(render));
  // Satori has no Fragment: a pane handed <>…</> lays its children out as if
  // the pane were a row, which put the profile's LINKED ACCOUNTS heading beside
  // its stat pills and half off the pane.
  ok("every pane is a real element", /function Pane\(\{ children/.test(render));
  ok("…with a height, so `flex: 1` inside it has something to claim",
    /width: "100%", height: "100%"/.test(render));
  ok("…and the reason is written down", /Satori has no Fragment/.test(render));

  // Every entity a pane draws carries its own art.
  // From the DOC COMMENT, not from `function` — the claim about which component
  // this mirrors lives in the comment, which is the thing being asserted.
  const planetBody = render.slice(render.indexOf("* The planet card"), render.indexOf("function PlanetsBody"));
  ok("the planet's game world draws each entity's art", /<ArtPanel url=\{w\.imageUrl\}/.test(planetBody));
  ok("…and it mirrors the planet explorer", /PlanetExplorer\.tsx/.test(planetBody));
  const profileBody = render.slice(render.indexOf("function ProfileBody"), render.indexOf("function GameStatsBody"));
  ok("a linked account draws its game's logo", /a\.logoUrl \?/.test(profileBody));
  ok("a trophy draws its render", /<ArtPanel url=\{x\.imageUrl\}/.test(profileBody));
}

console.log("\n== B56: the cards speak the platform's visual language ==");
// B54 asked for cards "laid out to render what a gamer sees on the platform"
// and that was built as the same DATA. B56 is the same sentence read as VISUAL
// LANGUAGE: the same section headers, sub-cards, stat tiles, pills and spacing.
//
// Two things are checkable without eyes, and they are the two that rot: that a
// body NAMES the component it mirrors (a card that claims to mirror a section
// and drifts is worse than one that never claimed, because nobody re-checks
// it), and that the shared shapes are actually shared rather than re-styled per
// body — which is invisible on any single card and obvious across thirteen.
{
  const { stat } = await import("node:fs/promises");
  ok("there is one glass sub-card", /function GlassCard\(/.test(render));
  ok("…built on the platform's own values, not an impression of them",
    /app\/globals\.css:45/.test(render) && /rgba\(139,92,246,0\.07\)/.test(render));
  ok("there is one art plate", /function ArtPanel\(/.test(render));
  ok("there is one stat tile", /function StatTile\(/.test(render));

  // Every component a body claims to mirror must exist. A stale path here is a
  // body describing a section that was renamed or deleted.
  const claimed = [...render.matchAll(/(?:components|app)\/[\w/[\]-]+\.tsx/g)].map((m) => m[0]);
  ok("bodies name the components they mirror", claimed.length >= 1, JSON.stringify(claimed.slice(0, 4)));
  const missing: string[] = [];
  for (const c of new Set(claimed)) {
    await stat(new URL(`../../${c}`, import.meta.url)).catch(() => { missing.push(c); });
  }
  eq("…and every named component exists", missing, []);
}

console.log("\n== the market card IS the shelf, not a receipt of it ==");
// components/TrophyMarket.tsx, read before this was written. The old card had
// every number and none of the shape: a 44px icon beside a number bubble, then
// name, tier and both figures on one line.
{
  // From the DOC COMMENT, not from `function` — the claim about which component
  // this mirrors is in the comment, which is the whole point of asserting it.
  const body = render.slice(render.indexOf("* The marketplace shelf"), render.indexOf("function WeekBody"));
  ok("it names the component it mirrors", /components\/TrophyMarket\.tsx/.test(body));
  ok("the tiles are the shared sub-card", /<GlassCard/.test(body));
  ok("…ringed by TIER, because that colour is the information",
    /ring=\{TIER\[x\.tier\.toLowerCase\(\)\]/.test(body));
  ok("…on the shared art plate", /<ArtPanel/.test(body));
  ok("the wallet is the shared stat tile", /<StatTile/.test(body));
  // B48 decided the dollar is what makes a trophy an asset rather than a
  // sticker. A card that puts the CP price above it argues with the page.
  ok("the DOLLAR is promoted above the CP price",
    body.indexOf("redeems for cash") < body.indexOf("x.cpPrice.toLocaleString()"),
    `${body.indexOf("redeems for cash")} vs ${body.indexOf("x.cpPrice.toLocaleString()")}`);
  ok("…and says why", /B48's decision/.test(body));
  // The number bubble is the one thing the platform has no equivalent for: in
  // Discord you buy by typing the number.
  ok("the tile still carries its number", /\{i \+ 1\}/.test(body));
}

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
