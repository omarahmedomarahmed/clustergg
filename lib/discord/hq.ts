import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getContent, setContent } from "@/lib/cms";
import { canAct, siteUrl, CLUSTER_CHANNEL } from "@/lib/discord/config";
import {
  listChannels, createChannel, postMessage, pinMessage, sameChannelName,
  type Channel, type ChannelKind,
} from "@/lib/discord/rest";
import { frame, navButton, linkButton, rows } from "@/lib/discord/components";
import { ButtonStyle } from "@/lib/discord/types";
import { embedColor } from "@/lib/discord/cards";

// Our own Discord server — "HQ".
//
// Two jobs:
//   1. Build it. Point the bot at our server id and it creates the whole
//      structure: categories, text and voice channels, pinned starters with
//      working buttons. Once. Re-running is a no-op, and pointing it at a NEW
//      server runs once there.
//   2. Report to it. Anything worth knowing from any server — an install, a
//      challenge request, a tier unlock — lands in an HQ channel, so we don't
//      find out by refreshing the admin page.
//
// This creates real channels in a real server, which is the least reversible
// thing the bot does. So the plan is inspectable BEFORE it runs: `planHqSetup`
// reports exactly what would be created and what already exists, and nothing
// happens until someone presses the button.

const HQ_ID_KEY = "discord.hq.guildId";
const HQ_DONE_KEY = "discord.hq.setupFor";   // the guild id we've already built

export type PlannedChannel = {
  name: string;
  kind: ChannelKind;
  topic?: string;
  // A starter message pinned on creation, so a new channel is never empty.
  pin?: { title: string; body: string; buttons?: "start" | "link" | "portal" };
};

export type PlannedCategory = { name: string; channels: PlannedChannel[] };

// What our server looks like. Ordinary community structure first, then the
// things that only make sense because we run a bot.
export function hqBlueprint(games: string[]): PlannedCategory[] {
  const lfg = games.slice(0, 8).map<PlannedChannel>((g) => ({
    name: `lfg-${g.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    kind: "text",
    topic: `Looking for a group on ${g}. Post your rank, region and what you're after.`,
    pin: {
      title: `Find people to play ${g} with`,
      body: `Link your ${g} account and your rank shows on your Cluster profile — so "LFG" here comes with proof.`,
      buttons: "link",
    },
  }));

  return [
    {
      name: "START HERE",
      channels: [
        {
          name: "welcome", kind: "text",
          topic: "New here? Start with the pinned message.",
          pin: {
            title: "Welcome to Cluster",
            body: "Every game you play, one identity. Tap START HERE to pick your game, or link an account and your stats sync automatically from the official API.",
            buttons: "start",
          },
        },
        { name: "announcements", kind: "text", topic: "Platform news, new games, new challenges." },
        { name: "rules", kind: "text", topic: "Be decent. No spam, no slurs, no cheating. Staff decisions are final." },
      ],
    },
    {
      name: "COMMUNITY",
      channels: [
        { name: "general", kind: "text", topic: "Talk about anything." },
        { name: "introductions", kind: "text", topic: "Say hello. What do you play?" },
        {
          name: "best-profile", kind: "text",
          topic: "Show off your profile. Vote for the ones you like.",
          pin: {
            title: "Show your profile",
            body: "Customise your profile on the site, then run `/cluster share` here. Votes decide the Best Profile leaderboard.",
            buttons: "portal",
          },
        },
        {
          name: "stats-showoff", kind: "text",
          topic: "Big games, big ranks, big numbers.",
          pin: {
            title: "Post your run",
            body: "Run `/cluster show` and pick a game to render your live stats as a card, then share it here.",
            buttons: "start",
          },
        },
        { name: "clips", kind: "text", topic: "Your best moments." },
      ],
    },
    { name: "FIND A GAME", channels: lfg },
    {
      name: "COMPETE",
      channels: [
        {
          name: CLUSTER_CHANNEL, kind: "text",
          topic: "Challenges, leaderboards and everything the bot posts.",
          pin: {
            title: "Challenges run here",
            body: "Every live competition is announced in this channel. Join with one tap once you've linked the game's account.",
            buttons: "start",
          },
        },
        { name: "leaderboards", kind: "text", topic: "Who's on top, per game." },
        { name: "trophy-case", kind: "text", topic: "Winners and what they took home." },
      ],
    },
    {
      name: "SUPPORT",
      channels: [
        {
          name: "support", kind: "text",
          topic: "Something broken? Ask here.",
          pin: {
            title: "Need a hand?",
            body: "Describe what happened and which game account it involves. For account linking problems, the fastest fix is usually re-linking from your profile.",
            buttons: "portal",
          },
        },
        { name: "bug-reports", kind: "text", topic: "Tell us what broke and how to reproduce it." },
        { name: "feature-requests", kind: "text", topic: "What should Cluster do next?" },
      ],
    },
    {
      name: "VOICE",
      channels: [
        { name: "General", kind: "voice" },
        { name: "Squad 1", kind: "voice" },
        { name: "Squad 2", kind: "voice" },
        { name: "Squad 3", kind: "voice" },
        { name: "Support Room", kind: "voice" },
      ],
    },
  ];
}

// ===== Configuration =====

export async function hqGuildId(): Promise<string | null> {
  try {
    const c = await getContent([HQ_ID_KEY]);
    return (c[HQ_ID_KEY] || "").trim() || null;
  } catch { return null; }
}

async function hqSetupDoneFor(): Promise<string | null> {
  try {
    const c = await getContent([HQ_DONE_KEY]);
    return (c[HQ_DONE_KEY] || "").trim() || null;
  } catch { return null; }
}

// Has HQ already been built for the currently configured server?
export async function hqStatus(): Promise<{ guildId: string | null; setupDone: boolean; setupFor: string | null }> {
  const [guildId, setupFor] = await Promise.all([hqGuildId(), hqSetupDoneFor()]);
  return { guildId, setupFor, setupDone: !!guildId && guildId === setupFor };
}

// ===== The plan =====

export type PlanRow = { category: string; name: string; kind: ChannelKind; exists: boolean };
export type HqPlan = {
  ok: boolean;
  reason?: string;
  guildId: string | null;
  alreadySetUp: boolean;
  rows: PlanRow[];
  toCreate: number;
};

export async function planHqSetup(): Promise<HqPlan> {
  const { guildId, setupDone } = await hqStatus();
  const empty: HqPlan = { ok: false, guildId, alreadySetUp: setupDone, rows: [], toCreate: 0 };
  if (!guildId) return { ...empty, reason: "No HQ server id is set." };
  if (!canAct()) return { ...empty, reason: "DISCORD_BOT_TOKEN isn't set, so the bot can't inspect or build anything." };

  const existing = await listChannels(guildId);
  if (!existing.ok) {
    return { ...empty, reason: `Couldn't read that server's channels (${existing.status}). Is the bot in it?` };
  }

  const games = await activeGames();
  const rows: PlanRow[] = [];
  for (const cat of hqBlueprint(games)) {
    rows.push({ category: "", name: cat.name, kind: "category", exists: hasChannel(existing.data, cat.name, "category") });
    for (const ch of cat.channels) {
      rows.push({ category: cat.name, name: ch.name, kind: ch.kind, exists: hasChannel(existing.data, ch.name, ch.kind) });
    }
  }
  return { ok: true, guildId, alreadySetUp: setupDone, rows, toCreate: rows.filter((r) => !r.exists).length };
}

function hasChannel(all: Channel[], name: string, kind: ChannelKind): boolean {
  const want = kind === "category" ? 4 : kind === "voice" ? 2 : 0;
  return all.some((c) => c.type === want && sameChannelName(c.name, name));
}

async function activeGames(): Promise<string[]> {
  try {
    const db = await getDb();
    const rows = await db.select({ name: schema.games.name })
      .from(schema.games).where(eq(schema.games.isActive, true)).limit(8);
    return rows.map((r) => r.name);
  } catch { return []; }
}

// ===== The build =====

export type HqSetupResult = { ok: boolean; created: number; pinned: number; skipped: number; reason?: string };

// Build (or finish building) HQ. Idempotent by construction — every channel is
// created only if it isn't already there — and marked done so it doesn't run
// again. `force` re-runs the same safe pass, which only fills in gaps.
export async function runHqSetup(force = false): Promise<HqSetupResult> {
  const { guildId, setupDone } = await hqStatus();
  if (!guildId) return { ok: false, created: 0, pinned: 0, skipped: 0, reason: "No HQ server id is set." };
  if (!canAct()) return { ok: false, created: 0, pinned: 0, skipped: 0, reason: "DISCORD_BOT_TOKEN isn't set." };
  if (setupDone && !force) {
    return { ok: true, created: 0, pinned: 0, skipped: 0, reason: "HQ is already set up. Nothing to do." };
  }

  const existing = await listChannels(guildId);
  if (!existing.ok) {
    return { ok: false, created: 0, pinned: 0, skipped: 0, reason: `Couldn't read that server's channels (${existing.status}).` };
  }
  const channels = [...existing.data];

  let created = 0;
  let pinned = 0;
  let skipped = 0;

  const games = await activeGames();
  for (const cat of hqBlueprint(games)) {
    let parent = channels.find((c) => c.type === 4 && sameChannelName(c.name, cat.name)) ?? null;
    if (!parent) {
      const made = await createChannel(guildId, cat.name, undefined, { kind: "category" });
      if (made.ok) { parent = made.data; channels.push(made.data); created++; }
    } else skipped++;

    for (const ch of cat.channels) {
      if (hasChannel(channels, ch.name, ch.kind)) { skipped++; continue; }
      const made = await createChannel(guildId, ch.name, ch.topic, {
        kind: ch.kind,
        parentId: parent?.id ?? null,
      });
      if (!made.ok) continue;
      channels.push(made.data);
      created++;

      if (ch.pin && ch.kind === "text") {
        const res = await postMessage(made.data.id, starter(ch.pin));
        if (res.ok && (await pinMessage(made.data.id, res.data.id)).ok) pinned++;
      }
    }
  }

  // Record which server we built, so this never runs twice on the same one but
  // DOES run once if the id is ever changed.
  try { await setContent(HQ_DONE_KEY, guildId); } catch { /* the channels exist either way */ }

  return { ok: true, created, pinned, skipped };
}

function starter(pin: NonNullable<PlannedChannel["pin"]>) {
  const buttons = pin.buttons === "link"
    ? rows([
      navButton("Link a game account", frame("link", ""), [frame("home")], ButtonStyle.Success, "🎮"),
      navButton("START HERE", frame("planets"), [frame("home")], ButtonStyle.Primary, "🚀"),
    ])
    : pin.buttons === "portal"
      ? rows([
        linkButton("Open Cluster", siteUrl(), "🔗"),
        navButton("My profile", frame("show", "profile"), [frame("home")], ButtonStyle.Primary, "👤"),
      ])
      : rows([
        navButton("START HERE", frame("planets"), [frame("home")], ButtonStyle.Primary, "🚀"),
        navButton("Link a game account", frame("link", ""), [frame("home")], ButtonStyle.Success, "🎮"),
      ]);

  return {
    embeds: [{ title: pin.title, description: pin.body, color: embedColor("#8b5cf6") }],
    components: buttons,
  };
}

// ===== Reporting home =====

export type HqEvent =
  | { type: "install"; guildName: string; guildId: string; members: number }
  | { type: "request"; guildName: string; title: string; game: string; prize: string }
  | { type: "unlock"; guildName: string; linked: number }
  | { type: "removed"; guildName: string; guildId: string };

// Send something worth knowing to HQ. Never throws and never blocks the caller:
// a failed report must not fail an install.
export async function reportToHq(event: HqEvent): Promise<void> {
  try {
    const guildId = await hqGuildId();
    if (!guildId || !canAct()) return;

    const channel = await hqChannel(guildId);
    if (!channel) return;

    const { title, body, color } = describe(event);
    await postMessage(channel, {
      embeds: [{ title, description: body, color: embedColor(color) }],
    });
  } catch { /* reporting is never worth breaking the thing being reported */ }
}

// Prefer a dedicated ops channel; fall back to the bot channel we know exists.
async function hqChannel(guildId: string): Promise<string | null> {
  const res = await listChannels(guildId);
  if (!res.ok) return null;
  const byName = (n: string) => res.data.find((c) => c.type === 0 && sameChannelName(c.name, n))?.id ?? null;
  return byName("server-reports") ?? byName("announcements") ?? byName(CLUSTER_CHANNEL) ?? null;
}

function describe(e: HqEvent): { title: string; body: string; color: string } {
  switch (e.type) {
    case "install":
      return {
        title: "New server installed ClusterBot",
        body: `**${e.guildName}** — ${e.members.toLocaleString()} members.\n\`${e.guildId}\``,
        color: "#34d399",
      };
    case "request":
      return {
        title: "A server requested a challenge",
        body: `**${e.guildName}** wants **${e.title}** on ${e.game}.${e.prize ? `\nPrize: ${e.prize}` : ""}\n\n${siteUrl()}/admin/discord/requests`,
        color: "#fbbf24",
      };
    case "unlock":
      return {
        title: "A server unlocked revenue share",
        body: `**${e.guildName}** crossed the threshold with ${e.linked.toLocaleString()} linked gamers.`,
        color: "#22d3ee",
      };
    case "removed":
      return {
        title: "A server removed the bot",
        body: `**${e.guildName}**\n\`${e.guildId}\``,
        color: "#f87171",
      };
  }
}
