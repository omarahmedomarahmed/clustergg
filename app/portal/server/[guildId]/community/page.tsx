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
import {
  requestCommunityAction,
  approveCommunityAction,
  rejectCommunityAction,
} from "../actions.ts";
import { pendingSpendRequests } from "../../../../../lib/portal/spend.ts";
import { serverPortalAccess } from "../../../../../lib/portal/session.ts";
import { mayApproveSpend, accessLabel } from "../../../../../lib/portal/permissions.ts";

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

  // 12 §6 — an administrator requests and the guild **owner** approves. The
  // page shows both halves to everybody: an administrator who cannot see the
  // approve button does not know it exists, and "why is nothing happening"
  // becomes a support ticket instead of a sentence on screen.
  const access = await serverPortalAccess(guildId);
  const mayApprove = mayApproveSpend(access);
  const waiting = await pendingSpendRequests(db, guildId);

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
      {typeof query.requested === "string" ? (
        <p data-testid="community-requested" className="text-sm text-green-400">
          Requested. Nothing has been built and nothing has been billed — the
          server owner sees it waiting below and decides.
        </p>
      ) : null}
      {typeof query.approved === "string" ? (
        <p data-testid="community-approved" className="text-sm text-green-400">
          Approved, built and paid. It starts at the start of next week — there
          is no date picker, for anybody.
        </p>
      ) : null}
      {typeof query.rejected === "string" ? (
        <p data-testid="community-rejected" className="text-sm text-mute">
          Rejected. Nothing was spent.
        </p>
      ) : null}

      {/* ===== WAITING ON THE OWNER — P1, WITH A SURFACE ===== */}
      <Panel
        title="Waiting for the owner"
        note="Only the guild owner can approve a spend"
        help={
          <p>
            An administrator can build and <strong>request</strong> one; only the
            Discord guild owner can approve the spend. Two separate checks, on
            purpose — a single one is one careless edit away from letting anybody
            with a role spend your balance.
          </p>
        }
      >
        {waiting.length === 0 ? (
          <Empty>Nothing waiting.</Empty>
        ) : (
          <ul className="flex flex-col gap-4" data-testid="spend-requests">
            {waiting.map((r) => {
              const payload = r.payload as Record<string, string>;
              return (
                <li key={r.id} className="text-sm">
                  <div className="flex items-baseline justify-between gap-4">
                    <span>{payload.title}</span>
                    <span className="text-mute">
                      {formatMoney(communityPriceCents((r.tier ?? 1) as CommunityTier))} ·
                      requested by {r.requestedBy}
                    </span>
                  </div>
                  {mayApprove ? (
                    <div className="mt-2 flex gap-2">
                      <form action={approveCommunityAction}>
                        <input type="hidden" name="guildId" value={guildId} />
                        <input type="hidden" name="requestId" value={r.id} />
                        <Button type="submit" data-testid="approve-spend">
                          Approve and pay
                        </Button>
                      </form>
                      <form action={rejectCommunityAction}>
                        <input type="hidden" name="guildId" value={guildId} />
                        <input type="hidden" name="requestId" value={r.id} />
                        <Button type="submit" data-testid="reject-spend">
                          Reject
                        </Button>
                      </form>
                    </div>
                  ) : (
                    // ===== DISABLED WITH THE REASON, NEVER HIDDEN =====
                    //
                    // 09 §Band 2 shot 4a asks for exactly this. A button that
                    // is simply absent teaches an administrator nothing; one
                    // that is present and explains itself teaches them who to
                    // ask.
                    <p className="mt-2 text-xs text-mute" data-testid="approve-disabled">
                      <button type="button" disabled className="mr-2 rounded-md border border-line px-2 py-1 opacity-50">
                        Approve and pay
                      </button>
                      You are signed in as {accessLabel(access)}. Only the Discord
                      server owner can approve a spend — everything else on this
                      portal is yours to use.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel
        title="Build one"
        note="Two tiers. That is the whole menu"
        help={
          <p>
            Your money buys the prize and our margin, and none of it goes into the
            weekly pool — paying you out of a pool your own money funded would pay
            you twice. There is no rate limit and no fee: running these is how a
            server grows, and that is the point of them.
          </p>
        }
      >
        <form action={requestCommunityAction} className="flex flex-col gap-4">
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
            {mayApprove ? "Request it (you can approve it yourself)" : "Request it"}
          </Button>
          <p className="text-xs text-mute">
            This records a request. Nothing is built and nothing is billed until
            the server owner approves — an administrator can ask for a spend and
            only the owner can make one.
          </p>
        </form>
      </Panel>

      <Panel
        title="Yours"
        note="Community challenges never feed a weekly pool — C4/K8"
        help={
          <p>
            Every one of these gets a public page on the web with a{" "}
            <strong>Join this server</strong> button. That is the whole idea: your
            competition advertises your server, and somebody has to join it to get
            the key.
          </p>
        }
      >
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
