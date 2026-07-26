import { CLUSTER_CHANNEL, siteUrl, canAct } from "@/lib/discord/config";
import { ensureChannel, postMessage, pinMessage, dmUser, getGuild, guildIconUrl, type Guild } from "@/lib/discord/rest";
import { allGuideTopics } from "@/lib/cards/guides";
import { cardRef, embedColor } from "@/lib/discord/cards";
import { frame, navButton, linkButton, rows } from "@/lib/discord/components";
import { ButtonStyle } from "@/lib/discord/types";
import { upsertGuild, getGuildRow, unlockThreshold } from "@/lib/discord/guilds";
import { ensurePortal } from "@/lib/server-portal";
import { reportToHq } from "@/lib/discord/hq";

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

  // Record the install so the server appears in admin and starts accruing
  // attribution from its very first member.
  await upsertGuild(guildId, { channelId: channel.id, ...(ownerDiscordId ? { ownerDiscordId } : {}) });

  const owner = ownerDiscordId ?? (await getGuildRow(guildId))?.ownerDiscordId ?? null;
  if (owner) await welcomeOwner(owner, guildId, channel.id);

  // Tell HQ. A new server is the single most important thing that happens to
  // this business, and we shouldn't learn about it by refreshing a dashboard.
  const row = await getGuildRow(guildId);
  void reportToHq({
    type: "install",
    guildId,
    guildName: row?.name || guildId,
    members: row?.memberCount ?? 0,
  }).catch(() => {});

  return { ok: true, channelId: channel.id, posted: guide.posted, pinned: guide.pinned };
}

// Post + pin every how-to guide. Guides are rendered once globally and cached,
// so the tenth server to install the bot reuses the same nine PNGs.
export async function postGuides(channelId: string): Promise<{ posted: number; pinned: number }> {
  let posted = 0;
  let pinned = 0;

  const intro = await postMessage(channelId, {
    content: "**Welcome to Cluster.** Everything you need is pinned right here — one guide per topic. Type `/cluster` any time.",
    components: rows([
      navButton("START HERE", frame("planets"), [frame("home")], ButtonStyle.Primary, "🚀"),
      navButton("Link a game account", frame("link", ""), [frame("home")], ButtonStyle.Success, "🎮"),
    ]),
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
      // A pinned guide is read months after it was posted, by someone who has
      // never typed a slash command. So every one of them carries the two
      // buttons that actually start the funnel: pick a game, link an account.
      components: rows([
        navButton("START HERE", frame("planets"), [frame("home")], ButtonStyle.Primary, "🚀"),
        navButton("Link a game account", frame("link", ""), [frame("home")], ButtonStyle.Success, "🎮"),
        navButton("Open in bot", frame("guide", t.topic), [frame("home")], ButtonStyle.Secondary, "📖"),
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
  const threshold = await unlockThreshold();
  // Their own dashboard, and the key that opens it. This is the ONLY place the
  // key is delivered, which is what makes a DM to the server owner the proof of
  // ownership — nobody else ever sees it.
  const portal = await ensurePortal(guildId);
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
        `Run \`/cluster server\` any time to see how many of your members have joined Cluster and linked a game. At **${threshold.toLocaleString()} linked gamers your server unlocks ad revenue share** — you earn from every ad Cluster runs in your community.`,
        "",
        "**How to get there fastest**",
        "Run `/cluster admin` and request a challenge for your community. You pick the game, the length, the prize and the trophies; we review it, then post it here with an entry key only your server has. Your members link a game to enter — which is exactly the number that unlocks your revenue share.",
        "",
        "The challenge itself is public on Cluster: everyone can see your standings, your trophies and your server — but only people with your key can enter. That puts your community in front of our whole audience.",
        ...(portal ? [
          "",
          "**Your server portal**",
          `${siteUrl()}/servers/${portal.slug}`,
          `Portal key: **\`${portal.key}\`** — keep this private. It opens your growth numbers, your challenges, the traffic we send you, and what your members do with the bot.`,
        ] : []),
      ].join("\n"),
      color: embedColor("#8b5cf6"),
    }],
    components: rows([
      navButton("Request a challenge", frame("admin", ""), [frame("home")], ButtonStyle.Primary, "🏆"),
      ...(portal ? [linkButton("Open your portal", `${siteUrl()}/servers/${portal.slug}?key=${encodeURIComponent(portal.key)}`, "🛰")] : []),
      navButton("Your growth so far", frame("server"), [frame("home")], ButtonStyle.Secondary, "📈"),
      linkButton("Server owner guide", `${siteUrl()}/discord-bot`, "📖"),
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
