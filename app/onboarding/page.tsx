import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, ne } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { providerInfoList } from "@/lib/providers/serialize";
import LinkAccountForm from "@/components/LinkAccountForm";
import FollowButton from "@/components/FollowButton";
import Avatar from "@/components/Avatar";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await getDb();
  const [accounts, suggestions] = await Promise.all([
    db.select().from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.userId, user.id)),
    db.select().from(schema.users).where(ne(schema.users.id, user.id))
      .orderBy(desc(schema.users.createdAt)).limit(4),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold">Welcome to the Cluster, <span className="grad-text">{user.displayName}</span></h1>
        <p className="text-muted mt-2">Three steps to light up your constellation.</p>
      </div>

      <section className="glass p-6 mb-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="glow-btn flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-white">1</span>
          <h2 className="text-lg font-bold">Link your game accounts</h2>
          {accounts.length > 0 && <span className="text-emerald-300 text-sm ml-auto">{accounts.length} linked</span>}
        </div>
        <p className="text-sm text-muted mb-4 ml-10">
          Green providers verify instantly against real APIs — try Chess.com, Lichess, Dota 2, Speedrun.com or Roblox.
        </p>
        <LinkAccountForm providers={providerInfoList()} />
      </section>

      <section className="glass p-6 mb-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="glow-btn flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-white">2</span>
          <h2 className="text-lg font-bold">Your public profile</h2>
        </div>
        <p className="text-sm text-muted ml-10">
          Your shareable link is ready:{" "}
          <Link href={`/u/${user.slug}`} className="text-cyan-300 hover:underline">clustergg.com/u/{user.slug}</Link>
          {" "}— customize it in <Link href="/profile" className="text-cyan-300 hover:underline">profile settings</Link>.
        </p>
      </section>

      <section className="glass p-6 mb-8">
        <div className="flex items-center gap-3 mb-4">
          <span className="glow-btn flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-white">3</span>
          <h2 className="text-lg font-bold">Follow some gamers</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {suggestions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 border border-violet-400/15 rounded-xl p-3">
              <Avatar name={s.displayName} src={s.avatarUrl} size={40} />
              <div className="min-w-0 flex-1">
                <Link href={`/u/${s.slug}`} className="font-semibold hover:text-cyan-300 truncate block">{s.displayName}</Link>
                <div className="text-xs text-muted truncate">{s.bio ?? `@${s.slug}`}</div>
              </div>
              <FollowButton targetUserId={s.id} isFollowing={false} path="/onboarding" />
            </div>
          ))}
        </div>
      </section>

      <div className="text-center">
        <Link href="/feed" className="glow-btn pressable rounded-full px-10 py-3 font-semibold text-white">
          Enter the Cluster
        </Link>
      </div>
    </div>
  );
}
