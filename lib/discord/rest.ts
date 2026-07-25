import { DISCORD_API, botToken, appId, canAct } from "@/lib/discord/config";

// Bot-token REST calls. Used for everything the bot does OUTSIDE an interaction:
// creating #ClusterGG on install, pinning guides, announcing challenges, posting
// ads. Interaction replies use the interaction token instead (see reply.ts).
//
// Every function returns null / false instead of throwing when the bot isn't
// configured, so callers (server actions, cron) never need a guard.

type Json = Record<string, unknown>;

export type RestResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function call<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<RestResult<T>> {
  const token = botToken();
  if (!token) return { ok: false, status: 0, error: "discord_not_configured" };

  let res: Response;
  try {
    res = await fetch(`${DISCORD_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "ClusterGG (https://clustergg.com, 1.0)",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }

  // Discord rate limits per-route. One polite retry covers the normal burst
  // (pinning a dozen guides at install); anything longer we surface instead of
  // holding a serverless function open.
  if (res.status === 429 && attempt < 2) {
    const retry = Number(res.headers.get("retry-after") ?? "1");
    if (retry <= 5) {
      await new Promise((r) => setTimeout(r, retry * 1000));
      return call<T>(path, init, attempt + 1);
    }
  }

  if (!res.ok) return { ok: false, status: res.status, error: await res.text().catch(() => res.statusText) };
  if (res.status === 204) return { ok: true, data: undefined as T };
  return { ok: true, data: (await res.json().catch(() => ({}))) as T };
}

// ===== Guilds & channels =====

export type Guild = { id: string; name: string; icon?: string | null; owner_id?: string; approximate_member_count?: number };
export type Channel = { id: string; name?: string; type: number; guild_id?: string };
export type Message = { id: string; channel_id: string };

export function guildIconUrl(g: Pick<Guild, "id" | "icon">): string | null {
  return g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=256` : null;
}

export function getGuild(guildId: string) {
  return call<Guild>(`/guilds/${guildId}?with_counts=true`);
}

export function listChannels(guildId: string) {
  return call<Channel[]>(`/guilds/${guildId}/channels`);
}

export function createChannel(guildId: string, name: string, topic?: string) {
  return call<Channel>(`/guilds/${guildId}/channels`, {
    method: "POST",
    body: JSON.stringify({ name, type: 0, topic }),
  });
}

// Find the bot's channel, creating it only if it isn't already there. Servers
// that renamed or pre-created it are respected.
export async function ensureChannel(guildId: string, name: string, topic?: string): Promise<Channel | null> {
  const existing = await listChannels(guildId);
  if (existing.ok) {
    const found = existing.data.find((c) => c.type === 0 && c.name?.toLowerCase() === name.toLowerCase());
    if (found) return found;
  }
  const made = await createChannel(guildId, name, topic);
  return made.ok ? made.data : null;
}

// ===== Messages =====

export function postMessage(channelId: string, payload: Json) {
  return call<Message>(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify(payload) });
}

export function editMessage(channelId: string, messageId: string, payload: Json) {
  return call<Message>(`/channels/${channelId}/messages/${messageId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

// Discord moved pins to /messages/pins/ and kept the old route working. Try the
// current one, fall back to the legacy one — a failed pin is invisible in the
// channel (the message is still there), so it must not depend on one route.
export async function pinMessage(channelId: string, messageId: string): Promise<RestResult<void>> {
  const res = await call<void>(`/channels/${channelId}/messages/pins/${messageId}`, { method: "PUT" });
  if (res.ok || res.status !== 404) return res;
  return call<void>(`/channels/${channelId}/pins/${messageId}`, { method: "PUT" });
}

// ===== Direct messages =====

// Owner DMs (install welcome, 500-gamer unlock) go through a one-off DM channel.
export async function dmUser(userId: string, payload: Json): Promise<boolean> {
  const chan = await call<Channel>("/users/@me/channels", { method: "POST", body: JSON.stringify({ recipient_id: userId }) });
  if (!chan.ok) return false;
  const sent = await postMessage(chan.data.id, payload);
  return sent.ok;
}

// ===== Slash-command registration =====

export function registerGlobalCommands(commands: Json[]) {
  const id = appId();
  if (!id) return Promise.resolve({ ok: false as const, status: 0, error: "no_app_id" });
  return call<unknown[]>(`/applications/${id}/commands`, { method: "PUT", body: JSON.stringify(commands) });
}

// Guild-scoped registration appears INSTANTLY, where global commands can take
// up to an hour to propagate. Use this while developing against a test server.
export function registerGuildCommands(guildId: string, commands: Json[]) {
  const id = appId();
  if (!id) return Promise.resolve({ ok: false as const, status: 0, error: "no_app_id" });
  return call<unknown[]>(`/applications/${id}/guilds/${guildId}/commands`, { method: "PUT", body: JSON.stringify(commands) });
}

export { canAct };
