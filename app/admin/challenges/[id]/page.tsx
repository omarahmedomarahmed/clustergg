// The editor, in the order it must be done — docs/05-ADMIN.md §2.
//
//   1 game · 2 metrics · 3 queue · 4 rank gate · 5 places · 6 trophies ·
//   7 announce
//
// Step 7 is disabled until 1–6 are complete and the bill is paid, and it is
// disabled *by reading the same `readinessOf` the transition itself calls* —
// so the button and the guard can never disagree about whether it is ready.

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../../../lib/db/index.ts";
import { readinessOf, STATE_LABEL, type ChallengeState } from "../../../../lib/challenges/lifecycle.ts";
import { checkPrizePool } from "../../../../lib/trophies/trophies.ts";
import { scoreableMetrics, getProvider, QUEUES } from "../../../../lib/providers/registry.ts";
import { formatMoney } from "../../../../lib/money/amounts.ts";
import { Panel, Money, Empty, Blocking, Light } from "../../components.tsx";
import {
  saveSetupAction,
  addTrophyAction,
  removeTrophyAction,
  announceAction,
} from "../../actions.ts";

export const dynamic = "force-dynamic";

export default async function ChallengeEditor({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const db = await getDb();

  const [challenge] = await db
    .select()
    .from(schema.challenges)
    .where(eq(schema.challenges.id, id));
  if (!challenge) notFound();

  const readiness = await readinessOf(db, id);
  const guard = await checkPrizePool(db, id);
  const trophies = await db
    .select()
    .from(schema.trophies)
    .where(eq(schema.trophies.challengeId, id))
    .orderBy(schema.trophies.place);
  const provider = getProvider(challenge.provider);
  const metrics = scoreableMetrics(challenge.provider);
  const locked = challenge.state === "ended";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-mute">{challenge.game}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{challenge.title}</h1>
        <p className="mt-1 text-sm text-mute">
          {STATE_LABEL[challenge.state as ChallengeState]} · week of{" "}
          {challenge.startAt.toISOString().slice(0, 10)} · prize{" "}
          <Money cents={challenge.prizePoolCents} />
        </p>
      </div>

      {typeof error === "string" ? (
        <p
          data-testid="editor-error"
          className="rounded-xl border border-red-900 bg-red-950/40 px-5 py-4 text-sm text-red-200"
        >
          {error}
        </p>
      ) : null}

      <Panel title="What is blocking this">
        <Blocking items={readiness.blocking} />
      </Panel>

      <Panel title="1–5 · Game, metrics, queue, rank gate, places">
        <form action={saveSetupAction} className="flex flex-col gap-5">
          <input type="hidden" name="challengeId" value={id} />

          <div>
            <p className="text-sm font-medium">Game</p>
            <p className="mt-1 text-sm text-mute">
              {provider?.name ?? challenge.provider}
              {provider?.notLive ? ` — NOT LIVE: ${provider.notLive}` : " · live provider"}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium">Metrics, and their weights</p>
            <p className="mt-1 text-xs text-mute">
              Counts only. Percentages and ratios cannot score — a ratio&rsquo;s
              delta measures nothing.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {metrics.map((m) => (
                <label key={m.key} className="flex items-center justify-between gap-3 text-sm">
                  <span>{m.label}</span>
                  <input
                    type="number"
                    min={0}
                    name={`metric:${m.key}`}
                    defaultValue={challenge.metrics?.[m.key] ?? ""}
                    placeholder="0"
                    className="w-20 rounded-lg border border-line bg-ink px-2 py-1 text-right"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm">
              Queue
              <select
                name="queue"
                defaultValue={challenge.queue}
                className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2"
              >
                {QUEUES.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Places
              <input
                type="number"
                min={1}
                name="places"
                defaultValue={challenge.places}
                className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2"
              />
            </label>
          </div>

          <div>
            <p className="text-sm font-medium">Rank gate — optional, default off</p>
            <p className="mt-1 text-xs text-mute">
              A range, checked at join only. Never re-checked: they will rank up
              during the week, and that is the point.
            </p>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                Minimum
                <input
                  type="number"
                  name="rankMin"
                  defaultValue={challenge.rankMin ?? ""}
                  placeholder="no floor"
                  className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2"
                />
              </label>
              <label className="text-sm">
                Maximum
                <input
                  type="number"
                  name="rankMax"
                  defaultValue={challenge.rankMax ?? ""}
                  placeholder="no ceiling"
                  className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2"
                />
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={locked}
            className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Save setup
          </button>
        </form>
      </Panel>

      <Panel
        title="6 · Trophies"
        action={
          <span
            data-testid="pool-guard"
            className={`flex items-center gap-2 text-xs ${guard.ok ? "text-green-400" : "text-red-300"}`}
          >
            <Light ok={guard.ok} level="red" />
            {guard.message}
          </span>
        }
      >
        {trophies.length === 0 ? (
          <Empty>No trophies assigned. The prize pool has nothing to give away.</Empty>
        ) : (
          <div className="flex flex-col">
            {trophies.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between border-b border-line py-3 last:border-0"
              >
                <span className="text-sm">
                  {t.place ? `#${t.place} — ` : ""}
                  {t.name}
                </span>
                <span className="flex items-center gap-4 text-sm">
                  <span className="tabular-nums">
                    {t.valueCents > 0 ? formatMoney(t.valueCents) : "Collectable"}
                  </span>
                  {!locked ? (
                    <form action={removeTrophyAction}>
                      <input type="hidden" name="challengeId" value={id} />
                      <input type="hidden" name="trophyId" value={t.id} />
                      <button type="submit" className="text-xs text-mute hover:text-red-300">
                        Remove
                      </button>
                    </form>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        )}

        {!locked ? (
          <form action={addTrophyAction} className="mt-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="challengeId" value={id} />
            <label className="text-sm">
              Place
              <input
                type="number"
                min={1}
                name="place"
                defaultValue={trophies.length + 1}
                className="mt-1 block w-20 rounded-lg border border-line bg-ink px-2 py-1"
              />
            </label>
            <label className="text-sm">
              Name
              <input
                name="name"
                placeholder="Champion"
                className="mt-1 block rounded-lg border border-line bg-ink px-3 py-1"
              />
            </label>
            <label className="text-sm">
              Value ($)
              <input
                type="number"
                step="0.01"
                min={0}
                name="valueDollars"
                className="mt-1 block w-28 rounded-lg border border-line bg-ink px-2 py-1 text-right"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg border border-line px-3 py-2 text-sm hover:border-accent"
            >
              Add trophy
            </button>
          </form>
        ) : null}
      </Panel>

      <Panel title="7 · Announce">
        <p className="text-sm text-mute">
          Nothing announces itself. This is always a click, and it goes to every
          server the bot is installed in.
        </p>
        <form action={announceAction} className="mt-4">
          <input type="hidden" name="challengeId" value={id} />
          <button
            type="submit"
            data-testid="announce"
            disabled={!readiness.ready}
            className="rounded-lg bg-accent px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {challenge.state === "announced" || challenge.state === "live"
              ? "Re-announce"
              : "Announce"}
          </button>
          {!readiness.ready ? (
            <p className="mt-2 text-xs text-mute">
              Disabled until everything above is done and the bill is paid.
            </p>
          ) : null}
        </form>
      </Panel>
    </div>
  );
}
