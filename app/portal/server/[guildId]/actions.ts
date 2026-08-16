"use server";

// Every write an owner can make from the portal.
//
// ===== EACH ONE RE-CHECKS THE SESSION =====
//
// The layout gates the *pages*. A Server Action is not a page — it is an
// endpoint anybody can post to with the right action id, and the layout that
// rendered the form is not in the call stack. An action that trusts the gate
// above it is an action that a brand or an owner can call for somebody else's
// portal by changing one string.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "../../../../lib/db/index.ts";
import { serverPortalAccess } from "../../../../lib/portal/session.ts";
import {
  mayReAnnounce,
  mayEditProfile,
  mayRequestSpend,
  mayViewPortal,
} from "../../../../lib/portal/permissions.ts";
import {
  reAnnounce,
  describeCommunity,
  buildCommunityChallenge,
  payCommunityChallenge,
  setPayoutPreference,
  setOwnerContact,
  CommunityBuilderRefused,
} from "../../../../lib/portal/owner.ts";
import { weekFor, weekStartPlus } from "../../../../lib/challenges/week.ts";
import { threadFor, postMessage } from "../../../../lib/messages/threads.ts";
import type { CommunityTier } from "../../../../lib/money/amounts.ts";

/**
 * Re-check the guild permission, per action, and against the *right* capability.
 *
 * The layout gates the pages. A Server Action is an endpoint, and the layout
 * that rendered the form is not in its call stack — so every action asks
 * again, and asks the specific question rather than "are they in the portal":
 * an administrator may re-announce and may not approve a spend.
 */
async function guard(
  guildId: string,
  may: (access: Awaited<ReturnType<typeof serverPortalAccess>>) => boolean,
): Promise<void> {
  const access = await serverPortalAccess(guildId);
  if (!may(access)) {
    throw new Error("That is not something your access on this server allows.");
  }
}

/** Refusals are shown, not thrown at the user. Anything else is a real bug. */
async function attempt(fn: () => Promise<unknown>): Promise<{ error?: string }> {
  try {
    await fn();
    return {};
  } catch (e) {
    if (e instanceof CommunityBuilderRefused) return { error: e.message };
    throw e;
  }
}

/**
 * Re-announce, and say what happened in the URL.
 *
 * A redirect rather than a returned value because the result has to survive a
 * full page render — S9's refusal (*"tell your admin to reinstall Cluster"*)
 * is the whole point of this button existing on a portal that outlives the
 * bot, and a message that needs client state to be visible is a message that
 * is missing from the screenshot record.
 */
export async function reAnnounceAction(form: FormData): Promise<void> {
  const guildId = String(form.get("guildId"));
  await guard(guildId, mayReAnnounce);
  const ids = form.getAll("challengeId").map(String).filter(Boolean);
  const result = await reAnnounce(await getDb(), guildId, ids);
  revalidatePath(`/portal/server/${guildId}/challenges`);

  const query = result.error
    ? `?error=${encodeURIComponent(result.error)}`
    : `?queued=${result.queued}`;
  redirect(`/portal/server/${guildId}/challenges${query}`);
}

/**
 * The six-field server profile (12 §5).
 *
 * Every field is submitted together and each is optional, so the owner can
 * answer what they know and come back — the completeness bar is what tells
 * them how far they have got, and a form that refused a partial save would
 * make a six-field gate feel like one question with six parts.
 *
 * Only fields actually present on the form are passed through, so a page that
 * renders a subset of them cannot blank the rest.
 */
export async function describeCommunityAction(form: FormData): Promise<void> {
  const guildId = String(form.get("guildId"));
  await guard(guildId, mayEditProfile);

  const text = (key: string) =>
    form.has(key) ? { [key]: String(form.get(key) ?? "") } : {};

  const result = await attempt(async () =>
    describeCommunity(await getDb(), guildId, {
      ...text("community"),
      ...text("memberAgeRange"),
      ...text("inviteUrl"),
      ...text("coverImageUrl"),
      ...text("announceChannelId"),
      ...(form.has("gamesPlayed")
        ? {
            gamesPlayed: form
              .getAll("gamesPlayed")
              .map(String)
              .flatMap((g) => g.split(",").map((s) => s.trim()))
              .filter(Boolean),
          }
        : {}),
    }),
  );
  revalidatePath(`/portal/server/${guildId}`);
  redirect(
    `/portal/server/${guildId}/settings` +
      (result.error ? `?error=${encodeURIComponent(result.error)}` : "?saved=1"),
  );
}

export async function saveSettingsAction(form: FormData): Promise<void> {
  const guildId = String(form.get("guildId"));
  await guard(guildId, mayEditProfile);
  const db = await getDb();

  const result = await attempt(async () => {
    await setOwnerContact(db, guildId, {
      contactName: String(form.get("contactName") ?? ""),
      contactEmail: String(form.get("contactEmail") ?? ""),
      adminRoleId: String(form.get("adminRoleId") ?? ""),
    });
    const preference = String(form.get("payoutPreference") ?? "");
    if (preference) {
      await setPayoutPreference(db, guildId, {
        preference,
        handle: String(form.get("payoutHandle") ?? ""),
      });
    }
  });
  revalidatePath(`/portal/server/${guildId}/settings`);
  redirect(
    `/portal/server/${guildId}/settings` +
      (result.error ? `?error=${encodeURIComponent(result.error)}` : "?saved=1"),
  );
}

export async function buildCommunityAction(form: FormData): Promise<void> {
  const guildId = String(form.get("guildId"));
  // P6/12 §6 — an administrator may REQUEST. Approving the spend is the
  // owner's, and that check lives on the approve action, not this one.
  await guard(guildId, mayRequestSpend);
  const db = await getDb();
  // The tier arrives as a string and is only a tier if `COMMUNITY_TIERS` says
  // so. `buildCommunityChallenge` refuses anything else with a message — the
  // cast here would otherwise let "3" through as though it were a real tier.
  const tier = Number(form.get("tier")) as CommunityTier;

  let challengeId = "";
  const result = await attempt(async () => {
    // C2/L6 — there is no date picker, for anyone. What an owner chooses is a
    // week, and the earliest one is the next one: this week has started.
    const startAt = weekStartPlus(weekFor(new Date()).nextStart, 0);
    const built = await buildCommunityChallenge(db, {
      guildId,
      title: String(form.get("title") ?? "").trim() || "Community challenge",
      game: String(form.get("game") ?? ""),
      provider: String(form.get("game") ?? ""),
      tier,
      startAt,
    });
    challengeId = built.challengeId;
    // M22/C1 — owner money routes to the prize vault and Cluster only, and it
    // is `markPaid`'s `communityTier` that does it. Paying here rather than in
    // a webhook is the demo's shortcut, not a rule: the routing is the same
    // call either way.
    await payCommunityChallenge(db, built.challengeId, tier);
  });

  revalidatePath(`/portal/server/${guildId}/community`);
  redirect(
    `/portal/server/${guildId}/community` +
      (result.error ? `?error=${encodeURIComponent(result.error)}` : `?built=${challengeId}`),
  );
}

/** H5 — the owner's side of the conversation. Any manager may write. */
export async function sendServerMessageAction(form: FormData): Promise<void> {
  const guildId = String(form.get("guildId"));
  await guard(guildId, mayViewPortal);
  const db = await getDb();
  const threadId = await threadFor(db, { side: "server", guildId });
  const body = String(form.get("body") ?? "");
  if (body.trim()) {
    await postMessage(db, { threadId, authorKind: "server", authorId: guildId, body });
  }
  revalidatePath(`/portal/server/${guildId}/messages`);
  redirect(`/portal/server/${guildId}/messages`);
}
