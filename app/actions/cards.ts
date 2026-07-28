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
  return parseLayout(JSON.stringify({
    mascot: { x: n("mascot.x", d.mascot.x), y: n("mascot.y", d.mascot.y), size: n("mascot.size", d.mascot.size), hidden: on("mascot.hidden") },
    mark: { x: n("mark.x", d.mark.x), y: n("mark.y", d.mark.y), size: n("mark.size", d.mark.size), hidden: on("mark.hidden") },
    badge: { x: n("badge.x", d.badge.x), y: n("badge.y", d.badge.y), size: n("badge.size", d.badge.size), hidden: on("badge.hidden") },
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
