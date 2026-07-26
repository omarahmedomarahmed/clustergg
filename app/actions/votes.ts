"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { toggleWebVote } from "@/lib/identity";
import { gamerWeekVotes, voteWindow } from "@/lib/profile-week";

export type VoteState = { votes?: number; weekVotes?: number; voted?: boolean; error?: string } | undefined;

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
    if (res.reason === "closed") {
      const win = await voteWindow();
      return {
        error: win.closedReason === "frozen"
          ? "Voting is closed while this week's winners are announced. It reopens Monday."
          : "Voting is closed right now.",
      };
    }
    return { error: res.reason === "self" ? "You can't vote for your own profile." : "Couldn't record that vote." };
  }

  const counts = await gamerWeekVotes(target.id);
  revalidatePath(`/u/${slug}`);
  revalidatePath("/leaderboards/best-profile");
  return { votes: counts.lifetime, weekVotes: counts.week, voted: res.added };
}
