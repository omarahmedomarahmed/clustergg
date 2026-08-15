// The dashboard. A1 — the most important page on the platform.
//
// It answers one question: **what is blocking this week?** Every block below
// maps to a row of docs/05-ADMIN.md §1, and every number is computed by
// `lib/admin/dashboard.ts`, which is tested. This page renders; it decides
// nothing.

import Link from "next/link";
import { getDb } from "../../lib/db/index.ts";
import { dashboard, notifications, weekendChecklist } from "../../lib/admin/dashboard.ts";
import { demoNow } from "../../lib/site/clock.ts";
import { Panel, Light, Money, Row, Empty, Blocking } from "./components.tsx";

export const dynamic = "force-dynamic";

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const now = demoNow(params);
  const db = await getDb();
  const [board, inbox, weekend] = await Promise.all([
    dashboard(db, now),
    notifications(db, new Date(now.getTime() - 7 * 86_400_000)),
    weekendChecklist(db, now),
  ]);

  const denied = typeof params.denied === "string" ? params.denied : null;
  const needsYou = board.queue.filter((c) => c.ready || c.blocking.length > 0);
  const done = weekend.filter((s) => s.done).length;

  return (
    <div className="flex flex-col gap-6">
      {denied ? (
        <p
          data-testid="access-denied"
          className="rounded-xl border border-red-900 bg-red-950/40 px-5 py-4 text-sm text-red-200"
        >
          <strong>{denied}</strong> is not open to your department. The gamer
          directory and the linked-account list are admin-only, and that has no
          exceptions.
        </p>
      ) : null}

      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          What is blocking this week
        </h1>
        <p className="text-sm text-mute">
          {board.phase === "run" ? "Competition running" : "Grace period"} · week of{" "}
          {board.thisWeek.toISOString().slice(0, 10)}
        </p>
      </div>

      {/* ── Live indicators. Checks 1–4, on the page, not in a nightly report. */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {board.indicators.map((i) => (
          <div key={i.key} className="rounded-xl border border-line bg-panel px-5 py-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Light ok={i.ok} level={i.key === "prize_vault" && !i.ok ? "amber" : "red"} />
              {i.headline}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-mute">{i.detail}</p>
          </div>
        ))}
      </section>

      {/* ── Needs you now. Paid and not announced, soonest first. */}
      <Panel
        title="Needs you now"
        action={
          <Link href="/admin/challenges" className="text-sm text-mute hover:text-white">
            The whole queue →
          </Link>
        }
      >
        {needsYou.length === 0 ? (
          <Empty>Nothing is waiting on you. Everything paid is set up and announced.</Empty>
        ) : (
          <div className="flex flex-col">
            {needsYou.map((c) => (
              <div key={c.id} className="border-b border-line py-4 last:border-0">
                <div className="flex items-baseline justify-between">
                  <Link href={`/admin/challenges/${c.id}`} className="font-medium hover:underline">
                    {c.title}
                  </Link>
                  <span className="text-xs text-mute">
                    {c.game} · week of {c.weekStart.toISOString().slice(0, 10)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-mute">{c.stateLabel}</p>
                <div className="mt-2">
                  <Blocking items={c.blocking} />
                </div>
                {c.ready ? (
                  <Link
                    href={`/admin/challenges/${c.id}`}
                    className="mt-3 inline-block rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white"
                  >
                    Set up and announce
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="The pool"
          action={
            <Link href="/admin/vaults/server" className="text-sm text-mute hover:text-white">
              Allocate →
            </Link>
          }
        >
          <Row>
            <span className="text-sm text-mute">Allocated this week</span>
            <Money cents={board.poolThisWeekCents} />
          </Row>
          <Row>
            <span className="text-sm text-mute">Ceiling — half the vault</span>
            <Money cents={board.poolCeilingCents} />
          </Row>
          <Row>
            <span className="text-sm text-mute">Server vault</span>
            <Money cents={board.balances.server} />
          </Row>
        </Panel>

        <Panel title="This week">
          <Row>
            <span className="text-sm text-mute">Live</span>
            <span className="tabular-nums">{board.counts.live}</span>
          </Row>
          <Row>
            <span className="text-sm text-mute">Announced, not yet started</span>
            <span className="tabular-nums">{board.counts.announced}</span>
          </Row>
          <Row>
            <span className="text-sm text-mute">Paid, awaiting setup</span>
            <span className="tabular-nums">{board.counts.scheduled}</span>
          </Row>
          <Row>
            <span className="text-sm text-mute">Drafts</span>
            <span className="tabular-nums">{board.counts.draft}</span>
          </Row>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Inbox"
          action={<span className="text-xs text-mute">Last 7 days</span>}
        >
          {inbox.length === 0 ? (
            <Empty>Nothing new.</Empty>
          ) : (
            <div className="flex flex-col">
              {inbox.slice(0, 8).map((n, i) => (
                <Row key={i}>
                  <span className="text-sm">{n.headline}</span>
                  <span className="text-xs text-mute">{n.at.toISOString().slice(0, 10)}</span>
                </Row>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="The weekend routine"
          action={
            <Link href="/admin/weekend" className="text-sm text-mute hover:text-white">
              {done} of {weekend.length} done →
            </Link>
          }
        >
          <div className="flex flex-col">
            {weekend.map((s) => (
              <Row key={s.key}>
                <span className="flex items-center gap-2 text-sm">
                  <Light ok={s.done} />
                  {s.title}
                </span>
              </Row>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
