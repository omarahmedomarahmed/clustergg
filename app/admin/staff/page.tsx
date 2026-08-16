// `/admin/staff` — titles, and who holds one. **Super admin only** (ST1).
//
// The route is `ADMIN_ONLY` in `ROUTE_ACCESS`, so the layout's gate already
// keeps every other department out. This page states the rule on its face
// anyway, because the person reading it is deciding who gets a console.
//
// A10 — the people listed here are gamers. The grant opens the console and
// changes nothing else: U8, they enter and win challenges like anybody, and
// there is no lever to pull because the metrics are identical for every
// entrant, trophy values are held to the prize pool by T3, and points come
// from provider stats we read.

import { getDb, schema } from "../../../lib/db/index.ts";
import { isNotNull } from "drizzle-orm";
import { staffTitles } from "../../../lib/admin/staff.ts";
import { currentStaff } from "../../../lib/admin/session.ts";
import { DEPARTMENTS } from "../../../lib/admin/auth.ts";
import { Panel, Row, Empty } from "../components.tsx";
import { Button } from "../../ui.tsx";
import { createTitleAction, grantTitleAction } from "./actions.ts";

export const dynamic = "force-dynamic";

export default async function AdminStaff({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const db = await getDb();
  const staff = await currentStaff();
  const titles = await staffTitles(db);

  const holders = await db
    .select({
      id: schema.users.id,
      displayName: schema.users.displayName,
      staffTitleId: schema.users.staffTitleId,
    })
    .from(schema.users)
    .where(isNotNull(schema.users.staffTitleId));

  const titleName = new Map(titles.map((t) => [t.id, t.name]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
        <p className="mt-1 text-sm text-mute">
          A title is what opens this console. Only the super admin can create one or
          grant one, and every grant is logged — a console grant nobody can question
          is a console grant nobody can revoke with confidence.
        </p>
      </div>

      {typeof params.error === "string" ? (
        <p
          data-testid="staff-error"
          className="rounded-xl border border-red-900 bg-red-950/40 px-5 py-4 text-sm text-red-200"
        >
          {params.error}
        </p>
      ) : null}
      {params.saved ? (
        <p data-testid="staff-saved" className="text-sm text-green-400">
          Saved, and logged.
        </p>
      ) : null}

      <Panel
        title="Titles"
        note="Each reaches one or more departments. It can never reach the gamer directory — that is admin-only whatever a title says"
      >
        {titles.length === 0 ? (
          <Empty>No titles yet.</Empty>
        ) : (
          titles.map((t) => (
            <Row key={t.id}>
              <span>{t.name}</span>
              <span className="text-xs text-mute">{(t.departments ?? []).join(" · ")}</span>
            </Row>
          ))
        )}
      </Panel>

      <Panel title="Create a title">
        <form action={createTitleAction} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Name</span>
            <input
              name="name"
              required
              className="rounded-lg border border-line bg-transparent px-3 py-2"
              data-testid="title-name"
            />
          </label>
          <fieldset className="flex flex-wrap gap-4 rounded-xl border border-line px-4 py-3">
            <legend className="px-1 text-sm text-mute">Departments it reaches</legend>
            {DEPARTMENTS.map((d) => (
              <label key={d} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="departments" value={d} />
                {d}
              </label>
            ))}
          </fieldset>
          <div>
            <Button type="submit" data-testid="create-title">
              Create title
            </Button>
          </div>
        </form>
      </Panel>

      <Panel
        title="Who holds one"
        note="Staff are gamers. This list is a list of grants, not a list of people who are something else"
      >
        {holders.length === 0 ? (
          <Empty>Nobody holds a title yet.</Empty>
        ) : (
          holders.map((h) => (
            <Row key={h.id}>
              <span>{h.displayName}</span>
              <span className="flex items-center gap-3 text-xs text-mute">
                {titleName.get(h.staffTitleId ?? "") ?? "unknown title"}
                <form action={grantTitleAction}>
                  <input type="hidden" name="userId" value={h.id} />
                  <input type="hidden" name="titleId" value="" />
                  <button type="submit" className="underline" data-testid="revoke-title">
                    Revoke
                  </button>
                </form>
              </span>
            </Row>
          ))
        )}
      </Panel>

      <p className="text-xs text-mute">
        Signed in as {staff?.name ?? "unknown"} · {staff?.department ?? "no department"}.
      </p>
    </div>
  );
}
