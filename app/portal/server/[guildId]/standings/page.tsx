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
import { poolStatesFor } from "../../../../../lib/pool/eligibility.ts";
import { poolEligibilityProgress, unlockNote, poolStandingHeadline } from "../../../../../lib/site/progress.ts";
import { weekFor } from "../../../../../lib/challenges/week.ts";
import { Panel, Figure, Empty } from "../../../components.tsx";
import { Progress, Meter, Help } from "../../../../ui.tsx";

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
  const now = demoNow(await searchParams);
  const standing = await ownerStanding(db, guildId, now);
  // E2 — **two states, always.** Read from `poolStatesFor`, which is the one
  // place the gate is decided; this page says what it found and computes
  // nothing of its own.
  const states = await poolStatesFor(db, guildId, weekFor(now).start);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Standings</h1>

      {states ? (
        <Panel
          title="Where you stand with the pool"
          note="Eligibility is frozen at Monday's gun. Your three KPIs are live all week"
        >
          <p data-testid="pool-standing" className="text-sm">
            {poolStandingHeadline(states)}
            <Help title="In this week's pool, and on track for next week">
              <p>
                Two different questions. <strong>In this week&apos;s pool</strong> was
                decided when Monday&apos;s gun fired and is never re-checked — what the
                pool page showed on Wednesday is what pays on Friday.{" "}
                <strong>On track for next week</strong> is right now, so it moves the
                moment you fix something.
              </p>
            </Help>
          </p>

          {/* H3 — a bar on pool eligibility. H4 — and it counts the six profile
              fields, never the head count. 12 §5 puts the head count in the
              sentence beside it, which is what `unlockNote` is. */}
          <div className="mt-4">
            <Progress
              progress={poolEligibilityProgress(states.live)}
              note={unlockNote(states.live)}
              testId="eligibility-progress"
            />
          </div>

          {states.live.reason ? (
            <p className="mt-3 text-xs text-mute" data-testid="eligibility-reason">
              {states.live.reason}
            </p>
          ) : null}
        </Panel>
      ) : null}

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
              {/* A percentile position in a field, not progress. `Meter`, not
                  `Progress`, and the two are different components on purpose:
                  a rank drawn as progress reads as "you are 40% of the way to
                  finishing", which a rank does not mean. */}
              <div className="mt-2">
                <Meter percent={k.rank} label={`${LABEL[k.key]} rank`} />
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
