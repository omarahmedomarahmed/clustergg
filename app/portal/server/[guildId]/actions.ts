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

import { getProvider } from "../../../../lib/providers/registry.ts";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "../../../../lib/db/index.ts";
import { serverPortalAccess } from "../../../../lib/portal/session.ts";
import {
  mayReAnnounce,
  mayEditProfile,
  mayRequestSpend,
  mayViewPortal,
  mayApproveSpend,
  identityOf,
} from "../../../../lib/portal/permissions.ts";
import {
  reAnnounce,
  describeCommunity,
  payCommunityChallenge,
  setPayoutPreference,
  setOwnerContact,
  CommunityBuilderRefused,
} from "../../../../lib/portal/owner.ts";
import { weekFor, weekStartPlus } from "../../../../lib/challenges/week.ts";
import { threadFor, postMessage } from "../../../../lib/messages/threads.ts";
import {
  requestCommunitySpend,
  approveCommunitySpend,
  rejectCommunitySpend,
  SpendRefused,
} from "../../../../lib/portal/spend.ts";
import {
  grantAnalytics,
  refreshSnapshot,
  AnalyticsRefused,
} from "../../../../lib/analytics/consent.ts";
import { linkedMembersOf } from "../../../../lib/pool/eligibility.ts";
import { schema } from "../../../../lib/db/index.ts";
import { eq as eqSql } from "drizzle-orm";
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

/**
 * ===== AN ADMINISTRATOR REQUESTS. THEY DO NOT SPEND. =====
 *
 * This action used to build **and pay** the challenge, gated on
 * `mayRequestSpend` — which an administrator passes. So an administrator could
 * move the guild's money, which is exactly what P1 forbids, and 12 §6's
 * central row had no surface enforcing it: `lib/portal/spend.ts` existed and
 * nothing called it.
 *
 * Now it records a request and stops. Nothing is built, nothing is billed, and
 * the owner sees it waiting. Approving is `approveCommunityAction` below, and
 * it is a different gate.
 */
export async function requestCommunityAction(form: FormData): Promise<void> {
  const guildId = String(form.get("guildId"));
  await guard(guildId, mayRequestSpend);
  const access = await serverPortalAccess(guildId);
  const tier = Number(form.get("tier")) as CommunityTier;

  let error: string | undefined;
  try {
    await requestCommunitySpend(await getDb(), {
      guildId,
      access,
      tier,
      payload: {
        title: String(form.get("title") ?? "").trim() || "Community challenge",
        // The picker posts a PROVIDER ID. The game name is looked up from it
        // rather than stored as a second copy — writing the id into both
        // columns is what made a League challenge read "riot-lol".
        game: getProvider(String(form.get("game") ?? ""))?.game ?? "",
        provider: String(form.get("game") ?? ""),
        // C2/L6 — there is no date picker, for anyone. What is chosen is a
        // week, and the earliest is the next one: this week has started.
        startAt: weekStartPlus(weekFor(new Date()).nextStart, 0).toISOString(),
      },
    });
  } catch (e) {
    if (!(e instanceof SpendRefused)) throw e;
    error = e.message;
  }

  revalidatePath(`/portal/server/${guildId}/community`);
  redirect(
    `/portal/server/${guildId}/community` +
      (error ? `?error=${encodeURIComponent(error)}` : "?requested=1"),
  );
}

/**
 * The guild owner answers. **Only they can** (P1), and this is where the money
 * moves — the challenge is built and billed on approval, never before.
 */
export async function approveCommunityAction(form: FormData): Promise<void> {
  const guildId = String(form.get("guildId"));
  const requestId = String(form.get("requestId"));
  // Deliberately NOT `guard(..., mayApproveSpend)` and then a second check
  // inside: `approveCommunitySpend` re-derives it from the access it is
  // handed, so the authority and the identity written into `approvedBy`
  // arrive together. This gate is here so the refusal is a page, not a throw.
  await guard(guildId, mayApproveSpend);
  const access = await serverPortalAccess(guildId);
  const db = await getDb();

  let error: string | undefined;
  try {
    const built = await approveCommunitySpend(db, { requestId, access });
    const [request] = await db
      .select()
      .from(schema.spendRequests)
      .where(eqSql(schema.spendRequests.id, requestId));
    // M22/C1 — owner money routes to the prize vault and Cluster only, and it
    // is `markPaid`'s `communityTier` that does it.
    await payCommunityChallenge(db, built.challengeId, (request?.tier ?? 1) as CommunityTier);
  } catch (e) {
    if (!(e instanceof SpendRefused)) throw e;
    error = e.message;
  }

  revalidatePath(`/portal/server/${guildId}/community`);
  redirect(
    `/portal/server/${guildId}/community` +
      (error ? `?error=${encodeURIComponent(error)}` : "?approved=1"),
  );
}

export async function rejectCommunityAction(form: FormData): Promise<void> {
  const guildId = String(form.get("guildId"));
  await guard(guildId, mayApproveSpend);
  const access = await serverPortalAccess(guildId);
  let error: string | undefined;
  try {
    await rejectCommunitySpend(await getDb(), {
      requestId: String(form.get("requestId")),
      access,
      reason: String(form.get("reason") ?? "").trim() || undefined,
    });
  } catch (e) {
    if (!(e instanceof SpendRefused)) throw e;
    error = e.message;
  }
  revalidatePath(`/portal/server/${guildId}/community`);
  redirect(
    `/portal/server/${guildId}/community` +
      (error ? `?error=${encodeURIComponent(error)}` : "?rejected=1"),
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

/**
 * 12 §7a — the grant, and the refresh.
 *
 * Both are `mayEditProfile`, not `mayApproveSpend`: analytics is not money.
 * An administrator who runs the server day to day is exactly who turns this
 * on, and gating it on the owner would leave the tab dead on most servers.
 */
export async function grantAnalyticsAction(form: FormData): Promise<void> {
  const guildId = String(form.get("guildId"));
  await guard(guildId, mayEditProfile);
  const access = await serverPortalAccess(guildId);
  await grantAnalytics(await getDb(), { guildId, grantedBy: identityOf(access) });
  revalidatePath(`/portal/server/${guildId}/analytics`);
  redirect(`/portal/server/${guildId}/analytics`);
}

export async function refreshAnalyticsAction(form: FormData): Promise<void> {
  const guildId = String(form.get("guildId"));
  await guard(guildId, mayEditProfile);
  const db = await getDb();
  const access = await serverPortalAccess(guildId);

  try {
    await refreshSnapshot(db, {
      guildId,
      takenBy: identityOf(access),
      // The reader is injected, so this is the one place the member list is
      // ever asked for — and on a deployment with no bot token it degrades to
      // a reading of what we already know rather than throwing on a page.
      read: async () => {
        const [guild] = await db
          .select()
          .from(schema.guilds)
          .where(eqSql(schema.guilds.guildId, guildId));
        return {
          memberCount: guild?.memberCount ?? 0,
          linkedCount: await linkedMembersOf(db, guildId),
        };
      },
    });
  } catch (e) {
    if (!(e instanceof AnalyticsRefused)) throw e;
    // A cooldown or the ceiling. The page reads the same state and says so —
    // rendering the refusal twice would be two wordings of one rule.
  }
  revalidatePath(`/portal/server/${guildId}/analytics`);
  redirect(`/portal/server/${guildId}/analytics`);
}
