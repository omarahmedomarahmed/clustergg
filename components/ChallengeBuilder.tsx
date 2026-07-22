"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import CoverFramer from "@/components/CoverFramer";
import MetricsGuide from "@/components/MetricsGuide";
import { saveChallenge } from "@/app/actions/admin";

export type BuilderProvider = {
  id: string;
  name: string;
  game: string;
  live: boolean;
  authType?: string;
  docsUrl?: string;
  capabilities: { key: string; label: string; unit?: string; higherIsBetter?: boolean }[];
};
export type BuilderSpace = { id: string; name: string; game: string | null };
export type BuilderTrophy = { id: string; name: string; tier: string; imageUrl: string };
export type BuilderQuest = { id: string; name: string; logoUrl: string | null };
// An existing challenge to edit (all fields pre-filled). Omitted when creating.
export type ChallengeEdit = {
  id: string; spaceId: string; provider: string; game: string; title: string; description: string;
  format: string; cadence: string; heroType: string; heroUrl: string | null;
  pointsEngine: Record<string, number>; conditions: { metric: string; op: string; value: number }[];
  thresholdTarget: number | null; startAt: string; endAt: string;
  coverUrl: string | null; coverAdjust: { zoom: number; x: number; y: number };
  trophyId: string | null; status: string; prizeDescription: string | null;
  prizes?: { first?: string[]; second?: string[]; third?: string[] } | null;
  gateQuestId: string | null; gateMinBadges: number;
};

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

// Starter ideas — one click fills the shape of a common challenge.
const IDEAS = [
  { name: "Weekly Wins Race", cadence: "weekly", format: "top3", title: "Weekly Wins Race", desc: "Rack up the most wins this week. Top 3 take the podium." },
  { name: "Daily Grind", cadence: "daily", format: "top1", title: "Daily Grind", desc: "Whoever gains the most today wins it all." },
  { name: "Monthly Marathon", cadence: "monthly", format: "top3", title: "Monthly Marathon", desc: "A month-long climb. Consistency is king." },
  { name: "First to Target", cadence: "weekly", format: "threshold_race", title: "Threshold Sprint", desc: "First to hit the target points wins. Go fast." },
];

const OPS = [">=", ">", "<=", "<", "=="];

export default function ChallengeBuilder({
  providers, spaces, trophies, quests = [], challenge,
}: { providers: BuilderProvider[]; spaces: BuilderSpace[]; trophies: BuilderTrophy[]; quests?: BuilderQuest[]; challenge?: ChallengeEdit }) {
  const editing = !!challenge;
  const [providerId, setProviderId] = useState(challenge?.provider ?? providers[0]?.id ?? "");
  const [cadence, setCadence] = useState(challenge?.cadence ?? "weekly");
  const [format, setFormat] = useState(challenge?.format ?? "top3");
  const [heroType, setHeroType] = useState(challenge?.heroType ?? "image");
  const [title, setTitle] = useState(challenge?.title ?? "");
  const [description, setDescription] = useState(challenge?.description ?? "");
  const [pointsMap, setPointsMap] = useState<Record<string, number>>(() => challenge?.pointsEngine ?? recommendPoints(providers[0]?.capabilities ?? []));
  const [conditions, setConditions] = useState<{ metric: string; op: string; value: number }[]>(challenge?.conditions ?? []);
  const [gateQuestId, setGateQuestId] = useState(challenge?.gateQuestId ?? "");

  const provider = useMemo(() => providers.find((p) => p.id === providerId), [providers, providerId]);
  const caps = provider?.capabilities ?? [];
  const matchingSpaces = useMemo(() => {
    const match = spaces.filter((s) => s.game === provider?.game);
    return match.length ? [...match, ...spaces.filter((s) => s.game !== provider?.game)] : spaces;
  }, [spaces, provider]);

  const changeProvider = (id: string) => {
    setProviderId(id);
    const p = providers.find((x) => x.id === id);
    setPointsMap(recommendPoints(p?.capabilities ?? []));
    setConditions([]);
  };
  const applyIdea = (i: typeof IDEAS[number]) => { setCadence(i.cadence); setFormat(i.format); setTitle(i.title); setDescription(i.desc); };
  const setPts = (key: string, v: number) => setPointsMap((m) => ({ ...m, [key]: v }));

  const pointsJson = JSON.stringify(Object.fromEntries(Object.entries(pointsMap).filter(([, v]) => v > 0)));
  const conditionsJson = JSON.stringify(conditions.filter((c) => c.metric));
  const toLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  return (
    <form action={saveChallenge} className="space-y-5">
      {editing && <input type="hidden" name="challengeId" value={challenge.id} />}
      {/* Ideas */}
      <div>
        <div className="text-xs uppercase tracking-widest text-muted mb-2">Start from an idea (optional)</div>
        <div className="flex flex-wrap gap-2">
          {IDEAS.map((i) => (
            <button key={i.name} type="button" onClick={() => applyIdea(i)} className="ghost-btn pressable rounded-full px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5">
              <Icon name="spark" size={12} className="text-cyan-300" /> {i.name}
            </button>
          ))}
        </div>
      </div>

      {/* Step 1: game */}
      <div>
        <div className="text-xs uppercase tracking-widest text-muted mb-2">1 · Pick the game &amp; data source</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <select name="provider" required value={providerId} onChange={(e) => changeProvider(e.target.value)} className="input-cosmic">
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.game}){p.live ? " — live" : " — needs API key"}</option>
            ))}
          </select>
          <select name="spaceId" required defaultValue={challenge?.spaceId} className="input-cosmic">
            {matchingSpaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <input type="hidden" name="game" value={provider?.game ?? ""} />
      </div>

      {/* Step 2: identity */}
      <div>
        <div className="text-xs uppercase tracking-widest text-muted mb-2">2 · Name the event</div>
        <div className="grid gap-3">
          <input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Blitz Supernova — Weekly Wins Race)" className="input-cosmic" />
          <textarea name="description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description players see on the event page" className="input-cosmic" />
        </div>
      </div>

      {/* Step 3: window */}
      <div>
        <div className="text-xs uppercase tracking-widest text-muted mb-2">3 · Time window</div>
        <div className="flex flex-wrap gap-2 mb-3">
          {CADENCES.map((cd) => (
            <button key={cd.key} type="button" onClick={() => setCadence(cd.key)} className={`stat-tab ${cadence === cd.key ? "stat-tab-active" : ""}`} title={cd.desc}>{cd.label}</button>
          ))}
        </div>
        <input type="hidden" name="cadence" value={cadence} />
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs text-muted">Starts
            <input name="startAt" type="datetime-local" defaultValue={toLocal(challenge ? new Date(challenge.startAt) : new Date())} className="input-cosmic mt-1" />
          </label>
          {cadence === "custom" ? (
            <label className="text-xs text-muted">Ends
              <input name="endAt" type="datetime-local" defaultValue={toLocal(challenge ? new Date(challenge.endAt) : new Date(Date.now() + 7 * 86400000))} className="input-cosmic mt-1" />
            </label>
          ) : (
            <div className="text-xs text-muted self-end pb-3">Ends automatically {cadence === "daily" ? "24 hours" : cadence === "weekly" ? "7 days" : "30 days"} after start.</div>
          )}
        </div>
      </div>

      {/* Step 4: scoring — visual, no JSON */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-widest text-muted">4 · Scoring engine</div>
          <button type="button" onClick={() => setPointsMap(recommendPoints(caps))} className="ghost-btn pressable rounded-full px-3 py-1 text-[11px] inline-flex items-center gap-1.5">
            <Icon name="spark" size={11} /> Recommend for {provider?.game}
          </button>
        </div>
        <input type="hidden" name="pointsEngine" value={pointsJson} />
        <input type="hidden" name="conditions" value={conditionsJson} />

        {provider && (
          <div className="mb-3">
            <MetricsGuide providerName={provider.name} game={provider.game} live={provider.live}
              authType={provider.authType} docsUrl={provider.docsUrl} capabilities={caps} />
          </div>
        )}

        <div className="glass !rounded-lg p-3 space-y-2">
          <div className="text-[11px] text-muted">Award points each time a stat goes up (leave 0 to ignore):</div>
          {caps.length === 0 ? (
            <div className="text-xs text-muted">This provider exposes no trackable metrics.</div>
          ) : caps.map((cp) => (
            <label key={cp.key} className="flex items-center gap-3 text-sm">
              <span className="flex-1 min-w-0 truncate">{cp.label} <span className="text-[10px] text-muted">({cp.key})</span></span>
              <span className="text-xs text-muted">+</span>
              <input type="number" min={0} value={pointsMap[cp.key] ?? 0} onChange={(e) => setPts(cp.key, Number(e.target.value))} className="input-cosmic !w-20 !py-1 text-sm" />
              <span className="text-xs text-muted">pts</span>
            </label>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <label className="text-xs text-muted">Winner format
            <select value={format} onChange={(e) => setFormat(e.target.value)} name="format" className="input-cosmic mt-1">
              <option value="top3">Top 3 podium</option>
              <option value="top1">Winner takes all</option>
              <option value="threshold_race">Threshold race (first to target)</option>
            </select>
          </label>
          {format === "threshold_race" && (
            <label className="text-xs text-muted">Target points
              <input name="thresholdTarget" type="number" placeholder="e.g. 100" defaultValue={challenge?.thresholdTarget ?? undefined} className="input-cosmic mt-1" />
            </label>
          )}
        </div>

        {/* Qualification conditions — visual */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted">Qualification conditions (optional)</span>
            <button type="button" onClick={() => setConditions((c) => [...c, { metric: caps[0]?.key ?? "", op: ">=", value: 0 }])} className="text-xs text-cyan-300 hover:underline inline-flex items-center gap-1"><Icon name="spark" size={11} /> Add condition</button>
          </div>
          {conditions.length === 0 ? (
            <div className="text-[11px] text-muted">No conditions — everyone who joins qualifies.</div>
          ) : (
            <div className="space-y-2">
              {conditions.map((cond, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select value={cond.metric} onChange={(e) => setConditions((c) => c.map((x, j) => j === i ? { ...x, metric: e.target.value } : x))} className="input-cosmic !py-1 text-sm flex-1">
                    {caps.map((cp) => <option key={cp.key} value={cp.key}>{cp.label}</option>)}
                  </select>
                  <select value={cond.op} onChange={(e) => setConditions((c) => c.map((x, j) => j === i ? { ...x, op: e.target.value } : x))} className="input-cosmic !py-1 !w-20 text-sm">
                    {OPS.map((o) => <option key={o}>{o}</option>)}
                  </select>
                  <input type="number" value={cond.value} onChange={(e) => setConditions((c) => c.map((x, j) => j === i ? { ...x, value: Number(e.target.value) } : x))} className="input-cosmic !py-1 !w-24 text-sm" />
                  <button type="button" onClick={() => setConditions((c) => c.filter((_, j) => j !== i))} className="text-rose-300 hover:text-rose-200"><Icon name="x" size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quest-badge entry gate — restrict who can join by quest completions */}
        {quests.length > 0 && (
          <div className="mt-3">
            <div className="text-xs text-muted mb-1.5">Quest-badge entry gate (optional)</div>
            <div className="glass !rounded-lg p-3 flex flex-wrap items-center gap-3">
              <span className="text-[11px] text-muted">Require</span>
              <input name="gateMinBadges" type="number" min={0} defaultValue={challenge?.gateMinBadges ?? 0}
                className="input-cosmic !w-20 !py-1 text-sm" />
              <span className="text-[11px] text-muted">badge(s) of</span>
              <select name="gateQuestId" value={gateQuestId} onChange={(e) => setGateQuestId(e.target.value)} className="input-cosmic !py-1 text-sm flex-1 min-w-[160px]">
                <option value="">— no quest requirement —</option>
                {quests.map((qq) => <option key={qq.id} value={qq.id}>{qq.name}</option>)}
              </select>
              <span className="text-[11px] text-muted w-full">A gamer earns 1 badge each time they complete this quest. Set 0 (or no quest) to let everyone join.</span>
            </div>
          </div>
        )}
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
            <input name="heroUrl" placeholder={heroType === "video" ? "Video file URL (mp4)" : "Stream URL (youtube.com/… or twitch.tv/channel)"} defaultValue={challenge?.heroUrl ?? undefined} className="input-cosmic" />
          )}
          <div className="sm:col-span-2">
            <CoverFramer name="coverUrl" maxDim={1400} defaultUrl={challenge?.coverUrl ?? ""} defaultAdjust={challenge?.coverAdjust} label="Cover image (card + hero)" hint="Drag to reposition, slider to zoom." />
          </div>
          {/* Podium prizes — one or MORE trophies per place (Ctrl/Cmd-click to
              multi-select). 2nd/3rd only apply to podium formats. */}
          <div className="sm:col-span-2 grid sm:grid-cols-3 gap-3">
            {([["prize:first", "1st place trophies", challenge?.prizes?.first ?? (challenge?.trophyId ? [challenge.trophyId] : [])],
               ["prize:second", "2nd place trophies (podium)", challenge?.prizes?.second ?? []],
               ["prize:third", "3rd place trophies (podium)", challenge?.prizes?.third ?? []]] as [string, string, string[]][]).map(([name, label, dflt]) => (
              <label key={name} className="block text-xs text-muted">
                {label}
                <select name={name} multiple defaultValue={dflt} size={4} className="input-cosmic mt-1 w-full !py-1 text-xs">
                  {trophies.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.tier})</option>)}
                </select>
              </label>
            ))}
          </div>
          <input name="prizeDescription" placeholder="Prize description" defaultValue={challenge?.prizeDescription ?? undefined} className="input-cosmic" />
          <select name="status" defaultValue={challenge?.status ?? "active"} className="input-cosmic sm:col-span-2">
            <option value="active">Active (publish now)</option>
            <option value="draft">Draft (auto-activates at start time)</option>
            {editing && <option value="completed">Completed (closed)</option>}
            {editing && <option value="cancelled">Cancelled</option>}
          </select>
        </div>
      </div>

      <button className="glow-btn pressable rounded-full px-8 py-2.5 font-semibold text-white inline-flex items-center gap-2">
        <Icon name="rocket" size={15} /> {editing ? "Save changes" : "Launch challenge"}
      </button>
    </form>
  );
}
