// A clock the screenshot record can move, in demo mode only.
//
// docs/09-TEST-PLAN.md wants **every state of every flow** captured, and two
// of the most important states are decided by the day of the week: the
// homepage shows a countdown and a live pool during the competition, and
// winners and next week during the grace period. A recording session that
// happens to run on a Saturday can only ever photograph one of them.
//
// So in demo mode a page may be asked for a different instant. It is fenced
// three ways, because a clock a request can move is a clock an attacker can
// move: it only works when the process has no database of its own, it only
// accepts a parseable date, and it is never consulted anywhere that decides
// money — the pool division it renders is computed from the same function
// either way, just asked about a different moment.

import { isDemoMode } from "../db/index.ts";

export function demoNow(searchParams?: Record<string, string | string[] | undefined>): Date {
  if (!isDemoMode || !searchParams) return new Date();
  const raw = searchParams.at;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
