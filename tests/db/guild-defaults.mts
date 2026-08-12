/**
 * A SERVER WE HAVE NO ROW FOR IS AT THE DEFAULT, NOT AT "OFF". B7.
 *
 * ===== THE DEFECT, AND WHY MY FIRST DIAGNOSIS WAS WRONG =====
 *
 * The audit observed this in the live bot: an owner opened the admin card on a
 * fresh server and read "Sponsored posts: off". They pressed something else
 * entirely — turning the daily post off — and the same card came back saying
 * "Sponsored posts: ON". Nobody had agreed to anything.
 *
 * I guessed `upsertGuild` was defaulting the column. It is not. Reproducing it
 * showed the real shape:
 *
 *   ad_opt_in defaults to TRUE in the schema — sponsored posts are opt-OUT.
 *   The card rendered `guild?.adOptIn`. With no row yet that is `undefined`,
 *   which is falsy, which prints "off". The first upsertGuild — triggered by
 *   ANY setting — creates the row at the column default, and the label flips.
 *
 * So the card was describing a server it had no record of, and `?.` on a
 * boolean silently inverts the meaning of a missing row.
 *
 * The daily-post toggle beside it tests `=== false`, so a missing row falls
 * through to "on" and matches its own column default. Two toggles, two
 * spellings, one of them inverted for exactly the servers that had not been
 * recorded yet.
 *
 *   DEMO_DB=1 npx tsx tests/db/guild-defaults.mts
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
  ok(name, got === want, `got ${String(got)}, want ${String(want)}`);
const code = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");

const { AD_OPT_IN_DEFAULT } = await import("../../lib/discord/config.ts");
const { upsertGuild, getGuildRow } = await import("../../lib/discord/guilds.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq } = await import("drizzle-orm");

const db = await getDb();
const G = "7000000000000000777";
const clean = () => db.delete(schema.discordGuilds).where(sqlEq(schema.discordGuilds.guildId, G));

console.log("== the column and the card agree about a brand-new server ==");
{
  await clean();

  // What the CARD would show for a server with no row at all. This is the exact
  // expression the admin screen uses.
  const noRow = await getGuildRow(G);
  const shownBefore = (noRow?.adOptIn ?? AD_OPT_IN_DEFAULT);
  const shownByOldCode = !!noRow?.adOptIn;

  // The row is then created by the first setting change — any setting.
  await upsertGuild(G, { announcementsEnabled: false });
  const row = await getGuildRow(G);
  eq("the row is created at the column default", row?.adOptIn, AD_OPT_IN_DEFAULT);
  eq("…and the owner's actual change stuck", row?.announcementsEnabled, false);

  // THE BUG: what the card said before, versus what is true after — with the
  // owner having asked for neither.
  ok("the old expression flipped across an unrelated change",
    shownByOldCode !== row?.adOptIn,
    "if this fails the fixture no longer reproduces the defect");
  eq("the fixed expression does not", shownBefore, row?.adOptIn);

  await clean();
}

console.log("== the default is stated once ==");
{
  const cfg = code("lib/discord/config.ts");
  ok("config.ts declares it", /export const AD_OPT_IN_DEFAULT/.test(cfg));

  const sch = code("lib/db/schema.ts");
  ok("the schema reads it rather than repeating a literal",
    /ad_opt_in"\)\.notNull\(\)\.default\(AD_OPT_IN_DEFAULT\)/.test(sch),
    "the column default is a literal again — it can now disagree with the card");

  const screens = code("lib/discord/screens.ts");
  ok("the card reads it too", /guild\?\.adOptIn \?\? AD_OPT_IN_DEFAULT/.test(screens));
  // `\?(?!\?)` — a single `?`, not the `??` of the fix. Without the negative
  // lookahead this matched the corrected line too and went red against the fix.
  ok("…and never renders a missing row through a bare optional chain",
    !/guild\?\.adOptIn \?(?!\?)/.test(screens),
    "`guild?.adOptIn ? on : off` is back — undefined prints as 'off'");
}

console.log("== and no other boolean setting has the same shape ==");
{
  // The general form of the defect: a nullable row read with `?.` and used
  // directly as a truth value, for a column whose default is TRUE. The
  // daily-post toggle avoids it by testing `=== false`.
  const screens = code("lib/discord/screens.ts");
  const bare = [...screens.matchAll(/guild\?\.(\w+)\s*\?[^?]/g)].map((m) => m[1]);
  ok("no guild boolean is rendered straight off an optional chain",
    bare.length === 0, bare.join(", "));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  - ${f}`); process.exit(1); }
