// The weekend routine, as a checklist with state — docs/05-ADMIN.md §9.
//
// Every step is DERIVED from the platform's own rows. A checklist somebody
// ticks says "done" when they meant "started", and this one has to survive a
// person being ill.

import { getDb } from "../../../lib/db/index.ts";
import { weekendChecklist } from "../../../lib/admin/dashboard.ts";
import { demoNow } from "../../../lib/site/clock.ts";
import { Panel, Light } from "../components.tsx";

export const dynamic = "force-dynamic";

export default async function Weekend({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = demoNow(await searchParams);
  const db = await getDb();
  const steps = await weekendChecklist(db, now);
  const done = steps.filter((s) => s.done).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">The weekend routine</h1>
        <p className="mt-1 text-sm text-mute">
          {done} of {steps.length} done. Nothing here is ticked by hand — each
          step reads the rows that would prove it.
        </p>
      </div>

      <Panel title="One week, closed and reloaded">
        <ol className="flex flex-col" data-testid="weekend-steps">
          {steps.map((s, i) => (
            <li
              key={s.key}
              data-step={s.key}
              data-done={s.done}
              className="flex gap-4 border-b border-line py-4 last:border-0"
            >
              <span className="pt-1"><Light ok={s.done} /></span>
              <div>
                <p className="text-sm font-medium">
                  {i + 1}. {s.title}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-mute">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
