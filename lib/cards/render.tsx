import { ImageResponse } from "next/og";
import { loadCardFonts, cardFontFamily } from "@/lib/cards/fonts";
import { toEmbeddable, withDeadline } from "@/lib/cards/img";
import { brandCardArt } from "@/lib/cards/brand";
import {
  AD_LABEL_H, CANVAS_W, DEFAULT_LAYOUT, adBox, assetBox, badgeTopFor, contentBox, opacityOf,
  partOf, plateBg, sideBox, sideBoxFits, spotBox, transformOf,
} from "@/lib/cards/layout";
import type { CardAsset, PartDraw } from "@/lib/cards/layout";
import { assetPicture } from "@/lib/cards/asset-source";
import { layoutFor } from "@/lib/cards/layout-store";
import type {
  CardAdSlot,
  CardData, CardTheme, ProfileCard, GameStatsCard, QuestCard, CpSummaryCard, MarketCard,
  LeaderboardCard, ChallengeCard, PlanetCard, PlanetsCard, GuideCard, WeekCard,
  WorldCard, SearchCard,
} from "@/lib/cards/types";

// Server-rendered "glorified" PNG cards, shared by the Discord bot and the web
// (they double as OpenGraph images). Built on next/og's ImageResponse — no extra
// dependency, no headless browser. One cosmic frame, one body per card kind.

export const CARD_W = 1200;
export const CARD_H = 630;

const INK = "#f2f3ff";
const MUTED = "#9aa0c3";
const VOID = "#04051a";

// Avatars, game logos, champion and match icons are drawn small. Resolving them
// at full card width costs decode time for pixels nobody sees.
const ICON = { maxWidth: 160 } as const;

const veil = (dim = 62) => `rgba(4,5,26,${Math.max(0, Math.min(100, dim)) / 100})`;

// ===== Colour =====
//
// Accents come from gamers (the profile customizer), from admins (per-game and
// per-quest themes) and from game data, so they arrive in every shape CSS
// allows. Two of those shapes used to destroy the whole card:
//
//  - Translucency was applied by string concatenation — `${accent}22` — which
//    is only valid when the colour is 6-digit hex. A perfectly legal `#f0f`
//    became `#f0f22`, Satori threw "Failed to parse declaration", and the
//    render failed outright. Anyone whose accent was shorthand hex had NO
//    profile card at all, on the site and in Discord.
//  - Any value Satori can't parse (an empty string, a stray word) did the same
//    to the gradients.
//
// So alpha is expressed as rgba(), and anything unparseable falls back to the
// house colours. One bad colour must never cost a card.
const FALLBACK_ACCENT = "#8b5cf6";
const FALLBACK_ACCENT2 = "#22d3ee";

const NAMED: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff",
  yellow: "#ffff00", orange: "#ffa500", purple: "#800080", pink: "#ffc0cb", cyan: "#00ffff",
  magenta: "#ff00ff", gray: "#808080", grey: "#808080", gold: "#ffd700", silver: "#c0c0c0",
};

// → [r, g, b] for anything we can read, else null.
function rgbOf(color: string | null | undefined): [number, number, number] | null {
  if (!color) return null;
  const c = NAMED[color.trim().toLowerCase()] ?? color.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(c);
  if (hex) {
    const h = hex[1];
    // #rgb and #rgba expand each digit; #rrggbb and #rrggbbaa are read directly.
    const parts = h.length === 3 || h.length === 4
      ? [h[0] + h[0], h[1] + h[1], h[2] + h[2]]
      : h.length === 6 || h.length === 8
        ? [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)]
        : null;
    if (!parts) return null;
    return parts.map((p) => parseInt(p, 16)) as [number, number, number];
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3])];
  return null;
}

// A colour safe to hand Satori, whatever came in.
function safeColor(color: string | null | undefined, fallback = FALLBACK_ACCENT): string {
  const rgb = rgbOf(color);
  return rgb ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : fallback;
}

// The same colour at a given opacity. Replaces every `${accent}NN`.
function alpha(color: string | null | undefined, a: number, fallback = FALLBACK_ACCENT): string {
  const rgb = rgbOf(color) ?? rgbOf(fallback) ?? [139, 92, 246];
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.max(0, Math.min(1, a))})`;
}

// Normalised once, at the top of every render, so no card body has to think
// about it and a broken colour can't reach Satori through some path we missed.
function safeTheme(theme: CardTheme): CardTheme {
  return {
    ...theme,
    accent: safeColor(theme.accent, FALLBACK_ACCENT),
    accent2: safeColor(theme.accent2, FALLBACK_ACCENT2),
  };
}

// The shared frame: artwork → veil → content → mascot → logo → badge.
//
// Every position here comes from the card's LAYOUT (Admin → Card layouts), not
// from constants. The defaults reproduce the geometry this frame used to
// hard-code, so an unedited card is pixel-identical to what it drew before.
/**
 * What the badge shows, once the admin has had a say.
 *
 * The card body proposes (a level pill, a game logo, a trophy row) and the
 * layout disposes. "auto" keeps the body's proposal, which is why setting this
 * changes nothing until somebody chooses — and why a choice that the card has
 * no data for shows nothing rather than something wrong.
 */
function badgeContent(
  theme: CardTheme,
  proposed: React.ReactNode,
): React.ReactNode {
  const show = theme.layout?.badgeShow ?? "auto";
  if (show === "auto") return proposed;
  if (show === "none") return undefined;
  const b = theme.badge ?? {};
  if (show === "game" && b.gameLogoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={b.gameLogoUrl} alt="" width={72} height={72}
      style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover" }} />;
  }
  if (show === "level" && typeof b.level === "number") {
    return <Pill color={theme.accent2} bg="rgba(0,0,0,0.45)">{`LV ${b.level}`}</Pill>;
  }
  if (show === "trophy" && b.trophyUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={b.trophyUrl} alt="" width={72} height={72}
      style={{ width: 72, height: 72, objectFit: "contain" }} />;
  }
  return undefined;
}

function Frame({ theme, children, corner: proposedCorner, side }: {
  theme: CardTheme;
  children: React.ReactNode;
  corner?: React.ReactNode;
  /**
   * The right-hand column, between the sponsor and the logo.
   *
   * Content is clipped to the content box, so a card that wants to put a
   * picture beside its text — the world card's splash — cannot do it from
   * inside `children`. This is that column: it is handed the exact rectangle
   * the layout leaves free, so it can never overlap the text or the ad.
   */
  side?: (box: { left: number; top: number; width: number; height: number }) => React.ReactNode;
}) {
  const corner = badgeContent(theme, proposedCorner);
  const l = theme.layout ?? DEFAULT_LAYOUT;
  const mascot = spotBox(l.mascot, 1);
  const mark = spotBox(l.mark, 1);
  const badge = spotBox(l.badge, 1);
  const content = contentBox(l.content);
  // The sponsor, and the badge pushed clear of it. `badgeTopFor` returns the
  // badge's own top when there's no ad or no collision, so an unsold card and a
  // hand-placed badge are both untouched.
  const ad = theme.ad && !l.ad.hidden ? theme.ad : null;
  const adB = adBox(l.ad);
  const badgeTop = badgeTopFor(l, !!ad, 1);
  // The free rectangle to the right of the content: starts where the text
  // column ends, stops at the canvas edge, and begins under whichever of the
  // sponsor box and the badge hangs lowest. Computed from the LIVE layout, so
  // an admin who drags the ad somewhere else moves this with it — and computed
  // by the same helper the layout editor draws it with.
  const side_ = sideBox(l, { hasAd: !!ad, hasBadge: !!corner });
  return (
    <div style={{ width: CARD_W, height: CARD_H, display: "flex", position: "relative", background: VOID, color: INK }}>
      {theme.bgUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={theme.bgUrl} alt="" width={CARD_W} height={CARD_H}
          style={{ position: "absolute", inset: 0, width: CARD_W, height: CARD_H, objectFit: "cover" }} />
      ) : null}
      {/* Readability scrim. A flat veil isn't enough over real artwork — a
          bright patch anywhere behind a line of text loses that line. So it's
          a flat veil PLUS gradients that darken hardest exactly where the
          content sits: the left column and the bottom strip. */}
      {/* Sized explicitly, not with `inset: 0`: Satori lays out absolutely
          positioned elements through Yoga, which gives an empty div zero size
          unless it is told otherwise — so an inset-only overlay silently
          renders as nothing and the artwork comes through at full brightness. */}
      <div style={{ position: "absolute", top: 0, left: 0, width: CARD_W, height: CARD_H, display: "flex", background: theme.bgUrl ? veil(l.dim) : VOID }} />
      {/* The directional scrims ride the SAME slider as the flat veil.
          They used to be a separate tickbox, which meant the card had two
          controls both labelled as darkening and neither of them honest: with
          the tickbox on, dragging the slider to 0 still left the art buried
          under two gradients, so "no overlay" did not mean no overlay. Scaling
          them by the slider gives one number that goes all the way to nothing —
          which is the only way the control can be checked by looking at it.
          `SCRIM_TUNED_AT` is the dim the gradients were designed against, so
          the default look is unchanged. */}
      {theme.bgUrl && l.dim > 0 ? (
        (() => {
          const k = Math.min(1.4, l.dim / SCRIM_TUNED_AT);
          const g = (a: number) => `rgba(4,5,26,${(a * k).toFixed(3)})`;
          return (
            <>
              <div style={{ position: "absolute", top: 0, left: 0, width: CARD_W, height: CARD_H, display: "flex", background: `linear-gradient(90deg, ${g(0.94)} 0%, ${g(0.78)} 48%, ${g(0.46)} 100%)` }} />
              <div style={{ position: "absolute", top: 0, left: 0, width: CARD_W, height: CARD_H, display: "flex", background: `linear-gradient(180deg, ${g(0.62)} 0%, ${g(0.30)} 38%, ${g(0.90)} 100%)` }} />
            </>
          );
        })()
      ) : null}
      {/* The two corner glows. Off by default now: at 1200x630 they read as
          two grey discs bleeding off opposite corners rather than as light,
          and they sat on top of whatever the artwork put there. */}
      {l.glows ? (
        <>
          <div style={{ position: "absolute", top: -220, left: -160, width: 720, height: 720, borderRadius: 999, display: "flex", background: alpha(theme.accent, 0.13) }} />
          <div style={{ position: "absolute", bottom: -280, right: -180, width: 760, height: 760, borderRadius: 999, display: "flex", background: alpha(theme.accent2, 0.11, FALLBACK_ACCENT2) }} />
        </>
      ) : null}
      {l.bar ? (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 8, display: "flex", background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2})` }} />
      ) : null}
      {/* Admin-placed art BEHIND the content — planet globes, quest maps,
          seasonal flourishes. Drawn before the mascot so the mascot still reads
          as the foreground character. */}
      {(l.assets ?? []).filter((a) => !a.front).map((a) => <Asset key={a.id} a={a} />)}

      {/* The astronaut, behind the content. */}
      {theme.astronautUrl && !l.mascot.hidden ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={theme.astronautUrl} alt="" width={mascot.width} height={mascot.height}
          style={{
            position: "absolute", left: mascot.left, top: mascot.top,
            width: mascot.width, height: mascot.height, objectFit: "contain",
            // 0.85 is the house default; an explicit setting overrides it.
            opacity: opacityOf(l.mascot.opacity) ?? 0.85,
            ...styleOf({ ...l.mascot, opacity: undefined }),
          }} />
      ) : null}
      {/* The content block. Its box is part of the layout, so moving the logo
          out of a corner can actually give the card that corner back. */}
      <div style={{ position: "absolute", left: content.left, top: content.top, width: content.width, height: content.height, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {children}
      </div>
      {/* The right-hand column. Drawn before the logo on purpose: the logo is
          the one thing that is never covered. */}
      {side && sideBoxFits(side_) ? side(side_) : null}
      {/* The real logo mark, drawn on top of everything. Falls back to the
          wordmark only when no logo is configured, so a card is never
          unbranded. */}
      {!l.mark.hidden ? (
        <div style={{
          position: "absolute", left: mark.left, top: mark.top, width: mark.width, height: mark.height,
          display: "flex", alignItems: "center", justifyContent: "center", ...styleOf(l.mark),
        }}>
          {theme.markUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={theme.markUrl} alt="" width={mark.width} height={mark.height}
              style={{ width: mark.width, height: mark.height, borderRadius: Math.round(mark.width * 0.23), objectFit: "contain" }} />
          ) : (
            // Drawn at 62% of the spot, not filling it. The mark is 250px now,
            // and a deployment that hasn't uploaded a logo yet should get a
            // wordmark-sized placeholder, not a 250px solid tile painted over
            // the corner of every card it renders.
            <div style={{ width: Math.round(mark.width * 0.62), height: Math.round(mark.width * 0.62), borderRadius: Math.round(mark.width * 0.14), display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`, fontSize: Math.round(mark.width * 0.34), fontWeight: 700, color: "#fff" }}>C</div>
          )}
        </div>
      ) : null}
      {/* Top-right furniture: game logo, level pill, or the trophy stack. Right
          edge pinned to the spot so a stack of different heights still hangs
          from the same line. */}
      {corner && !l.badge.hidden ? (
        <div style={{
          position: "absolute", right: CARD_W - (badge.left + badge.width), top: badgeTop,
          display: "flex", justifyContent: "flex-end", ...styleOf(l.badge),
        }}>{corner}</div>
      ) : null}

      {/* Admin art ON TOP of everything — a watermark, a LIVE sticker, a
          sponsor mark. Last, so it wins. */}
      {(l.assets ?? []).filter((a) => a.front).map((a) => <Asset key={a.id} a={a} />)}

      {/* The sponsor, drawn after everything else.
          This is inventory somebody paid for: a placed asset or a bright patch
          of artwork covering it is a delivered impression the brand didn't get.
          So it wins over every other layer, and only an admin hiding the slot
          on this card kind takes it off. */}
      {ad ? <AdSlot ad={ad} box={adB} opacity={l.ad.opacity} /> : null}
    </div>
  );
}

// The ad box: creative on top, the disclosure strip under it.
//
// The label is not decoration. A sponsored image dropped into artwork with no
// marking is the kind of thing that gets a bot removed from servers and a
// platform written about, so every card says who paid for the box.
function AdSlot({ ad, box, opacity }: {
  ad: CardAdSlot;
  box: { left: number; top: number; width: number; height: number; imageHeight: number };
  opacity?: number;
}) {
  const label = (ad.label || "Sponsored").toUpperCase();
  const brand = (ad.brandName || "").toUpperCase();
  return (
    <div style={{
      position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height,
      display: "flex", flexDirection: "column", overflow: "hidden",
      borderRadius: 14, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(4,5,26,0.82)",
      ...styleOf({ opacity }),
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ad.imageUrl} alt="" width={box.width} height={box.imageHeight}
        style={{ width: box.width, height: box.imageHeight, objectFit: "cover" }} />
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: box.width, height: AD_LABEL_H, paddingLeft: 9, paddingRight: 9,
        fontSize: 11, letterSpacing: 0.8, color: MUTED,
      }}>
        <div style={{ display: "flex" }}>{label}</div>
        <div style={{ display: "flex", color: INK, fontWeight: 700 }}>{brand.slice(0, 22)}</div>
      </div>
    </div>
  );
}

/**
 * Opacity and transform, as style keys that only exist when they are set.
 *
 * Satori is not React DOM: it walks the style object it is handed and parses
 * every key it finds, so `{ transform: undefined }` is not "no transform" — it
 * is a transform whose value is undefined, and the parser calls `.trim()` on
 * it and takes down EVERY card on the platform. Spreading the result means an
 * unset property is genuinely absent rather than present-and-undefined.
 */
function styleOf(o: { opacity?: number; flipX?: boolean; flipY?: boolean; rotate?: number }): React.CSSProperties {
  const out: React.CSSProperties = {};
  const op = opacityOf(o.opacity);
  if (op !== undefined) out.opacity = op;
  const tf = transformOf(o);
  if (tf) out.transform = tf;
  return out;
}

/**
 * The `dim` the directional scrims were designed against.
 *
 * The gradients above are hand-tuned alpha stops; this is the veil strength
 * they were tuned at, so scaling by `dim / SCRIM_TUNED_AT` leaves the default
 * card pixel-identical and makes every other setting proportional.
 */
const SCRIM_TUNED_AT = 62;

// ===== Sections =====
//
// Every block a card draws is NAMED, and the name is what an admin edits.
//
// Before this, the layout editor could move the furniture and resize the
// content box, and that was all — "the card is too busy" had exactly one
// answer, which was to make the whole block smaller. The sections declared in
// `layout-guide.ts` are the real grain of a card: the trophy case, the recent
// matches, the standings, the abilities. Each one can be turned off, faded,
// scaled, and — where the section has fixed copy of its own — reworded.
//
// Live data is deliberately NOT rewordable. A heading over a leaderboard can
// say whatever a server wants it to say; the leaderboard cannot.

/** This card's setting for one named section. */
function part(t: CardTheme, key: string): PartDraw {
  return partOf(t.layout ?? DEFAULT_LAYOUT, key);
}

/**
 * One named section, drawn or not.
 *
 * Returning `null` when hidden is the whole trick: the section leaves the flex
 * column entirely rather than collapsing to a zero-height box that still eats
 * its margin, so hiding the trophy case genuinely gives that space to whatever
 * is underneath it.
 */
function Section({ p, style, children }: {
  p: PartDraw; style?: React.CSSProperties; children: React.ReactNode;
}) {
  if (p.hidden) return null;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        ...style,
        // The admin's own nudge, width and stacking order — applied LAST so it
        // wins over the section's built-in style. That is the point of the
        // editor: whatever the renderer thought, the person looking at the card
        // gets the final say.
        ...p.box(),
        ...styleOf({ opacity: p.opacity }),
      }}
    >
      {children}
    </div>
  );
}

/**
 * A section heading — the one line of a data block an admin can rewrite.
 *
 * `flexShrink: 0` is load-bearing. When a card's content is a few pixels taller
 * than its box, Yoga compresses every child that will compress, and a heading
 * squeezed to half its line height renders ON TOP of the first row beneath it.
 * A heading that refuses to shrink pushes the overflow to the bottom, where
 * `overflow: hidden` clips it cleanly instead.
 */
function Head({ p, children, color = MUTED }: { p: PartDraw; children: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexShrink: 0, fontSize: p.f(17), letterSpacing: 3, color, fontWeight: 700 }}>
      {p.say(children)}
    </div>
  );
}

// One admin-placed image.
//
// Satori needs an explicit width/height on an absolutely positioned element —
// it lays out through Yoga, which gives an unsized box zero size and silently
// draws nothing.
function Asset({ a }: { a: CardAsset }) {
  const box = assetBox(a);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={a.url}
      alt=""
      width={box.width}
      height={box.height}
      style={{
        position: "absolute", left: box.left, top: box.top,
        width: box.width, height: box.height, objectFit: "contain",
        ...styleOf(a),
      }}
    />
  );
}

// The dark plate behind a block of text.
//
// Over real artwork the veil alone loses a line the moment the image has a
// bright patch behind it, and the fix that scales is not "darken the whole
// card" — that kills the art everywhere to save text in one place. It's a
// local plate under the text that needs it. Admin-controlled per card kind, so
// a flat graphic background can turn it off entirely.
//
// Two rules keep it from costing anything:
//
//  - No background art, no plate. On a flat card there is nothing to be
//    illegible against, and a dark rectangle on a dark card is just a smudge.
//  - The padding is cancelled by an equal negative margin, so the plate grows
//    OUTWARD from the text instead of pushing it. Without that, every card
//    gained ~28px of height at the title and the dense ones (challenge, guide)
//    pushed their last row off the bottom of the canvas.
function Plate({ theme, children, style }: {
  theme: CardTheme;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const layout = theme.layout ?? DEFAULT_LAYOUT;
  if (layout.plate <= 0 || !theme.bgUrl) {
    return <div style={{ display: "flex", flexDirection: "column", ...style }}>{children}</div>;
  }
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignSelf: "flex-start",
      padding: "10px 18px", margin: "-10px -18px", borderRadius: layout.plateRadius,
      background: plateBg(layout),
      ...style,
    }}>
      {children}
    </div>
  );
}

function Pill({ children, color = MUTED, bg = "rgba(255,255,255,0.07)", size = 21 }: {
  children: React.ReactNode; color?: string; bg?: string; size?: number;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: `${Math.round(size / 3)}px ${Math.round(size * 0.76)}px`, borderRadius: 999,
      background: bg, color: safeColor(color, MUTED), fontSize: size, fontWeight: 700,
    }}>
      {children}
    </div>
  );
}

function Avatar({ url, size = 104, ring: raw }: { url?: string | null; size?: number; ring: string }) {
  const ring = safeColor(raw);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size}
      style={{ width: size, height: size, borderRadius: size / 2, objectFit: "cover", border: `4px solid ${ring}` }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: size / 2, display: "flex", alignItems: "center", justifyContent: "center", background: alpha(ring, 0.2), border: `4px solid ${ring}`, fontSize: size * 0.42, fontWeight: 700 }}>C</div>
  );
}

function Bar({ pct, accent: a1, accent2: a2, h = 16 }: { pct: number; accent: string; accent2: string; h?: number }) {
  const w = Math.max(2, Math.min(100, pct));
  const [accent, accent2] = [safeColor(a1), safeColor(a2, FALLBACK_ACCENT2)];
  return (
    <div style={{ display: "flex", width: "100%", height: h, borderRadius: 999, background: "rgba(255,255,255,0.10)", overflow: "hidden" }}>
      <div style={{ display: "flex", width: `${w}%`, height: h, borderRadius: 999, background: `linear-gradient(90deg, ${accent}, ${accent2})` }} />
    </div>
  );
}

function Title({ text, sub, accent: a1, accent2: a2, theme, p, size = 52 }: {
  text: string; sub?: string | null; accent: string; accent2: string; theme: CardTheme;
  /** The `title` section's setting, when the card has one. */
  p?: PartDraw;
  /**
   * Headline size. 52 is the house default — the text column lost 120px to the
   * sponsor box and the logo, and a two-word title at the old 58 wrapped to
   * three lines. Dense cards pass something smaller: on a challenge card every
   * line the title takes is a line the standings don't get.
   */
  size?: number;
}) {
  const [accent, accent2] = [safeColor(a1), safeColor(a2, FALLBACK_ACCENT2)];
  const f = p?.f ?? ((n: number) => n);
  if (p?.hidden) return null;
  return (
    <Plate theme={theme} style={{ gap: 6, ...styleOf({ opacity: p?.opacity }) }}>
      <div style={{ fontSize: f(size), fontWeight: 700, lineHeight: 1.05, color: INK }}>{text}</div>
      {sub ? <div style={{ fontSize: f(Math.round(size * 0.46)), color: MUTED }}>{sub}</div> : null}
      <div style={{ display: "flex", width: 132, height: 6, borderRadius: 999, marginTop: 8, background: `linear-gradient(90deg, ${accent}, ${accent2})` }} />
    </Plate>
  );
}

const nf = (n: number) => n.toLocaleString("en-US");

// Truncate on a word boundary. A hard slice reads as a bug ("…from the Che"),
// and these strings are admin-written, so they can be any length.
function clamp(s: string | null | undefined, max: number): string | undefined {
  if (!s) return undefined;
  const text = s.trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.\-–—]$/, "")}…`;
}

// ===== Bodies =====

function ProfileBody(d: ProfileCard) {
  const t = d.theme;
  const [pIdentity, pStats, pTrophies, pChallenges, pAccounts] =
    ["identity", "stats", "trophies", "challenges", "accounts"].map((k) => part(t, k));
  // Three, not five.
  //
  // The card is 1200x630 and a fourth tile makes all four unreadable — the name
  // clamps to nothing and the cash value, which is the whole reason the shelf is
  // worth looking at, stops fitting under the art. "Up to" three because a gamer
  // with one trophy should see one trophy, not one and two empty frames.
  // `trophies` arrives ordered most-valuable-first from `profileCard`.
  const trophies = pTrophies.hidden ? [] : (d.trophies ?? []).slice(0, 3);
  const challenges = pChallenges.hidden ? [] : (d.challenges ?? []).slice(0, 3);
  // The trophy shelf lives in the RIGHT-HAND COLUMN, under the sponsor box —
  // not in the text column. Put inline it competed with the arena and the
  // accounts for the same vertical inches and pushed the accounts off the card;
  // the right column is otherwise empty below the ad, and three pieces of art
  // stacked there read as a trophy shelf on a shelf. It costs the text column
  // nothing, so the arena keeps its three rows and the accounts keep four tiles.
  const accounts = d.accounts.slice(0, challenges.length ? 4 : 6);
  const accountsHidden = Math.max(0, d.accounts.length - accounts.length);
  return (
    <Frame
      theme={t}
      // The trophy shelf, drawn into the free rectangle to the right of the
      // text — under the sponsor box, above the mark. `box` is computed from the
      // LIVE layout, so an admin who drags the ad elsewhere moves the shelf with
      // it rather than leaving it overlapping.
      side={trophies.length ? (box) => <TrophyShelf trophies={trophies} total={d.trophyCount ?? trophies.length} box={box} p={pTrophies} /> : undefined}
    >
      <Section p={pIdentity}>
        <Plate theme={t} style={{ gap: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <Avatar url={d.avatarUrl} ring={t.accent} size={pIdentity.f(104)} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: pIdentity.f(52), fontWeight: 700, lineHeight: 1.05 }}>{clamp(d.displayName, 18)}</div>
              <div style={{ fontSize: pIdentity.f(23), color: MUTED }}>{`clustergg.com/u/${d.slug}${d.title ? ` · ${d.title}` : ""}`}</div>
            </div>
          </div>
        </Plate>
      </Section>

      <Section p={pStats} style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 22 }}>
        {/* The level belongs with the other things that describe this gamer —
            points, views, votes — not floating in the card's top-right corner
            as an unexplained badge. It reads as a stat because it is one. */}
        <Pill color={t.accent2} bg={alpha(t.accent2, 0.16, FALLBACK_ACCENT2)} size={pStats.f(21)}>{`LV ${nf(d.level)}`}</Pill>
        <Pill color={t.accent2} bg="rgba(255,255,255,0.08)" size={pStats.f(21)}><CpCoin size={pStats.f(18)} />{nf(d.totalCp)}</Pill>
        <Pill size={pStats.f(21)}>{`${nf(d.views)} views`}</Pill>
        <Pill color="#fbbf24" bg="rgba(251,191,36,0.12)" size={pStats.f(21)}>
          <div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: "#fbbf24" }} />
          {`${nf(d.votes)} votes`}
        </Pill>
        {d.award ? <Pill color="#34d399" bg="rgba(52,211,153,0.12)" size={pStats.f(21)}>{clamp(d.award, 22)}</Pill> : null}
      </Section>

      {/* What they're competing in right now — the one thing on this card that
          another gamer can act on. */}
      {challenges.length ? (
        <Section p={pChallenges} style={{ gap: 6, marginTop: 14 }}>
          <Head p={pChallenges}>IN THE ARENA</Head>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {challenges.map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderRadius: 14, background: "rgba(0,0,0,0.48)", border: `1px solid ${c.live ? alpha(t.accent2, 0.45, FALLBACK_ACCENT2) : "rgba(255,255,255,0.10)"}` }}>
                {c.live ? <div style={{ display: "flex", width: 10, height: 10, borderRadius: 5, background: "#34d399" }} /> : null}
                <div style={{ fontSize: pChallenges.f(19), fontWeight: 700 }}>{clamp(c.title, 22)}</div>
                <div style={{ fontSize: pChallenges.f(17), color: MUTED }}>{c.place ? `#${c.place}` : `${nf(c.points)} pts`}</div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section p={pAccounts} style={{ marginTop: 14, gap: 8, flex: 1 }}>
        {/* The count belongs in the heading when the card can't show them all —
            a gamer with six accounts seeing two, with nothing saying so, reads
            as us having lost four of them. Every account gets its own button
            underneath the card regardless (see `linkedAccountsOf`). */}
        <Head p={pAccounts}>{accountsHidden ? `LINKED ACCOUNTS · ${nf(d.accounts.length)}` : "LINKED ACCOUNTS"}</Head>
        {accounts.length === 0 ? (
          <div style={{ display: "flex", fontSize: pAccounts.f(24), color: MUTED }}>No games linked yet — link one to unlock quests.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {accounts.map((a, i) => (
              // A percentage, not a pixel width: the text column is narrower
              // now that the sponsor and the logo own the right-hand side, and
              // a hard 340 tipped two tiles per row into one.
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderRadius: 18, background: "rgba(0,0,0,0.48)", border: "1px solid rgba(255,255,255,0.10)", width: "48%" }}>
                {a.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.logoUrl} alt="" width={42} height={42} style={{ width: 42, height: 42, borderRadius: 10, objectFit: "cover" }} />
                ) : <div style={{ width: 42, height: 42, borderRadius: 10, display: "flex", background: alpha(t.accent, 0.2) }} />}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: pAccounts.f(22), fontWeight: 700 }}>{clamp(a.tag, 16)}</div>
                  <div style={{ fontSize: pAccounts.f(17), color: MUTED }}>{clamp(a.headline || a.game, 22)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </Frame>
  );
}

function GameStatsBody(d: GameStatsCard) {
  const t = d.theme;
  const [pId, pLive, pStats, pChamps, pMatches, pRank, pEmpty] =
    ["identity", "live", "stats", "champions", "matches", "rank", "empty"].map((k) => part(t, k));
  const champs = pChamps.hidden ? [] : (d.champions ?? []);
  const matches = pMatches.hidden ? [] : (d.matches ?? []);
  const hasRich = champs.length > 0 || matches.length > 0;
  // With champions and match history there's no room for six stat tiles, so the
  // stats compress into a single row and the game content gets the space.
  const statCount = hasRich ? 2 : 6;

  return (
    <Frame theme={t} corner={d.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={d.logoUrl} alt="" width={72} height={72} style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover" }} />
    ) : undefined}>
      {/* Identity first: the in-game name people searched for, and the human behind it. */}
      <Section p={pId} style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
        <Avatar url={d.gameAvatarUrl || d.avatarUrl} size={pId.f(78)} ring={t.accent} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: pId.f(42), fontWeight: 700, lineHeight: 1.05 }}>{clamp(d.tag, 20)}</div>
          <div style={{ fontSize: pId.f(21), color: MUTED }}>
            {clamp(`${d.game}${d.region ? ` · ${d.region}` : ""} · ${d.displayName}`, 48)}
          </div>
        </div>
      </Section>

      {d.live?.champion ? (
        <Section p={pLive} style={{ flexDirection: "row", marginTop: 14 }}>
          <Pill color="#34d399" bg="rgba(52,211,153,0.14)" size={pLive.f(21)}>
            <div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: "#34d399" }} />
            {pLive.say("IN GAME")}
            {` · ${clamp(d.live.champion, 18)}`}
          </Pill>
        </Section>
      ) : null}

      {d.stats.length === 0 && !hasRich ? (
        <Section p={pEmpty} style={{ marginTop: 40 }}>
          <div style={{ display: "flex", fontSize: pEmpty.f(24), color: MUTED, lineHeight: 1.3 }}>
            {pEmpty.say("Stats sync shortly after linking — check back in a few minutes.")}
          </div>
        </Section>
      ) : (
        <Section p={pStats} style={{ flexDirection: "row", flexWrap: "wrap", alignContent: "flex-start", gap: 12, marginTop: 20 }}>
          {d.stats.slice(0, statCount).map((s, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, width: "48%", padding: "12px 18px", borderRadius: 18, background: "rgba(0,0,0,0.48)", border: "1px solid rgba(255,255,255,0.10)" }}>
              <div style={{ fontSize: pStats.f(16), letterSpacing: 2, color: MUTED, fontWeight: 700 }}>{clamp(s.label.toUpperCase(), 20)}</div>
              <div style={{ fontSize: pStats.f(32), fontWeight: 700, color: t.accent2 }}>{clamp(s.value, 18)}</div>
            </div>
          ))}
        </Section>
      )}

      {champs.length ? (
        <Section p={pChamps} style={{ gap: 8, marginTop: 18 }}>
          <Head p={pChamps}>MOST PLAYED</Head>
          <div style={{ display: "flex", gap: 10 }}>
            {champs.slice(0, 5).map((c, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: pChamps.f(106) }}>
                {c.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.iconUrl} alt="" width={pChamps.f(58)} height={pChamps.f(58)}
                    style={{ width: pChamps.f(58), height: pChamps.f(58), borderRadius: pChamps.f(29), objectFit: "cover", border: `3px solid ${alpha(t.accent, 0.53)}` }} />
                ) : (
                  <div style={{ display: "flex", width: pChamps.f(58), height: pChamps.f(58), borderRadius: pChamps.f(29), background: alpha(t.accent, 0.2), border: `3px solid ${alpha(t.accent, 0.53)}` }} />
                )}
                <div style={{ fontSize: pChamps.f(16), fontWeight: 700 }}>{clamp(c.name, 11)}</div>
                {c.points ? <div style={{ fontSize: pChamps.f(14), color: MUTED }}>{`${Math.round(c.points / 1000)}k`}</div> : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {matches.length ? (
        <Section p={pMatches} style={{ gap: 8, marginTop: 16, flex: 1 }}>
          <Head p={pMatches}>RECENT MATCHES</Head>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {matches.slice(0, 4).map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 14px", borderRadius: 12, background: m.win ? "rgba(52,211,153,0.14)" : "rgba(239,68,68,0.12)", border: `1px solid ${m.win ? "rgba(52,211,153,0.35)" : "rgba(239,68,68,0.3)"}` }}>
                {m.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.iconUrl} alt="" width={30} height={30} style={{ width: 30, height: 30, borderRadius: 15, objectFit: "cover" }} />
                ) : null}
                <div style={{ fontSize: pMatches.f(18), fontWeight: 700, width: pMatches.f(56), color: m.win ? "#34d399" : "#f87171" }}>{m.win ? "WIN" : "LOSS"}</div>
                <div style={{ fontSize: pMatches.f(18), fontWeight: 700, flex: 1 }}>{clamp(m.champion, 14)}</div>
                <div style={{ fontSize: pMatches.f(18), color: INK }}>{m.kda}</div>
                <div style={{ fontSize: pMatches.f(15), color: MUTED, width: pMatches.f(92) }}>{clamp(m.queue ?? m.when ?? "", 12)}</div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {d.rank ? (
        <Section p={pRank} style={{ flexDirection: "row", marginTop: 12 }}>
          <Pill color={t.accent} bg="rgba(255,255,255,0.08)" size={pRank.f(20)}>
            {clamp(`#${d.rank.place} of ${nf(d.rank.total)} · ${d.rank.board}`, 42)}
          </Pill>
        </Section>
      ) : null}
    </Frame>
  );
}

function QuestBody(d: QuestCard) {
  const t = d.theme;
  const next = d.nextThreshold ?? 0;
  const pct = next > 0 ? (d.cp / next) * 100 : 100;
  return (
    <Frame theme={t} corner={d.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={d.logoUrl} alt="" width={78} height={78} style={{ width: 78, height: 78, objectFit: "contain" }} />
    ) : undefined}>
      <Title text={d.questName} sub={d.displayName ? `${d.displayName}${d.tagline ? ` · ${d.tagline}` : ""}` : d.tagline} accent={t.accent} accent2={t.accent2} theme={t} p={part(t, "title")} />
      {(() => {
        const p = part(t, "progress");
        return (
          <Section p={p} style={{ marginTop: 30 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
              <div style={{ fontSize: p.f(70), fontWeight: 700, color: t.accent2, lineHeight: 1 }}>{nf(d.cp)}</div>
              <div style={{ fontSize: p.f(25), color: MUTED, paddingBottom: 10 }}>
                {`${p.say("CP")}${next > 0 ? ` / ${nf(next)} → ${d.nextTier ?? ""}` : " · max tier"}`}
              </div>
            </div>
            <div style={{ display: "flex", marginTop: 18 }}><Bar pct={pct} accent={t.accent} accent2={t.accent2} h={18} /></div>
          </Section>
        );
      })()}
      {/* alignItems keeps the tier chips sized to their content instead of
          stretching to fill the remaining card height. */}
      {(() => {
        const p = part(t, "tiers");
        return (
          <Section p={p} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 32, flex: 1 }}>
            {d.tiers.slice(0, 5).map((tier, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: 1, padding: "16px 8px", borderRadius: 20, background: tier.earned ? alpha(t.accent, 0.12) : "rgba(0,0,0,0.42)", border: `1px solid ${tier.earned ? alpha(t.accent, 0.53) : "rgba(255,255,255,0.10)"}` }}>
                <div style={{ display: "flex", width: 20, height: 20, borderRadius: 10, background: tier.earned ? t.accent : "transparent", border: `3px solid ${tier.earned ? t.accent : "rgba(255,255,255,0.32)"}` }} />
                <div style={{ fontSize: p.f(19), fontWeight: 700, color: tier.earned ? t.accent : MUTED }}>{clamp(tier.name, 10)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: p.f(16), color: MUTED }}><CpCoin size={p.f(14)} />{nf(tier.threshold)}</div>
              </div>
            ))}
          </Section>
        );
      })()}
    </Frame>
  );
}

function CpSummaryBody(d: CpSummaryCard) {
  const t = d.theme;
  const p = part(t, "quests");
  return (
    <Frame theme={t} corner={<Pill color={t.accent2} bg="rgba(0,0,0,0.45)">LV {d.level}</Pill>}>
      <Title text={`${clamp(d.displayName, 16)}'s quests`} sub={`${nf(d.totalCp)} total Cluster Points`} accent={t.accent} accent2={t.accent2} theme={t} p={part(t, "title")} />
      <Section p={p} style={{ gap: 16, marginTop: 30, flex: 1 }}>
        {d.quests.slice(0, 4).map((q, i) => {
          const pct = q.target > 0 ? (q.cp / q.target) * 100 : 100;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontSize: p.f(24), fontWeight: 700, color: q.accent }}>{clamp(q.name, 20)}</div>
                <div style={{ fontSize: p.f(20), color: MUTED }}>{`${nf(q.cp)} / ${nf(q.target)} · ${clamp(q.tier, 12)}`}</div>
              </div>
              <Bar pct={pct} accent={q.accent} accent2={t.accent2} h={14} />
            </div>
          );
        })}
      </Section>
    </Frame>
  );
}

function LeaderboardBody(d: LeaderboardCard) {
  const t = d.theme;
  const [pRows, pEmpty] = ["rows", "empty"].map((k) => part(t, k));
  const medal = ["#fbbf24", "#cbd5e1", "#b45309"];
  return (
    <Frame theme={t} corner={d.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={d.logoUrl} alt="" width={72} height={72} style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover" }} />
    ) : undefined}>
      <Title text={clamp(d.title, 26) ?? d.title} sub={clamp(d.subtitle, 42)} accent={t.accent} accent2={t.accent2} theme={t} p={part(t, "title")} />
      {d.rows.length === 0 ? (
        <Section p={pEmpty} style={{ marginTop: 40 }}>
          <div style={{ display: "flex", fontSize: pEmpty.f(24), color: MUTED, lineHeight: 1.3 }}>
            {pEmpty.say("No one has posted a score yet — link an account and you top this board.")}
          </div>
        </Section>
      ) : (
      <Section p={pRows} style={{ gap: 8, marginTop: 22, flex: 1 }}>
        {d.rows.slice(0, 8).map((r) => (
          <div key={r.rank} style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 16px", borderRadius: 14, background: r.you ? alpha(t.accent, 0.15) : "rgba(0,0,0,0.42)", border: `1px solid ${r.you ? alpha(t.accent, 0.53) : "rgba(255,255,255,0.08)"}` }}>
            <div style={{ fontSize: pRows.f(24), fontWeight: 700, width: pRows.f(46), color: medal[r.rank - 1] ?? MUTED }}>{`#${r.rank}`}</div>
            {r.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.avatarUrl} alt="" width={34} height={34} style={{ width: 34, height: 34, borderRadius: 17, objectFit: "cover" }} />
            ) : null}
            <div style={{ fontSize: pRows.f(24), fontWeight: 700, flex: 1 }}>{`${clamp(r.name, 20)}${r.you ? " · you" : ""}`}</div>
            <div style={{ fontSize: pRows.f(24), fontWeight: 700, color: t.accent2 }}>{clamp(r.value, 12)}</div>
          </div>
        ))}
      </Section>
      )}
    </Frame>
  );
}

function ChallengeBody(d: ChallengeCard) {
  const t = d.theme;
  const [pStatus, pMeta, pTime, pStand, pTro, pEmpty, pRules] =
    ["status", "meta", "timeline", "standings", "trophies", "empty", "rules"].map((k) => part(t, k));
  const ends = new Date(d.endsAt);
  const days = Math.max(0, Math.ceil((ends.getTime() - Date.now()) / 86400000));
  const trophies = pTro.hidden ? [] : d.trophies.slice(0, 3);
  return (
    <Frame theme={t} corner={(
      // Trophies live top-RIGHT, in a ROW under the game logo.
      //
      // They used to stack vertically, which was fine when the logo sat at
      // 104px in the far corner — with the mark at 250 a three-high stack ran
      // straight into it. A row is the same three prizes in a third of the
      // height, and the prize is the reason to enter, so it cannot be the thing
      // that gets covered.
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
        {d.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.logoUrl} alt="" width={58} height={58} style={{ width: 58, height: 58, borderRadius: 14, objectFit: "cover" }} />
        ) : null}
        {trophies.length ? (
          // A PODIUM, not a row.
          //
          // The prize pool is what a challenge is FOR, and three equal tiles in
          // rank order read as a list of files rather than as first, second and
          // third. Silver on the left, gold raised in the middle, bronze on the
          // right, on plinths of decreasing height — the shape everyone already
          // knows, so the hierarchy is legible before a single word is read.
          (() => {
            const byPlace = (n: number) => trophies.find((x) => x.place === n);
            const order = [byPlace(2), byPlace(1), byPlace(3)].filter(Boolean) as typeof trophies;
            const PLINTH: Record<number, number> = { 1: 34, 2: 22, 3: 14 };
            const COLOUR: Record<number, string> = { 1: "#fbbf24", 2: "#cbd5e1", 3: "#b45309" };
            const total = trophies.reduce((sum, x) => sum + (x.value || 0), 0);
            return (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                {total > 0 ? (
                  <div style={{ display: "flex", fontSize: pTro.f(17), fontWeight: 800, color: "#fbbf24", letterSpacing: 0.4 }}>
                    {`$${nf(total)} PRIZE POOL`}
                  </div>
                ) : null}
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
                  {order.map((tr, i) => {
                    const c = COLOUR[tr.place] ?? MUTED;
                    const lift = pTro.f(PLINTH[tr.place] ?? 14);
                    return (
                      <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: pTro.f(tr.place === 1 ? 96 : 82) }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={tr.imageUrl} alt="" width={pTro.f(tr.place === 1 ? 76 : 60)} height={pTro.f(tr.place === 1 ? 76 : 60)}
                          style={{ width: pTro.f(tr.place === 1 ? 76 : 60), height: pTro.f(tr.place === 1 ? 76 : 60), objectFit: "contain" }} />
                        <div style={{ display: "flex", fontSize: pTro.f(15), fontWeight: 800, color: c }}>
                          {tr.value > 0 ? `$${nf(tr.value)}` : `${tr.place}`}
                        </div>
                        {/* The plinth. Explicit height per place — Satori has no
                            flex-grow tricks to lean on here, and the difference
                            in height IS the ranking. */}
                        <div style={{
                          display: "flex", alignItems: "flex-start", justifyContent: "center",
                          width: "100%", height: lift, borderRadius: 6,
                          background: alpha(c, 0.22), border: `1px solid ${alpha(c, 0.5)}`,
                          fontSize: pTro.f(14), fontWeight: 800, color: c, paddingTop: 2,
                        }}>
                          {tr.place === 1 ? "1st" : tr.place === 2 ? "2nd" : "3rd"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()
        ) : null}
      </div>
    )}>
      <Section p={pStatus} style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Pill color="#34d399" bg="rgba(52,211,153,0.14)" size={pStatus.f(20)}>
          <div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: "#34d399" }} />
          {pStatus.say("LIVE")}
        </Pill>
        {d.isPrivate ? (
          <Pill color="#fbbf24" bg="rgba(251,191,36,0.14)" size={pStatus.f(20)}>
            <div style={{ display: "flex", width: 12, height: 12, borderRadius: 3, background: "#fbbf24" }} />
            {clamp(d.serverName ? `${d.serverName.toUpperCase()} · KEY TO JOIN` : "KEY TO JOIN", 26)}
          </Pill>
        ) : null}
        <Pill size={pStatus.f(20)}>{clamp(d.game, 18)}</Pill>
      </Section>
      {/* 42, and clamped to fit one line of it. This is the densest card on the
          platform — pills, title, meta, timeline and four standings rows in
          529px — and a title that wraps costs a standings row. */}
      <div style={{ display: "flex", marginTop: 14 }}>
        <Title text={clamp(d.title, 28) ?? ""} sub={clamp(d.description, 68)} size={42} accent={t.accent} accent2={t.accent2} theme={t} p={part(t, "title")} />
      </div>
      <Section p={pMeta} style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
        <Pill color="#fbbf24" bg="rgba(251,191,36,0.12)" size={pMeta.f(20)}>{d.ended ? "FINISHED" : `${days}d left`}</Pill>
        <Pill size={pMeta.f(20)}>{`${nf(d.participants)} joined`}</Pill>
        {d.prize ? <Pill color={t.accent2} bg="rgba(255,255,255,0.08)" size={pMeta.f(20)}>{clamp(d.prize, 20)}</Pill> : null}
      </Section>

      {/* Who can enter, when the answer isn't "anyone".
          A gamer deciding whether to tap Join needs to know in advance that the
          answer will be no — finding out after joining is how a competition
          feels rigged. Nothing is drawn for an open challenge: most are open,
          and a pill saying "anyone" on every card is a pill nobody reads. */}
      {(d.entryRules ?? []).length > 0 && !pRules.hidden ? (
        <Section p={pRules} style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
          {(d.entryRules ?? []).slice(0, 2).map((line, i) => (
            <Pill key={i} color="#a78bfa" bg="rgba(167,139,250,0.14)" size={pRules.f(19)}>
              {clamp(line, 34)}
            </Pill>
          ))}
        </Section>
      ) : null}

      {/* Timeline: the whole window, not just "5d left". People want to know if
          they're early enough to still matter. */}
      {d.startsAt ? (
        <Section p={pTime} style={{ gap: 5, marginTop: 16 }}>
          <Bar pct={windowPct(d.startsAt, d.endsAt)} accent={t.accent} accent2={t.accent2} h={10} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: pTime.f(16), color: MUTED }}>
            <div style={{ display: "flex" }}>{dayLabel(d.startsAt)}</div>
            <div style={{ display: "flex" }}>{dayLabel(d.endsAt)}</div>
          </div>
        </Section>
      ) : null}

      {/* overflow:hidden, not because anything should overflow — because when
          something does, Yoga's answer is to COMPRESS the children, and a
          compressed heading renders on top of the first row instead of above
          it. Clipping the fourth row is a card that reads; overlapping text is
          a card that looks broken. */}
      <Section p={pStand} style={{ gap: 6, marginTop: 14, flex: 1, overflow: "hidden" }}>
        <Head p={pStand}>{d.ended ? "FINAL STANDINGS" : "STANDINGS"}</Head>
        {(d.standings ?? []).length === 0 ? (
          <div style={{ display: "flex", fontSize: pEmpty.f(20), color: MUTED }}>
            {pEmpty.say("No one has scored yet — first mover takes the lead.")}
          </div>
        ) : (
          (d.standings ?? []).slice(0, 4).map((s) => (
            <div key={s.place} style={{ display: "flex", alignItems: "center", flexShrink: 0, gap: 12, padding: "6px 14px", borderRadius: 12, background: "rgba(0,0,0,0.42)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize: pStand.f(19), fontWeight: 700, width: pStand.f(38), color: ["#fbbf24", "#cbd5e1", "#b45309"][s.place - 1] ?? MUTED }}>{`#${s.place}`}</div>
              {/* The in-game name leads; the Cluster name is the quiet second
                  line, and only when the two differ (B54/B52). No fixed height
                  on either — a box sized to hold one line is what cut the
                  descenders off every name with a p or a y in it. */}
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", fontSize: pStand.f(20), fontWeight: 700, lineHeight: 1.35 }}>
                  {clamp(s.name, 18)}
                </div>
                {s.alt ? (
                  <div style={{ display: "flex", fontSize: pStand.f(13), color: MUTED, lineHeight: 1.35 }}>
                    {clamp(s.alt, 22)}
                  </div>
                ) : null}
              </div>
              <div style={{ fontSize: pStand.f(20), fontWeight: 700, color: t.accent2 }}>{`${nf(s.points)} pts`}</div>
            </div>
          ))
        )}
      </Section>
    </Frame>
  );
}

// How far through its window a challenge is.
function windowPct(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 100;
  return Math.max(0, Math.min(100, ((Date.now() - start) / (end - start)) * 100));
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// A game's hub: what you can enter, and where you'd stand.
//
// Two columns, because those are the two questions somebody opening a planet
// actually has. Counters answered neither — "3 challenges" doesn't tell you
// whether one ends tonight, and the old "gamers ranked" wasn't even a count of
// gamers.
function PlanetBody(d: PlanetCard) {
  const t = d.theme;
  const [pCh, pBo] = ["challenges", "boards"].map((k) => part(t, k));
  const challenges = d.challenges ?? [];
  const boards = d.boards ?? [];
  return (
    <Frame theme={t} corner={d.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={d.logoUrl} alt="" width={80} height={80} style={{ width: 80, height: 80, borderRadius: 20, objectFit: "cover" }} />
    ) : undefined}>
      <Title
        text={`${clamp(d.game, 18)} Planet`}
        sub={`${nf(d.gamers)} gamer${d.gamers === 1 ? "" : "s"} here${d.serverGamers != null ? ` · ${nf(d.serverGamers)} from this server` : ""}`}
        accent={t.accent} accent2={t.accent2} theme={t} p={part(t, "title")}
      />

      <div style={{ display: "flex", gap: 14, marginTop: 22, flex: 1 }}>
        <Column p={pCh} label={`${pCh.say("LIVE CHALLENGES")} · ${challenges.length}`} accent={t.accent}>
          {challenges.length === 0 ? (
            <Empty p={pCh}>Nothing running right now. The next one lands here first.</Empty>
          ) : challenges.slice(0, 3).map((c, i) => {
            const days = Math.max(0, Math.ceil((new Date(c.endsAt).getTime() - Date.now()) / 86400000));
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3, padding: "10px 14px", borderRadius: 14, background: "rgba(0,0,0,0.46)", border: "1px solid rgba(255,255,255,0.09)" }}>
                <div style={{ fontSize: pCh.f(22), fontWeight: 700 }}>{clamp(c.title, 22)}</div>
                {/* One text node with its own separators rather than three flex
                    children: Satori does not put the `gap` between adjacent
                    inline-ish divs here, so they render welded together
                    ("5d left2 in"). Explicit margins on the one coloured part. */}
                <div style={{ display: "flex", fontSize: pCh.f(17), color: MUTED }}>
                  <div style={{ display: "flex", color: days <= 1 ? "#fda4af" : MUTED }}>
                    {`${days === 0 ? "ends today" : `${days}d left`} · ${nf(c.participants)} in`}
                  </div>
                  {/* Clamped hard: `prizeDescription` is a free-text admin field
                      and a sentence in it wraps the row onto three lines. */}
                  {c.prize ? <div style={{ display: "flex", marginLeft: 8, color: "#fbbf24" }}>{clamp(c.prize, 12)}</div> : null}
                </div>
              </div>
            );
          })}
        </Column>

        <Column p={pBo} label={`${pBo.say("LEADERBOARDS")} · ${boards.length}`} accent={t.accent2}>
          {boards.length === 0 ? (
            <Empty p={pBo}>No boards on this game yet.</Empty>
          ) : boards.slice(0, 3).map((b, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3, padding: "10px 14px", borderRadius: 14, background: "rgba(0,0,0,0.46)", border: "1px solid rgba(255,255,255,0.09)" }}>
              <div style={{ fontSize: pBo.f(22), fontWeight: 700 }}>{clamp(b.title, 22)}</div>
              <div style={{ display: "flex", gap: 10, fontSize: pBo.f(17), color: MUTED }}>
                {b.leader ? (
                  <>
                    <div style={{ display: "flex", color: "#fbbf24" }}>{`#1 ${clamp(b.leader, 13)}`}</div>
                    {b.value ? <div style={{ display: "flex", color: t.accent2 }}>{clamp(b.value, 10)}</div> : null}
                  </>
                ) : (
                  <div style={{ display: "flex" }}>unclaimed — take it</div>
                )}
              </div>
            </div>
          ))}
        </Column>
      </div>
    </Frame>
  );
}

// One labelled column of rows. Both halves of the planet card are this shape,
// so they line up whatever each side happens to contain.
function Column({ label, accent, children, p }: {
  label: string; accent: string; children: React.ReactNode; p: PartDraw;
}) {
  if (p.hidden) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, ...styleOf({ opacity: p.opacity }) }}>
      <div style={{ fontSize: p.f(16), letterSpacing: 2.5, fontWeight: 700, color: safeColor(accent, MUTED) }}>{label}</div>
      {children}
    </div>
  );
}

function Empty({ children, p }: { children: React.ReactNode; p?: PartDraw }) {
  return <div style={{ display: "flex", fontSize: p?.f(19) ?? 19, color: MUTED, lineHeight: 1.3 }}>{children}</div>;
}

// Profile of the Week.
//
// `race` is the daily post and `result` is Sunday's. They deliberately share a
// frame: a server that has watched the standings move all week should recognise
// the card that ends it, with the podium in the same place the leaders were.
/**
 * The marketplace shelf: two rows of three, both numbers on every tile.
 *
 * The dollar value is the point. A CP price alone reads as a game currency;
 * "12,000 CP · $8" is a gamer's free points quoted in money, which is the whole
 * reason to keep playing a week you already lost.
 */
function MarketBody(d: MarketCard) {
  const t = d.theme;
  const [pBal, pTiles, pPills, pEmpty] = ["balance", "tiles", "pills", "empty"].map((k) => part(t, k));
  // Six, in two rows of three. The tile is sized to the CONTENT column, not to
  // the canvas: the ad slot owns the top-right, so a tile wide enough to look
  // right against 1200px wraps to two-per-row and pushes the second row off the
  // bottom — which is exactly what the first draft did.
  const shown = (d.trophies ?? []).slice(0, 6);
  const TILE_W = 218;
  const TILE_H = 138;

  return (
    <Frame theme={t}>
      <Title text={d.title} sub={clamp(d.subtitle, 64)} accent={t.accent} accent2={t.accent2} theme={t} p={part(t, "title")} />

      {/* The balance, in its own region — a shelf you can't price yourself
          against is a catalogue. Positioned rather than in flow, because every
          other block on this card is absolutely placed by the layout editor and
          a single in-flow element lands underneath them. */}
      <Section p={pBal} style={{ marginTop: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8, fontSize: pBal.f(40), fontWeight: 900, color: t.accent2 }}>
            <CpCoin size={pBal.f(24)} />{d.balance.toLocaleString()}
          </span>
          <span style={{ display: "flex", fontSize: pBal.f(19), fontWeight: 700, color: MUTED }}>
            {pBal.say(`to spend · ${d.earned.toLocaleString()} earned all-time`)}
          </span>
        </div>
      </Section>

      {shown.length === 0 ? (
        <Section p={pEmpty} style={{ marginTop: 40 }}>
          <div style={{ display: "flex", fontSize: pEmpty.f(25), color: MUTED, lineHeight: 1.3 }}>
            {pEmpty.say("The shelf is empty right now — check back once staff put trophies up.")}
          </div>
        </Section>
      ) : (
        <Section p={pTiles}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, width: TILE_W * 3 + 24 }}>
            {shown.map((x, i) => (
              <div key={x.id} style={{
                display: "flex", flexDirection: "column", width: TILE_W, height: TILE_H,
                borderRadius: 16, padding: 11, gap: 4,
                background: "rgba(0,0,0,0.38)",
                border: `2px solid ${x.affordable ? `${t.accent}66` : "rgba(255,255,255,0.10)"}`,
                // Out of reach reads dimmer rather than absent: it is the thing
                // worth playing for, so it has to stay on the shelf.
                opacity: x.affordable ? 1 : 0.6,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  {x.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={x.imageUrl} alt="" width={44} height={44}
                      style={{ width: 44, height: 44, objectFit: "contain" }} />
                  ) : (
                    <div style={{ display: "flex", width: 44, height: 44, borderRadius: 11, background: "rgba(255,255,255,0.07)" }} />
                  )}
                  <div style={{
                    display: "flex", width: 26, height: 26, borderRadius: 999,
                    alignItems: "center", justifyContent: "center", marginLeft: "auto",
                    fontSize: 16, fontWeight: 900, color: "#0b1020", background: t.accent2,
                  }}>
                    {i + 1}
                  </div>
                </div>
                {/* Fixed height and a hard clamp: "Champion's Nebula Cup"
                    wrapped to two lines and landed on top of the tier, which is
                    the one failure mode a fixed-size tile has. */}
                {/* No fixed height: clipping a box to hold one line cut the
                    descenders off every name with a p or a y in it. The clamp
                    keeps it to one line instead, which is the actual goal. */}
                <div style={{ display: "flex", fontSize: 17, fontWeight: 800, color: "#fff", lineHeight: 1.4 }}>
                  {clamp(x.name, 17)}
                </div>
                {/* No fixed height here either. It held today because the tier
                    words are uppercase and have no descenders — which is a
                    property of the copy, not of the layout, and the first
                    lower-case tier somebody adds would have clipped. */}
                <div style={{ display: "flex", fontSize: 12, lineHeight: 1.35, color: MUTED, textTransform: "uppercase", letterSpacing: 1 }}>
                  {x.tier}
                </div>
                {/* BOTH numbers. The CP price alone reads as a game currency;
                    the dollar beside it is what says the free points are money. */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: "auto" }}>
                  <span style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 5, fontSize: 23, fontWeight: 900, color: x.affordable ? t.accent2 : MUTED }}>
                    <CpCoin size={17} />{x.cpPrice.toLocaleString()}
                  </span>
                  <span style={{ display: "flex", fontSize: 18, fontWeight: 800, color: "#34d399" }}>
                    = ${x.value.toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section p={pPills} style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Pill color={t.accent2} bg={alpha(t.accent2, 0.13)} size={pPills.f(19)}>
          {`${d.cpPerDollar.toLocaleString()} CP = $1`}
        </Pill>
        <Pill color="#34d399" bg="rgba(52,211,153,0.13)" size={pPills.f(19)}>
          Spending never lowers your level
        </Pill>
      </Section>
    </Frame>
  );
}

function WeekBody(d: WeekCard) {
  const t = d.theme;
  const [pRows, pPills, pEmpty] = ["rows", "pills", "empty"].map((k) => part(t, k));
  const medal = ["#fbbf24", "#cbd5e1", "#d08a4a"];
  const result = d.mode === "result";
  const entries = d.entries ?? [];

  return (
    <Frame theme={t} corner={result && d.trophy?.imageUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={d.trophy.imageUrl} alt="" width={96} height={96} style={{ width: 96, height: 96, objectFit: "contain" }} />
    ) : undefined}>
      <Title text={d.title} sub={clamp(d.subtitle, 64)} accent={t.accent} accent2={t.accent2} theme={t} p={part(t, "title")} />

      {entries.length === 0 ? (
        <Section p={pEmpty} style={{ marginTop: 40 }}>
          <div style={{ display: "flex", fontSize: pEmpty.f(25), color: MUTED, lineHeight: 1.3 }}>
            {pEmpty.say("Nobody has a vote yet this week. Customize your profile and you are one vote from the top.")}
          </div>
        </Section>
      ) : (
        // Four rows in the race, three on the podium — that is what actually
        // fits above the pills at this canvas size. Five overlapped them, and
        // `overflow: hidden` means a future edit clips rather than collides.
        <Section p={pRows} style={{ gap: result ? 12 : 9, marginTop: 20, flex: 1, overflow: "hidden" }}>
          {entries.slice(0, result ? 3 : 4).map((e) => (
            <div
              key={e.rank}
              style={{
                display: "flex", alignItems: "center", gap: 16,
                padding: result ? "14px 22px" : "9px 20px", borderRadius: 16,
                background: e.rank === 1 ? alpha(medal[0], 0.14) : "rgba(0,0,0,0.44)",
                border: `1px solid ${e.rank <= 3 ? alpha(medal[e.rank - 1] ?? MUTED, 0.5) : "rgba(255,255,255,0.08)"}`,
              }}
            >
              <div style={{ fontSize: pRows.f(result ? 32 : 25), fontWeight: 700, width: pRows.f(48), color: medal[e.rank - 1] ?? MUTED }}>{`#${e.rank}`}</div>
              {e.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.avatarUrl} alt="" width={result ? 50 : 38} height={result ? 50 : 38}
                  style={{ width: result ? 50 : 38, height: result ? 50 : 38, borderRadius: 25, objectFit: "cover", border: `3px solid ${medal[e.rank - 1] ?? "rgba(255,255,255,0.2)"}` }} />
              ) : null}
              {/* Two lines only on the podium. In the race a second line per row
                  makes four rows taller than the canvas has room for, and the
                  lifetime total reads perfectly well beside the week's. */}
              {result ? (
                <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ fontSize: pRows.f(28), fontWeight: 700 }}>{clamp(e.name, 18)}</div>
                  <div style={{ fontSize: pRows.f(17), color: MUTED }}>{`${nf(e.lifetimeVotes)} lifetime votes`}</div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "baseline", flex: 1 }}>
                  <div style={{ display: "flex", fontSize: pRows.f(24), fontWeight: 700 }}>{clamp(e.name, 16)}</div>
                  <div style={{ display: "flex", marginLeft: 10, fontSize: pRows.f(16), color: MUTED }}>{`${nf(e.lifetimeVotes)} lifetime`}</div>
                </div>
              )}
              {/* The trophy each placement was handed, on the card that hands
                  it to them. */}
              {result && e.trophyUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.trophyUrl} alt="" width={46} height={46} style={{ width: 46, height: 46, objectFit: "contain" }} />
              ) : null}
              {/* Stacked on the podium, inline in the race. Stacking is what
                  made a race row 88px tall, and four of those don't fit above
                  the pills — the label costs a whole row's worth of height. */}
              {result ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <div style={{ fontSize: pRows.f(34), fontWeight: 700, color: medal[e.rank - 1] ?? t.accent2 }}>{nf(e.weekVotes)}</div>
                  <div style={{ fontSize: pRows.f(14), letterSpacing: 1.5, color: MUTED }}>VOTES</div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "baseline" }}>
                  <div style={{ display: "flex", fontSize: pRows.f(27), fontWeight: 700, color: medal[e.rank - 1] ?? t.accent2 }}>{nf(e.weekVotes)}</div>
                  <div style={{ display: "flex", marginLeft: 8, fontSize: pRows.f(14), letterSpacing: 1.5, color: MUTED }}>VOTES</div>
                </div>
              )}
            </div>
          ))}
        </Section>
      )}

      <Section p={pPills} style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
        {result && d.trophy ? (
          <Pill color="#fbbf24" bg="rgba(251,191,36,0.13)" size={pPills.f(20)}>
            {`${clamp(d.trophy.name, 20)}${d.trophy.value > 0 ? ` · $${nf(d.trophy.value)}` : ""} to all three`}
          </Pill>
        ) : (
          <>
            <Pill color={t.accent} bg={alpha(t.accent, 0.13)} size={pPills.f(20)}>
              {d.daysLeft > 0 ? `${d.daysLeft} DAY${d.daysLeft === 1 ? "" : "S"} LEFT` : "VOTING CLOSED"}
            </Pill>
            <Pill size={pPills.f(20)}>{`${nf(d.totalVotes)} votes · ${nf(d.contenders)} in the running`}</Pill>
          </>
        )}
      </Section>
    </Frame>
  );
}

function PlanetsBody(d: PlanetsCard) {
  const t = d.theme;
  const p = part(t, "tiles");
  return (
    <Frame theme={t}>
      <Title text={d.title} sub={d.subtitle} accent={t.accent} accent2={t.accent2} theme={t} p={part(t, "title")} />
      <Section p={p} style={{ flexDirection: "row", flexWrap: "wrap", alignContent: "flex-start", gap: 12, marginTop: 24, flex: 1 }}>
        {d.games.slice(0, 12).map((g, i) => (
          // 4 tiles per row of the narrower text column: 4×158 + 3×12 = 668.
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, width: p.f(158), height: p.f(122), borderRadius: 20, background: "rgba(0,0,0,0.45)", border: `1px solid ${g.accent ? alpha(g.accent, 0.4) : "rgba(255,255,255,0.10)"}` }}>
            {g.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={g.logoUrl} alt="" width={p.f(52)} height={p.f(52)} style={{ width: p.f(52), height: p.f(52), borderRadius: 14, objectFit: "cover" }} />
            ) : (
              <div style={{ display: "flex", width: p.f(52), height: p.f(52), borderRadius: 14, background: alpha(g.accent ?? t.accent, 0.27) }} />
            )}
            <div style={{ fontSize: p.f(18), fontWeight: 700, color: g.accent ?? INK }}>{clamp(g.name, 14)}</div>
          </div>
        ))}
      </Section>
    </Frame>
  );
}

// How big a guide's steps are drawn, by how many there are. Measured against
// the 1200x630 canvas: `room` is the body character budget that fits the space
// each layout leaves, and the two-column rows (5+) get shorter bodies because
// they are half the width.
const MAX_GUIDE_STEPS = 8;
const GUIDE_SCALE: Record<number, { num: number; title: number; body: number; room: number; gap: number }> = {
  1: { num: 42, title: 30, body: 22, room: 300, gap: 16 },
  2: { num: 42, title: 28, body: 21, room: 260, gap: 16 },
  3: { num: 42, title: 26, body: 19, room: 210, gap: 14 },
  4: { num: 42, title: 26, body: 20, room: 116, gap: 13 },
  5: { num: 34, title: 21, body: 16, room: 96, gap: 14 },
  6: { num: 34, title: 21, body: 16, room: 96, gap: 14 },
  7: { num: 28, title: 19, body: 15, room: 58, gap: 9 },
  8: { num: 28, title: 19, body: 15, room: 58, gap: 9 },
};

function GuideBody(d: GuideCard) {
  const t = d.theme;
  return (
    <Frame theme={t} corner={d.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={d.logoUrl} alt="" width={76} height={76} style={{ width: 76, height: 76, objectFit: "contain" }} />
    ) : undefined}>
      {d.badge ? (
        <Section p={part(t, "status")} style={{ flexDirection: "row", marginBottom: 14 }}>
          <Pill color={t.accent} bg={alpha(t.accent, 0.12)}>{part(t, "status").say(d.badge)}</Pill>
        </Section>
      ) : null}
      <Title text={d.title} sub={d.subtitle} accent={t.accent} accent2={t.accent2} theme={t} p={part(t, "title")} />
      {/* The steps FIT the card instead of being cut off at four.
          `steps.slice(0, 4)` silently threw away everything past the fourth,
          which is why the card called "Everything Cluster does" listed four of
          the things Cluster does. Up to four run down one column; five to eight
          run in two, with the type and the body budget scaled to match.
          overflow:hidden stays as the backstop so a pathological guide clips
          rather than pushing the footer off the canvas. */}
      {(() => {
        const p = part(t, "steps");
        const steps = d.steps.slice(0, MAX_GUIDE_STEPS);
        const two = steps.length > 4;
        const g = GUIDE_SCALE[Math.min(steps.length, MAX_GUIDE_STEPS)] ?? GUIDE_SCALE[8];
        return (
          <Section p={p} style={{
            flexWrap: two ? "wrap" : "nowrap", flexDirection: two ? "row" : "column",
            gap: g.gap, marginTop: two ? 18 : 24, flex: 1, overflow: "hidden", alignContent: "flex-start",
          }}>
            {steps.map((step, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                // A plain percentage, NOT calc(): Satori rejects calc() outright
                // ("Invalid value calc(50% - 10px) for setWidth") and 500s the
                // whole card. 47% leaves room for the gap between columns.
                width: two ? "47%" : "100%",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: p.f(g.num), height: p.f(g.num), borderRadius: p.f(g.num) / 2, background: alpha(t.accent, 0.17), color: t.accent, fontSize: Math.round(p.f(g.num) * 0.55), fontWeight: 700 }}>{i + 1}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                  <div style={{ fontSize: p.f(g.title), fontWeight: 700 }}>{clamp(step.title, two ? 22 : 38)}</div>
                  <div style={{ fontSize: p.f(g.body), color: MUTED, lineHeight: 1.3 }}>{clamp(step.body, Math.round(g.room * 0.82))}</div>
                </div>
              </div>
            ))}
          </Section>
        );
      })()}
      {d.footer ? (
        <Section p={part(t, "footer")} style={{ marginTop: 14 }}>
          <div style={{ display: "flex", fontSize: part(t, "footer").f(20), color: t.accent2, fontWeight: 700 }}>
            {part(t, "footer").say(d.footer)}
          </div>
        </Section>
      ) : null}
    </Frame>
  );
}

// A game-world entity. The splash is the card AND a picture on the card.
//
// Text-over-art is the entire reason this is a PNG: Discord embeds cannot put
// a word on an image. But a splash used only as a darkened backdrop is a splash
// nobody actually sees — it is 62% veiled, scrimmed twice, and covered in copy.
// So the same art is drawn a second time, undimmed, in a framed panel down the
// right: the atmosphere behind the words, and the character in front of them.
//
// The abilities show their icons. The icons were already fetched and hosted by
// the world cache and then thrown away by the data loader, which meant the one
// thing a player recognises at a glance — the Q/W/E/R squares they have looked
// at ten thousand times — was rendered as a line of text.
function WorldBody(d: WorldCard) {
  const t = d.theme;
  const [pStatus, pLore, pAb, pArt, pMeta] =
    ["status", "lore", "abilities", "art", "meta"].map((k) => part(t, k));
  // Four abilities, not three: every one of these games ships a passive and
  // three actives, and cutting the last one off cut the ultimate.
  const abilities = pAb.hidden ? [] : d.abilities.slice(0, 4);
  const art = pArt.hidden ? null : d.artUrl;
  return (
    <Frame
      theme={t}
      // No corner badge on this card: the game logo belongs on the splash panel,
      // where it reads as a caption rather than as a third thing competing for
      // the same corner as the sponsor.
      side={art ? (box) => <SplashPanel url={art} logoUrl={d.logoUrl} caption={d.skinName ?? d.name} box={box} accent={t.accent} p={pArt} /> : undefined}
      corner={!art && d.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.logoUrl} alt="" width={72} height={72} style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover" }} />
      ) : undefined}
    >
      <Section p={pStatus} style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <Pill color={t.accent} bg={alpha(t.accent, 0.14)} size={pStatus.f(19)}>{pStatus.say(d.entityKind.toUpperCase())}</Pill>
        {d.role ? <Pill size={pStatus.f(19)}>{clamp(d.role, 22)}</Pill> : null}
      </Section>

      <Title
        text={clamp(d.name, 22) ?? d.name}
        sub={d.skinName ? `${clamp(d.skinName, 24)} · ${d.game}` : d.game}
        accent={t.accent} accent2={t.accent2} theme={t} p={part(t, "title")}
      />

      {d.lore ? (
        <Section p={pLore} style={{ marginTop: 16 }}>
          <Plate theme={t}>
            <div style={{ display: "flex", fontSize: pLore.f(19), color: INK, lineHeight: 1.34 }}>{clamp(d.lore, abilities.length ? 190 : 380)}</div>
          </Plate>
        </Section>
      ) : null}

      {abilities.length ? (
        <Section p={pAb} style={{ gap: 6, marginTop: 14 }}>
          {abilities.map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px", borderRadius: 12, background: "rgba(0,0,0,0.52)", border: "1px solid rgba(255,255,255,0.08)" }}>
              {a.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.iconUrl} alt="" width={pAb.f(38)} height={pAb.f(38)}
                  style={{ width: pAb.f(38), height: pAb.f(38), borderRadius: 9, objectFit: "cover", border: `2px solid ${alpha(t.accent2, 0.55, FALLBACK_ACCENT2)}` }} />
              ) : (
                // A slot, not a gap. A row that loses its icon must not shunt
                // its text left while the rows above and below keep theirs.
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: pAb.f(38), height: pAb.f(38), borderRadius: 9, background: alpha(t.accent2, 0.18, FALLBACK_ACCENT2), border: `2px solid ${alpha(t.accent2, 0.4, FALLBACK_ACCENT2)}`, fontSize: pAb.f(17), fontWeight: 700, color: t.accent2 }}>
                  {["P", "Q", "E", "R"][i] ?? "•"}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                {/* 36, not 26: these games prefix the slot into the name
                    ("Ultimate · Dimensional Rift"), and a tight clamp ate the
                    half that says what the ability IS. */}
                <div style={{ display: "flex", fontSize: pAb.f(17), fontWeight: 700, color: t.accent2 }}>{clamp(a.name, 36)}</div>
                <div style={{ display: "flex", fontSize: pAb.f(15), color: MUTED }}>{clamp(a.desc, 56)}</div>
              </div>
            </div>
          ))}
        </Section>
      ) : null}

      <Section p={pMeta} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: "auto" }}>
        {d.meta.slice(0, 2).map((m, i) => (
          <Pill key={i} size={pMeta.f(18)}>{`${m.label}: ${clamp(m.value, 14)}`}</Pill>
        ))}
        {d.skinCount > 0 ? (
          <Pill color={t.accent} bg={alpha(t.accent, 0.13)} size={pMeta.f(18)}>
            {`${d.skinCount} skin${d.skinCount === 1 ? "" : "s"} below`}
          </Pill>
        ) : null}
      </Section>
    </Frame>
  );
}

/**
 * The splash, drawn again as a picture.
 *
 * Deliberately NOT dimmed: the whole point is that this is the one place on the
 * card where the artwork is at full strength. The gradient along the bottom is
 * there because the Cluster mark is drawn over this panel's bottom-right corner
 * — a 250px logo needs something behind it that isn't a champion's face.
 */
/**
 * The trophy shelf, in the card's right-hand column.
 *
 * Three pieces of art with their cash value under each, stacked down the free
 * rectangle the layout leaves beside the text. Three because that is what fits
 * legibly in a 1200x630 card, and "up to" three because a gamer holding one
 * should see one piece — not one and two empty frames.
 *
 * It lives here rather than inline in the text column because inline it fought
 * the arena and the linked accounts for the same vertical inches and pushed the
 * accounts off the bottom edge. The column beside the sponsor box is otherwise
 * empty on this card, and art stacked in it reads as a shelf.
 */

/**
 * The Cluster Points coin, for a rendered card.
 *
 * Drawn from divs rather than the inline SVG the web uses. Satori's SVG support
 * is limited enough that fighting it costs more than redrawing the mark, and an
 * external PNG is worse again — the card renderer would then depend on a CDN
 * fetch succeeding for a currency symbol, and a card that silently loses its
 * money mark when a CDN is slow is not a card anybody should ship.
 *
 * Two rings and a bolt, matching `cpCoin` in components/Icon.tsx closely enough
 * that the web and the cards read as the same currency.
 */
function CpCoin({ size = 20 }: { size?: number }) {
  const ring = Math.max(1, Math.round(size * 0.08));
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: size, height: size, borderRadius: size,
      border: `${ring}px solid #fbbf24`, background: "rgba(251,191,36,0.14)",
    }}>
      <div style={{
        display: "flex", width: Math.round(size * 0.16), height: Math.round(size * 0.46),
        background: "#fbbf24", transform: "skewX(-18deg)",
      }} />
    </div>
  );
}

function TrophyShelf({ trophies, total, box, p }: {
  trophies: { name: string; imageUrl: string; value?: number }[];
  total: number;
  box: { left: number; top: number; width: number; height: number };
  p: PartDraw;
}) {
  // The art is square and sized to the column, capped so a wide column does not
  // blow one trophy up to fill the card.
  const art = Math.max(44, Math.min(96, Math.round(box.width * 0.42)));
  return (
    <div style={{
      position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", gap: 6,
    }}>
      <div style={{ display: "flex", fontSize: 15, letterSpacing: 2, color: MUTED }}>
        {`TROPHIES${total > trophies.length ? ` · ${nf(total)}` : ""}`}
      </div>
      <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", justifyContent: "center", gap: 10 }}>
        {trophies.map((tr, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: art }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tr.imageUrl} alt="" width={art} height={art}
              style={{ width: art, height: art, objectFit: "contain" }} />
            {/* No fixed height — a fixed one clips descenders, which was a real
                bug on the market card. A valueless trophy prints nothing rather
                than "$0", which would read as a promise we did not make. */}
            {tr.value && tr.value > 0 ? (
              <div style={{ display: "flex", fontSize: 17, fontWeight: 700, color: "#34d399" }}>{`$${nf(tr.value)}`}</div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function SplashPanel({ url, logoUrl, caption, box, accent, p }: {
  url: string;
  logoUrl?: string | null;
  caption: string;
  box: { left: number; top: number; width: number; height: number };
  accent: string;
  p: PartDraw;
}) {
  return (
    <div style={{
      position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height,
      display: "flex", overflow: "hidden", borderRadius: 20,
      border: `1px solid ${alpha(accent, 0.4)}`, background: "rgba(4,5,26,0.7)",
      ...styleOf({ opacity: p.opacity }),
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" width={box.width} height={box.height}
        style={{ position: "absolute", left: 0, top: 0, width: box.width, height: box.height, objectFit: "cover" }} />
      {/* Starts at 45% and lands almost black: the Cluster mark is drawn over
          this panel's bottom-right corner, and a 250px logo on top of a
          champion's face is a smudge. This is what it lands on instead. */}
      <div style={{
        position: "absolute", left: 0, top: Math.round(box.height * 0.45), width: box.width, height: box.height - Math.round(box.height * 0.45),
        display: "flex", background: "linear-gradient(180deg, rgba(4,5,26,0) 0%, rgba(4,5,26,0.92) 100%)",
      }} />
      {/* The game's mark, bottom-LEFT of the panel — the Cluster logo owns the
          bottom-right of the card and the two must not stack. */}
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" width={40} height={40}
          style={{ position: "absolute", left: 14, top: box.height - 54, width: 40, height: 40, borderRadius: 10, objectFit: "cover" }} />
      ) : null}
      {/* Held to the LEFT 46% of the panel. The logo covers the right of it,
          and a caption that runs underneath a logo is a caption nobody reads. */}
      <div style={{
        position: "absolute", left: logoUrl ? 62 : 14, top: box.height - 42, width: Math.round(box.width * 0.46), height: 22,
        display: "flex", alignItems: "center", fontSize: p.f(15), fontWeight: 700, color: INK,
      }}>
        {clamp(p.say(caption), 14)}
      </div>
    </div>
  );
}

// "Did you mean…". Only drawn when a query genuinely matched more than one
// thing — one hit renders that hit, and none says so in words.
function SearchBody(d: SearchCard) {
  const t = d.theme;
  const p = part(t, "rows");
  return (
    <Frame theme={t}>
      <Title
        text={`"${clamp(d.query, 20) ?? d.query}"`}
        sub={`${d.results.length} matches — pick one below`}
        accent={t.accent} accent2={t.accent2} theme={t} p={part(t, "title")}
      />
      <Section p={p} style={{ gap: 8, marginTop: 20, flex: 1, overflow: "hidden" }}>
        {d.results.slice(0, 6).map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", borderRadius: 14, background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {r.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.imageUrl} alt="" width={34} height={34} style={{ width: 34, height: 34, borderRadius: 10, objectFit: "cover" }} />
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ fontSize: p.f(23), fontWeight: 700 }}>{clamp(r.label, 26)}</div>
              <div style={{ fontSize: p.f(16), color: MUTED }}>{clamp(r.sub, 40)}</div>
            </div>
            <Pill color={t.accent2} bg={alpha(t.accent2, 0.12, "#22d3ee")} size={p.f(18)}>{r.kind.toUpperCase()}</Pill>
          </div>
        ))}
      </Section>
    </Frame>
  );
}

function body(d: CardData) {
  switch (d.kind) {
    case "profile": return ProfileBody(d);
    case "game-stats": return GameStatsBody(d);
    case "quest": return QuestBody(d);
    case "cp-summary": return CpSummaryBody(d);
    case "leaderboard": return LeaderboardBody(d);
    case "challenge": return ChallengeBody(d);
    case "planet": return PlanetBody(d);
    case "planets": return PlanetsBody(d);
    case "guide": return GuideBody(d);
    case "week": return WeekBody(d);
    case "market": return MarketBody(d);
    case "world": return WorldBody(d);
    case "search": return SearchBody(d);
  }
}

// Resolve every image on a card to inline bytes before drawing.
//
// Satori fetches remote images itself, and one unreachable host — or one
// animated .gif avatar it can't decode — takes down the entire card. Doing it
// up front means a bad image degrades to its placeholder instead, and the
// render itself touches the network zero times.
// The mascot and the logo mark, as inline bytes. Resolved once per render and
// merged onto every card kind here rather than in each data loader, so a card
// kind added later can't forget them.
async function preparedBrand(): Promise<{ astronautUrl: string | null; markUrl: string | null }> {
  try {
    const b = await brandCardArt();
    const [astronautUrl, markUrl] = await Promise.all([
      toEmbeddable(b.astronautUrl, { maxWidth: 420 }),
      toEmbeddable(b.markUrl, { maxWidth: 128 }),
    ]);
    return { astronautUrl, markUrl };
  } catch { return { astronautUrl: null, markUrl: null }; }
}

// The sponsor creative, as inline bytes.
//
// A brand uploads whatever their agency gave them — WebP, an SVG, a 4MB PNG —
// and Satori decodes none of those. Resolved here like every other image, and
// an ad whose art won't load is DROPPED: an empty labelled box would tell a
// server there's an advertiser while showing them nothing.
async function preparedAd(ad: CardAdSlot | null | undefined): Promise<CardAdSlot | null> {
  if (!ad?.imageUrl) return null;
  const imageUrl = await toEmbeddable(ad.imageUrl, { maxWidth: 720 });
  return imageUrl ? { ...ad, imageUrl } : null;
}

async function prepareCard(d: CardData): Promise<CardData> {
  // The whole image step gets one deadline. Past it the card is drawn with
  // whatever resolved — a person who tapped a button gets a card, not a spinner
  // that eventually times out in Discord's proxy.
  const [body, brand, rawLayout, ad] = await Promise.all([
    withDeadline(prepareBody(d), d),
    withDeadline(preparedBrand(), { astronautUrl: null, markUrl: null }),
    withDeadline(layoutFor(d.kind), DEFAULT_LAYOUT),
    withDeadline(preparedAd(d.theme.ad), null),
  ]);
  // Admin-placed art goes through the same resolver as everything else: Satori
  // fetches remote images itself and one unreachable host takes down the whole
  // card, so an asset that won't load is DROPPED rather than drawn as a hole.
  const layout = await withDeadline(withAssets(rawLayout, d), { ...rawLayout, assets: [] });
  // What the badge COULD show on this card, gathered once. An admin can
  // override what the corner draws per card kind, and the override needs these
  // to hand — dug out of the union here rather than inside the renderer, so
  // "the game's logo" means the same thing on every kind that has one.
  const any = body as Record<string, unknown>;
  const firstTrophy = Array.isArray(any.trophies) && any.trophies.length
    ? (any.trophies[0] as { imageUrl?: string }).imageUrl ?? null
    : (any.trophy as { imageUrl?: string } | undefined)?.imageUrl ?? null;
  const badge = {
    gameLogoUrl: typeof any.logoUrl === "string" ? any.logoUrl : null,
    level: typeof any.level === "number" ? any.level : null,
    trophyUrl: firstTrophy,
  };
  // Colours are normalised here, once, on the way in — so every card body can
  // use `theme.accent` directly and no unparseable value ever reaches Satori.
  return { ...body, theme: safeTheme({ ...body.theme, ...brand, layout, ad, badge }) } as CardData;
}

// The background, with fallbacks. Tried in order and stops at the first that
// actually produces drawable bytes — a gamer's custom art failing to load is a
// reason to show the next-best image, not to show none.
async function resolveBackground(theme: CardTheme): Promise<string | null> {
  const seen = new Set<string>();
  for (const candidate of [theme.bgUrl, ...(theme.bgFallbacks ?? [])]) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    const out = await toEmbeddable(candidate);
    if (out) return out;
  }
  return null;
}

async function withAssets(
  l: typeof DEFAULT_LAYOUT,
  d: CardData,
): Promise<typeof DEFAULT_LAYOUT> {
  const list = l.assets ?? [];
  if (!list.length) return l;
  // Resolve each slot's picture BEFORE fetching: a card-sourced slot points at
  // a different image on every card, which is the whole point of it. The
  // resolver is shared with the layout editor's canvas so the two can't drift.
  const wanted = list.map((a) => assetPicture(a, d));
  const urls = await Promise.all(
    // Asked for at twice the drawn width for crispness — no point decoding a
    // 4000px globe to paint it at 240 on a 1200px canvas.
    wanted.map((u, i) => toEmbeddable(u, { maxWidth: Math.min(1600, Math.round(list[i].w * 2)) })),
  );
  return { ...l, assets: list.map((a, i) => ({ ...a, url: urls[i] ?? "" })).filter((a) => a.url) };
}

async function prepareBody(d: CardData): Promise<CardData> {
  const bg = resolveBackground(d.theme);

  switch (d.kind) {
    case "profile": {
      // Only the trophies the card can actually show are fetched — decoding a
      // shelf of forty to draw three is time this render doesn't have. Kept in
      // step with the three the profile layout draws; fetching five to draw
      // three was two wasted image decodes on every profile card.
      const shelf = (d.trophies ?? []).slice(0, 3);
      const [bgUrl, avatarUrl, ...rest] = await Promise.all([
        bg,
        toEmbeddable(d.avatarUrl, ICON),
        ...d.accounts.map((a) => toEmbeddable(a.logoUrl, ICON)),
        ...shelf.map((t) => toEmbeddable(t.imageUrl, { maxWidth: 240 })),
      ]);
      return {
        ...d, avatarUrl,
        accounts: d.accounts.map((a, i) => ({ ...a, logoUrl: rest[i] })),
        // A trophy whose art won't load is dropped, not drawn as a hole.
        trophies: shelf
          .map((t, i) => ({ ...t, imageUrl: rest[d.accounts.length + i] ?? "" }))
          .filter((t) => t.imageUrl),
        theme: { ...d.theme, bgUrl },
      };
    }
    case "leaderboard": {
      const [bgUrl, logoUrl, ...avatars] = await Promise.all([
        bg, toEmbeddable(d.logoUrl, ICON), ...d.rows.map((r) => toEmbeddable(r.avatarUrl, ICON)),
      ]);
      return {
        ...d, logoUrl,
        rows: d.rows.map((r, i) => ({ ...r, avatarUrl: avatars[i] })),
        theme: { ...d.theme, bgUrl },
      };
    }
    case "challenge": {
      const [bgUrl, logoUrl, ...trophies] = await Promise.all([
        bg, toEmbeddable(d.logoUrl, ICON), ...d.trophies.map((t) => toEmbeddable(t.imageUrl, { maxWidth: 240 })),
      ]);
      return {
        ...d, logoUrl,
        // A trophy with no usable art is dropped rather than drawn as a gap.
        trophies: d.trophies.map((t, i) => ({ ...t, imageUrl: trophies[i] ?? "" })).filter((t) => t.imageUrl),
        theme: { ...d.theme, bgUrl },
      };
    }
    case "game-stats": {
      const champs = d.champions ?? [];
      const matches = d.matches ?? [];
      const [bgUrl, logoUrl, avatarUrl, gameAvatarUrl, ...rest] = await Promise.all([
        bg,
        toEmbeddable(d.logoUrl, ICON),
        toEmbeddable(d.avatarUrl, ICON),
        toEmbeddable(d.gameAvatarUrl, ICON),
        ...champs.map((c) => toEmbeddable(c.iconUrl, ICON)),
        ...matches.map((m) => toEmbeddable(m.iconUrl, ICON)),
      ]);
      return {
        ...d, logoUrl, avatarUrl, gameAvatarUrl,
        champions: champs.map((c, i) => ({ ...c, iconUrl: rest[i] })),
        matches: matches.map((m, i) => ({ ...m, iconUrl: rest[champs.length + i] })),
        theme: { ...d.theme, bgUrl },
      };
    }
    case "world": {
      const abilities = d.abilities.slice(0, 4);
      const [bgUrl, logoUrl, artUrl, ...icons] = await Promise.all([
        bg,
        toEmbeddable(d.logoUrl, ICON),
        // The splash a second time, at panel resolution rather than card
        // resolution — the panel is ~410px wide, and decoding a 1215px champion
        // splash twice at full size is the single most expensive thing this
        // card could do.
        toEmbeddable(d.artUrl, { maxWidth: 900 }),
        ...abilities.map((a) => toEmbeddable(a.iconUrl, { maxWidth: 96 })),
      ]);
      return {
        ...d, logoUrl, artUrl,
        abilities: abilities.map((a, i) => ({ ...a, iconUrl: icons[i] })),
        theme: { ...d.theme, bgUrl },
      };
    }
    case "search": {
      const [bgUrl, ...imgs] = await Promise.all([bg, ...d.results.map((r) => toEmbeddable(r.imageUrl, ICON))]);
      return { ...d, results: d.results.map((r, i) => ({ ...r, imageUrl: imgs[i] })), theme: { ...d.theme, bgUrl } };
    }
    case "quest":
    case "planet":
    case "guide": {
      const [bgUrl, logoUrl] = await Promise.all([bg, toEmbeddable(d.logoUrl, ICON)]);
      return { ...d, logoUrl, theme: { ...d.theme, bgUrl } };
    }
    case "planets": {
      const [bgUrl, ...logos] = await Promise.all([bg, ...d.games.map((g) => toEmbeddable(g.logoUrl, ICON))]);
      return { ...d, games: d.games.map((g, i) => ({ ...g, logoUrl: logos[i] })), theme: { ...d.theme, bgUrl } };
    }
    case "market": {
      const [bgUrl, ...arts] = await Promise.all([
        bg,
        ...d.trophies.map((x) => toEmbeddable(x.imageUrl, { maxWidth: 160 })),
      ]);
      return {
        ...d,
        // A tile SURVIVES its art failing: the name, the price and the dollar
        // value are the payload, and dropping the trophy because an image host
        // was slow would leave a gap where the offer should be.
        trophies: d.trophies.map((x, i) => ({ ...x, imageUrl: arts[i] })),
        theme: { ...d.theme, bgUrl },
      };
    }
    case "week": {
      // The trophy art is fetched once and reused for every placement — all
      // three win the same trophy, and decoding it three times is three times
      // the work for the same bytes.
      const [bgUrl, trophyUrl, ...avatars] = await Promise.all([
        bg,
        toEmbeddable(d.trophy?.imageUrl, { maxWidth: 240 }),
        ...d.entries.map((e) => toEmbeddable(e.avatarUrl, ICON)),
      ]);
      return {
        ...d,
        // The trophy SURVIVES its art failing to load. Dropping the whole
        // object when the image host is slow turned the podium card back into
        // a race card — no prize named, no "awarded to all three" — which is
        // the one thing Sunday's card exists to say. Only the picture is
        // conditional; the name and the value are text.
        trophy: d.trophy ? { ...d.trophy, imageUrl: trophyUrl ?? "" } : null,
        entries: d.entries.map((e, i) => ({
          ...e,
          avatarUrl: avatars[i],
          trophyUrl: e.trophyUrl ? trophyUrl : null,
        })),
        theme: { ...d.theme, bgUrl },
      };
    }
    default:
      return { ...d, theme: { ...d.theme, bgUrl: await bg } };
  }
}

/**
 * The image-resolution step on its own.
 *
 * Exported so a test can assert what a card looks like AFTER its remote images
 * have been fetched — which is where the interesting failures live. Text that
 * silently disappears because an image host was slow is not visible in the
 * card's data, only in what the renderer was actually handed.
 */
export function prepareCardForTest(d: CardData): Promise<CardData> {
  return prepareCard(d);
}

// Render a card to an ImageResponse (streamable PNG response).
export async function renderCard(data: CardData): Promise<ImageResponse> {
  const [fonts, prepared] = await Promise.all([loadCardFonts(), prepareCard(data)]);
  return new ImageResponse(
    <div style={{ display: "flex", width: CARD_W, height: CARD_H, fontFamily: cardFontFamily(fonts) }}>{body(prepared)}</div>,
    { width: CARD_W, height: CARD_H, ...(fonts.length ? { fonts } : {}) },
  );
}

// Render a card to a raw PNG Buffer (for storing in Blob / attaching to Discord).
//
// One retry, deliberately. Satori fails the whole render on a single bad style
// value, and these cards ARE the bot's interface — a failed render is a button
// that does nothing, which is far worse than a card missing its custom art. So
// if the styled card throws, we draw it again stripped back to house colours
// and no background, which has no untrusted input left in it.
export async function renderCardBuffer(data: CardData): Promise<Buffer> {
  try {
    const res = await renderCard(data);
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.error("[cards] render failed, retrying plain:", (err as Error)?.message);
    const plain = {
      ...data,
      // The sponsor goes too. A brand's own artwork is untrusted input like any
      // other, and if it is what took the render down, keeping it on the retry
      // turns one missing ad into a card that never draws at all.
      theme: { ...data.theme, accent: FALLBACK_ACCENT, accent2: FALLBACK_ACCENT2, bgUrl: null, bgFallbacks: [], ad: null },
    } as CardData;
    const res = await renderCard(plain);
    return Buffer.from(await res.arrayBuffer());
  }
}

// A PNG of a photographic background is 2-3 MB. That's slow for Discord to
// fetch, and Blob transfer is the tightest resource we have — so past this,
// the card is re-encoded as JPEG, which takes the same picture to a few
// hundred KB. Flat, graphic cards stay PNG, where it's the better format.
const JPEG_OVER_BYTES = 900_000;

export type CardImage = { body: Buffer; contentType: string; ext: "png" | "jpg" };

export async function renderCardImage(data: CardData): Promise<CardImage> {
  const png = await renderCardBuffer(data);
  if (png.byteLength <= JPEG_OVER_BYTES) {
    return { body: png, contentType: "image/png", ext: "png" };
  }
  try {
    const sharp = (await import("sharp")).default;
    const jpg = await sharp(png).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    // Only take the trade if it actually paid off.
    if (jpg.byteLength < png.byteLength) {
      return { body: jpg, contentType: "image/jpeg", ext: "jpg" };
    }
  } catch { /* no transcoder — a big PNG still works, it's just heavier */ }
  return { body: png, contentType: "image/png", ext: "png" };
}
