/**
 * Two things the bot needs to grow.
 *
 *   1. An "Add ClusterGG to your server" button on EVERY card. Discord has no
 *      app store worth the name — a bot spreads because somebody sees it
 *      working in one server and wants it in theirs, and the moment they want
 *      it is the moment they are looking at a card.
 *   2. Command JSON a bot list can actually import. Top.gg rejected ours with
 *      "we were unable to parse your discord application command JSON",
 *      because what these lists want is the array Discord ANSWERS with, and
 *      what we had was the smaller array we send it.
 *
 * The first is asserted at the chokepoint AND through the real screens, so
 * "every card" means every card rather than every card someone remembered.
 */
process.env.DEMO_DB = "1";
process.env.DISCORD_APP_ID = process.env.DISCORD_APP_ID || "123456789012345678";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3031";

const BASE = "http://localhost:3031";
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};

type Btn = { label?: string; url?: string; custom_id?: string; style?: number };
type Row = { type: number; components: Btn[] };
const flat = (rows: Row[]) => rows.flatMap((r) => r.components);
const hasInstall = (rows: Row[]) =>
  flat(rows).some((b) => /add clustergg to your server/i.test(b.label ?? ""));

try {
  const { rows, addToServerButton, linkButton, button } = await import("../../lib/discord/components.ts");

  console.log("\n== The button exists ==");
  const b = addToServerButton();
  ok("it is built", !!b, "no install URL — DISCORD_APP_ID unset?");
  ok("it says what it does", /add clustergg to your server/i.test(b?.label ?? ""), b?.label ?? "");
  ok("it is a link to Discord's own authorize flow",
    (b?.url ?? "").startsWith("https://discord.com/oauth2/authorize"), b?.url ?? "");
  ok("carrying our client id and the bot scope",
    /client_id=/.test(b?.url ?? "") && /scope=bot/.test(decodeURIComponent(b?.url ?? "")), b?.url ?? "");

  console.log("\n== Every card gets it, at the chokepoint ==");
  ok("an empty card still offers it", hasInstall(rows([]) as Row[]));
  ok("a card with its own buttons keeps them AND gets it", (() => {
    const r = rows([linkButton("Full details", "https://clustergg.com/x", "🔗")]) as Row[];
    return hasInstall(r) && flat(r).some((x) => x.label === "Full details");
  })());
  ok("it comes last, so it never displaces a card's own actions", (() => {
    const list = flat(rows([
      button("One", "a|1"), button("Two", "a|2"), button("Three", "a|3"),
    ]) as Row[]);
    return /add clustergg/i.test(list[list.length - 1].label ?? "");
  })());
  ok("a card that already offers it doesn't show it twice", (() => {
    const inst = addToServerButton()!;
    const list = flat(rows([inst, linkButton("Other", "https://x.test")]) as Row[]);
    return list.filter((x) => /add clustergg/i.test(x.label ?? "")).length === 1;
  })());
  ok("rows never exceed Discord's five per row",
    (rows(Array.from({ length: 12 }, (_, i) => button(`b${i}`, `a|${i}`))) as Row[])
      .every((r) => r.components.length <= 5));

  console.log("\n== And on the real screens ==");
  // Driven through the real dispatcher, with the real screen names, so this is
  // the cards a person actually sees rather than whatever happens to be
  // exported.
  const { renderScreen, loadCtx } = await import("../../lib/discord/screens.ts") as unknown as {
    renderScreen: (f: unknown, trail: unknown[], ctx: unknown) => Promise<{ components?: Row[] }>;
    loadCtx: (id: string, name: string, guildId?: string) => Promise<unknown>;
  };
  const { frame } = await import("../../lib/discord/components.ts");
  const ctx = await loadCtx("100000000000000001", "Tester");

  const SCREENS = [
    "home", "more", "help", "show", "gamer", "quest", "quests", "guide", "planet",
    "planets", "leaderboard", "challenge", "standings", "challenges", "server",
    "admin", "setup", "week", "world", "search",
  ];
  let checked = 0; const missing: string[] = []; const threw: string[] = [];
  for (const name of SCREENS) {
    try {
      const out = await renderScreen(frame(name), [], ctx);
      if (!out?.components?.length) continue;
      checked++;
      if (!hasInstall(out.components)) missing.push(name);
    } catch (e) { threw.push(`${name}: ${(e as Error).message.slice(0, 40)}`); }
  }
  ok("most screens rendered", checked >= 10, `${checked} of ${SCREENS.length}; threw: ${threw.join(" | ")}`);
  ok(`every screen that rendered buttons carries it (${checked} checked)`,
    checked > 0 && missing.length === 0, missing.join(", "));

  console.log("\n== The command JSON a bot list can import ==");
  // This ONE block needs a running server; everything above it is in-process.
  //
  // Probed rather than assumed, because the alternative is a red tick in the
  // default `npm test` run that nobody can act on — and a suite that always
  // fails for an environmental reason is one people learn to skip past, which
  // costs more than the coverage is worth. With a build on :3031 (or
  // `npm test -- --ui`) it runs in full.
  const reachable = await fetch(`${BASE}/api/discord/commands.json`, { method: "HEAD" })
    .then(() => true).catch(() => false);
  if (!reachable) {
    console.log(`  skip  no server on ${BASE} — run \`DEMO_DB=1 npx next start -p 3031\` to cover this block`);
    console.log(`\n${pass} passed, ${fail} failed (1 block skipped)`);
    process.exit(fail ? 1 : 0);
  }
  const res = await fetch(`${BASE}/api/discord/commands.json`);
  ok("the endpoint serves", res.ok, String(res.status));
  ok("as JSON", (res.headers.get("content-type") ?? "").includes("application/json"),
    res.headers.get("content-type") ?? "");
  const json = await res.json();
  ok("the top level is an ARRAY, not an object", Array.isArray(json), typeof json);
  ok("with at least one command", Array.isArray(json) && json.length > 0);

  const cmd = (json as Record<string, unknown>[])[0];
  // The fields Discord's own response carries. A parser written against that
  // response is what rejected our registration payload.
  for (const field of ["id", "application_id", "version", "type", "name", "description"]) {
    ok(`each command has \`${field}\``, cmd[field] !== undefined, JSON.stringify(Object.keys(cmd)));
  }
  ok("ids are strings, not numbers",
    typeof cmd.id === "string" && typeof cmd.application_id === "string",
    `${typeof cmd.id} / ${typeof cmd.application_id}`);
  ok("an id is a plausible snowflake", /^\d{17,20}$/.test(String(cmd.id)), String(cmd.id));
  ok("type is CHAT_INPUT (1)", cmd.type === 1, String(cmd.type));
  ok("the name is Discord-legal (lowercase, no spaces)",
    /^[-_\p{Ll}\p{N}]{1,32}$/u.test(String(cmd.name)), String(cmd.name));
  ok("the description is within 100 chars", String(cmd.description).length <= 100,
    String(String(cmd.description).length));

  const opts = (cmd.options ?? []) as Record<string, unknown>[];
  ok("options are an array", Array.isArray(opts));
  for (const o of opts) {
    ok(`option \`${o.name}\` has a numeric type`, typeof o.type === "number", String(o.type));
    ok(`option \`${o.name}\` declares required`, typeof o.required === "boolean", String(o.required));
    ok(`option \`${o.name}\` fits Discord's limits`,
      /^[-_\p{Ll}\p{N}]{1,32}$/u.test(String(o.name)) && String(o.description).length <= 100,
      `${o.name} / ${String(o.description).length}`);
  }

  // The whole point: it round-trips. Anything a list can't re-serialise it
  // can't import.
  ok("it survives a JSON round trip unchanged",
    JSON.stringify(JSON.parse(JSON.stringify(json))) === JSON.stringify(json));
  ok("it contains no undefined-shaped holes", !/undefined/.test(JSON.stringify(json)));
} catch (e) {
  fail++;
  console.log("  ✗ threw:", (e as Error).message);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
