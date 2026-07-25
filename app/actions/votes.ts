"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { toggleWebVote } from "@/lib/identity";

export type VoteState = { votes?: number; voted?: boolean; error?: string } | undefined;

// Vote for a profile in the Best Profile race. Signed-in only on the web —
// on Discord the bot votes by snowflake instead, so a whole server can back
// someone without anyone having to sign up first.
export async function voteForProfile(_prev: VoteState, formData: FormData): Promise<VoteState> {
  const me = await getCurrentUser();
  if (!me) return { error: "Continue with Discord to vote." };

  const slug = String(formData.get("slug") ?? "");
  const db = await getDb();
  const [target] = await db.select({ id: schema.users.id })
    .from(schema.users).where(eq(schema.users.slug, slug)).limit(1);
  if (!target) return { error: "That profile no longer exists." };

  const res = await toggleWebVote(target.id, me.id);
  if (!res.ok) {
    return { error: res.reason === "self" ? "You can't vote for your own profile." : "Couldn't record that vote." };
  }

  revalidatePath(`/u/${slug}`);
  revalidatePath("/leaderboards/best-profile");
  return { votes: res.votes, voted: res.added };
}
