// `/games` — the catalogue. 04 §1, cycle phase **Prepare**.
//
// ===== A GAME WITH NO KEY IS NOT OFFERED, AND THAT IS DELIBERATE =====
//
// 10 §1: *"A provider with no key is simply not offered. That is deliberate:
// the game picker only shows games that can actually be played today."*
//
// So this page renders every provider and says plainly which are live. It does
// not filter the dead ones out of existence — a gamer who plays VALORANT
// deserves to know why they cannot enter one rather than to find the game
// missing and conclude we never heard of it. `isProviderLive` decides; the
// page reports.
//
// O4 — whether a game requires ownership proof is a per-game flag, **visible
// to admin and to brands.** Public here too, because a gamer about to link an
// account should know whether they will be asked to prove it.

import Link from "next/link";
import { gamesWithChallenges } from "../../lib/site/queries.ts";
import { Nav, Empty } from "../components.tsx";
import { Help } from "../ui.tsx";

export const dynamic = "force-dynamic";

export default async function Games() {
  const games = await gamesWithChallenges();
  const live = games.filter((g) => g.live);
  const notLive = games.filter((g) => !g.live);

  return (
    <>
      <Nav />
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Games</h1>
          <p className="mt-2 text-sm text-mute">
            You play the game you were already going to play. Stats come from the
            publisher&apos;s own API, so scores are not reported or claimed — they are
            read.
            <Help title="Why some games are not live">
              <p>
                Every game here needs the publisher&apos;s API to be readable by us. Where
                we do not have that access yet, the game cannot be scored, rank-gated or
                health-checked, so it cannot be sold or entered. It is listed anyway,
                because the honest answer is better than a missing entry.
              </p>
            </Help>
          </p>
        </div>

        <section>
          <h2 className="text-xl font-medium">Live now</h2>
          {live.length === 0 ? (
            <Empty>No games are live on this deployment.</Empty>
          ) : (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {live.map(({ provider, challenges }) => (
                <li key={provider.id}>
                  <Link
                    href={`/games/${provider.id}`}
                    className="block rounded-xl border border-line bg-panel p-5 transition hover:border-accent"
                    data-testid="game-card"
                    data-game={provider.id}
                  >
                    <p className="text-2xl">{provider.glyph}</p>
                    <p className="mt-2 font-medium">{provider.name}</p>
                    <p className="mt-1 text-sm text-mute">
                      {challenges} challenge{challenges === 1 ? "" : "s"} ·{" "}
                      {provider.authType === "public"
                        ? "no ownership proof needed"
                        : "ownership proved when you link"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {notLive.length > 0 ? (
          <section>
            <h2 className="text-xl font-medium">Not live</h2>
            <p className="mt-1 text-sm text-mute">
              Listed because they exist, not because they can be entered.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2 text-sm text-mute">
              {notLive.map(({ provider }) => (
                <li
                  key={provider.id}
                  data-testid="game-not-live"
                  data-game={provider.id}
                  className="rounded-lg border border-dashed border-line px-3 py-1.5"
                >
                  {provider.name}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </>
  );
}
