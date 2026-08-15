// This week's challenges, with **Re-announce** on each and **Re-announce all**.
//
// S6. The button exists because the single most common owner complaint is a
// challenge nobody in the server saw — the announcement scrolled past at 3am.
// Re-announcing is one more post, not a new challenge, and it goes through the
// post queue exactly like the original (A2: nothing fans out inline, even to
// one server).

import { getDb } from "../../../../../lib/db/index.ts";
import { ownerOverview } from "../../../../../lib/portal/owner.ts";
import { demoNow } from "../../../../../lib/site/clock.ts";
import { Panel, Row, Empty, Refusal } from "../../../components.tsx";
import { Button } from "../../../../ui.tsx";
import { reAnnounceAction } from "../actions.ts";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OwnerChallenges({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const query = await searchParams;
  const db = await getDb();
  const overview = await ownerOverview(db, guildId, demoNow(query));
  if (!overview) notFound();

  const challenges = overview.thisWeekChallenges;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">This week</h1>

      <Panel
        title="Challenges feeding this week's pool"
        note="Every one of these earns your server entrants. Re-announcing posts it again — it does not create a new one"
        action={
          challenges.length > 0 ? (
            <form action={reAnnounceAction}>
              <input type="hidden" name="guildId" value={guildId} />
              {challenges.map((c) => (
                <input key={c.id} type="hidden" name="challengeId" value={c.id} />
              ))}
              <Button type="submit" data-testid="re-announce-all">
                Re-announce all
              </Button>
            </form>
          ) : null
        }
      >
        {challenges.length === 0 ? (
          <Empty>
            Nothing is running in your server this week. Challenges are announced to
            every installed server — there is nothing to opt into.
          </Empty>
        ) : (
          challenges.map((c) => (
            <Row key={c.id}>
              <div>
                <p>{c.title}</p>
                <p className="text-xs text-mute">{c.game}</p>
              </div>
              <form action={reAnnounceAction}>
                <input type="hidden" name="guildId" value={guildId} />
                <input type="hidden" name="challengeId" value={c.id} />
                <Button type="submit" data-testid="re-announce">
                  Re-announce
                </Button>
              </form>
            </Row>
          ))
        )}
      </Panel>

      {typeof query.error === "string" ? (
        <Refusal testId="re-announce-error">{query.error}</Refusal>
      ) : null}
      {typeof query.queued === "string" ? (
        <p data-testid="re-announce-queued" className="text-sm text-green-400">
          Queued {query.queued} post{query.queued === "1" ? "" : "s"}. Everything goes
          through the queue, even one — nothing fans out inline.
        </p>
      ) : null}
    </div>
  );
}
