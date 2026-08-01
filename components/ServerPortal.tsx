import Link from "next/link";
import Icon from "@/components/Icon";

// Panels for the server-owner portal. Server components — nothing here needs
// interactivity, and keeping them server-rendered means the owner's numbers
// never round-trip through the client.

export function TierLadder({ tiers, linked, current }: {
  tiers: { key: string; name: string; threshold: number; icon: string; unlocks: string; detail: string; ownerPct: number }[];
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
              className={`rounded-2xl border p-4 transition ${
                isCurrent
                  ? "border-amber-400/50 bg-amber-500/5"
                  : earned
                    ? "border-emerald-400/25"
                    : "border-white/10 opacity-70"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Icon name={t.icon} size={20} className="text-amber-200" />
                  <span className="font-bold">{t.name}</span>
                  {isCurrent && (
                    <span className="rounded-full border border-amber-400/50 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-amber-200">
                      you are here
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* The rung's cash value, stated on the rung. A ladder whose
                      steps say what they unlock but not what they PAY is the
                      one thing an owner is actually climbing it for. */}
                  {t.ownerPct > 0 && (
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${
                      earned ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200" : "border-white/15 text-muted"
                    }`}>
                      {t.ownerPct}% of every sponsored challenge
                    </span>
                  )}
                  <span className="text-xs text-muted">
                    {t.threshold === 0 ? "from day one" : `${t.threshold.toLocaleString()} linked gamers`}
                  </span>
                </div>
              </div>
              <div className="text-sm font-semibold mt-2">{t.unlocks}</div>
              <p className="text-xs text-muted mt-1">{t.detail}</p>
              {next && t.threshold > 0 && (
                <div className="mt-3">
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: `${pct}%` }} />
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

export function EarningsPanel({ ownerPct, clusterPct, nextPct, nextAt, linked, earned, pending, membersWon, rows }: {
  ownerPct: number;
  clusterPct: number;
  nextPct: number | null;
  nextAt: number | null;
  linked: number;
  earned: number;
  pending: number;
  membersWon: number;
  rows: EarningRowView[];
}) {
  const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  return (
    <div className="space-y-6">
      <div className="glass p-6">
        <h2 className="font-bold mb-1">What you earn</h2>
        <p className="text-sm text-muted">
          A brand pays for a sponsored challenge. <b className="text-ink">70%</b> of it becomes prize money your
          members play for. The remaining 30% is split between you and Cluster — and the more gamers you bring,
          the more of it is yours.
        </p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Money label="Your share" value={`${ownerPct}%`} accent />
          <Money label="Cluster keeps" value={`${clusterPct}%`} />
          <Money label="Earned" value={usd(earned)} accent />
          <Money label="Still running" value={usd(pending)} />
        </div>
        {nextPct != null && nextAt != null && (
          <p className="mt-3 text-xs text-amber-200">
            {(nextAt - linked).toLocaleString()} more linked gamers takes your share from {ownerPct}% to {nextPct}%.
          </p>
        )}
        <p className="mt-3 text-[11px] leading-snug text-muted">
          A challenge runs in more than one server, so its fee is divided by where the entrants came from: your
          share of a challenge is your share of its players. Every row below shows that division.
          Your members have also won <b className="text-ink">{usd(membersWon)}</b> in prize money, which is
          theirs, not yours.
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

function Money({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${accent ? "border-emerald-400/30 bg-emerald-500/[0.06]" : "border-white/10 bg-black/20"}`}>
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${accent ? "text-emerald-300" : ""}`}>{value}</div>
    </div>
  );
}
