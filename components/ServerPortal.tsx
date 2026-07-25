import Link from "next/link";

// Panels for the server-owner portal. Server components — nothing here needs
// interactivity, and keeping them server-rendered means the owner's numbers
// never round-trip through the client.

export function TierLadder({ tiers, linked, current }: {
  tiers: { key: string; name: string; threshold: number; badge: string; unlocks: string; detail: string }[];
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
                  <span className="text-xl">{t.badge}</span>
                  <span className="font-bold">{t.name}</span>
                  {isCurrent && (
                    <span className="rounded-full border border-amber-400/50 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-amber-200">
                      you are here
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted">
                  {t.threshold === 0 ? "from day one" : `${t.threshold.toLocaleString()} linked gamers`}
                </span>
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
  rows: { guildId: string; slug: string | null; name: string; iconUrl: string | null; linked: number; challenges: number; tier: string; badge: string; rank: number }[];
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
              <td className="px-4 py-3 whitespace-nowrap"><span className="mr-1">{r.badge}</span>{r.tier}</td>
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
