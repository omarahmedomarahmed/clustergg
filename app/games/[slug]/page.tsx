// `/games/[slug]` — one game, and every challenge on it. 04 §1.
//
// The metrics table is read from `registry.ts`, which is the module that
// decides what can score. C1 — no page retypes what a metric is worth, and
// §4.3's rule that **no ratio, rate or percentage can score** is visible here
// because the registry is what enforces it.

import Link from "next/link";
import { notFound } from "next/navigation";
import { gameBySlug } from "../../../lib/site/queries.ts";
import { STATE_LABEL, type ChallengeState } from "../../../lib/challenges/lifecycle.ts";
import { Nav, Money, Empty } from "../../components.tsx";
import { Help } from "../../ui.tsx";

export const dynamic = "force-dynamic";

export default async function Game({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await gameBySlug(slug);
  if (!found) notFound();
  const { provider, live, challenges } = found;

  const scoreable = provider.capabilities.filter((c) => c.scoreable);

  return (
    <>
      <Nav />
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
        <div>
          <p className="text-4xl">{provider.glyph}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{provider.name}</h1>
          <p className="mt-2 text-sm text-mute" data-testid="game-live" data-live={live ? "1" : "0"}>
            {live
              ? "Live — challenges on this game can be entered and scored."
              : "Not live. We cannot read this game's stats yet, so it cannot be scored, " +
                "rank-gated or sold. Nothing about that is your fault or ours — it is an " +
                "access question with the publisher."}
          </p>
        </div>

        <section>
          <h2 className="text-xl font-medium">
            What scores
            <Help title="Counted, never rated">
              <p>
                Wins and matches, <strong>counted</strong>. No win rate, no percentages,
                no ratios. It rewards volume, deliberately: grinding is a legitimate way
                to win a week-long competition, and it is unfakeable.
              </p>
            </Help>
          </h2>
          {scoreable.length === 0 ? (
            <Empty>Nothing on this game scores yet.</Empty>
          ) : (
            <ul className="mt-2 flex flex-col gap-1 text-sm text-mute">
              {scoreable.map((c) => (
                <li key={c.key} data-metric={c.key}>
                  {c.label}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-xl font-medium">Challenges</h2>
          {challenges.length === 0 ? (
            <Empty>
              None yet. <Link href="/challenges" className="underline">See what is running</Link>.
            </Empty>
          ) : (
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {challenges.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-4 py-3"
                >
                  <Link href={`/challenges/${c.id}`}>{c.title}</Link>
                  <span className="text-mute">
                    <Money cents={c.prizePoolCents} /> ·{" "}
                    {STATE_LABEL[c.state as ChallengeState]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
