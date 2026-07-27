"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import { voteFromBand, type WeekVoteState } from "@/app/actions/profile-week";
import { optImg } from "@/lib/img";

// Profile of the Week — an extension of the nav bar, on every page.
//
// Two states, and the distinction is load-bearing:
//
//   Collapsed — a slim strip INSIDE the sticky header, showing the podium and
//               the countdown. Always visible, on every page, at any scroll
//               position. This is the thing that makes the competition feel
//               live rather than like a page you have to go and find.
//
//   Expanded  — the full board, as a panel that DROPS from the nav and overlays
//               the page, wherever you are in it. It does not push content
//               down and does not insert itself at the top of the document:
//               expanding it from halfway through a page used to move the
//               board somewhere you couldn't see. The page keeps its scroll
//               position and stays scrollable behind the panel.
//
// Expanded is the default, because the point of a weekly competition is that
// people see it without looking for it. The choice is remembered per browser —
// somebody who collapses it has said something, and re-expanding it on every
// navigation would be arguing with them.

export type BandEntry = {
  rank: number;
  userId: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bgImage: string | null;
  accent: string;
  accent2: string;
  title: string | null;
  weekVotes: number;
  lifetimeVotes: number;
  adjustment: number;
  disqualified: boolean;
  votedByMe: boolean;
};

export type BandData = {
  week: { key: string; startsAt: string; votingEndsAt: string; endsAt: string; phase: "voting" | "announcement"; timezone: string };
  entries: BandEntry[];
  votingOpen: boolean;
  closedReason: "announcement" | "frozen" | null;
  stream: { url: string | null; live: boolean };
  result: {
    podium: { userId: string; slug: string; displayName: string; votes: number }[];
    announcedAt: string | null;
    trophy: { id: string; name: string; imageUrl: string; tier: string; value: number } | null;
  } | null;
  takenAt: string;
  signedIn: boolean;
  me: { id: string; slug: string } | null;
};

const STORE_KEY = "cluster.week.collapsed";
const nf = (n: number) => n.toLocaleString();

export default function WeekBand({ initial }: { initial: BandData }) {
  const [data, setData] = useState<BandData>(initial);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [note, setNote] = useState<{ slug: string; text: string } | null>(null);
  // Mounted-yet? The board is portalled to <body>, which doesn't exist during
  // the server render.
  const [mounted, setMounted] = useState(false);

  // Read the remembered choice after mount. Reading it during render would
  // make the server and the first client paint disagree.
  useEffect(() => {
    setMounted(true);
    try { setOpen(window.localStorage.getItem(STORE_KEY) !== "1"); } catch { /* private mode */ }
  }, []);

  // Where the nav actually ends, published as a CSS variable.
  //
  // The panel hangs off the bottom of the header, and the header's height is
  // not a constant: it grows on mobile, and the collapsed strip is part of it.
  // Measuring beats guessing — a hard-coded offset leaves either a gap or an
  // overlap on every viewport it wasn't written for. Re-measured on resize, and
  // whenever the header itself changes size.
  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const apply = () => {
      document.documentElement.style.setProperty("--nav-h", `${Math.round(header.getBoundingClientRect().height)}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(header);
    window.addEventListener("resize", apply);
    return () => { ro.disconnect(); window.removeEventListener("resize", apply); };
  }, []);

  // Escape closes it, like every other overlay on the site.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") toggle(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      try { window.localStorage.setItem(STORE_KEY, next ? "0" : "1"); } catch { /* private mode */ }
      return next;
    });
  };

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/week-board?limit=25", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch { /* the board on screen is still the last good one */ } finally { setBusy(false); }
  }, []);

  // A quiet poll while it's open, so a board people are actively voting on
  // doesn't sit still. Paused when the tab is hidden — nobody is watching, and
  // it would just be traffic.
  //
  // Five minutes, not one. This band is on EVERY page, so the interval is
  // multiplied by every open tab of the whole site: at 60s a single tab left
  // open all day was 1,440 uncached function calls, and that is billed origin
  // transfer for a leaderboard that moves a few times an hour. Voting already
  // refreshes the board immediately on the way back, and the Refresh button is
  // right there for anyone who wants it sooner.
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => { if (!document.hidden) void refresh(); }, 300_000);
    return () => clearInterval(id);
  }, [open, refresh]);

  const podium = data.entries.filter((e) => !e.disqualified).slice(0, 3);
  const announcing = data.week.phase === "announcement";
  const streaming = announcing && data.stream.live && !!data.stream.url;

  return (
    <>
      {/* ===== The strip — always in the sticky header ===== */}
      <div className="border-t border-white/10 bg-[#04051a]/70">
        <div className="mx-auto flex h-11 max-w-6xl items-center gap-3 px-4">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label="Profile of the Week"
            data-week-toggle
            className="group flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest"
              style={{ borderColor: streaming ? "#f43f5e88" : "#fbbf2455", color: streaming ? "#fda4af" : "#fcd34d", background: streaming ? "#f43f5e14" : "#fbbf2414" }}>
              {streaming
                ? <><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" /> Live now</>
                : <><Icon name="crown" size={11} /> Profile of the Week</>}
            </span>

            {/* The podium, inline. This is the whole competition at a glance. */}
            <span className="hidden min-w-0 flex-1 items-center gap-2 sm:flex">
              {podium.length === 0 && <span className="text-xs text-muted">Nobody has votes yet — be the first.</span>}
              {podium.map((e, i) => (
                <span key={e.userId} className="flex min-w-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] py-0.5 pl-0.5 pr-2.5">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-black text-[#04051a]" style={{ background: MEDAL[i] }}>
                    {i + 1}
                  </span>
                  <span className="truncate text-[11px] font-semibold">{e.displayName}</span>
                  <span className="shrink-0 text-[11px] font-black tabular-nums" style={{ color: MEDAL[i] }}>{nf(e.weekVotes)}</span>
                </span>
              ))}
            </span>

            <Countdown data={data} className="ml-auto hidden shrink-0 text-[11px] text-muted md:block" />
            <span className="shrink-0 text-muted transition-colors group-hover:text-ink">
              <Icon name={open ? "chevronDown" : "chevronRight"} size={16} className={open ? "rotate-180" : ""} />
            </span>
          </button>
        </div>
      </div>

      {/* ===== The board — a panel that DROPS from the nav, over the page =====

          Fixed to the top of the viewport, not inserted into the document. It
          used to be portalled into a slot below the header, which meant opening
          it pushed the whole page down and it only existed at the very top of
          the document — so from halfway down an article you'd expand it and see
          nothing move. Now it hangs off the nav wherever you are, overlays what
          you were reading, and leaves the page's scroll position untouched.

          Portalled to <body> because the nav uses `backdrop-blur`, and a
          blurred ancestor becomes the containing block for `position: fixed` —
          a fixed panel rendered inside the header is positioned against the
          HEADER, not the viewport, and collapses to a sliver. */}
      {open && mounted && createPortal(
        <>
          {/* Click-away, and a dimmer so the board reads as ON TOP of the page
              rather than as part of it. Not a scroll lock: the brief was
              explicitly that the page underneath stays scrollable. */}
          <button
            aria-hidden
            tabIndex={-1}
            onClick={toggle}
            className="fixed inset-0 z-[60] cursor-default bg-[#04051a]/40"
            style={{ top: "var(--nav-h, 96px)" }}
          />
          <section
            className="fixed inset-x-0 z-[61] max-h-[calc(100dvh-var(--nav-h,96px))] overflow-y-auto overscroll-contain border-b border-white/10 bg-[#04051a]/95 backdrop-blur-xl shadow-2xl"
            style={{ top: "var(--nav-h, 96px)" }}
            role="region"
            aria-label="Profile of the Week"
          >
          <div className="mx-auto max-w-6xl px-4 py-6">
            <Header data={data} busy={busy} onRefresh={refresh} onCollapse={toggle} />

            {/* On announcement day the stream leads and the board sits under it —
                the winners being called is the event, the standings are context. */}
            {streaming && <Stream url={data.stream.url!} />}

            {data.result && <Called result={data.result} me={data.me} />}

            {podium.length > 0 && <Podium entries={podium} onOpen={setOpenSlug} data={data} note={note} setNote={setNote} onVoted={refresh} />}

            <Rows
              entries={data.entries.slice(podium.length)}
              data={data}
              onOpen={setOpenSlug}
              note={note}
              setNote={setNote}
              onVoted={refresh}
            />

            <p className="mt-5 text-[11px] text-muted">
              Voting runs Monday to Saturday in {data.week.timezone}. Sunday the board freezes and the winners are
              called on stream. Everyone with a Cluster profile is in it — there is nothing to enter.
            </p>
          </div>
          </section>
        </>,
        document.body,
      )}

      {/* Portalled to the body. The nav has `backdrop-blur`, which makes it a
          containing block for fixed positioning — a `fixed inset-0` overlay
          rendered inside it covers the NAV rather than the viewport, so the
          modal appeared as a sliver under the header instead of over the page. */}
      {openSlug && typeof document !== "undefined" && createPortal(
        <Snapshot slug={openSlug} data={data} onClose={() => setOpenSlug(null)} onVoted={refresh} note={note} setNote={setNote} />,
        document.body,
      )}
    </>
  );
}

const MEDAL = ["#fbbf24", "#cbd5e1", "#d08a4a"];

// ===== Header =====

function Header({ data, busy, onRefresh, onCollapse }: {
  data: BandData; busy: boolean; onRefresh: () => void; onCollapse: () => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-amber-300">
          <Icon name="crown" size={13} /> Profile of the Week
        </div>
        <h2 className="mt-1 text-2xl font-black sm:text-3xl">
          {data.week.phase === "announcement" ? "The votes are in." : "The most-backed profile on Cluster."}
        </h2>
        <div className="mt-1.5 text-xs text-muted">
          <Window data={data} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          className="ghost-btn pressable inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-60"
        >
          <Icon name="spark" size={12} className={busy ? "animate-spin" : ""} /> {busy ? "Refreshing…" : "Refresh"}
        </button>
        <Link href="/leaderboards/best-profile" className="ghost-btn pressable rounded-full px-4 py-1.5 text-xs font-semibold">
          All time
        </Link>
        <button type="button" onClick={onCollapse} className="ghost-btn pressable rounded-full px-4 py-1.5 text-xs font-semibold">
          Collapse
        </button>
      </div>
    </div>
  );
}

function Window({ data }: { data: BandData }) {
  const start = new Date(data.week.startsAt);
  const close = new Date(data.week.votingEndsAt);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return (
    <span>
      {fmt(start)} → {fmt(new Date(close.getTime() - 1))} · <Countdown data={data} className="inline" />
    </span>
  );
}

// A live countdown. Rendered only after mount: the server and the browser are
// never at the same instant, and a clock that disagrees with itself on the
// first paint is a hydration error.
function Countdown({ data, className = "" }: { data: BandData; className?: string }) {
  const target = useMemo(
    () => new Date(data.week.phase === "voting" ? data.week.votingEndsAt : data.week.endsAt),
    [data.week],
  );
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return <span className={className} />;

  const ms = Math.max(0, target.getTime() - now);
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const left = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return (
    <span className={className}>
      {data.week.phase === "voting" ? `Voting closes in ${left}` : `Next week opens in ${left}`}
    </span>
  );
}

// ===== The stream =====

function Stream({ url }: { url: string }) {
  const embed = embedUrl(url);
  return (
    // Capped, not full-width. At 16:9 the full column is ~630px tall, and with
    // the band expanded by default on every page that puts the leaderboard —
    // and the page itself — below the fold on a laptop. The stream still leads;
    // it just doesn't take the whole screen to do it.
    <div
      className="mx-auto mb-6 w-full overflow-hidden rounded-2xl border border-rose-400/30"
      style={{ boxShadow: "0 30px 80px -50px #f43f5e", maxWidth: "calc(56vh * 16 / 9)" }}
    >
      <div className="flex items-center gap-2 border-b border-rose-400/20 bg-rose-500/10 px-4 py-2.5">
        <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
        <span className="text-xs font-black uppercase tracking-widest text-rose-200">Announcing the winners</span>
        <a href={url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-rose-100 hover:underline">
          Watch on Discord <Icon name="arrowRight" size={12} />
        </a>
      </div>
      {embed ? (
        <iframe
          src={embed}
          title="Profile of the Week — live"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="block w-full border-0 bg-black"
          style={{ aspectRatio: "16 / 9" }}
        />
      ) : (
        // Discord stage and voice links can't be embedded — an iframe would show
        // a refusal rather than a stream, so it links out instead of lying.
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex flex-col items-center justify-center gap-3 bg-[#04051a] px-6 py-14 text-center"
        >
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-rose-500/20 text-rose-200"><Icon name="play" size={26} /></span>
          <span className="text-lg font-bold">The announcement is live now</span>
          <span className="text-sm text-muted">Join the stream in our Discord to watch the winners called.</span>
          <span className="pressable mt-1 rounded-full bg-rose-500/20 px-6 py-2 text-sm font-bold text-rose-100 ring-1 ring-rose-400/40">Open the stream</span>
        </a>
      )}
    </div>
  );
}

// Only the platforms that actually allow embedding. Anything else links out.
function embedUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${encodeURIComponent(v)}`;
      if (u.pathname.startsWith("/live/")) return `https://www.youtube.com/embed/${encodeURIComponent(u.pathname.slice(6))}`;
    }
    if (host === "youtu.be") return `https://www.youtube.com/embed/${encodeURIComponent(u.pathname.slice(1))}`;
    if (host === "twitch.tv") {
      const channel = u.pathname.replace(/^\//, "").split("/")[0];
      if (channel) return `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(location.hostname)}`;
    }
    return null;
  } catch { return null; }
}

// ===== Called result =====

// The ceremony. This is the payoff of the whole week, so it is deliberately the
// loudest thing on the page: the three names, the medals, the trophy they were
// actually handed, and — if you are one of them — the way to cash it in. A
// result that reads as a status line makes winning feel like a database row.
function Called({ result, me }: { result: NonNullable<BandData["result"]>; me: BandData["me"] }) {
  if (!result.podium.length) return null;
  const order = result.podium.length >= 3 ? [1, 0, 2] : result.podium.map((_, i) => i);
  const mine = me ? result.podium.findIndex((p) => p.slug === me.slug) : -1;
  const trophy = result.trophy;

  return (
    <div
      className="mb-6 overflow-hidden rounded-3xl border border-amber-400/40"
      style={{ background: "radial-gradient(120% 100% at 50% 0%, rgba(251,191,36,0.16), rgba(4,5,26,0) 62%)", boxShadow: "0 40px 110px -60px #fbbf24" }}
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-amber-400/20 px-5 py-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-amber-300">
          <Icon name="crown" size={13} /> Winners called
        </span>
        <span className="text-xs text-muted">
          {result.announcedAt
            ? new Date(result.announcedAt).toLocaleString(undefined, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
            : "this week"}
        </span>
        {trophy && (
          <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {trophy.imageUrl
              ? <img src={trophy.imageUrl} alt="" className="h-5 w-5 rounded object-contain" />
              : <Icon name="trophy" size={13} />}
            {trophy.name}
            {trophy.value > 0 && <span className="text-amber-300">${nf(trophy.value)}</span>}
            <span className="text-muted">· awarded to all three</span>
          </span>
        )}
      </div>

      <div className={`grid items-end gap-3 px-5 py-5 ${COLS[Math.min(result.podium.length, 3)] ?? COLS[3]}`}>
        {order.map((pos) => {
          const p = result.podium[pos];
          if (!p) return null;
          const medal = MEDAL[pos] ?? "#94a3b8";
          const first = pos === 0;
          return (
            <Link
              key={p.userId}
              href={`/u/${p.slug}`}
              className={`group relative flex flex-col items-center gap-2 rounded-2xl border px-4 text-center transition hover:-translate-y-0.5 ${first ? "py-7" : "py-5"}`}
              style={{
                borderColor: first ? medal : `${medal}55`,
                background: `linear-gradient(180deg, ${medal}1f, rgba(4,5,26,0.5))`,
                boxShadow: first ? `0 0 0 1px ${medal}66, 0 30px 70px -50px ${medal}` : undefined,
              }}
            >
              <span
                className={`grid place-items-center rounded-full ${first ? "h-14 w-14" : "h-11 w-11"}`}
                style={{ background: `${medal}22`, border: `2px solid ${medal}`, boxShadow: `0 0 30px -6px ${medal}` }}
              >
                <Icon name={first ? "crown" : pos === 1 ? "medal" : "trophy"} size={first ? 26 : 20} style={{ color: medal }} />
              </span>
              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: medal }}>
                {PLACE_LABEL[pos] ?? `#${pos + 1}`}
              </span>
              <span className={`font-black leading-tight ${first ? "text-xl" : "text-base"}`}>{p.displayName}</span>
              <span className="text-xs text-muted">{nf(p.votes)} votes</span>
              {trophy && (
                <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-amber-200">
                  <Icon name="trophy" size={10} /> trophy awarded
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Winning and being told to go and find your prize are two different
          experiences. If this is you, the next step is one tap away. */}
      {mine >= 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-amber-400/20 bg-amber-500/[0.06] px-5 py-3.5">
          <span className="text-sm font-bold text-amber-100">
            You finished {mine === 0 ? "first" : mine === 1 ? "second" : "third"}
            {trophy ? ` — the ${trophy.name} is in your trophy case.` : "."}
          </span>
          <Link
            href={`/u/${me?.slug ?? ""}#trophies`}
            className="pressable ml-auto inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-5 py-2 text-sm font-black text-[#04051a] hover:bg-amber-300"
          >
            <Icon name="trophy" size={14} /> {trophy ? "Redeem your trophy" : "Open your trophy case"}
          </Link>
        </div>
      )}
    </div>
  );
}

// ===== Podium =====
//
// Second, first, third — the shape of a real podium, so first reads as first
// before anyone checks the number on it. First is taller, wider on desktop,
// crowned and lit; the other two are deliberately quieter. A podium where the
// places look the same isn't a podium, it's a list with medals on it.
function Podium({ entries, data, onOpen, note, setNote, onVoted }: {
  entries: BandEntry[];
  data: BandData;
  onOpen: (slug: string) => void;
  note: { slug: string; text: string } | null;
  setNote: (n: { slug: string; text: string } | null) => void;
  onVoted: () => void;
}) {
  const order = entries.length >= 3 ? [1, 0, 2] : entries.map((_, i) => i);
  return (
    <div className={`mb-5 grid items-end gap-3 ${COLS[Math.min(entries.length, 3)] ?? COLS[3]}`}>
      {order.map((pos) => {
        const e = entries[pos];
        if (!e) return null;
        return (
          <PodiumCard
            key={e.userId}
            entry={e}
            place={pos}
            data={data}
            onOpen={onOpen}
            note={note}
            setNote={setNote}
            onVoted={onVoted}
          />
        );
      })}
    </div>
  );
}

const PLACE_LABEL = ["Profile of the Week", "Second", "Third"];

// A podium that isn't full yet centres rather than hugging the left column —
// early in a week there is often only one name on it, and a lone card pinned to
// the left reads as a broken grid rather than as a leader.
const COLS: Record<number, string> = {
  0: "",
  1: "sm:mx-auto sm:max-w-sm",
  2: "sm:mx-auto sm:max-w-2xl sm:grid-cols-2",
  3: "sm:grid-cols-[1fr_1.24fr_1fr]",
};

function PodiumCard({ entry: e, place, data, onOpen, note, setNote, onVoted }: {
  entry: BandEntry;
  place: number;
  data: BandData;
  onOpen: (slug: string) => void;
  note: { slug: string; text: string } | null;
  setNote: (n: { slug: string; text: string } | null) => void;
  onVoted: () => void;
}) {
  const art = e.bgImage || e.bannerUrl;
  const medal = MEDAL[place] ?? "#94a3b8";
  const first = place === 0;
  const mine = data.me?.slug === e.slug;

  return (
    <div
      className="relative overflow-hidden rounded-3xl border transition"
      style={{
        borderColor: first ? medal : `${medal}55`,
        boxShadow: first ? `0 0 0 1px ${medal}55, 0 40px 90px -50px ${medal}` : `0 26px 70px -55px ${medal}`,
      }}
    >
      {/* Their art, as the card. This is a contest about whose profile is best,
          so the entry has to look like the thing being judged. */}
      <div className={`group relative ${first ? "h-56 sm:h-64" : "h-44 sm:h-48"}`}>
        {art
          ? <span aria-hidden className="absolute inset-0 bg-cover bg-center transition duration-700 group-hover:scale-105" style={{ backgroundImage: `url(${optImg(art, 1200)})` }} />
          : <span aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(150deg, ${e.accent}, ${e.accent2})`, opacity: 0.5 }} />}
        <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(4,5,26,0.30) 0%, rgba(4,5,26,0.72) 55%, rgba(4,5,26,0.97) 100%)" }} />
        {first && (
          <span aria-hidden className="absolute inset-x-0 top-0 h-24" style={{ background: `linear-gradient(180deg, ${medal}2e, transparent)` }} />
        )}

        {/* The trophy. */}
        <span
          className={`absolute left-1/2 -translate-x-1/2 grid place-items-center rounded-full ${first ? "top-4 h-16 w-16" : "top-3 h-12 w-12"}`}
          style={{ background: `${medal}22`, boxShadow: `0 0 34px -6px ${medal}`, border: `2px solid ${medal}` }}
        >
          <Icon name={first ? "crown" : place === 1 ? "medal" : "trophy"} size={first ? 30 : 22} style={{ color: medal }} />
        </span>
        <span
          className={`absolute left-1/2 -translate-x-1/2 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-[#04051a] ${first ? "top-[4.6rem]" : "top-[3.6rem]"}`}
          style={{ background: medal }}
        >
          {PLACE_LABEL[place] ?? `#${place + 1}`}
        </span>

        <button type="button" onClick={() => onOpen(e.slug)} className="absolute inset-0 flex flex-col justify-end p-4 text-left">
          <span className="flex items-center gap-2.5">
            <Avatar name={e.displayName} src={e.avatarUrl} size={first ? 52 : 40} />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className={`truncate font-black ${first ? "text-2xl" : "text-lg"}`}>{e.displayName}</span>
                {mine && <span className="shrink-0 rounded-full bg-cyan-500/25 px-1.5 py-px text-[9px] font-black uppercase tracking-widest text-cyan-100">You</span>}
              </span>
              {e.title && <span className="block truncate text-[11px] text-muted">{e.title}</span>}
            </span>
          </span>

          <span className="mt-3 flex items-end gap-5">
            <span>
              <span className={`block font-black leading-none tabular-nums ${first ? "text-5xl" : "text-4xl"}`} style={{ color: medal }}>
                {nf(e.weekVotes)}
              </span>
              <span className="mt-1 block text-[10px] uppercase tracking-widest text-muted">votes this week</span>
            </span>
            <span className="pb-0.5">
              <span className="block text-lg font-bold leading-none tabular-nums text-ink/85">{nf(e.lifetimeVotes)}</span>
              <span className="mt-1 block text-[10px] uppercase tracking-widest text-muted">lifetime</span>
            </span>
          </span>
        </button>
      </div>

      <div className="relative flex items-center gap-2 border-t border-white/10 bg-[#04051a]/70 px-4 py-3">
        <VoteButton entry={e} data={data} note={note} setNote={setNote} onVoted={onVoted} />
        <Link href={`/u/${e.slug}`} className="ghost-btn pressable inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold">
          Profile <Icon name="arrowRight" size={11} />
        </Link>
      </div>
    </div>
  );
}

function Rows({ entries, data, onOpen, note, setNote, onVoted }: {
  entries: BandEntry[];
  data: BandData;
  onOpen: (slug: string) => void;
  note: { slug: string; text: string } | null;
  setNote: (n: { slug: string; text: string } | null) => void;
  onVoted: () => void;
}) {
  if (!entries.length) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {entries.map((e) => (
        <EntryCard key={e.userId} entry={e} data={data} onOpen={onOpen} note={note} setNote={setNote} onVoted={onVoted} />
      ))}
    </div>
  );
}

// ===== One gamer, below the podium =====
//
// Same idea at row scale: their art behind it, both numbers, one tap to look.
function EntryCard({ entry: e, data, onOpen, note, setNote, onVoted }: {
  entry: BandEntry;
  data: BandData;
  onOpen: (slug: string) => void;
  note: { slug: string; text: string } | null;
  setNote: (n: { slug: string; text: string } | null) => void;
  onVoted: () => void;
}) {
  const art = e.bgImage || e.bannerUrl;
  const mine = data.me?.slug === e.slug;

  return (
    <div className={`group relative overflow-hidden rounded-2xl border border-white/10 ${e.disqualified ? "opacity-55" : ""}`}>
      {art
        ? <span aria-hidden className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-105" style={{ backgroundImage: `url(${optImg(art, 1200)})` }} />
        : <span aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${e.accent}55, ${e.accent2}33)` }} />}
      <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(4,5,26,0.94), rgba(4,5,26,0.74))" }} />

      <button type="button" onClick={() => onOpen(e.slug)} className="relative flex w-full items-center gap-3 p-3 text-left">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/[0.07] text-xs font-black text-muted">
          {e.disqualified ? <Icon name="minus" size={13} /> : e.rank}
        </span>
        <Avatar name={e.displayName} src={e.avatarUrl} size={38} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold">{e.displayName}</span>
            {mine && <span className="shrink-0 rounded-full bg-cyan-500/20 px-1.5 py-px text-[9px] font-black uppercase tracking-widest text-cyan-200">You</span>}
          </span>
          {e.disqualified
            ? <span className="block text-[11px] font-semibold text-rose-300">Disqualified this week</span>
            : e.title && <span className="block truncate text-[11px] text-muted">{e.title}</span>}
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-xl font-black leading-none tabular-nums" style={{ color: e.accent2 }}>{nf(e.weekVotes)}</span>
          <span className="text-[9px] uppercase tracking-widest text-muted">week</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-bold leading-none tabular-nums text-ink/75">{nf(e.lifetimeVotes)}</span>
          <span className="text-[9px] uppercase tracking-widest text-muted">life</span>
        </span>
      </button>

      <div className="relative flex items-center gap-2 px-3 pb-3">
        <VoteButton entry={e} data={data} note={note} setNote={setNote} onVoted={onVoted} />
        <Link href={`/u/${e.slug}`} className="ghost-btn pressable inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold">
          Profile <Icon name="arrowRight" size={11} />
        </Link>
      </div>
    </div>
  );
}

// ===== Voting =====

function VoteButton({ entry: e, data, note, setNote, onVoted }: {
  entry: BandEntry;
  data: BandData;
  note: { slug: string; text: string } | null;
  setNote: (n: { slug: string; text: string } | null) => void;
  onVoted: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [voted, setVoted] = useState(e.votedByMe);
  const [count, setCount] = useState(e.weekVotes);
  useEffect(() => { setVoted(e.votedByMe); setCount(e.weekVotes); }, [e.votedByMe, e.weekVotes]);

  const mine = data.me?.slug === e.slug;
  const disabled = pending || mine || !data.votingOpen || e.disqualified;

  const cast = async () => {
    if (!data.signedIn) { setNote({ slug: e.slug, text: "Continue with Discord to vote." }); return; }
    setPending(true);
    setNote(null);
    const fd = new FormData();
    fd.set("slug", e.slug);
    const res: WeekVoteState = await voteFromBand(undefined, fd);
    setPending(false);
    if (res?.error) { setNote({ slug: e.slug, text: res.error }); return; }
    if (res) {
      setVoted(!!res.voted);
      if (typeof res.weekVotes === "number") setCount(res.weekVotes);
      // Re-pull so the ORDER updates too — a vote that changes the number but
      // not the ranking looks like it didn't count.
      onVoted();
    }
  };

  const label = mine ? "Your profile"
    : e.disqualified ? "Out this week"
      : !data.votingOpen ? (data.closedReason === "frozen" ? "Voting closed" : "Closed")
        : voted ? "Voted" : "Vote";

  return (
    <div className="min-w-0 flex-1">
      <button
        type="button"
        onClick={cast}
        disabled={disabled}
        className={`pressable inline-flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition disabled:cursor-default ${
          voted ? "text-[#04051a]" : "text-white"
        } ${disabled && !voted ? "opacity-55" : ""}`}
        style={voted
          ? { background: "#34d399" }
          : { background: `linear-gradient(90deg, ${e.accent}, ${e.accent2})` }}
      >
        <Icon name={voted ? "check" : "star"} size={12} />
        {pending ? "…" : label}
        {voted && <span className="tabular-nums">· {nf(count)}</span>}
      </button>
      {note?.slug === e.slug && <p className="mt-1.5 text-[10px] leading-snug text-amber-300">{note.text}</p>}
    </div>
  );
}

// ===== Snapshot =====
//
// The real profile, in a frame. Not a screenshot and not a re-implementation:
// this is the actual page, so it carries their layout, their colours, their
// cards and their custom cursor — the things being voted on. Anything less
// would ask people to judge a profile they can't see.
function Snapshot({ slug, data, onClose, onVoted, note, setNote }: {
  slug: string;
  data: BandData;
  onClose: () => void;
  onVoted: () => void;
  note: { slug: string; text: string } | null;
  setNote: (n: { slug: string; text: string } | null) => void;
}) {
  const entry = data.entries.find((e) => e.slug === slug);
  const [loaded, setLoaded] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  if (!entry) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-[#04051a]/85 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(ev) => { if (!box.current?.contains(ev.target as Node)) onClose(); }}
    >
      <div ref={box} className="my-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-white/15 bg-[#04051a] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <Avatar name={entry.displayName} src={entry.avatarUrl} size={34} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold">{entry.displayName}</div>
            <div className="text-[11px] text-muted">
              <b style={{ color: entry.accent2 }}>{nf(entry.weekVotes)}</b> this week · {nf(entry.lifetimeVotes)} lifetime
            </div>
          </div>
          <div className="hidden w-44 sm:block">
            <VoteButton entry={entry} data={data} note={note} setNote={setNote} onVoted={onVoted} />
          </div>
          <Link href={`/u/${entry.slug}`} className="ghost-btn pressable shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold">
            Open profile
          </Link>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 p-1 text-muted hover:text-ink">
            <Icon name="x" size={17} />
          </button>
        </div>

        {/* The card renders instantly; the live page fills in over it.
            The frame's height is fixed rather than driven by its contents —
            if the card image is slow or missing, a height-from-contents box
            collapses to nothing and the modal looks broken. */}
        <div className="relative overflow-hidden bg-black/50" style={{ height: "min(70vh, 760px)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/card/profile?slug=${encodeURIComponent(entry.slug)}`}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${loaded ? "opacity-0" : "opacity-100"}`}
          />
          {!loaded && (
            <span className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-2 text-xs text-muted">
              <Icon name="spark" size={12} className="animate-spin" /> Loading their profile…
            </span>
          )}
          <iframe
            src={`/u/${encodeURIComponent(entry.slug)}?embed=1`}
            title={`${entry.displayName}'s profile`}
            onLoad={() => setLoaded(true)}
            className={`absolute inset-0 block h-full w-full border-0 transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          />
        </div>

        <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3 sm:hidden">
          <VoteButton entry={entry} data={data} note={note} setNote={setNote} onVoted={onVoted} />
        </div>
      </div>
    </div>
  );
}
