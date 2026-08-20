// `/admin/queue` — what the bot is waiting to say, and what it gave up on.
//
// ===== 10-SETUP §8 ASSUMED THIS PAGE EXISTED =====
//
// The outage table tells an operator to look at the queue and retry what
// failed. `queueStatus` and `retryFailed` were both written for it and both had
// no caller anywhere — `94-export-reach` found them together. So the advice
// pointed at a screen that did not exist, and a batch of announcements that
// gave up after four attempts sat in a table nobody could see.
//
// It matters more now than it did: the queue no longer carries only
// announcements. Every owner DM goes through it (L11), which means the row that
// says a message failed is sometimes the row that says an owner was never told
// they have money — and `reassignOwner` refuses on the strength of exactly that.

import { getDb } from "../../../lib/db/index.ts";
import { queueStatus } from "../../../lib/discord/post-queue.ts";
import { Panel, Row, Light } from "../components.tsx";
import { drainQueueAction, retryFailedPostsAction } from "../actions.ts";

export const dynamic = "force-dynamic";

export default async function AdminQueue({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const str = (k: string) => (typeof query[k] === "string" ? (query[k] as string) : null);
  await getDb();
  const status = await queueStatus();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">The post queue</h1>
        <p className="mt-1 text-sm text-mute">
          Every card and every DM the bot owes somebody. A cron drains it; this is
          where you look when it has not.
        </p>
      </div>

      {str("notice") ? (
        <p className="rounded-lg border border-line bg-ink px-4 py-3 text-sm text-mute" data-testid="queue-notice">
          {str("notice")}
        </p>
      ) : null}

      <Panel title="Where it stands" note="Pending is normal. Failed is a decision somebody has to make">
        <Row>
          <div className="flex items-start gap-3">
            <Light ok={status.failed === 0} level="red" />
            <p className="text-sm" data-testid="queue-counts">
              {status.pending} pending · {status.failed} failed · {status.done} delivered
            </p>
          </div>
        </Row>
        <Row>
          <div className="flex gap-3">
            <form action={drainQueueAction}>
              <button
                type="submit"
                data-testid="drain-now"
                className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-white/5"
              >
                Drain now
              </button>
            </form>
            <form action={retryFailedPostsAction}>
              <button
                type="submit"
                data-testid="retry-failed"
                className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-white/5"
              >
                Put the failed ones back
              </button>
            </form>
          </div>
        </Row>
      </Panel>

      <Panel
        title={status.failures.length === 0 ? "Nothing was given up on" : "Given up on"}
        note="Four attempts, then it stops. A rate limit does not count toward that budget"
        help={
          <p>
            A failed row is not retried on its own, deliberately: four attempts over
            an hour and a half is long enough that the cause is a channel that was
            deleted, a permission that was removed, or an owner who does not take DMs
            — none of which a fifth attempt fixes. Fix the cause, then put them back.
          </p>
        }
      >
        {status.failures.length === 0 ? (
          <Row>
            <p className="text-sm text-mute" data-testid="queue-clear">
              Every message either landed or is still waiting its turn.
            </p>
          </Row>
        ) : (
          status.failures.map((f, i) => (
            <Row key={`${f.guildId ?? f.dmUserId ?? i}-${i}`}>
              <div className="flex items-start gap-3">
                <Light ok={false} level="red" />
                <div>
                  <p className="text-sm" data-testid="queue-failure">
                    {f.dmUserId ? `DM to ${f.dmUserId}` : `channel ${f.channelId}`}
                    {f.guildId ? ` · server ${f.guildId}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-mute">
                    {f.attempts} attempts · {f.error ?? "no reason recorded"}
                  </p>
                </div>
              </div>
            </Row>
          ))
        )}
      </Panel>
    </div>
  );
}
