// `/admin/cards` — the bot card layouts. 05 §8.
//
// ===== WHAT AN OPERATOR NEEDS FROM THIS PAGE =====
//
// Not a design tool. When somebody says *"the bot is broken"* what they
// usually mean is one of four things, and each has a different answer:
//
//   * a screen that does not exist — the press falls through to *"that screen
//     has gone"*, which reads like a stale button and is not one;
//   * an admin card that appeared publicly, which S8 forbids absolutely;
//   * a card whose artwork did not render, which is a decoration failing and
//     must never take the card down;
//   * the whole renderer failing, which looks identical to the last one from
//     the outside and is not — the fence turns it into a text card and logs it.
//
// So this page lists what is registered, marks the owner-only families, and
// says plainly which fonts are installed. That last one is not cosmetic: with
// no brand fonts installed the renderer used to be handed an empty font list
// and **every card on the platform threw**, which the fence hid completely.

import { CARD_FAMILIES, ADMIN_SCREENS, SCREENS } from "../../../lib/discord/screens/index.ts";
import { loadCardFonts, cardFontFamily } from "../../../lib/cards/fonts.ts";
import { imageBackendName } from "../../../lib/cards/store.ts";
import { RENDERABLE_IMAGE_TYPES } from "../../../lib/cards/render.ts";
import { MAX_CUSTOM_ID } from "../../../lib/discord/components.ts";
import { Panel, Row, Light } from "../components.tsx";

export const dynamic = "force-dynamic";

export default async function Cards() {
  const fonts = await loadCardFonts();
  const admin = new Set(ADMIN_SCREENS);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bot cards</h1>
        <p className="mt-1 text-sm text-mute">
          {SCREENS.size} screens registered across {Object.keys(CARD_FAMILIES).length}{" "}
          families.
        </p>
      </div>

      <Panel
        title="The families"
        note="Every page a gamer or an owner needs has a card — for most gamers the bot is the platform"
        help={
          <p>
            A screen that is not registered falls through to <em>&ldquo;that screen has
            gone&rdquo;</em>, which reads like a stale button rather than a missing
            file. If somebody reports a dead button, check it is listed here first.
          </p>
        }
      >
        {Object.entries(CARD_FAMILIES).map(([family, screens]) => (
          <div key={family} className="border-b border-line py-3 last:border-0">
            <p className="text-sm">{family}</p>
            <ul className="mt-1 flex flex-wrap gap-2 text-xs">
              {screens.map((name) => (
                <li
                  key={name}
                  data-testid="card-screen"
                  data-screen={name}
                  data-admin={admin.has(name) ? "1" : "0"}
                  className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1"
                >
                  <Light ok={SCREENS.has(name)} level="red" />
                  <span className={admin.has(name) ? "text-amber-300" : "text-mute"}>
                    {name}
                    {admin.has(name) ? " · owner only" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="mt-4 text-xs text-mute">
          Amber is owner-only. Those are never public messages — including their
          refusals, because a refusal posted publicly announces to a whole server that
          somebody tried.
        </p>
      </Panel>

      <Panel
        title="The renderer"
        note="What a card can draw, and what it does when it cannot"
        help={
          <p>
            The renderer decodes <strong>PNG and JPEG only</strong>. WebP is what a
            browser hands you when you right-click and save an image, so uploads are
            converted on the way in rather than rejected — a brand told their logo is
            the wrong format will send it anyway, in an email, on a Friday.
          </p>
        }
      >
        <Row>
          <span>Brand fonts installed</span>
          <span className="flex items-center gap-2 text-sm text-mute" data-testid="fonts-state">
            <Light ok={fonts.length > 0} />
            {fonts.length === 0
              ? "none — cards use the renderer's built-in face"
              : `${fonts.length} · ${cardFontFamily(fonts)}`}
          </span>
        </Row>
        <Row>
          <span>Decodable formats</span>
          <span className="text-sm text-mute">{RENDERABLE_IMAGE_TYPES.join(", ")}</span>
        </Row>
        <Row>
          <span>Image store</span>
          <span className="text-sm text-mute" data-testid="image-backend">
            {imageBackendName()}
          </span>
        </Row>
        <Row>
          <span>custom_id budget</span>
          <span className="text-sm text-mute">{MAX_CUSTOM_ID} characters</span>
        </Row>
        <p className="mt-3 text-xs text-mute">
          An <strong>in-process</strong> image store is emptied by a restart. That is
          correct for a demo and not for a deployment — the production backend is
          configured with the blob token in setup.
        </p>
      </Panel>
    </div>
  );
}
