// The card renderer.
//
// Every reply the bot sends is a card, because consistency is the product's
// face. Two things about this renderer were learned in production and both are
// enforced here rather than remembered:
//
// ===== 1. IT CANNOT DECODE WebP =====
//
// The renderer answers `Unsupported image type: image/webp` and the artwork
// simply does not appear — game art, brand creatives, anything. Two rules
// follow (docs/11-PORTED-CODE.md):
//
//   * **Convert on upload.** Accept whatever the uploader gives and store PNG
//     or JPEG. Never trust the source format. That is `lib/cards/upload.ts`.
//   * **Fence the image.** A card whose artwork will not decode must still
//     render — text, buttons, navigation. See below.
//
// ===== 2. A DECORATION MAY NEVER TAKE A CARD DOWN =====
//
// House rule 11, and it is the general form of the WebP problem. A sponsor
// link signature once threw out of an ad button and took the entire Discord
// bot down with it. So anything that can throw on a card path is fenced, and
// the card renders without it.

import { cardFontFamily as fontFamilyFor, type CardFont } from "./fonts.ts";

/** Formats the renderer can actually decode. Everything else is converted. */
export const RENDERABLE_IMAGE_TYPES = ["image/png", "image/jpeg"] as const;

/**
 * WebP is the one that bites: browsers and Discord both serve it happily, so
 * an image that looks fine everywhere else is invisible on a card.
 */
export function isRenderableImageType(contentType: string | null | undefined): boolean {
  if (!contentType) return false;
  const type = contentType.split(";")[0].trim().toLowerCase();
  return (RENDERABLE_IMAGE_TYPES as readonly string[]).includes(type);
}

export type FenceResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Run a decoration, and never let it take the card down.
 *
 * Returns a result rather than throwing, and **logs the failure with enough to
 * find it** — rule 3 of the WebP notes: a bad asset must be findable rather
 * than merely invisible. An `catch {}` here would satisfy the rule and lose
 * the only evidence.
 */
export async function fence<T>(
  what: string,
  fn: () => Promise<T> | T,
): Promise<FenceResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[card] decoration failed and was skipped: ${what} — ${error}`);
    return { ok: false, error };
  }
}

export type CardSpec = {
  title: string;
  subtitle?: string;
  /** Artwork. May be missing, may be undecodable — either way the card renders. */
  imageUrl?: string | null;
  rows?: { label: string; value: string }[];
  footer?: string;
  accent?: string;
  /**
   * Which arrangement to draw. `14-EDITABLE` E8/E10.
   *
   * Optional and defaulted, so every existing caller keeps drawing exactly what
   * it drew before — and so a family whose saved layout name no longer exists
   * degrades to `standard` rather than throwing, which the fence would turn
   * into a text card nobody was told about.
   */
  layout?: "standard" | "banner" | "minimal";
};

export type RenderedCard = {
  png: Uint8Array;
  /** True when artwork was requested and did not make it onto the card. */
  artworkDropped: boolean;
  /** Why, so a bad asset is findable. */
  artworkError?: string;
};

/**
 * Render a card to PNG.
 *
 * The image is fetched and validated **before** it reaches the renderer,
 * because the renderer's failure mode is to throw and take the whole card with
 * it. Checking the content type first turns "the card did not appear" into
 * "the card appeared without its artwork, and the log says why".
 */
export async function renderCard(spec: CardSpec): Promise<RenderedCard> {
  const { ImageResponse } = await import("@vercel/og");
  const { loadCardFonts } = await import("./fonts.ts");

  const fonts = await fence("fonts", () => loadCardFonts());
  const artwork = spec.imageUrl
    ? await fence("artwork", async () => {
        const res = await fetch(spec.imageUrl as string);
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${spec.imageUrl}`);
        const type = res.headers.get("content-type");
        if (!isRenderableImageType(type)) {
          // Named explicitly, because "it did not render" is what everybody
          // saw for months and it told them nothing.
          throw new Error(
            `Unsupported image type: ${type ?? "unknown"} for ${spec.imageUrl}. ` +
              `The card renderer decodes PNG and JPEG only — convert on upload.`,
          );
        }
        return spec.imageUrl as string;
      })
    : null;

  // ===== AN EMPTY FONT LIST IS NOT THE SAME AS NO FONT LIST =====
  //
  // `ImageResponse` ships a vendored Noto Sans and uses it when `fonts` is
  // **omitted**. Passing `fonts: []` throws *"No fonts are loaded. At least one
  // font is required to calculate the layout."*
  //
  // `loadCardFonts()` returns `[]` when no brand fonts are installed — which is
  // a success, and the documented normal case. So the previous line handed the
  // renderer an empty array and **every card on the platform threw**. The fence
  // caught it, the text fallback went out, and nothing ever failed: the product
  // quietly lost its entire visual identity and told nobody. House rule 11 kept
  // the cards standing and hid the reason they were standing.
  //
  // Found by pressing a button on a real build and reading the log, which is
  // the only place it was visible.
  const brandFonts = fonts.ok ? fonts.value : [];
  const response = new ImageResponse(cardTree(spec, artwork?.ok ? artwork.value : null, brandFonts), {
    width: 1200,
    height: 630,
    ...(brandFonts.length > 0
      ? {
          fonts: brandFonts as unknown as ConstructorParameters<
            typeof ImageResponse
          >[1] extends { fonts?: infer F }
            ? F
            : never,
        }
      : {}),
  });

  return {
    png: new Uint8Array(await response.arrayBuffer()),
    artworkDropped: Boolean(spec.imageUrl) && !(artwork?.ok ?? false),
    ...(artwork && !artwork.ok ? { artworkError: artwork.error } : {}),
  };
}

/**
 * The layout. Kept separate so it can be inspected without rendering.
 *
 * `fonts` decides the family string rather than it being hard-coded: naming
 * `Cluster` when no Cluster font is loaded is a family the renderer has never
 * heard of, and `cardFontFamily` exists to answer exactly that question. It was
 * exported and called by nothing while the tree named the family by hand.
 */
export function cardTree(
  spec: CardSpec,
  artworkUrl: string | null,
  fonts: CardFont[] = [],
): React.ReactElement {
  const accent = spec.accent ?? "#7c5cff";

  // ===== THREE LAYOUTS, ONE TREE =====
  //
  // E8 — the preview is rendered by the same code that renders the card, so a
  // layout is a branch **here** rather than a second component somewhere the
  // bot never runs. Two renderers is how a preview starts lying, and this
  // platform has already paid for that once: the renderer threw on every card
  // for a sprint, the fence turned them into text, and both bands stayed green.
  //
  // `banner` gives the artwork the whole top and drops the rows to make room —
  // the shape a challenge announcement wants. `minimal` drops the artwork
  // entirely, which is what an owner-only card should look like when a server
  // has set a background that is fine for a public card and wrong for a
  // private one.
  const layout = spec.layout ?? "standard";
  const showArt = layout !== "minimal" && artworkUrl;
  const artHeight = layout === "banner" ? 380 : 240;
  const titleSize = layout === "minimal" ? 72 : 64;

  return {
    type: "div",
    key: null,
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "#0a0a0c",
        color: "#f2f2f5",
        padding: 56,
        fontFamily: fontFamilyFor(fonts),
      },
      children: [
        showArt
          ? {
              type: "img",
              key: "art",
              props: {
                src: artworkUrl,
                width: 1200,
                height: artHeight,
                style: { objectFit: "cover", borderRadius: 16 },
              },
            }
          : null,
        {
          type: "div",
          key: "title",
          props: {
            style: { fontSize: titleSize, fontWeight: 700, marginTop: 8 },
            children: spec.title,
          },
        },
        spec.subtitle
          ? {
              type: "div",
              key: "sub",
              props: {
                style: { fontSize: 30, color: "#8b8b96", marginTop: 8 },
                children: spec.subtitle,
              },
            }
          : null,
        {
          type: "div",
          key: "rows",
          props: {
            style: { display: "flex", flexDirection: "column", gap: 10, marginTop: 28 },
            children: (layout === "banner" ? (spec.rows ?? []).slice(0, 2) : (spec.rows ?? [])).map((r, i) => ({
              type: "div",
              key: `r${i}`,
              props: {
                style: { display: "flex", justifyContent: "space-between", fontSize: 28 },
                children: [
                  { type: "span", key: "l", props: { style: { color: "#8b8b96" }, children: r.label } },
                  { type: "span", key: "v", props: { children: r.value } },
                ],
              },
            })),
          },
        },
        {
          type: "div",
          key: "footer",
          props: {
            style: { marginTop: "auto", fontSize: 24, color: accent },
            children: spec.footer ?? "ClusterGG",
          },
        },
      ].filter(Boolean),
    },
  } as unknown as React.ReactElement;
}

export type { CardFont };
