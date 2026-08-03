"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { buyTrophy } from "@/lib/marketplace";

export type BuyState = {
  error?: string;
  ok?: boolean;
  /** What they got, so the confirmation can name it. */
  trophy?: string;
  gifted?: string | null;
  balance?: number;
} | undefined;

/**
 * Spend Cluster Points on a trophy.
 *
 * The price, the balance and the recipient are all resolved server-side in
 * `buyTrophy` — nothing about the transaction is taken from the form except
 * WHICH trophy and WHO for. A page that rendered an hour ago has a stale
 * balance on it, and that is the ordinary way a shop like this gets abused.
 */
export async function purchaseTrophy(_prev: BuyState, formData: FormData): Promise<BuyState> {
  const me = await requireUser();
  const trophyId = String(formData.get("trophyId") ?? "");
  const recipientSlug = String(formData.get("recipientSlug") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  const res = await buyTrophy(me.id, trophyId, { recipientSlug, message });
  if (!res.ok) return { error: res.error };

  revalidatePath("/marketplace");
  revalidatePath("/profile");
  revalidatePath(`/u/${me.slug}`);
  revalidatePath("/quests");
  return { ok: true, trophy: res.trophy, gifted: res.gifted, balance: res.balance };
}
