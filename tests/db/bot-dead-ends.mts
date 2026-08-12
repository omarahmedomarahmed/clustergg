/**
 * FOUR WAYS THE BOT ANSWERED BADLY, OR NOT AT ALL. B3, B8, B10, B11.
 *
 * The common thread is that none of them is a crash. Each one is the bot
 * confidently doing the wrong thing, which is why they survived: a stack trace
 * gets fixed, a wrong sentence gets read past.
 *
 *   B3   `discord:Nova` — a token the bot's own grammar defines — was not
 *        routed, so it fell to the fuzzy search and came back "Nothing on
 *        Cluster matches **discord:Nova**". Meanwhile `otherGamerScreen` held a
 *        complete `isDiscordLookup` branch, with its own error copy, that
 *        nothing on earth could reach.
 *
 *   B8   Refused a select menu, a non-manager got NOTHING: the interaction was
 *        ACKed and then abandoned, so the menu snapped back with no
 *        explanation. The button beside it, refused for the same reason, says
 *        so in words.
 *
 *   B10  `/cluster challenge:nope` answered "That challenge is no longer live."
 *        One sentence for three situations — a typo, a finished competition,
 *        and a live one whose card failed to draw. Telling somebody they missed
 *        a competition that never existed invents a loss, on a product where
 *        challenges carry prize money.
 *
 *   B11  A press we could not parse got `DeferredUpdateMessage` and nothing
 *        else — silence, indistinguishable from a dead bot. The `open-link|`
 *        handler four screens up states the rule in its own comment ("a press
 *        we can't answer gets an ANSWER, not silence") while the branch every
 *        button actually falls through to broke it.
 *
 * B11 is driven for real: a signed interaction through the exported route
 * handler, asserting on the HTTP body Discord would receive. It can be, because
 * that answer is the SYNCHRONOUS one. B8's refusal happens inside `after()`,
 * which has no request scope here, so it is checked structurally — and the
 * check is written to fail if the silent `return` comes back.
 *
 *   DEMO_DB=1 npx tsx tests/db/bot-dead-ends.mts
 */
process.env.DEMO_DB = "1";

import { readFileSync } from "node:fs";
import { generateKeyPairSync, sign as edSign } from "node:crypto";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = <T,>(name: string, got: T, want: T) =>
  ok(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const code = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");

// The keypair has to exist before the route module is imported: `canVerify()`
// reads the env at call time, but getting it in place first keeps the ordering
// obvious rather than incidental.
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
process.env.DISCORD_PUBLIC_KEY = publicKey.export({ type: "spki", format: "der" })
  .subarray(-32).toString("hex");
process.env.DISCORD_APP_ID ??= "111111111111111111";

const { screenForCommand, renderScreen } = await import("../../lib/discord/screens.ts");
const { challengeExistence } = await import("../../lib/challenges.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");

console.log("== B3: `discord:` reaches the branch that was written for it ==");
{
  const f = await screenForCommand("discord:Nova");
  eq("it routes to the gamer screen", f.screen, "gamer");
  eq("…with `discord` in the game slot, which is the marker the branch reads", f.args[0], "discord");
  eq("…and the name in the name slot", f.args[1], "Nova");

  // Not the fuzzy search, which is where it used to land and where it produced
  // "Nothing on Cluster matches **discord:Nova**".
  ok("it is not the search fallback", f.screen !== "search", f.screen);

  // A bare `discord:` is a person who has typed the prefix and not the name.
  const bare = await screenForCommand("discord:");
  ok("a bare prefix goes home rather than searching for nothing",
    bare.screen === "home", bare.screen);

  // THE GENERAL RULE. Every token the parser emits must be routed, or the next
  // one added quietly becomes dead copy the same way this one did.
  const src = code("lib/discord/screens.ts");
  const block = src.slice(src.indexOf("function fromToken"), src.indexOf("function fromToken") + 2400);
  const cases = [...block.matchAll(/case "([a-z-]+)":/g)].map((m) => m[1]);
  ok("fromToken routes a decent set of tokens", cases.length >= 10, cases.join(","));
  ok("…including discord", cases.includes("discord"), cases.join(","));

  // And the branch it feeds is genuinely reachable now: same input, real render.
  const payload = await renderScreen(f, [], {
    discordId: "1", isManager: false, guildId: null, gamer: null,
  } as never);
  const text = JSON.stringify(payload);
  ok("the discord-handle error copy is what comes back, not the search miss",
    !/Nothing on Cluster matches/.test(text), text.slice(0, 200));
}

console.log("== B10: a typo is not a bereavement ==");
{
  const gone = await challengeExistence("definitely-not-a-challenge-id");
  eq("an unknown id reports not existing", gone.exists, false);

  // A real one, taken from the fixture rather than invented, so this asserts
  // against the shape the product actually stores.
  const db = await getDb();
  const [real] = await db.select().from(schema.challenges).limit(1);
  ok("the demo has a challenge to check against", !!real);
  if (real) {
    const found = await challengeExistence(real.id);
    eq("a real id reports existing", found.exists, true);
    if (found.exists) eq("…with its title", found.title, real.title);
  }

  const payload = await renderScreen(
    { screen: "challenge", args: ["definitely-not-a-challenge-id"] } as never,
    [], { discordId: "1", isManager: false, guildId: null, gamer: null } as never,
  );
  const text = JSON.stringify(payload);
  ok("a made-up id is not described as having ended",
    !/no longer live|has finished|has ended/i.test(text), text.slice(0, 240));
  ok("…and says there is no such challenge", /no challenge with that id/i.test(text), text.slice(0, 240));
  ok("…and offers somewhere to go", /challenges/i.test(text));
}

console.log("== B11: an unanswerable press still gets an answer ==");
{
  const { POST } = await import("../../app/api/discord/interactions/route.ts");

  const send = async (body: unknown) => {
    const raw = JSON.stringify(body);
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = edSign(null, Buffer.from(ts + raw), privateKey).toString("hex");
    const req = new Request("https://clustergg.com/api/discord/interactions", {
      method: "POST", body: raw,
      headers: {
        "content-type": "application/json",
        "x-signature-ed25519": sig,
        "x-signature-timestamp": ts,
      },
    });
    const res = await POST(req as never);
    return { status: res.status, body: await res.json() as Record<string, unknown> };
  };

  // Sanity first: the harness really is reaching the verified path. If the
  // signature were wrong every assertion below would "pass" against a 401.
  const ping = await send({ type: 1 });
  eq("the harness signs correctly (PING answers PONG)", ping.body.type, 1);

  const press = await send({
    type: 3, token: "tok", id: "1",
    data: { custom_id: "totally|unparseable|garbage", component_type: 2 },
    member: { user: { id: "424242424242424242", username: "tester" } },
    guild_id: "999999999999999999",
  });
  eq("the press is answered, not merely acknowledged", press.body.type, 4);
  const data = press.body.data as { content?: string; flags?: number };
  ok("…with something the person can read", !!data?.content?.trim(), JSON.stringify(data));
  ok("…that explains the card is old", /older card/i.test(data?.content ?? ""), data?.content);
  ok("…privately", (data?.flags ?? 0) > 0, String(data?.flags));

  // Type 6 is the silence. Naming it here means the fix cannot regress to it
  // without this line going red.
  ok("it is not DeferredUpdateMessage", press.body.type !== 6, String(press.body.type));

  // A modal submit that lands nowhere is worse — somebody typed into a form.
  const modal = await send({
    type: 5, token: "tok", id: "2",
    data: { custom_id: "no-such-modal|x", components: [] },
    member: { user: { id: "424242424242424242", username: "tester" } },
  });
  eq("an unrecognised modal submit is answered too", modal.body.type, 4);
}

console.log("== B8: one refusal, one wording ==");
{
  // Structural, because this refusal is sent from inside `after()`, which has
  // no request scope in a test process. What is asserted is the thing that was
  // actually wrong: the branch returned with nothing sent.
  const route = code("app/api/discord/interactions/route.ts");

  ok("the refusal text is stated once, not typed at each site",
    /const MANAGER_ONLY = /.test(route), "MANAGER_ONLY is gone");
  const literals = [...route.matchAll(/"Only this server's admins and moderators can change that\."/g)];
  eq("…and no site retypes it", literals.length, 1);

  // The select-menu branch must SEND something on refusal.
  const set = route.slice(route.indexOf('customId.startsWith("set|")'));
  const guard = set.slice(set.indexOf("maySetup"), set.indexOf("maySetup") + 260);
  ok("the select-menu refusal sends a message", /editOriginal|MANAGER_ONLY/.test(guard), guard.slice(0, 200));
  ok("…and does not just return", !/maySetup\(i, guildId\)\)\) return;/.test(route),
    "the bare `return` is back — a refused select says nothing again");

  // And the same for every malformed-id branch: none of them may answer with
  // a bare deferred update, which is the silence B11 was about.
  const silent = [...route.matchAll(/if \(![\w. |!]+\) return json\(\{ type: InteractionResponseType\.DeferredUpdateMessage \}\);/g)];
  eq("no branch answers a malformed custom_id with silence", silent.length, 0);
  ok("they route through one shared answer instead",
    (route.match(/return staleCard\(\);/g) ?? []).length >= 6,
    String((route.match(/return staleCard\(\);/g) ?? []).length));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  - ${f}`); process.exit(1); }
