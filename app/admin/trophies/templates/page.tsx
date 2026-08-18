// `/admin/trophies/templates` — templates for repeating series. 05 §4.
//
// A template is not a trophy. It is a definition — *place, name, value* — that
// the system instantiates once per instance of a series, which is the whole
// reason a seven-day series does not need twenty-one hand-made trophies.
//
// The instantiating happens on the series page, where the prize pool it must
// balance against actually is. This page is the index: which series have
// templates, and what they add up to per instance. A page that let you define
// a template with no series to attach it to would be a page producing objects
// that mean nothing until somebody remembers them.

import Link from "next/link";
import { getDb, schema } from "../../../../lib/db/index.ts";
import { isNotNull } from "drizzle-orm";
import { checkTemplates } from "../../../../lib/challenges/series.ts";
import { formatMoney } from "../../../../lib/money/amounts.ts";
import { Panel, Row, Empty } from "../../components.tsx";

export const dynamic = "force-dynamic";

export default async function Templates() {
  const db = await getDb();
  const seriesChallenges = await db
    .select()
    .from(schema.challenges)
    .where(isNotNull(schema.challenges.seriesId));
  const trophies = await db.select().from(schema.trophies);

  // One row per series, keyed on the first instance — the templates are the
  // same for every instance by construction, so reading them off instance 0 is
  // reading the definition rather than a copy of it.
  const bySeries = new Map<string, typeof seriesChallenges>();
  for (const c of seriesChallenges) {
    const list = bySeries.get(c.seriesId as string) ?? [];
    list.push(c);
    bySeries.set(c.seriesId as string, list);
  }

  const rows = [...bySeries.entries()].map(([seriesId, instances]) => {
    const ordered = [...instances].sort((a, b) => (a.seriesIndex ?? 0) - (b.seriesIndex ?? 0));
    const first = ordered[0];
    const podium = trophies.filter((t) => t.challengeId === first.id && t.type === "podium");
    return {
      seriesId,
      title: first.title,
      instances: ordered.length,
      prizePerInstanceCents: first.prizePoolCents,
      templates: podium.length,
      check: checkTemplates(podium, first.prizePoolCents),
      total: trophies.filter((t) => ordered.some((c) => c.id === t.challengeId)).length,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trophy templates</h1>
        <p className="mt-1 text-sm text-mute">
          Define once per place. The system instantiates one per instance.
        </p>
      </div>

      <Panel
        title="Every series"
        note="Three templates become twenty-one trophies, and the guard still has to pass"
        help={
          <p>
            The check is per <strong>instance</strong>, not per series: each instance
            has its own prize pool and its own trophies, and T3 asks that one
            challenge&apos;s podium values equal one challenge&apos;s pool. A series
            that balanced in total but not per instance would announce fine and settle
            wrong.
          </p>
        }
      >
        {rows.length === 0 ? (
          <Empty>
            No series yet.{" "}
            <Link href="/admin/challenges/new" className="underline">
              Build one
            </Link>
            .
          </Empty>
        ) : (
          rows.map((r) => (
            <Row key={r.seriesId} href={`/admin/challenges/series/${r.seriesId}`}>
              <div>
                <p>{r.title}</p>
                <p className="text-xs text-mute">
                  {r.templates} template{r.templates === 1 ? "" : "s"} × {r.instances}{" "}
                  instances = {r.total} trophies
                </p>
              </div>
              <span
                className="text-xs"
                data-testid="template-balance"
                data-ok={r.check.ok ? "1" : "0"}
              >
                {r.check.ok
                  ? `${formatMoney(r.check.totalCents)} ✓`
                  : `${formatMoney(r.check.totalCents)} against ${formatMoney(r.check.prizeCents)}`}
              </span>
            </Row>
          ))
        )}
      </Panel>
    </div>
  );
}
