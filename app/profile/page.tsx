// `/profile` — the gamer's own dashboard. 04 §1, cycle phase **Run**.
//
// ===== THIS IS NOT `/u/[slug]` AND THE DIFFERENCE IS THE POINT =====
//
// `/u/[slug]` is the public profile: trophies and challenges, readable by
// anybody. This one is theirs. It carries the things nobody else may see —
// which linked accounts they hold, which of their trophies are worth money,
// and how far they are through a milestone.
//
// Two pages, two queries, on purpose. A single query with a `viewer` argument
// is how a private figure eventually reaches a public page: the check moves
// from *which query ran* to *which branch the template took*, and templates
// get edited by people fixing something else.
//
// T7/T13 — milestone progress is live, and shows what they are **missing**.
// Read from `progressFor`, the same function the bot's card reads, so the two
// surfaces cannot drift.

import Link from "next/link";
import { currentGamer } from "../../lib/auth/current.ts";
import { myDashboard } from "../../lib/site/queries.ts";
import { unlockState } from "../../lib/identity/unlock.ts";
import { progressOf } from "../../lib/identity/onboarding.ts";
import { getDb } from "../../lib/db/index.ts";
import { TROPHY_HOLD_YEARS } from "../../lib/money/amounts.ts";
import { milestoneProgress } from "../../lib/site/progress.ts";
import { STATE_LABEL, type ChallengeState } from "../../lib/challenges/lifecycle.ts";
import { Nav, Money, Empty } from "../components.tsx";
import { Panel, Progress, Help } from "../ui.tsx";

export const dynamic = "force-dynamic";

export default async function MyProfile() {
  const gamer = await currentGamer();
  if (!gamer) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
          <p className="mt-4 text-sm text-mute">
            <Link href="/login" className="underline">
              Sign in
            </Link>{" "}
            to see your challenges, your trophies and what you can cash out.
          </p>
        </main>
      </>
    );
  }

  const dashboard = await myDashboard(gamer.id);
  if (!dashboard) {
    // The session outlived the row. Not an error page — sign them out of the
    // idea rather than of the session, and let them start again.
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl px-6 py-16">
          <p className="text-sm text-mute">That account no longer exists.</p>
        </main>
      </>
    );
  }

  const { user, holdings, entries, accounts, milestones } = dashboard;
  const db = await getDb();
  const unlock = await unlockState(db, gamer.id);
  const progress = progressOf(unlock);

  const moneyCents = holdings
    .filter((h) => !h.holding.redeemedAt && h.trophy.valueCents > 0)
    .reduce((sum, h) => sum + h.trophy.valueCents, 0);

  return (
    <>
      <Nav />
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{user.displayName}</h1>
          <p className="mt-1 text-sm text-mute">
            Your dashboard.{" "}
            {user.slug ? (
              <Link href={`/u/${user.slug}`} className="underline">
                Your public profile
              </Link>
            ) : null}
          </p>
        </div>

        {/* H3 — onboarding is a gated thing, so it keeps its bar here too.
            Hidden once it is finished: a completed bar is furniture. */}
        {!unlock.unlocked ? (
          <Panel>
            <p className="text-sm">
              Finish onboarding to enter challenges.{" "}
              <Link href="/onboarding" className="underline">
                Pick up where you left off
              </Link>
              .
            </p>
            <div className="mt-3">
              <Progress progress={progress} testId="onboarding-progress" />
            </div>
          </Panel>
        ) : null}

        {/* A7/I1a — a gamer with no parent server is **not blocked**. They
            link, enter, win and redeem exactly like anybody else; the only
            difference is that no server earns from them. Said plainly, with
            the one instruction that changes it. */}
        {!user.parentGuildId ? (
          <Panel>
            <p className="text-sm" data-testid="no-parent">
              <strong>No parent server yet.</strong> Everything works without one — you
              can enter, score, win and cash out. It only means no server earns from
              you. Open Discord, go to a server that has Cluster, and use{" "}
              <code className="font-mono">/cluster</code>; that server becomes your
              parent.
            </p>
          </Panel>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-panel px-5 py-4">
            <p className="text-sm text-mute">
              Worth cashing out
              <Help title="Worth cashing out">
                <p>
                  Every trophy you hold that is worth money and has not been cashed out.
                  Trophies keep for <strong>{TROPHY_HOLD_YEARS} years</strong>, so there is no hurry —
                  and if you are under 18 they wait for you.
                </p>
              </Help>
            </p>
            <p className="text-2xl font-semibold">
              <Money cents={moneyCents} />
            </p>
            {moneyCents > 0 ? (
              <Link href="/redeem" className="text-sm underline">
                Cash out
              </Link>
            ) : null}
          </div>
          <div className="rounded-xl border border-line bg-panel px-5 py-4">
            <p className="text-sm text-mute">Trophies</p>
            <p className="text-2xl font-semibold tabular-nums">{holdings.length}</p>
          </div>
          <div className="rounded-xl border border-line bg-panel px-5 py-4">
            <p className="text-sm text-mute">Challenges entered</p>
            <p className="text-2xl font-semibold tabular-nums">{entries.length}</p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-medium">Your challenges</h2>
          {entries.length === 0 ? (
            <Empty>
              None yet. <Link href="/challenges" className="underline">Find one</Link>.
            </Empty>
          ) : (
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {entries.map(({ participant, challenge }) => (
                <li
                  key={participant.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-4 py-3"
                >
                  <Link href={`/challenges/${challenge.id}`}>{challenge.title}</Link>
                  <span className="text-mute">
                    {STATE_LABEL[challenge.state as ChallengeState]}
                    {participant.placement ? ` · #${participant.placement}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-xl font-medium">
            Trophies
            <Help title="Podium and participation">
              <p>
                A <strong>podium</strong> trophy is worth money and can be cashed out
                once you are 18. A <strong>participation</strong> trophy is a branded
                collectable — it was never worth money, and nothing is missing from it.
              </p>
            </Help>
          </h2>
          {holdings.length === 0 ? (
            <Empty>No trophies yet.</Empty>
          ) : (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {holdings.map(({ holding, trophy }) => (
                <li key={holding.id} className="rounded-lg border border-line px-4 py-3 text-sm">
                  <Link href={`/trophies/${trophy.id}`} className="font-medium">
                    {trophy.name}
                  </Link>
                  <p className="mt-1 text-mute">
                    {trophy.valueCents > 0 ? <Money cents={trophy.valueCents} /> : "Collectable"}
                    {holding.redeemedAt ? " · cashed out" : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* T7/T13 — live progress, and what they are missing. H3's bar on a
            gated thing; H4 is satisfied because every one of these counts
            challenges **they** entered. */}
        <section>
          <h2 className="text-xl font-medium">Milestones</h2>
          {milestones.length === 0 ? (
            <Empty>Enter a challenge and these start counting.</Empty>
          ) : (
            <ul className="mt-2 flex flex-col gap-4">
              {milestones.map((m) => (
                <li key={`${m.kind}:${m.game ?? ""}`} className="rounded-lg border border-line px-4 py-3">
                  <p className="text-sm">{m.missing}</p>
                  <div className="mt-2">
                    <Progress
                      progress={milestoneProgress(
                        m.have,
                        m.target,
                        m.game ? `challenges in ${m.game}` : "weeks in a row",
                      )}
                      testId={`milestone-${m.kind}`}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-xl font-medium">Linked game accounts</h2>
          {accounts.length === 0 ? (
            <Empty>
              None.{" "}
              <Link href="/settings/connections" className="underline">
                Link one
              </Link>
              .
            </Empty>
          ) : (
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {accounts.map((a) => (
                <li key={a.id} className="flex justify-between rounded-lg border border-line px-4 py-3">
                  <span>
                    {a.inGameName}{" "}
                    <span className="text-mute">· {a.provider}</span>
                  </span>
                  {/* C5 — never claim an account is "verified" unless ownership
                      was actually proven. `exists` is not proof, and G5 says an
                      unproven account carries no badge and no warning either. */}
                  <span className="text-mute">
                    {a.verifiedMethod && ["icon", "oauth", "openid", "admin"].includes(a.verifiedMethod)
                      ? "Ownership proven"
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm">
            <Link href="/settings" className="underline">
              Settings
            </Link>
          </p>
        </section>
      </main>
    </>
  );
}
