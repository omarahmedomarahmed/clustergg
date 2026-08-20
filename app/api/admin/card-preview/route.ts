// The card preview. **The same renderer the bot calls, and no other.**
//
// ===== E8 — TWO RENDERERS IS HOW A PREVIEW STARTS LYING =====
//
// This route exists rather than an HTML mock on the page because this platform
// has already paid for the alternative: `loadCardFonts()` returned `[]` for a
// whole sprint, `ImageResponse` throws on an empty font list, **every card
// threw**, the fence turned them all into text, and both bands stayed green.
// An HTML preview would have looked perfect the entire time.
//
// So the preview is a real PNG, produced by `renderCard`, from the same sample
// spec the save check renders. If the bot cannot draw it, neither can this.

import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "../../../../lib/db/index.ts";
import { requireAdminAccess } from "../../../../lib/admin/session.ts";
import { renderCard } from "../../../../lib/cards/render.ts";
import { sampleSpec } from "../../../../lib/cards/sample.ts";
import { readSettings, settingsFor, withSettings } from "../../../../lib/cards/settings.ts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse | Response> {
  // The layout gate is the console's own. A preview endpoint that answered
  // without one would render a card naming a server's earnings to anybody who
  // guessed the URL.
  await requireAdminAccess();

  const params = request.nextUrl.searchParams;
  const family = params.get("family") ?? "home";

  // Unsaved settings can be previewed by passing them, which is what makes
  // this a preview rather than a picture of what is already live. Read through
  // `readSettings`, so a hand-typed query string cannot inject a layout the
  // renderer has never heard of.
  const pending = params.has("layout") || params.has("accent") || params.has("backgroundUrl");
  const settings = pending
    ? readSettings({
        layout: params.get("layout"),
        accent: params.get("accent"),
        backgroundUrl: params.get("backgroundUrl"),
      })
    : await settingsFor(await getDb(), family);

  try {
    const card = await renderCard(withSettings(sampleSpec(family), settings));
    return new Response(card.png as unknown as BodyInit, {
      headers: {
        "content-type": "image/png",
        // Never cached. A preview that is a minute stale is a preview of
        // somebody else's edit.
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    // D23's shape, one surface along: a preview that cannot render says so in
    // words rather than showing a broken-image icon, because the words are the
    // whole reason somebody opened this page.
    return NextResponse.json(
      { error: `This layout could not be rendered: ${(e as Error).message}` },
      { status: 422 },
    );
  }
}
