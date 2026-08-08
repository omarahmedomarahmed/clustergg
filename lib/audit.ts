import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";

// The audit log, written from one place.
//
// THE LEGACY THIS REPLACES: three private `audit()` helpers, in
// `app/actions/admin.ts`, `app/actions/payouts.ts` and
// `app/actions/quests-admin.ts`, with three different signatures. One took a
// target type and a meta object, one took neither, one took meta but not type.
// So what an audit row contained depended on which file the action happened to
// live in, and the log — the thing you read when something went wrong — was the
// least consistent surface in the console.
//
// One signature, and it is deliberately the widest of the three: anything worth
// logging is worth logging with what it touched and what changed.
//
// ===== IT NEVER THROWS =====
//
// An audit write that fails must not fail the action it was recording. That is
// not a comfortable trade and it is the right one: an admin who released a
// payout and got an error would release it again, and a duplicate payout is
// worse than a missing log line. The failure is printed instead, so it is
// visible in the function logs rather than silent.

export type AuditMeta = Record<string, unknown>;

export async function audit(
  adminId: string,
  action: string,
  targetId?: string,
  meta?: AuditMeta,
  targetType?: string,
): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(schema.auditLog).values({
      id: uid(),
      adminId,
      action,
      // Derived from the action when not given: "vaults.split" is a vaults
      // thing, and making every caller repeat that is how a field ends up
      // half-filled and useless for filtering.
      targetType: targetType ?? action.split(".")[0],
      targetId,
      meta: meta ?? {},
    });
  } catch (e) {
    console.warn(`[audit] failed to record ${action}:`, String(e).slice(0, 200));
  }
}

/**
 * Log a CHANGE, with both sides.
 *
 * A log that records only the new value cannot answer the one question anybody
 * asks afterwards — what was it before? Used for every settings edit in the
 * console, so an operator can always reconstruct the previous state without a
 * database backup.
 */
export async function auditChange(
  adminId: string,
  action: string,
  targetId: string,
  before: unknown,
  after: unknown,
  reason?: string,
): Promise<void> {
  await audit(adminId, action, targetId, { before, after, ...(reason ? { reason } : {}) });
}
