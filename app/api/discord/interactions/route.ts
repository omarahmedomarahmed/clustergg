// `/api/discord/interactions` — the bot's front door.
//
// ===== THE THREE-SECOND RULE IS THE WHOLE SHAPE OF THIS FILE =====
//
// Discord kills an interaction that is not acknowledged within three seconds
// and shows the gamer *"this interaction failed"*. So this handler does the
// smallest possible amount of work, returns, and does everything else in
// `after()` — Next's hook for work that outlives the response.
//
// `handleInteraction` is already written and already tested. This file is the
// transport: read the raw body, hand it over, send back what it says, and
// schedule the deferred half. It decides nothing.
//
// **The body must be read as text, not JSON.** Ed25519 verifies the exact
// bytes Discord signed; anything that parses first and re-serialises changes
// them and every request fails verification for reasons that look like a key
// problem.

import { after } from "next/server";
// ===== THE IMPORT THAT MAKES THE BOT EXIST =====
//
// `SCREENS` is filled as a side effect of importing each family. Without this
// line every interaction falls through to *"that screen has gone"* — which
// reads like a stale button rather than a bot with no screens, and would be
// the quietest possible way to ship nothing.
import "../../../../lib/discord/screens/index.ts";
import { handleInteraction } from "../../../../lib/discord/interactions.ts";
import { editOriginalResponse } from "../../../../lib/discord/rest.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();

  const result = await handleInteraction(
    {
      body,
      signature: request.headers.get("x-signature-ed25519"),
      timestamp: request.headers.get("x-signature-timestamp"),
    },
    {
      // Everything slow happens here, after the acknowledgement is on the
      // wire. House rule 10, and house rule 11 with it: a decoration that
      // throws in here must not take the card down, so the whole deferred
      // half is fenced.
      defer: (work) => {
        after(async () => {
          try {
            await work();
          } catch (error) {
            // Logged, never rethrown. An exception escaping `after()` is an
            // unhandled rejection in a serverless function, which is a cold
            // start for the next person rather than an error anybody sees.
            console.error("[bot] deferred work failed", error);
          }
        });
      },

      // Replaces the "thinking…" placeholder with the finished card.
      edit: async (applicationId, token, result) => {
        await editOriginalResponse(
          applicationId,
          token,
          {
            content: result.content,
            embeds: result.embeds,
            components: result.components,
          },
          result.files,
        );
      },
    },
  );

  return typeof result.body === "string"
    ? new Response(result.body, { status: result.status })
    : Response.json(result.body, { status: result.status });
}
