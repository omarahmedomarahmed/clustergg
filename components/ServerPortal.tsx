import Link from "next/link";
import Icon from "@/components/Icon";

// Panels for the server-owner portal. Server components — nothing here needs
// interactivity, and keeping them server-rendered means the owner's numbers
// never round-trip through the client.

export type TierView = {
  key: string; name: string; threshold: number; icon: string;
  rank: string; tone: string; blurb: string;
  unlocks: string; detail: string; ownerPct: number;
};

/**
 * A server's standing, as a LABEL rather than an icon.
 *
 * A tier is the thing an owner screenshots and puts in their own server, so it
 * has to read as a rank on sight: its own colour, its own numeral, the name,
 * and — the part that makes it worth having — what it pays. Four rows sharing
 * one gold star told an owner nothing and gave them nothing to show off.
 */
export function TierBadge({ tier, size = "md", earned = true }: {
  tier: Pick<TierView, "name" | "rank" | "tone" | "icon" | "ownerPct">;
  size?: "sm" | "md" | "lg";
  earned?: boolean;
}) {
  const pad = size === "lg" ? "px-4 py-2" : size === "sm" ? "px-2.5 py-1" : "px-3 py-1.5";
  const nameSize = size === "lg" ? "text-base" : size === "sm" ? "text-[11px]" : "text-sm";
  const tone = earned ? tier.tone : "#64748b";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border ${pad} ${earned ? "" : "opacity-60"}`}
      style={{
        borderColor: `${tone}66`,
        background: `linear-gradient(120deg, ${tone}22, ${tone}08)`,
        boxShadow: earned ? `0 0 22px -12px ${tone}` : "none",
      }}
    >
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ background: `${tone}2e` }}>
        <Icon name={tier.icon} size={11} style={{ color: tone }} />
      </span>
      <span className="leading-tight">
        <span className={`block font-black ${nameSize}`} style={{ color: tone }}>{tier.name}</span>
        <span className="block text-[9px] font-bold uppercase tracking-[0.18em] text-muted">
          {tier.rank}{tier.ownerPct > 0 ? ` · ${tier.ownerPct}% share` : " · no share yet"}
        </span>
      </span>
    </span>
  );
}

export function TierLadder({ tiers, linked, current }: {
  tiers: TierView[];
  linked: number;
  current: string;
}) {
  return (
    <div className="glass p-6">
      <h2 className="font-bold mb-1">Your tier</h2>
      <p className="text-xs text-muted mb-6">
        Every tier is unlocked by one number: how many of your members joined Cluster <em>and</em> linked a game.
      </p>
      <div className="space-y-3">
        {tiers.map((t) => {
          const earned = linked >= t.threshold;
          const isCurrent = t.key === current;
          const next = !earned;
          const pct = t.threshold > 0 ? Math.min(100, Math.round((linked / t.threshold) * 100)) : 100;
          return (
            <div
              key={t.key}
              className="rounded-2xl border p-4 transition"
              style={{
                borderColor: isCurrent ? `${t.tone}88` : earned ? `${t.tone}40` : "rgba(255,255,255,.10)",
                background: isCurrent ? `linear-gradient(120deg, ${t.tone}14, transparent 70%)` : undefined,
                opacity: earned ? 1 : 0.75,
              }}
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <TierBadge tier={t} earned={earned} />
                  {isCurrent && (
                    <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest"
                      style={{ borderColor: `${t.tone}88`, background: `${t.tone}1a`, color: t.tone }}>
                      you are here
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted">
                  {t.threshold === 0 ? "from day one" : `${t.threshold.toLocaleString()} linked gamers`}
                </span>
              </div>
              <div className="text-xs text-muted mt-1.5 italic">{t.blurb}</div>
              <div className="text-sm font-semibold mt-2">{t.unlocks}</div>
              <p className="text-xs text-muted mt-1">{t.detail}</p>
              {next && t.threshold > 0 && (
                <div className="mt-3">
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, #8b5cf6, ${t.tone})` }} />
                  </div>
                  <div className="text-[11px] text-muted mt-1">
                    {(t.threshold - linked).toLocaleString()} more to unlock
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// What a public challenge page did for this server. The three numbers ARE the
// value exchange — we show their competition to everyone, and the only way in
// is through their door.
export function FunnelPanel({ funnel }: { funnel: { views: number; inviteClicks: number; joined: number } }) {
  const rate = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");
  const steps = [
    { label: "Saw your challenge on Cluster", value: funnel.views, note: "Public challenge pages" },
    { label: "Clicked through to your invite", value: funnel.inviteClicks, note: `${rate(funnel.inviteClicks, funnel.views)} of viewers` },
    { label: "Joined your server", value: funnel.joined, note: `${rate(funnel.joined, funnel.inviteClicks)} of clicks` },
  ];
  return (
    <div className="glass p-6">
      <h2 className="font-bold mb-1">Traffic we sent you</h2>
      <p className="text-xs text-muted mb-5">Last 30 days.</p>
      <div className="space-y-4">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-center gap-4">
            <div className="w-8 h-8 shrink-0 rounded-full grid place-items-center text-xs font-black bg-violet-500/20 text-violet-200">
              {i + 1}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{s.label}</div>
              <div className="text-[11px] text-muted">{s.note}</div>
            </div>
            <div className="text-xl font-black text-cyan-300">{s.value.toLocaleString()}</div>
          </div>
        ))}
      </div>
      {funnel.views === 0 && (
        <p className="text-xs text-muted mt-5">
          Nothing yet. Run a challenge and it appears on its game&apos;s planet and the homepage —
          visible to everyone, enterable only with your key.
        </p>
      )}
    </div>
  );
}

export function ChallengeRow({ challenge, funnel }: {
  challenge: { id: string; title: string; game: string; status: string; accessKey: string | null; endAt: string; owned: boolean };
  funnel: { views: number; inviteClicks: number; joined: number } | null;
}) {
  const tone = challenge.status === "active"
    ? "border-emerald-400/40 text-emerald-300 bg-emerald-500/10"
    : challenge.status === "paused"
      ? "border-amber-400/40 text-amber-200 bg-amber-500/10"
      : "border-white/15 text-muted";
  return (
    <div className="glass p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-bold">{challenge.title}</div>
          <div className="text-xs text-muted">
            {challenge.game} · ends {new Date(challenge.endAt).toLocaleDateString()}
            {challenge.owned ? "" : " · hosted by another server"}
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] uppercase tracking-widest ${tone}`}>
          {challenge.status}
        </span>
      </div>

      {challenge.accessKey && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2">
          <span className="text-[10px] uppercase tracking-widest text-muted">Entry key</span>
          <code className="font-mono font-bold tracking-widest select-all">{challenge.accessKey}</code>
        </div>
      )}

      {funnel && (
        <div className="mt-3 flex gap-5 text-xs text-muted">
          <span><b className="text-ink">{funnel.views.toLocaleString()}</b> views</span>
          <span><b className="text-ink">{funnel.inviteClicks.toLocaleString()}</b> invite clicks</span>
          <span><b className="text-cyan-300">{funnel.joined.toLocaleString()}</b> joined you</span>
        </div>
      )}
    </div>
  );
}

export function CommandFeed({ rows }: {
  rows: { command: string; screen: string | null; arg: string | null; who: string; slug: string | null; at: string }[];
}) {
  return (
    <div className="glass p-6">
      <h2 className="font-bold mb-1">What your members do with the bot</h2>
      <p className="text-xs text-muted mb-4">Most recent first.</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet.</p>
      ) : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 border-t border-white/5 pt-1.5 text-sm">
              <span className="min-w-0 truncate">
                {r.slug
                  ? <Link href={`/u/${r.slug}`} className="hover:text-cyan-300">{r.who}</Link>
                  : <span className="text-muted">{r.who}</span>}
                <span className="text-muted"> · </span>
                <code className="text-xs text-cyan-300">{r.command}</code>
                {r.screen && <span className="text-muted text-xs"> → {r.screen}</span>}
                {r.arg && <span className="text-muted text-xs"> ({r.arg})</span>}
              </span>
              <span className="shrink-0 text-[11px] text-muted">{new Date(r.at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Every server, ranked by gamers brought to Cluster. An owner should be able to
// see exactly where they stand — and click through to anyone above them.
export function ServerBoard({ rows, highlight }: {
  rows: { guildId: string; slug: string | null; name: string; iconUrl: string | null; linked: number; challenges: number; tier: string; icon: string; rank: number }[];
  highlight?: string;
}) {
  return (
    <div className="glass overflow-x-auto">
      <table className="w-full text-sm min-w-[560px]">
        <thead className="text-xs text-muted">
          <tr className="text-left">
            <th className="px-4 py-3 w-12">#</th>
            <th className="px-4 py-3">Server</th>
            <th className="px-4 py-3">Tier</th>
            <th className="px-4 py-3">Gamers brought</th>
            <th className="px-4 py-3">Challenges</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.guildId}
              className={`border-t border-white/5 ${r.guildId === highlight ? "bg-cyan-500/10" : ""}`}
            >
              <td className="px-4 py-3 font-black text-muted">{r.rank}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  {r.iconUrl && /* eslint-disable-next-line @next/next/no-img-element */ (
                    <img src={r.iconUrl} alt="" className="h-7 w-7 rounded-lg object-cover shrink-0" />
                  )}
                  {r.slug
                    ? <Link href={`/servers/${r.slug}`} className="font-semibold hover:text-cyan-300 truncate">{r.name}</Link>
                    : <span className="font-semibold truncate">{r.name}</span>}
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap"><Icon name={r.icon} size={13} className="mr-1.5 text-amber-200" />{r.tier}</td>
              <td className="px-4 py-3 font-bold text-cyan-300">{r.linked.toLocaleString()}</td>
              <td className="px-4 py-3">{r.challenges.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="p-6 text-sm text-muted">No servers yet.</div>}
    </div>
  );
}

// ===== Earnings =====
//
// The one panel an owner opens to answer "what am I making?".
//
// Every row shows its own working — what the brand paid, how many of the
// entrants came from here, the tier percentage, and the product of the three.
// A total an owner cannot reconstruct from the challenge in front of them is a
// total they will email us about, and rightly.

export type EarningRowView = {
  challengeId: string;
  title: string;
  game: string;
  brandName: string | null;
  endsAt: string;
  ended: boolean;
  entrants: number;
  totalEntrants: number;
  price: number;
  serverShare: number;
  ownerPct: number;
  owner: number;
  membersWon: number;
};

export type PayoutView = {
  id: string;
  status: string;
  total: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  note: string | null;
  lines: { id: string; label: string; amount: number }[];
};

/**
 * The Earnings tab.
 *
 * Two earning types, shown as two separate things and never added together:
 *
 *   YOUR SHARE — the cut of what a brand paid, scaled by how many of your
 *                members are linked. Yours. This is what gets paid out.
 *
 *   YOUR MEMBERS' WINNINGS — the prize money people in your server won. Not
 *                yours, never was, and paid directly to them. It is here
 *                because it is the best evidence you have that hosting the bot
 *                did something for your community — and because an owner who
 *                believes the prize pool is their revenue is going to find out
 *                at the worst possible moment.
 */
export function EarningsPanel({
  tier, ownerPct, clusterPct, nextPct, nextAt, linked, earned, pending, membersWon, rows,
  paidOut, inFlight, payouts, payoutMethod, payoutStatus, memberWins, winners,
}: {
  tier: Pick<TierView, "name" | "rank" | "tone" | "icon" | "ownerPct">;
  memberWins: {
    userId: string; name: string; slug: string | null; avatarUrl: string | null;
    challengeId: string; challengeTitle: string; game: string; brandName: string | null;
    place: number; amount: number; at: string;
  }[];
  winners: number;
  ownerPct: number;
  clusterPct: number;
  nextPct: number | null;
  nextAt: number | null;
  linked: number;
  earned: number;
  pending: number;
  membersWon: number;
  rows: EarningRowView[];
  paidOut: number;
  inFlight: number;
  payouts: PayoutView[];
  payoutMethod: string | null;
  payoutStatus: string;
}) {
  const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  const awaiting = Math.max(0, Math.round((earned - paidOut - inFlight) * 100) / 100);

  return (
    <div className="space-y-6">
      {/* The tier, stated first. An owner opening this tab is asking "what am I
          worth", and the tier IS the answer — the percentage follows from it. */}
      <div className="glass p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mb-1.5 text-[10px] uppercase tracking-widest text-muted">Your standing</div>
            <TierBadge tier={tier} size="lg" />
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-muted">Your share of every sponsored challenge</div>
            <div className="text-xl font-black text-emerald-300">{ownerPct}% <span className="text-xs font-bold text-muted">/ {clusterPct}% Cluster</span></div>
          </div>
        </div>
        {nextPct != null && nextAt != null && (
          <p className="mt-3 text-xs text-amber-200">
            {(nextAt - linked).toLocaleString()} more linked gamers takes your share from {ownerPct}% to {nextPct}%.
          </p>
        )}
      </div>

      {/* The two types. */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="glass border border-emerald-400/25 p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-200">
            <Icon name="diamond" size={15} /> Sponsored challenge share
          </div>
          <div className="mt-1 text-3xl font-black text-emerald-300 tabular-nums">{usd(earned)}</div>
          <p className="mt-1.5 text-xs text-muted">
            Your cut of what brands paid, scaled by how many of a challenge&apos;s entrants came from your
            server. <b className="text-ink">This is yours</b> and it is what gets paid out.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Money label="Paid to you" value={usd(paidOut)} />
            <Money label="In flight" value={usd(inFlight)} />
            <Money label="Awaiting payout" value={usd(awaiting)} accent />
          </div>
          {pending > 0 && (
            <p className="mt-2 text-[11px] text-amber-200">
              {usd(pending)} more is still running and isn&apos;t payable until those challenges finish.
            </p>
          )}
        </div>

        <div className="glass border border-violet-400/25 p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-violet-200">
            <Icon name="trophy" size={15} /> Your members&apos; winnings
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-black text-violet-300 tabular-nums">{usd(membersWon)}</span>
            {winners > 0 && (
              <span className="text-xs text-muted">
                across {winners} {winners === 1 ? "member" : "members"} · {memberWins.length} {memberWins.length === 1 ? "podium" : "podiums"}
              </span>
            )}
          </div>
          {/* Said as a banner, not a footnote. An owner who reads this number as
              revenue will build a budget on it, and the moment to prevent that
              is the first time they see it. */}
          <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2">
            <Icon name="alert" size={13} className="mt-0.5 shrink-0 text-violet-200" />
            <p className="text-[11px] leading-snug text-violet-100">
              <b>This is not payable to you.</b> Every cent went straight to the member who won it — Cluster
              pays them directly. It&apos;s on your page because it is the clearest proof of what running the
              bot did for your community, and it is the thing to post in your own announcements channel.
            </p>
          </div>
        </div>
      </div>

      {/* Who actually won. A total is a number; a name and a podium is
          something an owner can put in front of their members. */}
      {memberWins.length > 0 && (
        <div className="glass p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-bold">Every member of yours who won</h3>
            <span className="text-[11px] uppercase tracking-widest text-violet-200">paid to them, not to you</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Newest first. Cluster funds and pays every one of these — you never handle the money and never
            owe it.
          </p>
          <div className="mt-4 space-y-2">
            {memberWins.slice(0, 25).map((w, i) => (
              <div key={`${w.challengeId}-${w.userId}-${i}`}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/25 p-3">
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-black"
                  style={{
                    background: w.place === 1 ? "#fbbf2433" : w.place === 2 ? "#cbd5e133" : "#f9731633",
                    color: w.place === 1 ? "#fbbf24" : w.place === 2 ? "#e2e8f0" : "#fb923c",
                  }}>
                  {w.place}
                </span>
                {w.avatarUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={w.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-white/15" />
                  : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-500/20"><Icon name="user" size={13} className="text-violet-200" /></span>}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {w.slug
                      ? <Link href={`/u/${w.slug}`} className="hover:text-cyan-300">{w.name}</Link>
                      : w.name}
                  </div>
                  <div className="truncate text-[11px] text-muted">
                    {w.challengeTitle}
                    {w.brandName ? ` · ${w.brandName}` : ""} · {w.game}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-black tabular-nums text-violet-300">{usd(w.amount)}</div>
                  <div className="text-[10px] text-muted">{new Date(w.at).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
          {memberWins.length > 25 && (
            <p className="mt-3 text-xs text-muted">…and {memberWins.length - 25} more.</p>
          )}
        </div>
      )}

      {/* How you get paid. Nothing on this panel is a bank detail — see
          lib/payouts.ts for why there is nowhere for one to be entered. */}
      <div className="glass p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">How you get paid</h3>
            <p className="mt-0.5 text-xs text-muted">
              {payoutMethod
                ? <>You&apos;ve told us you prefer <b className="text-ink">{payoutMethod}</b>.</>
                : <>You haven&apos;t told us how you&apos;d like to be paid yet.</>}
              {" "}Cluster never stores your bank details — they live with our payout provider, on their page.
            </p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-widest ${
            payoutStatus === "ready" ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
              : payoutStatus === "pending" ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
                : "border-white/15 text-muted"}`}>
            {payoutStatus === "ready" ? "ready to pay" : payoutStatus === "pending" ? "finishing setup" : "not set up"}
          </span>
        </div>

        {payouts.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-muted">Payout history</div>
            {payouts.map((p) => (
              <details key={p.id} className="rounded-xl border border-white/10 bg-black/25 p-3">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                  <b className="tabular-nums text-emerald-300">{usd(p.total)} {p.currency}</b>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    p.status === "paid" ? "bg-emerald-500/15 text-emerald-300"
                      : p.status === "failed" || p.status === "cancelled" ? "bg-rose-500/15 text-rose-300"
                        : "bg-amber-500/15 text-amber-300"}`}>{p.status}</span>
                  <span className="ml-auto text-[11px] text-muted">
                    {new Date(p.paidAt ?? p.createdAt).toLocaleDateString()}
                  </span>
                </summary>
                <div className="mt-2 space-y-1 border-t border-white/5 pt-2 text-xs">
                  {p.lines.map((l) => (
                    <div key={l.id} className="flex items-start justify-between gap-3">
                      <span className={l.amount < 0 ? "text-emerald-200" : "text-muted"}>{l.label}</span>
                      <span className="shrink-0 tabular-nums font-semibold">{usd(l.amount)}</span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      <div className="glass p-6">
        <h2 className="font-bold mb-1">The ledger</h2>
        <p className="text-sm text-muted">
          A challenge runs in more than one server, so its fee is divided by where the entrants came from: your
          share of a challenge is your share of its players. Every row shows that division, so you can check
          the total rather than take it on trust.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="glass p-6 text-sm text-muted">
          No sponsored challenges have run here yet. They start once your server is unlocked and a brand buys
          the games your members play.
        </div>
      ) : (
        <div className="glass overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-[11px] uppercase tracking-widest text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Challenge</th>
                <th className="px-4 py-3 text-left">Brand</th>
                <th className="px-4 py-3 text-right">Brand paid</th>
                <th className="px-4 py-3 text-right">Your players</th>
                <th className="px-4 py-3 text-right">Your share</th>
                <th className="px-4 py-3 text-right">You earned</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.challengeId} className="border-t border-white/5">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{r.title}</div>
                    <div className="text-[11px] text-muted">
                      {r.game} · {r.ended ? "finished" : "running"} {new Date(r.endsAt).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{r.brandName ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{usd(r.price)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.entrants.toLocaleString()}<span className="text-muted"> / {r.totalEntrants.toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">
                    {r.ownerPct}% × {Math.round(r.serverShare * 100)}%
                  </td>
                  <td className={`px-4 py-3 text-right font-bold tabular-nums ${r.ended ? "text-emerald-300" : "text-amber-200"}`}>
                    {usd(r.owner)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * How a server actually makes money, in the order it happens.
 *
 * Owners install the bot and then ask, reasonably, "so how do I get paid?" —
 * and the honest answer has exactly one lever in it: get your members to link a
 * game account. Everything else follows from that number. So the guide is four
 * steps and a journey, not a wall of policy, and the lever is the only thing
 * with a button next to it.
 */
export function EarningGuide({ tiers, linked, currentKey, inviteUrl, slug }: {
  tiers: TierView[];
  linked: number;
  currentKey: string;
  inviteUrl: string | null;
  slug: string;
}) {
  const ladder = [...tiers].sort((a, b) => a.threshold - b.threshold);
  const top = ladder[ladder.length - 1];
  const next = ladder.find((t) => t.threshold > linked) ?? null;
  const journeyPct = Math.max(2, Math.min(100, Math.round((linked / Math.max(1, top.threshold)) * 100)));

  const steps = [
    {
      n: 1,
      title: "The bot is in your server",
      body: "Done — that is what this portal is. Your members can already run /cluster, see their stats and enter competitions.",
      done: true,
    },
    {
      n: 2,
      title: "Your members link a game account",
      body: "This is the only lever. A member who joins Cluster and links League, Valorant, PUBG, Dota, Apex or Fortnite counts toward your tier. One who just joins does not — linking is what makes them an audience a brand can be sold.",
      done: linked > 0,
      lever: true,
    },
    {
      n: 3,
      title: "You cross 500 linked and brands start paying you",
      body: "At 500 you are monetized: brands sponsoring the games your members play run their weekly challenges in your server, and 5% of what they paid is yours. Below 500 you can still run challenges — they just aren't sponsored yet.",
      done: linked >= 500,
    },
    {
      n: 4,
      title: "You get paid, we never touch your bank",
      body: "Your share builds up in the ledger on this tab. We open a payout, you can check it line by line, and the money is sent by our payout partner — where it lands is something you tell them, not us.",
      done: false,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="glass p-6">
        <h2 className="text-lg font-bold">How a server earns on Cluster</h2>
        <p className="mt-1 text-sm text-muted">
          Four steps, and only one of them is work. Everything you earn is decided by a single number:{" "}
          <b className="text-cyan-300">how many of your members have linked a game account</b>.
        </p>

        <div className="mt-5 space-y-3">
          {steps.map((s) => (
            <div key={s.n}
              className={`flex gap-3 rounded-2xl border p-4 ${
                s.lever ? "border-cyan-400/40 bg-cyan-500/[0.06]" : "border-white/10 bg-black/20"}`}>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-black ${
                s.done ? "bg-emerald-500/20 text-emerald-300" : s.lever ? "bg-cyan-500/25 text-cyan-200" : "bg-white/8 text-muted"}`}>
                {s.done ? <Icon name="check" size={14} /> : s.n}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
                  {s.title}
                  {s.lever && (
                    <span className="rounded-full border border-cyan-400/50 bg-cyan-500/15 px-2 py-0.5 text-[9px] uppercase tracking-widest text-cyan-200">
                      the lever
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-snug text-muted">{s.body}</p>
                {s.lever && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Link href={`/servers/${slug}`}
                      className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-bold text-cyan-100 hover:bg-cyan-500/20">
                      Share your server page
                    </Link>
                    {inviteUrl && (
                      <a href={inviteUrl} target="_blank" rel="noreferrer"
                        className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] text-muted hover:text-ink">
                        Your invite link
                      </a>
                    )}
                    <span className="text-[11px] text-muted">
                      Or tell them in your own channels: <code className="text-cyan-300">/cluster</code> → Connect a game.
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* The journey. One track, four gates, and a marker that is where the
          server actually is — an owner should be able to see the distance to
          the next rung without doing arithmetic. */}
      <div className="glass p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-bold">Your journey to {top.threshold.toLocaleString()}</h3>
          <span className="text-xs text-muted">
            <b className="text-cyan-300">{linked.toLocaleString()}</b> linked so far
          </span>
        </div>

        <div className="relative mt-8 mb-2">
          <div className="h-2.5 rounded-full bg-white/8" />
          <div className="absolute inset-y-0 left-0 h-2.5 rounded-full"
            style={{ width: `${journeyPct}%`, background: "linear-gradient(90deg,#8b5cf6,#22d3ee,#fbbf24)" }} />
          {/* Where you are. */}
          <div className="absolute -top-7" style={{ left: `${journeyPct}%`, transform: "translateX(-50%)" }}>
            <div className="rounded-full border border-cyan-400/60 bg-[#04051a] px-2 py-0.5 text-[10px] font-black text-cyan-200 whitespace-nowrap">
              you · {linked.toLocaleString()}
            </div>
          </div>
          {/* The gates. */}
          {ladder.map((t) => {
            const at = Math.min(100, Math.round((t.threshold / Math.max(1, top.threshold)) * 100));
            const reached = linked >= t.threshold;
            return (
              <div key={t.key} className="absolute top-1/2" style={{ left: `${at}%`, transform: "translate(-50%,-50%)" }}>
                <span className="block h-4 w-4 rounded-full border-2"
                  style={{
                    borderColor: reached ? t.tone : "rgba(255,255,255,.25)",
                    background: reached ? t.tone : "#04051a",
                    boxShadow: reached ? `0 0 14px -2px ${t.tone}` : "none",
                  }} />
              </div>
            );
          })}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ladder.map((t) => {
            const reached = linked >= t.threshold;
            const isCurrent = t.key === currentKey;
            const togo = Math.max(0, t.threshold - linked);
            return (
              <div key={t.key}
                className="rounded-2xl border p-4"
                style={{
                  borderColor: isCurrent ? `${t.tone}88` : reached ? `${t.tone}40` : "rgba(255,255,255,.10)",
                  background: isCurrent ? `linear-gradient(140deg, ${t.tone}18, transparent 75%)` : undefined,
                  opacity: reached ? 1 : 0.85,
                }}>
                <TierBadge tier={t} size="sm" earned={reached} />
                <div className="mt-2.5 text-2xl font-black tabular-nums" style={{ color: reached ? t.tone : undefined }}>
                  {t.threshold === 0 ? "Day one" : t.threshold.toLocaleString()}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-muted">
                  {t.threshold === 0 ? "no requirement" : "linked gamers"}
                </div>
                <p className="mt-2 text-xs font-semibold">{t.blurb}</p>
                <p className="mt-1 text-[11px] leading-snug text-muted">{t.unlocks}</p>
                <div className="mt-2.5 border-t border-white/10 pt-2 text-[11px]">
                  {reached
                    ? <span className="text-emerald-300">Unlocked{isCurrent ? " — you are here" : ""}</span>
                    : <span className="text-amber-200">{togo.toLocaleString()} more members to link</span>}
                </div>
              </div>
            );
          })}
        </div>

        {next && (
          <p className="mt-5 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs text-muted">
            <b className="text-ink">Next up: {next.name}.</b> {(next.threshold - linked).toLocaleString()} more of
            your members need to link a game account, and your share of every sponsored challenge goes to{" "}
            <b className="text-emerald-300">{next.ownerPct}%</b>. That is {next.ownerPct}% of what a brand pays,
            on top of the prize money your members win.
          </p>
        )}
      </div>
    </div>
  );
}

function Money({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${accent ? "border-emerald-400/30 bg-emerald-500/[0.06]" : "border-white/10 bg-black/20"}`}>
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${accent ? "text-emerald-300" : ""}`}>{value}</div>
    </div>
  );
}
