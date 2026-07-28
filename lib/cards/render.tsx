import { ImageResponse } from "next/og";
import { loadCardFonts, cardFontFamily } from "@/lib/cards/fonts";
import { toEmbeddable, withDeadline } from "@/lib/cards/img";
import { brandCardArt } from "@/lib/cards/brand";
import {
  AD_LABEL_H, DEFAULT_LAYOUT, adBox, assetBox, badgeTopFor, contentBox, opacityOf, plateBg,
  spotBox, transformOf,
} from "@/lib/cards/layout";
import type { CardAsset } from "@/lib/cards/layout";
import { layoutFor } from "@/lib/cards/layout-store";
import type {
  CardAdSlot,
  CardData, CardTheme, ProfileCard, GameStatsCard, QuestCard, CpSummaryCard,
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
function Frame({ theme, children, corner }: { theme: CardTheme; children: React.ReactNode; corner?: React.ReactNode }) {
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
      {theme.bgUrl && l.scrim ? (
        <>
          <div style={{ position: "absolute", top: 0, left: 0, width: CARD_W, height: CARD_H, display: "flex", background: "linear-gradient(90deg, rgba(4,5,26,0.94) 0%, rgba(4,5,26,0.78) 48%, rgba(4,5,26,0.46) 100%)" }} />
          <div style={{ position: "absolute", top: 0, left: 0, width: CARD_W, height: CARD_H, display: "flex", background: "linear-gradient(180deg, rgba(4,5,26,0.62) 0%, rgba(4,5,26,0.30) 38%, rgba(4,5,26,0.90) 100%)" }} />
        </>
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
            <div style={{ width: mark.width, height: mark.width, borderRadius: Math.round(mark.width * 0.17), display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`, fontSize: Math.round(mark.width * 0.55), fontWeight: 700, color: "#fff" }}>C</div>
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

function Pill({ children, color = MUTED, bg = "rgba(255,255,255,0.07)" }: { children: React.ReactNode; color?: string; bg?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 16px", borderRadius: 999, background: bg, color: safeColor(color, MUTED), fontSize: 21, fontWeight: 700 }}>
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

function Title({ text, sub, accent: a1, accent2: a2, theme }: {
  text: string; sub?: string | null; accent: string; accent2: string; theme: CardTheme;
}) {
  const [accent, accent2] = [safeColor(a1), safeColor(a2, FALLBACK_ACCENT2)];
  return (
    <Plate theme={theme} style={{ gap: 6 }}>
      <div style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.05, color: INK }}>{text}</div>
      {sub ? <div style={{ fontSize: 26, color: MUTED }}>{sub}</div> : null}
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
  const l = t.layout ?? DEFAULT_LAYOUT;
  const trophies = (d.trophies ?? []).slice(0, 5);
  const challenges = (d.challenges ?? []).slice(0, 3);
  // With a trophy shelf and live challenges below it, six account tiles no
  // longer fit. Four keeps every row full-width and readable, and the profile
  // link on the card is there for the rest.
  const accounts = d.accounts.slice(0, trophies.length || challenges.length ? 4 : 6);
  return (
    <Frame theme={t} corner={<Pill color={t.accent2} bg="rgba(0,0,0,0.45)">LV {d.level}</Pill>}>
      <Plate theme={t} style={{ gap: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <Avatar url={d.avatarUrl} ring={t.accent} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.05 }}>{d.displayName}</div>
            <div style={{ fontSize: 25, color: MUTED }}>{`clustergg.com/u/${d.slug}${d.title ? ` · ${d.title}` : ""}`}</div>
          </div>
        </div>
      </Plate>

      <div style={{ display: "flex", gap: 14, marginTop: 22 }}>
        <Pill color={t.accent2} bg="rgba(255,255,255,0.08)">{`${nf(d.totalCp)} CP`}</Pill>
        <Pill>{`${nf(d.views)} views`}</Pill>
        <Pill color="#fbbf24" bg="rgba(251,191,36,0.12)">
          <div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: "#fbbf24" }} />
          {`${nf(d.votes)} votes`}
        </Pill>
        {d.award ? <Pill color="#34d399" bg="rgba(52,211,153,0.12)">{d.award}</Pill> : null}
      </div>

      {/* The trophy shelf. A profile card without it is a stat sheet; the
          trophies are the part somebody actually screenshots. Won pieces are
          drawn at full opacity with their real art — there is no placeholder,
          because an empty shelf says the honest thing. */}
      {trophies.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 20 }}>
          <div style={{ fontSize: 17, letterSpacing: 3, color: MUTED, fontWeight: 700 }}>
            {`TROPHY CASE${d.trophyCount && d.trophyCount > trophies.length ? ` · ${nf(d.trophyCount)}` : ""}`}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
            {trophies.map((tr, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: 92 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={tr.imageUrl} alt="" width={72} height={72} style={{ width: 72, height: 72, objectFit: "contain" }} />
                <div style={{ fontSize: 15, color: MUTED }}>{clamp(tr.name, 13)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* What they're competing in right now — the one thing on this card that
          another gamer can act on. */}
      {challenges.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 18 }}>
          <div style={{ fontSize: 17, letterSpacing: 3, color: MUTED, fontWeight: 700 }}>IN THE ARENA</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {challenges.map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderRadius: 14, background: "rgba(0,0,0,0.48)", border: `1px solid ${c.live ? alpha(t.accent2, 0.45, FALLBACK_ACCENT2) : "rgba(255,255,255,0.10)"}` }}>
                {c.live ? <div style={{ display: "flex", width: 10, height: 10, borderRadius: 5, background: "#34d399" }} /> : null}
                <div style={{ fontSize: 20, fontWeight: 700 }}>{clamp(c.title, 26)}</div>
                <div style={{ fontSize: 18, color: MUTED }}>{c.place ? `#${c.place}` : `${nf(c.points)} pts`}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", marginTop: 20, gap: 10, flex: 1 }}>
        <div style={{ fontSize: 17, letterSpacing: 3, color: MUTED, fontWeight: 700 }}>LINKED ACCOUNTS</div>
        {accounts.length === 0 ? (
          <div style={{ fontSize: 26, color: MUTED }}>No games linked yet — link one to unlock quests.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {accounts.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderRadius: 18, background: "rgba(0,0,0,0.48)", border: "1px solid rgba(255,255,255,0.10)", width: 340 }}>
                {a.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.logoUrl} alt="" width={44} height={44} style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover" }} />
                ) : <div style={{ width: 44, height: 44, borderRadius: 10, display: "flex", background: alpha(t.accent, 0.2) }} />}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: 23, fontWeight: 700 }}>{clamp(a.tag, 20)}</div>
                  <div style={{ fontSize: 18, color: MUTED }}>{a.headline || a.game}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Frame>
  );
}

function GameStatsBody(d: GameStatsCard) {
  const t = d.theme;
  const champs = d.champions ?? [];
  const matches = d.matches ?? [];
  const hasRich = champs.length > 0 || matches.length > 0;
  // With champions and match history there's no room for six stat tiles, so the
  // stats compress into a single row and the game content gets the space.
  const statCount = hasRich ? 3 : 6;

  return (
    <Frame theme={t} corner={d.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={d.logoUrl} alt="" width={72} height={72} style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover" }} />
    ) : undefined}>
      {/* Identity first: the in-game name people searched for, and the human behind it. */}
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <Avatar url={d.gameAvatarUrl || d.avatarUrl} size={84} ring={t.accent} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 46, fontWeight: 700, lineHeight: 1.05 }}>{clamp(d.tag, 24)}</div>
          <div style={{ fontSize: 23, color: MUTED }}>
            {`${d.game}${d.region ? ` · ${d.region}` : ""} · ${d.displayName}${d.slug ? ` (clustergg.com/u/${d.slug})` : ""}`}
          </div>
        </div>
      </div>

      {d.live?.champion ? (
        <div style={{ display: "flex", marginTop: 14 }}>
          <Pill color="#34d399" bg="rgba(52,211,153,0.14)">
            <div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: "#34d399" }} />
            {`IN GAME · ${d.live.champion}`}
          </Pill>
        </div>
      ) : null}

      {d.stats.length === 0 && !hasRich ? (
        <div style={{ display: "flex", marginTop: 40, fontSize: 26, color: MUTED }}>
          Stats sync shortly after linking — check back in a few minutes.
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", alignContent: "flex-start", gap: 12, marginTop: 22 }}>
          {d.stats.slice(0, statCount).map((s, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, width: hasRich ? 352 : 336, padding: "14px 20px", borderRadius: 18, background: "rgba(0,0,0,0.48)", border: "1px solid rgba(255,255,255,0.10)" }}>
              <div style={{ fontSize: 17, letterSpacing: 2, color: MUTED, fontWeight: 700 }}>{clamp(s.label.toUpperCase(), 22)}</div>
              <div style={{ fontSize: 34, fontWeight: 700, color: t.accent2 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {champs.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
          <div style={{ fontSize: 17, letterSpacing: 3, color: MUTED, fontWeight: 700 }}>MOST PLAYED</div>
          <div style={{ display: "flex", gap: 12 }}>
            {champs.slice(0, 5).map((c, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 122 }}>
                {c.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.iconUrl} alt="" width={64} height={64} style={{ width: 64, height: 64, borderRadius: 32, objectFit: "cover", border: `3px solid ${alpha(t.accent, 0.53)}` }} />
                ) : (
                  <div style={{ display: "flex", width: 64, height: 64, borderRadius: 32, background: alpha(t.accent, 0.2), border: `3px solid ${alpha(t.accent, 0.53)}` }} />
                )}
                <div style={{ fontSize: 17, fontWeight: 700 }}>{clamp(c.name, 12)}</div>
                {c.points ? <div style={{ fontSize: 14, color: MUTED }}>{`${Math.round(c.points / 1000)}k`}</div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {matches.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 18, flex: 1 }}>
          <div style={{ fontSize: 17, letterSpacing: 3, color: MUTED, fontWeight: 700 }}>RECENT MATCHES</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {matches.slice(0, 4).map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 16px", borderRadius: 12, background: m.win ? "rgba(52,211,153,0.14)" : "rgba(239,68,68,0.12)", border: `1px solid ${m.win ? "rgba(52,211,153,0.35)" : "rgba(239,68,68,0.3)"}` }}>
                {m.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.iconUrl} alt="" width={34} height={34} style={{ width: 34, height: 34, borderRadius: 17, objectFit: "cover" }} />
                ) : null}
                <div style={{ fontSize: 20, fontWeight: 700, width: 62, color: m.win ? "#34d399" : "#f87171" }}>{m.win ? "WIN" : "LOSS"}</div>
                <div style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>{clamp(m.champion, 18)}</div>
                <div style={{ fontSize: 20, color: INK }}>{m.kda}</div>
                <div style={{ fontSize: 17, color: MUTED, width: 110 }}>{clamp(m.queue ?? m.when ?? "", 14)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {d.rank ? (
        <div style={{ display: "flex", marginTop: 12 }}>
          <Pill color={t.accent} bg="rgba(255,255,255,0.08)">{`#${d.rank.place} of ${nf(d.rank.total)} · ${d.rank.board}`}</Pill>
        </div>
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
      <Title text={d.questName} sub={d.displayName ? `${d.displayName}${d.tagline ? ` · ${d.tagline}` : ""}` : d.tagline} accent={t.accent} accent2={t.accent2} theme={t} />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginTop: 30 }}>
        <div style={{ fontSize: 74, fontWeight: 700, color: t.accent2, lineHeight: 1 }}>{nf(d.cp)}</div>
        <div style={{ fontSize: 27, color: MUTED, paddingBottom: 10 }}>
          {`CP${next > 0 ? ` / ${nf(next)} → ${d.nextTier ?? ""}` : " · max tier"}`}
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 18 }}><Bar pct={pct} accent={t.accent} accent2={t.accent2} h={18} /></div>
      {/* alignItems keeps the tier chips sized to their content instead of
          stretching to fill the remaining card height. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginTop: 34, flex: 1 }}>
        {d.tiers.slice(0, 5).map((tier, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: 1, padding: "18px 10px", borderRadius: 20, background: tier.earned ? alpha(t.accent, 0.12) : "rgba(0,0,0,0.42)", border: `1px solid ${tier.earned ? alpha(t.accent, 0.53) : "rgba(255,255,255,0.10)"}` }}>
            <div style={{ display: "flex", width: 22, height: 22, borderRadius: 11, background: tier.earned ? t.accent : "transparent", border: `3px solid ${tier.earned ? t.accent : "rgba(255,255,255,0.32)"}` }} />
            <div style={{ fontSize: 21, fontWeight: 700, color: tier.earned ? t.accent : MUTED }}>{tier.name}</div>
            <div style={{ fontSize: 18, color: MUTED }}>{`${nf(tier.threshold)} CP`}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function CpSummaryBody(d: CpSummaryCard) {
  const t = d.theme;
  return (
    <Frame theme={t} corner={<Pill color={t.accent2} bg="rgba(0,0,0,0.45)">LV {d.level}</Pill>}>
      <Title text={`${d.displayName}'s quests`} sub={`${nf(d.totalCp)} total Cluster Points`} accent={t.accent} accent2={t.accent2} theme={t} />
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 30, flex: 1 }}>
        {d.quests.slice(0, 4).map((q, i) => {
          const pct = q.target > 0 ? (q.cp / q.target) * 100 : 100;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: q.accent }}>{q.name}</div>
                <div style={{ fontSize: 23, color: MUTED }}>{`${nf(q.cp)} / ${nf(q.target)} CP · ${q.tier}`}</div>
              </div>
              <Bar pct={pct} accent={q.accent} accent2={t.accent2} h={14} />
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

function LeaderboardBody(d: LeaderboardCard) {
  const t = d.theme;
  const medal = ["#fbbf24", "#cbd5e1", "#b45309"];
  return (
    <Frame theme={t} corner={d.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={d.logoUrl} alt="" width={72} height={72} style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover" }} />
    ) : undefined}>
      <Title text={d.title} sub={d.subtitle} accent={t.accent} accent2={t.accent2} theme={t} />
      {d.rows.length === 0 ? (
        <div style={{ display: "flex", marginTop: 40, fontSize: 26, color: MUTED }}>
          No one has posted a score yet — link an account and you top this board.
        </div>
      ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 24, flex: 1 }}>
        {d.rows.slice(0, 8).map((r) => (
          <div key={r.rank} style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 20px", borderRadius: 14, background: r.you ? alpha(t.accent, 0.15) : "rgba(0,0,0,0.42)", border: `1px solid ${r.you ? alpha(t.accent, 0.53) : "rgba(255,255,255,0.08)"}` }}>
            <div style={{ fontSize: 27, fontWeight: 700, width: 52, color: medal[r.rank - 1] ?? MUTED }}>{`#${r.rank}`}</div>
            {r.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.avatarUrl} alt="" width={38} height={38} style={{ width: 38, height: 38, borderRadius: 19, objectFit: "cover" }} />
            ) : null}
            <div style={{ fontSize: 27, fontWeight: 700, flex: 1 }}>{`${clamp(r.name, 26)}${r.you ? " · you" : ""}`}</div>
            <div style={{ fontSize: 27, fontWeight: 700, color: t.accent2 }}>{r.value}</div>
          </div>
        ))}
      </div>
      )}
    </Frame>
  );
}

function ChallengeBody(d: ChallengeCard) {
  const t = d.theme;
  const ends = new Date(d.endsAt);
  const days = Math.max(0, Math.ceil((ends.getTime() - Date.now()) / 86400000));
  return (
    <Frame theme={t} corner={(
      // Trophies live top-RIGHT, stacked under the game logo. They used to sit
      // at the bottom of the content row, which is where the mascot stands —
      // the prize is the reason to enter and can't be the thing that collides.
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
        {d.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.logoUrl} alt="" width={64} height={64} style={{ width: 64, height: 64, borderRadius: 16, objectFit: "cover" }} />
        ) : null}
        {d.trophies.slice(0, 3).map((tr, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", fontSize: 18, fontWeight: 700, color: ["#fbbf24", "#cbd5e1", "#b45309"][tr.place - 1] ?? MUTED }}>
              {`${tr.place === 1 ? "1st" : tr.place === 2 ? "2nd" : "3rd"}${tr.value > 0 ? ` · $${nf(tr.value)}` : ""}`}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tr.imageUrl} alt="" width={76} height={76} style={{ width: 76, height: 76, objectFit: "contain" }} />
          </div>
        ))}
      </div>
    )}>
      <div style={{ display: "flex", gap: 12 }}>
        <Pill color="#34d399" bg="rgba(52,211,153,0.14)">
          <div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: "#34d399" }} />
          LIVE
        </Pill>
        {d.isPrivate ? (
          <Pill color="#fbbf24" bg="rgba(251,191,36,0.14)">
            <div style={{ display: "flex", width: 12, height: 12, borderRadius: 3, background: "#fbbf24" }} />
            {clamp(d.serverName ? `${d.serverName.toUpperCase()} · KEY TO JOIN` : "KEY TO JOIN", 30)}
          </Pill>
        ) : null}
        <Pill>{d.game}</Pill>
      </div>
      <div style={{ display: "flex", marginTop: 18 }}>
        <Title text={clamp(d.title, 44) ?? ""} sub={clamp(d.description, 92)} accent={t.accent} accent2={t.accent2} theme={t} />
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 22 }}>
        <Pill color="#fbbf24" bg="rgba(251,191,36,0.12)">{d.ended ? "FINISHED" : `${days}d left`}</Pill>
        <Pill>{`${nf(d.participants)} joined`}</Pill>
        {d.prize ? <Pill color={t.accent2} bg="rgba(255,255,255,0.08)">{clamp(d.prize, 26)}</Pill> : null}
      </div>

      {/* Timeline: the whole window, not just "5d left". People want to know if
          they're early enough to still matter. */}
      {d.startsAt ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 16 }}>
          <Bar pct={windowPct(d.startsAt, d.endsAt)} accent={t.accent} accent2={t.accent2} h={10} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, color: MUTED }}>
            <div style={{ display: "flex" }}>{dayLabel(d.startsAt)}</div>
            <div style={{ display: "flex" }}>{dayLabel(d.endsAt)}</div>
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 22, marginTop: 18, flex: 1 }}>
        {/* Standings — full width now that the trophies moved to the corner. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          <div style={{ fontSize: 16, letterSpacing: 3, color: MUTED, fontWeight: 700 }}>
            {d.ended ? "FINAL STANDINGS" : "STANDINGS"}
          </div>
          {(d.standings ?? []).length === 0 ? (
            <div style={{ display: "flex", fontSize: 21, color: MUTED }}>No one has scored yet — first mover takes the lead.</div>
          ) : (
            (d.standings ?? []).slice(0, 4).map((s) => (
              <div key={s.place} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 14px", borderRadius: 12, background: "rgba(0,0,0,0.42)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize: 20, fontWeight: 700, width: 40, color: ["#fbbf24", "#cbd5e1", "#b45309"][s.place - 1] ?? MUTED }}>{`#${s.place}`}</div>
                <div style={{ fontSize: 21, fontWeight: 700, flex: 1 }}>{clamp(s.name, 20)}</div>
                <div style={{ fontSize: 21, fontWeight: 700, color: t.accent2 }}>{`${nf(s.points)} pts`}</div>
              </div>
            ))
          )}
        </div>


      </div>
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
  const challenges = d.challenges ?? [];
  const boards = d.boards ?? [];
  return (
    <Frame theme={t} corner={d.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={d.logoUrl} alt="" width={86} height={86} style={{ width: 86, height: 86, borderRadius: 20, objectFit: "cover" }} />
    ) : undefined}>
      <Title
        text={`${d.game} Planet`}
        sub={`${nf(d.gamers)} gamer${d.gamers === 1 ? "" : "s"} here${d.serverGamers != null ? ` · ${nf(d.serverGamers)} from this server` : ""}`}
        accent={t.accent} accent2={t.accent2} theme={t}
      />

      <div style={{ display: "flex", gap: 18, marginTop: 22, flex: 1 }}>
        <Column label={`LIVE CHALLENGES · ${challenges.length}`} accent={t.accent}>
          {challenges.length === 0 ? (
            <Empty>Nothing running right now. The next one lands here first.</Empty>
          ) : challenges.slice(0, 3).map((c, i) => {
            const days = Math.max(0, Math.ceil((new Date(c.endsAt).getTime() - Date.now()) / 86400000));
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3, padding: "11px 16px", borderRadius: 14, background: "rgba(0,0,0,0.46)", border: "1px solid rgba(255,255,255,0.09)" }}>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{clamp(c.title, 30)}</div>
                {/* One text node with its own separators rather than three flex
                    children: Satori does not put the `gap` between adjacent
                    inline-ish divs here, so they render welded together
                    ("5d left2 in"). Explicit margins on the one coloured part. */}
                <div style={{ display: "flex", fontSize: 19, color: MUTED }}>
                  <div style={{ display: "flex", color: days <= 1 ? "#fda4af" : MUTED }}>
                    {`${days === 0 ? "ends today" : `${days}d left`} · ${nf(c.participants)} in`}
                  </div>
                  {/* Clamped hard: `prizeDescription` is a free-text admin field
                      and a sentence in it wraps the row onto three lines. */}
                  {c.prize ? <div style={{ display: "flex", marginLeft: 10, color: "#fbbf24" }}>{clamp(c.prize, 18)}</div> : null}
                </div>
              </div>
            );
          })}
        </Column>

        <Column label={`LEADERBOARDS · ${boards.length}`} accent={t.accent2}>
          {boards.length === 0 ? (
            <Empty>No boards on this game yet.</Empty>
          ) : boards.slice(0, 3).map((b, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3, padding: "11px 16px", borderRadius: 14, background: "rgba(0,0,0,0.46)", border: "1px solid rgba(255,255,255,0.09)" }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{clamp(b.title, 30)}</div>
              <div style={{ display: "flex", gap: 10, fontSize: 19, color: MUTED }}>
                {b.leader ? (
                  <>
                    <div style={{ display: "flex", color: "#fbbf24" }}>{`#1 ${clamp(b.leader, 16)}`}</div>
                    {b.value ? <div style={{ display: "flex", color: t.accent2 }}>{b.value}</div> : null}
                  </>
                ) : (
                  <div style={{ display: "flex" }}>unclaimed — link an account and take it</div>
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
function Column({ label, accent, children }: { label: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
      <div style={{ fontSize: 17, letterSpacing: 2.5, fontWeight: 700, color: safeColor(accent, MUTED) }}>{label}</div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", fontSize: 21, color: MUTED, lineHeight: 1.3 }}>{children}</div>;
}

// Profile of the Week.
//
// `race` is the daily post and `result` is Sunday's. They deliberately share a
// frame: a server that has watched the standings move all week should recognise
// the card that ends it, with the podium in the same place the leaders were.
function WeekBody(d: WeekCard) {
  const t = d.theme;
  const medal = ["#fbbf24", "#cbd5e1", "#d08a4a"];
  const result = d.mode === "result";
  const entries = d.entries ?? [];

  return (
    <Frame theme={t} corner={result && d.trophy?.imageUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={d.trophy.imageUrl} alt="" width={104} height={104} style={{ width: 104, height: 104, objectFit: "contain" }} />
    ) : undefined}>
      <Title text={d.title} sub={clamp(d.subtitle, 84)} accent={t.accent} accent2={t.accent2} theme={t} />

      {entries.length === 0 ? (
        <div style={{ display: "flex", marginTop: 40, fontSize: 27, color: MUTED, lineHeight: 1.3 }}>
          Nobody has a vote yet this week. Customize your profile and you are one vote from the top.
        </div>
      ) : (
        // Four rows in the race, three on the podium — that is what actually
        // fits above the pills at this canvas size. Five overlapped them, and
        // `overflow: hidden` means a future edit clips rather than collides.
        <div style={{ display: "flex", flexDirection: "column", gap: result ? 12 : 9, marginTop: 20, flex: 1, overflow: "hidden" }}>
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
              <div style={{ fontSize: result ? 34 : 27, fontWeight: 700, width: 52, color: medal[e.rank - 1] ?? MUTED }}>{`#${e.rank}`}</div>
              {e.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.avatarUrl} alt="" width={result ? 54 : 40} height={result ? 54 : 40}
                  style={{ width: result ? 54 : 40, height: result ? 54 : 40, borderRadius: 27, objectFit: "cover", border: `3px solid ${medal[e.rank - 1] ?? "rgba(255,255,255,0.2)"}` }} />
              ) : null}
              {/* Two lines only on the podium. In the race a second line per row
                  makes four rows taller than the canvas has room for, and the
                  lifetime total reads perfectly well beside the week's. */}
              {result ? (
                <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ fontSize: 31, fontWeight: 700 }}>{clamp(e.name, 24)}</div>
                  <div style={{ fontSize: 18, color: MUTED }}>{`${nf(e.lifetimeVotes)} lifetime votes`}</div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "baseline", flex: 1 }}>
                  <div style={{ display: "flex", fontSize: 26, fontWeight: 700 }}>{clamp(e.name, 22)}</div>
                  <div style={{ display: "flex", marginLeft: 12, fontSize: 17, color: MUTED }}>{`${nf(e.lifetimeVotes)} lifetime`}</div>
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
                  <div style={{ fontSize: 36, fontWeight: 700, color: medal[e.rank - 1] ?? t.accent2 }}>{nf(e.weekVotes)}</div>
                  <div style={{ fontSize: 15, letterSpacing: 1.5, color: MUTED }}>VOTES</div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "baseline" }}>
                  <div style={{ display: "flex", fontSize: 29, fontWeight: 700, color: medal[e.rank - 1] ?? t.accent2 }}>{nf(e.weekVotes)}</div>
                  <div style={{ display: "flex", marginLeft: 8, fontSize: 15, letterSpacing: 1.5, color: MUTED }}>VOTES</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
        {result && d.trophy ? (
          <Pill color="#fbbf24" bg="rgba(251,191,36,0.13)">
            {`${clamp(d.trophy.name, 26)}${d.trophy.value > 0 ? ` · $${nf(d.trophy.value)}` : ""} to all three`}
          </Pill>
        ) : (
          <>
            <Pill color={t.accent} bg={alpha(t.accent, 0.13)}>
              {d.daysLeft > 0 ? `${d.daysLeft} DAY${d.daysLeft === 1 ? "" : "S"} LEFT` : "VOTING CLOSED"}
            </Pill>
            <Pill>{`${nf(d.totalVotes)} votes cast · ${nf(d.contenders)} in the running`}</Pill>
          </>
        )}
      </div>
    </Frame>
  );
}

function PlanetsBody(d: PlanetsCard) {
  const t = d.theme;
  return (
    <Frame theme={t}>
      <Title text={d.title} sub={d.subtitle} accent={t.accent} accent2={t.accent2} theme={t} />
      <div style={{ display: "flex", flexWrap: "wrap", alignContent: "flex-start", gap: 14, marginTop: 26, flex: 1 }}>
        {d.games.slice(0, 12).map((g, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, width: 168, height: 132, borderRadius: 20, background: "rgba(0,0,0,0.45)", border: `1px solid ${g.accent ? alpha(g.accent, 0.4) : "rgba(255,255,255,0.10)"}` }}>
            {g.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={g.logoUrl} alt="" width={56} height={56} style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover" }} />
            ) : (
              <div style={{ display: "flex", width: 56, height: 56, borderRadius: 14, background: alpha(g.accent ?? t.accent, 0.27) }} />
            )}
            <div style={{ fontSize: 19, fontWeight: 700, color: g.accent ?? INK }}>{clamp(g.name, 15)}</div>
          </div>
        ))}
      </div>
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
      {d.badge ? <div style={{ display: "flex", marginBottom: 14 }}><Pill color={t.accent} bg={alpha(t.accent, 0.12)}>{d.badge}</Pill></div> : null}
      <Title text={d.title} sub={d.subtitle} accent={t.accent} accent2={t.accent2} theme={t} />
      {/* The steps FIT the card instead of being cut off at four.
          `steps.slice(0, 4)` silently threw away everything past the fourth,
          which is why the card called "Everything Cluster does" listed four of
          the things Cluster does. Up to four run down one column; five to eight
          run in two, with the type and the body budget scaled to match.
          overflow:hidden stays as the backstop so a pathological guide clips
          rather than pushing the footer off the canvas. */}
      {(() => {
        const steps = d.steps.slice(0, MAX_GUIDE_STEPS);
        const two = steps.length > 4;
        const g = GUIDE_SCALE[Math.min(steps.length, MAX_GUIDE_STEPS)] ?? GUIDE_SCALE[8];
        return (
          <div style={{
            display: "flex", flexWrap: two ? "wrap" : "nowrap", flexDirection: two ? "row" : "column",
            gap: g.gap, marginTop: two ? 18 : 24, flex: 1, overflow: "hidden", alignContent: "flex-start",
          }}>
            {steps.map((step, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 13,
                // A plain percentage, NOT calc(): Satori rejects calc() outright
                // ("Invalid value calc(50% - 10px) for setWidth") and 500s the
                // whole card. 47% leaves room for the gap between columns.
                width: two ? "47%" : "100%",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: g.num, height: g.num, borderRadius: g.num / 2, background: alpha(t.accent, 0.17), color: t.accent, fontSize: Math.round(g.num * 0.55), fontWeight: 700 }}>{i + 1}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                  <div style={{ fontSize: g.title, fontWeight: 700 }}>{clamp(step.title, two ? 26 : 46)}</div>
                  <div style={{ fontSize: g.body, color: MUTED, lineHeight: 1.3 }}>{clamp(step.body, g.room)}</div>
                </div>
              </div>
            ))}
          </div>
        );
      })()}
      {d.footer ? <div style={{ display: "flex", marginTop: 14, fontSize: 21, color: t.accent2, fontWeight: 700 }}>{d.footer}</div> : null}
    </Frame>
  );
}

// A game-world entity. The splash is the card; the lore sits on it.
//
// Text-over-art is the entire reason this is a PNG: Discord embeds cannot put
// a word on an image. So the layout leans on the scrim and keeps the copy in
// one column down the left, where the character art rarely is.
function WorldBody(d: WorldCard) {
  const t = d.theme;
  return (
    <Frame theme={t} corner={d.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={d.logoUrl} alt="" width={72} height={72} style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover" }} />
    ) : undefined}>
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <Pill color={t.accent} bg={alpha(t.accent, 0.14)}>{d.entityKind.toUpperCase()}</Pill>
        {d.role ? <Pill>{clamp(d.role, 28)}</Pill> : null}
      </div>

      <Title
        text={clamp(d.name, 28) ?? d.name}
        sub={d.skinName ? `${d.skinName} · ${d.game}` : d.game}
        accent={t.accent} accent2={t.accent2} theme={t}
      />

      {d.lore ? (
        <Plate theme={t} style={{ marginTop: 18, maxWidth: 620 }}>
          <div style={{ display: "flex", fontSize: 21, color: INK, lineHeight: 1.36 }}>{clamp(d.lore, 300)}</div>
        </Plate>
      ) : null}

      {d.abilities.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16, maxWidth: 620 }}>
          {d.abilities.slice(0, 3).map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "7px 14px", borderRadius: 12, background: "rgba(0,0,0,0.46)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ display: "flex", fontSize: 19, fontWeight: 700, color: t.accent2 }}>{clamp(a.name, 22)}</div>
              <div style={{ display: "flex", fontSize: 17, color: MUTED }}>{clamp(a.desc, 62)}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
        {d.meta.slice(0, 3).map((m, i) => (
          <Pill key={i}>{`${m.label}: ${clamp(m.value, 18)}`}</Pill>
        ))}
        {d.skinCount > 0 ? (
          <Pill color={t.accent} bg={alpha(t.accent, 0.13)}>
            {`${d.skinCount} skin${d.skinCount === 1 ? "" : "s"} — tap below`}
          </Pill>
        ) : null}
      </div>
    </Frame>
  );
}

// "Did you mean…". Only drawn when a query genuinely matched more than one
// thing — one hit renders that hit, and none says so in words.
function SearchBody(d: SearchCard) {
  const t = d.theme;
  return (
    <Frame theme={t}>
      <Title
        text={`"${clamp(d.query, 24) ?? d.query}"`}
        sub={`${d.results.length} matches — pick one below`}
        accent={t.accent} accent2={t.accent2} theme={t}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 22, flex: 1, overflow: "hidden" }}>
        {d.results.slice(0, 6).map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 18px", borderRadius: 14, background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {r.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.imageUrl} alt="" width={38} height={38} style={{ width: 38, height: 38, borderRadius: 10, objectFit: "cover" }} />
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ fontSize: 25, fontWeight: 700 }}>{clamp(r.label, 34)}</div>
              <div style={{ fontSize: 17, color: MUTED }}>{clamp(r.sub, 52)}</div>
            </div>
            <Pill color={t.accent2} bg={alpha(t.accent2, 0.12, "#22d3ee")}>{r.kind.toUpperCase()}</Pill>
          </div>
        ))}
      </div>
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
  const layout = await withDeadline(withAssets(rawLayout), { ...rawLayout, assets: [] });
  // Colours are normalised here, once, on the way in — so every card body can
  // use `theme.accent` directly and no unparseable value ever reaches Satori.
  return { ...body, theme: safeTheme({ ...body.theme, ...brand, layout, ad }) } as CardData;
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

async function withAssets(l: typeof DEFAULT_LAYOUT): Promise<typeof DEFAULT_LAYOUT> {
  const list = l.assets ?? [];
  if (!list.length) return l;
  const urls = await Promise.all(
    // Asked for at twice the drawn width for crispness — no point decoding a
    // 4000px globe to paint it at 240 on a 1200px canvas.
    list.map((a) => toEmbeddable(a.url, { maxWidth: Math.min(1600, Math.round(a.w * 2)) })),
  );
  return { ...l, assets: list.map((a, i) => ({ ...a, url: urls[i] ?? "" })).filter((a) => a.url) };
}

async function prepareBody(d: CardData): Promise<CardData> {
  const bg = resolveBackground(d.theme);

  switch (d.kind) {
    case "profile": {
      // Only the trophies the card can actually show are fetched — decoding a
      // shelf of forty to draw five is time this render doesn't have.
      const shelf = (d.trophies ?? []).slice(0, 5);
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
      const [bgUrl, logoUrl] = await Promise.all([bg, toEmbeddable(d.logoUrl, ICON)]);
      return { ...d, logoUrl, theme: { ...d.theme, bgUrl } };
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
