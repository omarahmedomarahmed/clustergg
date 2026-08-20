// What a human can change about a bot card, without a deploy.
//
// `14-EDITABLE` §3. The existing `/admin/cards` page is a **diagnostic** — what
// is registered, which families are owner-only, which fonts are installed — and
// it stays, because it is the page somebody opens when they are told the bot is
// broken. What it gains is an editor beside it.
//
// ===== E12 — S8 IS NOT A LAYOUT PROPERTY =====
//
// *"An admin card is never a public message, whatever the layout says."* So
// there is no field here that could make one public, and there never will be:
// the settings below are art, colour and arrangement. Whether a card is
// ephemeral is decided by `ADMIN_SCREENS` and enforced in `adminCard`, and a
// per-family override would be a way to publish a server's earnings to its
// whole membership by ticking a box on an admin page.
//
// ===== E8 — ONE RENDERER, OR THE PREVIEW STARTS LYING =====
//
// The preview is produced by `renderCard`, the same function the bot calls.
// This platform has already paid for the alternative: the renderer threw on
// every card for a sprint, the fence turned them all into text, and **both
// bands stayed green**. A preview drawn in HTML would have looked perfect
// throughout.

import { and, desc, eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";

/**
 * The layouts a family can be set to.
 *
 * A closed list, not a free string: `cardTree` has to know how to draw each
 * one, and a layout nobody implemented is a card that throws — which the fence
 * turns into a text card, silently, which is the exact failure this platform
 * spent a sprint inside.
 */
export const CARD_LAYOUTS = ["standard", "banner", "minimal"] as const;
export type CardLayout = (typeof CARD_LAYOUTS)[number];

export function isCardLayout(v: unknown): v is CardLayout {
  return typeof v === "string" && (CARD_LAYOUTS as readonly string[]).includes(v);
}

export type CardSettings = {
  /** Background art. Always optional; every card must look finished with none. */
  backgroundUrl: string | null;
  /** The accent the footer and rules take. */
  accent: string | null;
  layout: CardLayout;
};

export const CARD_DEFAULTS: CardSettings = {
  backgroundUrl: null,
  accent: null,
  layout: "standard",
};

/**
 * Read every family's settings.
 *
 * Fenced onto the defaults, and that is not decoration: this sits on the path
 * of every card the bot draws. House rule 11 — a decoration may never take a
 * card down, and a settings table that is unreachable must produce a plain
 * card rather than no card.
 */
export async function cardSettings(db: DB): Promise<Map<string, CardSettings>> {
  const out = new Map<string, CardSettings>();
  try {
    const rows = await db
      .select()
      .from(schema.contentOverrides)
      .where(eq(schema.contentOverrides.scope, "card"))
      .orderBy(desc(schema.contentOverrides.editedAt));
    for (const row of rows) {
      if (out.has(row.key)) continue;
      out.set(row.key, readSettings(row.settings));
    }
  } catch (e) {
    console.error("[cards] settings were unreachable; every family draws plain", e);
  }
  return out;
}

/** One family's settings, defaults included. */
export async function settingsFor(db: DB, family: string): Promise<CardSettings> {
  try {
    const [row] = await db
      .select()
      .from(schema.contentOverrides)
      .where(
        and(eq(schema.contentOverrides.scope, "card"), eq(schema.contentOverrides.key, family)),
      )
      .orderBy(desc(schema.contentOverrides.editedAt))
      .limit(1);
    return readSettings(row?.settings);
  } catch {
    return { ...CARD_DEFAULTS };
  }
}

/**
 * Read a stored blob forgivingly.
 *
 * D20's rule, one surface along: *read forgivingly and never discard on a
 * mismatch.* A settings blob written by an older deploy, or one whose layout
 * name has since been removed, degrades field by field to the default rather
 * than throwing the whole family back to plain — the operator's accent survives
 * a layout that did not.
 */
export function readSettings(raw: unknown): CardSettings {
  const blob = (raw ?? {}) as Record<string, unknown>;
  return {
    backgroundUrl: typeof blob.backgroundUrl === "string" ? blob.backgroundUrl : null,
    accent: typeof blob.accent === "string" && /^#[0-9a-f]{3,8}$/i.test(blob.accent)
      ? blob.accent
      : null,
    layout: isCardLayout(blob.layout) ? blob.layout : CARD_DEFAULTS.layout,
  };
}

/** Apply a family's settings to a spec, without the spec knowing they exist. */
export function withSettings<T extends { accent?: string; imageUrl?: string | null }>(
  spec: T,
  settings: CardSettings,
): T & { layout: CardLayout } {
  return {
    ...spec,
    // The spec's own accent wins where it set one — a trophy card's gold is a
    // meaning (13-DESIGN §1), not a theme, and an operator recolouring the
    // family must not repaint the podium.
    accent: spec.accent ?? settings.accent ?? undefined,
    imageUrl: spec.imageUrl ?? settings.backgroundUrl,
    layout: settings.layout,
  };
}

/** Thrown when a save would put a layout live that cannot be drawn. */
export class LayoutRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LayoutRefused";
  }
}

/**
 * E10 — a saved layout is asserted to still render **before** it goes live.
 *
 * ===== THE FENCE IS WHY THIS HAS TO EXIST =====
 *
 * Everywhere else on this platform a render failure must degrade to text:
 * `cardReply` fences `renderCard`, so a family that throws produces a text card
 * with all its buttons and nothing complains. That fence is correct and it
 * stays — house rule 11 — but it means a broken layout is **invisible
 * downstream**. It already happened: the renderer threw on every card for a
 * sprint, every card turned into text, and both bands stayed green.
 *
 * So the only place a broken layout can be caught is at the save, and here it
 * is deliberately **not** fenced: a fence at this point would be the fence
 * hiding the defect from the one person who could fix it.
 *
 * `render` is a parameter with the real default rather than a module-level
 * seam, so there is no exported setter for `94-export-reach` to call an
 * unfinished feature — and so production cannot end up running on a stub.
 */
export async function assertLayoutRenders(
  family: string,
  settings: CardSettings,
  render: (spec: never) => Promise<unknown> = defaultRender,
): Promise<void> {
  const { sampleSpec } = await import("./sample.ts");
  try {
    await render(withSettings(sampleSpec(family), settings) as never);
  } catch (e) {
    throw new LayoutRefused(
      `That layout could not be rendered, so it was not saved: ${(e as Error).message}. ` +
        `A card family that cannot render is refused here rather than turning into a ` +
        `text card for every gamer who presses the button.`,
    );
  }
}

const defaultRender = async (spec: never): Promise<unknown> => {
  const { renderCard } = await import("./render.ts");
  return renderCard(spec);
};
