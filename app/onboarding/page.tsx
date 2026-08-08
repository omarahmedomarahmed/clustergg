import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, ne } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { providerInfoList } from "@/lib/providers/serialize";
import { resolveGameLogo, resolveGameCover } from "@/lib/game-logos";
import { getContent } from "@/lib/cms";
import LinkAccountForm from "@/components/LinkAccountForm";
import FollowButton from "@/components/FollowButton";
import Avatar from "@/components/Avatar";
import Icon from "@/components/Icon";
import DiscordTag from "@/components/DiscordTag";
import OAuthButtons from "@/components/OAuthButtons";
import { getT } from "@/lib/i18n/t-server";
import UnlockChecklist from "@/components/UnlockChecklist";
import { tryUnlock } from "@/lib/unlock";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await getDb();
  const [accounts, suggestions, games] = await Promise.all([
    db.select().from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.userId, user.id)),
    db.select().from(schema.users).where(ne(schema.users.id, user.id))
      .orderBy(desc(schema.users.createdAt)).limit(4),
    db.select({ name: schema.games.name, slug: schema.games.slug, logoUrl: schema.games.logoUrl, coverUrl: schema.games.coverUrl }).from(schema.games),
  ]);
  const hiddenConnect = (await getContent(["connect.hidden"]))["connect.hidden"]
    .split(",").map((s) => s.trim()).filter(Boolean);
  const providers = providerInfoList(hiddenConnect);
  const gameLogos: Record<string, string | null> = {};
  const gameCovers: Record<string, string | null> = {};
  for (const info of providers) { gameLogos[info.id] = resolveGameLogo(games, info.game); gameCovers[info.id] = resolveGameCover(games, info.game); }
  const linkedAccounts = accounts.map((a) => ({ provider: a.provider, name: a.inGameName }));
  const { tr } = await getT();
  // B83. `tryUnlock` reads the state, promotes anybody who has finished, and
  // returns what they DID — so landing here after linking an account both
  // unlocks and produces the congratulations.
  const unlock = await tryUnlock(db, user.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <div className="text-center mb-8 sm:mb-10">
        <div className="flex justify-center mb-4">
          <Avatar name={user.displayName} src={user.avatarUrl} size={72} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold">{tr("Welcome to the Cluster,")} <span className="grad-text">{user.displayName}</span></h1>
        <p className="text-muted mt-2">{tr("Your identity is set — now light up your constellation.")}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {user.discordUsername ? (
            <DiscordTag username={user.discordUsername} size="md" />
          ) : (
            <div className="w-full max-w-xs">
              <p className="text-xs text-muted mb-2">{tr("Link Discord to make it your universal identity:")}</p>
              <OAuthButtons next="/onboarding" intent="link" compact />
            </div>
          )}
        </div>
      </div>

      {/* B83. The balance first, because the number is the argument — a
          checklist on its own is a chore. */}
      {!unlock.unlocked && (
        <div className="mb-6"><UnlockChecklist state={unlock} /></div>
      )}

      {unlock.unlocked && unlock.achieved.length > 0 && (
        <section className="glass mb-6 border border-emerald-400/35 bg-emerald-500/[0.07] p-6">
          <div className="flex items-center gap-2 text-lg font-black text-emerald-200">
            <Icon name="check" size={18} /> Unlocked
          </div>
          {/* What they actually DID. "You completed onboarding" congratulates
              somebody for filling in a form. */}
          <ul className="mt-3 space-y-1.5 text-sm">
            {unlock.achieved.map((a) => (
              <li key={a} className="flex items-center gap-2 text-muted">
                <Icon name="check" size={13} className="text-emerald-300" /> {a}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Your points are yours to spend, and anything you win can be cashed out.
          </p>
          <Link href="/quests" className="glow-btn pressable mt-4 inline-block rounded-full px-6 py-2.5 text-sm font-semibold text-white">
            {tr("See today's mission")}
          </Link>
        </section>
      )}

      <section className="glass p-6 mb-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="glow-btn flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-white">1</span>
          <h2 className="text-lg font-bold">{tr("Link your game accounts")}</h2>
          {accounts.length > 0 && <span className="text-emerald-300 text-sm ml-auto">{accounts.length} {tr("linked")}</span>}
        </div>
        <p className="text-sm text-muted mb-4 ml-10">
          {tr("Green providers verify instantly against real APIs — try Chess.com, Lichess, Dota 2, Speedrun.com or Roblox.")}
        </p>
        <LinkAccountForm providers={providers} gameLogos={gameLogos} gameCovers={gameCovers} linked={linkedAccounts} next="/onboarding" />
      </section>

      <section className="glass p-6 mb-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="glow-btn flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-white">2</span>
          <h2 className="text-lg font-bold">{tr("Your public profile")}</h2>
        </div>
        <p className="text-sm text-muted ml-10">
          {tr("Your shareable link is ready:")}{" "}
          <Link href={`/u/${user.slug}`} className="text-cyan-300 hover:underline">clustergg.com/u/{user.slug}</Link>
          {" "}— {tr("customize it in")} <Link href="/profile" className="text-cyan-300 hover:underline">{tr("profile settings")}</Link>.
        </p>
      </section>

      <section className="glass p-6 mb-8">
        <div className="flex items-center gap-3 mb-4">
          <span className="glow-btn flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-white">3</span>
          <h2 className="text-lg font-bold">{tr("Follow some gamers")}</h2>
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
          {tr("Enter the Cluster")}
        </Link>
      </div>
    </div>
  );
}
