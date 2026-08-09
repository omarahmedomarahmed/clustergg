import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, ne } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { providerInfoList } from "@/lib/providers/serialize";
import { resolveGameLogo, resolveGameCover } from "@/lib/game-logos";
import { getContent } from "@/lib/cms";
import LinkAccountForm from "@/components/LinkAccountForm";
import Avatar from "@/components/Avatar";
import Icon from "@/components/Icon";
import DiscordTag from "@/components/DiscordTag";
import OAuthButtons from "@/components/OAuthButtons";
import { tryUnlock } from "@/lib/unlock";
import EmailStep from "@/components/onboarding/EmailStep";
import ProfileStep from "@/components/onboarding/ProfileStep";
import { getCountries } from "@/lib/countries-server";
import { pendingCodeEmail, maskEmail } from "@/lib/email-verify";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up your account · Cluster" };

// Where a gamer becomes able to earn. B93.
//
// ===== IT IS ONE PAGE, AND EVERYTHING HAPPENS ON IT =====
//
// Three steps: link a game account, confirm an email, answer two questions.
// None of them sends anybody anywhere else — the code is typed here, the
// choices are made here, and the page updates under them. A signup that hands
// somebody off to settings loses the ones who close the tab.
//
// ===== IT LEADS WITH WHAT THEY GET, NOT WITH A NUMBER =====
//
// This used to open on a held CP balance, because a number beats a checklist.
// B94 stopped crediting anything before the steps are done, so that number is
// zero for everybody arriving today and leading with it would be leading with
// nothing. What it leads with instead is what earning IS — and, for an account
// that predates the lock and carries a real balance, that the balance is safe.

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await getDb();

  const [accounts, games] = await Promise.all([
    db.select().from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.userId, user.id)),
    db.select({
      name: schema.games.name, slug: schema.games.slug,
      logoUrl: schema.games.logoUrl, coverUrl: schema.games.coverUrl,
    }).from(schema.games),
  ]);

  const hiddenConnect = (await getContent(["connect.hidden"]))["connect.hidden"]
    .split(",").map((s) => s.trim()).filter(Boolean);
  const providers = providerInfoList(hiddenConnect);
  const gameLogos: Record<string, string | null> = {};
  const gameCovers: Record<string, string | null> = {};
  for (const info of providers) {
    gameLogos[info.id] = resolveGameLogo(games, info.game);
    gameCovers[info.id] = resolveGameCover(games, info.game);
  }

  // `tryUnlock` reads the state, promotes anybody who has finished, and returns
  // what they DID — so landing here after the last step both unlocks and
  // produces the congratulations.
  const unlock = await tryUnlock(db, user.id);
  const [countries, sentTo] = await Promise.all([
    getCountries(),
    pendingCodeEmail(db, user.id),
  ]);

  const step = (key: string) => unlock.steps.find((s) => s.key === key);
  const done = unlock.unlocked ? 3 : unlock.steps.filter((s) => s.done).length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      {/* ===== The hero: who they are, and what is waiting ===== */}
      <div className="relative overflow-hidden rounded-3xl border border-violet-400/25 bg-gradient-to-br from-violet-500/[0.14] via-transparent to-cyan-500/[0.10] p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={user.displayName} src={user.avatarUrl} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold sm:text-3xl">
              Welcome, <span className="grad-text">{user.displayName}</span>
            </h1>
            <p className="mt-1 text-sm text-muted">
              {unlock.unlocked
                ? "Everything is on. Go and win something."
                : "Three things and your earning switches on. It takes about a minute."}
            </p>
            {user.discordUsername && (
              <div className="mt-2"><DiscordTag username={user.discordUsername} size="md" /></div>
            )}
          </div>

          {!unlock.unlocked && (
            <div className="rounded-2xl border border-amber-400/35 bg-amber-500/10 px-5 py-3 text-center">
              <div className="text-[10px] uppercase tracking-widest text-amber-200/80">Locked until you finish</div>
              <div className="mt-0.5 text-sm font-bold text-amber-100">
                Challenges · Missions · Points
              </div>
            </div>
          )}
        </div>

        {!unlock.unlocked && (
          <>
            <div className="mt-6 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/40">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-300 transition-all"
                  style={{ width: `${(done / 3) * 100}%` }}
                />
              </div>
              <span className="shrink-0 text-xs font-bold tabular-nums">{done} of 3</span>
            </div>
            {/* What they get, in the same breath as what they must do. */}
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {[
                ["diamond", "Points for playing", "Missions and quests pay CP for the games you already play."],
                ["trophy", "Real prize money", "Brands fund the challenges. What you win is yours to keep or cash."],
                ["chart", "Every game, one profile", "Your stats, your rank and your trophies in one place."],
              ].map(([icon, title, body]) => (
                <div key={title} className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <Icon name={icon} size={14} className="text-cyan-300" />
                  <div className="mt-1.5 text-xs font-bold">{title}</div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-muted">{body}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {unlock.unlocked && unlock.achieved.length > 0 && (
        <section className="glass mt-6 border border-emerald-400/35 bg-emerald-500/[0.07] p-6">
          <div className="flex items-center gap-2 text-lg font-black text-emerald-200">
            <Icon name="check" size={18} /> Unlocked
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {unlock.achieved.map((a) => (
              <li key={a} className="flex items-center gap-2 text-muted">
                <Icon name="check" size={13} className="text-emerald-300" /> {a}
              </li>
            ))}
          </ul>
          <Link href="/quests" className="glow-btn pressable mt-4 inline-block rounded-full px-6 py-2.5 text-sm font-semibold text-white">
            See today&apos;s mission
          </Link>
        </section>
      )}

      {/* ===== Step 1 — link a game account ===== */}
      <Step
        n={1}
        title="Link a game account"
        why="It is what lets you enter a challenge at all — there is nothing to score without it."
        done={!!step("link")?.done}
        badge={accounts.length ? `${accounts.length} linked` : undefined}
      >
        <LinkAccountForm
          providers={providers}
          gameLogos={gameLogos}
          gameCovers={gameCovers}
          linked={accounts.map((a) => ({ provider: a.provider, name: a.inGameName }))}
          next="/onboarding"
        />
      </Step>

      {/* ===== Step 2 — confirm the email ===== */}
      <Step
        n={2}
        title="Confirm your email"
        why="It is what switches your earning on. It is also what stops one person making five hundred accounts and taking prize money that belongs to real gamers."
        done={!!step("email")?.done}
      >
        {!user.email && !user.discordUsername && (
          <p className="mb-3 text-xs text-muted">
            We do not have an address for you yet — add one and we will send a code straight away.
          </p>
        )}
        <EmailStep
          email={user.email ?? null}
          masked={maskEmail(sentTo ?? user.email)}
          done={!!step("email")?.done}
          alreadySent={!!sentTo}
        />
      </Step>

      {/* ===== Step 3 — the two answers ===== */}
      <Step
        n={3}
        title="Your age, your country and your colours"
        why="The first two decide how prize money reaches you — read what each choice means before you confirm, because your age is answered once. The third is just what your card looks like."
        done={!!step("profile")?.done}
      >
        <ProfileStep
          countries={countries}
          band={(user as { ageBand?: string | null }).ageBand ?? null}
          country={user.country ?? null}
          theme={(user.theme as { template?: string } | null)?.template ?? null}
          done={!!step("profile")?.done}
          name={user.displayName}
          avatarUrl={user.avatarUrl ?? null}
        />
      </Step>

      {!user.discordUsername && (
        <div className="glass mt-6 p-5">
          <div className="text-sm font-bold">Link Discord</div>
          <p className="mt-1 text-xs text-muted">
            Optional, and it makes your Cluster account work inside every server you are in.
          </p>
          <div className="mt-3"><OAuthButtons next="/onboarding" intent="link" compact /></div>
        </div>
      )}

      <p className="mt-8 text-center text-xs leading-relaxed text-muted">
        Everything you have already done is kept. Nothing starts counting until you finish —{" "}
        <Link href="/rules/gamer" className="text-cyan-300 hover:underline">every rule, and why it exists</Link>.
      </p>
    </div>
  );
}

function Step({ n, title, why, done, badge, children }: {
  n: number; title: string; why: string; done: boolean; badge?: string; children: React.ReactNode;
}) {
  return (
    <section className={`glass mt-5 p-6 ${done ? "border border-emerald-400/25" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-black ${
          done ? "bg-emerald-500/25 text-emerald-200" : "glow-btn text-white"
        }`}>
          {done ? <Icon name="check" size={15} /> : n}
        </span>
        <h2 className={`text-lg font-bold ${done ? "text-muted line-through" : ""}`}>{title}</h2>
        {badge && <span className="text-xs text-emerald-300">{badge}</span>}
      </div>
      {/* The reason, always, and never smaller than the instruction it explains. */}
      <p className="ml-11 mt-1.5 text-sm leading-relaxed text-muted">{why}</p>
      <div className="ml-0 mt-4 sm:ml-11">{children}</div>
    </section>
  );
}
