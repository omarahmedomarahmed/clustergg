// The redemption queue. Approve → send → mark paid, one at a time.

import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../../lib/db/index.ts";
import { Panel, Money, Empty } from "../components.tsx";
import { redemptionAction } from "../actions.ts";

export const dynamic = "force-dynamic";

const NEXT: Record<string, { step: string; label: string } | null> = {
  pending: { step: "approve", label: "Approve" },
  approved: { step: "send", label: "Mark sent" },
  sent: { step: "paid", label: "Mark paid" },
  paid: null,
  rejected: null,
  cancelled: null,
};

export default async function Redeems({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { error } = await searchParams;
  const db = await getDb();

  const rows = await db
    .select({
      redemption: schema.redemptions,
      user: schema.users,
      trophy: schema.trophies,
    })
    .from(schema.redemptions)
    .innerJoin(schema.users, eq(schema.redemptions.userId, schema.users.id))
    .innerJoin(schema.userTrophies, eq(schema.redemptions.userTrophyId, schema.userTrophies.id))
    .innerJoin(schema.trophies, eq(schema.userTrophies.trophyId, schema.trophies.id))
    .orderBy(desc(schema.redemptions.requestedAt));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Redemptions</h1>

      {typeof error === "string" ? (
        <p className="rounded-xl border border-red-900 bg-red-950/40 px-5 py-4 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <Panel title={`Queue — ${rows.filter((r) => r.redemption.status === "pending").length} pending`}>
        {rows.length === 0 ? (
          <Empty>Nothing to pay out.</Empty>
        ) : (
          <div className="flex flex-col">
            {rows.map(({ redemption, user, trophy }) => {
              const next = NEXT[redemption.status];
              return (
                <div
                  key={redemption.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3 last:border-0"
                >
                  <div>
                    <p className="text-sm">
                      {user.displayName} · {trophy.name}
                    </p>
                    <p className="mt-1 text-xs text-mute">
                      {redemption.status} · {redemption.method} · {redemption.country} ·
                      requested {redemption.requestedAt.toISOString().slice(0, 10)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <Money cents={redemption.amountCents} />
                    {next ? (
                      <form action={redemptionAction}>
                        <input type="hidden" name="redemptionId" value={redemption.id} />
                        <input type="hidden" name="step" value={next.step} />
                        <button
                          type="submit"
                          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white"
                        >
                          {next.label}
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-mute">settled</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-4 text-xs leading-relaxed text-mute">
          The prize vault falls by exactly the trophy&rsquo;s value on{" "}
          <strong>paid</strong>, and not before — until the money has actually
          gone, the liability is still ours.
        </p>
      </Panel>
    </div>
  );
}
