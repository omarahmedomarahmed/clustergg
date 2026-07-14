import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { createSession, getSession } from "@/lib/auth";
import { uid, slugify } from "@/lib/utils";
import { oauthConfig, exchangeCode, verifySteamOpenId, appBaseUrl } from "@/lib/oauth";
import type { OAuthProfile } from "@/lib/oauth";

export const dynamic = "force-dynamic";

// Identity providers that also map to a stats game account we can link instantly.
const GAME_LINK: Record<string, string> = { steam: "steam" };

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const base = appBaseUrl(req.nextUrl.origin);
  const fail = (msg: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, base));

  const cfg = oauthConfig(provider);
  if (!cfg) return fail("unknown_provider");

  // Validate the anti-CSRF state against the cookie we set when starting.
  const store = await cookies();
  let flow: { state: string; next: string; intent: string; provider: string };
  try { flow = JSON.parse(store.get("oauth_flow")?.value ?? "{}"); } catch { return fail("bad_state"); }
  store.delete("oauth_flow");
  const sp = req.nextUrl.searchParams;
  const returnedState = cfg.kind === "openid" ? sp.get("st") : sp.get("state");
  if (!flow.state || flow.provider !== provider || returnedState !== flow.state) return fail("state_mismatch");

  // Resolve the third-party profile.
  let profile: OAuthProfile;
  try {
    if (cfg.kind === "openid") {
      const steamId = await verifySteamOpenId(sp);
      if (!steamId) return fail("steam_verify_failed");
      profile = await cfg.profile(steamId);
    } else {
      const code = sp.get("code");
      if (!code) return fail(sp.get("error") || "no_code");
      const token = await exchangeCode(provider, code, req.nextUrl.origin);
      profile = await cfg.userInfo(token);
    }
  } catch (e) {
    return fail(`profile_error_${String(e).slice(0, 40)}`);
  }

  const db = await getDb();
  const session = await getSession();
  const gameProvider = GAME_LINK[provider];

  // Ensure a Steam sign-in also links the Steam game account (+ first sync).
  const linkGameAccount = async (userId: string) => {
    if (!gameProvider) return;
    try {
      const [have] = await db.select({ id: schema.linkedGameAccounts.id }).from(schema.linkedGameAccounts)
        .where(and(eq(schema.linkedGameAccounts.userId, userId), eq(schema.linkedGameAccounts.provider, gameProvider), eq(schema.linkedGameAccounts.providerAccountId, profile.providerUserId))).limit(1);
      if (have) return;
      const accId = uid();
      await db.insert(schema.linkedGameAccounts).values({
        id: accId, userId, provider: gameProvider, providerAccountId: profile.providerUserId,
        inGameName: profile.username, verified: true, syncStatus: "pending",
      });
      const [acc] = await db.select().from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.id, accId)).limit(1);
      if (acc) { const { syncAccount } = await import("@/lib/sync"); await syncAccount(db, acc); }
    } catch { /* non-fatal — the game link can be retried from onboarding */ }
  };

  const attachIdentity = async (userId: string) => {
    await db.insert(schema.oauthIdentities).values({
      id: uid(), userId, provider, providerUserId: profile.providerUserId,
    }).onConflictDoNothing();
  };

  const finish = async (userId: string, role: string, dest: string) => {
    await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, userId));
    try { const { evaluateBadgesForUser } = await import("@/lib/badges"); await evaluateBadgesForUser(db, userId); } catch { /* non-fatal */ }
    await createSession(userId, role);
    return NextResponse.redirect(new URL(dest, base));
  };

  // 1) Linking to the currently signed-in account.
  if (flow.intent === "link" && session) {
    await attachIdentity(session.uid);
    if (provider === "discord") {
      await db.update(schema.users).set({ discordUsername: profile.username }).where(eq(schema.users.id, session.uid));
    }
    await linkGameAccount(session.uid);
    return finish(session.uid, session.role, flow.next || "/profile");
  }

  // 2) Known identity → log that gamer in.
  const [identity] = await db.select().from(schema.oauthIdentities)
    .where(and(eq(schema.oauthIdentities.provider, provider), eq(schema.oauthIdentities.providerUserId, profile.providerUserId))).limit(1);
  if (identity) {
    const [u] = await db.select({ id: schema.users.id, role: schema.users.role, status: schema.users.status }).from(schema.users).where(eq(schema.users.id, identity.userId)).limit(1);
    if (u && u.status === "active") { await linkGameAccount(u.id); return finish(u.id, u.role, flow.next || "/feed"); }
  }

  // 3) Same email as an existing account → attach identity and log in.
  if (profile.email) {
    const [u] = await db.select({ id: schema.users.id, role: schema.users.role, avatarUrl: schema.users.avatarUrl }).from(schema.users)
      .where(eq(schema.users.email, profile.email.toLowerCase())).limit(1);
    if (u) {
      await attachIdentity(u.id);
      const patch: Record<string, unknown> = {};
      if (provider === "discord") { patch.discordUsername = profile.username; if (!u.avatarUrl && profile.avatarUrl) patch.avatarUrl = profile.avatarUrl; }
      if (Object.keys(patch).length) await db.update(schema.users).set(patch).where(eq(schema.users.id, u.id));
      await linkGameAccount(u.id);
      return finish(u.id, u.role, flow.next || "/feed");
    }
  }

  // 4) Brand-new gamer → create the account (Discord avatar + handle become identity).
  let slug = slugify(profile.username) || `gamer-${uid().slice(0, 5).toLowerCase()}`;
  const [slugTaken] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.slug, slug)).limit(1);
  if (slugTaken) slug = `${slug}-${uid().slice(0, 4).toLowerCase()}`;

  const userId = uid();
  await db.insert(schema.users).values({
    id: userId,
    email: profile.email ? profile.email.toLowerCase() : null,
    displayName: profile.username,
    slug,
    avatarUrl: profile.avatarUrl ?? null,
    role: "user",
    primarySignupProvider: provider,
    discordUsername: provider === "discord" ? profile.username : null,
    isVerified: true,
    lastLoginAt: new Date(),
  });
  await attachIdentity(userId);
  await linkGameAccount(userId);
  return finish(userId, "user", "/onboarding");
}
