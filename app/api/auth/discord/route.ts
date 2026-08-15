// `/api/auth/discord` — start the round trip.
//
// One route, three reasons to be here, told apart by `kind`:
//
//   `signin`  — identity only. The common case, and the cheapest consent.
//   `link`    — the same, but the caller is already signed in and is adding
//               Discord to an existing gamer row (I1c).
//   `guilds`  — onboarding's server-owner path, which needs to list the
//               servers they admin. **This is the only place `guilds` is
//               asked for** (I10).

import { NextResponse, type NextRequest } from "next/server";
import { discordAuthUrl, discordConfigured } from "../../../../lib/auth/discord.ts";
import { encodeState, isSafePath } from "../../../../lib/auth/oauth-state.ts";
import { currentGamer } from "../../../../lib/auth/current.ts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!discordConfigured()) {
    // Fenced rather than thrown. A deployment without Discord credentials is
    // a working platform with one door shut, and the other door is email.
    return NextResponse.redirect(new URL("/signup?discord=unconfigured", request.url), 303);
  }

  const kind = request.nextUrl.searchParams.get("kind") ?? "signin";
  const rawNext = request.nextUrl.searchParams.get("next");
  const next = rawNext && isSafePath(rawNext) ? rawNext : undefined;
  const gamer = kind === "signin" ? null : await currentGamer();

  const state = encodeState({ kind, next, userId: gamer?.id });
  const scopes = kind === "guilds" ? (["identify", "guilds"] as const) : (["identify"] as const);

  return NextResponse.redirect(discordAuthUrl({ state, scopes: [...scopes] }), 303);
}
