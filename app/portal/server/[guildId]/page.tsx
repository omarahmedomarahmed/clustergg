// Owner overview — vault balance, this week's pool share, live earnings.
//
// The number that matters is `thisWeekCents`: what this server would be paid
// if the week ended now, computed by the same function that writes Friday's
// placements. An owner watching their number climb all week and receiving a
// different one on Saturday would be the end of the only thing that makes this
// model work, so the page does no arithmetic at all.

import Link from "next/link";
import { getDb } from "../../../../lib/db/index.ts";
import { ownerOverview } from "../../../../lib/portal/owner.ts";
import { formatMoney } from "../../../../lib/money/amounts.ts";
import { demoNow } from "../../../../lib/site/clock.ts";
import { Panel, Figure, Row, Empty } from "../../components.tsx";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OwnerOverview({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const now = demoNow(await searchParams);
  const db = await getDb();
  const overview = await ownerOverview(db, guildId, now);
  if (!overview) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>

      <section className="grid gap-3 sm:grid-cols-3">
        <Figure
          label="This week, so far"
          value={formatMoney(overview.thisWeekCents)}
          note="What you would be paid if the week ended now"
          testId="this-week"
        />
        <Figure
          label="Available"
          value={formatMoney(overview.availableCents)}
          note="Released and not yet withdrawn"
          testId="available"
        />
        <Figure
          label="Earned, ever"
          value={formatMoney(overview.lifetimeEarnedCents)}
          note="Every payout released to this server"
        />
      </section>

      {overview.notScoredReason ? (
        // K7 — a server with no community profile is DROPPED from the run, not
        // scored zero, and the difference is money. Said here, to the person
        // who can fix it, with the link that fixes it.
        <div
          data-testid="not-scored"
          className="rounded-xl border border-amber-900 bg-amber-950/40 px-5 py-4 text-sm text-amber-200"
        >
          {overview.notScoredReason}{" "}
          <Link href={`/portal/server/${guildId}/settings`} className="underline">
            Describe your community
          </Link>
          .
        </div>
      ) : null}

      <Panel
        title="This week's challenges"
        note="Every challenge feeding this week's pool"
        action={
          <Link
            href={`/portal/server/${guildId}/challenges`}
            className="text-sm text-mute hover:text-white"
          >
            Re-announce →
          </Link>
        }
      >
        {overview.thisWeekChallenges.length === 0 ? (
          <Empty>Nothing is running in your server this week.</Empty>
        ) : (
          overview.thisWeekChallenges.map((c) => (
            <Row key={c.id}>
              <span>{c.title}</span>
              <span className="text-sm text-mute">{c.game}</span>
            </Row>
          ))
        )}
      </Panel>

      {overview.kpis ? (
        <Panel title="Your three KPIs" note="What the weekly pool is divided by">
          <Row>
            <span>Entrants</span>
            <span className="tabular-nums">{overview.kpis.entrants.toFixed(1)}</span>
          </Row>
          <Row>
            <span>Conversion</span>
            <span className="tabular-nums">{(overview.kpis.conversion * 100).toFixed(1)}%</span>
          </Row>
          <Row>
            <span>Activation</span>
            <span className="tabular-nums">{(overview.kpis.activation * 100).toFixed(1)}%</span>
          </Row>
        </Panel>
      ) : null}
    </div>
  );
}
