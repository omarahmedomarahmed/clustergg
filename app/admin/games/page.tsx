// `/admin/games` — the catalogue, provider status, and whether proof is
// required. 05 §8.
//
// ===== A GAME WE CANNOT SCORE IS A GAME WE CANNOT SELL =====
//
// `isProviderLive` is the one answer, and this page reports it rather than
// deciding it. Two things it makes visible that nothing else does:
//
//   **Not live, and why.** VALORANT is the worked example — not one endpoint
//   survives on the personal key, not even platform status, so it cannot be
//   scored, rank-gated or health-checked. A salesperson needs to know that
//   before the call, not during it.
//
//   **O4 — whether proof is required, per game.** Visible to admin *and* to
//   brands, because a brand whose challenge cannot verify its entrants should
//   know before they buy rather than after somebody disputes a placement.

import Link from "next/link";
import { sql } from "drizzle-orm";
import { getDb, schema } from "../../../lib/db/index.ts";
import { PROVIDERS, isProviderLive } from "../../../lib/providers/registry.ts";
import { RIOT_UNAVAILABLE_GAMES } from "../../../lib/providers/riot-methods.ts";
import { Panel, Row, Light } from "../components.tsx";

export const dynamic = "force-dynamic";

export default async function Games() {
  const db = await getDb();
  const counts = await db
    .select({ game: schema.challenges.game, n: sql<number>`count(*)::int` })
    .from(schema.challenges)
    .groupBy(schema.challenges.game);
  const countBy = new Map(counts.map((c) => [c.game, c.n]));

  const rows = PROVIDERS.map((p) => ({
    provider: p,
    live: isProviderLive(p),
    challenges: countBy.get(p.game) ?? 0,
  }));
  const live = rows.filter((r) => r.live);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Games</h1>
        <p className="mt-1 text-sm text-mute">
          {live.length} of {rows.length} live.
        </p>
      </div>

      <Panel
        title="Live"
        note="Sellable today. The builder offers exactly these"
        help={
          <p>
            A provider with no key configured is simply not offered, which is
            deliberate: the game picker only shows games that can actually be played
            today, and a challenge we cannot referee is one we should never have taken
            money for.
          </p>
        }
      >
        {live.map(({ provider, challenges }) => (
          <Row key={provider.id}>
            <div>
              <p>
                {provider.glyph} {provider.name}
              </p>
              <p className="text-xs text-mute">
                {provider.capabilities
                  .filter((c) => c.scoreable)
                  .map((c) => c.label)
                  .join(", ") || "nothing scoreable"}
              </p>
            </div>
            <span className="flex items-center gap-3 text-sm text-mute">
              <span data-testid="game-proof">
                {provider.authType === "public" ? "no ownership proof" : "ownership proved on link"}
              </span>
              <span>{challenges} challenges</span>
              <Light ok />
            </span>
          </Row>
        ))}
      </Panel>

      <Panel
        title="Not live"
        note="Listed because they exist, not because they can be sold"
        help={
          <p>
            <strong>VALORANT is a product decision, not a footnote.</strong> Not one VAL
            endpoint survives on our Riot key — not even platform status — so it cannot
            be scored, rank-gated or health-checked. It is unsellable until Riot grants
            production access, and a Riot ID proven through League is the only thing it
            can still do.
          </p>
        }
      >
        {rows
          .filter((r) => !r.live)
          .map(({ provider }) => (
            <Row key={provider.id}>
              <span>
                {provider.glyph} {provider.name}
              </span>
              <span className="flex items-center gap-3 text-xs text-mute">
                <span data-testid="not-live-reason">
                  {provider.notLive
                    ? "declared not live"
                    : `needs ${provider.envVars.join(", ") || "a key"}`}
                </span>
                <Light ok={false} level="red" />
              </span>
            </Row>
          ))}
        <p className="mt-4 text-xs text-mute" data-testid="riot-unavailable">
          Gone from the Riot personal key entirely: {RIOT_UNAVAILABLE_GAMES.join(", ")}.
        </p>
      </Panel>

      <p className="text-xs text-mute">
        The public catalogue is at{" "}
        <Link href="/games" className="underline">
          /games
        </Link>
        , and shows the same answer.
      </p>
    </div>
  );
}
