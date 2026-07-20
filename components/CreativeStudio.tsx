"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import {
  SIZES, TEMPLATE_IDS, TEMPLATE_LABELS, buildCreative, proxied,
  type CreativeSize, type TemplateId, type StudioEntity, type BrandAssets,
  type Creative, type CreativeItem, type TextItem,
} from "@/lib/creative-templates";

const FONT = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';
const KIND_LABEL: Record<StudioEntity["kind"], string> = { challenge: "Challenges", quest: "Quests", game: "Planets", leaderboard: "Leaderboards" };

// A mini-Canva for social posts/stories about any challenge / quest / planet /
// leaderboard. Pick an entry → it auto-fills a template with the right cover art
// + text + logo; drag/edit any element; export a PNG in post or story size.
export default function CreativeStudio({ entities, brand }: { entities: StudioEntity[]; brand: BrandAssets }) {
  const [kind, setKind] = useState<StudioEntity["kind"]>("challenge");
  const [q, setQ] = useState("");
  const kinds = useMemo(() => [...new Set(entities.map((e) => e.kind))], [entities]);
  const list = useMemo(() => entities.filter((e) => e.kind === kind && (!q || e.title.toLowerCase().includes(q.toLowerCase()))), [entities, kind, q]);
  const [entity, setEntity] = useState<StudioEntity | null>(entities.find((e) => e.kind === "challenge") ?? entities[0] ?? null);
  const [template, setTemplate] = useState<TemplateId>("spotlight");
  const [size, setSize] = useState<CreativeSize>("post");
  const [creative, setCreative] = useState<Creative | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Rebuild the auto-filled creative whenever the source/template/size changes.
  useEffect(() => {
    if (entity) setCreative(buildCreative(entity, template, brand, size));
    else setCreative(null);
    setSelId(null);
  }, [entity, template, size, brand]);

  const W = SIZES[size].w, H = SIZES[size].h;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const measure = () => { const r = el.getBoundingClientRect(); setScale(Math.min(r.width / W, r.height / H)); };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

  const patch = (id: string, p: Partial<CreativeItem>) => setCreative((c) => c && ({ ...c, items: c.items.map((it) => it.id === id ? { ...it, ...p } as CreativeItem : it) }));
  const removeItem = (id: string) => setCreative((c) => c && ({ ...c, items: c.items.filter((it) => it.id !== id) }));
  const addText = () => setCreative((c) => { if (!c) return c; const id = "c" + Math.random().toString(36).slice(2, 8); setSelId(id); return { ...c, items: [...c.items, { id, type: "text", x: 0.1, y: 0.1, w: 0.7, text: "New text", size: 48, color: "#ffffff", weight: 700, align: "left", shadow: true } as TextItem] }; });
  const addImage = (src: string, round = false) => setCreative((c) => { if (!c) return c; const id = "c" + Math.random().toString(36).slice(2, 8); setSelId(id); return { ...c, items: [...c.items, { id, type: "image", x: 0.4, y: 0.4, w: 0.2, src, round }] }; });

  // Drag an element (fractions of the stage).
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const onDown = (e: React.PointerEvent, it: CreativeItem) => {
    e.stopPropagation(); setSelId(it.id);
    drag.current = { id: it.id, sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const nx = d.ox + (e.clientX - d.sx) / (scale * W);
    const ny = d.oy + (e.clientY - d.sy) / (scale * H);
    patch(d.id, { x: Math.max(-0.1, Math.min(1, nx)), y: Math.max(-0.05, Math.min(1, ny)) });
  };
  const onUp = () => { drag.current = null; };

  const sel = creative?.items.find((it) => it.id === selId) ?? null;

  async function exportPng() {
    if (!creative) return;
    setExporting(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#04051a"; ctx.fillRect(0, 0, W, H);
      // Background cover-fit + tint + legibility gradient.
      if (creative.bg) {
        const bg = await loadImg(proxied(creative.bg));
        if (bg) drawCover(ctx, bg, 0, 0, W, H);
      }
      ctx.fillStyle = `rgba(4,5,26,${creative.bg ? creative.bgTint : 0.9})`; ctx.fillRect(0, 0, W, H);
      const grad = ctx.createLinearGradient(0, H * 0.4, 0, H);
      grad.addColorStop(0, "rgba(4,5,26,0)"); grad.addColorStop(1, "rgba(4,5,26,0.85)");
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

      for (const it of creative.items) {
        if (it.type === "image") {
          const img = await loadImg(proxied(it.src)); if (!img) continue;
          const iw = it.w * W;
          if (it.round) {
            const s = iw; ctx.save();
            ctx.beginPath(); ctx.arc(it.x * W + s / 2, it.y * H + s / 2, s / 2, 0, Math.PI * 2); ctx.clip();
            drawCover(ctx, img, it.x * W, it.y * H, s, s); ctx.restore();
          } else {
            const ih = iw * (img.naturalHeight / img.naturalWidth);
            ctx.drawImage(img, it.x * W, it.y * H, iw, ih);
          }
        } else {
          drawText(ctx, it, W, H);
        }
      }
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (blob) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `cluster-${entity?.kind ?? "creative"}-${size}.png`;
        a.click(); URL.revokeObjectURL(a.href);
      }
    } catch (err) {
      alert("Export failed (an image may be blocking canvas export). Try a different cover.");
      console.error(err);
    }
    setExporting(false);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr_260px] items-start">
      {/* ---- Source + template ---- */}
      <div className="glass p-4 space-y-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-cyan-200 mb-2">1 · Pick what it&apos;s about</div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {kinds.map((k) => <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</Chip>)}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="input-cosmic !py-1.5 w-full text-sm mb-2" />
          <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
            {list.length === 0 && <div className="text-xs text-muted p-2">Nothing here yet.</div>}
            {list.map((e) => (
              <button key={`${e.kind}-${e.id}`} onClick={() => setEntity(e)} className={`w-full flex items-center gap-2 rounded-lg border p-1.5 text-left transition ${entity?.id === e.id && entity.kind === e.kind ? "border-cyan-400/60 bg-cyan-500/10" : "border-white/10 hover:border-white/25"}`}>
                <span className="h-9 w-9 rounded-md overflow-hidden bg-black/40 shrink-0">
                  {e.cover && /* eslint-disable-next-line @next/next/no-img-element */ <img src={e.cover} alt="" className="h-full w-full object-cover" />}
                </span>
                <span className="min-w-0"><span className="block text-sm font-semibold truncate">{e.title}</span><span className="block text-[10px] text-muted truncate">{e.meta || e.subtitle}</span></span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-cyan-200 mb-2">2 · Template</div>
          <div className="grid grid-cols-2 gap-1.5">
            {TEMPLATE_IDS.map((t) => <Chip key={t} on={template === t} onClick={() => setTemplate(t)}>{TEMPLATE_LABELS[t]}</Chip>)}
          </div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-cyan-200 mb-2">3 · Size</div>
          <div className="flex gap-1.5">
            {(Object.keys(SIZES) as CreativeSize[]).map((s) => <Chip key={s} on={size === s} onClick={() => setSize(s)}>{SIZES[s].label}</Chip>)}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <button onClick={addText} className="ghost-btn pressable rounded-full px-3 py-1.5 text-xs inline-flex items-center gap-1"><Icon name="plus" size={12} /> Text</button>
          <button onClick={() => addImage(brand.logo, true)} className="ghost-btn pressable rounded-full px-3 py-1.5 text-xs">+ Logo</button>
          <button onClick={() => addImage(brand.astronaut)} className="ghost-btn pressable rounded-full px-3 py-1.5 text-xs">+ Astronaut</button>
          {entity?.cover && <button onClick={() => addImage(entity.cover!)} className="ghost-btn pressable rounded-full px-3 py-1.5 text-xs">+ Cover</button>}
        </div>
      </div>

      {/* ---- Canvas preview ---- */}
      <div className="glass p-4">
        <div ref={wrapRef} onClick={() => setSelId(null)} className="relative mx-auto flex items-center justify-center h-[62vh] overflow-hidden rounded-xl bg-black/40">
          {creative && (
            <div className="absolute" style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "center", left: `calc(50% - ${W / 2}px)`, top: `calc(50% - ${H / 2}px)` }}
              onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
              {/* background */}
              <div className="absolute inset-0" style={{ background: "#04051a" }} />
              {creative.bg && <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${creative.bg})` }} />}
              <div className="absolute inset-0" style={{ background: `rgba(4,5,26,${creative.bg ? creative.bgTint : 0.9})` }} />
              <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 40%, rgba(4,5,26,0.85))" }} />
              {/* items */}
              {creative.items.map((it) => (
                <div key={it.id} onPointerDown={(e) => onDown(e, it)} onClick={(e) => { e.stopPropagation(); setSelId(it.id); }}
                  className={`absolute cursor-move ${selId === it.id ? "outline-dashed outline-2 outline-cyan-400" : ""}`}
                  style={{ left: it.x * W, top: it.y * H, width: it.w * W }}>
                  {it.type === "text" ? (
                    <div style={{ fontFamily: FONT, fontSize: it.size, color: it.color, fontWeight: it.weight, textAlign: it.align, lineHeight: it.lineHeight ?? 1.15, textTransform: it.upper ? "uppercase" : "none", textShadow: it.shadow ? "0 3px 12px rgba(0,0,0,0.6)" : "none", letterSpacing: it.upper ? 2 : 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {it.text}
                    </div>
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={it.src} alt="" draggable={false} className={it.round ? "rounded-full object-cover" : ""} style={{ width: "100%", aspectRatio: it.round ? "1/1" : undefined }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="text-xs text-muted">{entity ? `${entity.title} · ${SIZES[size].label}` : "Pick a source to begin"}</div>
          <button onClick={exportPng} disabled={!creative || exporting} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-50">
            <Icon name="arrowDown" size={14} /> {exporting ? "Rendering…" : "Download PNG"}
          </button>
        </div>
      </div>

      {/* ---- Element inspector ---- */}
      <div className="glass p-4 space-y-3">
        <div className="text-xs font-bold uppercase tracking-widest text-cyan-200">Element</div>
        {!sel ? <div className="text-xs text-muted">Click an element on the canvas to edit it — or drag it to move. Add text/logo/astronaut from the left.</div> : (
          <>
            {sel.type === "text" && (
              <>
                <label className="block text-[11px] text-muted">Text
                  <textarea value={sel.text} onChange={(e) => patch(sel.id, { text: e.target.value })} rows={3} className="input-cosmic !py-1.5 w-full text-sm mt-1" />
                </label>
                <label className="block text-[11px] text-muted">Size {sel.size}px
                  <input type="range" min={18} max={160} value={sel.size} onChange={(e) => patch(sel.id, { size: Number(e.target.value) })} className="w-full" />
                </label>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-muted flex items-center gap-1">Color <input type="color" value={sel.color} onChange={(e) => patch(sel.id, { color: e.target.value })} className="h-7 w-9 rounded" /></label>
                  <label className="text-[11px] text-muted flex items-center gap-1">Bold <input type="checkbox" checked={sel.weight >= 700} onChange={(e) => patch(sel.id, { weight: e.target.checked ? 800 : 500 })} /></label>
                </div>
                <div className="flex gap-1.5">
                  {(["left", "center", "right"] as const).map((a) => <Chip key={a} on={sel.align === a} onClick={() => patch(sel.id, { align: a })}>{a}</Chip>)}
                </div>
                <label className="text-[11px] text-muted flex items-center gap-1"><input type="checkbox" checked={!!sel.upper} onChange={(e) => patch(sel.id, { upper: e.target.checked })} /> UPPERCASE</label>
              </>
            )}
            {sel.type === "image" && (
              <>
                <label className="block text-[11px] text-muted">Width {(sel.w * 100).toFixed(0)}%
                  <input type="range" min={5} max={100} value={sel.w * 100} onChange={(e) => patch(sel.id, { w: Number(e.target.value) / 100 })} className="w-full" />
                </label>
                <label className="text-[11px] text-muted flex items-center gap-1"><input type="checkbox" checked={!!sel.round} onChange={(e) => patch(sel.id, { round: e.target.checked })} /> Circle crop</label>
              </>
            )}
            <button onClick={() => removeItem(sel.id)} className="text-[11px] text-rose-300 hover:underline inline-flex items-center gap-1"><Icon name="x" size={11} /> Remove element</button>
          </>
        )}
        {creative && (
          <div className="pt-2 border-t border-white/10">
            <label className="block text-[11px] text-muted">Background darkness {(creative.bgTint * 100).toFixed(0)}%
              <input type="range" min={0} max={90} value={creative.bgTint * 100} onChange={(e) => setCreative((c) => c && ({ ...c, bgTint: Number(e.target.value) / 100 }))} className="w-full" />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border capitalize transition ${on ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-200" : "border-white/12 text-muted hover:text-ink"}`}>{children}</button>;
}

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => res(img); img.onerror = () => res(null); img.src = src;
  });
}
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ir = img.naturalWidth / img.naturalHeight, br = w / h;
  let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
  if (ir > br) { sw = sh * br; sx = (img.naturalWidth - sw) / 2; } else { sh = sw / br; sy = (img.naturalHeight - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}
function drawText(ctx: CanvasRenderingContext2D, it: TextItem, W: number, H: number) {
  const text = it.upper ? it.text.toUpperCase() : it.text;
  ctx.font = `${it.weight} ${it.size}px ${FONT}`;
  ctx.fillStyle = it.color; ctx.textAlign = it.align; ctx.textBaseline = "top";
  const maxW = it.w * W;
  const paras = text.split("\n");
  const lines: string[] = [];
  for (const para of paras) {
    const words = para.split(/\s+/); let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    lines.push(line);
  }
  const lh = it.size * (it.lineHeight ?? 1.15);
  const ax = it.align === "center" ? it.x * W + maxW / 2 : it.align === "right" ? it.x * W + maxW : it.x * W;
  let ty = it.y * H;
  for (const ln of lines) {
    if (it.shadow) { ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4; }
    ctx.fillText(ln, ax, ty);
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ty += lh;
  }
}
