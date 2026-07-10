"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { saveChallenge } from "@/app/actions/admin";

export type BuilderProvider = {
  id: string;
  name: string;
  game: string;
  live: boolean;
  capabilities: { key: string; label: string; higherIsBetter?: boolean }[];
};
export type BuilderSpace = { id: string; name: string; game: string | null };
export type BuilderTrophy = { id: string; name: string; tier: string; imageUrl: string };

// Points recommendation: reward the primary "win-like" metric heavily, add a
// small participation reward on a volume metric when the API exposes one.
function recommendPoints(caps: BuilderProvider["capabilities"]): Record<string, number> {
  const keys = caps.map((c) => c.key);
  const rec: Record<string, number> = {};
  const winLike = ["wins", "victories_3v3", "world_records", "top10s", "kills"].find((k) => keys.includes(k));
  const volumeLike = ["games", "matches", "play_count", "personal_bests"].find((k) => keys.includes(k));
  const scoreLike = ["trophies", "pp", "elo", "rank_score", "gamerscore", "network_level", "steam_level", "followers"].find((k) => keys.includes(k));
  if (winLike) rec[winLike] = 10;
  if (volumeLike) rec[volumeLike] = 1;
  if (!winLike && scoreLike) rec[scoreLike] = 1;
  return rec;
}

const CADENCES = [
  { key: "daily", label: "Daily", desc: "24-hour sprint" },
  { key: "weekly", label: "Weekly", desc: "7-day season" },
  { key: "monthly", label: "Monthly", desc: "30-day marathon" },
  { key: "custom", label: "Custom", desc: "Pick exact dates" },
];

export default function ChallengeBuilder({
  providers, spaces, trophies,
}: { providers: BuilderProvider[]; spaces: BuilderSpace[]; trophies: BuilderTrophy[] }) {
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [cadence, setCadence] = useState("weekly");
  const [heroType, setHeroType] = useState("image");
  const [points, setPoints] = useState(() => JSON.stringify(recommendPoints(providers[0]?.capabilities ?? [])));

  const provider = useMemo(() => providers.find((p) => p.id === providerId), [providers, providerId]);
  const matchingSpaces = useMemo(() => {
    const match = spaces.filter((s) => s.game === provider?.game);
    return match.length ? [...match, ...spaces.filter((s) => s.game !== provider?.game)] : spaces;
  }, [spaces, provider]);

  const applyRecommendation = () => {
    if (provider) setPoints(JSON.stringify(recommendPoints(provider.capabilities)));
  };

  const toLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  return (
    <form action={saveChallenge} className="space-y-5">
      {/* Step 1: game */}
      <div>
        <div className="text-xs uppercase tracking-widest text-muted mb-2">1 · Pick the game & data source</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <select
            name="provider" required value={providerId}
            onChange={(e) => {
              setProviderId(e.target.value);
              const p = providers.find((x) => x.id === e.target.value);
              if (p) setPoints(JSON.stringify(recommendPoints(p.capabilities)));
            }}
            className="input-cosmic"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.game}){p.live ? " — live" : " — needs API key"}
              </option>
            ))}
          </select>
          <select name="spaceId" required className="input-cosmic">
            {matchingSpaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <input type="hidden" name="game" value={provider?.game ?? ""} />
        {provider && (
          <div className="mt-3 glass !rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2 flex items-center gap-1.5">
              <Icon name="satellite" size={11} /> Trackable via the {provider.name} API
            </div>
            <div className="flex flex-wrap gap-1.5">
              {provider.capabilities.map((cp) => (
                <span key={cp.key} className="text-[11px] rounded-full border border-violet-400/25 px-2 py-0.5 text-muted">
                  <code className="text-cyan-300/90">{cp.key}</code> — {cp.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Step 2: identity */}
      <div>
        <div className="text-xs uppercase tracking-widest text-muted mb-2">2 · Name the event</div>
        <div className="grid gap-3">
          <input name="title" required placeholder="Title (e.g. Blitz Supernova — Weekly Wins Race)" className="input-cosmic" />
          <textarea name="description" rows={2} placeholder="Description players see on the event page" className="input-cosmic" />
        </div>
      </div>

      {/* Step 3: window */}
      <div>
        <div className="text-xs uppercase tracking-widest text-muted mb-2">3 · Time window</div>
        <div className="flex flex-wrap gap-2 mb-3">
          {CADENCES.map((cd) => (
            <button
              key={cd.key} type="button"
              onClick={() => setCadence(cd.key)}
              className={`stat-tab ${cadence === cd.key ? "stat-tab-active" : ""}`}
              title={cd.desc}
            >
              {cd.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="cadence" value={cadence} />
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs text-muted">Starts
            <input name="startAt" type="datetime-local" defaultValue={toLocal(new Date())} className="input-cosmic mt-1" />
          </label>
          {cadence === "custom" ? (
            <label className="text-xs text-muted">Ends
              <input name="endAt" type="datetime-local" defaultValue={toLocal(new Date(Date.now() + 7 * 86400000))} className="input-cosmic mt-1" />
            </label>
          ) : (
            <div className="text-xs text-muted self-end pb-3">
              Ends automatically {cadence === "daily" ? "24 hours" : cadence === "weekly" ? "7 days" : "30 days"} after start.
            </div>
          )}
        </div>
      </div>

      {/* Step 4: scoring */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-widest text-muted">4 · Scoring engine</div>
          <button type="button" onClick={applyRecommendation} className="ghost-btn pressable rounded-full px-3 py-1 text-[11px] inline-flex items-center gap-1.5">
            <Icon name="spark" size={11} /> Recommend for {provider?.game}
          </button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs text-muted sm:col-span-2">
            Points per unit gained — JSON of metric → points (metrics above)
            <textarea
              name="pointsEngine" rows={2} value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="input-cosmic font-mono text-xs mt-1"
            />
          </label>
          <select name="format" className="input-cosmic">
            <option value="top3">Top 3 podium</option>
            <option value="top1">Winner takes all</option>
            <option value="threshold_race">Threshold race (first to target)</option>
          </select>
          <input name="thresholdTarget" type="number" placeholder="Target points (races only)" className="input-cosmic" />
          <label className="text-xs text-muted sm:col-span-2">
            Qualification conditions (optional) — JSON array of {"{metric, op, value}"} applied to stat deltas
            <textarea name="conditions" rows={1} defaultValue="[]" className="input-cosmic font-mono text-xs mt-1" />
          </label>
        </div>
      </div>

      {/* Step 5: presentation */}
      <div>
        <div className="text-xs uppercase tracking-widest text-muted mb-2">5 · Event presentation</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <select name="heroType" value={heroType} onChange={(e) => setHeroType(e.target.value)} className="input-cosmic">
            <option value="image">Hero: cover image</option>
            <option value="video">Hero: looping video</option>
            <option value="stream">Hero: live stream embed (YouTube/Twitch)</option>
          </select>
          {heroType !== "image" && (
            <input name="heroUrl" placeholder={heroType === "video" ? "Video file URL (mp4)" : "Stream URL (youtube.com/… or twitch.tv/channel)"} className="input-cosmic" />
          )}
          <input name="coverUrl" placeholder="Cover image URL (card + fallback hero)" className="input-cosmic" />
          <select name="trophyId" className="input-cosmic">
            <option value="">No trophy</option>
            {trophies.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.tier})</option>)}
          </select>
          <div className="flex gap-2 items-center sm:col-span-2 flex-wrap">
            <span className="text-xs text-muted">Cover framing:</span>
            <label className="text-xs text-muted flex items-center gap-1.5">zoom <input name="coverZoom" type="number" step="0.05" min="1" max="3" defaultValue={1} className="input-cosmic !w-20 !py-1" /></label>
            <label className="text-xs text-muted flex items-center gap-1.5">x% <input name="coverX" type="number" min="0" max="100" defaultValue={50} className="input-cosmic !w-20 !py-1" /></label>
            <label className="text-xs text-muted flex items-center gap-1.5">y% <input name="coverY" type="number" min="0" max="100" defaultValue={50} className="input-cosmic !w-20 !py-1" /></label>
          </div>
          <input name="prizeDescription" placeholder="Prize description" className="input-cosmic" />
          <select name="status" className="input-cosmic">
            <option value="active">Publish now</option>
            <option value="draft">Draft (auto-activates at start time)</option>
          </select>
        </div>
      </div>

      <button className="glow-btn pressable rounded-full px-8 py-2.5 font-semibold text-white inline-flex items-center gap-2">
        <Icon name="rocket" size={15} /> Launch challenge
      </button>
    </form>
  );
}
