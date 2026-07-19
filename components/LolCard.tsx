"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

// ---- shapes mirrored from lib/providers/riot-lol-rich ----
type Champ = { championId: number; name: string; iconUrl: string; splashUrl: string; level: number; points: number; lastPlayed: number | null; masteryTitle: string; tokensEarned?: number; chestGranted?: boolean };
type Match = { matchId: string; queue: string; win: boolean; remake: boolean; champion: string; championIconUrl: string; champLevel: number; kills: number; deaths: number; assists: number; kda: string; cs: number; csPerMin: number; goldEarned: number; damage: number; visionScore: number; position: string; durationSec: number; gameEndMs: number };
type Live = { inGame: boolean; gameMode?: string; queue?: string; champion?: string; championIconUrl?: string; startMs?: number };
export type LolSnapshot = { ok: boolean; error?: string; profileIconUrl: string | null; summonerLevel: number | null; live: Live | null; champions: Champ[]; matches: Match[] };
type MatchPlayer = { puuid: string; name: string; champion: string; championIconUrl: string; champLevel: number; kills: number; deaths: number; assists: number; cs: number; damage: number; gold: number; visionScore: number; win: boolean; team: number; position: string; items: string[]; isSubject: boolean };
type MatchDetail = { ok: boolean; matchId: string; queue: string; gameMode: string; durationSec: number; gameEndMs: number; win: boolean; teams: { team: number; win: boolean; players: MatchPlayer[] }[] };

export type LolColors = { accent: string; accent2: string; text: string; muted: string; panel: string };

const ago = (ms: number) => {
  if (!ms) return "";
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
const dur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
const elapsed = (startMs?: number) => startMs ? `${Math.floor((Date.now() - startMs) / 60000)}m` : "";

export default function LolCard({
  accountId, colors, statNumbers, snapshot,
}: {
  accountId: string;
  colors: LolColors;
  statNumbers: { label: string; value: string }[];
  snapshot?: LolSnapshot | null; // pre-fetched by the parent (shares one request)
}) {
  const c = colors;
  const [snap, setSnap] = useState<LolSnapshot | null>(snapshot ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<{ kind: "home" } | { kind: "match"; id: string } | { kind: "champ"; champ: Champ }>({ kind: "home" });

  useEffect(() => {
    if (snapshot) { setSnap(snapshot); if (!snapshot.ok) setErr(snapshot.error ?? null); return; }
    let alive = true;
    fetch(`/api/lol/snapshot?account=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((s: LolSnapshot) => { if (!alive) return; setSnap(s); if (!s.ok) setErr(s.error ?? "Couldn't load League data."); })
      .catch(() => alive && setErr("Couldn't load League data."));
    return () => { alive = false; };
  }, [accountId, snapshot]);

  const box = "rounded-xl p-2.5";
  const soft = "rgba(255,255,255,0.06)";

  if (err && !snap?.matches.length && !snap?.champions.length) {
    return <div className="text-xs pt-1" style={{ color: c.muted }}>{err}</div>;
  }
  if (!snap) {
    return <div className="text-xs pt-1 animate-pulse" style={{ color: c.muted }}>Loading League snapshot…</div>;
  }

  // ---- Champion detail ----
  if (view.kind === "champ") {
    const ch = view.champ;
    return (
      <div className="relative overflow-hidden rounded-xl" style={{ border: `1px solid ${c.accent}33` }}>
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `linear-gradient(rgba(4,5,26,0.72), rgba(4,5,26,0.92)), url(${ch.splashUrl})` }} />
        <div className="relative p-4">
          <button onClick={() => setView({ kind: "home" })} className="text-xs mb-3 inline-flex items-center gap-1" style={{ color: c.accent2 }}><Icon name="arrowLeft" size={12} /> Back</button>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ch.iconUrl} alt="" className="h-16 w-16 rounded-lg border" style={{ borderColor: `${c.accent}66` }} />
            <div>
              <div className="text-lg font-bold" style={{ color: "#fff" }}>{ch.name}</div>
              <div className="text-xs" style={{ color: c.accent2 }}>Mastery {ch.level}{ch.masteryTitle ? ` · ${ch.masteryTitle}` : ""}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Stat label="Mastery points" value={ch.points.toLocaleString()} c={c} soft={soft} />
            <Stat label="Mastery level" value={String(ch.level)} c={c} soft={soft} />
            {ch.tokensEarned != null && <Stat label="Tokens earned" value={String(ch.tokensEarned)} c={c} soft={soft} />}
            {ch.chestGranted != null && <Stat label="Chest" value={ch.chestGranted ? "Earned ✓" : "Available"} c={c} soft={soft} />}
            {ch.lastPlayed && <Stat label="Last played" value={ago(ch.lastPlayed)} c={c} soft={soft} />}
          </div>
        </div>
      </div>
    );
  }

  // ---- Match detail ----
  if (view.kind === "match") {
    return <MatchDetailView accountId={accountId} matchId={view.id} colors={c} onBack={() => setView({ kind: "home" })} />;
  }

  // ---- Home (list) ----
  const live = snap.live?.inGame;
  return (
    <div className="space-y-4 pt-1">
      {/* Live now */}
      {live && (
        <div className="flex items-center gap-2.5 rounded-xl p-2.5" style={{ background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.4)" }}>
          <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" /></span>
          {snap.live?.championIconUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={snap.live.championIconUrl} alt="" className="h-8 w-8 rounded-lg" />}
          <div className="min-w-0">
            <div className="text-sm font-bold text-rose-200">In a live game now</div>
            <div className="text-[11px] text-rose-200/80 truncate">{snap.live?.queue}{snap.live?.champion ? ` · ${snap.live.champion}` : ""}{snap.live?.startMs ? ` · ${elapsed(snap.live.startMs)}` : ""}</div>
          </div>
        </div>
      )}

      {/* Match history (first, clickable) */}
      {snap.matches.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-widest mb-1.5" style={{ color: c.muted }}>Recent matches</div>
          <div className="space-y-1.5">
            {snap.matches.map((m) => (
              <button key={m.matchId} onClick={() => setView({ kind: "match", id: m.matchId })}
                className="w-full flex items-center gap-2.5 rounded-xl p-2 text-left transition hover:brightness-125"
                style={{ background: soft, borderLeft: `3px solid ${m.remake ? "#94a3b8" : m.win ? "#34d399" : "#f43f5e"}` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.championIconUrl} alt="" className="h-9 w-9 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate" style={{ color: c.text }}>{m.champion} <span className="text-[10px] font-normal" style={{ color: c.muted }}>{m.position}</span></div>
                  <div className="text-[11px]" style={{ color: c.muted }}>{m.queue} · {ago(m.gameEndMs)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold" style={{ color: c.text }}>{m.kills}/{m.deaths}/{m.assists}</div>
                  <div className="text-[10px]" style={{ color: m.remake ? "#94a3b8" : m.win ? "#34d399" : "#f87171" }}>{m.remake ? "Remake" : m.win ? "Victory" : "Defeat"} · {m.kda} KDA</div>
                </div>
                <Icon name="chevronRight" size={14} style={{ color: c.muted }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Top champions (big images, clickable) */}
      {snap.champions.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-widest mb-1.5" style={{ color: c.muted }}>Top champions</div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {snap.champions.map((ch) => (
              <button key={ch.championId} onClick={() => setView({ kind: "champ", champ: ch })} className="shrink-0 text-center group" style={{ width: 74 }}>
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ch.iconUrl} alt="" className="h-[74px] w-[74px] rounded-xl border transition group-hover:scale-105" style={{ borderColor: `${c.accent}55` }} />
                  <span className="absolute -bottom-1 -right-1 rounded-md px-1.5 py-0.5 text-[10px] font-black text-black" style={{ background: c.accent2 }}>M{ch.level}</span>
                </div>
                <div className="text-[11px] font-semibold truncate mt-1.5" style={{ color: c.text }}>{ch.name}</div>
                <div className="text-[10px]" style={{ color: c.muted }}>{fmt(ch.points)} pts</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Existing stat numbers */}
      {statNumbers.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-widest mb-1.5" style={{ color: c.muted }}>Ranked & profile</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {statNumbers.map((s, i) => (
              <div key={i} className={box} style={{ background: soft }}>
                <div className="text-[10px] uppercase tracking-wider truncate" style={{ color: c.muted }}>{s.label}</div>
                <div className="font-bold" style={{ color: c.accent2 }}>{s.value}</div>
              </div>
            ))}
            {snap.summonerLevel != null && (
              <div className={box} style={{ background: soft }}>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: c.muted }}>Summoner level</div>
                <div className="font-bold" style={{ color: c.accent2 }}>{snap.summonerLevel}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {err && <div className="text-[11px]" style={{ color: c.muted }}>{err}</div>}
    </div>
  );
}

function Stat({ label, value, c, soft }: { label: string; value: string; c: LolColors; soft: string }) {
  return (
    <div className="rounded-lg px-2.5 py-1.5" style={{ background: soft }}>
      <div className="text-[10px] uppercase tracking-wider truncate" style={{ color: c.muted }}>{label}</div>
      <div className="font-bold" style={{ color: "#fff" }}>{value}</div>
    </div>
  );
}

function MatchDetailView({ accountId, matchId, colors, onBack }: { accountId: string; matchId: string; colors: LolColors; onBack: () => void }) {
  const c = colors;
  const [d, setD] = useState<MatchDetail | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(`/api/lol/match?account=${encodeURIComponent(accountId)}&match=${encodeURIComponent(matchId)}`, { cache: "no-store" })
      .then((r) => r.json()).then((j: MatchDetail) => { if (!alive) return; if (j.ok) setD(j); else setErr(true); })
      .catch(() => alive && setErr(true));
    return () => { alive = false; };
  }, [accountId, matchId]);

  const back = <button onClick={onBack} className="text-xs mb-3 inline-flex items-center gap-1" style={{ color: c.accent2 }}><Icon name="arrowLeft" size={12} /> Back to matches</button>;
  if (err) return <div>{back}<div className="text-xs" style={{ color: c.muted }}>Couldn&apos;t load this match.</div></div>;
  if (!d) return <div>{back}<div className="text-xs animate-pulse" style={{ color: c.muted }}>Loading match…</div></div>;

  const maxDmg = Math.max(1, ...d.teams.flatMap((t) => t.players.map((p) => p.damage)));

  return (
    <div>
      {back}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-bold" style={{ color: d.win ? "#34d399" : "#f87171" }}>{d.win ? "Victory" : "Defeat"}</div>
          <div className="text-[11px]" style={{ color: c.muted }}>{d.queue} · {dur(d.durationSec)} · {ago(d.gameEndMs)}</div>
        </div>
      </div>
      <div className="space-y-3">
        {d.teams.map((t) => (
          <div key={t.team} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${t.win ? "#34d39944" : "#f43f5e44"}` }}>
            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest" style={{ background: t.win ? "#34d39922" : "#f43f5e22", color: t.win ? "#34d399" : "#f87171" }}>{t.win ? "Winning team" : "Losing team"}</div>
            <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              {t.players.map((p) => (
                <div key={p.puuid} className="flex items-center gap-2 p-1.5" style={p.isSubject ? { background: `${c.accent}1f` } : undefined}>
                  <div className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.championIconUrl} alt="" className="h-8 w-8 rounded-md" />
                    <span className="absolute -bottom-1 -right-1 rounded px-0.5 text-[8px] font-bold text-black" style={{ background: "#cbd5e1" }}>{p.champLevel}</span>
                  </div>
                  <div className="min-w-0 w-20 sm:w-28">
                    <div className="text-[11px] font-semibold truncate" style={{ color: p.isSubject ? c.accent2 : c.text }}>{p.name.split("#")[0]}</div>
                    <div className="text-[9px]" style={{ color: c.muted }}>{p.position}</div>
                  </div>
                  <div className="text-[11px] font-bold tabular-nums shrink-0 w-14 text-center" style={{ color: c.text }}>{p.kills}/{p.deaths}/{p.assists}</div>
                  <div className="text-[10px] shrink-0 w-10 text-center" style={{ color: c.muted }}>{p.cs} cs</div>
                  <div className="flex-1 min-w-0 hidden sm:block">
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <div className="h-full rounded-full" style={{ width: `${(p.damage / maxDmg) * 100}%`, background: c.accent }} />
                    </div>
                    <div className="text-[9px] mt-0.5" style={{ color: c.muted }}>{fmt(p.damage)} dmg</div>
                  </div>
                  <div className="hidden sm:flex gap-0.5 shrink-0">
                    {p.items.slice(0, 6).map((it, i) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={i} src={it} alt="" className="h-4 w-4 rounded-sm" />)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
