import Link from "next/link";
import { networkStats, publicServers } from "@/lib/network";
import { tierFor } from "@/lib/server-portal";
import { installUrl } from "@/lib/discord/config";
import { getContent } from "@/lib/cms";
import { buildCardBgMap, cardBgCmsKeys, cardBgStyle } from "@/lib/card-bg";
import { buildPricing, money, PRICING_NUMBER_KEYS } from "@/lib/pricing";
import ServerEarnCards from "@/components/ServerEarnCards";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Get paid for your Discord community",
  description:
    "Install ClusterBot free, link 500 gamers, and earn from the brands sponsoring the games your members play. Plus every community already running it.",
};

// The server-owner page.
//
// It used to be a directory with a CTA on top. It is now the earning pitch with
// a directory under it, because the two audiences it serves want different
// things in that order: an owner deciding whether to install needs the deal
// first, and a gamer looking for a community scrolls past a pitch happily.
export default async function ServersDirectoryPage() {
  const [stats, servers, content] = await Promise.all([
    networkStats(),
    publicServers(),
    getContent([...PRICING_NUMBER_KEYS, ...cardBgCmsKeys]),
  ]);
  const install = installUrl();
  const cfg = buildPricing(content);
  const bg = buildCardBgMap(content);
  const nf = (n: number) => n.toLocaleString();

  return (
    <div className="min-h-screen">
      <section className="relative border-b border-white/10">
        <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-emerald-500/15 via-transparent to-cyan-500/10" />
        <div className="relative mx-auto max-w-6xl px-4 py-12 sm:py-16">
          <h1 className="text-3xl sm:text-5xl font-black">
            Your community built an audience.<br />
            <span className="grad-text">Start getting paid for it.</span>
          </h1>
          <p className="text-muted mt-4 max-w-2xl leading-relaxed">
            Cluster pays Discord servers out of what brands pay us. Install the bot free, run challenges with
            real prize money, and keep {Math.round(cfg.serverSharePct)}% of the revenue your community
            generates. Every server below did exactly that.
          </p>
          <div className="flex flex-wrap gap-6 mt-7">
            <Stat label="Servers" value={nf(stats.servers)} />
            <Stat label="Gamers reached" value={nf(stats.reach)} accent />
            <Stat label="Accounts linked" value={nf(stats.linked)} />
            <Stat label="Live challenges" value={nf(stats.challenges)} />
          </div>
          {install && (
            <a href={install} target="_blank" rel="noreferrer" className="grad-btn pressable rounded-full px-6 py-3 font-bold inline-block mt-8">
              Add ClusterBot to your server
            </a>
          )}
        </div>
      </section>

      {/* ===== THE LADDER ===== */}
      <section className="relative py-16 border-b border-white/10" style={{ background: cardBgStyle(bg, "sec_servers") }}>
        <div className="relative mx-auto max-w-6xl px-4">
          <ServerEarnCards installUrl={install || undefined} />
          <div className="mt-8 glass rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Icon name="chart" size={20} className="text-cyan-300 shrink-0" />
            <p className="text-sm text-muted leading-relaxed flex-1">
              Brands pay {money(cfg.perGame, cfg.currency)} a month per game for {cfg.challengesPerGame} sponsored
              challenges. Those challenges run in the servers whose members play that game — so what your community
              earns depends on what your community plays.
            </p>
            <Link href="/pricing" className="ghost-btn pressable rounded-full px-5 py-2.5 text-sm shrink-0">
              See what brands pay
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Communities already running it</h2>
          <p className="text-sm text-muted mt-1.5 max-w-2xl">
            Join one to compete in its challenges — a server challenge is public to watch, but the key to enter
            only goes to that server&apos;s members.
          </p>
        </div>
        {servers.length === 0 ? (
          <div className="glass p-10 text-center">
            <div className="font-semibold">No servers yet.</div>
            <p className="text-sm text-muted mt-1">
              The first community to add the bot appears here.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {servers.map((s) => {
              const tier = tierFor(s.linked).current;
              return (
                <div key={s.guildId} className="glass rounded-2xl p-5 flex flex-col">
                  <div className="flex items-center gap-3">
                    {s.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.iconUrl} alt="" className="h-14 w-14 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="h-14 w-14 rounded-xl grid place-items-center bg-violet-500/20 text-2xl shrink-0"><Icon name="satellite" size={20} className="text-violet-200" /></div>
                    )}
                    <div className="min-w-0">
                      <div className="font-bold truncate">{s.name}</div>
                      <div className="text-[11px] text-muted">{nf(s.memberCount)} members</div>
                    </div>
                  </div>

                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-100 self-start">
                    <Icon name={tier.icon} size={12} />{tier.name}
                  </div>

                  <div className="flex gap-4 text-xs text-muted mt-3">
                    <span><b className="text-cyan-300">{nf(s.linked)}</b> linked</span>
                    <span><b className="text-ink">{nf(s.challenges)}</b> challenges</span>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/5">
                    {s.slug && (
                      <Link href={`/servers/${s.slug}`} className="ghost-btn pressable rounded-full px-4 py-2 text-xs font-semibold">
                        View server
                      </Link>
                    )}
                    {s.inviteUrl && (
                      <a
                        href={`/api/servers/invite?g=${encodeURIComponent(s.guildId)}`}
                        target="_blank" rel="noreferrer"
                        className="grad-btn pressable rounded-full px-4 py-2 text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        <Icon name="link" size={12} /> Join
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className={`text-2xl sm:text-3xl font-black ${accent ? "text-cyan-300" : ""}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-widest text-muted">{label}</div>
    </div>
  );
}
