"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { registerGlobalCommands, registerGuildCommands, ensureChannel } from "@/lib/discord/rest";
import { ALL_COMMANDS } from "@/lib/discord/commands";
import { clearCatalog } from "@/lib/discord/catalog";
import { discordConfigured, CLUSTER_CHANNEL } from "@/lib/discord/config";
import { postGuides, onboardGuild } from "@/lib/discord/onboard";

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
