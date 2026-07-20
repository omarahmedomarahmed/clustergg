// Third-party sign-in / identity engine. Discord is the primary identity for
// every gamer; Steam additionally links the Steam game account instantly. The
// generic OAuth2 helpers also power Epic / Battle.net when their envs are set.
//
// Redirect URIs are built from OAUTH_BASE_URL (or the request origin) so the
// value registered in each provider's dev portal matches exactly.

import { getProvider, isProviderLive } from "@/lib/providers/registry";

export type OAuthProfile = {
  providerUserId: string;
  username: string;
  email?: string | null;
  avatarUrl?: string | null;
};

type OAuth2Config = {
  kind: "oauth2";
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  userInfo: (accessToken: string) => Promise<OAuthProfile>;
};

type OpenIdConfig = {
  kind: "openid";
  // Steam-style OpenID 2.0 — no client secret, identity is the returned claimed_id.
  realmPath: string;
  profile: (steamId: string) => Promise<OAuthProfile>;
};

export type OAuthConfig = OAuth2Config | OpenIdConfig;

// The app origin used to build redirect URIs. We PREFER the real request origin
// so the whole OAuth round-trip stays on the exact host the user started on —
// the `oauth_flow` state cookie is host-scoped, so a cross-domain hop (e.g.
// clustergg.com → clustergg.vercel.app because an env var pinned the other
// domain) drops the cookie and the callback fails with `state_mismatch`.
// The pinned env (OAUTH_BASE_URL / NEXT_PUBLIC_APP_URL) is only a fallback for
// local dev or when the request origin can't be determined.
export function appBaseUrl(reqOrigin: string): string {
  const clean = (reqOrigin || "").replace(/\/+$/, "");
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(clean);
  if (clean && !isLocal) return clean;
  const env = (process.env.OAUTH_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  return env || clean;
}

// Resolve the true public origin of an incoming request from the proxy headers
// Vercel sets (x-forwarded-host / -proto), falling back to the parsed URL. Used
// so redirect URIs + the state cookie live on the SAME host the user is on.
export function originFromHeaders(headers: Headers, fallbackOrigin: string): string {
  const host = (headers.get("x-forwarded-host") || headers.get("host") || "").split(",")[0].trim();
  if (!host) return (fallbackOrigin || "").replace(/\/+$/, "");
  const proto = (headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
  return `${proto}://${host}`;
}

export function redirectUri(providerId: string, reqOrigin: string): string {
  return `${appBaseUrl(reqOrigin)}/api/auth/${providerId}/callback`;
}

// ---- Discord (identity) ----
function discordConfig(): OAuth2Config {
  return {
    kind: "oauth2",
    authorizeUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    scope: "identify email",
    userInfo: async (token) => {
      const r = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`Discord profile ${r.status}`);
      const u = await r.json() as { id: string; username: string; global_name?: string; email?: string; avatar?: string | null };
      const avatarUrl = u.avatar
        ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${u.avatar.startsWith("a_") ? "gif" : "png"}?size=256`
        : `https://cdn.discordapp.com/embed/avatars/${(BigInt(u.id) >> 22n) % 6n}.png`;
      return { providerUserId: u.id, username: u.global_name || u.username, email: u.email ?? null, avatarUrl };
    },
  };
}

// ---- Epic Games (identity) ----
function epicConfig(): OAuth2Config {
  return {
    kind: "oauth2",
    authorizeUrl: "https://www.epicgames.com/id/authorize",
    tokenUrl: "https://api.epicgames.dev/epic/oauth/v2/token",
    scope: "basic_profile",
    userInfo: async (token) => {
      const r = await fetch("https://api.epicgames.dev/epic/oauth/v2/userInfo", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`Epic profile ${r.status}`);
      const u = await r.json() as { sub: string; preferred_username?: string; email?: string };
      return { providerUserId: u.sub, username: u.preferred_username || "Epic gamer", email: u.email ?? null, avatarUrl: null };
    },
  };
}

// ---- Battle.net (identity) ----
function battlenetConfig(): OAuth2Config {
  return {
    kind: "oauth2",
    authorizeUrl: "https://oauth.battle.net/authorize",
    tokenUrl: "https://oauth.battle.net/token",
    scope: "openid",
    userInfo: async (token) => {
      const r = await fetch("https://oauth.battle.net/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`Battle.net profile ${r.status}`);
      const u = await r.json() as { id: number; battletag: string };
      return { providerUserId: String(u.id), username: u.battletag, email: null, avatarUrl: null };
    },
  };
}

// ---- Steam (identity + instant game link via OpenID 2.0) ----
function steamConfig(): OpenIdConfig {
  return {
    kind: "openid",
    realmPath: "/api/auth/steam/callback",
    profile: async (steamId) => {
      const key = process.env.STEAM_API_KEY;
      let username = `Steam ${steamId.slice(-5)}`;
      let avatarUrl: string | null = null;
      if (key) {
        try {
          const r = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamId}`);
          if (r.ok) {
            const d = await r.json() as { response?: { players?: { personaname?: string; avatarfull?: string }[] } };
            const p = d.response?.players?.[0];
            if (p?.personaname) username = p.personaname;
            if (p?.avatarfull) avatarUrl = p.avatarfull;
          }
        } catch { /* fall back to defaults */ }
      }
      return { providerUserId: steamId, username, avatarUrl };
    },
  };
}

export function oauthConfig(providerId: string): OAuthConfig | null {
  switch (providerId) {
    case "discord": return discordConfig();
    case "epic": return epicConfig();
    case "battlenet": return battlenetConfig();
    case "steam": return steamConfig();
    default: return null;
  }
}

// A sign-in provider is available when it has a config AND its credentials are
// present (Steam only needs the OpenID flow; the API key just enriches profile).
export function isOAuthAvailable(providerId: string): boolean {
  if (providerId === "steam") return true;
  const p = getProvider(providerId);
  return !!p && p.authType === "oauth" && isProviderLive(p);
}

// Providers offered as sign-in buttons, Discord always first. Steam is no longer
// an OAuth login (it stays available as a linkable game account below).
export const SIGNIN_PROVIDERS = ["discord", "epic", "battlenet"] as const;

export function availableSigninProviders(): string[] {
  return SIGNIN_PROVIDERS.filter(isOAuthAvailable);
}

// Providers that link a game account via OAuth (not an identifier/API lookup) —
// clicking them on the connect picker routes through /api/auth/<id>?intent=link.
export const OAUTH_LINK_PROVIDERS = ["discord", "steam", "epic", "battlenet"] as const;
export function isOAuthLinkProvider(id: string): boolean {
  return (OAUTH_LINK_PROVIDERS as readonly string[]).includes(id);
}

// Exchange an authorization code for an access token (OAuth2 providers).
export async function exchangeCode(providerId: string, code: string, reqOrigin: string): Promise<string> {
  const cfg = oauthConfig(providerId);
  if (!cfg || cfg.kind !== "oauth2") throw new Error("Not an OAuth2 provider");
  const p = getProvider(providerId);
  const clientId = process.env[p!.envVars[0]];
  const clientSecret = process.env[p!.envVars[1]];
  if (!clientId || !clientSecret) throw new Error(`${providerId} not configured`);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(providerId, reqOrigin),
    client_id: clientId,
    client_secret: clientSecret,
  });
  const r = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!r.ok) throw new Error(`${providerId} token exchange ${r.status}`);
  const data = await r.json() as { access_token?: string };
  if (!data.access_token) throw new Error(`${providerId} returned no access token`);
  return data.access_token;
}

export function buildAuthorizeUrl(providerId: string, reqOrigin: string, state: string): string {
  const cfg = oauthConfig(providerId);
  const p = getProvider(providerId);
  if (!cfg) throw new Error("Unknown provider");

  if (cfg.kind === "openid") {
    // Steam OpenID 2.0 checkid_setup.
    const base = appBaseUrl(reqOrigin);
    const params = new URLSearchParams({
      "openid.ns": "http://specs.openid.net/auth/2.0",
      "openid.mode": "checkid_setup",
      "openid.return_to": `${base}${cfg.realmPath}?st=${encodeURIComponent(state)}`,
      "openid.realm": base,
      "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
      "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    });
    return `https://steamcommunity.com/openid/login?${params.toString()}`;
  }

  const clientId = process.env[p!.envVars[0]] ?? "";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(providerId, reqOrigin),
    response_type: "code",
    scope: cfg.scope,
    state,
  });
  return `${cfg.authorizeUrl}?${params.toString()}`;
}

// Verify a Steam OpenID callback and return the resolved SteamID64.
export async function verifySteamOpenId(searchParams: URLSearchParams): Promise<string | null> {
  const claimed = searchParams.get("openid.claimed_id");
  const m = claimed?.match(/\/id\/(\d+)$|\/openid\/id\/(\d+)$|(\d{17})$/);
  const steamId = m?.[1] || m?.[2] || m?.[3];
  if (!steamId) return null;

  const body = new URLSearchParams();
  searchParams.forEach((v, k) => body.set(k, v));
  body.set("openid.mode", "check_authentication");
  const r = await fetch("https://steamcommunity.com/openid/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await r.text();
  return /is_valid\s*:\s*true/.test(text) ? steamId : null;
}
