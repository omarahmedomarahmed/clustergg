// The queue, grouped by what each challenge needs — docs/05-ADMIN.md §2.
//
// Grouped rather than listed, because a flat list of every challenge in every
// state is a database browser, and the console is meant to be an operating
// theatre.

import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb, schema } from "../../../lib/db/index.ts";
import { readinessOf, STATE_LABEL, type ChallengeState } from "../../../lib/challenges/lifecycle.ts";
import { demoNow } from "../../../lib/site/clock.ts";
import { Panel, Money, Empty, Blocking } from "../components.tsx";

export const dynamic = "force-dynamic";

const GROUPS: { state: ChallengeState; title: string; action: string }[] = [
  { state: "scheduled", title: "Paid, needs setup", action: "Set up → announce" },
  { state: "pending_payment", title: "Awaiting payment", action: "Resend, cancel" },
  { state: "draft", title: "Drafts", action: "View only. Chase the buyer" },
  { state: "announced", title: "Announced", action: "Re-announce, edit before the gun" },
  { state: "live", title: "Live", action: "Watch. Emergency only" },
  { state: "ended", title: "Ended", action: "Review" },
];

export default async function AdminChallenges({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = demoNow(await searchParams);
  const db = await getDb();
  const all = await db.select().from(schema.challenges).orderBy(desc(schema.challenges.startAt));

  const readiness = new Map(
    await Promise.all(
      all
        .filter((c) => ["draft", "pending_payment", "scheduled"].includes(c.state))
        .map(async (c) => [c.id, await readinessOf(db, c.id)] as const),
    ),
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">The queue</h1>

      {GROUPS.map((group) => {
        const rows = all.filter((c) => c.state === group.state);
        return (
          <Panel
            key={group.state}
            title={`${group.title} — ${rows.length}`}
            action={<span className="text-xs text-mute">{group.action}</span>}
          >
            {rows.length === 0 ? (
              <Empty>Nothing here.</Empty>
            ) : (
              <div className="flex flex-col">
                {rows.map((c) => (
                  <div key={c.id} className="border-b border-line py-3 last:border-0">
                    <div className="flex items-baseline justify-between gap-4">
                      <Link
                        href={`/admin/challenges/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.title}
                      </Link>
                      <span className="text-xs text-mute">
                        {c.game} · {c.startAt.toISOString().slice(0, 10)}
                        {c.startAt.getTime() <= now.getTime() && c.state !== "ended"
                          ? " · started"
                          : ""}
                        {" · "}
                        <Money cents={c.prizePoolCents} />
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-mute">
                      {STATE_LABEL[c.state as ChallengeState]}
                    </p>
                    {readiness.has(c.id) ? (
                      <div className="mt-2">
                        <Blocking items={readiness.get(c.id)!.blocking} />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
