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

export type Role = { id: string; name: string; color?: number; position?: number };

/**
 * One guild, as Discord sees it right now.
 *
 * ===== DELETED AS DEAD, AND RESTORED WITH ITS SURFACE =====
 *
 * `94-export-reach` listed this with no caller and it was deleted — correctly,
 * on the information available. It came back the moment the registry's Refresh
 * button was built, because `refreshGuild` needs exactly this and
 * `listRoles` below: the two were not dead code, they were **the other half of
 * an unwired feature**, which is the distinction the guard's list exists to
 * force somebody to make.
 *
 * G3 — owner and roles. Never the member list.
 */
export function getGuild(guildId: string) {
  return call<Guild>(`/guilds/${guildId}?with_counts=true`);
}

/** The roles on a guild, for the admin-role mapping (S5). */
export function listRoles(guildId: string) {
  return call<Role[]>(`/guilds/${guildId}/roles`);
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


// ===== Messages =====

export function postMessage(channelId: string, payload: Json) {
  return call<Message>(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify(payload) });
}

/**
 * Open a DM channel with one person and post into it.
 *
 * ===== IT RETURNS A REASON NOW, AND L10 IS WHY =====
 *
 * This used to answer `boolean`. *"A DM can fail. An owner who blocks DMs from
 * server members never receives it and Discord says so quietly. A failed DM is
 * a recorded state the guild registry shows, with when it was tried — never a
 * swallowed error."* A bare false cannot be shown to anybody: **50007 Cannot
 * send messages to this user** is a setting the owner chose and can undo, and
 * a 429 is us being busy. Telling an operator "the DM failed" without which of
 * those it was is telling them nothing they can act on.
 *
 * The two calls are reported separately for the same reason: failing to open
 * the channel is the blocked case, and failing to post into an open channel is
 * not.
 */
export async function dmUser(userId: string, payload: Json): Promise<RestResult<void>> {
  const chan = await call<Channel>("/users/@me/channels", {
    method: "POST",
    body: JSON.stringify({ recipient_id: userId }),
  });
  if (!chan.ok) return chan as RestResult<void>;
  const sent = await postMessage(chan.data.id, payload);
  return sent.ok ? { ok: true, data: undefined } : (sent as RestResult<void>);
}

// ===== Slash-command registration =====

export function registerGlobalCommands(commands: Json[]) {
  const id = appId();
  if (!id) return Promise.resolve({ ok: false as const, status: 0, error: "no_app_id" });
  return call<unknown[]>(`/applications/${id}/commands`, { method: "PUT", body: JSON.stringify(commands) });
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
