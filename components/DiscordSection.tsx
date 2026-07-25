import Link from "next/link";
import Icon from "@/components/Icon";
import type { NetworkStats, PublicServer } from "@/lib/network";

// The homepage's main pitch, directly under the hero.
//
// Cluster is the engagement layer for Discord communities. The bot is the
// product, the servers running it are the network, and their combined
// membership is the reach — so those are the numbers here, not sign-up counts.

export function DiscordSection({ stats, servers, installUrl, copy }: {
  stats: NetworkStats;
  servers: PublicServer[];
  installUrl: string | null;
  copy: Record<string, string>;
}) {
  const nf = (n: number) => n.toLocaleString();
  return (
    <section className="relative py-16 sm:py-20 border-y border-white/10 overflow-hidden">
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-violet-600/15 via-transparent to-cyan-500/10" />
      <div className="relative mx-auto max-w-6xl px-4">
        <div className="text-center max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/40 bg-violet-500/10 px-4 py-1.5 text-xs uppercase tracking-widest text-violet-200">
            <Icon name="link" size={13} /> {copy["discord.badge"] || "ClusterBot for Discord"}
          </span>
          <h2 className="text-3xl sm:text-5xl font-black mt-5 leading-tight">
            {copy["discord.title"] || "Turn your Discord into a competition."}
          </h2>
          <p className="text-muted mt-4 text-base sm:text-lg">
            {copy["discord.subtitle"]
              || "Add the bot and your members get ranked profiles, live stats from the games they already play, and challenges with real trophies — without leaving your server. You get the audience numbers, and a share of what they earn."}
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-7">
            {installUrl ? (
              <a href={installUrl} target="_blank" rel="noreferrer" className="grad-btn pressable rounded-full px-7 py-3 font-bold">
                {copy["discord.cta.primary"] || "Add ClusterBot to your server"}
              </a>
            ) : (
              <Link href="/discord-bot" className="grad-btn pressable rounded-full px-7 py-3 font-bold">
                {copy["discord.cta.primary"] || "Add ClusterBot to your server"}
              </Link>
            )}
            <Link href="/servers" className="ghost-btn pressable rounded-full px-7 py-3 font-semibold">
              {copy["discord.cta.secondary"] || "See who's running it"}
            </Link>
          </div>
        </div>

        {/* The network, in four numbers. Reach leads: it's what a brand buys
            and what an owner joins for. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-12">
          <BigStat label="Gamers reached" value={nf(stats.reach)} hint="Combined membership of every server running the bot" accent />
          <BigStat label="Servers" value={nf(stats.servers)} hint="Communities with ClusterBot installed" />
          <BigStat label="Game accounts linked" value={nf(stats.linked)} hint="Members with live synced stats" />
          <BigStat label="Live challenges" value={nf(stats.challenges)} hint={`Across ${nf(stats.games)} games we sync`} />
        </div>

        {/* What it does, in the order an owner experiences it. */}
        <div className="grid md:grid-cols-3 gap-4 mt-12">
          <Step
            n={1}
            title="Add the bot"
            body="It builds your #clustergg channel, posts a how-to guide for everything, and pins it. Nothing to configure."
          />
          <Step
            n={2}
            title="Your members play"
            body="One tap links a game account. Their rank, champions and recent matches render as cards right in your server."
          />
          <Step
            n={3}
            title="You get paid"
            body="Hit 500 linked members and your server earns a share of the ad revenue Cluster makes from your community."
          />
        </div>

        {servers.length > 0 && (
          <div className="mt-12">
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <h3 className="font-bold">Communities already running it</h3>
              <Link href="/servers" className="text-sm text-cyan-300 hover:underline">Explore all →</Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {servers.slice(0, 6).map((s) => (
                <Link
                  key={s.guildId}
                  href={s.slug ? `/servers/${s.slug}` : "/servers"}
                  className="glass rounded-2xl p-4 text-center hover:ring-1 hover:ring-cyan-400/40 transition"
                >
                  {s.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.iconUrl} alt="" className="h-12 w-12 rounded-xl object-cover mx-auto" />
                  ) : (
                    <div className="h-12 w-12 rounded-xl grid place-items-center bg-violet-500/20 text-xl mx-auto">🛰</div>
                  )}
                  <div className="font-semibold text-sm mt-2 truncate">{s.name}</div>
                  <div className="text-[11px] text-muted">{nf(s.memberCount)} members</div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function BigStat({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className={`text-3xl sm:text-4xl font-black ${accent ? "text-cyan-300" : ""}`}>{value}</div>
      <div className="text-sm font-semibold mt-1">{label}</div>
      <div className="text-[11px] text-muted mt-1 leading-snug">{hint}</div>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="w-9 h-9 rounded-full grid place-items-center font-black bg-gradient-to-br from-violet-500 to-cyan-400 text-white">
        {n}
      </div>
      <div className="font-bold mt-3">{title}</div>
      <p className="text-sm text-muted mt-1.5 leading-relaxed">{body}</p>
    </div>
  );
}
