"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { adminReply, markRead } from "@/lib/server-messages";

// Staff answering a server owner.
//
// The reply is recorded first and delivered after, so it survives Discord being
// unreachable — and the console can tell the owner-facing difference between
// "we answered" and "they received it".

export type ReplyState = { ok?: string; error?: string } | null;

export async function replyToServer(
  guildId: string,
  _prev: ReplyState,
  formData: FormData,
): Promise<ReplyState> {
  const staff = await requireStaff();
  const body = String(formData.get("body") ?? "");
  const res = await adminReply({ guildId, body });
  if (!res.ok) {
    return { error: res.reason === "empty" ? "Write something first." : "Couldn't send that." };
  }

  // Answering is reading. Leaving the thread unread after replying would keep
  // it in the "waiting on us" queue forever.
  await markRead(guildId, "admin");

  try {
    const db = await getDb();
    await db.insert(schema.auditLog).values({
      id: uid(), adminId: staff.id, action: "server.reply",
      targetType: "guild", targetId: guildId, meta: {},
    });
  } catch { /* an unrecorded audit entry must not undo the reply */ }

  revalidatePath(`/admin/discord/${guildId}`);
  revalidatePath("/admin/messages");
  return { ok: "Sent — it's in their DMs and on their dashboard." };
}
