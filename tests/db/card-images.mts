/**
 * EVERY IMAGE A CARD RENDERS GOES THROUGH `toEmbeddable`.
 *
 * Found in PRODUCTION runtime errors, not in this repo: the `planet` resolve
 * branch in lib/cards/render.tsx resolved `bg` and `logoUrl` and silently
 * skipped `globeUrl` — which the planet card renders as `d.globeUrl ||
 * d.logoUrl`.
 *
 * Production uploads are WebP. Satori cannot decode WebP, and lib/cards/img.ts
 * says why that matters in its own header: an undecodable image does not cost
 * you the image, it throws INSIDE the render and takes the whole card down.
 * Ten failures across seven users on /api/card/[kind] and
 * /api/discord/interactions — the bot's delivery surface — over a fortnight,
 * for the League of Legends, Fortnite and PUBG planets.
 *
 * The general defect is a resolve branch that does not know about a field its
 * own renderer reads, so this asserts the shape rather than the one field.
 *
 * (It lives in its own file because appending it to tests/db/cards.mts left it
 * silently unexecuted — the block never ran and the suite reported green. A
 * guard that does not run is worse than no guard, and the break test is what
 * showed it.)
 *
 *   DEMO_DB=1 npx tsx tests/db/card-images.mts
 */
process.env.DEMO_DB = "1";

import { readFileSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

const src = readFileSync(new URL("../../lib/cards/render.tsx", import.meta.url), "utf8");

console.log("== the planet branch resolves every image it draws ==");
{
  // `lastIndexOf`, not `indexOf`. There are TWO `case "planet":` — the body
  // dispatcher near the top and the resolve branch near the bottom — and
  // anchoring on the first one sliced the wrong region and failed against
  // correct code. The resolve branch is the later one.
  const branch = src.slice(src.lastIndexOf('case "planet":'), src.lastIndexOf('case "planets":'));
  ok("the branch is the RESOLVE one, not the body dispatcher",
    branch.includes("toEmbeddable"), branch.slice(0, 100));
  // Matches the CALL, not "globeUrl appears somewhere within 120 characters of
  // a toEmbeddable(". The loose version passed against a deliberately broken
  // build, because the destructure and the spread still mention globeUrl.
  const calls = [...branch.matchAll(/toEmbeddable\(([^)]*)\)/g)].map((m) => m[1]);
  ok("it resolves the globe", calls.some((a) => /globeUrl/.test(a)),
    `globeUrl is never passed to toEmbeddable — it reaches Satori raw, and one WebP upload takes the whole card down. calls: ${calls.join(" | ").slice(0, 160)}`);
  ok("…and still resolves the logo", /toEmbeddable\(d\.logoUrl/.test(branch));
}

console.log("== and the renderer really does draw it ==");
{
  // If this stops being true the assertion above is guarding nothing.
  ok("the planet card renders globeUrl", /d\.globeUrl/.test(src));
}

console.log("== nothing hands a raw url straight to an image src ==");
{
  // `src={d.something}` without a resolve is the same defect in another branch.
  // `toEmbeddable` returns a data URL, so a resolved field is safe; a field read
  // directly off the card data is not.
  const raw = [...src.matchAll(/src=\{(?:d|data)\.(\w*[Uu]rl)\}/g)].map((m) => m[1]);
  ok("no card body reads an image url straight off its data", raw.length === 0, raw.join(", "));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  - ${f}`); process.exit(1); }
