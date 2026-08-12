/**
 * WE ONLY CALL RIOT METHODS THE KEY IS APPROVED FOR.
 *
 * ===== WHY =====
 *
 * Riot approved a PERSONAL key: 39 methods. The development key the League
 * integration was built against carried 59. Nothing in the type system, the
 * build, or a code review distinguishes the two — an unapproved method compiles
 * fine, deploys fine, and then returns 403 to one gamer, inside one sync, in
 * production, while every other provider keeps working. The audit's whole theme
 * was faults that only appear on the live product; this is one waiting to
 * happen, and it is cheap to make impossible instead.
 *
 * So `lib/providers/riot-methods.ts` writes the approved set down once, and
 * this suite asserts that every Riot URL anywhere in `lib/providers/` is inside
 * it. Reaching for a method we do not have goes red here rather than there.
 *
 * ===== THE THREE THINGS I CHECKED BY HAND FIRST =====
 *
 * Before writing a guard I confirmed the current code actually passes it, since
 * a guard that needed the code changed to satisfy it would be a fix in
 * disguise:
 *
 *   summoner-v4 has only `by-puuid` on this key. adapters.ts and
 *   riot-lol-rich.ts both call `by-puuid`. Fine.
 *
 *   spectator-v5's path SAYS `active-games/by-summoner/` but its parameter is
 *   `{encryptedPUUID}`. riot-lol-rich.ts:145 passes a puuid. That looks wrong
 *   and is right, which is exactly the sort of thing a later reader "fixes".
 *
 *   `/val/status/v1/platform-data` in riot-verify.ts is NOT approved — and is
 *   called deliberately, as the only available probe for "have we been granted
 *   production yet". It is listed in RIOT_PROBE_ONLY_PATHS with that reason.
 *   The exemption is one named path in the source of truth, not a pattern:
 *   a second one has to be argued for in a diff.
 *
 *   DEMO_DB=1 npx tsx tests/db/riot-methods.mts
 */
process.env.DEMO_DB = "1";

import { readFileSync, readdirSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
/** Source with comments removed — what a reader of the RUNNING product sees. */
const code = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");

const {
  RIOT_APPROVED_PATHS, RIOT_PROBE_ONLY_PATHS, RIOT_SUMMONER_V4_PER_MINUTE,
  riotPathShape, isApprovedRiotPath,
} = await import("../../lib/providers/riot-methods.ts");

const dir = new URL("../../lib/providers/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));

/** Every Riot URL written anywhere in the provider layer, with where it is. */
type Call = { file: string; line: number; url: string; shape: string };
const calls: Call[] = [];
for (const f of files) {
  if (f === "riot-methods.ts") continue; // the list itself is not a call site
  const src = readFileSync(new URL(f, dir), "utf8");
  src.split("\n").forEach((line, i) => {
    // Only real URLs, not the word "riotgames" in prose: require the host form.
    //
    // The terminator set deliberately ALLOWS `)` and `(`. The first version
    // excluded them and truncated
    //   .../by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}
    // at the first bracket, reducing a two-parameter path to one and reporting
    // adapters.ts as calling an unapproved method. A guard whose extractor is
    // wrong doesn't fail safe — it accuses working code, and the fix people
    // reach for is to loosen the guard.
    for (const m of line.matchAll(/https:\/\/[^`"'\s]*\.api\.riotgames\.com[^`"'\s,;]*/g)) {
      const url = m[0];
      calls.push({ file: f, line: i + 1, url, shape: riotPathShape(url) });
    }
  });
}

console.log("== the sweep found the call sites at all ==");
{
  // A guard that silently matches nothing passes forever. This is the
  // tripwire under the tripwire.
  ok("there are Riot calls in lib/providers to check", calls.length >= 8, String(calls.length));
  const filesSeen = new Set(calls.map((c) => c.file));
  for (const expected of ["adapters.ts", "riot-lol-rich.ts", "riot-verify.ts"]) {
    ok(`…including ${expected}`, filesSeen.has(expected), [...filesSeen].join(", "));
  }
}

console.log("== every call is on the approved key ==");
{
  const probes = new Set(RIOT_PROBE_ONLY_PATHS);
  const offenders = calls.filter((c) => !isApprovedRiotPath(c.shape) && !probes.has(c.shape));
  ok("no provider calls a method outside the approved 39",
    offenders.length === 0,
    offenders.map((c) => `${c.file}:${c.line} ${c.shape}`).join(" · "));

  // …and the exemption stays one path with a reason, rather than growing into
  // a general escape hatch.
  ok("the probe-only exemption is a single named path",
    RIOT_PROBE_ONLY_PATHS.length === 1, RIOT_PROBE_ONLY_PATHS.join(", "));
  const probed = calls.filter((c) => probes.has(c.shape));
  ok("…and it is only ever called from the admin health probe",
    probed.every((c) => c.file === "riot-verify.ts"),
    probed.map((c) => `${c.file}:${c.line}`).join(", "));
}

console.log("== the shape reducer is not just saying yes to everything ==");
{
  // If riotPathShape or isApprovedRiotPath were sloppy, the block above would
  // pass no matter what the code called. Prove it rejects.
  ok("a plausible but unapproved method is rejected",
    !isApprovedRiotPath(riotPathShape("https://euw1.api.riotgames.com/lol/summoner/v4/summoners/by-name/${n}")),
    "summoner-v4 by-name is NOT on this key and must not pass");
  ok("a val method is rejected",
    !isApprovedRiotPath("/val/match/v1/matches/{}"));
  ok("wrong segment count is rejected",
    !isApprovedRiotPath("/lol/summoner/v4/summoners/by-puuid/{}/extra"));
  ok("an approved method is accepted",
    isApprovedRiotPath(riotPathShape("https://euw1.api.riotgames.com/lol/league/v4/entries/by-puuid/${id}")));
  ok("…including with a query string and a literal segment",
    isApprovedRiotPath(riotPathShape(
      "https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Faker/KR1?x=1")));
  ok("…and champion mastery /top, which is its own method",
    isApprovedRiotPath(riotPathShape(
      "https://euw1.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${p}/top?count=8")));
}

console.log("== the two facts that look like bugs and are not ==");
{
  // summoner-v4 by-name does not exist on this key, so linking MUST start at a
  // Riot ID. If someone ever adds a by-name path this is where it dies.
  ok("no by-name or by-account summoner lookup anywhere",
    !calls.some((c) => /summoner\/v4\/summoners\/by-(name|account)/.test(c.shape)),
    "summoner-v4 offers only by-puuid; link via account-v1 by-riot-id first");

  // spectator-v5's path says by-summoner and its parameter is a PUUID.
  const spec = calls.find((c) => c.shape.includes("spectator/v5"));
  ok("the spectator call exists", !!spec);
  if (spec) {
    const src = readFileSync(new URL(spec.file, dir), "utf8").split("\n")[spec.line - 1];
    ok("…and passes a puuid, not a summoner id",
      /\$\{puuid\}|\$\{[^}]*[Pp]uuid[^}]*\}/.test(src), src.trim().slice(0, 120));
  }
}

console.log("== the list itself is the transcribed one ==");
{
  ok("37 distinct approved paths (39 rows, two listed twice)",
    RIOT_APPROVED_PATHS.length === 37, String(RIOT_APPROVED_PATHS.length));
  ok("…with no duplicates", new Set(RIOT_APPROVED_PATHS).size === RIOT_APPROVED_PATHS.length);
  ok("…and no val method smuggled into the approved set",
    !RIOT_APPROVED_PATHS.some((p) => p.startsWith("/val/")));
  ok("the binding rate limit is recorded", RIOT_SUMMONER_V4_PER_MINUTE === 1600,
    String(RIOT_SUMMONER_V4_PER_MINUTE));
}

console.log("== nothing still calls the key a development key ==");
{
  // The old comment said we had a dev key, and the health note told an operator
  // to regenerate it because dev keys expire after 24 hours. Personal keys do
  // not expire, so that note sent people to fix the wrong thing during an
  // outage.
  //
  // ===== TWICE THIS CHECK CRIED WOLF ON ITS OWN RETRACTION =====
  //
  // Version one scanned raw source and went red on the three files that EXPLAIN
  // the correction. Version two stripped comments, which fixed the two .ts
  // files and did nothing for the .md — a document has no comments, and the
  // sentence "Development keys die after 24 hours" is a true statement of the
  // fact being corrected, sitting one clause after "A personal key does not
  // expire". The ladder sweep hit this exact wall.
  //
  // So the target is no longer the FACT, which is true and worth stating. It is
  // the ADVICE, which was wrong: telling an operator whose League has stopped
  // working to go and regenerate an expired key. That is the sentence that
  // wasted somebody's outage, and it is the one thing here nobody has a
  // legitimate reason to write.
  //
  // Paired with a positive assertion, which is the stronger half: a guard that
  // only forbids can be satisfied by saying nothing at all.
  const targets = [
    "lib/providers/riot-verify.ts",
    "app/admin/linked-accounts/page.tsx",
    "docs/SETUP.md",
  ];
  for (const t of targets) {
    // Comments are stripped from SOURCE files and only from source files. A
    // comment reaches no operator, so the paragraph in riot-verify.ts recording
    // what the note used to say is not this check's business. A markdown file
    // has no such distinction — every line of it is read — which is precisely
    // why the pattern below had to be narrowed to the advice.
    const src = /\.tsx?$/.test(t) ? code(t) : readFileSync(new URL(`../../${t}`, import.meta.url), "utf8");
    const bad = /regenerate[^.\n]{0,90}(expired?|24 ?hours?)/i.test(src)
      || /(expires?|dies)[^.\n]{0,50}24 ?hours?[^.\n]{0,50}regenerat/i.test(src);
    ok(`${t} never advises regenerating an "expired" key`, !bad,
      (src.match(/[^.\n]{0,60}regenerat[^.\n]{0,60}/i) ?? [""])[0].trim());
  }

  const setup = readFileSync(new URL("../../docs/SETUP.md", import.meta.url), "utf8");
  ok("SETUP.md states plainly that a personal key does not expire",
    /personal key does not expire/i.test(setup),
    "the correction is not written down where an operator will find it");
  ok("…and records that the approved key is personal, not production",
    /personal\b[^.\n]{0,80}\b(not production|39 methods)/i.test(setup));

  const verify = readFileSync(new URL("../../lib/providers/riot-verify.ts", import.meta.url), "utf8");
  ok("the health note itself says a personal key does not expire",
    /"[^"]*personal key does not expire[^"]*"/i.test(verify),
    "the sentence an operator reads mid-outage no longer says it");
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  - ${f}`); process.exit(1); }
