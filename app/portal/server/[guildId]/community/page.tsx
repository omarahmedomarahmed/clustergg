// Community challenges — build one, $5 for one winner or $10 for three.
//
// M26 — **no rate limit and no fee beyond the tier price.** An owner farming
// visibility with community challenges is the growth engine, not an abuse, so
// there is deliberately nothing throttling this form. Adding one later would
// need a ruling.
//
// M22/C1 — this money never touches the server vault. It goes to the prize
// vault and to Cluster, and the page says so, because an owner who thinks
// their own $10 comes back to them in Friday's pool has been misled.
//
// Every price on this page comes from `COMMUNITY_TIERS`. House rule 2: import
// numbers, never retype them.

import { getDb } from "../../../../../lib/db/index.ts";
import {
  COMMUNITY_TIERS,
  communityPriceCents,
  formatMoney,
  type CommunityTier,
} from "../../../../../lib/money/amounts.ts";
import { sellableGames } from "../../../../../lib/portal/brand.ts";
import { schema } from "../../../../../lib/db/index.ts";
import { and, eq, desc } from "drizzle-orm";
import { Panel, Row, Empty, Refusal } from "../../../components.tsx";
import { Button } from "../../../../ui.tsx";
import { buildCommunityAction } from "../actions.ts";

export const dynamic = "force-dynamic";

export default async function CommunityChallenges({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const query = await searchParams;
  const db = await getDb();
  const games = sellableGames();

  const mine = await db
    .select()
    .from(schema.challenges)
    .where(
      and(
        eq(schema.challenges.guildId, guildId),
        eq(schema.challenges.visibility, "community"),
      ),
    )
    .orderBy(desc(schema.challenges.startAt));

  const tiers = (Object.keys(COMMUNITY_TIERS) as unknown as CommunityTier[]).map((t) => ({
    tier: t,
    ...COMMUNITY_TIERS[t],
    priceCents: communityPriceCents(t),
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Community challenges</h1>
      <p className="max-w-2xl text-sm text-mute">
        Your own challenge, in your own server. Members must be in this server to get
        the key, which is what makes it your advertising. There is no limit on how many
        you run — and none of this money comes back to you in Friday&apos;s pool, so run
        them because they fill your server, not to earn.
      </p>

      {typeof query.error === "string" ? (
        <Refusal testId="community-error">{query.error}</Refusal>
      ) : null}
      {typeof query.built === "string" ? (
        <p data-testid="community-built" className="text-sm text-green-400">
          Built and paid. It starts at the start of next week — there is no date
          picker, for anybody.
        </p>
      ) : null}

      <Panel title="Build one" note="Two tiers. That is the whole menu">
        <form action={buildCommunityAction} className="flex flex-col gap-4">
          <input type="hidden" name="guildId" value={guildId} />

          <div className="grid gap-3 sm:grid-cols-2">
            {tiers.map((t) => (
              <label
                key={t.tier}
                className="flex cursor-pointer gap-3 rounded-xl border border-line bg-panel px-4 py-3"
              >
                <input
                  type="radio"
                  name="tier"
                  value={String(t.tier)}
                  defaultChecked={t.tier === tiers[0].tier}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium">{formatMoney(t.priceCents)}</span>
                  <span className="block text-xs text-mute">
                    {formatMoney(t.prizeCents)} prize pool · {t.winners} winner
                    {t.winners === 1 ? "" : "s"}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Title</span>
            <input
              name="title"
              placeholder="Friday night ladder"
              className="rounded-lg border border-line bg-transparent px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Game</span>
            <select
              name="game"
              className="rounded-lg border border-line bg-panel px-3 py-2"
              data-testid="community-game"
            >
              {games.map((g) => (
                <option key={g.provider} value={g.provider}>
                  {g.game}
                </option>
              ))}
            </select>
            <span className="text-xs text-mute">
              Only games we can score are listed. Buying one we cannot score means
              finding out at sync time, which is the worst possible moment.
            </span>
          </label>

          <Button type="submit" data-testid="build-community">
            Build and pay
          </Button>
        </form>
      </Panel>

      <Panel title="Yours" note="Community challenges never feed a weekly pool — C4/K8">
        {mine.length === 0 ? (
          <Empty>You have not run one yet.</Empty>
        ) : (
          mine.map((c) => (
            <Row key={c.id}>
              <div>
                <p>{c.title}</p>
                <p className="text-xs text-mute">
                  {c.game} · week of {c.startAt.toISOString().slice(0, 10)}
                </p>
              </div>
              <span className="text-xs text-mute">{c.state}</span>
            </Row>
          ))
        )}
      </Panel>
    </div>
  );
}
