// Is it up? — answered without a terminal.
//
// ===== 10-SETUP'S RULE IS ABSOLUTE: THE OWNER HAS NO TERMINAL, EVER =====
//
// Everything this platform needs in order to work is an environment variable,
// an external service, a schema version or a schedule. Every one of those is
// invisible from the product: a missing `PORTAL_SECRET` looks like "the brand
// login is broken", an unrun migration looks like "the homepage is broken",
// and a cron that never fires looks like nothing at all — the week simply does
// not close and no page says why.
//
// That last one is the reason this file exists. Production spent its entire
// life with zero tables because the migrator was never called, and the only
// symptom was a 500. A page that says *"migrations: 0 of 23 applied"* turns a
// silent outage into a sentence.
//
// ===== A SECRET IS NEVER A VALUE HERE, ONLY A YES OR A NO =====
//
// Every check reports **presence**, never content. Nothing on this page, and
// nothing this module returns, can print a token — not truncated, not the last
// four, not "starts with". House rule 5's reasoning generalises: the safest
// thing to do with a secret is to be unable to show it.
//
// ===== THE LIST IS DATA HERE AND THE DOCUMENT IS THE AUTHORITY =====
//
// The variables are declared below rather than parsed out of `10-SETUP.md` at
// runtime, because `docs/` is not deployed and a page that reads it would work
// locally and be blank in production — the exact class of bug this page exists
// to catch. So the band holds the two together instead: `95-deploy` asserts
// that every variable 10-SETUP names appears here, with the same required-ness.
// Retyping is only safe when something fails if the copy drifts.

import type { DB } from "../db/index.ts";

export type Health = { ok: boolean; label: string; detail: string };

export type EnvVar = {
  name: string;
  group: string;
  /** Required means the platform does not work without it. */
  required: boolean;
  /** What actually breaks. The sentence somebody reads at 2am. */
  breaks: string;
};

/**
 * Every variable 10-SETUP names, plus the one it does not.
 *
 * `CRON_SECRET` is **not** in 10-SETUP §1 and it is load-bearing:
 * `authoriseCron` fails closed without it, so on a real deployment all three
 * jobs answer 401 and the weekly cycle silently never runs. It is listed here
 * as required because the code requires it. The document needs a line, and
 * that is the owner's call rather than a silent edit to a ratified spec.
 */
export const ENV_SPEC: readonly EnvVar[] = [
  {
    name: "DATABASE_URL",
    group: "Required",
    required: true,
    breaks: "Every page 500s. Without it the app runs an in-process demo database instead.",
  },
  {
    name: "AUTH_SECRET",
    group: "Required",
    required: true,
    breaks: "Staff sessions cannot be signed, so nobody can sign in to /admin.",
  },
  {
    name: "PORTAL_SECRET",
    group: "Required",
    required: true,
    breaks:
      "Brand portals cannot be signed into at all — and because a card signature " +
      "reaches for it, a missing one once took the entire Discord bot down.",
  },
  {
    name: "SETUP_TOKEN",
    group: "Required",
    required: true,
    breaks:
      "The first admin account cannot be created. Remove it once one exists — " +
      "after that, a set SETUP_TOKEN is a second door into the console.",
  },
  {
    name: "CRON_SECRET",
    group: "Required",
    required: true,
    breaks:
      "All three scheduled jobs answer 401 and the weekly cycle never runs: no " +
      "gun, no sync, no close. Nothing on any page says so. NOT NAMED IN 10-SETUP.",
  },
  {
    name: "DISCORD_BOT_TOKEN",
    group: "Discord",
    required: false,
    breaks: "The bot cannot post. Announcements queue and never drain.",
  },
  {
    name: "DISCORD_PUBLIC_KEY",
    group: "Discord",
    required: false,
    breaks:
      "Interaction signatures cannot be verified, so Discord's own endpoint " +
      "verification fails and every button press is rejected.",
  },
  {
    name: "DISCORD_APPLICATION_ID",
    group: "Discord",
    required: false,
    breaks: "Commands cannot be registered against the application.",
  },
  {
    name: "DISCORD_CLIENT_ID",
    group: "Discord",
    required: false,
    breaks: "Gamers and server owners cannot sign in — that is both doors.",
  },
  {
    name: "DISCORD_CLIENT_SECRET",
    group: "Discord",
    required: false,
    breaks: "The OAuth exchange fails after the redirect, so sign-in dead-ends.",
  },
  {
    name: "STRIPE_SECRET_KEY",
    group: "Payments",
    required: false,
    breaks: "No brand can pay an invoice, so no challenge ever reaches scheduled.",
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    group: "Payments",
    required: false,
    breaks:
      "Payments succeed at Stripe and the platform never hears. Invoices stay " +
      "unpaid and challenges stay in draft.",
  },
  {
    name: "RESEND_API_KEY",
    group: "Email",
    required: false,
    breaks:
      "No brand invite keys, no password resets, and no redemption verification " +
      "codes — so no gamer can cash out a trophy.",
  },
  {
    name: "RIOT_API_KEY",
    group: "Providers",
    required: false,
    breaks: "Riot games are not offered. The picker only shows games playable today.",
  },
  {
    name: "NEXT_PUBLIC_SITE_URL",
    group: "Site",
    required: false,
    breaks: "Links in Discord posts and emails point at the wrong host.",
  },
  {
    name: "BLOB_READ_WRITE_TOKEN",
    group: "Site",
    required: false,
    breaks:
      "Uploaded card artwork is held in the server process and disappears on the " +
      "next restart. Cards still render; the images stop resolving.",
  },
];

/** Presence only. This function cannot return a secret's value. */
export function envRows(): (EnvVar & { present: boolean })[] {
  return ENV_SPEC.map((v) => ({ ...v, present: Boolean(process.env[v.name]?.trim()) }));
}

// ── The schema, and whether it actually arrived ─────────────────────────────

/**
 * How many migrations the database has applied, against how many exist.
 *
 * The check that would have turned the outage into one sentence.
 */
export async function migrationHealth(db: DB, expected: number): Promise<Health> {
  try {
    const { sql } = await import("drizzle-orm");
    const rows = await db.execute(
      sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
    );
    const list = (Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])) as {
      n: number;
    }[];
    const applied = Number(list[0]?.n ?? 0);
    return {
      ok: applied >= expected && expected > 0,
      label: "Migrations",
      detail:
        applied === 0
          ? `0 of ${expected} applied. The database is empty — every page will 500. ` +
            `The build command runs the migrator; check the last deploy's build log.`
          : `${applied} of ${expected} applied.`,
    };
  } catch (e) {
    return {
      ok: false,
      label: "Migrations",
      detail: `Could not read the migration table: ${(e as Error).message}`,
    };
  }
}

// ── The three schedules, and when each last fired ───────────────────────────

export const CRON_JOBS = [
  { key: "sync", label: "Sync", cadence: "Hourly", staleAfterMs: 3 * 60 * 60_000 },
  { key: "announce", label: "Post-queue drain", cadence: "Every 5 minutes", staleAfterMs: 30 * 60_000 },
  { key: "daily", label: "Daily jobs", cadence: "Daily", staleAfterMs: 36 * 60 * 60_000 },
] as const;

const CRON_KEY = (name: string) => `cron:lastRun:${name}`;

/**
 * Stamp that a job ran. Called by the job itself, at the end.
 *
 * A stored timestamp, and deliberately so — the same exception `baseline` and
 * `week_records` sit under. "When did this last run" cannot be derived from
 * anything, because a job that does nothing leaves nothing behind, and a job
 * that has stopped running leaves nothing behind in exactly the same way. The
 * difference between those two is the whole question.
 */
export async function recordCronRun(db: DB, name: string, now = new Date()): Promise<void> {
  const { schema } = await import("../db/index.ts");
  await db
    .insert(schema.settings)
    .values({ key: CRON_KEY(name), value: { at: now.toISOString() }, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: { at: now.toISOString() }, updatedAt: now },
    });
}

export async function cronHealth(db: DB, now = new Date()): Promise<Health[]> {
  const { schema } = await import("../db/index.ts");
  const { inArray } = await import("drizzle-orm");
  const keys = CRON_JOBS.map((j) => CRON_KEY(j.key));

  let rows: { key: string; value: unknown }[] = [];
  try {
    rows = await db
      .select({ key: schema.settings.key, value: schema.settings.value })
      .from(schema.settings)
      .where(inArray(schema.settings.key, keys));
  } catch {
    // The settings table not being readable is already reported by the
    // migration row. A second red line saying the same thing is noise.
    rows = [];
  }

  const at = new Map(
    rows.map((r) => [r.key, (r.value as { at?: string } | null)?.at ?? null]),
  );

  return CRON_JOBS.map((job) => {
    const stamp = at.get(CRON_KEY(job.key));
    if (!stamp) {
      return {
        ok: false,
        label: `${job.label} — ${job.cadence}`,
        detail:
          "Has never run. Check that vercel.json is deployed and that CRON_SECRET " +
          "is set: without it the job is called and answers 401.",
      };
    }
    const ageMs = now.getTime() - new Date(stamp).getTime();
    const mins = Math.round(ageMs / 60_000);
    const ago = mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`;
    return {
      ok: ageMs <= job.staleAfterMs,
      label: `${job.label} — ${job.cadence}`,
      detail:
        ageMs <= job.staleAfterMs
          ? `Last fired ${ago}.`
          : `Last fired ${ago} — overdue for a ${job.cadence.toLowerCase()} job.`,
    };
  });
}

// ── External services, each asked rather than assumed ────────────────────────

async function reach(
  label: string,
  url: string,
  init: RequestInit,
  okWhen: (status: number) => boolean = (s) => s >= 200 && s < 300,
): Promise<Health> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8_000) });
    return {
      ok: okWhen(res.status),
      label,
      detail: okWhen(res.status)
        ? `Reachable, and the credential is accepted (HTTP ${res.status}).`
        : `Answered HTTP ${res.status}. The credential is set but not working.`,
    };
  } catch (e) {
    return { ok: false, label, detail: `Could not reach it: ${(e as Error).message}` };
  }
}

const NOT_SET = (label: string, what: string): Health => ({
  ok: false,
  label,
  detail: `Not configured — ${what}`,
});

/**
 * Ask every external service whether it is actually there.
 *
 * Each check is independent and each is fenced: house rule 11 says a
 * decoration may never take a card down, and an unreachable Riot must not be
 * able to blank the row that says the database is fine.
 */
export async function serviceHealth(db: DB): Promise<Health[]> {
  const checks: Promise<Health>[] = [];

  checks.push(
    (async (): Promise<Health> => {
      try {
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`select 1`);
        return {
          ok: true,
          label: "Database (Neon)",
          detail: process.env.DATABASE_URL
            ? "Connected and answering."
            : "Answering — but this is the in-process demo database, not Neon.",
        };
      } catch (e) {
        return { ok: false, label: "Database (Neon)", detail: (e as Error).message };
      }
    })(),
  );

  checks.push(
    (async (): Promise<Health> => {
      const { imageBackendName } = await import("../cards/store.ts");
      const name = imageBackendName();
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return NOT_SET(
          "Image store (Blob)",
          `BLOB_READ_WRITE_TOKEN is missing, so artwork is held in memory (backend: ${name}).`,
        );
      }
      return {
        ok: name === "vercel-blob",
        label: "Image store (Blob)",
        detail:
          name === "vercel-blob"
            ? "Vercel Blob is installed and live."
            : `Token is set but the live backend is "${name}". The boot hook did not install it.`,
      };
    })(),
  );

  checks.push(
    process.env.DISCORD_BOT_TOKEN
      ? reach("Discord", "https://discord.com/api/v10/users/@me", {
          headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
        })
      : Promise.resolve(NOT_SET("Discord", "DISCORD_BOT_TOKEN is missing. The bot cannot post.")),
  );

  checks.push(
    process.env.STRIPE_SECRET_KEY
      ? reach("Stripe", "https://api.stripe.com/v1/balance", {
          headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
        })
      : Promise.resolve(NOT_SET("Stripe", "STRIPE_SECRET_KEY is missing. No brand can pay.")),
  );

  checks.push(
    process.env.RESEND_API_KEY
      ? reach("Email (Resend)", "https://api.resend.com/domains", {
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        })
      : Promise.resolve(
          NOT_SET("Email (Resend)", "RESEND_API_KEY is missing. No codes, invites or resets."),
        ),
  );

  checks.push(
    process.env.RIOT_API_KEY
      ? reach(
          "Riot",
          "https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Cluster/Test",
          { headers: { "X-Riot-Token": process.env.RIOT_API_KEY } },
          // 404 is a healthy answer: the key worked and that player does not
          // exist. 401/403 is the one that means the key is dead.
          (s) => s === 404 || (s >= 200 && s < 300),
        )
      : Promise.resolve(NOT_SET("Riot", "RIOT_API_KEY is missing. Riot games are not offered.")),
  );

  // `allSettled`, not `all`. One service throwing must never blank the page —
  // house rule 11, on the page whose entire job is to be readable when things
  // are broken.
  const settled = await Promise.allSettled(checks);
  return settled.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { ok: false, label: `Check ${i + 1}`, detail: `The check itself failed: ${r.reason}` },
  );
}
