import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/t-server";
import { getContent } from "@/lib/cms";
import { installUrl, discordConfigured, CLUSTER_CHANNEL } from "@/lib/discord/config";
import { networkStats, publicServers } from "@/lib/network";
import { botShowcaseSteps } from "@/lib/bot-showcase";
import ServerEarnCards from "@/components/ServerEarnCards";
import { buildPricing, money, perGame, prizeSharePct } from "@/lib/pricing";
import { PRICING_NUMBER_KEYS } from "@/lib/pricing";
import BotShowcase from "@/components/BotShowcase";
import BrandGlyph from "@/components/BrandGlyph";
import Icon from "@/components/Icon";
import { BotSchema, BotFaqSchema, BOT_FAQ } from "@/components/StructuredData";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "ClusterBot for Discord — ranked profiles, live game stats and challenges",
  description:
    "Add ClusterBot to your Discord server. Members get ranked profiles and live stats from League, Valorant, Apex, CS2, Fortnite and more, plus challenges with real trophies — all inside Discord. Hit 500 linked members and brands start sponsoring weekly challenges there, with the prize money won by your members.",
  alternates: { canonical: "/discord-bot" },
  openGraph: {
    title: "ClusterBot for Discord",
    description: "Ranked profiles, live game stats and challenges with real trophies — inside your server.",
    url: "/discord-bot",
    type: "website",
  },
};

// Where a server owner starts AND where they land after installing — the
// install callback redirects here with ?installed=1, so this page has to exist
// for onboarding to have an ending.
//
// The pitch is the product: the same interactive showcase the homepage runs,
// with real cards from our own renderer. An owner deciding whether to add a bot
// wants to see what it puts in their channel, and no amount of feature copy
// substitutes for that.
export default async function DiscordBotPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const { tr } = await getT(user?.locale);
  const url = installUrl();
  const ready = discordConfigured() && !!url;

  const [c, network, servers, steps] = await Promise.all([
    getContent(["discord.hero.title", "discord.hero.subtitle", "discord.unlock.threshold", ...PRICING_NUMBER_KEYS])
      .catch(() => ({} as Record<string, string>)),
    networkStats().catch(() => ({ servers: 0, reach: 0, linked: 0, challenges: 0, games: 0 })),
    publicServers(8).catch(() => []),
    botShowcaseSteps().catch(() => []),
  ]);
  const threshold = Number(c["discord.unlock.threshold"]) || 500;
  const cfg = buildPricing(c);
  const installed = sp.installed;
  const nf = (n: number) => n.toLocaleString();

  return (
    <div>
      <BotSchema servers={network.servers} />
      <BotFaqSchema threshold={threshold} gameCount={network.games} />

      <div className="mx-auto max-w-6xl px-4 pt-10">
        {installed === "1" && (
          <div className="glass p-5 mb-8 border border-emerald-400/30">
            <div className="flex items-start gap-3">
              <Icon name="check" className="w-5 h-5 text-emerald-300 mt-0.5" />
              <div>
                <h2 className="font-bold text-emerald-200">{tr("ClusterBot is in your server")}</h2>
                <p className="text-sm text-muted mt-1">
                  {tr("Head back to Discord — I've created")} <code className="text-cyan-300">#{CLUSTER_CHANNEL}</code>{" "}
                  {tr("and pinned a how-to guide for every part of Cluster. Type")} <code className="text-cyan-300">/cluster</code>{" "}
                  {tr("to see everything.")}
                </p>
                <p className="text-xs text-muted mt-2">
                  {tr("Setup finishes in the background — give it a few seconds if the guides aren't there yet.")}
                </p>
              </div>
            </div>
          </div>
        )}
        {installed === "cancelled" && (
          <div className="glass p-4 mb-8 border border-amber-400/30 text-sm">
            {tr("Install cancelled — nothing was added to your server. You can try again below.")}
          </div>
        )}
        {installed === "unavailable" && (
          <div className="glass p-4 mb-8 border border-amber-400/30 text-sm">
            {tr("The bot isn't accepting installs right now. Please try again shortly.")}
          </div>
        )}
      </div>

      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-violet-600/20 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-6xl px-4 py-14 sm:py-20 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/40 bg-violet-500/10 px-4 py-1.5 text-xs uppercase tracking-widest text-violet-200">
            <BrandGlyph provider="discord" size={14} /> Free · installs in one click
          </span>
          {/* The copy is the CMS's, with no fallback string beside it.
              These keys previously had no default, so the page rendered the
              JSX literal instead — and stayed on the old positioning through
              a site-wide rewrite that had touched every other surface. A
              second copy of a sentence is a second copy to forget. */}
          <h1 className="text-4xl sm:text-6xl font-black leading-[1.05] mt-5 max-w-3xl mx-auto">
            {c["discord.hero.title"]}
          </h1>
          <p className="text-muted max-w-2xl mx-auto mt-5 text-lg leading-relaxed">
            {(c["discord.hero.subtitle"] ?? "").replace("{threshold}", threshold.toLocaleString())}
          </p>

          <div className="flex flex-wrap gap-3 justify-center mt-8">
            {ready ? (
              <a
                href={url!}
                className="pressable inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-bold text-white text-base"
                style={{ background: "#5865f2", boxShadow: "0 10px 30px -12px #5865f2" }}
              >
                <BrandGlyph provider="discord" size={22} /> Add ClusterBot to your server
              </a>
            ) : (
              <span className="ghost-btn rounded-full px-7 py-3.5 font-bold opacity-60 cursor-not-allowed">
                {tr("Coming soon")}
              </span>
            )}
            <Link href="/servers" className="ghost-btn pressable rounded-full px-7 py-3.5 font-semibold">
              See who&apos;s running it
            </Link>
          </div>

          {network.servers > 0 && (
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 mt-10 text-sm">
              <Fact value={nf(network.reach)} label="gamers reached" />
              <Fact value={nf(network.servers)} label="servers" />
              <Fact value={nf(network.linked)} label="accounts linked" />
              <Fact value={nf(network.games)} label="games synced" />
            </div>
          )}
        </div>
      </section>

      {/* ===== THE PRODUCT, SHOWN ===== */}
      {steps.length > 1 && (
        <BotShowcase
          steps={steps}
          installUrl={ready ? url : null}
          heading="Everything the bot does, in your channel"
          blurb="These are live cards from the real renderer, not screenshots. Press a button — that's exactly how it behaves in your server."
        />
      )}

      {/* ===== WHY IT'S DIFFERENT ===== */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid sm:grid-cols-3 gap-5">
          {[
            {
              icon: "spark",
              title: "Everything is a card",
              body: "Profiles, stats, quests, leaderboards and challenges render as artwork, not walls of text. The buttons underneath navigate in place — one message, no channel spam.",
            },
            {
              icon: "link",
              title: "Real stats, never self-reported",
              body: "Members link a game account once, inside Discord. Rank, wins and KDA sync from the official game API and stay live, so a leaderboard can't be talked up.",
            },
            {
              icon: "trophy",
              title: "Challenges with real trophies",
              body: "Standings move on live data. Stats are snapshotted the moment someone joins, so only new activity counts — a smurf can't win by showing up ranked.",
            },
          ].map((f) => (
            <div key={f.title} className="glass p-6">
              <Icon name={f.icon} className="w-6 h-6 text-cyan-300 mb-3" />
              <h3 className="font-bold mb-1.5">{f.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== THE OWNER'S DEAL =====
          The reason to install, given the space it deserves. An owner is being
          asked to put a bot in front of their community; "it's free and it's
          nice" doesn't earn that. What earns it is a number they can reach and
          a payment that follows. */}
      <section className="border-y border-white/10 bg-[#070826]/60 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <ServerEarnCards installUrl={ready ? url ?? undefined : undefined} />

          {/* Where the money comes from. An owner who doesn't understand the
              source assumes it's venture money and doesn't believe it lasts. */}
          <div className="mt-10 glass rounded-3xl p-6 md:p-8">
            <div className="grid lg:grid-cols-[1.3fr_1fr] gap-8 items-center">
              <div>
                <div className="inline-flex items-center gap-2 text-xs text-cyan-200 bg-cyan-500/10 border border-cyan-400/30 rounded-full px-3 py-1.5">
                  <Icon name="chart" size={12} /> Where the money comes from
                </div>
                <h3 className="text-2xl font-bold mt-4">Brands pay us. Your members get paid.</h3>
                <p className="text-muted mt-3 leading-relaxed">
                  A brand buys a game&apos;s weekly challenge — {money(cfg.challengePrice, cfg.currency)} each,{" "}
                  {money(perGame(cfg), cfg.currency)} a month for all {cfg.challengesPerGame}. Of every one of those,{" "}
                  <strong className="text-ink">{money(cfg.prizePool, cfg.currency)}</strong> is prize money —{" "}
                  {prizeSharePct(cfg)}% of what the brand pays, handed to the three gamers who win as trophies carrying
                  that brand&apos;s name. The challenges run where the players are, so if yours is a League server,
                  League sponsorship money is won by your members. We take the difference and run the whole thing.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link href="/pricing" className="ghost-btn pressable rounded-full px-5 py-2.5 text-sm">
                    See what brands pay
                  </Link>
                  <Link href="/servers" className="ghost-btn pressable rounded-full px-5 py-2.5 text-sm">
                    Servers already earning
                  </Link>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MoneyFact value={money(perGame(cfg) * (cfg.prizePool / Math.max(1, cfg.challengePrice)), cfg.currency)} label="prize money per sponsored game, every month" gold />
                <MoneyFact value={threshold.toLocaleString()} label="linked gamers to switch it on" />
                <MoneyFact value={String(cfg.games * cfg.challengesPerGame)} label="sponsored challenges a month across the network" />
                <MoneyFact value={money(cfg.games * cfg.challengesPerGame * cfg.prizePool, cfg.currency)} label="won by gamers every month, network-wide" />
              </div>
            </div>
          </div>

          <p className="text-xs text-muted mt-6 max-w-3xl">
            Run <code className="text-cyan-300">/cluster show:admin</code> in your server any time to see how many members
            have joined Cluster and linked a game, how far you are from the next stage, and what you&apos;ve earned.
            Private challenges locked to your members with an access key are available from day one.
          </p>
        </div>
      </section>

      {/* ===== WHAT INSTALL ACTUALLY DOES ===== */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold mb-2">What happens the moment you add it</h2>
        <p className="text-sm text-muted mb-7 max-w-2xl">
          Nothing to configure. The bot asks for exactly the permissions it uses and nothing more — it never reads
          message content, and it can&apos;t: we don&apos;t request that intent.
        </p>
        <ol className="grid sm:grid-cols-2 gap-4">
          {[
            { t: "It builds #clustergg", b: "One channel, created in your server. If it can't, the owner gets a DM saying exactly which permission is missing." },
            { t: "It posts and pins the guides", b: "A how-to card for every part of Cluster, including one per quest — so nobody has to be told a command exists." },
            { t: "You get a DM", b: "Your growth counter, the revenue unlock, and your server portal link with its private key." },
            { t: "Your members type /cluster", b: "Their profile, their games, the leaderboards and every live challenge. Linking an account happens inside Discord." },
          ].map((s, i) => (
            <li key={i} className="glass p-5 flex gap-4">
              <span className="shrink-0 w-8 h-8 rounded-full bg-violet-500/20 text-violet-300 font-bold grid place-items-center">
                {i + 1}
              </span>
              <span>
                <span className="font-semibold block">{s.t}</span>
                <span className="text-sm text-muted">{s.b}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* ===== SOCIAL PROOF ===== */}
      {servers.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-14">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <h2 className="font-bold">Communities already running it</h2>
            <Link href="/servers" className="text-sm text-cyan-300 hover:underline">Explore all →</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {servers.map((s) => (
              <Link
                key={s.guildId}
                href={s.slug ? `/servers/${s.slug}` : "/servers"}
                className="glass rounded-2xl p-4 text-center hover:ring-1 hover:ring-cyan-400/40 transition"
              >
                {s.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.iconUrl} alt="" className="h-11 w-11 rounded-xl object-cover mx-auto" />
                ) : (
                  <div className="h-11 w-11 rounded-xl grid place-items-center bg-violet-500/20 text-lg mx-auto"><Icon name="satellite" size={20} className="text-violet-200" /></div>
                )}
                <div className="font-semibold text-xs mt-2 truncate">{s.name}</div>
                <div className="text-[10px] text-muted">{nf(s.memberCount)}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ===== FAQ =====
          On the page as well as in the structured data. Schema describing
          content that isn't visible is both against Google's guidelines and a
          lie to the reader — and these are the five things every owner asks
          before installing anything. */}
      <section className="mx-auto max-w-3xl px-4 pb-14">
        <h2 className="text-2xl font-bold mb-5">Before you add it</h2>
        <div className="space-y-3">
          {BOT_FAQ.map(([q, a]) => (
            <details key={q} className="glass rounded-2xl p-5">
              <summary className="cursor-pointer font-semibold text-sm">{q}</summary>
              <p className="text-sm text-muted mt-2.5 leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ===== CLOSING CTA ===== */}
      <section className="mx-auto max-w-3xl px-4 pb-20 text-center">
        <h2 className="text-2xl sm:text-3xl font-black">Add it, and see what your members do with it.</h2>
        <p className="text-muted mt-3">
          Free, one click, and nothing to set up. If it isn&apos;t for you, removing it takes one click too.
        </p>
        {ready && (
          <a
            href={url!}
            className="pressable inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-bold text-white mt-6"
            style={{ background: "#5865f2", boxShadow: "0 10px 30px -12px #5865f2" }}
          >
            <BrandGlyph provider="discord" size={22} /> Add ClusterBot to your server
          </a>
        )}
      </section>
    </div>
  );
}

function MoneyFact({ value, label, gold = false }: { value: string; label: string; gold?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${gold ? "bg-emerald-500/10 border-emerald-400/30" : "bg-black/25 border-white/10"}`}>
      <div className={`text-2xl font-bold leading-none ${gold ? "text-emerald-300" : "grad-text"}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-muted mt-2 leading-snug">{label}</div>
    </div>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <b className="text-xl text-cyan-300">{value}</b>
      <span className="text-muted">{label}</span>
    </span>
  );
}
