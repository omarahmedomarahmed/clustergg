"use client";

import { useActionState, useState } from "react";
import { saveBranding, type ActionState } from "@/app/actions/admin";
import ImageUpload from "@/components/ImageUpload";

type Mode = "mark" | "wordmark" | "both";

const MODE_OPTS: { value: Mode; label: string; note: string }[] = [
  { value: "both", label: "Mark + wordmark", note: "Square letter-mark next to the wide logo." },
  { value: "wordmark", label: "Wordmark only", note: "Just the wide CLUSTER logo." },
  { value: "mark", label: "Mark only", note: "Just the square C letter-mark." },
];

function ModePicker({ name, value, onChange }: { name: string; value: Mode; onChange: (v: Mode) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {MODE_OPTS.map((o) => (
        <label key={o.value}
          className={`cursor-pointer rounded-xl border p-3 text-xs transition-colors ${value === o.value ? "border-cyan-400/60 bg-cyan-400/10" : "border-violet-400/15 hover:border-violet-400/40"}`}>
          <input type="radio" name={name} value={o.value} checked={value === o.value}
            onChange={() => onChange(o.value)} className="sr-only" />
          <div className={`font-semibold ${value === o.value ? "text-cyan-200" : "text-ink"}`}>{o.label}</div>
          <div className="mt-0.5 text-muted leading-snug">{o.note}</div>
        </label>
      ))}
    </div>
  );
}

// Admin editor for the wide wordmark logo, per-placement display mode, and the
// loading-screen appearance. Complements LogoEditor (the square mark).
export default function BrandingEditor({
  defaultWordmark, defaultNavMode, defaultFooterMode, defaultLoadingColor, defaultLoadingLogo,
}: {
  defaultWordmark: string;
  defaultNavMode: Mode;
  defaultFooterMode: Mode;
  defaultLoadingColor: string;
  defaultLoadingLogo: string;
}) {
  const [wordmark, setWordmark] = useState(defaultWordmark);
  const [navMode, setNavMode] = useState<Mode>(defaultNavMode);
  const [footerMode, setFooterMode] = useState<Mode>(defaultFooterMode);
  const [loadingColor, setLoadingColor] = useState(defaultLoadingColor);
  const [loadingLogo, setLoadingLogo] = useState(defaultLoadingLogo);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveBranding, undefined);

  return (
    <form action={formAction} className="space-y-8">
      {/* Wordmark logo */}
      <div>
        <div className="font-semibold text-sm mb-1">Wordmark logo (wide)</div>
        <p className="text-xs text-muted mb-3">The wide CLUSTER logo. When set, it replaces the gradient &ldquo;CLUSTER&rdquo; text next to the mark.</p>
        <div className="rounded-2xl border border-violet-400/15 bg-black/20 p-4">
          <ImageUpload name="wordmark" value={wordmark} onChange={setWordmark}
            aspect="4/1" rounded="rounded-lg" maxDim={640} scope="content"
            hint="Transparent PNG works best. Wide lockup — around 4:1." />
          {wordmark && (
            <div className="mt-4 flex items-center gap-4 rounded-xl bg-[#04051a] p-4">
              <span className="text-[10px] uppercase tracking-widest text-muted">Preview</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={wordmark} alt="Cluster" className="h-6 w-auto object-contain" />
            </div>
          )}
        </div>
      </div>

      {/* Placement modes */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="font-semibold text-sm mb-2">Navigation bar</div>
          <ModePicker name="navMode" value={navMode} onChange={setNavMode} />
        </div>
        <div>
          <div className="font-semibold text-sm mb-2">Footer</div>
          <ModePicker name="footerMode" value={footerMode} onChange={setFooterMode} />
        </div>
      </div>

      {/* Loading screen */}
      <div>
        <div className="font-semibold text-sm mb-1">Loading screen</div>
        <p className="text-xs text-muted mb-3">The rotating orbit shown while pages load. Pick the circle color and an optional logo inside it.</p>
        <div className="grid gap-6 sm:grid-cols-[auto_1fr] items-start rounded-2xl border border-violet-400/15 bg-black/20 p-4">
          {/* Live preview */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative h-20 w-20">
              <div className="absolute inset-3 flex items-center justify-center rounded-full overflow-hidden"
                style={{ background: loadingLogo ? "#04051a" : `radial-gradient(circle at 35% 30%, ${loadingColor}, ${loadingColor}99 65%, #0a0a1c)`, boxShadow: `0 0 30px -4px ${loadingColor}` }}>
                {loadingLogo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={loadingLogo} alt="" className="h-full w-full object-contain p-1.5" />}
              </div>
              <div className="absolute inset-0 animate-spin" style={{ animationDuration: "1s" }}>
                <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full" style={{ background: loadingColor, boxShadow: `0 0 10px 2px ${loadingColor}` }} />
              </div>
              <div className="absolute inset-0 rounded-full border" style={{ borderColor: `${loadingColor}44` }} />
            </div>
            <span className="text-[10px] uppercase tracking-widest text-muted">Preview</span>
          </div>
          <div className="space-y-4">
            <label className="block text-xs text-muted">Circle color
              <div className="mt-1.5 flex items-center gap-3">
                <input type="color" value={loadingColor} onChange={(e) => setLoadingColor(e.target.value)}
                  className="h-9 w-14 cursor-pointer rounded-lg border border-violet-400/25 bg-transparent p-0.5" />
                <input type="text" value={loadingColor} onChange={(e) => setLoadingColor(e.target.value)}
                  className="w-32 rounded-lg border border-violet-400/25 bg-black/30 px-3 py-1.5 text-sm outline-none focus:border-cyan-400/50" />
              </div>
            </label>
            <div>
              <div className="text-xs text-muted mb-1.5">Logo inside the circle (optional)</div>
              <ImageUpload name="loadingLogo" value={loadingLogo} onChange={setLoadingLogo}
                aspect="1/1" rounded="rounded-full" maxDim={256} scope="content"
                hint="Small square mark. Leave empty for a glowing orb." />
            </div>
          </div>
        </div>
      </div>

      <input type="hidden" name="loadingColor" value={loadingColor} />
      <div className="flex items-center gap-3">
        <button disabled={pending} className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">
          {pending ? "Saving…" : "Save branding"}
        </button>
        {state?.ok && <span className="text-xs text-emerald-300">✓ {state.message}</span>}
        {state?.error && <span className="text-xs text-rose-300">{state.error}</span>}
      </div>
    </form>
  );
}
