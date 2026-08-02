import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getContent, setContent } from "@/lib/cms";
import { canAct, siteUrl, CLUSTER_CHANNEL } from "@/lib/discord/config";
import {
  listChannels, createChannel, postMessage, pinMessage, sameChannelName,
  listRoles, createRole,
  type Channel, type ChannelKind, type Role,
} from "@/lib/discord/rest";
import { frame, navButton, linkButton, rows } from "@/lib/discord/components";
import { ButtonStyle } from "@/lib/discord/types";
import { cardRef, embedColor } from "@/lib/discord/cards";

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
  // Staff-only. Operational feeds carry other servers' data and must never be
  // readable by members who wander in.
  staffOnly?: boolean;
};

export type PlannedCategory = { name: string; channels: PlannedChannel[]; staffOnly?: boolean };

// Roles the bot creates once, as the foundation everything else builds on.
// Per-game roles are what a member picks up when they link that game — and
// they're the hook a paid cosmetic (a game logo on the role) hangs off later.
export type PlannedRole = { name: string; color: number; hoist?: boolean };

export function hqRoles(games: string[]): PlannedRole[] {
  return [
    { name: "Cluster Staff", color: 0x8b5cf6, hoist: true },
    { name: "Server Owner", color: 0xfbbf24, hoist: true },
    { name: "Monetized Server", color: 0x22d3ee },
    { name: "Verified Gamer", color: 0x34d399 },
    { name: "Challenge Winner", color: 0xf59e0b },
    ...games.slice(0, 12).map((g) => ({ name: g, color: 0x5865f2 })),
  ];
}

// What our server looks like. Ordinary community structure first, then the
// things that only make sense because we run a bot.
export function hqBlueprint(games: string[]): PlannedCategory[] {
  const lfg = games.slice(0, 8).map<PlannedChannel>((g) => ({
    name: `lfg-${slugName(g)}`,
    kind: "text",
    topic: `Looking for a group on ${g}. Post your rank, region and what you're after.`,
    pin: {
      title: `Find people to play ${g} with`,
      body: `Link your ${g} account and your rank shows on your Cluster profile — so "LFG" here comes with proof.`,
      buttons: "link",
    },
  }));

  // One feed per game planet: its challenges, updates and reminders land in the
  // channel for that game rather than in one firehose nobody reads.
  const gameFeeds = games.slice(0, 12).map<PlannedChannel>((g) => ({
    name: `${slugName(g)}-feed`,
    kind: "text",
    topic: `${g}: new challenges, standings updates and deadline reminders.`,
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
            body: "Customise your profile on the site, then run `/cluster show:share` here. Votes decide the Best Profile leaderboard.",
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
        { name: "feature-requests", kind: "text", topic: "What should Cluster do next?" },
      ],
    },
    {
      name: "GAME FEEDS",
      channels: [
        ...gameFeeds,
        {
          name: "leaderboard-updates", kind: "text",
          topic: "Movement on every leaderboard we run, across every game.",
        },
        {
          name: "challenge-reminders", kind: "text",
          topic: "Deadlines approaching, challenges ending, trophies awarded.",
        },
      ],
    },
    {
      name: "REPORTS",
      channels: [
        { name: "bug-reports", kind: "text", topic: "Tell us what broke and how to reproduce it." },
        { name: "report-a-player", kind: "text", topic: "Cheating, impersonation, an account that isn't theirs." },
        { name: "report-a-server", kind: "text", topic: "A server misusing the bot or its challenges." },
      ],
    },
    // Everything below is operational: it carries other servers' data, so it is
    // staff-only. Discord has no "private category" — each channel denies
    // @everyone individually, which is what actually enforces it.
    {
      name: "OPERATIONS", staffOnly: true,
      channels: [
        { name: "server-reports", kind: "text", topic: "Installs, unlocks and challenge requests from every server.", staffOnly: true },
        { name: "new-servers", kind: "text", topic: "One post per server that adds the bot.", staffOnly: true },
        { name: "bot-activity", kind: "text", topic: "Commands and button presses across every server.", staffOnly: true },
        { name: "owner-requests", kind: "text", topic: "Challenge requests waiting on review.", staffOnly: true },
        { name: "moderation-queue", kind: "text", topic: "Reports triaged out of the public report channels.", staffOnly: true },
        { name: "errors", kind: "text", topic: "Failures worth a human looking at.", staffOnly: true },
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

export type PlanRow = { category: string; name: string; kind: ChannelKind | "role"; exists: boolean; staffOnly?: boolean };
export type HqPlan = {
  ok: boolean;
  reason?: string;
  guildId: string | null;
  alreadySetUp: boolean;
  rows: PlanRow[];
  toCreate: number;
  /** True when the rows are the blueprint rather than a diff against the real
   *  server — we couldn't read it, so nothing is known to exist yet. */
  preview: boolean;
};

export async function planHqSetup(): Promise<HqPlan> {
  const { guildId, setupDone } = await hqStatus();
  const games = await activeGames();

  // The blueprint, always. Even when we can't reach the server there is a real
  // answer to "what would this build?", and showing it beats an empty box —
  // that's the whole reason this page asks for confirmation.
  const blueprint = (existing: Channel[] | null, roles: Role[] | null): PlanRow[] => {
    const haveRole = (n: string) =>
      !!roles && roles.some((r) => r.name.trim().toLowerCase() === n.trim().toLowerCase());
    const rows: PlanRow[] = [];
    for (const cat of hqBlueprint(games)) {
      rows.push({
        category: "", name: cat.name, kind: "category",
        exists: !!existing && hasChannel(existing, cat.name, "category"), staffOnly: cat.staffOnly,
      });
      for (const ch of cat.channels) {
        rows.push({
          category: cat.name, name: ch.name, kind: ch.kind,
          exists: !!existing && hasChannel(existing, ch.name, ch.kind), staffOnly: ch.staffOnly,
        });
      }
    }
    rows.push({ category: "", name: "ROLES", kind: "category", exists: !!existing });
    for (const r of hqRoles(games)) {
      rows.push({ category: "ROLES", name: r.name, kind: "role", exists: haveRole(r.name) });
    }
    return rows;
  };

  const unread = (reason: string): HqPlan => {
    const rows = blueprint(null, null);
    return { ok: false, reason, guildId, alreadySetUp: setupDone, rows, toCreate: rows.length, preview: true };
  };

  if (!guildId) return unread("No HQ server id is set — paste it above and save.");
  if (!canAct()) return unread("DISCORD_BOT_TOKEN isn't set, so the bot can't inspect or build anything.");

  const existing = await listChannels(guildId);
  if (!existing.ok) {
    return unread(
      existing.status === 403 || existing.status === 401
        ? `The bot can't read that server (${existing.status}). Add ClusterBot to it, and make sure it has Manage Channels and Manage Roles.`
        : existing.status === 404
          ? "No server with that id — check you copied the server id (not a channel or user id), and that the bot has been added to it."
          : `Couldn't read that server's channels (${existing.status}).`,
    );
  }

  const roles = await listRoles(guildId);
  const rows = blueprint(existing.data, roles.ok ? roles.data : null);
  return {
    ok: true, guildId, alreadySetUp: setupDone, rows, preview: false,
    toCreate: rows.filter((r) => !r.exists).length,
  };
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

export type HqSetupResult = {
  ok: boolean; created: number; pinned: number; skipped: number; roles: number; reason?: string;
};

// Build (or finish building) HQ. Idempotent by construction — every channel is
// created only if it isn't already there — and marked done so it doesn't run
// again. `force` re-runs the same safe pass, which only fills in gaps.
export async function runHqSetup(force = false): Promise<HqSetupResult> {
  const { guildId, setupDone } = await hqStatus();
  const nothing = { ok: false, created: 0, pinned: 0, skipped: 0, roles: 0 };
  if (!guildId) return { ...nothing, reason: "No HQ server id is set." };
  if (!canAct()) return { ...nothing, reason: "DISCORD_BOT_TOKEN isn't set." };
  if (setupDone && !force) {
    return { ...nothing, ok: true, reason: "HQ is already set up. Nothing to do." };
  }

  const existing = await listChannels(guildId);
  if (!existing.ok) {
    return { ...nothing, reason: `Couldn't read that server's channels (${existing.status}).` };
  }
  const channels = [...existing.data];

  let created = 0;
  let pinned = 0;
  let skipped = 0;
  let rolesMade = 0;

  const games = await activeGames();

  // Roles first: staff-only channels need the staff role to exist before they
  // can grant it, or the channel would be invisible to everyone including us.
  const existingRoles = await listRoles(guildId);
  const roleByName = new Map(
    (existingRoles.ok ? existingRoles.data : []).map((r) => [r.name.trim().toLowerCase(), r.id]),
  );
  for (const role of hqRoles(games)) {
    const key = role.name.trim().toLowerCase();
    if (roleByName.has(key)) { skipped++; continue; }
    const made = await createRole(guildId, role.name, role.color, role.hoist);
    if (made.ok) { roleByName.set(key, made.data.id); rolesMade++; }
  }
  const staffRole = roleByName.get("cluster staff");

  for (const cat of hqBlueprint(games)) {
    let parent = channels.find((c) => c.type === 4 && sameChannelName(c.name, cat.name)) ?? null;
    if (!parent) {
      const made = await createChannel(guildId, cat.name, undefined, {
        kind: "category",
        ...(cat.staffOnly && staffRole ? { privateToRoles: [staffRole] } : {}),
      });
      if (made.ok) { parent = made.data; channels.push(made.data); created++; }
    } else skipped++;

    for (const ch of cat.channels) {
      if (hasChannel(channels, ch.name, ch.kind)) { skipped++; continue; }
      const made = await createChannel(guildId, ch.name, ch.topic, {
        kind: ch.kind,
        parentId: parent?.id ?? null,
        // Discord has no "private category" — the deny has to be repeated on
        // every channel, or an ops channel is readable by anyone who wanders in.
        ...((ch.staffOnly || cat.staffOnly) && staffRole ? { privateToRoles: [staffRole] } : {}),
      });
      if (!made.ok) continue;
      channels.push(made.data);
      created++;

      if (ch.pin && ch.kind === "text") {
        const res = await postMessage(made.data.id, await starter(ch.pin));
        if (res.ok && (await pinMessage(made.data.id, res.data.id)).ok) pinned++;
      }
    }
  }

  // Record which server we built, so this never runs twice on the same one but
  // DOES run once if the id is ever changed.
  try { await setContent(HQ_DONE_KEY, guildId); } catch { /* the channels exist either way */ }

  return { ok: true, created, pinned, skipped, roles: rolesMade };
}

function slugName(g: string): string {
  return g.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function starter(pin: NonNullable<PlannedChannel["pin"]>) {
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

  const { url } = await cardRef("guide", { topic: guideForPin(pin.buttons) });
  return {
    embeds: [{ title: pin.title, description: pin.body, color: embedColor("#8b5cf6"), image: { url } }],
    components: buttons,
  };
}

// Which pinned guide card fits the channel this starter message opens.
function guideForPin(buttons: "start" | "link" | "portal" | undefined): string {
  return buttons === "link" ? "connect-account" : buttons === "portal" ? "everything" : "getting-started";
}

// ===== Reporting home =====

export type HqEvent =
  | { type: "install"; guildName: string; guildId: string; members: number }
  | { type: "request"; guildName: string; title: string; game: string; prize: string }
  | { type: "unlock"; guildName: string; linked: number }
  | { type: "removed"; guildName: string; guildId: string }
  | { type: "challenge"; game: string; title: string; body: string; url?: string }
  | { type: "leaderboard"; game: string; board: string; body: string }
  | { type: "activity"; body: string }
  | { type: "error"; where: string; body: string };

// Which channel an event belongs in. One firehose is a channel nobody reads,
// so each kind of news has a home — and a game's news goes to that game's feed.
function channelFor(e: HqEvent): string[] {
  switch (e.type) {
    case "install": return ["new-servers", "server-reports"];
    case "request": return ["owner-requests", "server-reports"];
    case "unlock": return ["server-reports"];
    case "removed": return ["new-servers", "server-reports"];
    case "challenge": return [`${slugName(e.game)}-feed`, "challenge-reminders"];
    case "leaderboard": return [`${slugName(e.game)}-feed`, "leaderboard-updates"];
    case "activity": return ["bot-activity"];
    case "error": return ["errors"];
  }
}

// Send something worth knowing to HQ. Never throws and never blocks the caller:
// a failed report must not fail an install.
export async function reportToHq(event: HqEvent): Promise<void> {
  try {
    const guildId = await hqGuildId();
    if (!guildId || !canAct()) return;

    const channel = await hqChannel(guildId, channelFor(event));
    if (!channel) return;

    const { title, body, color } = describe(event);
    const { url } = await cardRef("guide", { topic: "everything" });
    await postMessage(channel, {
      embeds: [{ title, description: body, color: embedColor(color), image: { url } }],
    });
  } catch { /* reporting is never worth breaking the thing being reported */ }
}

// First preference that exists wins, falling back to channels every HQ has.
// A report with nowhere to go is silently dropped rather than posted somewhere
// members can read it.
async function hqChannel(guildId: string, preferred: string[]): Promise<string | null> {
  const res = await listChannels(guildId);
  if (!res.ok) return null;
  const byName = (n: string) => res.data.find((c) => c.type === 0 && sameChannelName(c.name, n))?.id ?? null;
  for (const name of [...preferred, "server-reports", "announcements", CLUSTER_CHANNEL]) {
    const id = byName(name);
    if (id) return id;
  }
  return null;
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
        title: "A server unlocked sponsored challenges",
        body: `**${e.guildName}** crossed the threshold with ${e.linked.toLocaleString()} linked gamers.`,
        color: "#22d3ee",
      };
    case "removed":
      return {
        title: "A server removed the bot",
        body: `**${e.guildName}**\n\`${e.guildId}\``,
        color: "#f87171",
      };
    case "challenge":
      return {
        title: e.title,
        body: `${e.body}${e.url ? `\n\n${e.url}` : ""}`,
        color: "#8b5cf6",
      };
    case "leaderboard":
      return { title: `${e.game} — ${e.board}`, body: e.body, color: "#22d3ee" };
    case "activity":
      return { title: "Bot activity", body: e.body, color: "#9aa0c3" };
    case "error":
      return { title: `Problem in ${e.where}`, body: e.body, color: "#f87171" };
  }
}
