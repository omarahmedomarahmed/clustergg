import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { PROVIDERS, isProviderLive } from "@/lib/providers/registry";
import { BadgeIcon } from "@/components/BadgeChip";
import AdSlot from "@/components/AdSlot";
import Avatar from "@/components/Avatar";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const db = await getDb();
  const [tickerRows, badgeRows, topGamers, statCounts] = await Promise.all([
    db.select({
      points: schema.challengeParticipants.currentPoints,
      user: schema.users,
      challenge: schema.challenges,
    })
      .from(schema.challengeParticipants)
      .innerJoin(schema.users, eq(schema.challengeParticipants.userId, schema.users.id))
      .innerJoin(schema.challenges, eq(schema.challengeParticipants.challengeId, schema.challenges.id))
      .orderBy(desc(schema.challengeParticipants.currentPoints))
      .limit(10),
    db.select().from(schema.badges).where(eq(schema.badges.isActive, true)).limit(6),
    db.select().from(schema.users).where(eq(schema.users.status, "active"))
      .orderBy(desc(schema.users.createdAt)).limit(5),
    db.select({
      users: sql<number>`(SELECT COUNT(*) FROM users)`,
      accounts: sql<number>`(SELECT COUNT(*) FROM linked_game_accounts)`,
      challenges: sql<number>`(SELECT COUNT(*) FROM challenges)`,
      spaces: sql<number>`(SELECT COUNT(*) FROM spaces)`,
    }).from(schema.users).limit(1),
  ]);
  const counts = statCounts[0] ?? { users: 0, accounts: 0, challenges: 0, spaces: 0 };
  const livePool = PROVIDERS.filter((p) => !p.identityOnly);
  const ticker = tickerRows.length > 0 ? [...tickerRows, ...tickerRows] : [];

  return (
    <div className="overflow-x-clip">
      {/* ===== HERO ===== */}
      <section className="relative">
        <div
          className="absolute inset-0 -z-10 bg-cover bg-center opacity-80"
          style={{ backgroundImage: "url(/assets/hero.png)" }}
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#04051a]/30 via-[#04051a]/60 to-[#04051a]" />

        <div className="mx-auto max-w-6xl px-4 pt-24 pb-20 text-center">
          <div className="rise-in inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-xs text-cyan-200/90 mb-8">
            <span className="inline-block h-2 w-2 rounded-full bg-cyan-300 animate-pulse" />
            Live stat sync across {livePool.length} game networks
          </div>
          <h1 className="rise-in rise-in-1 text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight">
            Every game.<br />
            <span className="grad-text">One identity.</span>
          </h1>
          <p className="rise-in rise-in-2 mx-auto mt-6 max-w-2xl text-lg text-muted leading-relaxed">
            Cluster pulls your ranks, ratings and wins from every game you play into one
            shareable cosmic profile. Compete in live challenges, earn badges forged from
            real API data, and climb leaderboards that actually mean something.
          </p>
          <div className="rise-in rise-in-3 mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link href="/signup" className="glow-btn rounded-full px-8 py-3.5 font-semibold text-white text-lg">
              Claim your profile →
            </Link>
            <Link href="/u/nova" className="ghost-btn rounded-full px-8 py-3.5 text-lg">
              See a live profile
            </Link>
          </div>

          <div className="rise-in rise-in-4 mt-16 grid grid-cols-2 gap-4 sm:grid-cols-4 max-w-3xl mx-auto">
            {[
              { n: counts.users, label: "Gamers" },
              { n: counts.accounts, label: "Linked accounts" },
              { n: counts.spaces, label: "Spaces" },
              { n: counts.challenges, label: "Challenges" },
            ].map((s) => (
              <div key={s.label} className="glass px-4 py-4">
                <div className="text-3xl font-bold grad-text">{Number(s.n).toLocaleString()}</div>
                <div className="text-xs uppercase tracking-widest text-muted mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== LIVE TICKER ===== */}
      {ticker.length > 0 && (
        <section className="border-y border-violet-500/15 bg-[#070826]/60 py-3 overflow-hidden">
          <div className="flex w-max ticker-track gap-10">
            {ticker.map((t, i) => (
              <Link key={i} href={`/u/${t.user.slug}`} className="flex items-center gap-2 text-sm whitespace-nowrap text-muted hover:text-ink">
                <Avatar name={t.user.displayName} src={t.user.avatarUrl} size={22} />
                <span className="text-ink font-semibold">{t.user.displayName}</span>
                <span className="text-cyan-300 font-bold">{t.points} pts</span>
                <span>in {t.challenge.title}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ===== AD: landing hero banner ===== */}
      <div className="mx-auto max-w-6xl px-4 mt-10">
        <AdSlot placement="landing_hero_banner" />
      </div>

      {/* ===== PROVIDER GRID ===== */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-3xl md:text-4xl font-bold text-center">
          Connected to <span className="grad-text">the whole galaxy</span>
        </h2>
        <p className="text-center text-muted mt-3 max-w-xl mx-auto">
          Real integrations with real game APIs. Green means live right now — the rest
          light up the moment an API key lands.
        </p>
        <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {PROVIDERS.map((p) => {
            const live = isProviderLive(p);
            return (
              <div key={p.id} className="glass glass-hover p-4 flex items-start gap-3">
                <span className="text-2xl leading-none mt-0.5">{p.glyph}</span>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{p.name}</div>
                  <div className="text-xs text-muted truncate">{p.game}</div>
                  <div className={`mt-1.5 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider ${live ? "text-emerald-300" : p.legalFlag && p.phase === 3 ? "text-rose-300/70" : "text-amber-300/80"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-400 animate-pulse" : p.legalFlag && p.phase === 3 ? "bg-rose-400/60" : "bg-amber-400/70"}`} />
                    {live ? "Live" : p.legalFlag && p.phase === 3 ? "Legal review" : "Key ready"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== CHALLENGE ENGINE ===== */}
      <section className="relative py-20">
        <div className="absolute inset-0 -z-10 bg-cover bg-center opacity-40" style={{ backgroundImage: "url(/assets/ambient.png)" }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#04051a] via-transparent to-[#04051a]" />
        <div className="mx-auto max-w-6xl px-4 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold">
              Challenges scored by <span className="grad-text">real API data</span>
            </h2>
            <p className="mt-4 text-muted leading-relaxed">
              No screenshots. No trust falls. Join a challenge, play your game, and Cluster
              scores every win straight from the provider&apos;s API. Live leaderboards move as
              you play — top finishers earn cosmic badges and prizes.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-muted">
              {[
                "Baseline snapshot at join — only new activity counts",
                "Rule engine: thresholds, races, top-1 & top-3 formats",
                "Points update automatically on every stat sync",
                "Placement badges minted on completion",
              ].map((li) => (
                <li key={li} className="flex gap-3"><span className="text-cyan-300">✦</span>{li}</li>
              ))}
            </ul>
            <Link href="/spaces" className="mt-8 inline-block ghost-btn rounded-full px-6 py-2.5">
              Browse live challenges →
            </Link>
          </div>
          <div className="relative flex items-center justify-center py-8">
            <div className="ring-orbit absolute h-72 w-72" />
            <div className="ring-orbit absolute h-96 w-96 [animation-duration:60s]" />
            <div className="glass float-y p-6 w-72 relative z-10">
              <div className="text-xs uppercase tracking-widest text-cyan-300 mb-2">Live challenge</div>
              <div className="font-bold">Blitz Supernova</div>
              <div className="text-xs text-muted mt-1">Weekly wins race · Chess.com API</div>
              <div className="mt-4 space-y-2">
                {tickerRows.slice(0, 3).map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className={`font-bold w-5 ${i === 0 ? "text-amber-300" : i === 1 ? "text-slate-300" : "text-orange-300/80"}`}>#{i + 1}</span>
                    <Avatar name={t.user.displayName} src={t.user.avatarUrl} size={22} />
                    <span className="truncate">{t.user.displayName}</span>
                    <span className="ml-auto text-cyan-300 font-semibold">{t.points}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== BADGES ===== */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-3xl md:text-4xl font-bold text-center">
          Badges <span className="grad-text">forged in the void</span>
        </h2>
        <p className="text-center text-muted mt-3 max-w-lg mx-auto">
          Earned from linked accounts, rank thresholds, community reputation and challenge
          placements. No participation trophies — the criteria are code.
        </p>
        <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          {badgeRows.map((b, i) => (
            <div key={b.id} className={`glass glass-hover p-5 text-center float-y`} style={{ animationDelay: `${i * 0.5}s` }}>
              <div className="flex justify-center"><BadgeIcon icon={b.icon} size={64} /></div>
              <div className="mt-3 text-sm font-semibold">{b.name}</div>
              <div className="mt-1 text-[11px] text-muted leading-snug">{b.description}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== FEATURED GAMERS ===== */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <h2 className="text-2xl font-bold mb-6">Fresh arrivals in the Cluster</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {topGamers.map((g) => (
            <Link key={g.id} href={`/u/${g.slug}`} className="glass glass-hover p-5 text-center">
              <div className="flex justify-center"><Avatar name={g.displayName} src={g.avatarUrl} size={56} /></div>
              <div className="mt-3 font-semibold truncate">{g.displayName}</div>
              <div className="text-xs text-muted truncate">@{g.slug}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="mx-auto max-w-4xl px-4 pb-24 text-center">
        <div className="glass p-12 relative overflow-hidden">
          <div className="shimmer absolute inset-0 pointer-events-none" />
          <h2 className="text-3xl md:text-4xl font-bold">
            Your gaming legacy, <span className="grad-text">one link</span>
          </h2>
          <p className="text-muted mt-4 max-w-md mx-auto">
            clustergg.com/u/you — the only link a gamer needs in their bio.
          </p>
          <Link href="/signup" className="glow-btn mt-8 inline-block rounded-full px-10 py-4 font-semibold text-white text-lg">
            Join the Cluster — it&apos;s free
          </Link>
        </div>
      </section>
    </div>
  );
}
