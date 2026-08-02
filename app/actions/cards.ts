"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { setContent } from "@/lib/cms";
import {
  DEFAULT_LAYOUT, LAYOUT_KINDS, layoutKey, parseLayout, type CardLayout,
} from "@/lib/cards/layout";
import { forgetLayouts } from "@/lib/cards/layout-store";
import { invalidateCards } from "@/lib/cards/cache";

export type CardActionState = { ok?: string; error?: string } | undefined;

// NOTE: a "use server" module may export ONLY async functions. Constants and
// types belong in lib/cards/layout.ts — exporting a plain object here made the
// entire module fail to load at runtime, which took every card action with it
// and produced the most confusing possible symptom: buttons that did nothing,
// silently, with no client-side error.

// Where the elements on a rendered PNG card go.
//
// Saving does three things, and all three matter: it writes the numbers, it
// drops the memoised layout so the very next render uses them, and it deletes
// every cached PNG of that kind. Without the last one the change is invisible —
// the bot serves cards from Blob by content hash, and the hash is of the card's
// DATA, not of the renderer's geometry, so a moved logo would never reach a
// card that had already been rendered once.

function readLayout(fd: FormData): CardLayout {
  const n = (k: string, fallback: number) => {
    const v = Number(fd.get(k));
    return Number.isFinite(v) ? v : fallback;
  };
  const on = (k: string) => fd.get(k) === "on" || fd.get(k) === "true";
  const d = DEFAULT_LAYOUT;
  // Placed images, per-part visibility and the background-source order travel as
  // one JSON field rather than a form input each: they are lists of unknown
  // length, and `parseLayout` below validates and clamps every one of them (URL
  // schemes, part-key shape, sizes) exactly as it does for a stored layout. A
  // missing or malformed blob falls back to the defaults instead of wiping what
  // the admin had — losing placed art to a stray character is not recoverable.
  const json = (k: string, fallback: unknown) => {
    const raw = fd.get(k);
    if (typeof raw !== "string" || !raw) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  };
  // Round-tripped through the parser so the same clamps that protect the
  // renderer also protect what gets stored — one definition of "valid".
  // Opacity is read for all four.
  //
  // It was in the type and on the canvas and NOT in this reader, so the slider
  // moved, the preview faded, and saving threw the number away — the classic
  // shape of a control that appears to work. A field the editor can change has
  // to be a field the save can see.
  const spot = (k: "mascot" | "mark" | "badge" | "ad") => ({
    x: n(`${k}.x`, d[k].x),
    y: n(`${k}.y`, d[k].y),
    size: n(`${k}.size`, d[k].size),
    opacity: n(`${k}.opacity`, 100),
    hidden: on(`${k}.hidden`),
  });
  return parseLayout(JSON.stringify({
    mascot: spot("mascot"),
    mark: spot("mark"),
    badge: spot("badge"),
    ad: spot("ad"),
    content: { x: n("content.x", d.content.x), y: n("content.y", d.content.y), w: n("content.w", d.content.w), h: n("content.h", d.content.h) },
    plate: n("plate", d.plate),
    plateRadius: n("plateRadius", d.plateRadius),
    dim: n("dim", d.dim),
    glows: on("glows"),
    bar: on("bar"),
    scrim: on("scrim"),
    assets: json("assets", d.assets),
    parts: json("parts", d.parts),
    bgSources: json("bgSources", d.bgSources),
  }));
}

export async function saveCardLayout(_prev: CardActionState, fd: FormData): Promise<CardActionState> {
  await requireStaff();
  const kind = String(fd.get("kind") ?? "");
  if (!LAYOUT_KINDS.includes(kind as never)) return { error: "Unknown card kind." };

  await setContent(layoutKey(kind), JSON.stringify(readLayout(fd)));
  forgetLayouts();
  const dropped = await invalidateCards(kind);

  revalidatePath("/admin/cards/guide");
  return {
    ok: dropped > 0
      ? `Layout saved. ${dropped} cached card${dropped === 1 ? "" : "s"} cleared — they re-render on next use.`
      : "Layout saved.",
  };
}

/**
 * Put this card's furniture on every other card.
 *
 * The mascot, the mark, the badge and the sponsor box are the four things every
 * card has, and getting them consistent meant opening twelve editors and
 * repeating the same four positions twelve times — which nobody did, so they
 * drifted. One press copies position, size, opacity and visibility across the
 * whole set.
 *
 * ONLY those four. Everything else about a card is specific to it: a challenge's
 * content box has nothing to say about a quest's, and copying background sources
 * or placed art between kinds would silently destroy work. The narrow scope is
 * the reason this is safe enough to be a single button.
 */
export async function applyFurnitureEverywhere(_prev: CardActionState, fd: FormData): Promise<CardActionState> {
  await requireStaff();
  const from = String(fd.get("kind") ?? "");
  if (!LAYOUT_KINDS.includes(from as never)) return { error: "Unknown card kind." };

  // Read the furniture off the form — the CURRENT state of the editor, not what
  // was last saved. Applying stale values would make the button do something
  // other than what the canvas shows.
  const source = readLayout(fd);

  const { allLayouts } = await import("@/lib/cards/layout-store");
  const layouts = await allLayouts();

  let changed = 0;
  for (const kind of LAYOUT_KINDS) {
    const current = layouts[kind] ?? DEFAULT_LAYOUT;
    const next: CardLayout = {
      ...current,
      mascot: source.mascot,
      mark: source.mark,
      badge: source.badge,
      ad: source.ad,
    };
    if (JSON.stringify(next) === JSON.stringify(current)) continue;
    await setContent(layoutKey(kind), JSON.stringify(next));
    changed++;
  }

  forgetLayouts();
  // Every kind's cached PNGs, not just this one — the geometry moved on all of
  // them, and a cached card is keyed by its data rather than by the layout.
  let dropped = 0;
  for (const kind of LAYOUT_KINDS) dropped += await invalidateCards(kind);

  revalidatePath("/admin/cards/guide");
  return {
    ok: `Mascot, logo, badge and sponsor box copied to ${changed} card kind${changed === 1 ? "" : "s"}.`
      + (dropped > 0 ? ` ${dropped} cached card${dropped === 1 ? "" : "s"} cleared.` : ""),
  };
}

// Back to the house geometry. Stored as the explicit default rather than an
// empty value so "reset" and "never touched" read the same way everywhere.
export async function resetCardLayout(_prev: CardActionState, fd: FormData): Promise<CardActionState> {
  await requireStaff();
  const kind = String(fd.get("kind") ?? "");
  if (!LAYOUT_KINDS.includes(kind as never)) return { error: "Unknown card kind." };

  await setContent(layoutKey(kind), JSON.stringify(DEFAULT_LAYOUT));
  forgetLayouts();
  await invalidateCards(kind);
  revalidatePath("/admin/cards/guide");
  return { ok: "Back to the default layout." };
}
