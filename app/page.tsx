// The homepage — challenge-first, and the pool as prominent as the challenges.
//
// docs/00-TRUTH.md §10 and docs/04-SURFACES.md §1. Four blocks, and what each
// shows depends on the phase of the cycle:
//
//   Hero       run: live challenges + a big countdown to Friday
//              grace: the week ended, winners, next week's challenges
//   Pool       run: live, every server, its KPIs, and the ACTUAL DOLLARS it
//              has earned so far. grace: final standings
//   Community  run: not at the top. grace: promoted
//   Always     the three KPIs, and a bold line that we reward outcomes
//
// Every figure comes from a module. There is not a price, a share or a
// threshold typed into this file — content rule C1, guarded by
// `tests/band1/03-copy.test.ts`.

import Link from "next/link";
import {
  liveChallenges,
  nextWeekChallenges,
  endedChallenges,
  communityChallenges,
  livePool,
  weekFor,
  phaseAt,
} from "../lib/site/queries.ts";
import { liveCopy } from "../lib/content/store.ts";
import { pageArtFor } from "../lib/site/page-art.ts";
import { getDb } from "../lib/db/index.ts";
import { SAYS } from "../lib/content/copy.ts";
import { demoNow } from "../lib/site/clock.ts";
import { Nav, Card, Money, Empty, PageArtLayer } from "./components.tsx";
import { Countdown, PoolRefresher } from "./countdown.tsx";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // `?at=` moves the clock in demo mode only, so the screenshot record can
  // photograph both phases whatever day it runs on. See lib/site/clock.ts.
  const now = demoNow(await searchParams);
  const phase = phaseAt(now);
  const week = weekFor(now);
  // E7 — live on save. The words come from the store, which falls back to the
  // code-side defaults when it is unreachable: the failure mode of a content
  // store is a site with the wrong words, and the failure mode of an unfenced
  // one is no site.
  const copy = await liveCopy();
  // E13 — always optional. With none set this renders nothing at all, which is
  // what makes "every page must look finished with none" a property rather
  // than an aspiration.
  const art = await pageArtFor(await getDb(), "home");

  const [live, next, ended, community, pool] = await Promise.all([
    liveChallenges(now),
    nextWeekChallenges(now),
    endedChallenges(6),
    communityChallenges(now),
    livePool(now),
  ]);

  return (
    <>
      <PageArtLayer art={art} />
      <Nav />
      <main className="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-12" data-phase={phase}>
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold tracking-tight">{copy.tagline}</h1>
          <p className="max-w-2xl text-mute">{copy.noMachinery}</p>

          {phase === "run" ? (
            <div className="rounded-xl border border-line bg-panel px-5 py-4">
              <p className="text-sm text-mute">This week closes in</p>
              <p className="text-3xl font-semibold">
                <Countdown toISO={week.end.toISOString()} />
              </p>
            </div>
          ) : (
            <p className="rounded-xl border border-line bg-panel px-5 py-4">
              {copy.gracePeriod}
            </p>
          )}
        </section>

        {/* ── Live challenges ──────────────────────────────────────────── */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-medium">
            {phase === "run" ? "Live this week" : "Next week"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(phase === "run" ? live : next).map((c) => (
              <Card key={c.id} href={`/challenges/${c.id}`}>
                <p className="font-medium">{c.title}</p>
                <p className="mt-1 text-sm text-mute">{c.game}</p>
                <p className="mt-3 text-sm">
                  Prize pool <Money cents={c.prizePoolCents} />
                </p>
              </Card>
            ))}
          </div>
          {(phase === "run" ? live : next).length === 0 ? (
            <Empty>
              Nothing is announced yet. Challenges are announced by hand, never
              automatically — one will appear here before it starts.
            </Empty>
          ) : null}
        </section>

        {/* ── The pool. As prominent as the challenges, and live. ──────── */}
        <section className="flex flex-col gap-4" data-block="pool">
          <div>
            <h2 className="text-xl font-medium">
              This week&rsquo;s pool
              {phase === "grace" ? " — final" : ", live"}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-mute">{copy.poolIsPublic}</p>
          </div>

          <div className="rounded-xl border border-line bg-panel">
            <div className="flex items-baseline justify-between border-b border-line px-5 py-4">
              <span className="text-sm text-mute">Allocated this week</span>
              <span className="text-2xl font-semibold">
                <Money cents={pool.poolCents} />
              </span>
            </div>

            {pool.shares.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-mute">
                No server has carried an entrant yet this week.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-mute">
                  <tr className="border-b border-line">
                    <th className="px-5 py-3 font-normal">Server</th>
                    <th className="px-5 py-3 font-normal">Entrants</th>
                    <th className="px-5 py-3 font-normal">Conversion</th>
                    <th className="px-5 py-3 font-normal">Activation</th>
                    <th className="px-5 py-3 text-right font-normal">Earned so far</th>
                  </tr>
                </thead>
                <tbody>
                  {pool.shares.map((s) => (
                    <tr key={s.guildId} className="border-b border-line last:border-0">
                      <td className="px-5 py-3">{s.name}</td>
                      <td className="px-5 py-3 tabular-nums">{s.entrants.toFixed(1)}</td>
                      <td className="px-5 py-3 tabular-nums">
                        {(s.conversion * 100).toFixed(1)}%
                      </td>
                      <td className="px-5 py-3 tabular-nums">
                        {(s.activation * 100).toFixed(0)}%
                      </td>
                      <td className="px-5 py-3 text-right font-medium tabular-nums">
                        <Money cents={s.totalCents} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* M12 — the page names exactly which challenges fed this pool. */}
          {pool.contributingChallengeIds.length > 0 ? (
            <p className="text-sm text-mute">
              Fed by {pool.contributingChallengeIds.length} sponsored challenge
              {pool.contributingChallengeIds.length === 1 ? "" : "s"} this week.{" "}
              <Link href="/pool" className="underline underline-offset-4">
                See the full breakdown
              </Link>
              .
            </p>
          ) : null}
          {phase === "run" ? <PoolRefresher /> : null}
        </section>

        {/* ── Community: not at the top during the week, promoted in the
             grace period. ─────────────────────────────────────────────── */}
        {phase === "grace" && community.length > 0 ? (
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-medium">Community challenges</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {community.map((c) => (
                <Card key={c.id} href={`/challenges/${c.id}`}>
                  <p className="font-medium">{c.title}</p>
                  <p className="mt-1 text-sm text-mute">
                    A community challenge run by this server
                  </p>
                </Card>
              ))}
            </div>
          </section>
        ) : null}

        {phase === "grace" && ended.length > 0 ? (
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-medium">Last week&rsquo;s winners</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {ended.map((c) => (
                <Card key={c.id} href={`/challenges/${c.id}`}>
                  <p className="font-medium">{c.title}</p>
                  <p className="mt-1 text-sm text-mute">{c.game} · closed</p>
                </Card>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── Always ───────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3 border-t border-line pt-8">
          <p className="max-w-2xl font-medium">{copy.discordTerms}</p>
          <p className="max-w-2xl text-sm text-mute">{SAYS.kpis()}</p>
          <p className="max-w-2xl text-sm text-mute">{SAYS.unitPrice()}</p>
        </section>
      </main>
    </>
  );
}
