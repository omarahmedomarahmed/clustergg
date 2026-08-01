import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/t-server";
import { profileAnalytics } from "@/lib/identity";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your profile analytics" };

// A gamer's own reach: how many people saw them, where, and who backed them.
// The Discord split is the interesting part — it tells them whether sharing in
// servers is actually working.
export default async function ProfileAnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { tr } = await getT(user.locale);
  const a = await profileAnalytics(user.id);

  const tiles = [
    { label: tr("Total profile views"), value: a.totalViews, icon: "eye", accent: "text-cyan-300" },
    { label: tr("From the website"), value: a.webViews, icon: "globe", accent: "text-violet-300" },
    { label: tr("From Discord"), value: a.discordViews, icon: "message", accent: "text-indigo-300" },
    { label: tr("Best Profile votes"), value: a.votes, icon: "star", accent: "text-amber-300" },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h1 className="text-3xl font-bold">{tr("Your")} <span className="grad-text">{tr("reach")}</span></h1>
        <Link href={`/u/${user.slug}`} className="ghost-btn pressable rounded-full px-5 py-2 text-sm">
          {tr("View my profile")}
        </Link>
      </div>
      <p className="text-muted max-w-xl mb-8">
        {tr("Who has seen your profile, where they saw it, and who voted for you.")}
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {tiles.map((t) => (
          <div key={t.label} className="glass p-5">
            <Icon name={t.icon} size={18} className={`${t.accent} mb-2`} />
            <div className="text-2xl font-bold">{t.value.toLocaleString()}</div>
            <div className="text-xs text-muted">{t.label}</div>
          </div>
        ))}
      </div>

      {a.rank && (
        <div className="glass p-6 mb-8 border border-amber-400/25">
          <div className="flex flex-wrap items-center gap-3">
            <Icon name="star" size={20} className="text-amber-300" />
            <span className="font-bold">
              {tr("You're")} #{a.rank} {tr("on the Best Profile board")}
            </span>
            <Link href="/leaderboards/best-profile" className="ghost-btn pressable rounded-full px-4 py-1.5 text-xs ml-auto">
              {tr("See the board")}
            </Link>
          </div>
          <p className="text-xs text-muted mt-2">
            {a.webVotes.toLocaleString()} {tr("from the website")} · {a.discordVotes.toLocaleString()} {tr("from Discord")}
          </p>
        </div>
      )}

      <section>
        <h2 className="font-bold mb-3">{tr("Where you were seen")}</h2>
        {a.servers.length === 0 ? (
          <div className="glass p-6 text-sm text-muted">
            {tr("Nobody has shown your profile in a Discord server yet. Share your link — anyone can pull it up with /cluster show.")}
          </div>
        ) : (
          <div className="glass overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted">
                <tr className="text-left">
                  <th className="px-4 py-3">{tr("Server")}</th>
                  <th className="px-4 py-3">{tr("Views")}</th>
                  <th className="px-4 py-3">{tr("Votes")}</th>
                </tr>
              </thead>
              <tbody>
                {a.servers.map((s) => (
                  <tr key={s.guildId} className="border-t border-white/5">
                    <td className="px-4 py-3 font-bold">{s.name}</td>
                    <td className="px-4 py-3">{s.views.toLocaleString()}</td>
                    <td className="px-4 py-3 text-amber-300">{s.votes.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="glass p-6 mt-8">
        <h2 className="font-bold mb-2">{tr("Get seen more")}</h2>
        <p className="text-sm text-muted">
          {tr("Every 25 profile views earns Cluster Points on the Orbit quest, and so does every vote. Share your profile link, and add Cluster to a server so people can pull up your card without leaving Discord.")}
        </p>
        <div className="flex flex-wrap gap-3 mt-4">
          <Link href="/profile" className="glow-btn pressable rounded-full px-5 py-2 text-sm font-bold">
            {tr("Customize your profile")}
          </Link>
          <Link href="/discord-bot" className="ghost-btn pressable rounded-full px-5 py-2 text-sm">
            {tr("Add Cluster to a server")}
          </Link>
        </div>
      </div>
    </div>
  );
}
