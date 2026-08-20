// `/u/[slug]` — a gamer's public page, rendered with their own theme.
//
// ===== D21 — FIVE SECTIONS, AND ALL FIVE ARE V3'S =====
//
// Linked accounts, trophy case, challenges entered, standings, rank history.
// The engine this page renders was carried from v1, whose section list named
// quests, Cluster Points, badges, "recent posts" and "my planets" — four
// surfaces v3 deleted. Carrying them would have put the deleted product back in
// through the door nobody watches, because a gamer's saved section order names
// its keys.
//
// The page itself decides nothing about how it looks. It reads the theme, reads
// the five sections, and hands both to `ProfileView` — which is also what the
// builder's preview renders, so the preview cannot drift from the page.

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../../lib/db/index.ts";
import { profileBySlug } from "../../../lib/site/queries.ts";
import { themeFor } from "../../../lib/profile/store.ts";
import { Nav } from "../../components.tsx";
import { ProfileView, type ProfileSections } from "./profile-view.tsx";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await profileBySlug(slug);
  if (!found) notFound();
  const { user, holdings, entries } = found;

  const db = await getDb();
  const theme = await themeFor(db, user.id);

  // ===== WHAT A PUBLIC PAGE MAY SAY ABOUT SOMEBODY =====
  //
  // Linked accounts show the **in-game name they chose to link**, never the
  // provider's account id and never the region — the id is the thing the
  // provider treats as an identifier, and `/admin/linked-accounts` is
  // admin-only for a reason (house rule 7). A public page that printed one
  // would be that page's contents, published.
  const accounts = await db
    .select({
      provider: schema.linkedGameAccounts.provider,
      handle: schema.linkedGameAccounts.inGameName,
    })
    .from(schema.linkedGameAccounts)
    .where(eq(schema.linkedGameAccounts.userId, user.id));

  // ===== RANK HISTORY, FROM THE FUNCTION THE CLOSE ALREADY USES =====
  //
  // `rankMovementFor` is what step 3 of the weekly close reads to tell every
  // entrant whether they moved. Calling it here rather than comparing
  // `rankAtJoin` to something is the whole of K12: two implementations of
  // "did they rank up" would eventually disagree, and the one on the public
  // page is the one a gamer would screenshot.
  //
  // Bounded to their eight most recent challenges. A profile is a page, not a
  // report, and each one of these is a provider-shaped read.
  const { rankMovementFor } = await import("../../../lib/challenges/jobs.ts");
  const recent = [...entries]
    .sort((a, b) => b.challenge.startAt.getTime() - a.challenge.startAt.getTime())
    .slice(0, 8);
  const rank: ProfileSections["rank"] = [];
  for (const { challenge } of recent) {
    // Fenced per challenge: rank history is a decoration on a public page, and
    // one provider read that fails must not take the profile down.
    try {
      const moves = await rankMovementFor(db, challenge.id);
      const mine = moves.find((m) => m.userId === user.id);
      if (mine) {
        rank.push({
          week: challenge.startAt.toISOString().slice(0, 10),
          from: mine.from,
          to: mine.to,
        });
      }
    } catch {
      /* a rank we cannot read is a row we do not show */
    }
  }

  const data: ProfileSections = {
    accounts: accounts
      .filter((a) => a.handle)
      .map((a) => ({ provider: a.provider, handle: a.handle as string })),
    trophies: holdings.map(({ holding, trophy }) => ({
      id: trophy.id,
      name: trophy.name,
      valueCents: trophy.valueCents,
      redeemed: holding.redeemedAt !== null,
    })),
    challenges: entries.map(({ participant, challenge }) => ({
      id: challenge.id,
      title: challenge.title,
      placement: participant.placement,
    })),
    standings: entries
      .filter((e) => e.participant.placement !== null || e.participant.frozenScore !== null)
      .map(({ participant, challenge }) => ({
        title: challenge.title,
        placement: participant.placement,
        points: participant.frozenScore ?? 0,
      })),
    rank,
  };

  return (
    <>
      <Nav />
      <ProfileView theme={theme} displayName={user.displayName} slug={slug} data={data} />
    </>
  );
}
