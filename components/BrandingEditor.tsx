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
  defaultWordmark, defaultWordmarkZoom, defaultNavMode, defaultFooterMode, defaultLoadingColor, defaultLoadingLogo, defaultLoadingPhrases, defaultPlanetsIcon,
  defaultNavBg, defaultFooterBg, defaultFavicon, defaultFaviconZoom, defaultCpIcon, defaultOrbIcon, defaultOrbColor, defaultQuestRocket,
  defaultLoadingInterval = 3, defaultLoadingAstronaut = "", defaultLoadingBg = "", defaultLoadingWordmark = true, defaultLoadingOrbSize = 80,
}: {
  defaultWordmark: string;
  defaultWordmarkZoom: number;
  defaultNavMode: Mode;
  defaultFooterMode: Mode;
  defaultLoadingColor: string;
  defaultLoadingLogo: string;
  defaultLoadingPhrases: string;
  defaultPlanetsIcon: string;
  defaultNavBg: string;
  defaultFooterBg: string;
  defaultFavicon: string;
  defaultFaviconZoom: number;
  defaultCpIcon: string;
  defaultOrbIcon: string;
  defaultOrbColor: string;
  defaultQuestRocket: string;
  defaultLoadingInterval?: number;
  defaultLoadingAstronaut?: string;
  defaultLoadingBg?: string;
  defaultLoadingWordmark?: boolean;
  defaultLoadingOrbSize?: number;
}) {
  const [wordmark, setWordmark] = useState(defaultWordmark);
  const [cpIcon, setCpIcon] = useState(defaultCpIcon);
  const [orbIcon, setOrbIcon] = useState(defaultOrbIcon);
  const [orbColor, setOrbColor] = useState(defaultOrbColor || "#8b5cf6");
  const [questRocket, setQuestRocket] = useState(defaultQuestRocket);
  const [planetsIcon, setPlanetsIcon] = useState(defaultPlanetsIcon);
  const [navBg, setNavBg] = useState(defaultNavBg);
  const [footerBg, setFooterBg] = useState(defaultFooterBg);
  const [favicon, setFavicon] = useState(defaultFavicon);
  const [navMode, setNavMode] = useState<Mode>(defaultNavMode);
  const [footerMode, setFooterMode] = useState<Mode>(defaultFooterMode);
  const [loadingColor, setLoadingColor] = useState(defaultLoadingColor);
  const [loadingLogo, setLoadingLogo] = useState(defaultLoadingLogo);
  const [loadingPhrases, setLoadingPhrases] = useState(defaultLoadingPhrases);
  const [loadingInterval, setLoadingInterval] = useState(defaultLoadingInterval);
  const [loadingAstronaut, setLoadingAstronaut] = useState(defaultLoadingAstronaut);
  const [loadingBg, setLoadingBg] = useState(defaultLoadingBg);
  const [loadingOrbSize, setLoadingOrbSize] = useState(defaultLoadingOrbSize);
  const phraseList = loadingPhrases.split("\n").map((s) => s.trim()).filter(Boolean);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveBranding, undefined);

  return (
    <form action={formAction} className="space-y-8">
      {/* Wordmark logo */}
      <div>
        <div className="font-semibold text-sm mb-1">Wordmark logo (wide)</div>
        <p className="text-xs text-muted mb-3">The wide CLUSTER logo. When set, it replaces the gradient &ldquo;CLUSTER&rdquo; text next to the mark. Use the single zoom slider under the preview to crop into the middle of the art (removes the empty space above/below a centred wordmark) — the crop is baked and shown big and wide in the nav.</p>
        <div className="rounded-2xl border border-violet-400/15 bg-black/20 p-4">
          <ImageUpload name="wordmark" value={wordmark} onChange={setWordmark}
            aspect="4/1" rounded="rounded-lg" maxDim={720} scope="content" previewWidth={280}
            hint="Transparent PNG works best. Wide lockup — around 4:1. Zoom in to fill the frame with the letters." />
          {/* Display size stays at 1× — the nav renders the wordmark large by default. */}
          <input type="hidden" name="wordmarkZoom" value="1" />
          {wordmark && (
            <div className="mt-4 flex items-center gap-4 rounded-xl bg-[#04051a] p-4 overflow-x-auto">
              <span className="text-[10px] uppercase tracking-widest text-muted shrink-0">Nav preview</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={wordmark} alt="Cluster" className="w-auto object-contain" style={{ height: 54 }} />
            </div>
          )}
        </div>
      </div>

      {/* Cluster Points (CP) coin icon */}
      <div>
        <div className="font-semibold text-sm mb-1">Cluster Points (CP) coin icon</div>
        <p className="text-xs text-muted mb-3">The currency icon shown next to every CP value across the platform.</p>
        <div className="rounded-2xl border border-violet-400/15 bg-black/20 p-4 flex items-center gap-4">
          {cpIcon && /* eslint-disable-next-line @next/next/no-img-element */ <img src={cpIcon} alt="" className="h-12 w-12 object-contain shrink-0" />}
          <div className="flex-1"><ImageUpload name="cpIcon" value={cpIcon} onChange={setCpIcon} aspect="1/1" rounded="rounded-xl" maxDim={256} scope="content" hint="Square coin/gem art on a dark or transparent background." /></div>
        </div>
      </div>

      {/* Floating quest orb icon */}
      <div>
        <div className="font-semibold text-sm mb-1">Floating quest orb icon</div>
        <p className="text-xs text-muted mb-3">The icon on the floating orb (bottom-right of every page). Leave empty to use the CP coin.</p>
        <div className="rounded-2xl border border-violet-400/15 bg-black/20 p-4 flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-full shrink-0" style={{ background: `radial-gradient(circle at 35% 30%, ${orbColor}, ${orbColor}bb 60%, ${orbColor}66)` }}>
            {orbIcon && /* eslint-disable-next-line @next/next/no-img-element */ <img src={orbIcon} alt="" className="h-8 w-8 object-contain" />}
          </span>
          <div className="flex-1"><ImageUpload name="orbIcon" value={orbIcon} onChange={setOrbIcon} aspect="1/1" rounded="rounded-full" maxDim={256} scope="content" hint="Square icon; shows on the glowing orb. Empty = CP coin." /></div>
          <label className="text-xs text-muted flex flex-col items-center gap-1">Orb color
            <input type="color" name="orbColor" value={orbColor} onChange={(e) => setOrbColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-violet-400/25 bg-transparent p-0.5" />
          </label>
        </div>
      </div>

      {/* Quest-map "you are here" marker */}
      <div>
        <div className="font-semibold text-sm mb-1">Quest map marker (rocket)</div>
        <p className="text-xs text-muted mb-3">The &quot;you are here&quot; marker that rides the quest map trail. Leave empty for the default rocket orb.</p>
        <div className="rounded-2xl border border-violet-400/15 bg-black/20 p-4 flex items-center gap-4">
          {questRocket && /* eslint-disable-next-line @next/next/no-img-element */ <img src={questRocket} alt="" className="h-12 w-12 object-contain shrink-0" />}
          <div className="flex-1"><ImageUpload name="questRocket" value={questRocket} onChange={setQuestRocket} aspect="1/1" rounded="rounded-xl" maxDim={256} scope="content" hint="Small marker image (rocket, ship, avatar…)." /></div>
        </div>
      </div>

      {/* Nav "all planets" icon */}
      <div>
        <div className="font-semibold text-sm mb-1">Nav &ldquo;all planets&rdquo; icon</div>
        <p className="text-xs text-muted mb-3">The button next to the game logos that links to all planets. Upload an image or leave empty for the default planet glyph.</p>
        <div className="rounded-2xl border border-violet-400/15 bg-black/20 p-4">
          <ImageUpload name="planetsIcon" value={planetsIcon} onChange={setPlanetsIcon}
            aspect="1/1" rounded="rounded-xl" maxDim={128} scope="content" hint="Square icon, shown at 40×40 in the nav." />
        </div>
      </div>

      {/* Nav + footer backgrounds + favicon */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-violet-400/15 bg-black/20 p-4">
          <div className="font-semibold text-sm mb-1">Nav bar background</div>
          <p className="text-xs text-muted mb-3">Art behind the top nav (kept dark for readability). Empty = default.</p>
          <ImageUpload name="navBg" value={navBg} onChange={setNavBg} aspect="8/1" maxDim={1920} scope="content" hint="Very wide, dark art." />
        </div>
        <div className="rounded-2xl border border-violet-400/15 bg-black/20 p-4">
          <div className="font-semibold text-sm mb-1">Footer background</div>
          <p className="text-xs text-muted mb-3">Art behind the footer. Empty = default.</p>
          <ImageUpload name="footerBg" value={footerBg} onChange={setFooterBg} aspect="4/1" maxDim={1920} scope="content" hint="Wide, dark art." />
        </div>
      </div>

      <div>
        <div className="font-semibold text-sm mb-1">Favicon (browser tab icon)</div>
        <p className="text-xs text-muted mb-3">Square icon shown in the browser tab. Use the single zoom slider under the preview to crop in — the crop is baked into the saved icon.</p>
        <div className="rounded-2xl border border-violet-400/15 bg-black/20 p-4 grid gap-4 sm:grid-cols-[auto_1fr] items-start">
          <div className="flex flex-col items-center gap-2">
            <span className="relative h-12 w-12 overflow-hidden rounded-lg ring-1 ring-white/10 bg-black/40">
              {favicon
                ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={favicon} alt="" className="h-full w-full object-cover" />
                : <span className="flex h-full w-full items-center justify-center text-muted text-[10px]">none</span>}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-muted">Tab preview</span>
          </div>
          <div className="space-y-3">
            <ImageUpload name="favicon" value={favicon} onChange={setFavicon} aspect="1/1" rounded="rounded-lg" maxDim={128} scope="content" hint="Square. PNG or SVG. Zoom to crop in." />
            {/* Zoom is baked into the icon, so the tab always uses it directly. */}
            <input type="hidden" name="faviconZoom" value="1" />
          </div>
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
            <div>
              <div className="text-xs text-muted mb-1.5">Loading phrases — one per line (cycles every second)</div>
              <textarea value={loadingPhrases} onChange={(e) => setLoadingPhrases(e.target.value)} rows={5}
                className="w-full rounded-lg border border-violet-400/25 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan-400/50 font-mono"
                placeholder={"Traversing the cluster…\nAligning the constellations…"} />
              {phraseList.length > 0 && (
                <div className="mt-1.5 text-[11px] text-muted">{phraseList.length} phrase{phraseList.length > 1 ? "s" : ""} · first: <span className="grad-text font-semibold">{phraseList[0]}</span></div>
              )}
            </div>

            {/* Rotation timing */}
            <label className="block text-xs text-muted">Phrase rotation every <span className="text-cyan-300">{loadingInterval}s</span>
              <input type="range" min={1} max={20} step={1} value={loadingInterval} onChange={(e) => setLoadingInterval(Number(e.target.value))} className="w-full accent-violet-500" />
            </label>
            <input type="hidden" name="loadingInterval" value={loadingInterval} />

            {/* Orb size */}
            <label className="block text-xs text-muted">Orb size <span className="text-cyan-300">{loadingOrbSize}px</span>
              <input type="range" min={72} max={200} step={2} value={loadingOrbSize} onChange={(e) => setLoadingOrbSize(Number(e.target.value))} className="w-full accent-violet-500" />
            </label>
            <input type="hidden" name="loadingOrbSize" value={loadingOrbSize} />

            {/* Astronaut on the loading screen */}
            <div>
              <div className="text-xs text-muted mb-1.5">Gamified astronaut (above the orb) — empty to hide</div>
              <ImageUpload name="loadingAstronaut" value={loadingAstronaut} onChange={setLoadingAstronaut}
                aspect="1/1" rounded="rounded-xl" maxDim={512} scope="content" hint="The mascot shown floating on the loading screen." />
            </div>

            {/* Loading background art */}
            <div>
              <div className="text-xs text-muted mb-1.5">Loading screen background image (empty = dark blur)</div>
              <ImageUpload name="loadingBg" value={loadingBg} onChange={setLoadingBg}
                aspect="16/9" maxDim={1920} scope="content" hint="Full-screen cosmic art behind the orb." />
            </div>

            {/* Wordmark toggle */}
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" name="loadingWordmark" defaultChecked={defaultLoadingWordmark} className="accent-violet-500 h-4 w-4" />
              Show the Cluster wordmark at the bottom of the loading screen
            </label>
            <p className="text-[11px] text-muted">Tip: assign an ad creative to the <b>loading_screen</b> placement (Admin → Placements) to run an ad here.</p>
          </div>
        </div>
      </div>

      <input type="hidden" name="loadingColor" value={loadingColor} />
      <input type="hidden" name="loadingPhrases" value={loadingPhrases} />
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
