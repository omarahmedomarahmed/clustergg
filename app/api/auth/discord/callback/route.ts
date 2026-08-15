// `/api/auth/discord/callback` — the route 08-BUILD-ORDER calls "the route
// that does not exist yet". It exists now.
//
// Four things happen here, in this order, and the order matters:
//
//   1. Verify the state. An unsigned or stale callback is somebody else's
//      round trip, and we do not finish it.
//   2. Exchange the code for a token and read the identity.
//   3. Either sign them in, or link Discord to the gamer already signed in —
//      and **linking an identity somebody else holds is a route, not a
//      merge** (I1c1, U4b).
//   4. Discover guild ownership, if they granted `guilds`.
//
// Step 3 is the one to read twice. There is no branch in this file that
// combines two accounts, and there must never be one.

import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "../../../../../lib/db/index.ts";
import {
  exchangeCode,
  fetchIdentity,
  fetchGuilds,
  callbackUrl,
  DiscordAuthError,
} from "../../../../../lib/auth/discord.ts";
import { decodeState } from "../../../../../lib/auth/oauth-state.ts";
import { linkDiscord } from "../../../../../lib/identity/credentials.ts";
import { shadowGamerForDiscord } from "../../../../../lib/identity/gamers.ts";
import { signIn } from "../../../../../lib/auth/current.ts";
import { recordGuildOwnership } from "../../../../../lib/discord/ownership.ts";
import { schema } from "../../../../../lib/db/index.ts";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

function back(request: NextRequest, path: string, params: Record<string, string>) {
  const url = new URL(path, request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code");
  const state = decodeState(request.nextUrl.searchParams.get("state"));

  if (!state) {
    return back(request, "/login", {
      error: "That sign-in link has expired or did not start here. Try again.",
    });
  }
  if (!code) {
    // The user pressed Cancel on Discord's consent screen. Not an error.
    return back(request, state.next ?? "/login", { cancelled: "1" });
  }

  const db = await getDb();

  let identity;
  let scopes: string[] = [];
  try {
    const token = await exchangeCode(code, callbackUrl());
    scopes = token.scopes;
    identity = await fetchIdentity(token.accessToken);

    // ── Guild ownership, when they granted `guilds` ───────────────────────
    //
    // S0/S1 — what makes somebody a server manager is a linked Discord
    // identity that Discord says admins that guild. Discovered here, at
    // sign-in, and nowhere else on this path.
    if (scopes.includes("guilds")) {
      await recordGuildOwnership(db, identity.id, await fetchGuilds(token.accessToken));
    }
  } catch (e) {
    const message =
      e instanceof DiscordAuthError ? e.message : "Discord sign-in failed. Try again.";
    return back(request, state.next ?? "/login", { error: message });
  }

  // ── Linking, for somebody already signed in ─────────────────────────────
  if (state.kind === "link" && state.userId) {
    const outcome = await linkDiscord(db, state.userId, identity.id);
    if (outcome.kind === "elsewhere") {
      // ===== THE ROUTE. NOT A MERGE, NOT A REFUSAL =====
      //
      // Both accounts stay. The message tells them how to reach the other
      // one, and nothing here reconciles, transfers or flags anything for
      // later. U4b: two accounts for one person are permanent and fine.
      return back(request, state.next ?? "/settings/connections", {
        routed: outcome.message,
      });
    }
    return back(request, state.next ?? "/settings/connections", { linked: "1" });
  }

  // ── Signing in, or arriving for the first time ──────────────────────────
  //
  // `shadowGamerForDiscord` is idempotent on the Discord ID and will not
  // re-stamp a parent, so a returning gamer lands on their own row and a new
  // one gets a record holding nothing but their Discord ID (I5).
  const userId = await shadowGamerForDiscord(db, { discordId: identity.id });

  // The display name is filled in on the way through, because at this point
  // they have chosen to tell us who they are — but the age question still
  // gates everything else (I7), which onboarding enforces.
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (row && row.displayName === identity.id) {
    await db
      .update(schema.users)
      .set({ displayName: identity.globalName || identity.username })
      .where(eq(schema.users.id, userId));
  }

  await signIn(userId);
  return NextResponse.redirect(new URL(state.next ?? "/onboarding", request.url), 303);
}
