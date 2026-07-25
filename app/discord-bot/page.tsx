import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/t-server";
import { getContent } from "@/lib/cms";
import { installUrl, discordConfigured, CLUSTER_CHANNEL } from "@/lib/discord/config";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "ClusterBot for Discord",
  description: "Add Cluster to your server. Your members get one gaming identity; you get a path to ad revenue.",
};

// Where a server owner starts AND where they land after installing — the
// install callback redirects here with ?installed=1, so this page has to exist
// for onboarding to have an ending.
export default async function DiscordBotPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const { tr } = await getT(user?.locale);
  const url = installUrl();
  const ready = discordConfigured() && !!url;

  const c = await getContent([
    "discord.hero.title", "discord.hero.subtitle", "discord.unlock.threshold",
  ]).catch(() => ({} as Record<string, string>));
  const threshold = Number(c["discord.unlock.threshold"]) || 500;

  const installed = sp.installed;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
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

      <h1 className="text-4xl font-bold leading-tight">
        {c["discord.hero.title"] || (
          <>
            {tr("Your server, with")} <span className="grad-text">{tr("one gaming identity")}</span>
          </>
        )}
      </h1>
      <p className="text-muted max-w-2xl mt-4 text-lg">
        {c["discord.hero.subtitle"] ||
          tr("ClusterBot turns every member into a tracked gamer — real stats from official game APIs, Cluster Points, quests and challenges with real trophies. All inside Discord.")}
      </p>

      <div className="flex flex-wrap gap-3 mt-8">
        {ready ? (
          <a href={url!} className="grad-btn pressable rounded-full px-7 py-3 font-bold">
            {tr("Add ClusterBot to your server")}
          </a>
        ) : (
          <span className="ghost-btn rounded-full px-7 py-3 font-bold opacity-60 cursor-not-allowed">
            {tr("Coming soon")}
          </span>
        )}
        <Link href="/" className="ghost-btn pressable rounded-full px-7 py-3">
          {tr("Explore Cluster")}
        </Link>
      </div>

      <div className="grid sm:grid-cols-3 gap-5 mt-14">
        {[
          {
            icon: "spark",
            title: tr("Everything is a card"),
            body: tr("Profiles, stats, quests, leaderboards and challenges all render as artwork, not walls of text. Buttons underneath navigate in place."),
          },
          {
            icon: "link",
            title: tr("Real stats, never self-reported"),
            body: tr("Members link a game account once. Rank, wins and KDA sync from the official API and stay live."),
          },
          {
            icon: "trophy",
            title: tr("Challenges with real trophies"),
            body: tr("Run competitions where standings move on live data, and winners redeem trophies for real value."),
          },
        ].map((f) => (
          <div key={f.title} className="glass p-6">
            <Icon name={f.icon} className="w-6 h-6 text-cyan-300 mb-3" />
            <h3 className="font-bold mb-1">{f.title}</h3>
            <p className="text-sm text-muted">{f.body}</p>
          </div>
        ))}
      </div>

      <section className="glass p-8 mt-10">
        <div className="text-xs tracking-[0.2em] text-muted font-bold mb-2">{tr("FOR SERVER OWNERS")}</div>
        <h2 className="text-2xl font-bold mb-3">
          {tr("Grow your server into")} <span className="grad-text">{tr("ad revenue")}</span>
        </h2>
        <p className="text-muted max-w-2xl">
          {tr("Run")} <code className="text-cyan-300">/cluster server</code>{" "}
          {tr("any time to see how many of your members have joined Cluster and linked a game. At")}{" "}
          <strong className="text-white">{threshold.toLocaleString()} {tr("linked gamers")}</strong>{" "}
          {tr("your server unlocks a share of the ad revenue Cluster earns from your community.")}
        </p>
        <p className="text-muted max-w-2xl mt-3">
          {tr("You can also request private, server-only challenges that no other server can see — locked to your members with an access key.")}
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold mb-4">{tr("What happens when you add it")}</h2>
        <ol className="space-y-3">
          {[
            tr("A #clustergg channel is created in your server."),
            tr("A how-to guide is posted and pinned for every part of Cluster — including one per quest."),
            tr("You get a DM explaining your growth counter and the revenue unlock."),
            tr("Your members type /cluster and everything is there."),
          ].map((step, i) => (
            <li key={i} className="flex gap-4 items-start">
              <span className="shrink-0 w-8 h-8 rounded-full bg-violet-500/20 text-violet-300 font-bold grid place-items-center">
                {i + 1}
              </span>
              <span className="text-muted pt-1">{step}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
