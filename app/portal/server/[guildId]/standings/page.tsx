// Standings — their three KPIs, their position, and what would move it.
//
// The last of those three is the one that matters. A position with no lever is
// a scoreboard, and a scoreboard is what the old model had: owners watched a
// number they could not influence and concluded it was arbitrary. The lever is
// picked by `ownerStanding`, not here, so the bot's standings card gives the
// same advice.
//
// K1 — none of these three measures Discord activity. Not commands, not card
// opens, not messages. Rewarding activity inside somebody else's product is a
// standing incentive to manufacture it.

import { getDb } from "../../../../../lib/db/index.ts";
import { ownerStanding } from "../../../../../lib/portal/owner.ts";
import { demoNow } from "../../../../../lib/site/clock.ts";
import { Panel, Figure, Empty } from "../../../components.tsx";

export const dynamic = "force-dynamic";

const LABEL = {
  entrants: "Exclusive entrants",
  conversion: "Conversion",
  activation: "Activation",
} as const;

export default async function OwnerStandings({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const db = await getDb();
  const standing = await ownerStanding(db, guildId, demoNow(await searchParams));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Standings</h1>

      {standing.droppedReason ? (
        // K7 — dropped is not last place, and the page must not draw it as one.
        // A server scored zero still occupies a position and takes money from
        // servers that did the work; a dropped server takes nothing and can
        // rejoin with one sentence.
        <div
          data-testid="dropped"
          className="rounded-xl border border-amber-900 bg-amber-950/40 px-5 py-4 text-sm text-amber-200"
        >
          <p className="font-medium">You are not in this week&apos;s run.</p>
          <p className="mt-1">{standing.droppedReason}</p>
          <p className="mt-2 text-xs">
            Not scored is not last place — you are out of the division entirely, and
            one sentence puts you back in.
          </p>
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2">
        <Figure
          label="Position"
          value={standing.position ? `${standing.position} of ${standing.of}` : "Not scored"}
          note="Across every server in this week's run"
          testId="position"
        />
        <Figure
          label="Score"
          value={standing.score.toFixed(1)}
          note="Weighted percentile across the three KPIs, 0–100"
        />
      </section>

      <Panel
        title="Your three KPIs"
        note="Ranked against the field, not measured absolutely — being twice as big is worth one position, not twice the score"
      >
        {standing.kpis.length === 0 ? (
          <Empty>Nothing to rank yet this week.</Empty>
        ) : (
          standing.kpis.map((k) => (
            <div key={k.key} className="border-b border-line py-3 last:border-0">
              <div className="flex items-center justify-between">
                <span>
                  {LABEL[k.key]}{" "}
                  <span className="text-xs text-mute">· weight {k.weight}</span>
                </span>
                <span className="tabular-nums text-sm">
                  {k.key === "entrants" ? k.value.toFixed(1) : `${(k.value * 100).toFixed(1)}%`}
                  <span className="ml-3 text-mute">rank {k.rank.toFixed(0)}</span>
                </span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-line">
                <div
                  className="h-1.5 rounded-full bg-accent"
                  style={{ width: `${Math.max(2, k.rank)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </Panel>

      {standing.lever ? (
        <Panel title="What would move it">
          <p data-testid="lever" className="text-sm">
            {standing.lever}
          </p>
          <p className="mt-3 text-xs text-mute">
            Winning a challenge earns your server nothing directly — entrants do.
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
