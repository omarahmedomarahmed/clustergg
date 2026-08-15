// The `state` parameter, signed.
//
// Without it an OAuth callback accepts a code from anybody, and the browser it
// lands in can be pointed anywhere the attacker chose. With it, the callback
// can prove the round trip started here and read back what it was for —
// which guild was being installed into, where to return afterwards.
//
// Signed rather than stored, so it survives a cold start and needs no table.
// The payload is not secret; what matters is that it cannot be forged.

import { signPayload, verifyPayload } from "../core/portal-auth.ts";

export type OAuthState = {
  /** `signin` | `link` | `install` | `guilds` */
  kind: string;
  /** Where to send them afterwards. Always a path on this site, never a URL. */
  next?: string;
  /** The guild being installed into, when there is one. */
  guildId?: string;
  /** The gamer already signed in, when there is one. */
  userId?: string;
  /** Minted at, as epoch ms — so a stale round trip can be refused. */
  at: number;
};

/** Ten minutes. An OAuth round trip takes seconds; an hour-old one is a replay. */
export const STATE_TTL_MS = 10 * 60 * 1000;

export function encodeState(state: Omit<OAuthState, "at">, now = new Date()): string {
  const payload = Buffer.from(JSON.stringify({ ...state, at: now.getTime() })).toString(
    "base64url",
  );
  return `${payload}.${signPayload(payload)}`;
}

export function decodeState(raw: string | null, now = new Date()): OAuthState | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;

  const payload = raw.slice(0, dot);
  if (!verifyPayload(payload, raw.slice(dot + 1))) return null;

  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    if (typeof state.at !== "number") return null;
    if (now.getTime() - state.at > STATE_TTL_MS) return null;
    // `next` is a path on this site or it is nothing. A full URL here is an
    // open redirect, and an open redirect on a sign-in route is a phishing
    // page with our domain in the address bar.
    if (state.next && !isSafePath(state.next)) return null;
    return state;
  } catch {
    return null;
  }
}

/**
 * A path, not a URL, and not a protocol-relative one.
 *
 * `//evil.test` is a valid URL that starts with a slash, which is why the
 * second character is checked as well as the first.
 */
export function isSafePath(next: string): boolean {
  return next.startsWith("/") && !next.startsWith("//");
}
