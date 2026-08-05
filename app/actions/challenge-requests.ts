"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { approveRequest, rejectRequest } from "@/lib/challenge-requests";
import { setChallengeState } from "@/lib/challenges";

async function audit(adminId: string, action: string, targetType?: string, targetId?: string) {
  try {
    const db = await getDb();
    await db.insert(schema.auditLog).values({ id: uid(), adminId, action, targetType, targetId, meta: {} });
  } catch { /* an unrecorded audit entry must not undo the action */ }
}

export type RequestActionState = { ok?: string; error?: string; editHref?: string } | null;

/**
 * Approving turns a request into a DRAFT challenge, and stops.
 *
 * It used to create the challenge live and announce it to every server in the
 * same click — so a brand's draft copy, and whatever trophies the auto-podium
 * guessed at, went out to the whole network before a human had read a word of
 * it. There is no unsend for a Discord announcement.
 *
 * Now: approve means "yes, we'll run this". The challenge is created, the
 * trophies are picked, the campaign slot is bound, the entry key is minted —
 * and it waits in the editor. Publishing is the separate click that announces.
 */
export async function approveChallengeRequest(
  _prev: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("requestId") ?? "").trim();
  if (!id) return { error: "Missing request." };

  const res = await approveRequest(id, admin.id, {
    title: String(formData.get("title") ?? "").trim() || undefined,
    days: Number(formData.get("days")) || undefined,
    note: String(formData.get("note") ?? "").trim() || undefined,
  });

  if (!res.ok) {
    return {
      error: res.reason === "brand_unpaid"
        ? (res.message ?? "That brand has an unpaid campaign invoice past its grace period.")
        : res.reason === "no_planet"
        ? "That game has no planet yet — create it under Planets first."
        : res.reason === "not_pending"
          ? "That request has already been reviewed."
          : "Couldn't approve that request.",
    };
  }

  await audit(admin.id, "challenge_request.approve", "challenge", res.challengeId);
  revalidatePath("/admin/discord/requests");
  revalidatePath("/admin/challenges");
  return {
    ok: "Approved and saved as a draft — nothing has been announced yet. Open it, check the title, dates, rules and trophies, then publish. Publishing is what posts it to Discord.",
    editHref: `/admin/challenges/${res.challengeId}`,
  };
}

export async function rejectChallengeRequest(
  _prev: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("requestId") ?? "").trim();
  if (!id) return { error: "Missing request." };
  const note = String(formData.get("note") ?? "").trim();
  const ok = await rejectRequest(id, admin.id, note || undefined);
  if (!ok) return { error: "Couldn't reject that request." };
  await audit(admin.id, "challenge_request.reject", "challenge_request", id);
  revalidatePath("/admin/discord/requests");
  return { ok: "Rejected." };
}

// Staff pause/resume/end for ANY challenge — the same code path a server owner
// uses in Discord for their own, so the two can't drift apart.
export async function staffSetChallengeState(
  _prev: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("challengeId") ?? "").trim();
  const next = String(formData.get("state") ?? "");
  if (!id || !["paused", "active", "completed"].includes(next)) return { error: "Bad request." };

  // Was it a draft? Then this click is a LAUNCH, and a launch announces.
  //
  // Without this, an admin flipping a draft live from the challenges list got a
  // live challenge that nobody had been told about — the mirror image of the
  // old bug, where the announcement went out before anybody could edit it.
  const db = await getDb();
  const [before] = await db.select({ status: schema.challenges.status })
    .from(schema.challenges).where(eq(schema.challenges.id, id)).limit(1);
  const launching = next === "active" && before?.status === "draft";

  const res = await setChallengeState(id, next as "paused" | "active" | "completed", { staff: true });
  if (!res.ok) {
    return { error: res.reason === "bad_state" ? "That challenge has already finished." : "Couldn't change that challenge." };
  }
  await audit(admin.id, `challenge.${next}`, "challenge", id);

  let reached = 0;
  if (launching) {
    // Awaited. The announcement is what writes the delivery ledger, and the
    // ledger is where every reach number a brand sees comes from.
    try {
      const { announceChallengeLaunched } = await import("@/lib/discord/announce");
      reached = await announceChallengeLaunched(id);
    } catch { /* it is live either way; staff can re-announce */ }
  }
  revalidatePath("/admin/challenges");
  revalidatePath(`/admin/challenges/${id}`);
  revalidatePath("/admin/discord/requests");
  return {
    ok: next === "completed"
      ? `Ended — placements frozen and trophies awarded for ${res.title}.`
      : next === "paused"
        ? `Paused ${res.title}.`
        : launching
          // Say the number. "Published" with no count is how a fan-out that
          // reached nobody passes for a success for three days.
          ? `${res.title} is live — announced to ${reached} ${reached === 1 ? "server" : "servers"}.`
          : `Resumed ${res.title}.`,
  };
}
