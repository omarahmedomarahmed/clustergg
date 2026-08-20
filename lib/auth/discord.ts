// Discord OAuth: identity at sign-in, `guilds` only when somebody is adding
// the bot or picking a server.
//
// ===== SCOPES ARE ASKED FOR WHERE THEY ARE NEEDED, NOT AT SIGNUP =====
//
// I10 — `guilds` is requested at onboarding's server-owner path, never at
// signup. A signup screen that asks to see every server you are in is a signup
// screen people abandon, and most gamers never need it at all.
//
// 10-SETUP §1: the redirect URI must be registered as
// `<site>/api/auth/discord/callback` or every sign-in fails with a mismatch.

const DISCORD_API = "https://discord.com/api/v10";

/** Whether this deployment has been given Discord's credentials yet. */
export function discordConfigured(): boolean {
  return Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? process.env.APP_URL ?? "http://localhost:3000";
}

export function callbackUrl(): string {
  return `${siteUrl()}/api/auth/discord/callback`;
}

export function installCallbackUrl(): string {
  return `${siteUrl()}/api/auth/discord/install`;
}

export type DiscordScope = "identify" | "guilds";

/**
 * The sign-in URL.
 *
 * `state` carries where to go afterwards and is verified on the way back —
 * without it, an attacker can start an OAuth flow and land the victim's
 * browser wherever they like.
 */
export function discordAuthUrl(opts: { state: string; scopes?: DiscordScope[] } ): string {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID ?? "",
    redirect_uri: callbackUrl(),
    response_type: "code",
    scope: (opts.scopes ?? ["identify"]).join(" "),
    state: opts.state,
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}

/**
 * The **install** URL — a different redirect, on purpose.
 *
 * G1: who installed the bot is captured here or **lost forever**. Discord's
 * API will never tell us afterwards, so the capture cannot be deferred to a
 * background job or inferred later from anything.
 *
 * `guild_id` pre-selects the server (12 §9), and `disable_guild_select` stops
 * somebody landing on the picker and installing into the wrong one.
 */
export function botInstallUrl(opts: { state: string; guildId?: string | null }): string {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID ?? "",
    // `bot` and `applications.commands` per 10-SETUP §3, plus `identify` so
    // the callback knows who pressed the button even if they arrive signed
    // out — which is exactly the case G2 tells us to handle.
    scope: "bot applications.commands identify",
    response_type: "code",
    redirect_uri: installCallbackUrl(),
    permissions: String(BOT_PERMISSIONS),
    state: opts.state,
    ...(opts.guildId ? { guild_id: opts.guildId, disable_guild_select: "true" } : {}),
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}

/**
 * Send Messages + Embed Links + Attach Files + Read Message History.
 *
 * Deliberately minimal, and deliberately **not** including anything that would
 * let Cluster manage a server. 12 §7a says the analytics page tells owners
 * they cannot manage their server, members or roles from Cluster — a claim we
 * can only make because the bot never asks for the permission to.
 */
export const BOT_PERMISSIONS = (1 << 11) | (1 << 14) | (1 << 15) | (1 << 16);

export type DiscordIdentity = {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
};

export type DiscordGuildSummary = {
  id: string;
  name: string;
  /** Discord's own flag. True when this user created the guild. */
  owner: boolean;
  /** The raw permission bitfield, as a string — it exceeds 2^53. */
  permissions: string;
};

export class DiscordAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscordAuthError";
  }
}

/** The ADMINISTRATOR bit. P2 — one of the two ways into a server portal. */
export const ADMINISTRATOR = 1n << 3n;

export function hasAdministrator(permissions: string): boolean {
  try {
    return (BigInt(permissions) & ADMINISTRATOR) === ADMINISTRATOR;
  } catch {
    // A permission string we cannot parse is not a permission we grant.
    return false;
  }
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; scopes: string[] }> {
  if (!discordConfigured()) {
    throw new DiscordAuthError(
      "Discord sign-in is not configured on this deployment. DISCORD_CLIENT_ID " +
        "and DISCORD_CLIENT_SECRET come from the Developer Portal — see docs/10-SETUP.md §1.",
    );
  }

  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID as string,
      client_secret: process.env.DISCORD_CLIENT_SECRET as string,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    // Never the body — Discord echoes the client secret back in some error
    // shapes, and this string reaches a log.
    throw new DiscordAuthError(
      `Discord refused the sign-in (${response.status}). If this is every ` +
        `attempt rather than one, the redirect URI in the Developer Portal ` +
        `does not match ${redirectUri}.`,
    );
  }

  const body = (await response.json()) as { access_token?: string; scope?: string };
  if (!body.access_token) throw new DiscordAuthError("Discord returned no access token.");
  return { accessToken: body.access_token, scopes: (body.scope ?? "").split(" ") };
}

export async function fetchIdentity(accessToken: string): Promise<DiscordIdentity> {
  const response = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new DiscordAuthError(`Discord would not say who you are (${response.status}).`);
  const body = (await response.json()) as {
    id: string;
    username: string;
    global_name?: string | null;
    avatar?: string | null;
  };
  return {
    id: body.id,
    username: body.username,
    globalName: body.global_name ?? null,
    avatar: body.avatar ?? null,
  };
}

/**
 * Every guild this user is in, with their permissions in each.
 *
 * Requires the `guilds` scope, which is why it is a separate call and a
 * separate consent — see I10. This is a **user-scoped** read: it tells us what
 * *they* can do, and it is not, and must never become, a member list.
 */
export async function fetchGuilds(accessToken: string): Promise<DiscordGuildSummary[]> {
  const response = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new DiscordAuthError(`Discord would not list your servers (${response.status}).`);
  }
  const body = (await response.json()) as {
    id: string;
    name: string;
    owner?: boolean;
    permissions?: string;
  }[];
  return body.map((g) => ({
    id: g.id,
    name: g.name,
    owner: Boolean(g.owner),
    permissions: g.permissions ?? "0",
  }));
}

