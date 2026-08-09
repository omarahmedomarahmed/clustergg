"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { registerGlobalCommands, registerGuildCommands, ensureChannel } from "@/lib/discord/rest";
import { ALL_COMMANDS } from "@/lib/discord/commands";
import { clearCatalog } from "@/lib/discord/catalog";
import { discordConfigured, CLUSTER_CHANNEL } from "@/lib/discord/config";
import { postGuides, onboardGuild } from "@/lib/discord/onboard";
import { broadcastToGuilds, announceChallengeLaunched, announceChallengeReminder } from "@/lib/discord/announce";
import { JOBS, runJob, type JobKey } from "@/lib/jobs";
import { postAdsToGuilds } from "@/lib/discord/ads";
import { runHqSetup } from "@/lib/discord/hq";
import { setContent } from "@/lib/cms";
import { ensurePortal, rotatePortalKey } from "@/lib/server-portal";
import { dmUser } from "@/lib/discord/rest";
import { canAct, siteUrl } from "@/lib/discord/config";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

// Everything the bot needs operationally, as buttons in Mission Control rather
// than curl commands. Staff run this from a browser; nobody should need a
// terminal to operate the platform.

export type BotActionState = { ok?: string; error?: string } | undefined;

export async function registerCommands(_prev: BotActionState, formData: FormData): Promise<BotActionState> {
  await requireAdmin();
  if (!discordConfigured()) return { error: "Discord isn't configured on this deployment yet." };

  const guildId = String(formData.get("guildId") ?? "").trim();
  const res = guildId
    ? await registerGuildCommands(guildId, ALL_COMMANDS)
    : await registerGlobalCommands(ALL_COMMANDS);
  clearCatalog();

  if (!res.ok) return { error: `Discord rejected the registration (${res.status}): ${res.error.slice(0, 300)}` };
  revalidatePath("/admin/discord");
  return {
    ok: guildId
      ? `/cluster is registered in server ${guildId} — it works there immediately.`
      : "/cluster is registered globally. Discord can take up to an hour to show it everywhere; register to a single server for instant testing.",
  };
}

// Re-post and re-pin the how-to guides in a server — used after staff edit a
// guide, or when an install partly failed.
export async function repostGuides(_prev: BotActionState, formData: FormData): Promise<BotActionState> {
  await requireAdmin();
  if (!discordConfigured()) return { error: "Discord isn't configured on this deployment yet." };

  const guildId = String(formData.get("guildId") ?? "").trim();
  if (!guildId) return { error: "Enter the server ID to post into." };

  const channel = await ensureChannel(guildId, CLUSTER_CHANNEL);
  if (!channel) return { error: `Couldn't find or create #${CLUSTER_CHANNEL}. The bot most likely lacks the Manage Channels permission in that server.` };

  const { posted, pinned } = await postGuides(channel.id);
  if (posted === 0) return { error: "Couldn't post — check the bot can send messages in that server." };
  if (pinned < posted) {
    return { ok: `Posted ${posted} guides but only pinned ${pinned}. The bot is missing the Manage Messages permission — re-invite it from the Discord bot page.` };
  }
  return { ok: `Posted and pinned ${posted} guides in #${CLUSTER_CHANNEL}.` };
}

// Run a maintenance job on demand. Vercel's Hobby plan only allows a daily
// cron, so these buttons are how staff get a job done *now* rather than
// tomorrow — and they're the same code the cron runs.
export async function runJobNow(_prev: BotActionState, formData: FormData): Promise<BotActionState> {
  await requireAdmin();
  const key = String(formData.get("job") ?? "") as JobKey;
  if (!JOBS.some((j) => j.key === key)) return { error: "Unknown job." };
  const res = await runJob(key);
  revalidatePath("/admin/discord");
  revalidatePath("/admin/challenges");
  return res.ok ? { ok: res.summary } : { error: res.summary };
}

// Send a message to every server with the bot, or to a chosen few.
export async function broadcast(_prev: BotActionState, formData: FormData): Promise<BotActionState> {
  await requireAdmin();
  if (!discordConfigured()) return { error: "Discord isn't configured on this deployment yet." };

  const message = String(formData.get("message") ?? "").trim();
  if (!message) return { error: "Write a message first." };
  if (message.length > 1900) return { error: "Discord caps a message at 2000 characters." };

  const only = String(formData.get("guildIds") ?? "")
    .split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);

  const res = await broadcastToGuilds(message, only.length ? only : undefined);
  if (!res.queued) {
    return { error: res.targets === 0 ? "No servers to send to yet." : "Couldn't queue it — check the bot can post in their channels." };
  }
  // Queued, not sent (B33). A broadcast is the worst case for the old inline
  // loop — staff send those to everybody by definition — and claiming delivery
  // at the moment of the click is a number we cannot have yet.
  return {
    ok: `Queued for ${res.queued} of ${res.targets} server${res.targets === 1 ? "" : "s"}. `
      + "Delivery runs in the background; anything that fails shows above with the reason.",
  };
}

// Announce a challenge to Discord on demand. This is also how a server-gated
// challenge's entry key gets delivered — the owning server is told the key, and
// every other server is told the challenge exists.
export async function announceChallenge(_prev: BotActionState, formData: FormData): Promise<BotActionState> {
  await requireAdmin();
  if (!discordConfigured()) return { error: "Discord isn't configured on this deployment yet." };
  const id = String(formData.get("challengeId") ?? "").trim();
  if (!id) return { error: "Missing challenge." };
  // QUEUED, not reached (B33). The number this returns is how many servers the
  // announcement was queued for; delivery happens on /api/cron/announce over the
  // next few minutes. Saying "announced to 40 servers" the instant a button is
  // pressed is a claim we cannot possibly know yet, and it is exactly the claim
  // that made a killed fan-out look like a low-reach week.
  const queued = await announceChallengeLaunched(id);
  if (queued === 0) {
    // Not an error, but never silently a success either. Zero here has real
    // causes staff can act on — the challenge is still a draft, it's private
    // with no server attached, or the bot has no channel it can post in.
    return {
      error: "Nothing was queued. A draft is never announced — publish it first. If it's already live, check "
        + "it belongs to a server the bot can post in.",
    };
  }
  return {
    ok: `Queued for ${queued} ${queued === 1 ? "server" : "servers"}. `
      + "Delivery runs in the background — reach fills in over the next few minutes, and anything that fails "
      + "shows on this page with the reason. A server challenge also sends its entry key to the server it belongs to.",
  };
}

/**
 * Tell the servers a challenge is coming. B90.3.
 *
 * The rung between paid and running, and the point in the ladder where reach
 * starts being counted. Separate from `announceChallenge` on purpose: that one
 * says a challenge IS live and refuses a draft, this one says one is COMING and
 * refuses anything already running. Merging them into "announce, whatever state
 * it is in" is how a server gets told about a competition that finished
 * yesterday.
 */
export async function announceUpcoming(_prev: BotActionState, formData: FormData): Promise<BotActionState> {
  await requireAdmin();
  if (!discordConfigured()) return { error: "Discord isn't configured on this deployment yet." };
  const id = String(formData.get("challengeId") ?? "").trim();
  if (!id) return { error: "Missing challenge." };

  const { announceChallengeUpcoming } = await import("@/lib/discord/announce");
  const res = await announceChallengeUpcoming(id);
  if (!res.ok) {
    const why: Record<string, string> = {
      not_paid: "Nothing is announced before its bill is paid. The challenge page shows who owes it "
        + "and which invoice — a challenge announced on nobody's money pays its prizes out of the prize "
        + "vault, which is other brands'.",
      not_queued: "Only a challenge that is paid, dated and has not started can be announced ahead. "
        + "A draft has nothing to announce; one that is already live has been announced.",
      reached_nobody: "It reached no server, so nothing was marked announced — check the bot can post "
        + "somewhere, and try again.",
      private_without_a_server: "It is private and belongs to no server, so there is nobody to tell.",
      unknown_challenge: "That challenge no longer exists.",
      bot_not_configured: "Discord isn't configured on this deployment yet.",
      no_card: "Its card would not render, and an announcement without one is a wall of text.",
    };
    return { error: why[res.reason ?? ""] ?? "It could not be announced." };
  }
  return {
    ok: `Queued for ${res.reached} ${res.reached === 1 ? "server" : "servers"}. `
      + "It is marked announced from now, which is when reach starts counting for it.",
  };
}

/**
 * Nudge a challenge again, by hand.
 *
 * The daily job reminds every live challenge once. This is the other case: a
 * challenge that needs a push today, or all of them at once before a weekend —
 * to every server, or to a chosen few.
 *
 * Private challenges are narrowed to the servers that own them inside
 * `announceChallengeReminder`, not here: a server picker that could leak one is
 * a picker someone will eventually use by accident.
 */
export async function remindChallenges(_prev: BotActionState, formData: FormData): Promise<BotActionState> {
  await requireAdmin();
  if (!discordConfigured()) return { error: "Discord isn't configured on this deployment yet." };

  const which = String(formData.get("challengeId") ?? "").trim();
  const only = formData.getAll("guildIds").map(String).map((g) => g.trim()).filter(Boolean);

  const db = await getDb();
  const ids = which && which !== "all"
    ? [which]
    : (await db.select({ id: schema.challenges.id }).from(schema.challenges)
        .where(eq(schema.challenges.status, "active"))).map((c) => c.id);

  if (!ids.length) return { error: "No challenge is running." };

  const done: string[] = [];
  const skipped: string[] = [];
  for (const id of ids) {
    const res = await announceChallengeReminder(id, { only: only.length ? only : undefined, manual: true });
    if (res.ok) done.push(id); else skipped.push(res.reason ?? "unknown");
  }
  revalidatePath("/admin/discord/broadcast");
  if (!done.length) {
    return { error: `Nothing sent — ${skipped[0] === "already_ended" ? "it has already ended" : skipped[0] === "not_running" ? "it isn't running" : skipped[0] ?? "no reason given"}.` };
  }
  return {
    ok: `Reminded ${done.length} challenge${done.length === 1 ? "" : "s"}`
      + (only.length ? ` in ${only.length} chosen server${only.length === 1 ? "" : "s"}` : " everywhere")
      + (skipped.length ? ` · ${skipped.length} skipped` : "") + ".",
  };
}

/** Re-send the Profile of the Week standings, to all servers or chosen ones. */
export async function sendWeekUpdate(_prev: BotActionState, formData: FormData): Promise<BotActionState> {
  await requireAdmin();
  if (!discordConfigured()) return { error: "Discord isn't configured on this deployment yet." };
  const only = formData.getAll("guildIds").map(String).map((g) => g.trim()).filter(Boolean);
  const { postWeekUpdate } = await import("@/lib/discord/week-feed");
  // Forced: the daily post is once-per-server-per-day, and an admin pressing
  // this button has already decided today's should go out again.
  const res = await postWeekUpdate({ guildIds: only.length ? only : undefined, force: true });
  revalidatePath("/admin/discord/broadcast");
  if (!res.considered) return { error: "No server has the bot with announcements on yet." };
  if (!res.posted) return { error: `Nothing sent — all ${res.considered} skipped. The bot may not be able to post in their channels.` };
  return { ok: `Posted the weekly standings into ${res.posted} of ${res.considered} server${res.considered === 1 ? "" : "s"}.` };
}

// Send one ad creative into Discord servers on demand.
//
// The cron picks a creative by rotation and respects the one-ad-per-interval
// rule. This is the other case: staff sending a SPECIFIC creative to specific
// servers because a brand asked for it — so it takes both overrides.
export async function broadcastAd(_prev: BotActionState, formData: FormData): Promise<BotActionState> {
  await requireAdmin();
  if (!discordConfigured()) return { error: "Discord isn't configured on this deployment yet." };

  const campaignCreativeId = String(formData.get("campaignCreativeId") ?? "").trim();
  const guildIds = formData.getAll("guildIds").map(String).map((g) => g.trim()).filter(Boolean);
  const force = formData.get("force") === "on";

  const res = await postAdsToGuilds({
    campaignCreativeId: campaignCreativeId || undefined,
    guildIds: guildIds.length ? guildIds : undefined,
    force,
  });

  if (!res.considered) {
    return { error: "No eligible servers. A server receives ads once it has unlocked revenue share and opted in." };
  }
  if (!res.posted) {
    return {
      error: res.skipped
        ? `Nothing sent — ${res.skipped} server${res.skipped === 1 ? "" : "s"} skipped (already had an ad recently, or the bot can't post there). Tick "send anyway" to override the interval.`
        : "Nothing sent — no creative was available for the Discord placement.",
    };
  }
  revalidatePath("/admin/discord/broadcast");
  return { ok: `Posted to ${res.posted} of ${res.considered} server${res.considered === 1 ? "" : "s"}.` };
}

// ===== HQ: our own server =====

export async function saveHqServer(_prev: BotActionState, formData: FormData): Promise<BotActionState> {
  await requireAdmin();
  const id = String(formData.get("guildId") ?? "").trim();
  if (id && !/^\d{15,25}$/.test(id)) {
    return { error: "That doesn't look like a Discord server id — it should be 17-20 digits. Turn on Developer Mode, right-click your server, Copy Server ID." };
  }
  await setContent("discord.hq.guildId", id);

  // The public invite, saved alongside the id it belongs to.
  //
  // Not minted by the bot: a permanent invite is something a person creates in
  // Discord with an expiry they chose, and generating one here would quietly
  // put a link with an unknown lifetime on every card in the product. Accepts
  // a full link or a bare code, and stores whatever was typed.
  if (formData.has("invite")) {
    const raw = String(formData.get("invite") ?? "").trim();
    if (raw && !/^(https?:\/\/)?(discord\.gg\/|discord\.com\/invite\/)?[A-Za-z0-9-]{2,}$/.test(raw)) {
      return { error: "That doesn't look like a Discord invite. Paste the link (discord.gg/xxxx) or just the code." };
    }
    await setContent("discord.hq.invite", raw);
  }

  revalidatePath("/admin/discord/hq");
  return {
    ok: id
      ? "Saved. Review the plan below, then build it — nothing is created until you press the button."
      : "HQ server cleared.",
  };
}

// Build our server. Creates only what's missing, and records which server was
// built so it can't run twice on the same one.
export async function buildHqServer(_prev: BotActionState, formData: FormData): Promise<BotActionState> {
  await requireAdmin();
  const force = formData.get("force") === "on";
  const res = await runHqSetup(force);
  if (!res.ok) return { error: res.reason ?? "Couldn't build HQ." };
  revalidatePath("/admin/discord/hq");
  if (!res.created && res.reason) return { ok: res.reason };
  return {
    ok: `Built ${res.created} channel${res.created === 1 ? "" : "s"}, pinned ${res.pinned} starter${res.pinned === 1 ? "" : "s"}, left ${res.skipped} that already existed.`,
  };
}

// Run the full install flow by hand, for a server that already has the bot.
export async function runOnboarding(_prev: BotActionState, formData: FormData): Promise<BotActionState> {
  await requireAdmin();
  if (!discordConfigured()) return { error: "Discord isn't configured on this deployment yet." };

  const guildId = String(formData.get("guildId") ?? "").trim();
  if (!guildId) return { error: "Enter the server ID." };

  const res = await onboardGuild(guildId);
  if (!res.ok) return { error: `Onboarding failed: ${res.reason ?? "unknown"}` };
  revalidatePath("/admin/discord");
  return { ok: `Set up #${CLUSTER_CHANNEL} — ${res.posted} guides posted, ${res.pinned} pinned.` };
}

// ===== Server portals =====
//
// A server owner's portal key opens their whole dashboard — growth numbers,
// challenges, traffic, every member's progress. So staff need three things we
// didn't have a UI for: see whether a server has a portal at all, hand the
// owner a fresh key when the old one leaks, and turn announcements or ad
// delivery off for a server that's misbehaving.
//
// The key is shown ONCE, here, to the admin who rotated it. It is never posted
// into a channel — the bot DMs the owner instead.

export async function resetPortalKey(_prev: BotActionState, formData: FormData): Promise<BotActionState> {
  await requireAdmin();
  const guildId = String(formData.get("guildId") ?? "").trim();
  if (!guildId) return { error: "No server." };

  // A server that never had a portal gets one; one that has a key gets a new
  // one. Both end with the owner holding a key nobody else has seen.
  const existing = await ensurePortal(guildId);
  if (!existing) return { error: "No such server." };
  const key = await rotatePortalKey(guildId);
  if (!key) return { error: "Couldn't rotate that key." };

  revalidatePath(`/admin/discord/${guildId}`);
  return {
    ok: `New key: ${key} — copy it now, it isn't shown again. The old key stopped working immediately.`,
  };
}

// DM the owner their portal link and key, so staff never have to paste a key
// into a channel to get it to them.
export async function dmPortalKey(_prev: BotActionState, formData: FormData): Promise<BotActionState> {
  await requireAdmin();
  const guildId = String(formData.get("guildId") ?? "").trim();
  if (!guildId) return { error: "No server." };
  if (!canAct()) return { error: "DISCORD_BOT_TOKEN isn't set, so the bot can't DM anyone." };

  const db = await getDb();
  const [row] = await db.select().from(schema.discordGuilds)
    .where(eq(schema.discordGuilds.guildId, guildId)).limit(1);
  if (!row?.ownerDiscordId) return { error: "We don't know who owns that server." };

  const portal = await ensurePortal(guildId);
  if (!portal) return { error: "Couldn't build that server's portal." };

  const sent = await dmUser(row.ownerDiscordId, {
    embeds: [{
      title: "Your Cluster server portal",
      description: [
        `${siteUrl()}/servers/${portal.slug}`,
        "",
        `Portal key: **\`${portal.key}\`**`,
        "",
        "Keep this private — it opens your growth numbers, your challenges, the traffic we send you, and everything your members do with the bot.",
      ].join("\n"),
      color: 0x8b5cf6,
    }],
  }).catch(() => false);

  return sent
    ? { ok: "Sent to the owner's DMs." }
    : { error: "Discord refused the DM — the owner has direct messages from server members turned off." };
}

// Per-server switches. Announcements and ad delivery are the two things a
// server can reasonably want off, and until now the only way to stop either was
// to remove the bot.
export async function setGuildFlags(_prev: BotActionState, formData: FormData): Promise<BotActionState> {
  await requireAdmin();
  const guildId = String(formData.get("guildId") ?? "").trim();
  if (!guildId) return { error: "No server." };

  const db = await getDb();
  await db.update(schema.discordGuilds).set({
    announcementsEnabled: formData.get("announcements") === "on",
    adOptIn: formData.get("ads") === "on",
  }).where(eq(schema.discordGuilds.guildId, guildId));

  revalidatePath(`/admin/discord/${guildId}`);
  return { ok: "Saved." };
}

// Force the revenue unlock for a server that earned it another way — an agreed
// partnership, a migration, a fix after a miscount. Recorded as a real unlock
// so every downstream check behaves identically.
export async function forceUnlock(_prev: BotActionState, formData: FormData): Promise<BotActionState> {
  await requireAdmin();
  const guildId = String(formData.get("guildId") ?? "").trim();
  const on = formData.get("unlock") === "on";
  if (!guildId) return { error: "No server." };

  const db = await getDb();
  await db.update(schema.discordGuilds)
    .set({ adUnlockedAt: on ? new Date() : null })
    .where(eq(schema.discordGuilds.guildId, guildId));

  revalidatePath(`/admin/discord/${guildId}`);
  return { ok: on ? "Revenue share unlocked for this server." : "Revenue share locked again." };
}
