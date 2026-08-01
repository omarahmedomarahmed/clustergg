"use client";

import { useMemo, useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { downscale } from "@/lib/downscale";
import { portalBuyCampaign } from "@/app/actions/brand-portal";

// The media buying tool.
//
// Everything a brand needs to buy a month of Discord is on one screen, in the
// order a media buyer actually thinks: who can I reach → in which game → for
// how much → starting when → with what creative. No proposal, no insertion
// order, no call. That sequence is the product claim; a form that ends in
// "we'll be in touch" would falsify it on the page that makes it.
//
// Two things are said plainly rather than buried, because both are unusual and
// both are the reason to buy:
//
//   * 70% of the money is prize money. A brand is not renting attention, it is
//     paying gamers to play — inside the servers they already live in.
//   * There are no setup fees, no ad ops and no staff. The whole month is the
//     number on the button.

export type BuilderGame = {
  game: string;
  logoUrl: string | null;
  servers: number;
  unlockedServers: number;
  gamers: number;
  verifiedPlayers: number;
  regions: { key: string; label: string; servers: number; gamers: number }[];
  /** Already carrying somebody's sponsored challenge this week. */
  busy: boolean;
  /** This brand already has a month running here. */
  owned: boolean;
};

export type BuilderQuote = {
  slots: number;
  pricePerChallenge: number;
  prizePerChallenge: number;
  feePerChallenge: number;
  total: number;
  prizeTotal: number;
  prizeSharePct: number;
};

export default function CampaignBuilder({
  brandId, keyStr, games, quote, network, weeks, currency = "USD",
}: {
  brandId: string;
  keyStr: string;
  games: BuilderGame[];
  quote: BuilderQuote;
  network: { servers: number; unlockedServers: number; gamers: number };
  /** The four windows they're buying, already computed server-side. */
  weeks: { startAt: string; endAt: string }[];
  currency?: string;
}) {
  const [game, setGame] = useState<string | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [perWeek, setPerWeek] = useState<(string | null)[]>([null, null, null, null]);
  const [split, setSplit] = useState(false);
  const [regions, setRegions] = useState<string[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const picked = useMemo(() => games.find((g) => g.game === game) ?? null, [games, game]);
  const n = (v: number) => v.toLocaleString("en-US");
  const money = (v: number) => `$${n(Math.round(v))}`;
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  // Targeted reach: the gamers in the regions they picked, or all of them.
  const reach = useMemo(() => {
    if (!picked) return 0;
    if (!regions.length) return picked.gamers;
    return picked.regions.filter((r) => regions.includes(r.key)).reduce((s, r) => s + r.gamers, 0);
  }, [picked, regions]);

  const upload = async (file: File, into: number | "shared") => {
    setBusy(into === "shared" ? -1 : into);
    setMsg(null);
    try {
      const dataUrl = await downscale(file, 1600, 0.88);
      const res = await fetch("/api/brands/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, key: keyStr, dataUrl }),
      });
      const json = await res.json();
      if (!json?.url) { setMsg(json?.error ?? "Upload failed"); setBusy(null); return; }
      if (into === "shared") setCover(json.url);
      else setPerWeek((prev) => prev.map((v, i) => (i === into ? json.url : v)));
    } catch (e) {
      setMsg(`Upload failed — ${(e as Error)?.message || "the browser couldn't read that file"}`);
    }
    setBusy(null);
  };

  const buy = () => {
    if (!game) return;
    start(async () => {
      const fd = new FormData();
      fd.set("game", game);
      fd.set("coverUrl", cover ?? "");
      fd.set("slotCovers", JSON.stringify(split ? perWeek : []));
      fd.set("targeting", JSON.stringify({ regions }));
      const r = await portalBuyCampaign(brandId, keyStr, fd);
      if (r?.error) { setMsg(r.error); return; }
      setDone(true);
      setMsg(null);
    });
  };

  const working = pending || busy !== null;

  if (done) {
    return (
      <section className="rounded-2xl border border-emerald-400/30 bg-emerald-500/[0.06] p-6">
        <div className="flex items-start gap-3">
          <Icon name="check" size={20} className="mt-0.5 shrink-0 text-emerald-300" />
          <div>
            <h2 className="text-lg font-bold">Your month of {game} is with our team.</h2>
            <p className="mt-1.5 text-sm text-muted max-w-2xl">
              Week one goes into review now and lands in every eligible server once it&apos;s approved —
              usually the same day. The other three weeks are already scheduled and you can change their
              covers any time before each one starts. Everything after that shows up in Campaigns below:
              impressions, entrants, standings, and which servers they came from.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-cyan-400/25 bg-cyan-500/[0.05] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">Buy a campaign</div>
          <h2 className="mt-1 text-xl sm:text-2xl font-bold">A month of sponsored challenges</h2>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">
            Pick a game. Four weekly challenges run under your brand inside every Discord server that
            plays it — and <b className="text-ink">{quote.prizeSharePct}% of what you pay is prize money
            your audience wins</b>. One month, one payment, nothing to cancel.
          </p>
        </div>
        <div className="shrink-0 rounded-xl border border-white/12 bg-black/25 px-4 py-2.5 text-right">
          <div className="text-[10px] uppercase tracking-widest text-muted">Network right now</div>
          <div className="text-lg font-bold tabular-nums">{n(network.gamers)} <span className="text-sm font-normal text-muted">gamers</span></div>
          <div className="text-[11px] text-muted">
            {n(network.unlockedServers)} of {n(network.servers)} servers unlocked
          </div>
        </div>
      </div>

      {/* ===== 1. The game bar ===== */}
      <div className="mt-6">
        <Step n={1} label="Pick the game" />
        <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
          {games.map((g) => {
            const on = g.game === game;
            const blocked = g.owned;
            return (
              <button
                key={g.game} type="button" disabled={blocked}
                onClick={() => setGame(on ? null : g.game)}
                title={blocked ? "You already have a month running here" : `${n(g.verifiedPlayers)} verified players`}
                className={`shrink-0 rounded-xl border px-3 py-2.5 text-left transition min-w-[150px] ${
                  on ? "border-cyan-400 bg-cyan-500/15"
                    : blocked ? "border-white/8 opacity-40 cursor-not-allowed"
                      : "border-white/12 hover:border-white/30"
                }`}
              >
                <div className="flex items-center gap-2">
                  {g.logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ (
                    <img src={g.logoUrl} alt="" className="h-6 w-6 rounded object-cover" />
                  )}
                  <span className="font-semibold text-sm truncate">{g.game}</span>
                </div>
                <div className="mt-1 text-[11px] tabular-nums text-muted">
                  {n(g.verifiedPlayers)} verified · {n(g.servers)} server{g.servers === 1 ? "" : "s"}
                </div>
                {g.busy && !blocked && (
                  <div className="mt-0.5 text-[10px] text-amber-300">a challenge is running — yours queues next</div>
                )}
                {blocked && <div className="mt-0.5 text-[10px] text-muted">already yours this month</div>}
              </button>
            );
          })}
        </div>
      </div>

      {picked && (
        <>
          {/* ===== 2. What that game reaches ===== */}
          <div className="mt-6">
            <Step n={2} label={`What ${picked.game} reaches`} />
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Verified players" value={n(picked.verifiedPlayers)} accent />
              <Stat label="Gamers in these servers" value={n(picked.gamers)} />
              <Stat label="Servers playing it" value={n(picked.servers)} />
              <Stat label="Unlocked for sponsors" value={n(picked.unlockedServers)} />
            </div>
            {picked.regions.length > 0 && (
              <div className="mt-3">
                <div className="text-[11px] uppercase tracking-widest text-muted mb-2">
                  Narrow it by region — or leave it open, which reaches everyone
                </div>
                <div className="flex flex-wrap gap-2">
                  {picked.regions.map((r) => {
                    const on = regions.includes(r.key);
                    return (
                      <button
                        key={r.key} type="button"
                        onClick={() => setRegions((prev) => (on ? prev.filter((k) => k !== r.key) : [...prev, r.key]))}
                        className={`rounded-full border px-3 py-1.5 text-xs transition ${
                          on ? "border-cyan-400 bg-cyan-500/15 text-ink" : "border-white/12 text-muted hover:text-ink"
                        }`}
                      >
                        {r.label} <span className="tabular-nums opacity-70">· {n(r.gamers)}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  Targeted reach: <b className="text-ink tabular-nums">{n(reach)}</b> gamers.
                  Regions come from what each server&apos;s own owner told us about their community.
                </p>
              </div>
            )}
          </div>

          {/* ===== 3. The four weeks ===== */}
          <div className="mt-6">
            <Step n={3} label="Your four weeks" />
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {weeks.map((w, i) => (
                <div key={i} className="rounded-xl border border-white/12 bg-black/20 p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-bold">Week {i + 1}</span>
                    <span className="text-[10px] uppercase tracking-widest text-muted">
                      {i === 0 ? "goes live first" : "queued"}
                    </span>
                  </div>
                  <div className="mt-1 text-sm tabular-nums">{day(w.startAt)} — {day(w.endAt)}</div>
                  <div className="mt-2 aspect-[1200/630] overflow-hidden rounded-lg border border-white/10 bg-black/40">
                    {(split ? perWeek[i] : cover)
                      ? /* eslint-disable-next-line @next/next/no-img-element */ (
                        <img src={(split ? perWeek[i] : cover) as string} alt="" className="h-full w-full object-cover" />
                      )
                      : <div className="grid h-full place-items-center text-[10px] text-muted">no cover yet</div>}
                  </div>
                  {split && (
                    <label className={`mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/20 py-1.5 text-[11px] font-semibold cursor-pointer hover:border-cyan-400/50 ${busy === i ? "opacity-60 pointer-events-none" : ""}`}>
                      <Icon name="plus" size={11} /> {busy === i ? "Uploading…" : perWeek[i] ? "Replace" : "Upload"}
                      <input type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, i); }} />
                    </label>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              One challenge runs at a time on a game. Week one starts on the date above; each week after it
              opens as the one before it ends — so your brand is never competing with itself for the same players.
            </p>
          </div>

          {/* ===== 4. The creative ===== */}
          <div className="mt-6">
            <Step n={4} label="Your cover" />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className={`flex items-center gap-2 rounded-xl border border-dashed border-cyan-400/40 bg-cyan-500/[0.06] px-5 py-3 text-sm font-semibold cursor-pointer transition hover:border-cyan-300/70 ${busy === -1 ? "opacity-60 pointer-events-none" : ""}`}>
                <Icon name="plus" size={14} />
                {busy === -1 ? "Uploading…" : cover ? "Replace the cover" : "Upload one cover for all four"}
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, "shared"); }} />
              </label>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} className="accent-cyan-500" />
                Use a different cover each week
              </label>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              1200×630. It leads the challenge card the bot posts into every server. Optional — we&apos;ll use the
              game&apos;s own art if you skip it.
            </p>
          </div>

          {/* ===== 5. The bill ===== */}
          <div className="mt-6 rounded-2xl border border-white/12 bg-black/25 p-4">
            <Step n={5} label="What it costs" />
            <div className="mt-3 space-y-1.5 text-sm">
              <Line label={`${quote.slots} weekly challenges on ${picked.game}`} value={money(quote.total)} />
              <Line label={`Prize money to your audience (${quote.prizeSharePct}%)`} value={money(quote.prizeTotal)} sub />
              <Line label="Platform fee" value={money(quote.total - quote.prizeTotal)} sub />
              <Line label="Setup, ad ops, account management" value="$0" sub />
              <div className="border-t border-white/10 pt-2 mt-2 flex items-baseline justify-between">
                <span className="font-bold">Total for the month</span>
                <span className="text-2xl font-bold tabular-nums">{money(quote.total)} <span className="text-xs font-normal text-muted">{currency}</span></span>
              </div>
            </div>
            <button
              type="button" onClick={buy} disabled={working}
              className="brand-btn pressable mt-4 w-full rounded-full px-6 py-3 font-bold disabled:opacity-60"
            >
              {pending ? "Sending…" : `Buy ${quote.slots} challenges on ${picked.game}`}
            </button>
            <p className="mt-2 text-center text-[11px] text-muted">
              Goes to our team for review, then live. You are billed for the month, once.
            </p>
            {msg && <p className="mt-2 text-center text-[11px] text-amber-300">{msg}</p>}
          </div>
        </>
      )}

      {!picked && (
        <p className="mt-5 text-sm text-muted">
          Pick a game above to see who it reaches and what a month costs.
        </p>
      )}
    </section>
  );
}

function Step({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-200">{n}</span>
      <span className="text-[11px] uppercase tracking-widest text-muted">{label}</span>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${accent ? "border-cyan-400/30 bg-cyan-500/[0.07]" : "border-white/10 bg-black/20"}`}>
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${accent ? "text-cyan-300" : ""}`}>{value}</div>
    </div>
  );
}

function Line({ label, value, sub }: { label: string; value: string; sub?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${sub ? "text-muted" : ""}`}>
      <span className={sub ? "text-xs pl-3" : ""}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
