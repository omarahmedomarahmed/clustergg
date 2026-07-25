import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/t-server";
import { bestProfiles } from "@/lib/identity";
import Avatar from "@/components/Avatar";
import Icon from "@/components/Icon";
import AdSlot from "@/components/AdSlot";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Best Profile",
  description: "The most-voted gamer profiles on Cluster.",
};

// Not a game leaderboard. This ranks people on how good their profile is —
// which is the one board anyone can top without being the best player.
export default async function BestProfilePage() {
  const user = await getCurrentUser();
  const { tr } = await getT(user?.locale);
  const rows = await bestProfiles(25);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="flex items-center gap-3 mb-2">
        <Icon name="star" size={26} className="text-amber-300" />
        <h1 className="text-3xl font-bold">{tr("Best")} <span className="grad-text">{tr("Profile")}</span></h1>
      </div>
      <p className="text-muted max-w-xl mb-8">
        {tr("The most-voted profiles on Cluster. Not a game leaderboard — this is the one board anyone can top, whatever they play. Vote from any profile, or from Discord.")}
      </p>

      <AdSlot placement="leaderboard_top_banner" className="mb-8" />

      {rows.length === 0 ? (
        <div className="glass p-8 text-center">
          <p className="text-muted">{tr("No votes yet. Be the first to back a profile.")}</p>
          <Link href="/search" className="ghost-btn pressable rounded-full px-5 py-2 text-sm inline-block mt-4">
            {tr("Find gamers")}
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Link
              key={r.userId}
              href={`/u/${r.slug}`}
              className="glass glass-hover flex items-center gap-4 p-4"
            >
              <div
                className="w-10 text-lg font-bold shrink-0"
                style={{ color: ["#fbbf24", "#cbd5e1", "#b45309"][r.rank - 1] ?? undefined }}
              >
                #{r.rank}
              </div>
              <Avatar name={r.displayName} src={r.avatarUrl} size={44} />
              <div className="min-w-0 flex-1">
                <div className="font-bold truncate">{r.displayName}</div>
                <div className="text-xs text-muted truncate">@{r.slug}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold text-amber-300">{r.votes.toLocaleString()}</div>
                <div className="text-[11px] text-muted">{tr("votes")}</div>
              </div>
              <div className="text-right shrink-0 hidden sm:block">
                <div className="font-bold">{r.views.toLocaleString()}</div>
                <div className="text-[11px] text-muted">{tr("views")}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="glass p-6 mt-8">
        <h2 className="font-bold mb-2">{tr("How to climb it")}</h2>
        <p className="text-sm text-muted">
          {tr("Customize your profile until it's unmistakably yours, then share it. Every signed-in gamer can vote once, and so can anyone in a Discord server where Cluster is installed. Votes earn you Cluster Points on the Orbit quest.")}
        </p>
        <Link href="/profile" className="grad-btn pressable rounded-full px-5 py-2 text-sm font-bold inline-block mt-4">
          {tr("Customize your profile")}
        </Link>
      </div>
    </div>
  );
}
