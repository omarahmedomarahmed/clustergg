"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { approveRequest, rejectRequest } from "@/lib/challenge-requests";
import { setChallengeState, challengeUrl } from "@/lib/challenges";
import { siteUrl } from "@/lib/discord/config";

async function audit(adminId: string, action: string, targetType?: string, targetId?: string) {
  try {
    const db = await getDb();
    await db.insert(schema.auditLog).values({ id: uid(), adminId, action, targetType, targetId, meta: {} });
  } catch { /* an unrecorded audit entry must not undo the action */ }
}

export type RequestActionState = { ok?: string; error?: string } | null;

// Approving is the moment a server's request becomes a real challenge: it
// creates it, mints the entry key, and announces it to their server with the
// key attached. Everything else in the flow is preparation for this click.
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
      error: res.reason === "no_planet"
        ? "That game has no planet yet — create it under Planets first."
        : res.reason === "not_pending"
          ? "That request has already been reviewed."
          : "Couldn't approve that request.",
    };
  }

  await audit(admin.id, "challenge_request.approve", "challenge", res.challengeId);
  revalidatePath("/admin/discord/requests");
  const url = await challengeUrl(siteUrl(), res.challengeId);
  return { ok: `Approved. Key ${res.accessKey} sent to the server. ${url}` };
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

  const res = await setChallengeState(id, next as "paused" | "active" | "completed", { staff: true });
  if (!res.ok) {
    return { error: res.reason === "bad_state" ? "That challenge has already finished." : "Couldn't change that challenge." };
  }
  await audit(admin.id, `challenge.${next}`, "challenge", id);
  revalidatePath("/admin/challenges");
  revalidatePath(`/admin/challenges/${id}`);
  revalidatePath("/admin/discord/requests");
  return {
    ok: next === "completed"
      ? `Ended — placements frozen and trophies awarded for ${res.title}.`
      : next === "paused" ? `Paused ${res.title}.` : `Resumed ${res.title}.`,
  };
}
