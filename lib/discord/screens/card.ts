// Turning a `CardSpec` into a reply, and the fence that keeps it standing.
//
// ===== HOUSE RULE 11, AT THE ONE PLACE EVERY CARD GOES THROUGH =====
//
// *"A decoration may never take a card down."* The renderer is the decoration:
// it fetches artwork over the network, decodes an image, loads fonts, and
// each of those can fail. A card whose PNG did not render must still arrive —
// with its text, its buttons and its navigation — because the alternative is a
// gamer looking at a spinner that never resolves, with no way to tell a slow
// card from a dead one.
//
// So `renderCard` is called inside a fence, and a failure produces a text card
// with the same words and the same buttons. The buttons are the part that
// matters: an image is how the card looks, and the buttons are what it *does*.
//
// This is also the reason the renderer is never called from the interaction
// handler directly. One door, one fence.

import { fence } from "../../cards/render.ts";
import type { CardSpec } from "../../cards/render.ts";
import { rows, type Button } from "../components.ts";
import type { ScreenResult } from "../interactions.ts";

/** The plain-text fallback, so a card without its PNG still says everything. */
export function cardText(spec: CardSpec): string {
  const lines = [`**${spec.title}**`];
  if (spec.subtitle) lines.push(spec.subtitle);
  for (const r of spec.rows ?? []) lines.push(`${r.label}: ${r.value}`);
  if (spec.footer) lines.push(`_${spec.footer}_`);
  return lines.join("\n");
}

export type ReplyOptions = {
  buttons?: (Button | null)[];
  ephemeral?: boolean;
  /**
   * Skip the PNG. Used by screens that are a question rather than a statement —
   * a picker, a refusal — where a 1200×630 render is a second of latency spent
   * on something nobody looks at.
   */
  textOnly?: boolean;
  /** Which card family this screen belongs to, for the operator's settings. */
  family?: string;
};

/**
 * Merge a family's saved settings into a spec.
 *
 * Fenced onto the spec itself: a settings lookup that fails must produce the
 * card the code ships, not no card. The database read is inside the try for
 * exactly that reason — this runs on every card the bot draws.
 */
async function applySettings(spec: CardSpec, family: string | undefined): Promise<CardSpec> {
  if (!family) return spec;
  try {
    const { getDb } = await import("../../db/index.ts");
    const { settingsFor, withSettings } = await import("../../cards/settings.ts");
    return withSettings(spec, await settingsFor(await getDb(), family));
  } catch {
    return spec;
  }
}

/**
 * Render a card, or say the same thing without one.
 *
 * Always returns a `ScreenResult`. There is deliberately no failure path out
 * of this function: the caller has already acknowledged the interaction, so
 * the gamer is owed a card, and "we could not draw it" is a card.
 */
export async function cardReply(
  spec: CardSpec,
  options: ReplyOptions = {},
): Promise<ScreenResult> {
  const components = rows(options.buttons ?? []);
  const base: ScreenResult = {
    content: cardText(spec),
    components,
    ...(options.ephemeral ? { ephemeral: true } : {}),
  };

  if (options.textOnly) return base;

  const rendered = await fence("card", async () => {
    const { renderCard } = await import("../../cards/render.ts");
    // ===== THE OPERATOR'S SETTINGS, APPLIED HERE AND NOWHERE ELSE =====
    //
    // `14-EDITABLE` E8/E9. Every card goes through this function, so this is
    // the one place a family's background, accent and layout can be applied —
    // and it sits **inside** the fence, which is what makes E9 true: bad art
    // degrades the card and never takes it down.
    //
    // `options.family` is optional: a screen that does not name one draws the
    // defaults, which is exactly what every screen did before the editor
    // existed.
    return renderCard(await applySettings(spec, options.family));
  });

  if (!rendered.ok) {
    // The text card, with every button intact. `fence` has already logged the
    // reason with enough detail to find the asset — rule 3 of the WebP notes:
    // a bad asset must be findable rather than merely invisible.
    return base;
  }

  return {
    ...base,
    // The text stays even when the PNG rendered. A screen reader gets the
    // numbers, and so does anybody whose client will not load the attachment.
    files: [{ name: "card.png", data: rendered.value.png }],
  };
}
