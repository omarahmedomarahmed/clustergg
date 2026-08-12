/**
 * WHAT THE BOT ACTUALLY SENDS TO DISCORD. B4, B5.
 *
 * Both found by driving the live bot with signed interactions and reading the
 * outbound payloads, not by reading the code.
 *
 * B5 — `group` is OURS, not Discord's. `rows()` strips it; the sponsor button is
 * appended AFTER rows() has run, so every card the bot sent while a sponsor was
 * live carried `"group":"nav"` on it. lib/discord/components.ts states the rule
 * in its own comment: an unknown field is a rejected message, and a rejected
 * message is a card that never appears.
 *
 * B4 — the back-trail accumulated duplicates. "More" on the More card produced
 * `n|more|more`, so Back returned you to the screen you were already on. Repeat
 * it and the trail grows a frame per press until pack() truncates the real
 * history away.
 *
 *   DEMO_DB=1 npx tsx tests/db/bot-payload.mts
 */
process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = <T,>(name: string, got: T, want: T) =>
  ok(name, got === want, `got ${String(got)}, want ${String(want)}`);

const { navId, parseId, frame, rows } = await import("../../lib/discord/components.ts");
const { withSponsorRow } = await import("../../lib/discord/sponsor.ts");

console.log("== B5: nothing internal reaches Discord ==");
{
  const ad = { id: "x", campaignCreativeId: "cc", clickUrl: "https://example.com", brandName: "B", tagline: "t" };
  const out = withSponsorRow({ components: [{ type: 1, components: [] }] }, ad as never, "g1");
  const btn = ((out.components as { components: Record<string, unknown>[] }[])[0]).components[0];
  ok("the sponsor button was added", !!btn);
  ok("…and carries no `group`", btn && !("group" in btn), Object.keys(btn ?? {}).join(","));

  // The invariant, not just this one button: whatever any screen builds, what
  // leaves must never carry it.
  const built = rows([{ type: 2, style: 2, label: "x", custom_id: "n|home", group: "nav" } as never]);
  const leaked = built.flatMap((r) => r.components).filter((b) => "group" in (b as object));
  eq("rows() strips it from everything else too", leaked.length, 0);
}

console.log("== B4: a trail never repeats the screen you are on ==");
{
  eq("More pressed on More does not push More", navId(frame("more"), [frame("more"), frame("home")]), "n|more|home");
  eq("Home pressed on Home leaves an empty trail", navId(frame("home"), [frame("home")]), "n|home");

  // …and a REAL move still pushes, or Back stops working entirely.
  const real = navId(frame("planet", "Chess"), [frame("more")]);
  eq("a genuine move still pushes its origin", real, "n|planet~Chess|more");
  eq("…and Back still resolves to it", parseId(real)?.trail[0]?.screen, "more");

  // Args are part of identity: two different planets are two destinations.
  const diff = navId(frame("planet", "Chess"), [frame("planet", "Dota 2")]);
  eq("same screen, different arg, is still a push", parseId(diff)?.trail.length, 1);
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  - ${f}`); process.exit(1); }
