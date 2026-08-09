// No Riot game is sold to a brand. B114.
//
// ===== THE DECISION, AND WHY IT IS CODE RATHER THAN A NOTE =====
//
// We are on a Riot **development** key. It expires every 24 hours and is
// rotated by hand; a production key has been applied for and not granted.
// Riot's API terms do not permit a commercial contest on a dev key, so the
// owner's call is: no Riot game is sold to a brand until the production key
// arrives.
//
// That is exactly the kind of decision a person forgets on a Tuesday six weeks
// from now while typing a campaign for a brand who asked for League. So it is a
// rule with a test behind it.
//
// ===== WHAT IS NOT BLOCKED, WHICH IS MOST OF IT =====
//
// Gamers still link Riot accounts, still appear on the League and VALORANT
// boards, still enter unsponsored challenges, and a server owner may still buy
// a private challenge for their own members. Only a BRAND paying for a
// competition on Riot's data is withheld — that is what their terms are about,
// and gutting the game would punish gamers for a paperwork state they did not
// cause.
//
//   DEMO_DB=1 npx tsx tests/db/sponsorable.mts

process.env.DEMO_DB = "1";

import { readFileSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const {
  sponsorBlockFor, isSponsorable, sponsorableGames, blockedGames, checkSponsorable,
} = await import("../../lib/sponsorable.ts");
const { PROVIDERS, GAMES } = await import("../../lib/providers/registry.ts");

console.log("== both Riot games are withheld from brands ==");
{
  for (const game of ["League of Legends", "VALORANT"]) {
    ok(`${game} is blocked`, !isSponsorable(game), sponsorBlockFor(game) ?? "no reason given");
    const why = sponsorBlockFor(game) ?? "";
    ok(`…and says why`, /development key/i.test(why) && /production key/i.test(why),
      "a block with no reason is a block somebody deletes");
  }
  const blocked = blockedGames().map((b) => b.game).sort();
  eq("exactly those two", blocked, ["League of Legends", "VALORANT"]);
}

console.log("\n== everything else is still for sale ==");
{
  const sellable = sponsorableGames();
  ok("there is still a catalogue", sellable.length >= 3, sellable.join(", "));
  ok("…and it excludes the blocked ones",
    !sellable.includes("League of Legends") && !sellable.includes("VALORANT"));
  // The sellable list is derived from the SAME registry, so a game added
  // tomorrow is sellable without anybody remembering to add it anywhere.
  for (const g of sellable) ok(`${g} is sponsorable`, isSponsorable(g));
  ok("case does not matter", !isSponsorable("league of legends") && !isSponsorable("VALORANT"));
  ok("an unknown game is not blocked", isSponsorable("Some Game We Do Not Carry"),
    "a default of 'blocked' would silently stop selling anything new");
  ok("an empty game is not blocked", isSponsorable(""));
}

console.log("\n== the check refuses a sale, not a challenge ==");
{
  // This is the whole shape of the rule. An unsponsored Riot challenge is fine
  // and is most of what we run there.
  eq("no brand, no problem", checkSponsorable("League of Legends", null), { ok: true });
  eq("…even with an empty string", checkSponsorable("VALORANT", ""), { ok: true });

  const refused = checkSponsorable("League of Legends", "brand-123");
  eq("a brand on a blocked game is refused", refused.ok, false);
  ok("…with the reason, not just 'no'",
    !refused.ok && /development key/i.test(refused.error),
    "an operator who is not told why will try again tomorrow");
  ok("…and with what to do instead",
    !refused.ok && /unsponsored/.test(refused.error) && /another game/.test(refused.error));

  eq("a brand on any other game is fine",
    checkSponsorable(sponsorableGames()[0] ?? "Chess", "brand-123"), { ok: true });
}

console.log("\n== one place decides, and the flag lives on the provider ==");
{
  // A rule enforced in one of three places is a rule with two ways round it.
  const lib = code("lib/sponsorable.ts");
  ok("the block is read off the provider registry", /PROVIDERS\.find/.test(lib) && /p\.sponsorBlock/.test(lib));
  ok("…and there is no second list of game names",
    !/"League of Legends"|"VALORANT"/.test(lib),
    "a hard-coded list is the thing somebody updates in one file and not the other");

  const reg = code("lib/providers/registry.ts");
  eq("exactly two providers carry the flag",
    PROVIDERS.filter((p) => p.sponsorBlock).map((p) => p.id).sort(),
    ["riot-lol", "riot-valorant"]);
  ok("the type documents it", /sponsorBlock\?: string;/.test(reg));

  // Every enforcement point calls the shared function rather than testing the
  // game name itself.
  for (const f of ["app/actions/admin.ts", "app/brands/[slug]/page.tsx", "components/ChallengeBuilder.tsx"]) {
    const src = code(f);
    ok(`${f} calls the shared check`,
      /checkSponsorable|isSponsorable|sponsorBlockFor/.test(src));
    ok(`…and does not name a game itself`,
      !/League of Legends|VALORANT/.test(src),
      "the whole point of the flag is that there is one place to change when the key arrives");
  }
}

console.log("\n== the save path REFUSES rather than quietly dropping ==");
{
  const admin = code("app/actions/admin.ts");
  ok("the check runs before the campaign is created",
    admin.indexOf("checkSponsorable") < admin.indexOf("ensureCampaignFor"),
    "creating a campaign for a sale we then refuse leaves an orphan");
  ok("…and returns an error", /if \(!gate\.ok\) return \{ error: gate\.error \};/.test(admin),
    "saving it unsponsored would look like it worked, and the brand would find the gap");
  // The co-sponsor above it DROPS an invalid pick; this must not.
  ok("…unlike the co-sponsor, which is dropped on purpose",
    /co\.ok \? co\.coSponsorBrandId : null/.test(admin),
    "losing a second brand is recoverable; losing a whole sale silently is not");
}

console.log("\n== the brand never sees a game we cannot sell ==");
{
  const page = code("app/brands/[slug]/page.tsx");
  ok("the builder list is filtered", /reach\.byGame\.filter\(\(g\) => isSponsorable\(g\.game\)\)/.test(page),
    "a greyed row on a buying screen reads as 'coming soon, ask us'");
  const builder = code("components/ChallengeBuilder.tsx");
  ok("but STAFF are told, rather than shown a shorter list",
    /disabled=\{!!sponsorBlock\}/.test(builder) && /cannot carry a sponsor yet/.test(read("components/ChallengeBuilder.tsx")),
    "an admin hunting for a dropdown that silently lost its contents is worse than a disabled one");
}

console.log("\n== gamers are not punished for a paperwork state ==");
{
  // The blocked games must still be playable, linkable and on the board.
  const reg = code("lib/providers/registry.ts");
  for (const id of ["riot-lol"]) {
    const p = PROVIDERS.find((x) => x.id === id)!;
    ok(`${p.game} is still a linkable provider`, !p.identityOnly,
      "blocking the sale must not block the gamer");
    ok(`…and still has metrics to score`, p.capabilities.length > 0);
  }
  ok("…and it is still in the games list", GAMES.includes("League of Legends"));
  void reg;
}

console.log("\n== when the key arrives, there is exactly one line to delete ==");
{
  const reg = read("lib/providers/registry.ts");
  const hits = (reg.match(/sponsorBlock: "/g) ?? []).length;
  eq("two entries, one per Riot game", hits, 2);
  ok("the reason is identical in both, so neither drifts",
    (reg.match(/We are on a Riot development key/g) ?? []).length === 2);
  ok("and the file says what to do when it changes",
    /Delete the `sponsorBlock` line/.test(read("lib/sponsorable.ts")));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
