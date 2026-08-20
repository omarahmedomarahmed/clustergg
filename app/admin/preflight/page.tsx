// `/admin/preflight` — "is it up?", answered without a terminal.
//
// ===== 10-SETUP'S RULE, MADE INTO A PAGE =====
//
// *"The owner has no terminal, ever."* Every other page on this console shows
// the platform's **data**. This one shows the platform's **wiring**, because
// the wiring is the part that fails invisibly: a missing variable, a service
// that stopped answering, a schema that never arrived, a schedule that never
// fires.
//
// Production ran with zero tables and the only symptom anybody could see was a
// 500 on the homepage. The row that says *"Migrations: 0 of 23 applied"* is
// the whole reason this page exists — it turns an outage nobody can explain
// into a sentence somebody can act on.
//
// Nothing here can print a secret. `envRows()` returns presence and never a
// value, so there is no template change that could leak one — the page cannot
// display what it is never given.
//
// Every check is fenced and the whole page is `Promise.allSettled` underneath:
// house rule 11 applies most sharply here, on the page whose entire job is to
// stay readable while things are broken.

import fs from "node:fs/promises";
import path from "node:path";
import { getDb } from "../../../lib/db/index.ts";
import {
  envRows,
  serviceHealth,
  migrationHealth,
  cronHealth,
  commandHealth,
  type Health,
} from "../../../lib/site/preflight.ts";
import { Panel, Row, Light } from "../components.tsx";
import { registerCommandsAction } from "../actions.ts";

export const dynamic = "force-dynamic";

async function migrationCount(): Promise<number> {
  try {
    const dir = path.join(process.cwd(), "drizzle");
    return (await fs.readdir(dir)).filter((f) => f.endsWith(".sql")).length;
  } catch {
    return 0;
  }
}

function HealthRow({ h }: { h: Health }) {
  return (
    <Row>
      <div className="flex items-start gap-3">
        <Light ok={h.ok} level="red" />
        <div>
          <p className="text-sm">{h.label}</p>
          <p className="mt-0.5 text-xs text-mute">{h.detail}</p>
        </div>
      </div>
    </Row>
  );
}

export default async function Preflight() {
  const db = await getDb();
  const expected = await migrationCount();

  // Settled independently. One slow external service must not stop the
  // database row from rendering — that row is the one somebody came for.
  const [services, migrations, crons, commands] = await Promise.all([
    serviceHealth(db),
    migrationHealth(db, expected),
    cronHealth(db),
    commandHealth(),
  ]);

  const env = envRows();
  const groups = [...new Set(env.map((v) => v.group))];
  const missingRequired = env.filter((v) => v.required && !v.present);
  const allGood =
    missingRequired.length === 0 && migrations.ok && services.every((s) => s.ok);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Preflight</h1>
        <p className="mt-1 text-sm text-mute">
          Everything the platform needs that is not visible from the product.
        </p>
      </div>

      <Panel
        title={allGood ? "Everything required is present" : "Something needs attention"}
        note={
          allGood
            ? "Every required variable is set, the schema is current, and every service answered"
            : "The red rows below are the ones to fix, in order"
        }
      >
        <Row>
          <div className="flex items-start gap-3">
            <Light ok={allGood} level="red" />
            <p className="text-sm" data-testid="preflight-summary" data-ok={allGood ? "1" : "0"}>
              {missingRequired.length > 0
                ? `${missingRequired.length} required variable${
                    missingRequired.length === 1 ? " is" : "s are"
                  } missing: ${missingRequired.map((v) => v.name).join(", ")}.`
                : allGood
                  ? "No action needed."
                  : "Every required variable is set, but a check below is failing."}
            </p>
          </div>
        </Row>
      </Panel>

      <Panel
        title="The schema"
        note="Applied by the build command, before the build. Never by hand"
        help={
          <p>
            The migrator runs as the first step of <code>npm run build</code>, so a
            deploy whose schema did not arrive fails at the migration instead of
            serving 500s. If this row is red, the last deploy&apos;s build log says why.
          </p>
        }
      >
        <HealthRow h={migrations} />
      </Panel>

      <Panel
        title="The scheduled jobs"
        note="The weekly cycle is these three. When they stop, nothing on any page says so"
        help={
          <p>
            Scheduled in <code>vercel.json</code> and authorised by{" "}
            <code>CRON_SECRET</code>. Without that secret every job is called and
            answers 401 — the jobs look scheduled in the dashboard and nothing runs.
          </p>
        }
      >
        {crons.map((h) => (
          <HealthRow key={h.label} h={h} />
        ))}
      </Panel>

      <Panel title="External services" note="Each one asked, not assumed">
        {services.map((h) => (
          <HealthRow key={h.label} h={h} />
        ))}
      </Panel>

      {/*
        The bot's front door. Registering the commands is a deploy step, and it
        lives here rather than in a script because 10-SETUP's premise is that
        the owner never opens a terminal. The row above the button is Discord's
        own answer, not ours: a local list compared against a local list passes
        on the one day the PUT failed.
      */}
      <Panel
        title="The bot's front door"
        note="Without the commands, the only way into the bot is a button on an announced challenge"
        help={
          <p>
            Slash commands are registered globally with Discord and replaced whole
            each time. Re-register after any deploy that changes them; Discord can
            take up to an hour to propagate a change to every client.
          </p>
        }
      >
        <HealthRow h={commands} />
        <Row>
          <form action={registerCommandsAction}>
            <button
              type="submit"
              data-testid="register-commands"
              className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-white/5"
            >
              Register the slash commands
            </button>
          </form>
        </Row>
      </Panel>

      {groups.map((group) => (
        <Panel
          key={group}
          title={group === "Required" ? "Required variables" : `${group} variables`}
          note={
            group === "Required"
              ? "The platform does not work without these"
              : "Missing means that feature is off, not that the platform is down"
          }
        >
          {env
            .filter((v) => v.group === group)
            .map((v) => (
              <Row key={v.name}>
                <div className="flex items-start gap-3">
                  <Light ok={v.present} level={v.required ? "red" : "amber"} />
                  <div>
                    <p className="font-mono text-sm" data-testid={`env-${v.name}`}>
                      {v.name}{" "}
                      <span className="font-sans text-xs text-mute">
                        {v.present ? "set" : "not set"}
                      </span>
                    </p>
                    {!v.present ? (
                      <p className="mt-0.5 text-xs text-mute">{v.breaks}</p>
                    ) : null}
                  </div>
                </div>
              </Row>
            ))}
        </Panel>
      ))}

      <p className="text-xs text-mute">
        Values are never shown on this page, and are never loaded into it. Set them in
        the Vercel dashboard under Settings → Environment Variables, then redeploy.
      </p>
    </div>
  );
}
