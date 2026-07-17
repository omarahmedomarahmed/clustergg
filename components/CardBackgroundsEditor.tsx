"use client";

import { useActionState, useState } from "react";
import { saveCardBackgrounds, type ActionState } from "@/app/actions/admin";
import ImageUpload from "@/components/ImageUpload";
import { CARD_BG_TYPES, type CardBgMap } from "@/lib/card-bg";

function CardRow({ type, label, note, initial }: { type: string; label: string; note: string; initial: { url: string; dim: number } }) {
  const [url, setUrl] = useState(initial.url);
  const [dim, setDim] = useState(initial.dim);
  const a = (dim / 100).toFixed(2);

  return (
    <div className="rounded-2xl border border-violet-400/15 bg-black/20 p-4">
      <div className="font-semibold text-sm">{label}</div>
      <div className="text-[11px] text-muted mb-3">{note}</div>
      <div className="grid sm:grid-cols-[1fr_auto] gap-4 items-start">
        <div className="space-y-3">
          <ImageUpload name={`art__${type}`} value={url} onChange={setUrl}
            aspect="16/9" maxDim={1280} scope="content"
            hint="Dark, text-safe art works best." />
          <label className="block text-xs text-muted">Overlay darkness <span className="text-cyan-300">{dim}%</span>
            <input type="range" min={0} max={100} value={dim} onChange={(e) => setDim(Number(e.target.value))} className="w-full accent-violet-500" />
          </label>
          <input type="hidden" name={`dim__${type}`} value={dim} />
        </div>
        {/* Live preview of the resulting card */}
        <div className="rounded-xl border border-white/10 p-4 w-full sm:w-52 min-h-[7rem] relative overflow-hidden"
          style={{ background: url ? `linear-gradient(180deg, rgba(4,5,26,0.15), rgba(4,5,26,${a})), url(${url}) center/cover` : "rgba(10,10,28,0.6)" }}>
          <div className="text-[10px] uppercase tracking-widest text-muted">Preview</div>
          <div className="mt-2 font-bold">Sample card</div>
          <div className="text-xs text-muted mt-1">Content stays readable over the art.</div>
        </div>
      </div>
    </div>
  );
}

export default function CardBackgroundsEditor({ current }: { current: CardBgMap }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveCardBackgrounds, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {CARD_BG_TYPES.map((t) => (
        <CardRow key={t.key} type={t.key} label={t.label} note={t.note} initial={current[t.key] ?? { url: "", dim: 55 }} />
      ))}
      <div className="flex items-center gap-3 pt-1">
        <button disabled={pending} className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">
          {pending ? "Saving…" : "Save card backgrounds"}
        </button>
        {state?.ok && <span className="text-xs text-emerald-300">✓ {state.message}</span>}
        {state?.error && <span className="text-xs text-rose-300">{state.error}</span>}
      </div>
    </form>
  );
}
