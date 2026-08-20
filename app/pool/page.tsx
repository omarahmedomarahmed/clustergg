import Link from "next/link";
import { livePool, weekFor, phaseAt } from "../../lib/site/queries.ts";
import { liveCopy } from "../../lib/content/store.ts";
import { SAYS } from "../../lib/content/copy.ts";
import { demoNow } from "../../lib/site/clock.ts";
import { Nav, Money, Empty } from "../components.tsx";
import { PoolRefresher } from "../countdown.tsx";

export const dynamic = "force-dynamic";

// `/pool` shows what each server WOULD be paid if the week ended now —
// computed by the same function that writes Friday's placements, never by a
// second implementation that could drift (docs/01-CYCLE.md).
export default async function PoolPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = demoNow(await searchParams);
  const pool = await livePool(now);
  const week = weekFor(now);
  // E7 — live on save, fenced onto the defaults. See `lib/content/store.ts`.
  const copy = await liveCopy();

  return (
    <>
      <Nav />
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">The weekly pool</h1>
          <p className="mt-2 max-w-2xl text-mute">{copy.poolIsPublic}</p>
          <p className="mt-2 text-sm text-mute">
            Week of {week.start.toISOString().slice(0, 10)} ·{" "}
            {phaseAt(now) === "run" ? "live, updating as members join" : "final"}
          </p>
        </div>

        <div className="flex items-baseline justify-between rounded-xl border border-line bg-panel px-5 py-4">
          <div>
            <p className="text-sm text-mute">Allocated to this week&rsquo;s pool</p>
            <p className="text-xs text-mute">
              A fifth is split evenly among every server that carried an entrant.
            </p>
          </div>
          <p className="text-3xl font-semibold"><Money cents={pool.poolCents} /></p>
        </div>

        {pool.shares.length === 0 ? (
          <Empty>No server has carried an entrant yet this week.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-mute">
              <tr className="border-b border-line">
                <th className="py-3 font-normal">Server</th>
                <th className="py-3 font-normal">Entrants</th>
                <th className="py-3 font-normal">Conversion</th>
                <th className="py-3 font-normal">Activation</th>
                <th className="py-3 text-right font-normal">Flat</th>
                <th className="py-3 text-right font-normal">Scored</th>
                <th className="py-3 text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {pool.shares.map((s) => (
                <tr key={s.guildId} className="border-b border-line last:border-0">
                  <td className="py-3">{s.name}</td>
                  <td className="py-3 tabular-nums">{s.entrants.toFixed(1)}</td>
                  <td className="py-3 tabular-nums">{(s.conversion * 100).toFixed(1)}%</td>
                  <td className="py-3 tabular-nums">{(s.activation * 100).toFixed(0)}%</td>
                  <td className="py-3 text-right tabular-nums text-mute"><Money cents={s.flatCents} /></td>
                  <td className="py-3 text-right tabular-nums text-mute"><Money cents={s.scoredCents} /></td>
                  <td className="py-3 text-right font-medium tabular-nums"><Money cents={s.totalCents} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* K7 — a server with no community profile is dropped, and told why. */}
        {pool.dropped.length > 0 ? (
          <div className="rounded-xl border border-line px-5 py-4 text-sm text-mute">
            <p className="font-medium text-white">Not scored this week</p>
            {pool.dropped.map((d) => (
              <p key={d.guildId} className="mt-1">{d.reason}</p>
            ))}
          </div>
        ) : null}

        <section className="border-t border-line pt-6">
          <p className="font-medium">{copy.discordTerms}</p>
          <p className="mt-2 text-sm text-mute">{SAYS.kpis()}</p>
          <p className="mt-4 text-sm text-mute">
            Fed by {pool.contributingChallengeIds.length} sponsored challenge
            {pool.contributingChallengeIds.length === 1 ? "" : "s"}.{" "}
            <Link href="/challenges" className="underline underline-offset-4">See them</Link>.
          </p>
        </section>
        {phaseAt(now) === "run" ? <PoolRefresher /> : null}
      </main>
    </>
  );
}
