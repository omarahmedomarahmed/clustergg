/**
 * A button on a public card answers the person who pressed it, and nobody else. M5.
 *
 * ===== THE BUG THIS CLOSES =====
 *
 * Every button press was answered with `DeferredUpdateMessage` (type 6) and an
 * edit of the message the button was on.
 *
 * On an EPHEMERAL card that is exactly right: the card belongs to one person,
 * and editing it in place is what makes the bot feel like an app instead of a
 * stack of new messages.
 *
 * On a PUBLIC announcement it was a bug with an audience. The bot posts a
 * challenge announcement into a server's channel. One member taps a button. The
 * announcement is REPLACED — for everyone in the channel — with that member's
 * private screen. The server was paid to carry that announcement, and the next
 * person to scroll past sees a stranger's stats where the challenge used to be.
 *
 * Nothing in the codebase could even tell the two apart: the `Interaction` type
 * did not carry `message`, so the flag that distinguishes a public message from
 * an ephemeral one was never read.
 *
 * ===== WHY THE RESPONSE TYPE IS TESTED TOO =====
 *
 * The acknowledgement and the deferred work have to agree:
 *
 *   DeferredUpdateMessage (6)             "I am about to edit this message"
 *   DeferredChannelMessageWithSource (5)  "I am about to send a new one"
 *
 * Answering a public press with type 6 and then calling `followUp` leaves the
 * public card stuck in a loading state it never comes out of — a different,
 * quieter version of the same bug. So the type is asserted, not just the send.
 *
 *   DEMO_DB=1 npx tsx tests/db/public-card-privacy.mts
 */
process.env.DEMO_DB = "1";

import { readFileSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
/** Comments explaining the old behaviour are not the old behaviour. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");

const { isPublicMessage, MessageFlags, InteractionResponseType } =
  await import("../../lib/discord/types.ts");

type Msg = { id?: string; flags?: number };
const press = (message?: Msg) => ({ id: "i", type: 3, token: "t", application_id: "a", message }) as never;

console.log("== the bot can tell a public card from a private one ==");
{
  // The whole fix rests on this one predicate, and before M5 it could not have
  // existed: `Interaction` had no `message` field at all.
  ok("a card only one person can see is not public",
    isPublicMessage(press({ id: "m", flags: MessageFlags.Ephemeral })) === false);
  ok("a card the channel can see IS public",
    isPublicMessage(press({ id: "m", flags: 0 })) === true);
  ok("…and so is one with no flags at all", isPublicMessage(press({ id: "m" })) === true,
    "Discord omits `flags` on an ordinary message rather than sending 0");

  // Ephemeral is one bit among several. A message that is BOTH ephemeral and
  // something else must still read as private, which a `=== 64` test would get
  // wrong the first time Discord set another flag.
  ok("ephemeral is detected as a bit, not an equality",
    isPublicMessage(press({ id: "m", flags: MessageFlags.Ephemeral | 4096 })) === false,
    "flags is a bitfield — `=== 64` breaks the moment another bit is set");

  // A slash command has no source message. Nothing to protect, nothing to edit.
  ok("an interaction with no message is not treated as public",
    isPublicMessage(press(undefined)) === false);
}

console.log("\n== the handler acts on it ==");
{
  const route = code("app/api/discord/interactions/route.ts");

  ok("the component handler reads whether the card is public",
    /const publicCard = isPublicMessage\(i\)/.test(route));
  // TWO paths render into a message: the main component handler and `navigate`,
  // which the few buttons carrying no nav trail take. Both sit on the same
  // public announcements, so fixing one and not the other fixes nothing.
  ok("…and so does the trail-less navigate path",
    (route.match(/const publicCard = isPublicMessage\(i\)/g) ?? []).length >= 2,
    "one of the two render paths still edits public messages");

  ok("a public press sends a NEW ephemeral message",
    /publicCard\s*\)?\s*await followUp\(i\.token, \{ \.\.\.body, flags: MessageFlags\.Ephemeral \}\)/.test(route),
    "followUp posts on the same token without touching the original");
  ok("…and a private press still edits in place",
    /else await editOriginal\(i\.token, body\)/.test(route),
    "in-place navigation is the right behaviour on a card that is already private");

  // The acknowledgement must match the work.
  ok("a public press is acknowledged as a new message, not an edit",
    /publicCard[\s\S]{0,220}DeferredChannelMessageWithSource[\s\S]{0,120}DeferredUpdateMessage/.test(route),
    "type 6 plus followUp leaves the public card loading forever");

  // The negative. If this string comes back unguarded on the render paths, a
  // public card is being rewritten again.
  const renderPaths = route.split("async function runAction")[0];
  const bareEdits = (renderPaths.match(/await editOriginal\(i\.token, body\)/g) ?? []).length;
  const guarded = (renderPaths.match(/else await editOriginal\(i\.token, body\)/g) ?? []).length;
  ok("every render-path edit is behind the guard", bareEdits === guarded,
    `${bareEdits} edits, ${guarded} guarded`);
}

console.log("\n== the type carries what the fix needs ==");
{
  const types = code("lib/discord/types.ts");
  ok("Interaction exposes the source message", /message\?: \{[^}]*flags\?: number/.test(types),
    "without this nothing can tell a public card from a private one");
  ok("Ephemeral is still the flag Discord uses", MessageFlags.Ephemeral === 64);
  ok("both deferred response types exist",
    InteractionResponseType.DeferredUpdateMessage === 6
    && typeof InteractionResponseType.DeferredChannelMessageWithSource === "number");
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log(fails.map((f) => `  ✗ ${f}`).join("\n")); process.exit(1); }
