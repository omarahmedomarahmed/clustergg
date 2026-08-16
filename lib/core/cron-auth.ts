// Who may run a scheduled job.
//
// ===== A CRON ROUTE IS A PUBLIC URL =====
//
// `/api/cron/daily` closes the week. `/api/cron/sync` costs a provider call
// per linked account. Neither is behind a session, because the thing calling
// them is a scheduler, not a person — so the only thing standing between them
// and the open internet is a shared secret, and it has to fail closed.
//
// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. That is the header
// this reads, and it is compared in constant time like every other secret on
// this platform.
//
// A1 — **a cron job computes; it never releases money.** That is not enforced
// here, because it cannot be: it is enforced by the jobs themselves opening
// payouts as drafts. This module only answers *may you run at all*.

import { createHmac, timingSafeEqual } from "node:crypto";

export type CronVerdict = { ok: true } | { ok: false; status: number; reason: string };

/**
 * In the demo there is no secret and no scheduler.
 *
 * Fenced the same way every other demo allowance is: on the **absence of a
 * database**, not on `NODE_ENV`. A deployment with a real database and no
 * `CRON_SECRET` is a misconfiguration, and it is answered with a refusal
 * rather than an open door.
 */
function isDemo(): boolean {
  return process.env.DEMO_DB === "1" || !process.env.DATABASE_URL;
}

export function authoriseCron(authorization: string | null): CronVerdict {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    if (isDemo()) return { ok: true };
    // ===== THE DIRECTION THAT MATTERS =====
    //
    // An unset secret on a real deployment must refuse, not allow. The
    // opposite default turns every scheduled job into an endpoint anybody can
    // POST — including the one that closes the week.
    return {
      ok: false,
      status: 503,
      reason:
        "CRON_SECRET is not set, so scheduled jobs cannot be authorised. " +
        "See docs/10-SETUP.md §6.",
    };
  }

  const given = (authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!given) return { ok: false, status: 401, reason: "Not authorised." };

  // Hashed before comparing so the comparison is fixed-length whatever the
  // caller sent — a raw `timingSafeEqual` throws on a length mismatch, which
  // is itself a signal about how long the secret is.
  const a = createHmac("sha256", secret).update(given).digest();
  const b = createHmac("sha256", secret).update(secret).digest();
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, status: 401, reason: "Not authorised." };
}
