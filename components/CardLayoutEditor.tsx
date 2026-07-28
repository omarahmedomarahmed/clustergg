"use client";

import { useActionState, useCallback, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { saveCardLayout, resetCardLayout, type CardActionState } from "@/app/actions/cards";
import ImageUpload from "@/components/ImageUpload";
import {
  DEFAULT_LAYOUT, BG_SOURCES, assetBox,
  type CardLayout, type CardAsset, type ContentBox, type Spot,
} from "@/lib/cards/layout";
import type { LibraryGroup } from "@/lib/cards/asset-library";

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
type Handle = "mascot" | "mark" | "badge" | "content" | `asset:${string}`;

const ASPECT = 1200 / 630;

export default function CardLayoutEditor({ kind, name, initial, art, previewUrl, library = [] }: {
  kind: string;
  name: string;
  initial: CardLayout;
  art: EditorArt;
  /** Live render of this card kind, re-fetched after a save. */
  previewUrl: string;
  /** Platform images offered in the "place an image" picker. */
  library?: LibraryGroup[];
}) {
  const [l, setL] = useState<CardLayout>(initial);
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

  const setSpot = (key: "mascot" | "mark" | "badge", patch: Partial<Spot>) =>
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
            {art.bgUrl && l.scrim && (
              <>
                <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(4,5,26,0.94) 0%, rgba(4,5,26,0.78) 48%, rgba(4,5,26,0.46) 100%)" }} />
                <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(4,5,26,0.62) 0%, rgba(4,5,26,0.30) 38%, rgba(4,5,26,0.90) 100%)" }} />
              </>
            )}
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
                active={drag === "badge"}
                onGrab={() => setDrag("badge")}
                img={null}
                tint="rgba(251,191,36,0.35)"
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
              hint="How far the artwork is darkened before anything is drawn on it."
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
            <Check name="scrim" label="Directional scrim" checked={l.scrim} hint="Extra darkening down the left column and along the bottom." onChange={(v) => setL((c) => ({ ...c, scrim: v }))} />
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
            <button disabled={saving} className="grad-btn pressable rounded-full px-5 py-2 text-sm font-bold disabled:opacity-60">
              {saving ? "Saving…" : "Save layout"}
            </button>
          </div>
          {state?.ok && <p className="text-sm text-emerald-300 inline-flex items-center gap-1.5"><Icon name="check" size={13} /> {state.ok}</p>}
          {state?.error && <p className="text-sm text-amber-300">{state.error}</p>}
        </form>
      </div>

      {/* ===== The real thing ===== */}
      <div className="grid sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted mb-2">Rendered {name.toLowerCase()} card</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={nonce}
            src={`${previewUrl}${previewUrl.includes("?") ? "&" : "?"}v=${nonce}`}
            alt=""
            className="w-full rounded-xl border border-white/10 bg-black/40"
            style={{ aspectRatio: `${ASPECT}` }}
          />
        </div>
        <form action={reset}>
          <input type="hidden" name="kind" value={kind} />
          <button disabled={resetting} className="ghost-btn pressable rounded-full px-5 py-2 text-sm disabled:opacity-60">
            {resetting ? "Resetting…" : "Reset to default"}
          </button>
        </form>
      </div>
    </div>
  );
}

const round = (n: number) => Math.round(n * 10) / 10;

// ===== Canvas pieces =====

function Grab({ label, spot, active, onGrab, img, tint }: {
  label: string; spot: Spot; active: boolean; onGrab: () => void; img: string | null; tint: string;
}) {
  // Size is in canvas pixels; the canvas is 1200 wide however many CSS pixels
  // it occupies, so a percentage width keeps the handle to scale.
  const w = (spot.size / 1200) * 100;
  const h = (spot.size / 630) * 100;
  return (
    <div
      onPointerDown={(e) => { e.preventDefault(); onGrab(); }}
      title={`${label} — drag to move`}
      className={`absolute grid cursor-grab place-items-center rounded-lg border-2 active:cursor-grabbing ${
        active ? "border-cyan-300" : "border-white/45 hover:border-white/80"
      }`}
      style={{
        left: `${spot.x}%`, top: `${spot.y}%`, width: `${w}%`, height: `${h}%`,
        transform: "translate(-50%, -50%)",
        background: img ? "transparent" : tint,
      }}
    >
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" className="pointer-events-none h-full w-full object-contain" />
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

function SpotFields({ label, prefix, spot, onChange }: {
  label: string; prefix: string; spot: Spot; onChange: (patch: Partial<Spot>) => void;
}) {
  return (
    <fieldset className="rounded-xl border border-white/10 p-3">
      <legend className="px-1.5 text-[11px] uppercase tracking-widest text-muted">{label}</legend>
      <div className="grid grid-cols-3 gap-2">
        <Num name={`${prefix}.x`} label="X %" value={spot.x} onChange={(v) => onChange({ x: v })} />
        <Num name={`${prefix}.y`} label="Y %" value={spot.y} onChange={(v) => onChange({ y: v })} />
        <Num name={`${prefix}.size`} label="Size px" value={spot.size} onChange={(v) => onChange({ size: v })} />
      </div>
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
