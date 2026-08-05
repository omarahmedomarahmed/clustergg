// Discord bot configuration + availability.
//
// The bot lives inside this Next app (HTTP interactions, no gateway, no
// always-on process). Everything here degrades gracefully when the Discord env
// vars are absent: the site, admin and every existing page keep working, the
// bot endpoints simply report "not configured". This mirrors `blobConfigured()`
// in lib/blob.ts and is what lets the whole bot be built and reviewed before
// any credentials exist.

export const DISCORD_API = "https://discord.com/api/v10";

// The channel the bot creates on install and pins its how-to guides in.
export const CLUSTER_CHANNEL = "clustergg";

// Env values pasted into a dashboard pick up stray whitespace and quotes
// astonishingly often, and a public key with a trailing newline fails EVERY
// signature check while looking perfectly correct in the UI. Normalise once,
// here, rather than debugging it later.
function env(name: string): string | undefined {
  const v = process.env[name];
  if (!v) return undefined;
  const clean = v.trim().replace(/^["']|["']$/g, "");
  return clean || undefined;
}

export function botToken(): string | undefined {
  return env("DISCORD_BOT_TOKEN");
}

export function publicKey(): string | undefined {
  return env("DISCORD_PUBLIC_KEY");
}

export function appId(): string | undefined {
  return env("DISCORD_APP_ID") || env("DISCORD_CLIENT_ID");
}

// Is the public key even shaped like an Ed25519 key? (64 hex characters.)
// Pasting the Application ID or the client secret in by mistake is the single
// most common reason Discord refuses to verify an interactions URL.
export function publicKeyShape(): { present: boolean; length: number; looksValid: boolean } {
  const k = publicKey();
  return { present: !!k, length: k?.length ?? 0, looksValid: !!k && /^[0-9a-f]{64}$/i.test(k) };
}

// Can we *receive* interactions? (needs only the public key)
export function canVerify(): boolean {
  return !!publicKey();
}

// Can we *act* — post messages, create channels, pin? (needs the bot token)
export function canAct(): boolean {
  return !!botToken();
}

export function discordConfigured(): boolean {
  return canVerify() && canAct() && !!appId();
}

// Public base URL used in bot links and the install redirect. Falls back to the
// same env vars the OAuth flow uses.
export function siteUrl(): string {
  const env = (process.env.NEXT_PUBLIC_APP_URL || process.env.OAUTH_BASE_URL || "").replace(/\/+$/, "");
  return env || "https://clustergg.com";
}

// The "Add ClusterBot" URL a server owner clicks. `guild_id` comes back to
// /api/discord/installed, which is how we onboard a server without a gateway.
//
// Permissions integer. Every bit here is load-bearing — in particular
// MANAGE_MESSAGES, without which the install-time guide PINS silently 403 while
// the posts themselves succeed, which looks like everything worked.
//   View Channel        1024        (see the channel it just made)
//   Manage Channels       16        (create #clustergg)
//   Send Messages       2048
//   Manage Messages     8192        (PIN the guides)
//   Embed Links        16384        (the card embeds)
//   Attach Files       32768
//   Read History       65536
//   Mention Everyone  131072        (@here on private-challenge announcements)
//   Add Reactions         64
//   Use App Commands  2^31          (/cluster)
//   Send in Threads   2^38
export const BOT_PERMISSIONS = "277025647696";

/**
 * @param state Optional signed attribution token (B22). Discord returns `state`
 * untouched on the redirect, which is the only way to know WHICH gamer brought
 * us a server — an OAuth callback has no session of its own. Omitted for the
 * links rendered into public pages, which are cached and must not carry one
 * gamer's token to the next visitor; `/api/discord/install` mints it per click.
 */
export function installUrl(state?: string | null): string | null {
  const id = appId();
  if (!id) return null;
  const redirect = `${siteUrl()}/api/discord/installed`;
  const q = new URLSearchParams({
    client_id: id,
    permissions: BOT_PERMISSIONS,
    scope: "bot applications.commands",
    response_type: "code",
    redirect_uri: redirect,
  });
  if (state) q.set("state", state);
  return `https://discord.com/oauth2/authorize?${q}`;
}

/**
 * The link every BUTTON on the site should point at (B22).
 *
 * Not the Discord URL — our own route, which mints a per-click attribution
 * token for whoever is signed in and then redirects. Public pages are cached,
 * so a Discord URL rendered into one would freeze the first visitor's token
 * into the HTML and credit them for every install after it. A route cannot be
 * frozen that way.
 *
 * `installUrl()` stays for the two places that need the literal OAuth URL: the
 * admin page that shows it for the Discord portal, and this route itself.
 */
export function installHref(): string | null {
  return appId() ? "/api/discord/install" : null;
}

// Shared secret for server-to-server bot endpoints, mirroring the CRON_SECRET
// pattern already used by /api/cron/sync.
export function botApiSecret(): string | undefined {
  return env("BOT_API_SECRET");
}

export function authorizeBotRequest(headers: Headers): boolean {
  const secret = botApiSecret();
  if (!secret) return false;
  return headers.get("authorization") === `Bearer ${secret}`;
}
