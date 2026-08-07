"use client";

import { useActionState, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import CoverFramer from "@/components/CoverFramer";
import MetricsGuide from "@/components/MetricsGuide";
import { saveChallenge, type ChallengeSaveState } from "@/app/actions/admin";
import { RULE_OPS, isRanked, ruleSentence, valueChoices, OPEN_TO_EVERYONE } from "@/lib/challenge-rules";
// Pure module, safe on the client — and the only copy of these numbers. A
// second literal fallback is the one that is wrong the first time the price
// moves. (C2)
import { PRICING_DEFAULTS } from "@/lib/pricing";
import type { MetricDef } from "@/lib/providers/registry";

// How long one run of each cadence lasts. Mirrors lib/challenge-series so the
// preview the builder draws is the schedule the server will actually create —
// this file is a client component and can't import the server module.
const CADENCE_DAYS: Record<string, number | undefined> = { daily: 1, weekly: 7, monthly: 30 };

const toLocal = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

const money = (n: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

export type BuilderProvider = {
  id: string;
  name: string;
  game: string;
  live: boolean;
  authType?: string;
  docsUrl?: string;
  /** The provider's own MetricDefs, whole. Listing the fields by hand is how
   *  `ranks` got dropped and every rank rule became a number box. */
  capabilities: MetricDef[];
};
export type BuilderSpace = { id: string; name: string; game: string | null };
export type BuilderTrophy = {
  id: string; name: string; tier: string; imageUrl: string;
  /** Whose logo is on it. A branded trophy belongs to one sponsor's challenges. */
  brandId?: string | null;
  brandName?: string | null;
  value?: number;
};
export type BuilderQuest = { id: string; name: string; logoUrl: string | null };
export type BuilderGuild = { guildId: string; name: string; members?: number };
/** A brand that could be paying for this, with the campaigns it's running. */
export type BuilderBrand = { id: string; name: string; campaigns: { id: string; name: string }[] };
/** The live rate card, so the builder proposes what we actually charge. */
export type BuilderPricing = { challengePrice: number; prizePool: number; currency: string };
/** Where a public challenge lands, so staff see the buy before they commit it. */
export type BuilderReach = { servers: number; members: number };

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
  visibility: string; guildId: string | null; guildIds?: string[]; accessKey: string | null; announceHype: boolean;
  /** Set when a brand paid for this one — it changes which trophies belong on it. */
  sponsorBrandId?: string | null;
  sponsorCampaignId?: string | null;
  sponsorPrice?: number;
  /** How many runs this series has. 4 = a sponsored month. */
  runsPlanned?: number;
  runIndex?: number;
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

// Starter ideas — one click fills the shape of a common challenge. The first is
// what we actually sell: four weeks on one game, which is a sponsored month.
const IDEAS = [
  { name: "Sponsored month", cadence: "weekly", format: "top3", runs: 4, title: "Weekly Wins Race", desc: "Rack up the most wins this week. Top 3 take the podium." },
  { name: "Daily Grind", cadence: "daily", format: "top1", runs: 7, title: "Daily Grind", desc: "Whoever gains the most today wins it all." },
  { name: "Monthly Marathon", cadence: "monthly", format: "top3", runs: 1, title: "Monthly Marathon", desc: "A month-long climb. Consistency is king." },
  { name: "First to Target", cadence: "weekly", format: "threshold_race", runs: 1, title: "Threshold Sprint", desc: "First to hit the target points wins. Go fast." },
];

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <span className="text-xs uppercase tracking-widest text-muted">{n} · {title}</span>
        {hint && <span className="text-[11px] text-muted/80">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export default function ChallengeBuilder({
  providers, spaces, trophies, quests = [], guilds = [], brands = [], pricing, reach, challenge,
}: {
  providers: BuilderProvider[]; spaces: BuilderSpace[]; trophies: BuilderTrophy[];
  quests?: BuilderQuest[]; guilds?: BuilderGuild[]; brands?: BuilderBrand[];
  pricing?: BuilderPricing; reach?: BuilderReach; challenge?: ChallengeEdit;
}) {
  const editing = !!challenge;
  const rate = pricing ?? PRICING_DEFAULTS;

  const [providerId, setProviderId] = useState(challenge?.provider ?? providers[0]?.id ?? "");
  const [cadence, setCadence] = useState(challenge?.cadence ?? "weekly");
  const [startAt, setStartAt] = useState(toLocal(challenge ? new Date(challenge.startAt) : new Date()));
  const [endAt, setEndAt] = useState(
    toLocal(challenge ? new Date(challenge.endAt) : new Date(Date.now() + 7 * 86400000)),
  );
  const [runs, setRuns] = useState(challenge?.runsPlanned ?? 4);
  const [state, save] = useActionState<ChallengeSaveState, FormData>(saveChallenge, null);
  const [format, setFormat] = useState(challenge?.format ?? "top3");
  const [heroType, setHeroType] = useState(challenge?.heroType ?? "image");
  const [title, setTitle] = useState(challenge?.title ?? "");
  const [description, setDescription] = useState(challenge?.description ?? "");
  const [pointsMap, setPointsMap] = useState<Record<string, number>>(() => challenge?.pointsEngine ?? recommendPoints(providers[0]?.capabilities ?? []));
  const [conditions, setConditions] = useState<{ metric: string; op: string; value: number }[]>(challenge?.conditions ?? []);
  const [gateQuestId, setGateQuestId] = useState(challenge?.gateQuestId ?? "");
  const [visibility, setVisibility] = useState(challenge?.visibility ?? "public");
  const [guildId, setGuildId] = useState(challenge?.guildId ?? "");
  const [alsoGuilds, setAlsoGuilds] = useState<string[]>(
    (challenge?.guildIds ?? []).filter((g) => g !== challenge?.guildId),
  );
  const [accessKey, setAccessKey] = useState(challenge?.accessKey ?? "");
  const [status, setStatus] = useState(challenge?.status ?? "active");

  // ===== Sponsorship =====
  //
  // The unit of the business, and until now the one thing the builder could not
  // create. A sponsored challenge is what a brand's report, the server's
  // earnings and the invoice are all built from.
  const [sponsorBrandId, setSponsorBrandId] = useState(challenge?.sponsorBrandId ?? "");
  const [sponsorCampaignId, setSponsorCampaignId] = useState(challenge?.sponsorCampaignId ?? "");
  const [sponsorPrice, setSponsorPrice] = useState(
    challenge?.sponsorPrice ?? 0,
  );
  const sponsor = brands.find((b) => b.id === sponsorBrandId) ?? null;

  // Which trophies belong on THIS challenge's podium.
  //
  // A branded trophy carries a sponsor's logo and the winner keeps it on their
  // profile permanently, so another brand's trophy must never be selectable
  // here. Driven by the sponsor currently SELECTED rather than the one saved,
  // so picking a brand immediately reveals its trophies.
  const podiumTrophies = trophies.filter((t) => !t.brandId || t.brandId === sponsorBrandId);

  const [prizeFirst, setPrizeFirst] = useState<string[]>(
    challenge?.prizes?.first ?? (challenge?.trophyId ? [challenge.trophyId] : []),
  );
  const [prizeSecond, setPrizeSecond] = useState<string[]>(challenge?.prizes?.second ?? []);
  const [prizeThird, setPrizeThird] = useState<string[]>(challenge?.prizes?.third ?? []);

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
  const applyIdea = (i: typeof IDEAS[number]) => {
    setCadence(i.cadence); setFormat(i.format); setTitle(i.title); setDescription(i.desc); setRuns(i.runs);
    const d = CADENCE_DAYS[i.cadence];
    if (d) setEndAt(toLocal(new Date(new Date(startAt).getTime() + d * 86400000)));
  };
  const setPts = (key: string, v: number) => setPointsMap((m) => ({ ...m, [key]: v }));

  const pointsJson = JSON.stringify(Object.fromEntries(Object.entries(pointsMap).filter(([, v]) => v > 0)));
  const conditionsJson = JSON.stringify(conditions.filter((c) => c.metric));

  // Where a fresh rule starts. A ranked metric starts at the bottom rung of its
  // own ladder rather than at 0 — Dota's Herald 1 is stored as 11, and a rule
  // that opened at "at least 0" would name a rank while letting everyone in.
  const startValue = (key: string) => valueChoices(caps.find((c) => c.key === key))[0]?.value ?? 0;

  // The sentence a gamer reads, built by the same function the challenge page
  // and the Discord card use — so the summary is not a second opinion.
  const ruleLines = conditions
    .filter((c) => c.metric)
    .map((c) => ruleSentence(c, caps.find((m) => m.key === c.metric)));

  // ===== The money, as the model has it =====
  const podiumValue = [...prizeFirst, ...prizeSecond, ...prizeThird]
    .reduce((sum, id) => sum + (trophies.find((t) => t.id === id)?.value ?? 0), 0);
  const prizeShare = rate.challengePrice > 0
    ? rate.prizePool / rate.challengePrice
    : PRICING_DEFAULTS.prizePct / 100;
  const prizeTarget = Math.round(sponsorPrice * prizeShare);
  const shortfall = sponsorPrice > 0 ? prizeTarget - podiumValue : 0;

  // The repeat plan, drawn before anything is saved.
  const repeating = !!CADENCE_DAYS[cadence];
  const noun = cadence === "daily" ? "Day" : cadence === "monthly" ? "Month" : "Week";
  const plan = useMemo(() => {
    if (!repeating) return [];
    const days = CADENCE_DAYS[cadence]!;
    const base = new Date(startAt);
    if (Number.isNaN(base.getTime())) return [];
    const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return Array.from({ length: runs }, (_, i) => {
      const s = new Date(base.getTime() + i * days * 86400000);
      const e = new Date(s.getTime() + days * 86400000);
      return {
        index: i + 1,
        title: i === 0 ? title || "Untitled" : `${title || "Untitled"} — ${noun} ${i + 1}`,
        startLabel: fmt(s), endLabel: fmt(e),
      };
    });
  }, [repeating, cadence, startAt, runs, title, noun]);

  // Where it lands. A public challenge goes everywhere the bot is; a
  // server-gated one goes only to the servers named below.
  const targetGuilds = visibility === "private"
    ? guilds.filter((g) => g.guildId === guildId || alsoGuilds.includes(g.guildId))
    : [];
  const landing = visibility === "private"
    ? { servers: targetGuilds.length, members: targetGuilds.reduce((n, g) => n + (g.members ?? 0), 0) }
    : { servers: reach?.servers ?? 0, members: reach?.members ?? 0 };

  return (
    <form action={save} className="grid gap-6 xl:grid-cols-[1fr_20rem]">
      {editing && <input type="hidden" name="challengeId" value={challenge.id} />}

      <div className="space-y-6">
        {state?.error && (
          <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{state.error}</p>
        )}
        {state?.ok && (
          <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{state.ok}</p>
        )}

        {/* Ideas */}
        <div>
          <div className="mb-2 text-xs uppercase tracking-widest text-muted">Start from a shape (optional)</div>
          <div className="flex flex-wrap gap-2">
            {IDEAS.map((i) => (
              <button key={i.name} type="button" onClick={() => applyIdea(i)} className="ghost-btn pressable inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs">
                <Icon name="spark" size={12} className="text-cyan-300" /> {i.name}
              </button>
            ))}
          </div>
        </div>

        <Step n={1} title="The game" hint="and which planet it lives on">
          <div className="grid gap-3 sm:grid-cols-2">
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
        </Step>

        {/* ===== Who's paying =====
            Everything downstream of the money — the brand's report, the invoice,
            the server's share — reads these three fields. A challenge saved
            without them is one nobody gets paid for and nobody can report on. */}
        <Step n={2} title="Who's paying for it" hint="leave empty for a house challenge">
          <div className="glass !rounded-lg space-y-3 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-muted">Sponsor
                <select
                  name="sponsorBrandId" value={sponsorBrandId} className="input-cosmic mt-1"
                  onChange={(e) => {
                    setSponsorBrandId(e.target.value);
                    setSponsorCampaignId("");
                    // Proposing the rate card beats leaving a zero that quietly
                    // bills nobody. Staff can still type anything.
                    if (e.target.value && !sponsorPrice) setSponsorPrice(rate.challengePrice);
                    if (!e.target.value) setSponsorPrice(0);
                  }}
                >
                  <option value="">— nobody, this one&apos;s on us —</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-muted">What they paid for this run
                <div className="mt-1 flex items-center gap-2">
                  <input
                    name="sponsorPrice" type="number" min={0} step={5} value={sponsorPrice}
                    disabled={!sponsorBrandId}
                    onChange={(e) => setSponsorPrice(Math.max(0, Number(e.target.value) || 0))}
                    className="input-cosmic !py-1.5 flex-1 disabled:opacity-40"
                  />
                  {sponsorBrandId && sponsorPrice !== rate.challengePrice && (
                    <button type="button" onClick={() => setSponsorPrice(rate.challengePrice)}
                      className="ghost-btn pressable shrink-0 rounded-lg px-2.5 py-1 text-[11px]">
                      Rate card
                    </button>
                  )}
                </div>
              </label>
            </div>

            {sponsor && sponsor.campaigns.length > 0 && (
              <label className="block text-xs text-muted">Bought under which campaign (optional)
                <select name="sponsorCampaignId" value={sponsorCampaignId}
                  onChange={(e) => setSponsorCampaignId(e.target.value)} className="input-cosmic mt-1">
                  <option value="">— not tied to a campaign —</option>
                  {sponsor.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}

            {sponsorBrandId ? (
              <p className="text-[11px] leading-relaxed text-muted">
                {money(sponsorPrice, rate.currency)} enters the model here. About{" "}
                <b className="text-ink">{money(prizeTarget, rate.currency)}</b> of it should leave as prize
                money on the podium below, and the servers that carry it take a share of the rest.
              </p>
            ) : (
              <p className="text-[11px] leading-relaxed text-muted">
                A house challenge. Nothing is billed and no server earns from it — which is right for a
                launch challenge or a welcome competition, and wrong for anything a brand asked for.
              </p>
            )}
          </div>
        </Step>

        <Step n={3} title="What it's called">
          <div className="grid gap-3">
            <input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Blitz Supernova — Weekly Wins Race)" className="input-cosmic" />
            <textarea name="description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One line gamers read on the card and the event page" className="input-cosmic" />
          </div>
        </Step>

        {/* Both dates are ALWAYS editable. The end field used to disappear the
            moment a cadence was picked, and the server then overwrote whatever
            had been typed with start + 7 days — so staff set an end date, saved,
            and silently got a different one. Cadence now only fills the field
            in; what is in the field is what gets saved. */}
        <Step n={4} title="When it runs">
          <div className="mb-3 flex flex-wrap gap-2">
            {CADENCES.map((cd) => (
              <button
                key={cd.key} type="button"
                onClick={() => { setCadence(cd.key); const d = CADENCE_DAYS[cd.key]; if (d) setEndAt(toLocal(new Date(new Date(startAt).getTime() + d * 86400000))); }}
                className={`stat-tab ${cadence === cd.key ? "stat-tab-active" : ""}`} title={cd.desc}
              >{cd.label}</button>
            ))}
          </div>
          <input type="hidden" name="cadence" value={cadence} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-muted">Starts
              <input
                name="startAt" type="datetime-local" required value={startAt}
                onChange={(e) => {
                  setStartAt(e.target.value);
                  const d = CADENCE_DAYS[cadence];
                  if (d && e.target.value) setEndAt(toLocal(new Date(new Date(e.target.value).getTime() + d * 86400000)));
                }}
                className="input-cosmic mt-1"
              />
            </label>
            <label className="text-xs text-muted">
              {repeating ? `${noun} 1 ends` : "Ends"}
              <input
                name="endAt" type="datetime-local" required value={endAt}
                onChange={(e) => setEndAt(e.target.value)} className="input-cosmic mt-1"
              />
            </label>
          </div>

          {/* The repeat plan.
              This is the thing a sponsored month actually is: one challenge,
              run four times. Each run is a separate record with its own
              entrants, standings, winners and reach — which is what makes "what
              did week 3 deliver" a question with an answer. */}
          {repeating && (
            <div className="mt-3 rounded-2xl border border-cyan-400/25 bg-cyan-500/5 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs text-muted">
                  Repeat for
                  <input
                    name="runsPlanned" type="number" min={1} max={52} value={runs}
                    onChange={(e) => setRuns(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
                    className="input-cosmic mt-1 !w-24"
                  />
                </label>
                <span className="self-end pb-3 text-xs text-muted">
                  {noun.toLowerCase()}{runs === 1 ? "" : "s"}
                  {runs === 4 && cadence === "weekly" && " — one sponsored month"}
                </span>
              </div>
              <ol className="mt-3 space-y-1.5">
                {plan.map((p) => (
                  <li key={p.index} className="flex flex-wrap items-baseline gap-2 text-xs">
                    <span className={`rank-chip !h-5 !min-w-5 text-[10px] ${p.index === 1 ? "rank-chip-1" : ""}`}>{p.index}</span>
                    <b className="font-semibold">{p.title}</b>
                    <span className="text-muted">{p.startLabel} → {p.endLabel}</span>
                    {p.index === 1 && <span className="text-emerald-300">goes live on save</span>}
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-[11px] leading-relaxed text-muted">
                Only {noun.toLowerCase()} 1 is created now. When it ends, Cluster announces the winners,
                hands out the trophies, and opens {noun.toLowerCase()} 2 automatically — with everyone
                already entered and every score back to zero. Each {noun.toLowerCase()} is saved as its own
                completed challenge, so its standings and reach stay reportable forever.
              </p>
            </div>
          )}
        </Step>

        <Step n={5} title="How it's scored">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] text-muted">Award points each time a stat goes up (leave 0 to ignore)</span>
            <button type="button" onClick={() => setPointsMap(recommendPoints(caps))} className="ghost-btn pressable inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px]">
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

          <div className="glass !rounded-lg space-y-2 p-3">
            {caps.length === 0 ? (
              <div className="text-xs text-muted">This provider exposes no trackable metrics.</div>
            ) : caps.map((cp) => (
              <label key={cp.key} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{cp.label} <span className="text-[10px] text-muted">({cp.key})</span></span>
                <span className="text-xs text-muted">+</span>
                <input type="number" min={0} value={pointsMap[cp.key] ?? 0} onChange={(e) => setPts(cp.key, Number(e.target.value))} className="input-cosmic !w-20 !py-1 text-sm" />
                <span className="text-xs text-muted">pts</span>
              </label>
            ))}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
        </Step>

        {/* Who can enter — in the game's own words.
            The stored rule is still `{metric, op, value}`, because that is what
            the scoring engine compares. What changed is that nobody has to read
            it: a ranked metric offers the ladder the API returns (Iron, Bronze,
            Gold…) instead of asking an admin to know that Gold is 4, and the
            sentence underneath is the exact line a gamer sees on the challenge
            page and on the card. */}
        <Step n={6} title="Who can enter" hint="most challenges should be open">
          <div className="mb-1.5 flex items-center justify-end">
            <button type="button"
              onClick={() => setConditions((c) => [...c, { metric: caps[0]?.key ?? "", op: ">=", value: startValue(caps[0]?.key ?? "") }])}
              className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:underline">
              <Icon name="plus" size={11} /> Add a requirement
            </button>
          </div>
          {conditions.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-muted">
              {OPEN_TO_EVERYONE}. Add a requirement to keep a challenge to a skill bracket — that is how a
              bronze player stops being matched against a challenger.
            </div>
          ) : (
            <div className="space-y-2">
              {conditions.map((cond, i) => {
                const met = caps.find((c) => c.key === cond.metric);
                const choices = valueChoices(met);
                const ranked = isRanked(met);
                return (
                  <div key={i} className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <select value={cond.metric}
                        onChange={(e) => setConditions((c) => c.map((x, j) => j === i ? { ...x, metric: e.target.value, value: startValue(e.target.value) } : x))}
                        className="input-cosmic !py-1 min-w-[10rem] flex-1 text-sm">
                        {caps.map((cp) => <option key={cp.key} value={cp.key}>{cp.label}</option>)}
                      </select>
                      <select value={cond.op}
                        onChange={(e) => setConditions((c) => c.map((x, j) => j === i ? { ...x, op: e.target.value } : x))}
                        className="input-cosmic !py-1 w-32 text-sm">
                        {RULE_OPS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
                      </select>
                      {ranked ? (
                        /* The game's own ladder — every rung it has, divisions
                           included. The option's value is the number a synced
                           account at that rank actually holds, so picking
                           "Diamond I" stores what Diamond I means. */
                        <select value={cond.value}
                          onChange={(e) => setConditions((c) => c.map((x, j) => j === i ? { ...x, value: Number(e.target.value) } : x))}
                          className="input-cosmic !py-1 w-40 text-sm">
                          {choices.map((ch) => <option key={ch.value} value={ch.value}>{ch.label}</option>)}
                        </select>
                      ) : (
                        <input type="number" value={cond.value}
                          onChange={(e) => setConditions((c) => c.map((x, j) => j === i ? { ...x, value: Number(e.target.value) } : x))}
                          className="input-cosmic !w-28 !py-1 text-sm" />
                      )}
                      <button type="button" onClick={() => setConditions((c) => c.filter((_, j) => j !== i))}
                        className="text-rose-300 hover:text-rose-200"><Icon name="x" size={14} /></button>
                    </div>
                    <div className="mt-1.5 text-[11px] text-cyan-200">
                      Gamers will read: <b>{ruleSentence(cond, met)}</b>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {quests.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 text-xs text-muted">Quest-badge entry gate (optional)</div>
              <div className="glass !rounded-lg flex flex-wrap items-center gap-3 p-3">
                <span className="text-[11px] text-muted">Require</span>
                <input name="gateMinBadges" type="number" min={0} defaultValue={challenge?.gateMinBadges ?? 0}
                  className="input-cosmic !w-20 !py-1 text-sm" />
                <span className="text-[11px] text-muted">badge(s) of</span>
                <select name="gateQuestId" value={gateQuestId} onChange={(e) => setGateQuestId(e.target.value)} className="input-cosmic !py-1 min-w-[160px] flex-1 text-sm">
                  <option value="">— no quest requirement —</option>
                  {quests.map((qq) => <option key={qq.id} value={qq.id}>{qq.name}</option>)}
                </select>
                <span className="w-full text-[11px] text-muted">A gamer earns 1 badge each time they complete this quest. Set 0 (or no quest) to let everyone join.</span>
              </div>
            </div>
          )}
        </Step>

        {/* Server-gated challenge. This is the thing a server owner gets that
            no other server has — named after their community, announced only
            there, and hidden on the web behind an access key. */}
        <Step n={7} title="Where it appears">
          <div className="glass !rounded-lg space-y-3 p-3">
            <div className="flex flex-wrap gap-2">
              {[
                { v: "public", label: "Public", note: `Announced in every server with the bot${reach?.servers ? ` — ${reach.servers}` : ""}` },
                { v: "private", label: "Server-gated", note: "Public to watch, key needed to enter" },
              ].map((o) => (
                <button
                  key={o.v} type="button" onClick={() => setVisibility(o.v)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition ${visibility === o.v ? "border-cyan-400/70 bg-cyan-500/10" : "border-violet-400/20"}`}
                >
                  <div className="font-bold">{o.label}</div>
                  <div className="text-[10px] text-muted">{o.note}</div>
                </button>
              ))}
            </div>
            <input type="hidden" name="visibility" value={visibility} />

            {visibility === "private" && (
              <>
                <div>
                  <div className="mb-1 text-[11px] text-muted">Which server owns it</div>
                  <select name="guildId" value={guildId} onChange={(e) => setGuildId(e.target.value)} className="input-cosmic !py-1 w-full text-sm">
                    <option value="">— pick a server with the bot —</option>
                    {guilds.map((g) => <option key={g.guildId} value={g.guildId}>{g.name || g.guildId}</option>)}
                  </select>
                  {guilds.length === 0 && (
                    <div className="mt-1 text-[10px] text-amber-300">No servers have installed the bot yet.</div>
                  )}
                  <div className="mt-1 text-[10px] text-muted">
                    Its logo leads on the challenge page, and it can pause or end the challenge itself.
                  </div>
                </div>

                {/* A challenge can run across several servers at once. Each one
                    gets the announcement and the same key, and appears on the
                    challenge page with an invite — which is what turns our
                    audience into traffic for them. */}
                <div>
                  <div className="mb-1 text-[11px] text-muted">Also run it in these servers (optional)</div>
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-violet-400/20 p-2">
                    {guilds.filter((g) => g.guildId !== guildId).map((g) => (
                      <label key={g.guildId} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox" name="alsoGuildIds" value={g.guildId}
                          checked={alsoGuilds.includes(g.guildId)}
                          onChange={(e) => setAlsoGuilds((s) => e.target.checked ? [...s, g.guildId] : s.filter((x) => x !== g.guildId))}
                          className="accent-violet-500"
                        />
                        {g.name || g.guildId}
                        {g.members ? <span className="text-[10px] text-muted">· {g.members.toLocaleString()}</span> : null}
                      </label>
                    ))}
                    {guilds.filter((g) => g.guildId !== guildId).length === 0 && (
                      <div className="text-[10px] text-muted">No other servers yet.</div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-[11px] text-muted">Access key — needed to open it on the web</div>
                  <div className="flex gap-2">
                    <input name="accessKey" value={accessKey} onChange={(e) => setAccessKey(e.target.value)}
                      placeholder="e.g. NEBULA-CUP-2026" className="input-cosmic !py-1 flex-1 text-sm" />
                    <button type="button" onClick={() => setAccessKey(Math.random().toString(36).slice(2, 8).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase())}
                      className="ghost-btn pressable rounded-lg px-3 py-1 text-xs">Generate</button>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" name="announceHype" defaultChecked={challenge?.announceHype ?? true} className="accent-violet-500" />
                  Announce it loudly in those servers (@here if allowed)
                </label>
              </>
            )}
          </div>
        </Step>

        <Step n={8} title="Prizes" hint="what the winners actually keep">
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              ["prize:first", "1st place", prizeFirst, setPrizeFirst],
              ["prize:second", "2nd place", prizeSecond, setPrizeSecond],
              ["prize:third", "3rd place", prizeThird, setPrizeThird],
            ] as [string, string, string[], (v: string[]) => void][]).map(([name, label, value, set]) => (
              <label key={name} className="block text-xs text-muted">
                {label}{format !== "top3" && name !== "prize:first" ? " (podium only)" : ""}
                <select
                  name={name} multiple size={4} value={value}
                  onChange={(e) => set([...e.target.selectedOptions].map((o) => o.value))}
                  className="input-cosmic mt-1 w-full !py-1 text-xs"
                >
                  {podiumTrophies.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.tier}){t.value ? ` — ${money(t.value, rate.currency)}` : ""}{t.brandName ? ` · ${t.brandName}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-muted">
            Ctrl/Cmd-click for more than one per place.
            {sponsorBrandId
              ? " Only this sponsor's trophies and the general catalogue are listed — another brand's logo never goes on this podium."
              : " Branded trophies are hidden until a sponsor is chosen above."}
          </p>
          <input name="prizeDescription" placeholder="Prize description shown on the page" defaultValue={challenge?.prizeDescription ?? undefined} className="input-cosmic mt-3" />
        </Step>

        <Step n={9} title="How it looks">
          <div className="grid gap-3 sm:grid-cols-2">
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
          </div>
        </Step>
      </div>

      {/* ===== The launch summary =====
          Everything above is a field. This is the decision: what a gamer will
          read, where it lands, and what it costs. It's here because staff are
          committing a brand's money and a thousand servers' attention, and the
          old form let them do that without ever seeing either. */}
      <aside className="xl:sticky xl:top-6 xl:self-start">
        <div className="glass space-y-4 rounded-2xl p-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300">Launch summary</div>
            <h3 className="mt-1 text-sm font-bold leading-snug">{title || "Untitled challenge"}</h3>
            <p className="text-[11px] text-muted">
              {provider?.game ?? "no game"} · {format === "top1" ? "winner takes all" : format === "threshold_race" ? "first to target" : "top 3 podium"}
              {repeating ? ` · ${runs} ${noun.toLowerCase()}${runs === 1 ? "" : "s"}` : ""}
            </p>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted">Entry</div>
            {ruleLines.length === 0 ? (
              <p className="mt-1 text-[11px] text-emerald-300">{OPEN_TO_EVERYONE}</p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {ruleLines.map((l, i) => <li key={i} className="text-[11px] text-ink">{l}</li>)}
              </ul>
            )}
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted">Lands in</div>
            <p className="mt-1 text-[11px] text-ink">
              <b className="tabular-nums">{landing.servers.toLocaleString()}</b> server{landing.servers === 1 ? "" : "s"}
              {landing.members > 0 && <> · <b className="tabular-nums">{landing.members.toLocaleString()}</b> members</>}
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-muted">
              {visibility === "private"
                ? "Only the servers named above. The key is delivered there and nowhere else."
                : "Every server running the bot, plus a reminder each day it's live."}
            </p>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted">Money</div>
            {sponsorBrandId ? (
              <dl className="mt-1 space-y-1">
                <Row label={sponsor?.name ?? "Sponsor"} value={money(sponsorPrice, rate.currency)} />
                <Row label="Podium is worth" value={money(podiumValue, rate.currency)}
                  tone={shortfall > 0 ? "warn" : "good"} />
                <Row label="Model says players get" value={money(prizeTarget, rate.currency)} />
              </dl>
            ) : (
              <p className="mt-1 text-[11px] text-muted">Nothing billed. The podium is worth {money(podiumValue, rate.currency)}.</p>
            )}
            {sponsorBrandId && shortfall > 0 && (
              <p className="mt-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-snug text-amber-200">
                The podium is {money(shortfall, rate.currency)} short of the prize share this price implies.
                Add trophies, or charge less.
              </p>
            )}
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-muted">On save
              <select name="status" value={status} onChange={(e) => setStatus(e.target.value)} className="input-cosmic mt-1 !py-1.5 text-xs">
                <option value="active">Go live now</option>
                <option value="draft">Save as draft (activates at start time)</option>
                {editing && <option value="completed">Mark completed (hands out trophies)</option>}
                {editing && <option value="cancelled">Cancel it</option>}
              </select>
            </label>
            <p className="mt-1.5 text-[10px] leading-snug text-muted">
              {status === "active"
                ? "Announced immediately, then reminded daily until it ends. Its reach is written to the delivery ledger as it lands — that ledger is what a brand is billed against."
                : status === "completed"
                  ? "Standings freeze as final placements and the podium trophies are handed out."
                  : "Nothing is announced until it activates."}
            </p>
          </div>

          <button className="glow-btn pressable inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-2.5 font-semibold text-white">
            <Icon name="rocket" size={15} /> {editing ? "Save changes" : "Launch challenge"}
          </button>
        </div>
      </aside>
    </form>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="truncate text-[11px] text-muted">{label}</dt>
      <dd className={`text-[11px] font-bold tabular-nums ${tone === "warn" ? "text-amber-300" : tone === "good" ? "text-emerald-300" : "text-ink"}`}>
        {value}
      </dd>
    </div>
  );
}
