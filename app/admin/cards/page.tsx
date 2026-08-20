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
import { getDb } from "../../../lib/db/index.ts";
import { cardSettings, CARD_DEFAULTS, CARD_LAYOUTS } from "../../../lib/cards/settings.ts";
import { saveCardAction, clearCardAction } from "./actions.ts";

export const dynamic = "force-dynamic";

const FIELD =
  "rounded-md border border-line bg-ink px-3 py-1.5 text-sm outline-none focus:border-white/30";

export default async function Cards({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const str = (k: string) => (typeof query[k] === "string" ? (query[k] as string) : null);
  const fonts = await loadCardFonts();
  const admin = new Set(ADMIN_SCREENS);
  const settings = await cardSettings(await getDb());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bot cards</h1>
        <p className="mt-1 text-sm text-mute">
          {SCREENS.size} screens registered across {Object.keys(CARD_FAMILIES).length}{" "}
          families.
        </p>
      </div>

      {str("error") ? (
        <p className="rounded-lg border border-line bg-ink px-4 py-3 text-sm" data-testid="card-refusal">
          {str("error")}
        </p>
      ) : null}
      {str("saved") ? (
        <p className="rounded-lg border border-line bg-ink px-4 py-3 text-sm text-mute" data-testid="card-saved">
          “{str("saved")}” is live. Every card in that family draws it from now on.
        </p>
      ) : null}
      {str("cleared") ? (
        <p className="rounded-lg border border-line bg-ink px-4 py-3 text-sm text-mute" data-testid="card-cleared">
          “{str("cleared")}” is back to what the code ships.
        </p>
      ) : null}

      {/*
        ===== THE EDITOR, BESIDE THE DIAGNOSTIC =====

        14-EDITABLE §3: the diagnostic above is genuinely useful and it stays —
        it is the page somebody opens when they are told the bot is broken.
        What it gains is this.

        The preview is a real PNG from `renderCard`, the same function the bot
        calls. Two renderers is how a preview starts lying, and this platform
        already knows what that costs: the renderer threw on every card for a
        sprint, the fence turned them into text, and both bands stayed green.
      */}
      <Panel
        title="Per family — art, accent and layout"
        note="The preview is a real render. If the bot cannot draw it, neither can this"
        help={
          <p>
            A save renders the sample card first and is refused if it fails — a
            family that cannot render would otherwise become a text card for every
            gamer who presses the button, quietly, because the fence that keeps
            cards standing also hides the reason. Artwork is a decoration: bad art
            degrades a card and never takes it down.
          </p>
        }
      >
        {Object.keys(CARD_FAMILIES).map((family) => {
          const s = settings.get(family) ?? CARD_DEFAULTS;
          const overridden = settings.has(family);
          return (
            <div key={family} className="border-b border-line py-4 last:border-0">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-sm">{family}</p>
                <span className="text-xs text-mute" data-testid={`card-state-${family}`}>
                  {overridden ? "edited" : "no override — the defaults the code ships"}
                </span>
              </div>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/admin/card-preview?family=${encodeURIComponent(family)}`}
                alt={`A real render of the ${family} card`}
                width={600}
                height={315}
                data-testid={`card-preview-${family}`}
                className="mt-3 w-full max-w-xl rounded-lg border border-line"
              />

              <form
                action={saveCardAction}
                encType="multipart/form-data"
                className="mt-3 flex flex-wrap items-end gap-3"
              >
                <input type="hidden" name="family" value={family} />
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-mute">Layout</span>
                  <select
                    name="layout"
                    defaultValue={s.layout}
                    className={FIELD}
                    data-testid={`card-layout-${family}`}
                  >
                    {CARD_LAYOUTS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-mute">Accent</span>
                  <input
                    name="accent"
                    defaultValue={s.accent ?? ""}
                    placeholder="#22d3ee"
                    className={FIELD}
                    data-testid={`card-accent-${family}`}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-mute">Background art</span>
                  <input
                    type="file"
                    name="art"
                    accept="image/*"
                    className="text-xs text-mute"
                    data-testid={`card-art-${family}`}
                  />
                </label>
                <input type="hidden" name="backgroundUrl" value={s.backgroundUrl ?? ""} />
                {s.backgroundUrl ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="clearArt" />
                    <span className="text-mute">Remove the art</span>
                  </label>
                ) : null}
                <button
                  type="submit"
                  className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-white/5"
                  data-testid={`card-save-${family}`}
                >
                  Save
                </button>
              </form>

              {overridden ? (
                <form action={clearCardAction} className="mt-2">
                  <input type="hidden" name="family" value={family} />
                  <button
                    type="submit"
                    className="text-xs text-mute underline hover:text-white"
                    data-testid={`card-clear-${family}`}
                  >
                    Back to what the code ships
                  </button>
                </form>
              ) : null}
            </div>
          );
        })}
      </Panel>

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
