"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { toggleWebVote } from "@/lib/identity";
import { gamerWeekVotes, voteWindow } from "@/lib/profile-week";

export type WeekVoteState = {
  slug?: string;
  voted?: boolean;
  weekVotes?: number;
  lifetimeVotes?: number;
  error?: string;
} | undefined;

// Voting from the band, which is where most votes will now be cast.
//
// Returns both counts so the entry card can update in place — a leaderboard
// that needs a full page reload to show the vote you just cast feels broken,
// and this one is on every page.
export async function voteFromBand(_prev: WeekVoteState, fd: FormData): Promise<WeekVoteState> {
  const me = await getCurrentUser();
  const slug = String(fd.get("slug") ?? "").trim();
  if (!me) return { slug, error: "Continue with Discord to vote." };
  if (!slug) return { error: "No profile." };

  const win = await voteWindow();
  if (!win.open) {
    return {
      slug,
      error: win.closedReason === "frozen"
        ? "Voting is closed while this week's winners are announced. It reopens Monday."
        : "Voting is closed right now.",
    };
  }

  const db = await getDb();
  const [target] = await db.select({ id: schema.users.id })
    .from(schema.users).where(eq(schema.users.slug, slug)).limit(1);
  if (!target) return { slug, error: "That profile no longer exists." };

  const res = await toggleWebVote(target.id, me.id);
  if (!res.ok) {
    return {
      slug,
      error: res.reason === "self" ? "You can't vote for your own profile."
        : res.reason === "closed" ? "Voting just closed for this week."
          : "Couldn't record that vote.",
    };
  }

  const counts = await gamerWeekVotes(target.id);
  // The profile page and the Best Profile board both show these numbers.
  try {
    revalidatePath(`/u/${slug}`);
    revalidatePath("/leaderboards/best-profile");
  } catch { /* the vote stands whether or not a cache refresh worked */ }

  return { slug, voted: res.added, weekVotes: counts.week, lifetimeVotes: counts.lifetime };
}
