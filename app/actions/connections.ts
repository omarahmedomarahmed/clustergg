"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { uid, slugify } from "@/lib/utils";
import { ADAPTERS } from "@/lib/providers/adapters";
import { getProvider, isProviderLive } from "@/lib/providers/registry";
import { syncAccount } from "@/lib/sync";
import { evaluateBadgesForUser } from "@/lib/badges";
import { awardQuestAction } from "@/lib/quests";

export type LinkState = { error?: string; ok?: boolean } | undefined;

// Link a game account: verify against the provider's API, store, run first sync.
export async function linkGameAccount(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const me = await requireUser();
  const providerId = String(formData.get("provider") ?? "");
  const identifier = String(formData.get("identifier") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim() || undefined;

  const provider = getProvider(providerId);
  const adapter = ADAPTERS[providerId];
  if (!provider || !adapter) return { error: "Unknown provider." };
  if (!identifier) return { error: `Enter your ${provider.identifierLabel}.` };
  if (!isProviderLive(provider)) {
    return { error: `${provider.name} needs ${provider.envVars.join(" + ")} configured by the platform admin.` };
  }

  const verified = await adapter.verify(identifier, region);
  if (!verified.ok) return { error: verified.error };

  const db = await getDb();
  const [existing] = await db.select().from(schema.linkedGameAccounts).where(and(
    eq(schema.linkedGameAccounts.userId, me.id),
    eq(schema.linkedGameAccounts.provider, providerId),
    eq(schema.linkedGameAccounts.providerAccountId, verified.accountId),
  )).limit(1);
  if (existing) return { error: "That account is already linked." };

  const id = uid();
  await db.insert(schema.linkedGameAccounts).values({
    id, userId: me.id, provider: providerId,
    providerAccountId: verified.accountId, inGameName: verified.name,
    region: verified.region ?? region ?? null, verified: true, syncStatus: "pending",
  });

  const [account] = await db.select().from(schema.linkedGameAccounts)
    .where(eq(schema.linkedGameAccounts.id, id)).limit(1);
  if (account) await syncAccount(db, account);
  try { await evaluateBadgesForUser(db, me.id); } catch { /* non-fatal */ }
  await awardQuestAction(db, me.id, "connect_account", { refType: "account", refId: id });

  revalidatePath("/settings/connections");
  revalidatePath("/profile");
  revalidatePath("/onboarding");
  return { ok: true };
}

// ---------- Mobile Legends: two-step in-game verification-code link ----------
export type VcState = { error?: string; ok?: boolean; sent?: boolean } | undefined;

export async function mlbbSendCode(_prev: VcState, formData: FormData): Promise<VcState> {
  await requireUser();
  const roleId = String(formData.get("roleId") ?? "").trim();
  const zoneId = String(formData.get("zoneId") ?? "").trim();
  if (!/^\d+$/.test(roleId) || !/^\d+$/.test(zoneId)) {
    return { error: "Enter your numeric Player ID and Server (Zone) ID." };
  }
  const { isMlbbConfigured, sendVerificationCode } = await import("@/lib/providers/mlbb");
  if (!isMlbbConfigured()) return { error: "Mobile Legends isn't configured yet (MLBB_API_BASE)." };
  const r = await sendVerificationCode(roleId, zoneId);
  if (!r.ok) return { error: `Couldn't send the code: ${r.error}` };
  return { ok: true, sent: true };
}

export async function mlbbConfirmLink(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const me = await requireUser();
  const roleId = String(formData.get("roleId") ?? "").trim();
  const zoneId = String(formData.get("zoneId") ?? "").trim();
  const vc = String(formData.get("vc") ?? "").trim();
  if (!roleId || !zoneId) return { error: "Missing Player/Server ID — start over." };
  if (!/^\d{4,8}$/.test(vc)) return { error: "Enter the verification code from your in-game mail." };

  const { isMlbbConfigured, login } = await import("@/lib/providers/mlbb");
  if (!isMlbbConfigured()) return { error: "Mobile Legends isn't configured yet." };

  const r = await login(roleId, zoneId, vc);
  if (!r.ok) return { error: r.error };

  const { encryptSecret } = await import("@/lib/crypto");
  const db = await getDb();
  const providerAccountId = `${roleId}-${zoneId}`;
  const [existing] = await db.select().from(schema.linkedGameAccounts).where(and(
    eq(schema.linkedGameAccounts.userId, me.id),
    eq(schema.linkedGameAccounts.provider, "mobile-legends"),
    eq(schema.linkedGameAccounts.providerAccountId, providerAccountId),
  )).limit(1);

  const providerData = { token: encryptSecret(r.login.token), roleId, zoneId };
  const inGameName = r.login.name || `MLBB ${roleId}`;

  let accountId: string;
  if (existing) {
    // Reconnect: refresh the token, keep the account (and all its stats/points).
    accountId = existing.id;
    await db.update(schema.linkedGameAccounts)
      .set({ providerData: { ...(existing.providerData ?? {}), ...providerData }, inGameName, syncStatus: "pending", syncError: null, nextSyncAt: new Date(0) })
      .where(eq(schema.linkedGameAccounts.id, existing.id));
  } else {
    accountId = uid();
    await db.insert(schema.linkedGameAccounts).values({
      id: accountId, userId: me.id, provider: "mobile-legends",
      providerAccountId, inGameName, region: zoneId, verified: true,
      syncStatus: "pending", providerData,
    });
  }

  const [account] = await db.select().from(schema.linkedGameAccounts)
    .where(eq(schema.linkedGameAccounts.id, accountId)).limit(1);
  if (account) await syncAccount(db, account);
  try { await evaluateBadgesForUser(db, me.id); } catch { /* non-fatal */ }

  revalidatePath("/settings/connections");
  revalidatePath("/profile");
  revalidatePath("/onboarding");
  return { ok: true };
}

export async function unlinkGameAccount(accountId: string) {
  const me = await requireUser();
  const db = await getDb();
  await db.delete(schema.linkedGameAccounts).where(and(
    eq(schema.linkedGameAccounts.id, accountId),
    eq(schema.linkedGameAccounts.userId, me.id),
  ));
  revalidatePath("/settings/connections");
  revalidatePath("/profile");
}

export async function resyncGameAccount(accountId: string, path: string) {
  const me = await requireUser();
  const db = await getDb();
  const [account] = await db.select().from(schema.linkedGameAccounts).where(and(
    eq(schema.linkedGameAccounts.id, accountId),
    eq(schema.linkedGameAccounts.userId, me.id),
  )).limit(1);
  if (account) await syncAccount(db, account);
  revalidatePath(path);
}

// ---------- Profile / settings ----------
export type ProfileState = { error?: string; ok?: boolean } | undefined;

export async function updateProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const me = await requireUser();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim().slice(0, 400);
  const country = String(formData.get("country") ?? "").trim().toUpperCase().slice(0, 2);
  const rawSlug = String(formData.get("slug") ?? "").trim();
  const { normalizeLocale, LOCALE_COOKIE } = await import("@/lib/i18n/locale");
  const hasLocale = formData.has("locale");
  const locale = normalizeLocale(String(formData.get("locale") ?? "en"));
  if (displayName.length < 2) return { error: "Display name must be 2+ characters." };

  const db = await getDb();
  let slug = me.slug;
  if (rawSlug && rawSlug !== me.slug) {
    slug = slugify(rawSlug);
    const [taken] = await db.select({ id: schema.users.id }).from(schema.users)
      .where(eq(schema.users.slug, slug)).limit(1);
    if (taken && taken.id !== me.id) return { error: "That profile URL is taken." };
  }
  await db.update(schema.users)
    .set({ displayName, bio: bio || null, country: country || null, slug, ...(hasLocale ? { locale } : {}) })
    .where(eq(schema.users.id, me.id));
  if (hasLocale) {
    const { cookies } = await import("next/headers");
    (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  revalidatePath(`/u/${slug}`);
  revalidatePath("/profile");
  revalidatePath("/", "layout");
  return { ok: true };
}

// Save the full profile theme/customization JSON (from the profile builder).
export async function saveProfileTheme(theme: Record<string, unknown>, extras: { title?: string; bio?: string; avatarUrl?: string; bannerUrl?: string }) {
  const me = await requireUser();
  const db = await getDb();
  // NEVER store a base64 data URL inside the theme JSONB — a single background
  // image can be megabytes, and it gets re-read (and re-transferred from Neon)
  // on every profile/feed load. Re-host any inline images to Blob first.
  const { rehostDataUrlsInObject } = await import("@/lib/blob");
  await rehostDataUrlsInObject(theme, "theme");
  const patch: Record<string, unknown> = { theme };
  if (extras.title !== undefined) patch.title = extras.title.slice(0, 60) || null;
  if (extras.bio !== undefined) patch.bio = extras.bio.slice(0, 400) || null;
  if (extras.avatarUrl !== undefined) patch.avatarUrl = extras.avatarUrl.trim() || null;
  if (extras.bannerUrl !== undefined) patch.bannerUrl = extras.bannerUrl.trim() || null;
  await db.update(schema.users).set(patch).where(eq(schema.users.id, me.id));
  revalidatePath(`/u/${me.slug}`);
  revalidatePath("/profile");
  return { ok: true };
}

export async function updatePrivacy(formData: FormData) {
  const me = await requireUser();
  const db = await getDb();
  const visibility = String(formData.get("profileVisibility") ?? "public");
  const allowMessages = String(formData.get("allowMessagesFrom") ?? "everyone");
  await db.update(schema.users).set({
    profileVisibility: ["public", "followers", "private"].includes(visibility) ? visibility : "public",
    allowMessagesFrom: ["everyone", "following", "nobody"].includes(allowMessages) ? allowMessages : "everyone",
  }).where(eq(schema.users.id, me.id));
  revalidatePath("/settings/privacy");
}

export async function updateNotificationPrefs(formData: FormData) {
  const me = await requireUser();
  const db = await getDb();
  await db.update(schema.users)
    .set({ emailNotifications: formData.get("emailNotifications") === "on" })
    .where(eq(schema.users.id, me.id));
  revalidatePath("/settings/notifications");
}

export async function deleteAccount() {
  const me = await requireUser();
  const db = await getDb();
  await db.delete(schema.users).where(eq(schema.users.id, me.id));
  const { destroySession } = await import("@/lib/auth");
  await destroySession();
}
