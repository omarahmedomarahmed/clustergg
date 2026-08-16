import { DISCORD_API, botToken, appId, canAct } from "./config.ts";

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

// ===== Interaction responses =====
//
// The other half of the 3-second rule. The handler acknowledges immediately
// with a deferred response; this replaces that placeholder with the finished
// card once the work in `after()` is done.
//
// It uses the **interaction token**, not the bot token — a webhook edit, which
// is why it does not go through `call()`. The token is valid for 15 minutes
// and needs no authorization header, which is also why it must never be
// logged: it is a bearer credential for one interaction.

export async function editOriginalResponse(
  applicationId: string,
  interactionToken: string,
  payload: { content?: string; embeds?: unknown[]; components?: unknown[] },
  files?: { name: string; data: Uint8Array }[],
): Promise<boolean> {
  const url = `${DISCORD_API}/webhooks/${applicationId}/${interactionToken}/messages/@original`;

  try {
    // A card is an image, so the common path is multipart. `payload_json`
    // carries the message and each file rides alongside it.
    if (files && files.length > 0) {
      const form = new FormData();
      form.set("payload_json", JSON.stringify(payload));
      for (const [i, file] of files.entries()) {
        form.set(
          `files[${i}]`,
          new Blob([new Uint8Array(file.data)], { type: "image/png" }),
          file.name,
        );
      }
      const res = await fetch(url, { method: "PATCH", body: form, cache: "no-store" });
      return res.ok;
    }

    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    // Never throws. This runs inside `after()`, where an exception is an
    // unhandled rejection rather than something a person can see.
    return false;
  }
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

// Discord channel types we build with.
export const CHANNEL = { text: 0, voice: 2, category: 4, forum: 15 } as const;
export type ChannelKind = keyof typeof CHANNEL;

// Permission bits we use. VIEW_CHANNEL is the one that makes a channel private:
// deny it to @everyone and only roles granted it can see the channel at all.
export const PERM = { viewChannel: "1024", sendMessages: "2048" } as const;

export function createChannel(
  guildId: string,
  name: string,
  topic?: string,
  opts: {
    kind?: ChannelKind;
    parentId?: string | null;
    position?: number;
    // Staff-only. The @everyone role always shares the guild's id, so denying
    // VIEW_CHANNEL to that id hides the channel from members.
    privateToRoles?: string[];
  } = {},
) {
  const overwrites = opts.privateToRoles
    ? [
      { id: guildId, type: 0, deny: PERM.viewChannel },
      ...opts.privateToRoles.map((roleId) => ({ id: roleId, type: 0, allow: PERM.viewChannel })),
    ]
    : undefined;

  return call<Channel>(`/guilds/${guildId}/channels`, {
    method: "POST",
    body: JSON.stringify({
      name,
      type: CHANNEL[opts.kind ?? "text"],
      // Discord rejects `topic` on voice and category channels.
      ...(topic && (opts.kind ?? "text") === "text" ? { topic } : {}),
      ...(opts.parentId ? { parent_id: opts.parentId } : {}),
      ...(opts.position != null ? { position: opts.position } : {}),
      ...(overwrites ? { permission_overwrites: overwrites } : {}),
    }),
  });
}

// ===== Roles =====

export type Role = { id: string; name: string; color?: number; position?: number };

export function listRoles(guildId: string) {
  return call<Role[]>(`/guilds/${guildId}/roles`);
}

export function createRole(guildId: string, name: string, color?: number, hoist = false) {
  return call<Role>(`/guilds/${guildId}/roles`, {
    method: "POST",
    body: JSON.stringify({ name, ...(color != null ? { color } : {}), hoist, mentionable: false }),
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

// Discord normalises text channel names to lowercase-with-dashes; categories
// and voice channels keep their case. Compare the way Discord stores them or
// a second run creates duplicates of everything.
export function sameChannelName(a: string | undefined, b: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "-");
  return !!a && norm(a) === norm(b);
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

// Owner DMs (install welcome, the ladder's earning unlock) go through a one-off
// DM channel. The number is `EARN_FLOOR` in lib/ladder.ts and is deliberately
// not repeated here — this comment used to say "500-gamer unlock" (B1).
/**
 * Put a gamer into a server, using the token THEY granted us.
 *
 * `PUT /guilds/{id}/members/{user}` with a user access token carrying the
 * `guilds.join` scope is the only way to add somebody to a server without them
 * clicking an invite. It is not a way in for us to servers we don't run: the
 * bot must already be in the target guild with Create Invite, and the user must
 * have consented to the scope on the Discord consent screen they just passed.
 *
 * Discord answers 201 when it added them and 204 when they were already there;
 * both are success, and the difference is worth reporting because "we added
 * 400 people today" and "400 people were already there" are different facts.
 */
export async function addGuildMember(
  guildId: string, userId: string, accessToken: string,
): Promise<{ ok: boolean; added: boolean; status: number; error?: string }> {
  const res = await call<unknown>(`/guilds/${guildId}/members/${userId}`, {
    method: "PUT",
    body: JSON.stringify({ access_token: accessToken }),
  });
  if (!res.ok) return { ok: false, added: false, status: res.status, error: res.error };
  // 201 returns the new member object; 204 (already a member) returns nothing.
  // `call` turns the empty body into `undefined`, which is how the two are
  // told apart — and they are worth telling apart, because "we added four
  // hundred people today" and "four hundred were already there" are different
  // facts about the same successful call.
  return { ok: true, added: res.data !== undefined, status: res.data === undefined ? 204 : 201 };
}

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

/**
 * The commands Discord currently has registered for this app.
 *
 * Read-only, and the exact array Discord's own API returns — which is what a
 * bot list's "import your commands" wants pasted into it. Ours is a `PUT`
 * payload (name, description, options) and Discord's response is a richer
 * object (id, application_id, type, version, integration_types…), so handing a
 * list the payload we send is handing it something it has never been asked to
 * parse.
 */
export function listGlobalCommands() {
  const id = appId();
  if (!id) return Promise.resolve({ ok: false as const, status: 0, error: "no_app_id" });
  return call<unknown[]>(`/applications/${id}/commands`, { method: "GET" });
}
