// Brand overview — live challenges, entrants, reach.
//
// ===== NO TOTAL ROW. THAT IS NOT A DESIGN CHOICE =====
//
// §8: the same ten members on two challenges is 2 × 10 reach, and the same
// gamer entering week 1 and week 2 is two entrants. Summing either across
// challenges produces a "unique audience" figure that is not unique and was
// never measured. `brandReport` returns a row per challenge and no total for
// exactly that reason, and this page does not add them up either.

import Link from "next/link";
import { getDb } from "../../../../lib/db/index.ts";
import { brandReport } from "../../../../lib/portal/brand.ts";
import { Panel, Figure, Row, Empty } from "../../components.tsx";

export const dynamic = "force-dynamic";

export default async function BrandOverview({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const db = await getDb();
  const rows = await brandReport(db, brandId);
  const live = rows.slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>

      <section className="grid gap-3 sm:grid-cols-2">
        <Figure
          label="Challenges bought"
          value={String(rows.length)}
          help={
            <p>
              Each one is billed on its own — one game, one week, one prize pool.
              There is no package, no minimum and no capacity cap, so the number
              here is simply how many you have chosen to run.
            </p>
          }
          testId="challenge-count"
        />
        <Figure
          label="Best week"
          value={
            rows.length
              ? `${Math.max(...rows.map((r) => r.entrants)).toLocaleString("en-US")} entrants`
              : "—"
          }
          note="Your strongest single challenge"
        />
      </section>

      <Panel
        help={
          <p>
            A challenge that shows as <strong>awaiting setup</strong> is paid and
            waiting for a Cluster admin to set the metrics and assign the trophies.
            Nothing announces itself here — a person presses Announce, and there can
            never be an announced challenge that is unpaid.
          </p>
        }
        title="Your challenges"
        note="Per challenge. We never add reach or entrants together across challenges — the sum would not be a number of people"
        action={
          <Link href={`/portal/brand/${brandId}/reports`} className="text-sm text-mute hover:text-white">
            Reports →
          </Link>
        }
      >
        {live.length === 0 ? (
          <Empty>
            Nothing bought yet.{" "}
            <Link href={`/portal/brand/${brandId}/builder`} className="underline">
              Build your first challenge
            </Link>
            .
          </Empty>
        ) : (
          live.map((r) => (
            <Row key={r.challengeId}>
              <div>
                <p>{r.title}</p>
                <p className="text-xs text-mute">
                  {r.game} · week of {r.weekStart.toISOString().slice(0, 10)}
                </p>
              </div>
              <span className="text-sm tabular-nums">
                {r.entrants.toLocaleString("en-US")} entrants
                <span className="ml-3 text-mute">
                  {r.reach.toLocaleString("en-US")} reach
                </span>
              </span>
            </Row>
          ))
        )}
      </Panel>
    </div>
  );
}
