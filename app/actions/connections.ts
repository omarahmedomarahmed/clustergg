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

  revalidatePath("/settings/connections");
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
    .set({ displayName, bio: bio || null, country: country || null, slug })
    .where(eq(schema.users.id, me.id));
  revalidatePath(`/u/${slug}`);
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
