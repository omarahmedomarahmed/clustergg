"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { saveCardLayout, resetCardLayout, type CardActionState } from "@/app/actions/cards";
import ImageUpload from "@/components/ImageUpload";
import {
  DEFAULT_LAYOUT, BG_SOURCES, AD_RATIO, assetBox, badgeTopFor, partBoxes,
  type CardLayout, type CardAsset, type ContentBox, type PartStyle, type Spot,
} from "@/lib/cards/layout";
import type { LibraryGroup } from "@/lib/cards/asset-library";
import type { CardPart } from "@/lib/cards/layout-guide";
import type { CardSample } from "@/lib/cards/preview";
import type { CardData } from "@/lib/cards/types";
import { partContent } from "@/lib/cards/part-content";

// Drag the furniture on a rendered card.
//
// The canvas is the real 1200x630 at whatever width the page gives it, with the
// card's actual background art behind it and the real mascot and logo as the
// handles — so what you drag is what renders. Positions are stored as
// percentages, which is why the editor can be any size and still agree with the
// renderer to the pixel.
//
// The preview below is the genuine PNG from the renderer. It updates on save
// rather than on every drag: re-rendering a 1200x630 image sixty times a second
// would be a very expensive way to draw a rectangle.

export type EditorArt = {
  bgUrl: string | null;
  astronautUrl: string | null;
  markUrl: string | null;
};

// `asset:<id>` is a handle too — one pointer path for everything on the canvas.
type Handle = "mascot" | "mark" | "badge" | "ad" | "content" | `asset:${string}` | `part:${string}`;

const ASPECT = 1200 / 630;

export default function CardLayoutEditor({ kind, name, initial, art, parts = [], previewUrl, library = [], samples = [], regions = [] }: {
  kind: string;
  name: string;
  initial: CardLayout;
  art: EditorArt;
  /** The content sections this card kind draws, from its guide. */
  parts?: CardPart[];
  /** Live render of this card kind, re-fetched after a save. */
  previewUrl: string;
  /** Platform images offered in the "place an image" picker. */
  library?: LibraryGroup[];
  /** Real cards of this kind, to check the layout against varied art. */
  samples?: CardSample[];
  /** Where each section is drawn — the card guide's own geometry. */
  regions?: { key: string; x: number; y: number; w: number; h: number }[];
}) {
  const [l, setL] = useState<CardLayout>(initial);
  // Which real card the preview is showing. A layout is tuned against art, and
  // one fixture only ever proves the layout works on that fixture.
  const [sample, setSample] = useState<CardSample | null>(samples[0] ?? null);
  const [drag, setDrag] = useState<Handle | null>(null);
  const [nonce, setNonce] = useState(0);
  const canvas = useRef<HTMLDivElement>(null);

  const [saveState, save, saving] = useActionState<CardActionState, FormData>(
    async (prev, fd) => {
      const res = await saveCardLayout(prev, fd);
      // The PNG behind this editor is cached by URL; a new query string is the
      // only thing that makes the browser fetch the freshly rendered one.
      if (res?.ok) setNonce((n) => n + 1);
      return res;
    },
    undefined,
  );
  const [resetState, reset, resetting] = useActionState<CardActionState, FormData>(
    async (prev, fd) => {
      const res = await resetCardLayout(prev, fd);
      if (res?.ok) { setL(DEFAULT_LAYOUT); setNonce((n) => n + 1); }
      return res;
    },
    undefined,
  );

  // ===== Placed images =====
  //
  // A card is not just its furniture. An admin wants the champion's splash on
  // the right, a game logo in the corner, a globe bleeding off the edge — art
  // that isn't the background and isn't dimmed with it. Each placed image
  // carries its own opacity, so one can sit at full strength while the backdrop
  // behind it stays veiled.
  const [sel, setSel] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const assets = l.assets ?? [];
  const active = assets.find((a) => a.id === sel) ?? null;

  const addAsset = (url: string) => {
    if (!url) return;
    const id = `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    setL((c) => ({
      ...c,
      assets: [...(c.assets ?? []), { id, url, x: 60, y: 20, w: 28, ratio: 1, opacity: 100, front: true }],
    }));
    setSel(id);
    setPicking(false);
  };
  const patchAsset = (id: string, patch: Partial<CardAsset>) =>
    setL((c) => ({ ...c, assets: (c.assets ?? []).map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const dropAsset = (id: string) => {
    setL((c) => ({ ...c, assets: (c.assets ?? []).filter((a) => a.id !== id) }));
    setSel(null);
  };

  // ===== Content sections =====
  //
  // The furniture was always draggable and the CONTENT never was — "the trophy
  // case is in the way" had no answer short of a deploy. Each section a card
  // draws is now a row here: turn it off, fade it, resize its type, and where
  // the section has fixed copy of its own, rewrite it.
  const [openPart, setOpenPart] = useState<string | null>(null);

  // The card, as data.
  //
  // The canvas draws each section as its own box, and a box labelled
  // "Standings" with nothing in it is a diagram — arranging diagrams is not
  // designing. So the editor asks the card API for the same object the renderer
  // is about to draw and fills every box with what it will really say.
  const [cardData, setCardData] = useState<CardData | null>(null);
  useEffect(() => {
    let alive = true;
    const url = sampleUrl(previewUrl, sample, nonce).replace("?", "?json=1&");
    fetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setCardData(j); })
      .catch(() => { if (alive) setCardData(null); });
    return () => { alive = false; };
  }, [previewUrl, sample, nonce]);
  const partOf = (key: string): PartStyle => l.parts?.[key] ?? {};
  // Where every section is drawn.
  //
  // Computed rather than looked up: `regions` and `parts` are different lists
  // with only some keys in common, so joining them by key drew boxes for two of
  // a profile's five sections and silently dropped the rest.
  const boxes = useMemo(() => partBoxes(l, parts, regions), [l, parts, regions]);
  const regionFor = (key: string) => boxes[key] ?? null;
  const patchPart = (key: string, patch: Partial<PartStyle>) =>
    setL((c) => ({ ...c, parts: { ...(c.parts ?? {}), [key]: { ...(c.parts?.[key] ?? {}), ...patch } } }));

  const setSpot = (key: "mascot" | "mark" | "badge" | "ad", patch: Partial<Spot>) =>
    setL((cur) => ({ ...cur, [key]: { ...cur[key], ...patch } }));
  const setContent = (patch: Partial<ContentBox>) =>
    setL((cur) => ({ ...cur, content: { ...cur.content, ...patch } }));

  // One pointer handler for every handle. Percentages come straight off the
  // canvas rect, so it works at any zoom and on touch.
  const onMove = useCallback((e: React.PointerEvent) => {
    if (!drag || !canvas.current) return;
    const r = canvas.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
    if (drag === "content") {
      setL((cur) => ({ ...cur, content: { ...cur.content, x: round(x), y: round(y) } }));
    } else if (drag.startsWith("part:")) {
      // A section is nudged, not placed: the offset is measured from where the
      // flow put it, so it composes with the column instead of replacing it.
      const key = drag.slice(5);
      const geo = boxes[key];
      if (geo) {
        setL((cur) => ({
          ...cur,
          parts: {
            ...(cur.parts ?? {}),
            [key]: {
              ...(cur.parts?.[key] ?? {}),
              dx: Math.round(((x - geo.x) / 100) * 1200),
              dy: Math.round(((y - geo.y) / 100) * 630),
            },
          },
        }));
      }
    } else if (drag.startsWith("asset:")) {
      const id = drag.slice(6);
      setL((cur) => ({
        ...cur,
        assets: (cur.assets ?? []).map((a) => (a.id === id ? { ...a, x: round(x), y: round(y) } : a)),
      }));
    } else {
      setL((cur) => ({ ...cur, [drag]: { ...cur[drag as "mascot"], x: round(x), y: round(y) } }));
    }
  }, [drag]);

  const stop = () => setDrag(null);
  const state = saveState ?? resetState;

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
        {/* ===== The canvas ===== */}
        <div>
          <div
            ref={canvas}
            onPointerMove={onMove}
            onPointerUp={stop}
            onPointerLeave={stop}
            className="relative w-full select-none overflow-hidden rounded-xl border border-white/15 bg-[#04051a] touch-none"
            style={{ aspectRatio: `${ASPECT}` }}
          >
            {art.bgUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={art.bgUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            )}
            {/* Exactly the overlays the renderer draws, in the same order, so
                the editor is not a diagram of the card — it is the card. */}
            <div className="absolute inset-0" style={{ background: `rgba(4,5,26,${l.dim / 100})` }} />
            {art.bgUrl && l.dim > 0 && (() => {
              // Same maths as the renderer. One slider drives the flat veil AND
              // the two directional scrims, so dragging it to 0 really does
              // show the artwork — which is what an overlay control has to do
              // to be worth having.
              const k = Math.min(1.4, l.dim / 62);
              const g = (a: number) => `rgba(4,5,26,${(a * k).toFixed(3)})`;
              return (
                <>
                  <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${g(0.94)} 0%, ${g(0.78)} 48%, ${g(0.46)} 100%)` }} />
                  <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${g(0.62)} 0%, ${g(0.30)} 38%, ${g(0.90)} 100%)` }} />
                </>
              );
            })()}
            {l.bar && <div className="absolute inset-x-0 top-0 h-[1.3%] bg-sky-500" />}

            {/* Placed images, at their real box and their own opacity — the
                renderer draws them exactly here. Click one to select it; drag
                once selected. */}
            {assets.map((a) => {
              const box = assetBox(a);
              const tf = [
                a.rotate ? `rotate(${a.rotate}deg)` : "",
                a.flipX || a.flipY ? `scale(${a.flipX ? -1 : 1}, ${a.flipY ? -1 : 1})` : "",
              ].filter(Boolean).join(" ");
              return (
                <button
                  key={a.id} type="button"
                  onPointerDown={(e) => { e.preventDefault(); setSel(a.id); setDrag(`asset:${a.id}`); }}
                  className={`absolute cursor-move ${a.id === sel ? "outline outline-1 outline-cyan-400" : ""}`}
                  style={{ ...box, opacity: a.opacity / 100, transform: tf || undefined }}
                  title="Drag to move"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt="" className="h-full w-full object-contain pointer-events-none" />
                </button>
              );
            })}

            {/* The content box: drag by its corner tag, resize with the number
                fields. Shown as an outline because its contents change per card. */}
            <Box
              label="Content"
              x={l.content.x} y={l.content.y} w={l.content.w} h={l.content.h}
              active={drag === "content"}
              onGrab={() => setDrag("content")}
            />

            {/* Every section of the card, where it is drawn, saying what it
                will really say. The guide gives each one its home geometry;
                the admin's nudge moves it from there. Click to select — the
                controls on the right jump to the same section — and drag to
                move. Sections with nothing in them for THIS sample are drawn
                faint and labelled, because "empty here" and "I forgot to map
                it" look identical otherwise. */}
            {parts.map((pt) => {
              const geo = regionFor(pt.key);
              if (!geo) return null;
              const st = partOf(pt.key);
              if (st.hidden) return null;
              const content = cardData ? partContent(cardData, pt.key) : { lines: [], images: [], empty: true };
              const on = openPart === pt.key;
              return (
                <button
                  key={pt.key}
                  type="button"
                  onPointerDown={(e) => { e.preventDefault(); setOpenPart(pt.key); setDrag(`part:${pt.key}`); }}
                  data-part={pt.key}
                  title={`${pt.label} — drag to nudge`}
                  className={`absolute cursor-move overflow-hidden rounded-md border text-left transition ${
                    on ? "border-cyan-400 bg-cyan-400/10" : "border-white/25 border-dashed bg-black/20 hover:border-white/50"
                  }`}
                  style={{
                    left: `${geo.x}%`,
                    top: `${geo.y}%`,
                    width: `${st.w ?? geo.w}%`,
                    height: `${geo.h}%`,
                    // The nudge, in canvas pixels — converted to % so the box
                    // moves by the same amount the renderer will move it.
                    marginLeft: `${((st.dx ?? 0) / 1200) * 100}%`,
                    marginTop: `${((st.dy ?? 0) / 630) * 100}%`,
                    opacity: (st.opacity ?? 100) / 100,
                  }}
                >
                  <span className={`block px-1 pt-0.5 text-[8px] font-bold uppercase tracking-wider ${on ? "text-cyan-200" : "text-white/55"}`}>
                    {pt.label}
                  </span>
                  {content.empty ? (
                    <span className="block px-1 text-[8px] italic text-white/35">nothing on this card</span>
                  ) : (
                    <span className="block px-1 leading-tight" style={{ fontSize: `${8 * (st.scale ?? 1)}px` }}>
                      {content.lines.slice(0, 4).map((line, i) => (
                        <span key={i} className="block truncate text-white/85">{st.text && i === 0 ? st.text : line}</span>
                      ))}
                    </span>
                  )}
                  {content.images.length > 0 && (
                    <span className="mt-0.5 flex gap-0.5 px-1">
                      {content.images.slice(0, 4).map((src, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={src} alt="" className="h-3 w-3 rounded object-cover" />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}

            {!l.mascot.hidden && (
              <Grab
                label="Mascot"
                spot={l.mascot}
                active={drag === "mascot"}
                onGrab={() => setDrag("mascot")}
                img={art.astronautUrl}
                tint="rgba(139,92,246,0.35)"
              />
            )}
            {!l.badge.hidden && (
              <Grab
                label="Badge"
                spot={l.badge}
                // Shown where the renderer will actually draw it: with an ad
                // box in the corner the badge is pushed below it, and an editor
                // that ignored that would be lying about the card.
                centerY={((badgeTopFor(l, true, 1) + l.badge.size / 2) / 630) * 100}
                active={drag === "badge"}
                onGrab={() => setDrag("badge")}
                img={null}
                tint="rgba(251,191,36,0.35)"
              />
            )}
            {!l.ad.hidden && (
              <Grab
                label="Sponsor"
                spot={l.ad}
                ratio={AD_RATIO}
                active={drag === "ad"}
                onGrab={() => setDrag("ad")}
                img={null}
                tint="rgba(167,139,250,0.42)"
              />
            )}
            {!l.mark.hidden && (
              <Grab
                label="Logo"
                spot={l.mark}
                active={drag === "mark"}
                onGrab={() => setDrag("mark")}
                img={art.markUrl}
                tint="rgba(34,211,238,0.35)"
              />
            )}
          </div>
          <p className="text-[11px] text-muted mt-2">
            Drag any handle. The mascot and logo are the real art at their real size — what you see
            here is where the renderer will put them.
          </p>
        </div>

        {/* ===== The numbers ===== */}
        <form action={save} className="space-y-4">
          <input type="hidden" name="kind" value={kind} />
          {/* Lists travel as JSON — see `readLayout` in app/actions/cards.ts,
              which validates them through the same parser the renderer uses. */}
          <input type="hidden" name="assets" value={JSON.stringify(l.assets ?? [])} />
          <input type="hidden" name="parts" value={JSON.stringify(l.parts ?? {})} />
          <input type="hidden" name="bgSources" value={JSON.stringify(l.bgSources ?? [])} />

          <SpotFields label="Mascot" prefix="mascot" spot={l.mascot} onChange={(p) => setSpot("mascot", p)} />
          <SpotFields label="Logo" prefix="mark" spot={l.mark} onChange={(p) => setSpot("mark", p)} />
          <SpotFields label="Top-right badge" prefix="badge" spot={l.badge} onChange={(p) => setSpot("badge", p)} />
          <SpotFields
            label="Sponsor box"
            prefix="ad"
            spot={l.ad}
            onChange={(p) => setSpot("ad", p)}
            hint="A brand's creative, drawn on every render of this card. Size is the box WIDTH — the height follows the 640×200 creative. Hiding it takes this card kind out of the ad rotation."
          />

          {/* ===== What this card actually says ===== */}
          {parts.length > 0 && (
            <fieldset className="rounded-xl border border-white/10 p-3 space-y-1.5">
              <legend className="px-1.5 text-[11px] uppercase tracking-widest text-muted">
                Sections on this card
              </legend>
              <p className="text-[11px] text-muted leading-snug pb-1">
                Every block this card draws, in the order it draws them. Turn one off and the space
                goes to what&apos;s below it. Sections with their own wording can be rewritten —
                the live numbers underneath never can.
              </p>
              {parts.map((sec) => {
                const st = partOf(sec.key);
                const open = openPart === sec.key;
                const edited = st.hidden || (st.scale ?? 1) !== 1 || (st.opacity ?? 100) !== 100 || !!st.text;
                return (
                  <div key={sec.key} className={`rounded-lg border ${open ? "border-cyan-400/50 bg-black/30" : "border-white/10"}`}>
                    <div className="flex items-center gap-2 px-2.5 py-2">
                      <input
                        type="checkbox" checked={!st.hidden} className="accent-cyan-500 shrink-0"
                        title={st.hidden ? "Hidden — tick to draw it" : "Drawn — untick to hide it"}
                        onChange={(e) => patchPart(sec.key, { hidden: !e.target.checked })}
                      />
                      <button
                        type="button" onClick={() => setOpenPart(open ? null : sec.key)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <span className={`text-xs font-semibold ${st.hidden ? "text-muted line-through" : "text-ink"}`}>
                          {sec.label}
                        </span>
                        {edited && <span className="ml-1.5 text-[9px] uppercase tracking-wider text-cyan-300">edited</span>}
                      </button>
                      <Icon name={open ? "minus" : "edit"} size={12} />
                    </div>
                    {open && (
                      <div className="border-t border-white/10 px-2.5 py-2.5 space-y-2.5">
                        <p className="text-[10px] leading-snug text-muted">{sec.note}</p>
                        <Slider
                          name="" label="Text size" value={Math.round((st.scale ?? 1) * 100)} min={50} max={200} suffix="%"
                          onChange={(v) => patchPart(sec.key, { scale: v / 100 })}
                        />
                        <Slider
                          name="" label="Opacity" value={Math.round(st.opacity ?? 100)} min={10} max={100} suffix="%"
                          onChange={(v) => patchPart(sec.key, { opacity: v })}
                        />
                        {sec.text !== undefined && (
                          <label className="block">
                            <span className="mb-1 block text-[10px] text-muted">Its wording</span>
                            <input
                              type="text" value={st.text ?? "" } placeholder={sec.text} maxLength={160}
                              onChange={(e) => patchPart(sec.key, { text: e.target.value })}
                              className="input-cosmic w-full px-2 py-1 text-xs"
                            />
                            <span className="mt-1 block text-[10px] text-muted">
                              Empty keeps “{sec.text}”.
                            </span>
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </fieldset>
          )}

          <fieldset className="rounded-xl border border-white/10 p-3">
            <legend className="px-1.5 text-[11px] uppercase tracking-widest text-muted">Content box</legend>
            <div className="grid grid-cols-2 gap-2">
              <Num name="content.x" label="Left %" value={l.content.x} onChange={(v) => setContent({ x: v })} />
              <Num name="content.y" label="Top %" value={l.content.y} onChange={(v) => setContent({ y: v })} />
              <Num name="content.w" label="Width %" value={l.content.w} onChange={(v) => setContent({ w: v })} />
              <Num name="content.h" label="Height %" value={l.content.h} onChange={(v) => setContent({ h: v })} />
            </div>
          </fieldset>

          <fieldset className="rounded-xl border border-white/10 p-3 space-y-3">
            <legend className="px-1.5 text-[11px] uppercase tracking-widest text-muted">Background &amp; plates</legend>
            <Slider
              name="dim" label="Dark overlay on the art" value={l.dim} min={0} max={100} suffix="%"
              hint="The only darkening control. Drives the flat veil AND the directional shading down the left column and along the bottom — set it to 0 and you see the artwork exactly as it was drawn."
              onChange={(v) => setL((c) => ({ ...c, dim: v }))}
            />
            <Slider
              name="plate" label="Dark plate behind text" value={l.plate} min={0} max={100} suffix="%"
              hint="A local dark panel under headlines, so a bright patch of art can't eat a line. Only drawn when the card has background art."
              onChange={(v) => setL((c) => ({ ...c, plate: v }))}
            />
            <Slider
              name="plateRadius" label="Plate corner radius" value={l.plateRadius} min={0} max={60} suffix="px"
              onChange={(v) => setL((c) => ({ ...c, plateRadius: v }))}
            />
            <Check name="bar" label="Top accent bar" checked={l.bar} onChange={(v) => setL((c) => ({ ...c, bar: v }))} />
            <Check name="glows" label="Corner glow circles" checked={l.glows} hint="Two large accent discs bleeding off opposite corners. Off by default — they read as grey smudges over real art." onChange={(v) => setL((c) => ({ ...c, glows: v }))} />
          </fieldset>

          {/* ===== Placed images ===== */}
          <fieldset className="rounded-xl border border-white/10 p-3 space-y-3">
            <legend className="px-1.5 text-[11px] uppercase tracking-widest text-muted">Placed images</legend>

            {assets.length === 0 && (
              <p className="text-[11px] text-muted leading-snug">
                Nothing placed yet. Add a globe, a game logo, a trophy, a champion splash — anything
                already on the platform, or your own upload. Placed images are drawn over the
                background and keep their own opacity, so they don&apos;t get dimmed with it.
              </p>
            )}

            {assets.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {assets.map((a) => (
                  <button
                    key={a.id} type="button" onClick={() => setSel(a.id === sel ? null : a.id)}
                    className={`h-11 w-11 rounded-lg overflow-hidden border transition-all ${
                      a.id === sel ? "border-cyan-400 ring-1 ring-cyan-400/60" : "border-white/15 opacity-70 hover:opacity-100"
                    }`}
                    title="Select to edit"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {active && (
              <div className="rounded-lg bg-black/30 border border-white/10 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wider text-cyan-300">Selected image</span>
                  <button type="button" onClick={() => dropAsset(active.id)} className="text-[11px] text-rose-300 hover:underline">
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Num name="" label="Left %" value={Math.round(active.x)} onChange={(v) => patchAsset(active.id, { x: v })} />
                  <Num name="" label="Top %" value={Math.round(active.y)} onChange={(v) => patchAsset(active.id, { y: v })} />
                </div>
                <Slider name="" label="Width" value={Math.round(active.w)} min={2} max={100} suffix="%"
                  onChange={(v) => patchAsset(active.id, { w: v })} />
                <Slider name="" label="Height ratio" value={Math.round(active.ratio * 100)} min={20} max={400} suffix="%"
                  hint="Height as a share of the width. 100% is square."
                  onChange={(v) => patchAsset(active.id, { ratio: v / 100 })} />
                <Slider name="" label="Opacity" value={Math.round(active.opacity)} min={5} max={100} suffix="%"
                  hint="Its own — a placed image is never dimmed with the background."
                  onChange={(v) => patchAsset(active.id, { opacity: v })} />
                <Slider name="" label="Rotation" value={Math.round(active.rotate ?? 0)} min={-180} max={180} suffix="°"
                  onChange={(v) => patchAsset(active.id, { rotate: v })} />
                <div className="flex flex-wrap gap-3 pt-1">
                  <Check name="" label="Flip horizontally" checked={!!active.flipX} onChange={(v) => patchAsset(active.id, { flipX: v })} />
                  <Check name="" label="Flip vertically" checked={!!active.flipY} onChange={(v) => patchAsset(active.id, { flipY: v })} />
                  <Check name="" label="In front of the text" checked={active.front !== false}
                    hint="Off puts it behind the content, over the background."
                    onChange={(v) => patchAsset(active.id, { front: v })} />
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setPicking((p) => !p)} className="ghost-btn pressable rounded-full px-4 py-1.5 text-xs">
                {picking ? "Close library" : "Add an image"}
              </button>
            </div>

            {picking && (
              <div className="rounded-lg bg-black/30 border border-white/10 p-3 max-h-80 overflow-y-auto space-y-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted mb-1.5">Upload your own</div>
                  <ImageUpload name="" label="" aspect="1/1" maxDim={1024} scope="cards"
                    onChange={(url) => url && addAsset(url)} />
                </div>
                {library.map((g) => (
                  <div key={g.key}>
                    <div className="text-[11px] uppercase tracking-wider text-muted">{g.label}</div>
                    <div className="text-[10px] text-muted/70 mb-1.5">{g.note}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {g.images.map((img) => (
                        <button
                          key={img.url + img.label} type="button" onClick={() => addAsset(img.url)}
                          title={img.label}
                          className="h-12 w-12 rounded-lg overflow-hidden border border-white/15 hover:border-cyan-400 transition-colors"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.url} alt={img.label} className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </fieldset>

          {/* ===== Where the background comes from ===== */}
          <fieldset className="rounded-xl border border-white/10 p-3">
            <legend className="px-1.5 text-[11px] uppercase tracking-widest text-muted">Background source order</legend>
            <p className="text-[11px] text-muted leading-snug mb-2">
              The renderer walks this list and uses the first one that has art. Untick a source to skip it.
              {(l.bgSources ?? []).length === 0 && (
                <>
                  {" "}
                  <b className="text-amber-300">Nothing ticked means the built-in order is in use</b> — every
                  source, in the order below. Tick some to override it.
                </>
              )}
            </p>
            <div className="space-y-1.5">
              {BG_SOURCES.map((src) => {
                const on = (l.bgSources ?? []).includes(src.id);
                return (
                  <label key={src.id} className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox" checked={on} className="accent-cyan-500 mt-0.5"
                      onChange={(e) => setL((c) => ({
                        ...c,
                        bgSources: e.target.checked
                          ? [...(c.bgSources ?? []), src.id]
                          : (c.bgSources ?? []).filter((x) => x !== src.id),
                      }))}
                    />
                    <span>
                      <b className="text-ink">{src.label}</b>
                      <span className="text-muted"> — {src.note}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <button disabled={saving} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-bold disabled:opacity-60">
              {saving ? "Saving…" : "Save layout"}
            </button>
          </div>
          {state?.ok && <p className="text-sm text-emerald-300 inline-flex items-center gap-1.5"><Icon name="check" size={13} /> {state.ok}</p>}
          {state?.error && <p className="text-sm text-amber-300">{state.error}</p>}
        </form>
      </div>

      {/* ===== The real thing ===== */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="text-[11px] uppercase tracking-widest text-muted">Rendered {name.toLowerCase()} card</div>
          <div className="flex items-center gap-2">
            {/* Look at it before committing to it.
                The preview is a real 1200x630 render, so it cannot follow every
                drag — it used to update only on save, which meant the only way
                to see a change was to ship it. This re-renders on demand with
                the CURRENT unsaved layout. */}
            <button
              type="button" onClick={() => setNonce((n) => n + 1)}
              className="ghost-btn pressable inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold"
              title="Re-render the card with what's on the canvas right now"
            >
              <Icon name="spark" size={12} /> Refresh view
            </button>
            <form action={reset}>
              <input type="hidden" name="kind" value={kind} />
              <button disabled={resetting} className="ghost-btn pressable rounded-full px-4 py-1.5 text-xs disabled:opacity-60">
                {resetting ? "Resetting…" : "Reset to default"}
              </button>
            </form>
          </div>
        </div>

        {/* Which card. Deliberately spans art-heavy and art-less samples: a
            layout that only works over a dark space wallpaper is a layout that
            breaks the first time somebody uploads a white splash. */}
        {samples.length > 1 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {samples.map((sm) => (
              <button
                key={sm.id} type="button"
                onClick={() => { setSample(sm); setNonce((n) => n + 1); }}
                title={sm.note}
                className={`rounded-full border px-3 py-1.5 text-[11px] transition ${
                  sample?.id === sm.id
                    ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-100"
                    : "border-white/12 bg-black/25 text-muted hover:border-white/30"
                }`}
              >
                <b className="font-semibold">{sm.label}</b>
                <span className="ml-1.5 opacity-70">{sm.note}</span>
              </button>
            ))}
          </div>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={`${sample?.id ?? "default"}-${nonce}`}
          src={sampleUrl(previewUrl, sample, nonce)}
          alt=""
          className="w-full rounded-xl border border-white/10 bg-black/40"
          style={{ aspectRatio: `${ASPECT}` }}
        />
      </div>
    </div>
  );
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * The preview URL for one sample.
 *
 * `v` busts the browser cache — a rendered card is served from a content-hashed
 * Blob URL, so without it the img element happily shows the version from before
 * the edit and the editor appears to do nothing.
 */
function sampleUrl(base: string, sample: CardSample | null, nonce: number): string {
  const u = new URL(base, "http://x");
  for (const [k, v] of Object.entries(sample?.params ?? {})) u.searchParams.set(k, v);
  u.searchParams.set("v", String(nonce));
  return `${u.pathname}?${u.searchParams.toString()}`;
}

// ===== Canvas pieces =====

function Grab({ label, spot, active, onGrab, img, tint, ratio = 1, centerY }: {
  label: string; spot: Spot; active: boolean; onGrab: () => void; img: string | null; tint: string;
  /** height / width of this element's art. The ad box is a banner, not a square. */
  ratio?: number;
  /** Overrides the spot's own Y — used for the badge, which the renderer pushes
   *  below the ad box. The editor has to show where it ACTUALLY lands. */
  centerY?: number;
}) {
  // Size is in canvas pixels; the canvas is 1200 wide however many CSS pixels
  // it occupies, so a percentage width keeps the handle to scale.
  const w = (spot.size / 1200) * 100;
  const h = ((spot.size * ratio) / 630) * 100;
  return (
    <div
      onPointerDown={(e) => { e.preventDefault(); onGrab(); }}
      title={`${label} — drag to move`}
      className={`absolute grid cursor-grab place-items-center rounded-lg border-2 active:cursor-grabbing ${
        active ? "border-cyan-300" : "border-white/45 hover:border-white/80"
      }`}
      style={{
        left: `${spot.x}%`, top: `${centerY ?? spot.y}%`, width: `${w}%`, height: `${h}%`,
        transform: "translate(-50%, -50%)",
        background: img ? "transparent" : tint,
      }}
    >
      {img ? (
        // Drawn at the opacity it will actually render at. The border and the
        // label stay solid so a faded mark is still findable and draggable —
        // fading the handle along with the art would make a watermark
        // impossible to grab.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={img} alt=""
          className="pointer-events-none h-full w-full object-contain"
          style={{ opacity: (spot.opacity ?? 100) / 100 }}
        />
      ) : null}
      <span className="pointer-events-none absolute -top-5 left-0 whitespace-nowrap rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold">
        {label}
      </span>
    </div>
  );
}

function Box({ label, x, y, w, h, active, onGrab }: {
  label: string; x: number; y: number; w: number; h: number; active: boolean; onGrab: () => void;
}) {
  return (
    <div
      className={`absolute rounded border-2 border-dashed ${active ? "border-cyan-300 bg-cyan-400/10" : "border-cyan-400/45"}`}
      style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }}
    >
      <span
        onPointerDown={(e) => { e.preventDefault(); onGrab(); }}
        className="absolute -top-0.5 left-0 cursor-grab rounded-br bg-cyan-400/25 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-100 active:cursor-grabbing"
      >
        {label}
      </span>
    </div>
  );
}

// ===== Form pieces =====

function SpotFields({ label, prefix, spot, onChange, hint }: {
  label: string; prefix: string; spot: Spot; onChange: (patch: Partial<Spot>) => void; hint?: string;
}) {
  return (
    <fieldset className="rounded-xl border border-white/10 p-3">
      <legend className="px-1.5 text-[11px] uppercase tracking-widest text-muted">{label}</legend>
      {hint && <p className="mb-2 text-[10px] leading-snug text-muted">{hint}</p>}
      <div className="grid grid-cols-3 gap-2">
        <Num name={`${prefix}.x`} label="X %" value={spot.x} onChange={(v) => onChange({ x: v })} />
        <Num name={`${prefix}.y`} label="Y %" value={spot.y} onChange={(v) => onChange({ y: v })} />
        <Num name={`${prefix}.size`} label="Size px" value={spot.size} onChange={(v) => onChange({ size: v })} />
      </div>
      {/* Opacity, so art can sit UNDER the card rather than compete with it.
          The layout could already fade a placed image and could not fade the
          two pieces of furniture that are on every single card — so the only
          way to stop a 250px logo fighting a headline was to hide it, which
          also removes the branding these cards exist to carry. */}
      <Slider
        name={`${prefix}.opacity`} label="Opacity" value={Math.round(spot.opacity ?? 100)}
        min={5} max={100} suffix="%"
        hint="Below about 40% it reads as a watermark behind the content — which is usually what you want from a mark this size."
        onChange={(v) => onChange({ opacity: v })}
      />
      <label className="mt-2 flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox" name={`${prefix}.hidden`} checked={spot.hidden ?? false}
          onChange={(e) => onChange({ hidden: e.target.checked })}
          className="accent-violet-500"
        />
        Hide on this card
      </label>
    </fieldset>
  );
}

function Num({ name, label, value, onChange }: {
  name: string; label: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] text-muted">{label}</span>
      <input
        type="number" name={name} value={value} step={0.5}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input-cosmic w-full px-2 py-1 text-xs"
      />
    </label>
  );
}

function Slider({ name, label, value, min, max, suffix, hint, onChange }: {
  name: string; label: string; value: number; min: number; max: number;
  suffix?: string; hint?: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-xs font-semibold">{label}</label>
        <span className="text-[11px] tabular-nums text-muted">{value}{suffix}</span>
      </div>
      <input
        type="range" name={name} value={value} min={min} max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-cyan-400"
      />
      {hint && <p className="mt-1 text-[10px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}

function Check({ name, label, checked, hint, onChange }: {
  name: string; label: string; checked: boolean; hint?: string; onChange: (v: boolean) => void;
}) {
  return (
    <div>
      <label className="flex items-center gap-2 text-xs font-semibold">
        <input
          type="checkbox" name={name} checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-cyan-500"
        />
        {label}
      </label>
      {hint && <p className="ml-6 mt-0.5 text-[10px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}
