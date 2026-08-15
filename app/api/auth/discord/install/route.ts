// `/api/auth/discord/install` — the bot install redirect.
//
// ===== THIS ROUTE CAPTURES SOMETHING NOTHING ELSE EVER CAN =====
//
// G1: **who installed the bot is captured here or lost forever.** Discord's
// API has no endpoint that answers it afterwards — not the guild object, not
// the audit log at our permission level, not a later refresh. If this handler
// returns without writing `installedByDiscordId`, the answer is gone for that
// server permanently and the guild registry has a hole nobody can fill.
//
// G2: if they are not signed in at this moment, **sign them in first and come
// back with the guild still selected.** Sending them to a login page that
// forgets which server they were installing into is how the capture gets lost
// in practice — they give up, or an admin finishes it later and we record the
// wrong person.

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../../../../lib/db/index.ts";
import {
  exchangeCode,
  fetchIdentity,
  fetchGuilds,
  installCallbackUrl,
  DiscordAuthError,
} from "../../../../../lib/auth/discord.ts";
import { decodeState } from "../../../../../lib/auth/oauth-state.ts";
import { shadowGamerForDiscord } from "../../../../../lib/identity/gamers.ts";
import { signIn, currentGamer } from "../../../../../lib/auth/current.ts";
import { recordGuildOwnership, seeAdmin } from "../../../../../lib/discord/ownership.ts";
import { registerGuild } from "../../../../../lib/discord/guilds.ts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  // Discord appends `guild_id` to the install redirect. It is the only place
  // it arrives, which is the other half of why this capture cannot be deferred.
  const guildId = params.get("guild_id");
  const state = decodeState(params.get("state"));

  if (!code || !guildId) {
    return NextResponse.redirect(
      new URL("/onboarding?error=" + encodeURIComponent("The install did not complete."), request.url),
      303,
    );
  }

  const db = await getDb();

  let identity;
  let guilds;
  try {
    const token = await exchangeCode(code, installCallbackUrl());
    identity = await fetchIdentity(token.accessToken);
    // `guilds` is in the install scope set, so ownership is discoverable here
    // without a second consent.
    guilds = token.scopes.includes("guilds") ? await fetchGuilds(token.accessToken) : [];
  } catch (e) {
    const message =
      e instanceof DiscordAuthError ? e.message : "Discord did not complete the install.";
    return NextResponse.redirect(
      new URL(`/onboarding?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }

  const summary = guilds.find((g) => g.id === guildId) ?? null;

  // ── The capture. Before anything that could fail or redirect. ───────────
  await registerGuild(db, {
    guildId,
    name: summary?.name ?? guildId,
    installedByDiscordId: identity.id,
    // Discord's own flag, read at the only moment it is free. Recorded
    // separately from `ownerDiscordId` because the registry shows both — an
    // admin who installed it and an owner who has never appeared is a very
    // common and very informative state (12 §8).
    installerWasOwner: Boolean(summary?.owner),
    ownerDiscordId: summary?.owner ? identity.id : null,
  });
  await seeAdmin(db, { guildId, discordId: identity.id, source: "administrator" });
  if (guilds.length > 0) await recordGuildOwnership(db, identity.id, guilds);

  // ── G2 · sign them in if they are not, and come back here ───────────────
  //
  // Deliberately AFTER the capture. Signing in first and capturing second
  // would put a redirect between Discord's answer and our write, which is the
  // one place the answer can be lost.
  const gamer = await currentGamer();
  if (!gamer) {
    const userId = await shadowGamerForDiscord(db, { discordId: identity.id });
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    if (row && row.displayName === identity.id) {
      await db
        .update(schema.users)
        .set({ displayName: identity.globalName || identity.username })
        .where(eq(schema.users.id, userId));
    }
    await signIn(userId);
  }

  const next = state?.next ?? `/portal/server/${guildId}?installed=1`;
  return NextResponse.redirect(new URL(next, request.url), 303);
}
