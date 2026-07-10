import Link from "next/link";
import { notFound } from "next/navigation";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { PROVIDERS, isProviderLive } from "@/lib/providers/registry";
import GameLogo from "@/components/GameLogo";
import Avatar from "@/components/Avatar";
import Icon from "@/components/Icon";
import AdSlot from "@/components/AdSlot";
import LeaderboardWidget from "@/components/LeaderboardWidget";
import { getContent } from "@/lib/cms";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function GameHubPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ stat?: string }>;
}) {
  const { slug } = await params;
  const { stat } = await searchParams;
  const db = await getDb();
  const [game] = await db.select().from(schema.games).where(eq(schema.games.slug, slug)).limit(1);
  if (!game || !game.isActive) notFound();

  const gameProviders = PROVIDERS.filter((p) => p.game === game.name);
  const providerIds = gameProviders.map((p) => p.id);
  const c = await getContent(["banner.games"]);

  const [spaces, challenges, boards, players] = await Promise.all([
    db.select().from(schema.spaces).where(and(eq(schema.spaces.game, game.name), eq(schema.spaces.isActive, true))),
    db.select().from(schema.challenges).where(and(
      eq(schema.challenges.game, game.name), inArray(schema.challenges.status, ["active", "completed"]))).orderBy(desc(schema.challenges.startAt)).limit(6),
    db.select().from(schema.leaderboards).where(and(
      eq(schema.leaderboards.game, game.name), eq(schema.leaderboards.isActive, true))),
    providerIds.length
      ? db.selectDistinct({ user: schema.users, inGameName: schema.linkedGameAccounts.inGameName })
          .from(schema.linkedGameAccounts)
          .innerJoin(schema.users, eq(schema.linkedGameAccounts.userId, schema.users.id))
          .where(and(inArray(schema.linkedGameAccounts.provider, providerIds), eq(schema.users.status, "active")))
          .limit(12)
      : Promise.resolve([]),
  ]);

  return (
    <div>
      {/* Hero */}
      <section className="relative">
        <div
          className="absolute inset-0 -z-10 bg-cover opacity-60"
          style={{
            backgroundImage: `url(${game.coverUrl ?? c["banner.games"]})`,
            backgroundPosition: `${game.coverAdjust.x}% ${game.coverAdjust.y}%`,
          }}
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#04051a]/30 via-[#04051a]/70 to-[#04051a]" />
        <div className="mx-auto max-w-6xl px-4 pt-20 pb-12 flex flex-wrap items-end gap-5">
          <GameLogo logoUrl={game.logoUrl} name={game.name} size={84} className="pulse-glow" />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl md:text-5xl font-bold">{game.name}</h1>
            <p className="text-muted mt-2 max-w-xl">{game.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {gameProviders.map((p) => (
                <span key={p.id} className={`text-xs rounded-full px-2.5 py-1 border ${isProviderLive(p) ? "border-emerald-400/40 text-emerald-300" : "border-amber-400/30 text-amber-300/80"}`}>
                  {p.name} {isProviderLive(p) ? "· live" : "· key ready"}
                </span>
              ))}
            </div>
          </div>
          <Link href="/settings/connections" className="glow-btn pressable rounded-full px-6 py-2.5 text-sm font-semibold text-white">
            Link my {game.name} account
          </Link>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4">
        <AdSlot placement="games_top_banner" className="mb-10" />

        <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-12">
            {/* Leaderboard */}
            <section>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Icon name="chart" size={20} className="text-cyan-300" /> Standings</h2>
              <LeaderboardWidget
                boards={boards}
                activeMetric={stat}
                basePath={`/games/${game.slug}`}
                limit={25}
              />
            </section>

            {/* Challenges */}
            <section>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Icon name="zap" size={20} className="text-amber-300" /> Challenges</h2>
              {challenges.length === 0 ? (
                <div className="glass p-8 text-center text-muted text-sm">No challenges for {game.name} yet — watch this space.</div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {challenges.map((ch) => (
                    <Link
                      key={ch.id}
                      href={`/spaces/${spaces[0]?.slug ?? "general-gaming"}/challenges/${ch.id}`}
                      className="glass card-lift overflow-hidden group"
                    >
                      <div className="h-24 relative overflow-hidden">
                        <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                          style={{ backgroundImage: `url(${ch.coverUrl ?? c["banner.games"]})` }} />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d26] to-transparent" />
                        <span className={`absolute top-2 right-2 text-[10px] uppercase tracking-widest rounded-full px-2 py-0.5 border ${ch.status === "active" ? "border-emerald-400/50 text-emerald-300 bg-emerald-500/10" : "border-violet-400/40 text-muted bg-black/40"}`}>
                          {ch.status === "active" ? "Live" : "Completed"}
                        </span>
                      </div>
                      <div className="p-4">
                        <div className="font-bold text-sm">{ch.title}</div>
                        <div className="text-xs text-muted mt-1 flex items-center gap-1.5">
                          <Icon name="clock" size={12} /> {ch.status === "active" ? `ends ${timeAgo(ch.endAt).replace(" ago", "")}` : `ended ${timeAgo(ch.endAt)}`}
                          <span className="capitalize">· {ch.cadence}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Spaces */}
            <section>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Icon name="users" size={20} className="text-violet-300" /> Community spaces</h2>
              {spaces.length === 0 ? (
                <div className="glass p-8 text-center text-muted text-sm">No dedicated space yet — <Link href="/spaces/request-new" className="text-cyan-300 underline">request one</Link>.</div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {spaces.map((s) => (
                    <Link key={s.id} href={`/spaces/${s.slug}`} className="glass card-lift p-5 flex items-center gap-4">
                      <GameLogo logoUrl={game.logoUrl} name={s.name} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="font-bold">{s.name}</div>
                        <div className="text-xs text-muted flex gap-3 mt-1">
                          <span className="inline-flex items-center gap-1"><Icon name="users" size={12} /> {s.memberCount}</span>
                          <span className="inline-flex items-center gap-1"><Icon name="message" size={12} /> {s.postCount}</span>
                        </div>
                      </div>
                      <Icon name="chevronRight" size={16} className="text-muted" />
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Rail */}
          <aside className="space-y-6">
            <div className="glass p-5">
              <h3 className="font-bold text-sm mb-4 flex items-center gap-2"><Icon name="gamepad" size={16} className="text-cyan-300" /> Players on Cluster</h3>
              {players.length === 0 ? (
                <p className="text-xs text-muted">No linked accounts yet — be the first.</p>
              ) : (
                <div className="space-y-2.5">
                  {players.map((p) => (
                    <Link key={p.user.id} href={`/u/${p.user.slug}`} className="flex items-center gap-2.5 hover:text-cyan-300">
                      <Avatar name={p.user.displayName} src={p.user.avatarUrl} size={30} />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{p.user.displayName}</div>
                        <div className="text-[11px] text-muted truncate">{p.inGameName}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <AdSlot placement="leaderboard_sidebar" />
          </aside>
        </div>
      </div>
    </div>
  );
}
