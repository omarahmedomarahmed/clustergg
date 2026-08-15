import { notFound } from "next/navigation";
import { challengeDetail } from "../../../lib/site/queries.ts";
import { Nav, Money, Empty } from "../../components.tsx";
import { STATE_LABEL, type ChallengeState } from "../../../lib/challenges/lifecycle.ts";

export const dynamic = "force-dynamic";

export default async function ChallengePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await challengeDetail(id);
  if (!detail) notFound();
  const { challenge, standings, trophies, reachCount } = detail;

  return (
    <>
      <Nav />
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        <div>
          <p className="text-sm text-mute">{challenge.game}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{challenge.title}</h1>
          <p className="mt-2 text-sm text-mute">
            {STATE_LABEL[challenge.state as ChallengeState]} ·{" "}
            {challenge.startAt.toISOString().slice(0, 10)} to{" "}
            {challenge.endAt.toISOString().slice(0, 10)}
          </p>
          {challenge.visibility === "community" ? (
            <p className="mt-2 text-sm">A community challenge run by this server.</p>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-panel px-5 py-4">
            <p className="text-sm text-mute">Prize pool</p>
            <p className="text-2xl font-semibold"><Money cents={challenge.prizePoolCents} /></p>
          </div>
          <div className="rounded-xl border border-line bg-panel px-5 py-4">
            <p className="text-sm text-mute">Entrants</p>
            <p className="text-2xl font-semibold tabular-nums">{standings.length}</p>
          </div>
          <div className="rounded-xl border border-line bg-panel px-5 py-4">
            <p className="text-sm text-mute">Reach</p>
            <p className="text-2xl font-semibold tabular-nums">{reachCount.toLocaleString("en-US")}</p>
          </div>
        </div>

        {/* Scoring, stated. No win rate, no percentages, no ratios. */}
        <section>
          <h2 className="text-xl font-medium">How it scores</h2>
          <ul className="mt-2 text-sm text-mute">
            {Object.entries(challenge.metrics ?? {}).map(([metric, weight]) => (
              <li key={metric}>
                {metric} × {weight}
              </li>
            ))}
          </ul>
          {challenge.rankMin !== null || challenge.rankMax !== null ? (
            <p className="mt-2 text-sm">
              Rank gate: {challenge.rankMin ?? "any"} to {challenge.rankMax ?? "any"},{" "}
              {challenge.queue} queue. Checked when you join, never again.
            </p>
          ) : (
            <p className="mt-2 text-sm text-mute">Open to everyone — no rank gate.</p>
          )}
        </section>

        <section>
          <h2 className="text-xl font-medium">Trophies</h2>
          {trophies.length === 0 ? (
            <Empty>Trophies are assigned after payment clears.</Empty>
          ) : (
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {trophies.map((t) => (
                <li key={t.id} className="flex justify-between rounded-lg border border-line px-4 py-3">
                  <span>{t.place ? `#${t.place} — ` : ""}{t.name}</span>
                  <span className="tabular-nums">
                    {t.valueCents > 0 ? <Money cents={t.valueCents} /> : "Collectable"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-xl font-medium">Standings</h2>
          {standings.length === 0 ? (
            <Empty>Nobody has entered yet.</Empty>
          ) : (
            <table className="mt-2 w-full text-sm">
              <thead className="text-left text-mute">
                <tr className="border-b border-line">
                  <th className="py-2 font-normal">#</th>
                  <th className="py-2 font-normal">Points</th>
                  <th className="py-2 font-normal">Wins</th>
                  {/* S4 — matches played is always counted and always shown. */}
                  <th className="py-2 font-normal">Matches</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s) => (
                  <tr key={s.participant.id} className="border-b border-line last:border-0">
                    <td className="py-2 tabular-nums">{s.place}</td>
                    <td className="py-2 tabular-nums">{s.points}</td>
                    <td className="py-2 tabular-nums">{s.deltas.wins ?? 0}</td>
                    <td className="py-2 tabular-nums">{s.deltas.matches ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </>
  );
}
