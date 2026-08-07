"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { buyTrophy } from "@/lib/marketplace";

export type BuyState = {
  error?: string;
  ok?: boolean;
  /** What they got, so the confirmation can name it. */
  trophy?: string;
  balance?: number;
} | undefined;

/**
 * Spend Cluster Points on a trophy.
 *
 * The price, the balance and the recipient are all resolved server-side in
 * `buyTrophy` — nothing about the transaction is taken from the form except
 * WHICH trophy. A page that rendered an hour ago has a stale balance on it, and
 * that is the ordinary way a shop like this gets abused.
 *
 * "and WHO for" used to be part of that sentence. Gifting is deleted (B72.3):
 * a gamer buys for themselves, the recipient is never read from a form, and
 * `buyTrophy` no longer has a parameter that could carry one.
 */
export async function purchaseTrophy(_prev: BuyState, formData: FormData): Promise<BuyState> {
  const me = await requireUser();
  const trophyId = String(formData.get("trophyId") ?? "");
  const res = await buyTrophy(me.id, trophyId);
  if (!res.ok) return { error: res.error };

  revalidatePath("/marketplace");
  revalidatePath("/profile");
  revalidatePath(`/u/${me.slug}`);
  revalidatePath("/quests");
  return { ok: true, trophy: res.trophy, balance: res.balance };
}
