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

console.log("== The ad cannot take the card down ==");
{
  // ===== THIS IS THE ONE THAT WENT LIVE. =====
  //
  // PR #115 made a missing `PORTAL_SECRET` throw instead of silently falling
  // back to `CRON_SECRET`. That was right. What nobody noticed is that the ad
  // click-through is signed with the same secret, so on a deployment that had
  // never set one — which production was, invisibly, because of the fallback —
  // the throw came out of a DECORATION and every command and button in every
  // server answered "Cluster couldn't load that just now."
  //
  // Reproduced the way production hit it: no `PORTAL_SECRET`, and not the demo
  // (`isDemo()` is what otherwise hands out a fixed development secret, and it
  // is true for the whole rest of this band).
  const saved = {
    demo: process.env.DEMO_DB,
    dburl: process.env.DATABASE_URL,
    portal: process.env.PORTAL_SECRET,
  };
  try {
    delete process.env.DEMO_DB;
    process.env.DATABASE_URL = "postgres://not-a-real-deployment/but-not-demo-either";
    delete process.env.PORTAL_SECRET;

    // The precondition, asserted rather than assumed: if signing stops throwing
    // here, this block passes while testing nothing, which is how the defect
    // survived 99 green suites in the first place.
    const { signPayload } = await import("../../lib/portal-auth.ts");
    let signThrew = false;
    try { signPayload("x"); } catch { signThrew = true; }
    ok("precondition: signing a link really does throw in this state", signThrew);

    const ad = { id: "x", campaignCreativeId: "cc", clickUrl: "https://example.com", brandName: "B", tagline: "t" };
    const card = { content: "the card", components: [{ type: 1, components: [{ type: 2, custom_id: "n|home" }] }] };
    let threw: unknown = null;
    let out: typeof card = card;
    try { out = withSponsorRow(card, ad as never, "g1"); } catch (e) { threw = e; }

    ok("an unsignable ad does not throw out of the card builder",
      threw === null, threw instanceof Error ? threw.message : String(threw));
    eq("…the card still carries its content", out.content, "the card");
    // The navigation the gamer needs is the whole point of keeping the card.
    const buttons = (out.components as { components: { custom_id?: string }[] }[])
      .flatMap((r) => r.components);
    eq("…and still carries its navigation", buttons.filter((b) => b.custom_id === "n|home").length, 1);
    eq("…and did NOT grow an ad button it could not sign", buttons.length, 1);
  } finally {
    if (saved.demo === undefined) delete process.env.DEMO_DB; else process.env.DEMO_DB = saved.demo;
    if (saved.dburl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = saved.dburl;
    if (saved.portal === undefined) delete process.env.PORTAL_SECRET; else process.env.PORTAL_SECRET = saved.portal;
  }
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  - ${f}`); process.exit(1); }
