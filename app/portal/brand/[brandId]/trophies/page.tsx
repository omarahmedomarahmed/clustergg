// Trophies — their branded trophies, how many gamers hold each, and who.
//
// ===== WHY NAMING HOLDERS IS NOT A BREACH OF THE 25 FLOOR =====
//
// C6 says never describe an **audience group** smaller than 25, because a
// count of three is three people somebody can name. A trophy holder is not an
// audience group: `/trophies/[id]` already names every holder to the whole
// internet, because a trophy is a public thing a gamer earned and wants seen.
// So this page shows what a stranger could already see, and the floor is
// applied where it belongs — to entrant and reach counts, on Reports.
//
// The distinction is worth being explicit about, because getting it backwards
// in either direction is a real harm: suppress holders and a brand cannot tell
// whether their trophy landed; slice entrants by anything and we are handing
// out a list of individuals.

import Link from "next/link";
import { getDb } from "../../../../../lib/db/index.ts";
import { brandReport } from "../../../../../lib/portal/brand.ts";
import { trophyDetail } from "../../../../../lib/site/queries.ts";
import { schema } from "../../../../../lib/db/index.ts";
import { eq, inArray } from "drizzle-orm";
import { formatMoney, TROPHY_HOLD_YEARS } from "../../../../../lib/money/amounts.ts";
import { Panel, Row, Empty } from "../../../components.tsx";

export const dynamic = "force-dynamic";

export default async function BrandTrophies({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const db = await getDb();
  const report = await brandReport(db, brandId);

  const challengeIds = report.map((r) => r.challengeId);
  const trophies = challengeIds.length
    ? await db
        .select()
        .from(schema.trophies)
        .where(inArray(schema.trophies.challengeId, challengeIds))
    : [];

  const detailed = await Promise.all(
    trophies.map(async (t) => ({ trophy: t, detail: await trophyDetail(t.id) })),
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Trophies</h1>
      <p className="max-w-2xl text-sm text-mute">
        Your name, on somebody&apos;s profile, for {TROPHY_HOLD_YEARS} years. A money
        trophy stays in our prize vault until it is redeemed, so a gamer who wins one
        as a teenager still has it when they are old enough to take the money.
      </p>

      {detailed.length === 0 ? (
        <Panel title="Nothing yet">
          <Empty>Trophies appear here once your first challenge is set up.</Empty>
        </Panel>
      ) : (
        detailed.map(({ trophy, detail }) => (
          <Panel
            key={trophy.id}
            help={
              <p>
                A trophy&rsquo;s <strong>value can never be edited</strong> — a $100
                trophy is a $100 trophy forever, on every profile that holds it. Its
                name, image and brand can change, and the edit reaches every holder
                everywhere at once.
              </p>
            }
            title={trophy.name}
            note={
              trophy.valueCents > 0
                ? `${formatMoney(trophy.valueCents)} · held in the prize vault until redeemed`
                : "A badge, with no money behind it"
            }
            action={
              <span className="text-sm tabular-nums text-mute" data-testid="holder-count">
                {(detail?.current.length ?? 0).toLocaleString("en-US")} holding
              </span>
            }
          >
            {!detail || detail.current.length === 0 ? (
              <Empty>Nobody holds this one yet.</Empty>
            ) : (
              detail.current.map(({ user }) => (
                <Row key={user.id}>
                  <Link href={`/u/${user.slug}`} className="hover:underline">
                    {user.displayName}
                  </Link>
                  <span className="text-xs text-mute">public profile</span>
                </Row>
              ))
            )}
            {detail && detail.past.length > 0 ? (
              <p className="pt-3 text-xs text-mute">
                {detail.past.length} redeemed. A redeemed trophy stays on the profile —
                the money left, the achievement did not.
              </p>
            ) : null}
          </Panel>
        ))
      )}
    </div>
  );
}
