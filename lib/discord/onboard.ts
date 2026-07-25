import { CLUSTER_CHANNEL, siteUrl, canAct } from "@/lib/discord/config";
import { ensureChannel, postMessage, pinMessage, dmUser, getGuild, guildIconUrl, type Guild } from "@/lib/discord/rest";
import { allGuideTopics } from "@/lib/cards/guides";
import { cardRef, embedColor } from "@/lib/discord/cards";
import { frame, navButton, linkButton, rows } from "@/lib/discord/components";
import { ButtonStyle } from "@/lib/discord/types";

// What happens the moment a server owner adds the bot.
//
// This is the entire first impression, so it is deliberately generous: create
// #ClusterGG, post a glorified PNG how-to guide for every topic AND every
// quest, pin them all so they stay at the top of the channel forever, then DM
// the owner with what they just unlocked. No further setup, no configuration
// wizard, nothing for the owner to do.

const TOPIC = "Every game, one identity. Link your accounts, earn Cluster Points, win real trophies. Type /cluster";

export type OnboardResult = {
  ok: boolean;
  channelId?: string;
  posted: number;
  pinned: number;
  reason?: string;
};

export async function onboardGuild(guildId: string, ownerDiscordId?: string): Promise<OnboardResult> {
  if (!canAct()) return { ok: false, posted: 0, pinned: 0, reason: "discord_not_configured" };

  const channel = await ensureChannel(guildId, CLUSTER_CHANNEL, TOPIC);
  if (!channel) {
    // Almost always a missing "Manage Channels" permission. Tell the owner how
    // to fix it rather than failing silently.
    if (ownerDiscordId) {
      await dmUser(ownerDiscordId, {
        content:
          `Thanks for adding Cluster! I couldn't create the **#${CLUSTER_CHANNEL}** channel — I'm missing the **Manage Channels** permission.\n\n` +
          `Either grant it and re-invite me, or create the channel yourself and run \`/cluster admin\` in it.`,
      });
    }
    return { ok: false, posted: 0, pinned: 0, reason: "no_channel" };
  }

  const guide = await postGuides(channel.id);

  if (ownerDiscordId) await welcomeOwner(ownerDiscordId, guildId, channel.id);

  return { ok: true, channelId: channel.id, posted: guide.posted, pinned: guide.pinned };
}

// Post + pin every how-to guide. Guides are rendered once globally and cached,
// so the tenth server to install the bot reuses the same nine PNGs.
export async function postGuides(channelId: string): Promise<{ posted: number; pinned: number }> {
  let posted = 0;
  let pinned = 0;

  const intro = await postMessage(channelId, {
    content: "**Welcome to Cluster.** Everything you need is pinned right here — one guide per topic. Type `/cluster` any time.",
  });
  if (intro.ok) {
    posted++;
    if (await pinMessage(channelId, intro.data.id).then((r) => r.ok)) pinned++;
  }

  const topics = await allGuideTopics();
  for (const t of topics) {
    const { url, data } = await cardRef("guide", { topic: t.topic });
    const res = await postMessage(channelId, {
      embeds: [{
        title: t.label,
        color: embedColor(data && "theme" in data ? data.theme.accent : null),
        image: { url },
      }],
      components: rows([
        navButton("Open in bot", frame("guide", t.topic), [frame("home")], ButtonStyle.Primary, "📖"),
        linkButton("Open Cluster", siteUrl(), "🔗"),
      ]),
    });
    if (!res.ok) continue;
    posted++;
    if (await pinMessage(channelId, res.data.id).then((r) => r.ok)) pinned++;
  }

  return { posted, pinned };
}

async function welcomeOwner(ownerDiscordId: string, guildId: string, channelId: string): Promise<void> {
  await dmUser(ownerDiscordId, {
    embeds: [{
      title: "Cluster is live in your server",
      description: [
        `I've created <#${channelId}> and pinned a how-to guide for every part of the platform.`,
        "",
        "**What your members get**",
        "One profile that carries every game they play, stats synced from official APIs, Cluster Points across four quests, and challenges with real trophies.",
        "",
        "**What you get**",
        "Run `/cluster server` any time to see how many of your members have joined Cluster and linked a game. At **500 linked gamers your server unlocks ad revenue share** — you earn from every ad Cluster runs in your community.",
        "",
        "You can also request **private, server-only challenges** that no other server can see.",
      ].join("\n"),
      color: embedColor("#8b5cf6"),
    }],
    components: rows([
      linkButton("Open Cluster", siteUrl(), "🔗"),
      linkButton("Server owner guide", `${siteUrl()}/discord-bot`, "📈"),
    ]),
  });
}

// Guild metadata used by the admin dashboards. Kept here so the install route
// and the analytics pages read it the same way.
export async function guildSummary(guildId: string): Promise<{ guild: Guild; iconUrl: string | null } | null> {
  const res = await getGuild(guildId);
  if (!res.ok) return null;
  return { guild: res.data, iconUrl: guildIconUrl(res.data) };
}
