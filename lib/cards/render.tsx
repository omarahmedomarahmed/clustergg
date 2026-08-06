import { ImageResponse } from "next/og";
import { loadCardFonts, cardFontFamily } from "@/lib/cards/fonts";
import { toEmbeddable, withDeadline } from "@/lib/cards/img";
import { brandCardArt } from "@/lib/cards/brand";
import { HOUSE_AD } from "@/lib/cards/ads";
import {
  AD_LABEL_H, CANVAS_W, DEFAULT_LAYOUT, adBox, assetBox, badgeTopFor, contentBoxFor, mascotYields, opacityOf, panes,
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

/**
 * The fixed top strip (B54).
 *
 * Identity left, branding right, and everything under it free for the body.
 * Sized so the mark reads at thumbnail scale without eating a sixth of the
 * canvas — these cards get screenshotted and reposted, and the strip is what
 * survives a crop.
 */
// The top band's height: the sponsor box's own bottom, plus air. Derived rather
// than chosen, because the ad is the one element in that band whose size is a
// commercial promise — everything else is placed around it.
export const STRIP_H = 196;

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
  /**
   * True when the proposal IS the game's logo — and therefore the same picture
   * the strip is now drawing as a watermark (B54).
   *
   * Six card bodies propose the game's logo in the corner, because until B54 it
   * was the only game identity a card carried. The strip carries it now, so on
   * "auto" the corner steps aside rather than printing the mark twice — which is
   * exactly what the first render of this did, one under the other, and the only
   * way to see it was to look at the picture.
   *
   * Only on "auto": an admin who explicitly chose "the game's logo" gets the
   * crisp corner badge they asked for, and the watermark stands down instead.
   */
  cornerIsGameLogo = false,
  stripHasGameLogo = false,
): React.ReactNode {
  const show = theme.layout?.badgeShow ?? "auto";
  if (show === "auto") return cornerIsGameLogo && stripHasGameLogo ? undefined : proposed;
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

function Frame({ theme, children, panes: bodyPanes, corner: proposedCorner, cornerIsGameLogo, identity, side }: {
  theme: CardTheme;
  /** The whole body as one pane. A card that divides it passes `panes`. */
  children?: React.ReactNode;
  /**
   * The card's own identity, drawn top-left (B56.0).
   *
   * Every kind passes one, and every one of them has an IMAGE: the game's logo
   * on a challenge or a leaderboard, the gamer's avatar on a profile, the game
   * account's avatar on a game-stats card, the quest's art on a quest. A card
   * whose top-left is a headline in empty space could be any card, and the body
   * below it then has to re-state what it is about instead of getting on with
   * showing it.
   */
  identity?: {
    title: string;
    subtitle?: string | null;
    /** A small line above the title — "LIVE CHALLENGE", "PLANET", "WEEK 42". */
    eyebrow?: string | null;
    imageUrl?: string | null;
    /** Avatars are round; logos and cover art are not. */
    round?: boolean;
    /** Headline size, for the kinds whose names run long. */
    size?: number;
  };
  /**
   * The body, as PANES (B57).
   *
   * Reading order — left, right, then the second row. Each is drawn into the
   * rectangle `panes()` computes from the LIVE layout, so an admin who moves
   * the split moves the content with it, and the editor draws the same
   * rectangles the renderer does.
   *
   * A pane the card has no content for is not drawn. An empty bordered box is
   * the failure mode a grid invites, and it looks like the card is broken
   * rather than like the gamer has nothing there yet.
   *
   * A card that passes `children` instead gets the whole body as one pane,
   * which is the right answer for a leaderboard.
   */
  panes?: (React.ReactNode | null)[];
  corner?: React.ReactNode;
  /** The corner proposal is the game's logo — see `badgeContent`. */
  cornerIsGameLogo?: boolean;
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
  const l = theme.layout ?? DEFAULT_LAYOUT;
  const mascot = spotBox(l.mascot, 1);
  const corner = badgeContent(theme, proposedCorner, cornerIsGameLogo, false);
  const mark = spotBox(l.mark, 1);
  const badge = spotBox(l.badge, 1);
  // THE AD IS ALWAYS ON (B56.0).
  //
  // There is no such thing as an unsold card. When no brand has bought this
  // impression the HOUSE creative fills it, because the slot IS the product: a
  // corner that is sometimes empty teaches a server owner that the bot
  // sometimes has one, and it is the hardest thing to un-teach. Only an admin
  // hiding the slot on a kind takes it off, and that is a decision somebody
  // made rather than an accident of inventory.
  const ad = l.ad.hidden ? null : theme.ad ?? null;
  const adB = adBox(l.ad);
  const badgeTop = badgeTopFor(l, !!ad, 1);
  // The identity block, top-left: the picture and the name of the thing.
  const idBox = spotBox(l.gameMark, 1);
  const idImage = identity?.imageUrl || theme.badge?.gameLogoUrl || theme.markUrl || null;
  // It ends before the sponsor box, always. Satori has no float, so a title
  // long enough to reach the creative would be drawn straight under it.
  const idWidth = Math.max(220, adB.left - idBox.left - 28);
  /** The text's own share of that, once the picture has taken its bite. */
  const idText = Math.max(160, idWidth - idBox.width - 18);
  const content = contentBoxFor(l, !!ad);
  const paneBoxes = panes(l);
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
      {/* THE TOP BAND (B56.0).
          Two things live here and only two: the card's IDENTITY on the left and
          the AD on the right. A scrim rather than a solid bar, so background
          art still reads through — this is a section of the platform, not a
          poster with a header glued on. */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: STRIP_H, display: "flex",
        background: "linear-gradient(180deg, rgba(4,5,26,0.86) 0%, rgba(4,5,26,0.42) 62%, rgba(4,5,26,0) 100%)",
      }} />
      {/* THE IDENTITY, top-left: a picture of the thing, then its name.
          Never text alone. Every kind has an image of what it is about — the
          game's logo, the gamer's avatar, the account's avatar, the quest art —
          and a card that opens with a headline floating in space could be any
          card on the platform. `identityImage` falls back through the game's
          logo to our own mark so the slot is never empty. */}
      {identity && !l.gameMark.hidden ? (
        <div style={{
          position: "absolute", left: idBox.left, top: idBox.top,
          maxWidth: idWidth, display: "flex", alignItems: "center", gap: 18,
        }}>
          {idImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={idImage} alt="" width={idBox.width} height={idBox.height}
              style={{
                width: idBox.width, height: idBox.height, objectFit: "cover",
                borderRadius: identity.round ? idBox.width / 2 : Math.round(idBox.width * 0.26),
                border: `3px solid ${alpha(theme.accent, 0.55)}`,
                ...styleOf({ ...l.gameMark, opacity: undefined }),
              }} />
          ) : null}
          {/* Clamped and clipped, because this band is a FIXED height (B56.0).
              The first render of it let a two-line title and a two-line
              subtitle push the block straight down into the body, over the
              pills the challenge card draws there. The band is the frame; the
              text fits it rather than the other way round. */}
          <div style={{
            display: "flex", flexDirection: "column", gap: 4,
            maxWidth: idWidth - idBox.width - 18, maxHeight: STRIP_H - idBox.top - 12,
            overflow: "hidden",
          }}>
            {identity.eyebrow ? (
              <div style={{ display: "flex", fontSize: 17, fontWeight: 800, letterSpacing: 2.4, textTransform: "uppercase", color: safeColor(theme.accent2, FALLBACK_ACCENT2) }}>
                {identity.eyebrow}
              </div>
            ) : null}
            <div style={{ display: "flex", fontSize: identity.size ?? 40, fontWeight: 800, lineHeight: 1.06, color: INK }}>
              {clampAt(identity.title, Math.floor(idText / ((identity.size ?? 40) * 0.52)))}
            </div>
            {identity.subtitle ? (
              <div style={{ display: "flex", fontSize: 20, color: MUTED, lineHeight: 1.25 }}>
                {clampAt(identity.subtitle, Math.floor(idText / 10))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {/* The gradient rule is GONE (B56.0): it read as a notification banner.
          Kept behind an admin toggle that now defaults off, so a deployment
          that wants it back has it. */}
      {l.bar ? (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 8, display: "flex", background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2})` }} />
      ) : null}
      {/* Admin-placed art BEHIND the content — planet globes, quest maps,
          seasonal flourishes. Drawn before the mascot so the mascot still reads
          as the foreground character. */}
      {(l.assets ?? []).filter((a) => !a.front).map((a) => <Asset key={a.id} a={a} />)}

      {/* The astronaut, behind the content. */}
      {theme.astronautUrl && !l.mascot.hidden && !mascotYields(l, !!ad) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={theme.astronautUrl} alt="" width={mascot.width} height={mascot.height}
          style={{
            position: "absolute", left: mascot.left, top: mascot.top,
            width: mascot.width, height: mascot.height, objectFit: "contain",
            // Semi-transparent by house default (B54): in the strip it is
            // decoration sharing a band with the identity line and the mark,
            // and at the 0.85 it carried in the bottom-left corner it competed
            // with both. An explicit setting overrides it.
            opacity: opacityOf(l.mascot.opacity) ?? 0.55,
            ...styleOf({ ...l.mascot, opacity: undefined }),
          }} />
      ) : null}
      {/* THE CLUSTER MARK, as a WATERMARK in the body band (B56.0).
          It has been bottom-right (over the standings) and top-right (under the
          sponsor box, which is drawn last — so on a sold card our mark was not
          on the card at all). Both were attempts to give it a rectangle of its
          own on a card that has no spare rectangle. Behind the content it costs
          nothing, survives the crop, and no body has to lay itself out around
          it. Drawn BEFORE the children for exactly that reason. */}
      {!l.mark.hidden ? (
        <div style={{
          position: "absolute", left: mark.left, top: mark.top, width: mark.width, height: mark.height,
          display: "flex", alignItems: "center", justifyContent: "center",
          // Faint by house default; an explicit setting wins.
          opacity: opacityOf(l.mark.opacity) ?? 0.07,
          ...styleOf({ ...l.mark, opacity: undefined }),
        }}>
          {theme.markUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={theme.markUrl} alt="" width={mark.width} height={mark.height}
              style={{ width: mark.width, height: mark.height, objectFit: "contain" }} />
          ) : (
            // A LETTERFORM, not a tile. The tile was right when this was a
            // 132px mark in a corner; behind the content at 430px it is a pale
            // rounded square the size of a coaster sitting under the trophies.
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: mark.width, height: mark.height, fontSize: Math.round(mark.width * 0.9), fontWeight: 800, color: safeColor(theme.accent2, FALLBACK_ACCENT2) }}>C</div>
          )}
        </div>
      ) : null}
      {/* THE BODY, as panes (B57). One box when the card has one thing to say,
          two or four when it has more — and the geometry comes from the same
          helper the editor draws with, so the two cannot disagree. */}
      {bodyPanes
        ? bodyPanes.map((pane, i) => (pane && paneBoxes[i] ? (
          <div key={i} style={{
            position: "absolute", left: paneBoxes[i].left, top: paneBoxes[i].top,
            width: paneBoxes[i].width, height: paneBoxes[i].height,
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>{pane}</div>
        ) : null))
        : (
          <div style={{ position: "absolute", left: content.left, top: content.top, width: content.width, height: content.height, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {children}
          </div>
        )}
      {/* The right-hand column. Drawn before the logo on purpose: the logo is
          the one thing that is never covered. */}
      {side && sideBoxFits(side_) ? side(side_) : null}
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
      {/* THE EDGE (B56.0). One thin, quiet line, replacing the gradient rule
          that used to run across the top and read as a notification banner.
          What a section needs is an edge, so it stops being a rectangle of art
          with words on it. Drawn last so nothing paints over it; 0 turns it
          off. */}
      {(l.stroke ?? 0) > 0 ? (
        <div style={{
          position: "absolute", top: 0, left: 0, width: CARD_W, height: CARD_H, display: "flex",
          borderRadius: 2, border: `2px solid rgba(255,255,255,${((l.stroke ?? 0) / 100 * 0.5).toFixed(3)})`,
        }} />
      ) : null}
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

// ===== The platform's vocabulary (B56) =====
//
// B54 asked for cards "laid out to render what a gamer sees on the platform".
// That was built as the same DATA, and it was meant as the same VISUAL
// LANGUAGE: a gamer looking at a card in Discord should feel they are looking
// at Cluster, not at a nicer poster of the same numbers.
//
// So the shapes the site repeats everywhere live here, once, and every body
// draws with them. Re-styling a sub-card per body is how thirteen cards end up
// looking like thirteen products — and it is the specific thing `tests/ui/
// cards.mjs` checks, because it is invisible on any single card.
//
// The source of truth is `app/globals.css:45` (`.glass`) and the components
// that use it. These are its values, not an impression of them.

/** `.glass` — app/globals.css:45. The card-within-card the whole site is made of. */
const GLASS_BG = "linear-gradient(160deg, rgba(139,92,246,0.07), rgba(34,211,238,0.04) 55%, rgba(255,255,255,0.02))";
const GLASS_BORDER = "rgba(139,92,246,0.18)";

/**
 * One sub-card.
 *
 * `ring` overrides the border where the platform tints it by meaning — the
 * marketplace rings a legendary trophy in amber (`TIER_RING`,
 * components/TrophyMarket.tsx:21) and that colour IS the information.
 */
function GlassCard({ children, ring, style, pad = 12 }: {
  children: React.ReactNode; ring?: string | null; style?: React.CSSProperties; pad?: number;
}) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", borderRadius: 16, padding: pad,
      background: GLASS_BG, border: `1px solid ${ring ? safeColor(ring, GLASS_BORDER) : GLASS_BORDER}`,
      ...style,
    }}>
      {children}
    </div>
  );
}

/**
 * The square plate a tile's picture sits on.
 *
 * The platform never floats product art on the page — a trophy, a game logo, a
 * champion portrait always sits on `bg-black/30` inside its card
 * (components/TrophyMarket.tsx:129). It is what stops a transparent PNG from
 * dissolving into whatever artwork is behind the card.
 */
function ArtPanel({ url, size, pad = 8, corner }: {
  url?: string | null; size: number; pad?: number; corner?: React.ReactNode;
}) {
  return (
    <div style={{
      display: "flex", position: "relative", width: "100%", height: size,
      alignItems: "center", justifyContent: "center", borderRadius: 12,
      background: "rgba(0,0,0,0.30)", padding: pad,
    }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" width={size - pad * 2} height={size - pad * 2}
          style={{ width: size - pad * 2, height: size - pad * 2, objectFit: "contain" }} />
      ) : null}
      {corner ? (
        <div style={{ position: "absolute", top: 6, right: 6, display: "flex" }}>{corner}</div>
      ) : null}
    </div>
  );
}

/**
 * A figure stated as value, in its own bordered box.
 *
 * The platform's recurring "here is your number and what it means" shape — the
 * wallet on the marketplace shelf (components/TrophyMarket.tsx:80) is the
 * canonical one: the figure, what it is for, and the next step, boxed and
 * tinted in the accent rather than set loose in the paragraph.
 */
function StatTile({ figure, label, foot, accent, align = "flex-start", pad = 12 }: {
  figure: React.ReactNode; label?: string | null; foot?: string | null;
  accent: string; align?: "flex-start" | "flex-end"; pad?: number;
}) {
  const c = safeColor(accent, FALLBACK_ACCENT2);
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: align, gap: 2,
      borderRadius: 16, padding: `${pad - 4}px ${pad + 4}px`,
      border: `1px solid ${alpha(c, 0.25)}`, background: alpha(c, 0.06),
    }}>
      <div style={{ display: "flex", alignItems: "center", color: c }}>{figure}</div>
      {label ? <div style={{ display: "flex", fontSize: 15, letterSpacing: 1.4, textTransform: "uppercase", color: MUTED }}>{label}</div> : null}
      {foot ? <div style={{ display: "flex", fontSize: 15, fontWeight: 700, color: alpha(c, 0.75) }}>{foot}</div> : null}
    </div>
  );
}

/**
 * One pane's own column.
 *
 * Satori has no Fragment: a pane handed `<>…</>` lays its children out as if
 * the pane were a row, which put the profile card's LINKED ACCOUNTS heading
 * beside its stat pills and half off the pane. Every pane is a real element.
 */
function Pane({ children }: { children: React.ReactNode }) {
  // `height: 100%` is load-bearing: a section inside a pane that uses `flex: 1`
  // to claim the leftover space — the challenge card's standings do — collapses
  // to nothing when its parent's height is auto. The standings simply were not
  // on the card.
  return <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>{children}</div>;
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

const nf = (n: number) => n.toLocaleString("en-US");

// Truncate on a word boundary. A hard slice reads as a bug ("…from the Che"),
// and these strings are admin-written, so they can be any length.
/**
 * The same clamp, scaled to the column this card's layout actually gives it.
 *
 * Every character count in this file was chosen against a 58.5%-wide content
 * column — the number that was right when the logo sat bottom-right and the
 * text had to end before it. B54 moved the branding into the strip and widened
 * the column to 78%, and every one of those counts stayed where it was: the
 * first render after the redesign clipped "Blitz Supernova — Weekly…" with 470
 * empty pixels to the right of the ellipsis. Fifty magic numbers, all wrong by
 * the same ratio.
 *
 * So the ratio is applied once, here, from the LIVE layout — which also means
 * an admin narrowing the column narrows the text with it rather than getting
 * overflow, and widening it gets the words back.
 *
 * Used by shadowing: `const clamp = clampFor(t)` at the top of a card body. A
 * body that hasn't been converted keeps the unscaled module function, which is
 * exactly what it drew before.
 */
/** The column-scaled clamp is the default; `clampAt` is the unscaled one. */
const clamp = clampAt;

function clampFor(t: CardTheme) {
  const l = t.layout ?? DEFAULT_LAYOUT;
  // The EFFECTIVE width, not the stored one: a sold card's column is narrowed
  // around the sponsor box, and clamping to the stored 78% there would hand
  // every line a third more characters than the column can hold.
  const w = (contentBoxFor(l, !!t.ad).width / CANVAS_W) * 100;
  const k = Math.max(0.6, Math.min(1.8, w / 58.5));
  return (s: string | null | undefined, max: number) => clampAt(s, Math.round(max * k));
}

/**
 * The raw clamp, in characters, with no column scaling.
 *
 * Use this inside a FIXED-WIDTH box — a market tile is 218px whatever the
 * content column is doing, and scaling its name clamp with the column is how
 * "Champion's Nebula Cup" came back: 21 characters passed a limit that had been
 * widened from 17 to 23 for a column the tile does not live in, wrapped to two
 * lines, and landed on top of the tier label under it.
 */
function clampAt(s: string | null | undefined, max: number): string | undefined {
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
  // Scaled to the column this layout gives the card — see `clampFor`.
  const clamp = clampFor(t);
  const [pStats, pTrophies, pChallenges, pAccounts] =
    ["stats", "trophies", "challenges", "accounts"].map((k) => part(t, k));
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
  const accounts = d.accounts.slice(0, (trophies.length || challenges.length) ? 4 : 6);
  const accountsHidden = Math.max(0, d.accounts.length - accounts.length);
  return (
    <Frame
      theme={t}
      // The gamer IS the identity of a profile card, so it goes in the top
      // band's left with their avatar (B56.0) rather than being re-stated as
      // the first block of the body.
      identity={{
        imageUrl: d.avatarUrl, round: true, title: clamp(d.displayName, 18) ?? d.displayName,
        subtitle: `clustergg.com/u/${d.slug}${d.title ? ` · ${d.title}` : ""}`,
      }}
      // TWO PANES (B57): what they PLAY on the left, what they have WON on the
      // right. One column made those two compete for the same vertical inches,
      // which is why the accounts kept losing — a gamer with three trophies and
      // five accounts saw the trophies and two of the accounts.
      panes={[
        <Pane key="left">
          <Section p={pStats} style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {/* The level belongs with the other things that describe this gamer
                — points, views, votes — not floating in a corner as an
                unexplained badge. It reads as a stat because it is one. */}
            <Pill color={t.accent2} bg={alpha(t.accent2, 0.16, FALLBACK_ACCENT2)} size={pStats.f(19)}>{`LV ${nf(d.level)}`}</Pill>
            <Pill color={t.accent2} bg="rgba(255,255,255,0.08)" size={pStats.f(19)}><CpCoin size={pStats.f(16)} />{nf(d.totalCp)}</Pill>
            <Pill size={pStats.f(19)}>{`${nf(d.views)} views`}</Pill>
            <Pill color="#fbbf24" bg="rgba(251,191,36,0.12)" size={pStats.f(19)}>
              <div style={{ display: "flex", width: 11, height: 11, borderRadius: 6, background: "#fbbf24" }} />
              {`${nf(d.votes)} votes`}
            </Pill>
            {d.award ? <Pill color="#34d399" bg="rgba(52,211,153,0.12)" size={pStats.f(19)}>{clamp(d.award, 22)}</Pill> : null}
          </Section>

          <Section p={pAccounts} style={{ marginTop: 14, gap: 8 }}>
            {/* The count belongs in the heading when the card can't show them
                all — a gamer with six accounts seeing four, with nothing saying
                so, reads as us having lost two of them. */}
            <Head p={pAccounts}>{accountsHidden ? `LINKED ACCOUNTS · ${nf(d.accounts.length)}` : "LINKED ACCOUNTS"}</Head>
            {accounts.length === 0 ? (
              <div style={{ display: "flex", fontSize: pAccounts.f(22), color: MUTED }}>No games linked yet — link one to unlock quests.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {accounts.map((a, i) => (
                  <GlassCard key={i} pad={9} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    {/* Its own art — every entity a pane draws carries the
                        picture of the thing (B57). */}
                    {a.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.logoUrl} alt="" width={40} height={40} style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover" }} />
                    ) : <div style={{ width: 40, height: 40, borderRadius: 10, display: "flex", background: alpha(t.accent, 0.2) }} />}
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <div style={{ fontSize: pAccounts.f(21), fontWeight: 700 }}>{clampAt(a.tag, 18)}</div>
                      <div style={{ fontSize: pAccounts.f(16), color: MUTED }}>{clampAt(a.headline || a.game, 26)}</div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            )}
          </Section>
        </Pane>,

        // The right pane: what they have WON, and what they are playing for.
        (trophies.length || challenges.length) ? (
          <Pane key="right">
            {trophies.length ? (
              <Section p={pTrophies} style={{ gap: 6 }}>
                <Head p={pTrophies}>
                  {(d.trophyCount ?? trophies.length) > trophies.length
                    ? `TROPHY CASE · ${nf(d.trophyCount ?? trophies.length)}`
                    : "TROPHY CASE"}
                </Head>
                <div style={{ display: "flex", flexDirection: "row", gap: 10 }}>
                  {trophies.map((x, i) => (
                    <GlassCard key={i} pad={8} style={{ width: 160, gap: 4 }}>
                      <ArtPanel url={x.imageUrl} size={78} />
                      <div style={{ display: "flex", fontSize: 16, fontWeight: 800, color: INK, lineHeight: 1.2 }}>
                        {clampAt(x.name, 16)}
                      </div>
                      {x.value ? (
                        <div style={{ display: "flex", fontSize: 19, fontWeight: 900, color: "#fde68a" }}>
                          {`$${nf(x.value)}`}
                        </div>
                      ) : null}
                    </GlassCard>
                  ))}
                </div>
              </Section>
            ) : null}

            {/* What they're competing in right now — the one thing on this card
                another gamer can act on. */}
            {challenges.length ? (
              <Section p={pChallenges} style={{ gap: 6, marginTop: 14 }}>
                <Head p={pChallenges}>IN THE ARENA</Head>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {challenges.map((c, i) => (
                    <GlassCard key={i} pad={9} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
                      ring={c.live ? t.accent2 : null}>
                      {c.live ? <div style={{ display: "flex", width: 10, height: 10, borderRadius: 5, background: "#34d399" }} /> : null}
                      <div style={{ display: "flex", fontSize: pChallenges.f(18), fontWeight: 700 }}>{clampAt(c.title, 22)}</div>
                      <div style={{ display: "flex", fontSize: pChallenges.f(16), color: MUTED, marginLeft: 8 }}>
                        {c.place ? `#${c.place}` : `${nf(c.points)} pts`}
                      </div>
                    </GlassCard>
                  ))}
                </div>
              </Section>
            ) : null}
          </Pane>
        ) : null,
      ]}
    />
  );
}

function GameStatsBody(d: GameStatsCard) {
  const t = d.theme;
  const clamp = clampFor(t);
  const [pId, pLive, pStats, pChamps, pMatches, pRank, pEmpty] =
    ["identity", "live", "stats", "champions", "matches", "rank", "empty"].map((k) => part(t, k));
  const champs = pChamps.hidden ? [] : (d.champions ?? []);
  const matches = pMatches.hidden ? [] : (d.matches ?? []);
  const hasRich = champs.length > 0 || matches.length > 0;
  // With champions and match history there's no room for six stat tiles, so the
  // stats compress into a single row and the game content gets the space.
  const statCount = hasRich ? 2 : 6;

  return (
    <Frame theme={t} identity={{
      // The GAME ACCOUNT's own avatar when the game has one, the game's logo
      // otherwise. This card is about that account, not about the person.
      imageUrl: d.gameAvatarUrl || d.logoUrl, round: !!d.gameAvatarUrl,
      eyebrow: clamp(d.game, 20), title: clamp(d.tag, 20) ?? d.tag,
      subtitle: clamp(`${d.region ? `${d.region} · ` : ""}${d.displayName}`, 44),
    }}>
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
  const clamp = clampFor(t);
  const next = d.nextThreshold ?? 0;
  const pct = next > 0 ? (d.cp / next) * 100 : 100;
  return (
    <Frame theme={t} identity={{
      // The quest's own art, top-left. It is the picture of the thing.
      imageUrl: d.logoUrl, eyebrow: "QUEST", title: d.questName,
      subtitle: d.displayName ? `${d.displayName}${d.tagline ? ` · ${d.tagline}` : ""}` : d.tagline,
    }}>
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
  const clamp = clampFor(t);
  const p = part(t, "quests");
  return (
    <Frame theme={t} identity={{
      imageUrl: d.avatarUrl, round: true, eyebrow: `LEVEL ${d.level}`,
      title: `${clamp(d.displayName, 16)}'s quests`,
      subtitle: `${nf(d.totalCp)} total Cluster Points`,
    }}>
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
  const clamp = clampFor(t);
  const [pRows, pEmpty] = ["rows", "empty"].map((k) => part(t, k));
  const medal = ["#fbbf24", "#cbd5e1", "#b45309"];
  return (
    <Frame theme={t} identity={{
      // The GAME's logo: it is that game's ladder, scored on that game's
      // accounts, which is the same rule B52 wrote for the rows themselves.
      imageUrl: d.logoUrl, eyebrow: "LEADERBOARD",
      title: clamp(d.title, 26) ?? d.title, subtitle: clamp(d.subtitle, 42),
    }}>
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
  const clamp = clampFor(t);
  const [pStatus, pMeta, pTime, pStand, pTro, pEmpty, pRules] =
    ["status", "meta", "timeline", "standings", "trophies", "empty", "rules"].map((k) => part(t, k));
  const ends = new Date(d.endsAt);
  const days = Math.max(0, Math.ceil((ends.getTime() - Date.now()) / 86400000));
  const trophies = pTro.hidden ? [] : d.trophies.slice(0, 3);
  return (
    <Frame theme={t}
      identity={{
      // The GAME's logo: it is that game's challenge, scored on that game's
      // accounts (B52's rule, applied to the card's subject).
      imageUrl: d.logoUrl, eyebrow: d.ended ? "FINISHED CHALLENGE" : "LIVE CHALLENGE",
      title: clamp(d.title, 30) ?? "", subtitle: clamp(d.description, 62), size: 38,
      }}
      // TWO PANES (B57): the details and the prize on the LEFT, the standings
      // on the RIGHT. The podium was drawn above the standings and squeezed
      // them to a row and a half — on the densest card on the platform, the
      // scoreboard is the reason people come back, so it gets a column of its
      // own rather than whatever is left after the prize.
      panes={[
        <Pane key="left">

      {/* The LIVE pill and the game name are the identity band's eyebrow now,
          so what is left here is only the thing the band cannot say: that this
          one is private and needs a key. */}
      <Section p={pStatus} style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {d.isPrivate ? (
          <Pill color="#fbbf24" bg="rgba(251,191,36,0.14)" size={pStatus.f(20)}>
            <div style={{ display: "flex", width: 12, height: 12, borderRadius: 3, background: "#fbbf24" }} />
            {clamp(d.serverName ? `${d.serverName.toUpperCase()} · KEY TO JOIN` : "KEY TO JOIN", 26)}
          </Pill>
        ) : null}
      </Section>
      <Section p={pMeta} style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
        <Pill color="#fbbf24" bg="rgba(251,191,36,0.12)" size={pMeta.f(20)}>{d.ended ? "FINISHED" : `${days}d left`}</Pill>
        <Pill size={pMeta.f(20)}>{`${nf(d.participants)} joined`}</Pill>
        {d.prize ? <Pill color={t.accent2} bg="rgba(255,255,255,0.08)" size={pMeta.f(20)}>{clamp(d.prize, 20)}</Pill> : null}
      </Section>

      {/* THE PRIZE PODIUM, in the body (B56.0).
          It used to hang off the top-right corner, under the game logo — a
          fourth thing in a band that has room for two, and on a sold card it
          was under the creative. The prize is the reason to enter, so it goes
          in the free space with everything else that matters, as a podium:
          silver left, gold raised in the middle, bronze right, on plinths of
          decreasing height. The shape everyone already knows, so the hierarchy
          is legible before a word is read. */}
      {trophies.length ? (
        <Section p={pTro} style={{ gap: 6, marginTop: 16 }}>
          {(() => {
            const byPlace = (n: number) => trophies.find((x) => x.place === n);
            const order = [byPlace(2), byPlace(1), byPlace(3)].filter(Boolean) as typeof trophies;
            const PLINTH: Record<number, number> = { 1: 30, 2: 20, 3: 13 };
            const COLOUR: Record<number, string> = { 1: "#fbbf24", 2: "#cbd5e1", 3: "#b45309" };
            const total = trophies.reduce((sum, x) => sum + (x.value || 0), 0);
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {total > 0 ? (
                  <div style={{ display: "flex", fontSize: pTro.f(18), fontWeight: 800, color: "#fbbf24", letterSpacing: 0.4 }}>
                    {`$${nf(total)} PRIZE POOL`}
                  </div>
                ) : null}
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                  {order.map((tr, i) => {
                    const c = COLOUR[tr.place] ?? MUTED;
                    const art = pTro.f(tr.place === 1 ? 68 : 54);
                    return (
                      <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: pTro.f(tr.place === 1 ? 92 : 78) }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={tr.imageUrl} alt="" width={art} height={art}
                          style={{ width: art, height: art, objectFit: "contain" }} />
                        <div style={{ display: "flex", fontSize: pTro.f(15), fontWeight: 800, color: c }}>
                          {tr.value > 0 ? `$${nf(tr.value)}` : `${tr.place}`}
                        </div>
                        {/* Explicit height per place — Satori has no flex-grow
                            tricks to lean on here, and the difference in height
                            IS the ranking. */}
                        <div style={{
                          display: "flex", alignItems: "flex-start", justifyContent: "center",
                          width: "100%", height: pTro.f(PLINTH[tr.place] ?? 13), borderRadius: 6,
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
          })()}
        </Section>
      ) : null}

        </Pane>,

        // The RIGHT pane: who can enter, the window, and the scoreboard.
        <Pane key="right">
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
        </Pane>,
      ]}
    />
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
/**
 * The planet card — the Discord rendering of the planet explorer
 * (`app/planets/[slug]/page.tsx`, `components/PlanetExplorer.tsx`).
 *
 * FOUR PANES (B57), which is what a planet actually is: the two ladders down
 * the left, the live challenges and the game's own world down the right, over
 * the planet's globe art. It was two columns of text rows — the same content,
 * with none of the shape and none of the art.
 */
function PlanetBody(d: PlanetCard) {
  const t = d.theme;
  const clamp = clampFor(t);
  const [pCh, pBo, pWorld] = ["challenges", "boards", "world"].map((k) => part(t, k));
  const challenges = d.challenges ?? [];
  const boards = d.boards ?? [];
  const world = pWorld.hidden ? [] : (d.world ?? []);

  const Board = (b: PlanetCard["boards"][number], i: number) => (
    <GlassCard key={i} pad={10} style={{ gap: 3 }}>
      <div style={{ display: "flex", fontSize: pBo.f(21), fontWeight: 700 }}>{clamp(b.title, 22)}</div>
      {/* `marginLeft`, not `gap`. Satori's gap support does not reach this
          nesting — it rendered "NovaGold II" with the two runs touching, which
          is the kind of thing only a real render shows. */}
      <div style={{ display: "flex", fontSize: pBo.f(17), color: MUTED }}>
        {b.leader ? (
          <>
            <div style={{ display: "flex", color: "#fbbf24" }}>{`#1 ${clamp(b.leader, 13)}`}</div>
            {b.value ? <div style={{ display: "flex", marginLeft: 10, color: t.accent2 }}>{clamp(b.value, 10)}</div> : null}
          </>
        ) : (
          <div style={{ display: "flex" }}>unclaimed — take it</div>
        )}
      </div>
    </GlassCard>
  );

  // The ladders split down the left: the two the admin put first get a pane
  // each, so a board is a block rather than a line in a list.
  const half = Math.ceil(Math.min(boards.length, 4) / 2) || 1;

  return (
    <Frame theme={t} identity={{
      imageUrl: d.logoUrl, eyebrow: "PLANET", title: `${clamp(d.game, 18)}`,
      subtitle: `${nf(d.gamers)} gamer${d.gamers === 1 ? "" : "s"} here${d.serverGamers != null ? ` · ${nf(d.serverGamers)} from this server` : ""}`,
    }}
      panes={[
        // TOP-LEFT and BOTTOM-LEFT: the ladders.
        boards.length ? (
          <Column p={pBo} label={`${pBo.say("LEADERBOARDS")} · ${boards.length}`} accent={t.accent2}>
            {boards.slice(0, half).map(Board)}
          </Column>
        ) : (
          <Column p={pBo} label={pBo.say("LEADERBOARDS")} accent={t.accent2}>
            <Empty p={pBo}>No boards on this game yet.</Empty>
          </Column>
        ),

        // TOP-RIGHT: what is running right now.
        <Column p={pCh} label={`${pCh.say("LIVE CHALLENGES")} · ${challenges.length}`} accent={t.accent}>
          {challenges.length === 0 ? (
            <Empty p={pCh}>Nothing running right now. The next one lands here first.</Empty>
          ) : challenges.slice(0, 3).map((c, i) => {
            const days = Math.max(0, Math.ceil((new Date(c.endsAt).getTime() - Date.now()) / 86400000));
            return (
              <GlassCard key={i} pad={10} style={{ gap: 3 }}>
                <div style={{ display: "flex", fontSize: pCh.f(21), fontWeight: 700 }}>{clamp(c.title, 22)}</div>
                {/* One text node with its own separators rather than three flex
                    children: Satori does not put the `gap` between adjacent
                    inline-ish divs here, so they render welded together. */}
                <div style={{ display: "flex", fontSize: pCh.f(17), color: MUTED }}>
                  <div style={{ display: "flex", color: days <= 1 ? "#fda4af" : MUTED }}>
                    {`${days === 0 ? "ends today" : `${days}d left`} · ${nf(c.participants)} in`}
                  </div>
                  {/* Clamped hard: `prizeDescription` is a free-text admin field
                      and a sentence in it wraps the row onto three lines. */}
                  {c.prize ? <div style={{ display: "flex", marginLeft: 8, color: "#fbbf24" }}>{clamp(c.prize, 12)}</div> : null}
                </div>
              </GlassCard>
            );
          })}
        </Column>,

        // BOTTOM-LEFT: the rest of the ladders. Nothing here when there is only
        // one board, and nothing is what gets drawn.
        boards.length > half ? (
          <Column p={pBo} label={pBo.say("")} accent={t.accent2}>
            {boards.slice(half, 4).map(Board)}
          </Column>
        ) : null,

        // BOTTOM-RIGHT: the game's own world, each with its art. Empty until
        // the snapshot has been synced for this game, which is a pane that is
        // simply not drawn rather than a box with nothing in it.
        world.length ? (
          <Column p={pWorld} label={pWorld.say("THE GAME")} accent={t.accent}>
            <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
              {world.slice(0, 4).map((w, i) => (
                <GlassCard key={i} pad={7} style={{ width: 116, gap: 4 }}>
                  <ArtPanel url={w.imageUrl} size={72} pad={6} />
                  <div style={{ display: "flex", fontSize: 15, fontWeight: 700, color: INK, lineHeight: 1.2 }}>
                    {clampAt(w.name, 13)}
                  </div>
                  {w.role ? (
                    <div style={{ display: "flex", fontSize: 12, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8 }}>
                      {clampAt(w.role, 12)}
                    </div>
                  ) : null}
                </GlassCard>
              ))}
            </div>
          </Column>
        ) : null,
      ]}
    />
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
 * The marketplace shelf — the Discord rendering of `components/TrophyMarket.tsx`.
 *
 * B56: the platform section, not an approximation of it. Read that file before
 * changing this one; where the two disagree, the component is right.
 *
 * What the shelf actually is, in the order it says it:
 *
 *   the heading and its caption            TrophyMarket.tsx:68-77
 *   the wallet, BOXED and tinted, stated
 *     as value with the next step under it TrophyMarket.tsx:80-90
 *   a grid of glass tiles, each ringed by
 *     TIER                                 TrophyMarket.tsx:21-26, :126
 *   a square art plate per tile            TrophyMarket.tsx:129-137
 *   name, then tier in small caps          TrophyMarket.tsx:139-140
 *   the DOLLAR value, promoted, with
 *     "redeems for cash" under it          TrophyMarket.tsx:142-157
 *   the CP price under that                TrophyMarket.tsx:158-160
 *
 * The old card had all of the same data and none of that shape: a 44px icon
 * beside a number bubble, then name, tier and both figures on one line. It read
 * as a receipt. The promotion of the dollar over the CP price is not decoration
 * either — it is B48's decision about what makes a trophy an asset rather than
 * a sticker, and a card that inverts it argues with the page.
 *
 * The number bubble stays, and is the one thing on this card the platform has
 * no equivalent for: in Discord you buy by typing the number, so the tile has
 * to carry it.
 */
function MarketBody(d: MarketCard) {
  const t = d.theme;
  const clamp = clampFor(t);
  const [pBal, pTiles, pPills, pEmpty] = ["balance", "tiles", "pills", "empty"].map((k) => part(t, k));
  const GAP = 12;
  const TILE_W = 208;
  // How many fit, rather than three because three fitted once. Taken from the
  // EFFECTIVE column, so a sold card drops to two per row instead of running
  // its shelf under the creative.
  const columnW = contentBoxFor(t.layout ?? DEFAULT_LAYOUT, !!t.ad).width;
  // FIVE across when the width allows: the shelf is a shelf, and four was
  // only ever what fitted at 218px wide.
  const COLS = Math.max(2, Math.min(5, Math.floor((columnW + GAP) / (TILE_W + GAP))));
  // ONE row, tall. The old card showed six tiles at 138px, which is what it
  // took to fit two rows of the receipt shape — and the shape was the problem.
  // Four tiles that carry the platform's hierarchy sell the shelf better than
  // six that carry none of it, and the shelf is a preview: /marketplace is
  // where the other two hundred live.
  const shown = (d.trophies ?? []).slice(0, COLS);
  // Sized to the body the shared layout leaves (B56.0): the identity band took
  // the top 196px, so a tile that fitted the old full-height column overflows.
  const ART = 84;

  // The platform rings a tile by TIER and that colour IS the information —
  // legendary glows amber, bronze is orange. `TIER_RING`, TrophyMarket.tsx:21.
  const TIER: Record<string, string> = {
    legendary: "#fcd34d", gold: "#fbbf24", silver: "#cbd5e1", bronze: "#fb923c",
  };

  return (
    <Frame theme={t} identity={{
      imageUrl: d.trophies?.[0]?.imageUrl ?? null, eyebrow: "MARKETPLACE",
      title: d.title, subtitle: clamp(d.subtitle, 64),
    }}>
      {/* The wallet. BOXED, tinted, and stated as value with the next step
          under it — the platform's own shape (TrophyMarket.tsx:80), because it
          is the most-looked-at number on the screen and a shelf you cannot
          price yourself against is a catalogue. */}
      <Section p={pBal} style={{ marginTop: 2, flexDirection: "row" }}>
        <StatTile
          accent={t.accent2}
          figure={(
            <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8, fontSize: pBal.f(38), fontWeight: 900 }}>
              <CpCoin size={pBal.f(24)} />{d.balance.toLocaleString()}
            </div>
          )}
          label={pBal.say(`to spend · ${d.earned.toLocaleString()} earned all-time`)}
          foot={`${d.cpPerDollar.toLocaleString()} CP = $1`}
          pad={9}
        />
      </Section>

      {shown.length === 0 ? (
        <Section p={pEmpty} style={{ marginTop: 40 }}>
          <div style={{ display: "flex", fontSize: pEmpty.f(25), color: MUTED, lineHeight: 1.3 }}>
            {pEmpty.say("The shelf is empty right now — check back once staff put trophies up.")}
          </div>
        </Section>
      ) : (
        <Section p={pTiles} style={{ marginTop: 8 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: GAP, width: TILE_W * COLS + GAP * (COLS - 1) }}>
            {shown.map((x, i) => (
              <GlassCard key={x.id} ring={TIER[x.tier.toLowerCase()] ?? null} pad={10}
                style={{
                  width: TILE_W, gap: 6,
                  // Out of reach reads dimmer rather than absent: it is the
                  // thing worth playing for, so it stays on the shelf.
                  opacity: x.affordable ? 1 : 0.62,
                }}>
                {/* The square plate. The platform never floats trophy art on
                    the page, and on a card there is background artwork behind
                    it — a transparent PNG with no plate dissolves into it. */}
                <ArtPanel url={x.imageUrl} size={ART} corner={(
                  <div style={{
                    display: "flex", width: 26, height: 26, borderRadius: 999,
                    alignItems: "center", justifyContent: "center",
                    fontSize: 16, fontWeight: 900, color: "#0b1020", background: t.accent2,
                  }}>{i + 1}</div>
                )} />
                {/* `clampAt`, not the column-scaled clamp: this tile is 218px
                    wide whatever the content column is doing. And no fixed
                    height — a box sized for one line cuts the descenders off
                    every name with a p or a y in it. */}
                <div style={{ display: "flex", fontSize: 18, fontWeight: 800, color: "#fff", lineHeight: 1.3 }}>
                  {clampAt(x.name, 20)}
                </div>
                <div style={{ display: "flex", fontSize: 12, lineHeight: 1.35, color: MUTED, textTransform: "uppercase", letterSpacing: 1 }}>
                  {x.tier}
                </div>
                {/* THE DOLLAR, promoted — B48's decision, and the platform sets
                    it at 2xl black amber with its caption under it. The CP
                    price follows, because that is the cost and this is the
                    worth. Inverting the two argues with the page. */}
                {x.value > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", marginTop: 2 }}>
                    <div style={{ display: "flex", fontSize: 30, fontWeight: 900, lineHeight: 1.05, color: "#fde68a" }}>
                      {`$${x.value.toLocaleString()}`}
                    </div>
                    <div style={{ display: "flex", fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "rgba(252,211,77,0.72)" }}>
                      redeems for cash
                    </div>
                  </div>
                ) : null}
                <div style={{
                  display: "flex", flexDirection: "row", alignItems: "center", gap: 5,
                  fontSize: 20, fontWeight: 900, color: x.affordable ? t.accent2 : MUTED,
                }}>
                  <CpCoin size={15} />{x.cpPrice.toLocaleString()}
                </div>
              </GlassCard>
            ))}
          </div>
        </Section>
      )}

      {/* One line, not two. The exchange rate moved into the wallet tile where
          the platform puts it; what is left is the thing a gamer is actually
          afraid of when they spend. */}
      <Section p={pPills} style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
        <Pill color="#34d399" bg="rgba(52,211,153,0.13)" size={pPills.f(19)}>
          Spending never lowers your level
        </Pill>
      </Section>
    </Frame>
  );
}

function WeekBody(d: WeekCard) {
  const t = d.theme;
  const clamp = clampFor(t);
  const [pRows, pPills, pEmpty] = ["rows", "pills", "empty"].map((k) => part(t, k));
  const medal = ["#fbbf24", "#cbd5e1", "#d08a4a"];
  const result = d.mode === "result";
  const entries = d.entries ?? [];

  return (
    <Frame theme={t} identity={{
      imageUrl: d.trophy?.imageUrl ?? null, eyebrow: result ? "RESULT" : "THIS WEEK",
      title: d.title, subtitle: clamp(d.subtitle, 64),
    }}>

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
  const clamp = clampFor(t);
  const p = part(t, "tiles");
  return (
    <Frame theme={t} identity={{
      imageUrl: d.games?.[0]?.logoUrl ?? null, eyebrow: "THE GALAXY",
      title: d.title, subtitle: d.subtitle,
    }}>
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
  const clamp = clampFor(t);
  return (
    <Frame theme={t} identity={{
      imageUrl: d.logoUrl, eyebrow: d.badge || "GUIDE",
      title: d.title, subtitle: d.subtitle,
    }}>
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
  const clamp = clampFor(t);
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
      identity={{
        imageUrl: d.logoUrl, eyebrow: d.entityKind.toUpperCase(),
        title: clamp(d.name, 22) ?? d.name,
        subtitle: d.skinName ? `${clamp(d.skinName, 24)} · ${d.game}` : d.game,
      }}
    >
      <Section p={pStatus} style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        {d.role ? <Pill size={pStatus.f(19)}>{clamp(d.role, 22)}</Pill> : null}
      </Section>

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
  const clamp = clampFor(t);
  const p = part(t, "rows");
  return (
    <Frame theme={t} identity={{
      imageUrl: d.results?.[0]?.imageUrl ?? null, eyebrow: "SEARCH",
      title: `"${clamp(d.query, 20) ?? d.query}"`,
      subtitle: `${d.results.length} matches — pick one below`,
    }}>
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
async function prepareCard(d: CardData): Promise<CardData> {
  // The whole image step gets one deadline. Past it the card is drawn with
  // whatever resolved — a person who tapped a button gets a card, not a spinner
  // that eventually times out in Discord's proxy.
  const [body, brand, rawLayout, ad] = await Promise.all([
    withDeadline(prepareBody(d), d),
    withDeadline(preparedBrand(), { astronautUrl: null, markUrl: null }),
    withDeadline(layoutFor(d.kind), DEFAULT_LAYOUT),
    // THE HOUSE CREATIVE IS THE FALLBACK, not an empty corner (B56.0). Applied
    // here rather than in the renderer so it goes through the same transcode a
    // brand's upload does — Satori fetches and decodes what it is handed, and
    // the one path that has been proven is `toEmbeddable`.
    withDeadline(preparedAd(d.theme.ad ?? HOUSE_AD), null),
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
