// The prize vault — the platform's balance sheet.
//
// docs/05-ADMIN.md: "must be built with more care than anything else". It
// shows **every trophy, not a total**, because a total is the one thing that
// cannot be checked against anything.

import { desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "../../../../lib/db/index.ts";
import { checkPrizeVault } from "../../../../lib/money/prize-vault.ts";
import { vaultSearch } from "../../../../lib/admin/dashboard.ts";
import { formatMoney, TROPHY_HOLD_YEARS } from "../../../../lib/money/amounts.ts";
import { Panel, Money, Row, Light, Empty } from "../../components.tsx";
import { sweepAction, reverseSweepAction } from "../../actions.ts";

export const dynamic = "force-dynamic";

export default async function PrizeVault({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const error = typeof params.error === "string" ? params.error : null;
  const db = await getDb();

  const check = await checkPrizeVault(db);

  // ===== `sweepDueAt` IS SHOWN, NOT RECOMPUTED =====
  //
  // The date a holding became sweepable is what makes a reversal a judgement
  // rather than a guess: an expiry sweep that fired the day it was due is a
  // different thing from one that fired years late. Read from the module that
  // decides it — a second calculation here would be a second answer to "was
  // this sweep in time".
  const { sweepDueAt } = await import("../../../../lib/trophies/settle.ts");
  const sweptRows = await db
    .select({
      id: schema.userTrophies.id,
      sweptAt: schema.userTrophies.sweptAt,
      sweptReason: schema.userTrophies.sweptReason,
      trophyName: schema.trophies.name,
      valueCents: schema.trophies.valueCents,
      holderName: schema.users.displayName,
    })
    .from(schema.userTrophies)
    .innerJoin(schema.trophies, eq(schema.userTrophies.trophyId, schema.trophies.id))
    .innerJoin(schema.users, eq(schema.userTrophies.userId, schema.users.id))
    .where(sql`${schema.userTrophies.sweptAt} is not null`)
    .orderBy(desc(schema.userTrophies.sweptAt))
    .limit(50);
  const swept = await Promise.all(
    sweptRows.map(async (r) => ({ ...r, dueAt: await sweepDueAt(db, r.id) })),
  );
  const results = query ? await vaultSearch(db, query) : [];

  // Every money-trophy, with its holder count. Not a total.
  const rows = await db
    .select({
      trophy: schema.trophies,
      holders: sql<number>`count(${schema.userTrophies.id}) filter (where ${schema.userTrophies.redeemedAt} is null and ${schema.userTrophies.sweptAt} is null)::int`,
    })
    .from(schema.trophies)
    .leftJoin(schema.userTrophies, eq(schema.userTrophies.trophyId, schema.trophies.id))
    .where(sql`${schema.trophies.valueCents} > 0`)
    .groupBy(schema.trophies.id)
    .orderBy(desc(schema.trophies.valueCents));

  const pendingRedeems = await db
    .select()
    .from(schema.redemptions)
    .where(eq(schema.redemptions.status, "pending"));

  const orphanCount = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.userTrophies)
    .leftJoin(schema.users, eq(schema.userTrophies.userId, schema.users.id))
    .where(
      sql`${schema.userTrophies.redeemedAt} is null and ${schema.userTrophies.sweptAt} is null
          and (${schema.users.id} is null or ${schema.users.status} <> 'active')`,
    );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">The prize vault</h1>

      {error ? (
        <p className="rounded-xl border border-red-900 bg-red-950/40 px-5 py-4 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <Panel title="The invariant">
        <p
          data-testid="vault-state"
          data-state={check.state}
          className="flex items-center gap-2 text-sm"
        >
          <Light ok={check.holds} level={check.state === "over_allocated" ? "red" : "amber"} />
          {check.explanation}
        </p>
        <div className="mt-4">
          <Row><span className="text-sm text-mute">Balance — sum of the ledger</span><Money cents={check.balanceCents} /></Row>
          <Row><span className="text-sm text-mute">Unredeemed money-trophies on live accounts</span><Money cents={check.liabilityCents} /></Row>
          <Row><span className="text-sm text-mute">Held for deleted accounts</span><Money cents={check.orphanedCents} /></Row>
          <Row><span className="text-sm text-mute">Difference</span><Money cents={check.differenceCents} /></Row>
        </div>
      </Panel>

      <Panel title="Search by gamer name">
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={query}
            placeholder="A gamer's name"
            className="flex-1 rounded-lg border border-line bg-ink px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-lg border border-line px-4 py-2 text-sm hover:border-accent">
            Search
          </button>
        </form>
        {query ? (
          results.length === 0 ? (
            <Empty>Nobody by that name holds a trophy.</Empty>
          ) : (
            <div className="mt-4 flex flex-col">
              {results.map((r) => (
                <Row key={r.holding.id}>
                  <span className="text-sm">
                    {r.user.displayName} · {r.trophy.name}
                  </span>
                  <span className="flex items-center gap-4 text-sm">
                    <span className="tabular-nums">
                      {r.trophy.valueCents > 0 ? formatMoney(r.trophy.valueCents) : "Collectable"}
                    </span>
                    <span className="text-xs text-mute">
                      {r.holding.redeemedAt
                        ? "cashed out"
                        : r.redemption
                          ? `redeem ${r.redemption.status}`
                          : "held"}
                    </span>
                  </span>
                </Row>
              ))}
            </div>
          )
        ) : null}
      </Panel>

      <Panel title={`Every money-trophy — ${rows.length}`}>
        {rows.length === 0 ? (
          <Empty>No money-trophies exist yet.</Empty>
        ) : (
          <div className="flex flex-col">
            {rows.map(({ trophy, holders }) => (
              <Row key={trophy.id}>
                <span className="text-sm">{trophy.name}</span>
                <span className="flex items-center gap-6 text-sm">
                  <span className="text-xs text-mute">
                    {holders} holder{holders === 1 ? "" : "s"}
                  </span>
                  <Money cents={trophy.valueCents} />
                </span>
              </Row>
            ))}
          </div>
        )}
      </Panel>

      <Panel title={`Redeem queue — ${pendingRedeems.length} pending`}>
        <p className="text-sm text-mute">
          Approved individually, per holder, per trophy, on{" "}
          <a href="/admin/redeems" className="underline underline-offset-4">the redeem queue</a>.
        </p>
      </Panel>

      <Panel title="Sweeps">
        <p className="text-sm text-mute">
          A sweep is logged with date, holder, value and reason, and it is
          reversible — a swept trophy is still theirs, the money has been parked.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <form action={sweepAction}>
            <input type="hidden" name="reason" value="orphaned" />
            <button
              type="submit"
              className="rounded-lg border border-line px-4 py-2 text-sm hover:border-accent"
            >
              Sweep orphaned — {orphanCount[0]?.n ?? 0} holding
              {(orphanCount[0]?.n ?? 0) === 1 ? "" : "s"}
            </button>
          </form>
          <form action={sweepAction}>
            <input type="hidden" name="reason" value="expired" />
            <button
              type="submit"
              className="rounded-lg border border-line px-4 py-2 text-sm hover:border-accent"
            >
              Sweep expired — held over {TROPHY_HOLD_YEARS} years
            </button>
          </form>
        </div>
      </Panel>

      {/*
        ===== THE REVERSAL THE PANEL ABOVE HAS BEEN PROMISING =====

        That panel has said "it is reversible" since Sprint 9 and there was no
        way to reverse one — `reverseSweep` was written, guarded, and called by
        nothing. A sweep with no reversal is a one-way door on somebody's money.

        One button per holding, never a bulk undo: a sweep runs over a whole
        category, and a reversal is a person looking at one trophy and deciding
        it was wrong.
      */}
      <Panel title="Swept, and reversible">
        <p className="text-sm text-mute">
          A swept trophy is still the gamer&apos;s. The money was parked, and
          putting it back is one press — logged against you, like the sweep was.
        </p>
        {swept.length === 0 ? (
          <Empty>Nothing has been swept.</Empty>
        ) : (
          <div className="mt-3 flex flex-col">
            {swept.map((s) => (
              <Row key={s.id}>
                <div className="flex w-full items-center justify-between gap-4">
                  <div>
                    <p className="text-sm" data-testid="swept-row">
                      {s.trophyName} · <Money cents={s.valueCents} />
                    </p>
                    <p className="mt-0.5 text-xs text-mute">
                      {s.holderName} · swept {s.sweptAt?.toISOString().slice(0, 10)} ·{" "}
                      {s.sweptReason ?? "no reason recorded"}
                      {s.dueAt ? ` · became sweepable ${s.dueAt.toISOString().slice(0, 10)}` : ""}
                    </p>
                  </div>
                  <form action={reverseSweepAction}>
                    <input type="hidden" name="userTrophyId" value={s.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-accent"
                      data-testid="reverse-sweep"
                    >
                      Put it back
                    </button>
                  </form>
                </div>
              </Row>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
