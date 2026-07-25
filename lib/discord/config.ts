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

export function botToken(): string | undefined {
  return process.env.DISCORD_BOT_TOKEN || undefined;
}

export function publicKey(): string | undefined {
  return process.env.DISCORD_PUBLIC_KEY || undefined;
}

export function appId(): string | undefined {
  return process.env.DISCORD_APP_ID || process.env.DISCORD_CLIENT_ID || undefined;
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
// Permissions integer (see docs/DISCORD_BOT.md):
//   Manage Channels 16 | Send Messages 2048 | Embed Links 16384
//   Attach Files 32768 | Read History 65536 | Mention Everyone 131072
//   Manage Messages 8192 (pinning)
export const BOT_PERMISSIONS = "277025508432";

export function installUrl(): string | null {
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
  return `https://discord.com/oauth2/authorize?${q}`;
}

// Shared secret for server-to-server bot endpoints, mirroring the CRON_SECRET
// pattern already used by /api/cron/sync.
export function botApiSecret(): string | undefined {
  return process.env.BOT_API_SECRET || undefined;
}

export function authorizeBotRequest(headers: Headers): boolean {
  const secret = botApiSecret();
  if (!secret) return false;
  return headers.get("authorization") === `Bearer ${secret}`;
}
