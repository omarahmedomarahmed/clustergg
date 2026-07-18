"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, count } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireAdmin, requireStaff, hashPassword } from "@/lib/auth";
import { requireArea, setStaffGrants } from "@/lib/permissions";
import { uid, slugify } from "@/lib/utils";
import { newAccessKey, getCampaignReadiness } from "@/lib/brands";
import { syncAccount } from "@/lib/sync";

export type ActionState = { ok?: boolean; error?: string; message?: string } | undefined;

// Re-host every Higgsfield/cloudfront + inline data-URL image onto our own Vercel
// Blob storage, so Neon only ever stores short Blob links (kills the data-transfer
// bloat). Idempotent — safe to run any time from the storage audit page.
export async function rehostAllImagesNow(): Promise<ActionState> {
  await requireArea("storage");
  const db = await getDb();
  const { blobConfigured } = await import("@/lib/blob");
  if (!blobConfigured()) return { error: "Vercel Blob isn't configured (missing BLOB_READ_WRITE_TOKEN)." };
  const { rehostImagesToBlob } = await import("@/lib/db/seed");
  await rehostImagesToBlob(db);
  revalidatePath("/admin/storage");
  return { ok: true, message: "Re-hosted all external + inline images to Blob." };
}

// Platform logo (nav + footer) — image + framing, saved to the CMS. Applies
// site-wide immediately via a layout revalidation.
export async function saveBrandLogo(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireStaff();
  const { setContent } = await import("@/lib/cms");
  const url = String(formData.get("logoUrl") ?? "").trim();
  if (!url) return { error: "Upload a logo image first." };
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(v) ? v : min));
  await setContent("brand.logo", url);
  await setContent("brand.logo.zoom", String(clamp(Number(formData.get("zoom")), 0.5, 3)));
  await setContent("brand.logo.x", String(clamp(Number(formData.get("x")), 0, 100)));
  await setContent("brand.logo.y", String(clamp(Number(formData.get("y")), 0, 100)));
  await audit(admin.id, "brand.logo_update", "content", "brand.logo");
  revalidatePath("/", "layout");
  return { ok: true, message: "Platform logo updated everywhere." };
}

// Wordmark logo, per-placement display mode (mark / wordmark / both), and the
// loading-screen color + inner logo.
export async function saveBranding(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireStaff();
  const { setContent } = await import("@/lib/cms");
  const mode = (v: FormDataEntryValue | null) => (["mark", "wordmark", "both"].includes(String(v)) ? String(v) : "both");
  await setContent("brand.wordmark", String(formData.get("wordmark") ?? "").trim());
  const wmZoom = Number(formData.get("wordmarkZoom"));
  await setContent("brand.wordmark.zoom", String(Math.max(0.5, Math.min(3, Number.isFinite(wmZoom) ? wmZoom : 1))));
  await setContent("brand.nav.mode", mode(formData.get("navMode")));
  await setContent("brand.nav.planetsIcon", String(formData.get("planetsIcon") ?? "").trim());
  await setContent("brand.footer.mode", mode(formData.get("footerMode")));
  await setContent("brand.loading.color", String(formData.get("loadingColor") ?? "#8b5cf6").trim() || "#8b5cf6");
  await setContent("brand.loading.logo", String(formData.get("loadingLogo") ?? "").trim());
  await setContent("brand.loading.phrases", String(formData.get("loadingPhrases") ?? "").trim() || "Traversing the cluster…");
  // Loading screen: rotation timing, astronaut, background, wordmark, orb size.
  const lInt = Number(formData.get("loadingInterval"));
  await setContent("brand.loading.interval", String(Math.max(1, Math.min(20, Number.isFinite(lInt) && lInt > 0 ? lInt : 3))));
  if (formData.has("loadingAstronaut")) await setContent("brand.loading.astronaut", String(formData.get("loadingAstronaut") ?? "").trim());
  if (formData.has("loadingBg")) await setContent("brand.loading.bg", String(formData.get("loadingBg") ?? "").trim());
  await setContent("brand.loading.wordmark", formData.get("loadingWordmark") === "on" ? "1" : "0");
  const orbSize = Number(formData.get("loadingOrbSize"));
  await setContent("brand.loading.orbSize", String(Math.max(72, Math.min(200, Number.isFinite(orbSize) && orbSize > 0 ? orbSize : 80))));
  if (formData.has("orbIcon")) await setContent("brand.orb.icon", String(formData.get("orbIcon") ?? "").trim());
  if (formData.has("orbColor")) await setContent("brand.orb.color", String(formData.get("orbColor") ?? "#8b5cf6").trim() || "#8b5cf6");
  if (formData.has("orbSize")) { const os = Number(formData.get("orbSize")); await setContent("brand.orb.size", String(Math.max(44, Math.min(120, Number.isFinite(os) && os > 0 ? os : 56)))); }
  if (formData.has("questRocket")) await setContent("brand.quest.rocket", String(formData.get("questRocket") ?? "").trim());
  await setContent("brand.nav.bg", String(formData.get("navBg") ?? "").trim());
  await setContent("brand.footer.bg", String(formData.get("footerBg") ?? "").trim());
  await setContent("brand.favicon", String(formData.get("favicon") ?? "").trim());
  const cpIcon = String(formData.get("cpIcon") ?? "").trim();
  if (cpIcon) await setContent("brand.cpIcon", cpIcon);
  const favZoom = Number(formData.get("faviconZoom"));
  await setContent("brand.favicon.zoom", String(Math.max(1, Math.min(3, Number.isFinite(favZoom) ? favZoom : 1))));
  await audit(admin.id, "brand.branding_update", "content", "brand");
  revalidatePath("/", "layout");
  return { ok: true, message: "Branding updated everywhere." };
}

// Which connect/onboarding providers are shown. The form posts a `visible`
// checkbox per provider id; anything in `all` but not checked becomes hidden.
export async function saveConnectVisibility(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireStaff();
  const { setContent } = await import("@/lib/cms");
  const all = String(formData.get("allIds") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const visible = new Set(formData.getAll("visible").map((v) => String(v)));
  const hidden = all.filter((id) => !visible.has(id));
  await setContent("connect.hidden", hidden.join(","));
  await audit(admin.id, "connect.visibility_update", "content", "connect.hidden", { hidden });
  revalidatePath("/", "layout");
  return { ok: true, message: `Saved — ${all.length - hidden.length} shown, ${hidden.length} hidden.` };
}

// Per-page background images. One combined form posts `bg__<key>` for each
// editable page; empty clears back to the default nebula.
export async function savePageBackgrounds(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireStaff();
  const { setContent } = await import("@/lib/cms");
  const { PAGE_BG_KEYS } = await import("@/lib/page-bg");
  for (const key of PAGE_BG_KEYS) {
    await setContent(`page.bg.${key}`, String(formData.get(`bg__${key}`) ?? "").trim());
  }
  await audit(admin.id, "page.backgrounds_update", "content", "page.bg");
  revalidatePath("/", "layout");
  return { ok: true, message: "Page backgrounds saved." };
}

// Per-card-type artwork + overlay. One combined form posts `art__<type>` (url)
// and `dim__<type>` (0-100) for each card type.
export async function saveCardBackgrounds(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireStaff();
  const { setContent } = await import("@/lib/cms");
  const { CARD_BG_KEYS } = await import("@/lib/card-bg");
  const clamp = (v: number) => Math.max(0, Math.min(100, Number.isFinite(v) ? v : 55));
  for (const key of CARD_BG_KEYS) {
    await setContent(`card.bg.${key}`, String(formData.get(`art__${key}`) ?? "").trim());
    await setContent(`card.bg.${key}.dim`, String(clamp(Number(formData.get(`dim__${key}`)))));
  }
  await audit(admin.id, "card.backgrounds_update", "content", "card.bg");
  revalidatePath("/", "layout");
  return { ok: true, message: "Card backgrounds saved." };
}

async function audit(adminId: string, action: string, targetType?: string, targetId?: string, meta?: Record<string, unknown>) {
  const db = await getDb();
  await db.insert(schema.auditLog).values({ id: uid(), adminId, action, targetType, targetId, meta: meta ?? {} });
}

// ---------- Users ----------
export async function setUserStatus(userId: string, status: "active" | "suspended" | "banned") {
  const admin = await requireAdmin();
  const db = await getDb();
  await db.update(schema.users).set({ status }).where(eq(schema.users.id, userId));
  await audit(admin.id, `user.${status}`, "user", userId);
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

export async function setUserRole(userId: string, role: "user" | "admin" | "brand" | "staff") {
  const admin = await requireAdmin();
  // Admins can promote/demote staff; only superadmins can grant the admin role.
  if (role === "admin" && admin.role !== "superadmin") return;
  const db = await getDb();
  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!target || target.role === "superadmin") return;
  await db.update(schema.users).set({ role }).where(eq(schema.users.id, userId));
  await audit(admin.id, "user.role_change", "user", userId, { role });
  revalidatePath("/admin/roles");
}

// Admin configures which delegated areas the staff role can access. Admin-only.
export async function saveStaffAccess(formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const areas = formData.getAll("areas").map((a) => String(a));
  await setStaffGrants(areas);
  await audit(admin.id, "staff.access_change", "role", "staff", { areas });
  revalidatePath("/admin/roles");
  revalidatePath("/admin");
  return { ok: true, message: "Staff access updated." };
}

// Admin/staff password reset for any user (for people who lost access).
export async function adminResetPassword(userId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireStaff();
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  const db = await getDb();
  const [target] = await db.select({ id: schema.users.id, role: schema.users.role, email: schema.users.email })
    .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!target) return { error: "User not found." };
  // Only a superadmin may reset another superadmin's password.
  if (target.role === "superadmin" && admin.role !== "superadmin") return { error: "Only a superadmin can reset that account." };
  await db.update(schema.users).set({ passwordHash: hashPassword(password) }).where(eq(schema.users.id, userId));
  await audit(admin.id, "user.password_reset", "user", userId);
  return { ok: true, message: `Password updated. Share it with ${target.email}.` };
}

export async function adminUnlinkAccount(accountId: string) {
  const admin = await requireAdmin();
  const db = await getDb();
  await db.delete(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.id, accountId));
  await audit(admin.id, "linked_account.force_unlink", "linked_account", accountId);
  revalidatePath("/admin/linked-accounts");
}

export async function adminResyncAccount(accountId: string) {
  const admin = await requireAdmin();
  const db = await getDb();
  const [account] = await db.select().from(schema.linkedGameAccounts)
    .where(eq(schema.linkedGameAccounts.id, accountId)).limit(1);
  if (account) await syncAccount(db, account);
  await audit(admin.id, "linked_account.manual_resync", "linked_account", accountId);
  revalidatePath("/admin/linked-accounts");
}

// ---------- Badges ----------
export async function saveBadge(formData: FormData) {
  const admin = await requireStaff();
  const db = await getDb();
  const badgeId = String(formData.get("badgeId") ?? "");
  let criteria: Record<string, unknown> = {};
  try { criteria = JSON.parse(String(formData.get("criteria") ?? "{}")); } catch { /* keep {} */ }
  const values = {
    code: slugify(String(formData.get("code") ?? "")),
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    icon: String(formData.get("icon") ?? "b1"),
    category: String(formData.get("category") ?? "platform"),
    criteria,
    isActive: formData.get("isActive") === "on",
  };
  if (!values.name || !values.code) return;
  if (badgeId) {
    await db.update(schema.badges).set(values).where(eq(schema.badges.id, badgeId));
    await audit(admin.id, "badge.update", "badge", badgeId);
  } else {
    await db.insert(schema.badges).values({ id: uid(), ...values }).onConflictDoNothing();
    await audit(admin.id, "badge.create", "badge", values.code);
  }
  revalidatePath("/admin/badges");
}

export async function deleteBadge(badgeId: string) {
  const admin = await requireStaff();
  const db = await getDb();
  await db.delete(schema.badges).where(eq(schema.badges.id, badgeId));
  await audit(admin.id, "badge.delete", "badge", badgeId);
  revalidatePath("/admin/badges");
}

// ---------- Spaces ----------
export async function saveSpace(formData: FormData) {
  const admin = await requireStaff();
  const db = await getDb();
  const spaceId = String(formData.get("spaceId") ?? "");
  const values = {
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    game: String(formData.get("game") ?? "").trim() || null,
    coverEmoji: "",
    isActive: formData.get("isActive") === "on",
  };
  if (!values.name) return;
  if (spaceId) {
    await db.update(schema.spaces).set(values).where(eq(schema.spaces.id, spaceId));
    await audit(admin.id, "space.update", "space", spaceId);
  } else {
    await db.insert(schema.spaces).values({
      id: uid(), slug: slugify(values.name), createdBy: admin.id, ...values,
    }).onConflictDoNothing();
    await audit(admin.id, "space.create", "space", values.name);
  }
  revalidatePath("/admin/spaces");
  revalidatePath("/planets");
}

// Delete a planet (space) and its posts/members. Blocked when it still has
// challenges, so we never orphan competition data.
export async function deleteSpace(spaceId: string) {
  const admin = await requireStaff();
  const db = await getDb();
  const [ch] = await db.select({ c: count() }).from(schema.challenges).where(eq(schema.challenges.spaceId, spaceId));
  if (Number(ch?.c ?? 0) > 0) return; // keep planets that still have challenges
  await db.delete(schema.posts).where(eq(schema.posts.spaceId, spaceId));
  await db.delete(schema.spaceMembers).where(eq(schema.spaceMembers.spaceId, spaceId));
  await db.delete(schema.spaces).where(eq(schema.spaces.id, spaceId));
  await audit(admin.id, "space.delete", "space", spaceId);
  revalidatePath("/admin/spaces");
  revalidatePath("/planets");
}

// Create a planet for every active catalog game that doesn't have one yet, so
// there's always a planet per game.
export async function ensurePlanetsForGames() {
  const admin = await requireStaff();
  const db = await getDb();
  const games = await db.select().from(schema.games).where(eq(schema.games.isActive, true));
  const spaces = await db.select({ game: schema.spaces.game }).from(schema.spaces);
  const have = new Set(spaces.map((s) => s.game).filter(Boolean) as string[]);
  for (const g of games) {
    if (have.has(g.name)) continue;
    await db.insert(schema.spaces).values({
      id: uid(), slug: slugify(g.name), name: g.name, game: g.name,
      description: g.description || `The ${g.name} planet — leaderboards, challenges and community.`,
      createdBy: admin.id,
    }).onConflictDoNothing();
  }
  await audit(admin.id, "planets.ensure_for_games", "space");
  revalidatePath("/admin/spaces");
  revalidatePath("/planets");
}

// Delete legacy planets that aren't tied to a catalog game (and have no
// challenges) — the outdated "spaces" like hardware that were never games.
export async function deleteLegacyPlanets() {
  const admin = await requireStaff();
  const db = await getDb();
  const empties = await db.select().from(schema.spaces).where(isNull(schema.spaces.game));
  for (const s of empties) {
    const [ch] = await db.select({ c: count() }).from(schema.challenges).where(eq(schema.challenges.spaceId, s.id));
    if (Number(ch?.c ?? 0) > 0) continue;
    await db.delete(schema.posts).where(eq(schema.posts.spaceId, s.id));
    await db.delete(schema.spaceMembers).where(eq(schema.spaceMembers.spaceId, s.id));
    await db.delete(schema.spaces).where(eq(schema.spaces.id, s.id));
  }
  await audit(admin.id, "planets.delete_legacy", "space");
  revalidatePath("/admin/spaces");
  revalidatePath("/planets");
}

export async function reviewSpaceRequest(requestId: string, approve: boolean, note: string) {
  const admin = await requireStaff();
  const db = await getDb();
  const [request] = await db.select().from(schema.spaceRequests)
    .where(eq(schema.spaceRequests.id, requestId)).limit(1);
  if (!request || request.status !== "pending") return;
  await db.update(schema.spaceRequests).set({
    status: approve ? "approved" : "rejected",
    reviewedBy: admin.id, reviewNote: note || null, reviewedAt: new Date(),
  }).where(eq(schema.spaceRequests.id, requestId));
  if (approve) {
    await db.insert(schema.spaces).values({
      id: uid(), slug: slugify(request.proposedName), name: request.proposedName,
      description: request.reason.slice(0, 200), createdBy: admin.id,
    }).onConflictDoNothing();
  }
  await db.insert(schema.notifications).values({
    id: uid(), userId: request.requestedBy, type: "system",
    title: approve ? `Your space "${request.proposedName}" was approved!` : `Space request "${request.proposedName}" was declined`,
    body: note || undefined, href: "/planets",
  });
  await audit(admin.id, approve ? "space_request.approve" : "space_request.reject", "space_request", requestId);
  revalidatePath("/admin/spaces/requests");
}

export async function adminDeletePost(postId: string) {
  const admin = await requireStaff();
  const db = await getDb();
  await db.update(schema.posts).set({ deletedAt: new Date() }).where(eq(schema.posts.id, postId));
  await audit(admin.id, "post.delete", "post", postId);
  revalidatePath("/admin/spaces");
}

export async function togglePinPost(postId: string, pin: boolean, path: string) {
  const admin = await requireStaff();
  const db = await getDb();
  await db.update(schema.posts).set({ isPinned: pin }).where(eq(schema.posts.id, postId));
  await audit(admin.id, pin ? "post.pin" : "post.unpin", "post", postId);
  revalidatePath(path);
}

// ---------- Challenges ----------
export async function saveChallenge(formData: FormData) {
  const admin = await requireStaff();
  const db = await getDb();
  const challengeId = String(formData.get("challengeId") ?? "");

  let pointsEngine: Record<string, number> = {};
  const rawPoints = String(formData.get("pointsEngine") ?? "{}");
  try {
    const parsed = JSON.parse(rawPoints);
    for (const [k, v] of Object.entries(parsed)) {
      const n = Number(v);
      if (Number.isFinite(n)) pointsEngine[k] = n;
    }
  } catch { pointsEngine = {}; }

  let conditions: { metric: string; op: string; value: number }[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("conditions") ?? "[]"));
    if (Array.isArray(parsed)) {
      conditions = parsed
        .filter((c) => c && typeof c.metric === "string" && Number.isFinite(Number(c.value)))
        .map((c) => ({ metric: c.metric, op: String(c.op ?? ">="), value: Number(c.value) }));
    }
  } catch { conditions = []; }

  const cadence = String(formData.get("cadence") ?? "custom");
  const startAt = new Date(String(formData.get("startAt") ?? new Date().toISOString()));
  const cadenceDays: Record<string, number> = { daily: 1, weekly: 7, monthly: 30 };
  const endAt = cadenceDays[cadence]
    ? new Date(startAt.getTime() + cadenceDays[cadence] * 86400000)
    : new Date(String(formData.get("endAt") ?? new Date(Date.now() + 7 * 86400000).toISOString()));
  const adjust = {
    zoom: Number(formData.get("coverZoom")) || 1,
    x: Number(formData.get("coverX")) || 50,
    y: Number(formData.get("coverY")) || 50,
  };
  const values = {
    spaceId: String(formData.get("spaceId") ?? ""),
    game: String(formData.get("game") ?? "").trim(),
    provider: String(formData.get("provider") ?? "").trim(),
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    format: String(formData.get("format") ?? "top3"),
    rules: { conditions },
    pointsEngine,
    thresholdTarget: Number(formData.get("thresholdTarget")) || null,
    gateQuestId: String(formData.get("gateQuestId") ?? "").trim() || null,
    gateMinBadges: Math.max(0, Number(formData.get("gateMinBadges")) || 0),
    startAt,
    endAt,
    cadence,
    heroType: String(formData.get("heroType") ?? "image"),
    heroUrl: String(formData.get("heroUrl") ?? "").trim() || null,
    coverUrl: String(formData.get("coverUrl") ?? "").trim() || null,
    coverAdjust: adjust,
    trophyId: String(formData.get("trophyId") ?? "").trim() || null,
    status: String(formData.get("status") ?? "draft"),
    prizeDescription: String(formData.get("prizeDescription") ?? "").trim() || null,
  };
  if (!values.title || !values.spaceId || !values.provider) return;

  if (challengeId) {
    await db.update(schema.challenges).set(values).where(eq(schema.challenges.id, challengeId));
    await audit(admin.id, "challenge.update", "challenge", challengeId);
    revalidatePath(`/admin/challenges/${challengeId}`);
  } else {
    await db.insert(schema.challenges).values({ id: uid(), createdBy: admin.id, ...values });
    await audit(admin.id, "challenge.create", "challenge", values.title);
  }
  revalidatePath("/admin/challenges");
}

export async function setParticipantStatus(participantId: string, status: "active" | "disqualified", challengeId: string) {
  const admin = await requireStaff();
  const db = await getDb();
  await db.update(schema.challengeParticipants).set({ status })
    .where(eq(schema.challengeParticipants.id, participantId));
  await audit(admin.id, `challenge_participant.${status}`, "challenge_participant", participantId);
  revalidatePath(`/admin/challenges/${challengeId}`);
}

// ---------- Brands / campaigns / creatives ----------
export async function saveBrand(formData: FormData) {
  const admin = await requireArea("ads");
  const db = await getDb();
  const brandId = String(formData.get("brandId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const values = {
    name,
    about: String(formData.get("about") ?? "").trim() || null,
    logoUrl: String(formData.get("logoUrl") ?? "").trim() || null,
    coverUrl: String(formData.get("coverUrl") ?? "").trim() || null,
    industry: String(formData.get("industry") ?? "other"),
    contactEmail: String(formData.get("contactEmail") ?? "").trim() || null,
    status: String(formData.get("status") ?? "active"),
  };
  if (brandId) {
    await db.update(schema.brands).set(values).where(eq(schema.brands.id, brandId));
    await audit(admin.id, "brand.update", "brand", brandId);
    revalidatePath(`/admin/brands/${brandId}`);
  } else {
    // New brand gets a unique portal slug + an access key automatically.
    const base = slugify(name) || "brand";
    let slug = base, n = 2;
    while ((await db.select({ id: schema.brands.id }).from(schema.brands).where(eq(schema.brands.slug, slug)).limit(1)).length) slug = `${base}-${n++}`;
    await db.insert(schema.brands).values({ id: uid(), slug, accessKey: newAccessKey(), ...values });
    await audit(admin.id, "brand.create", "brand", values.name);
  }
  revalidatePath("/admin/brands");
  revalidatePath("/admin/ads");
}

// Rotate a brand's portal access key (invalidates the old shared link).
export async function regenerateBrandKey(brandId: string) {
  const admin = await requireArea("ads");
  const db = await getDb();
  const key = newAccessKey();
  await db.update(schema.brands).set({ accessKey: key }).where(eq(schema.brands.id, brandId));
  await audit(admin.id, "brand.key_reset", "brand", brandId);
  revalidatePath(`/admin/brands/${brandId}`);
  revalidatePath("/admin/ads");
  return key;
}

// Launch a campaign — only if every placement has a creative assigned.
export async function launchCampaign(campaignId: string) {
  const admin = await requireArea("ads");
  const db = await getDb();
  const { ready } = await getCampaignReadiness(db, campaignId);
  if (!ready) return { error: "Every placement needs a creative before launch." };
  await db.update(schema.adCampaigns).set({ status: "active", launchedAt: new Date() }).where(eq(schema.adCampaigns.id, campaignId));
  await audit(admin.id, "campaign.launch", "campaign", campaignId);
  revalidatePath("/admin/ads");
  return { ok: true };
}

export async function setCampaignStatus(campaignId: string, status: "active" | "paused" | "draft" | "completed") {
  const admin = await requireArea("ads");
  const db = await getDb();
  await db.update(schema.adCampaigns).set({ status }).where(eq(schema.adCampaigns.id, campaignId));
  await audit(admin.id, `campaign.${status}`, "campaign", campaignId);
  revalidatePath("/admin/ads");
}

// Admin reply in the shared brand inbox.
export async function adminSendBrandMessage(brandId: string, formData: FormData) {
  const admin = await requireArea("ads");
  const db = await getDb();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  await db.insert(schema.brandMessages).values({ id: uid(), brandId, sender: "admin", body, readByAdmin: true });
  await audit(admin.id, "brand.message", "brand", brandId);
  revalidatePath(`/admin/brands/${brandId}`);
  revalidatePath("/admin/ads");
}

export async function saveCampaign(brandId: string, formData: FormData) {
  const admin = await requireArea("ads");
  const db = await getDb();
  const campaignId = String(formData.get("campaignId") ?? "");
  const values = {
    name: String(formData.get("name") ?? "").trim(),
    startDate: new Date(String(formData.get("startDate") ?? new Date().toISOString())),
    endDate: new Date(String(formData.get("endDate") ?? new Date(Date.now() + 30 * 86400000).toISOString())),
    budget: Number(formData.get("budget")) || null,
    targetGeo: String(formData.get("targetGeo") ?? "").trim() || null,
    targetDevice: String(formData.get("targetDevice") ?? "both"),
    status: String(formData.get("status") ?? "active"),
    coverUrl: String(formData.get("coverUrl") ?? "").trim() || null,
    logoUrl: String(formData.get("logoUrl") ?? "").trim() || null,
  };
  if (!values.name) return;
  if (campaignId) {
    await db.update(schema.adCampaigns).set(values).where(eq(schema.adCampaigns.id, campaignId));
    await audit(admin.id, "campaign.update", "campaign", campaignId);
    revalidatePath(`/admin/ads/campaign/${campaignId}`);
  } else {
    await db.insert(schema.adCampaigns).values({ id: uid(), brandId, ...values });
    await audit(admin.id, "campaign.create", "campaign", values.name);
  }
  revalidatePath(`/admin/brands/${brandId}`);
}

// Admin: upload (or replace) the creative for one placement of a campaign in a
// single step — the campaign-page equivalent of the brand portal's uploader.
export async function adminUploadCreativeToPlacement(campaignId: string, formData: FormData) {
  const admin = await requireStaff();
  const db = await getDb();
  const placementId = String(formData.get("placementId") ?? "");
  const fileUrl = String(formData.get("fileUrl") ?? "").trim();
  const type = String(formData.get("type") ?? "image");
  const clickUrl = String(formData.get("clickUrl") ?? "").trim() || null;
  if (!placementId || !fileUrl) return { error: "Pick a placement and upload a creative." };
  const [campaign] = await db.select().from(schema.adCampaigns).where(eq(schema.adCampaigns.id, campaignId)).limit(1);
  const [placement] = await db.select().from(schema.adPlacements).where(eq(schema.adPlacements.id, placementId)).limit(1);
  if (!campaign || !placement) return { error: "Unknown campaign or placement." };

  const creativeId = uid();
  await db.insert(schema.adCreatives).values({
    id: creativeId, brandId: campaign.brandId, name: `${placement.key}`, type,
    fileUrl, clickUrl, width: placement.width, height: placement.height,
    durationSeconds: type === "video" ? 5 : null, status: "approved",
  });
  await db.delete(schema.adCampaignCreatives).where(and(
    eq(schema.adCampaignCreatives.campaignId, campaignId),
    eq(schema.adCampaignCreatives.placementId, placementId)));
  await db.insert(schema.adCampaignCreatives).values({ id: uid(), campaignId, creativeId, placementId, weight: 1, priority: 0 });
  await audit(admin.id, "creative.upload", "campaign", campaignId);
  revalidatePath(`/admin/ads/campaign/${campaignId}`);
  return { ok: true };
}

export async function saveCreative(formData: FormData) {
  const admin = await requireArea("ads");
  const db = await getDb();
  const durationRaw = Number(formData.get("durationSeconds")) || null;
  const type = String(formData.get("type") ?? "image");
  // Video ads are hard-capped at 5 seconds at upload validation (plan §11).
  if (type === "video" && durationRaw != null && durationRaw > 5) return;
  const values = {
    brandId: String(formData.get("brandId") ?? ""),
    name: String(formData.get("name") ?? "").trim(),
    type,
    fileUrl: String(formData.get("fileUrl") ?? "").trim(),
    clickUrl: String(formData.get("clickUrl") ?? "").trim() || null,
    width: Number(formData.get("width")) || null,
    height: Number(formData.get("height")) || null,
    durationSeconds: type === "video" ? Math.min(durationRaw ?? 5, 5) : null,
  };
  if (!values.name || !values.fileUrl || !values.brandId) return;
  await db.insert(schema.adCreatives).values({ id: uid(), status: "pending_review", ...values });
  await audit(admin.id, "creative.create", "creative", values.name);
  revalidatePath("/admin/creatives");
}

// Create many creatives in one save from a list of already-uploaded Blob URLs
// (bulk multi-file upload on the creatives page). Each becomes its own creative.
export async function saveCreativesBulk(formData: FormData) {
  const admin = await requireArea("ads");
  const db = await getDb();
  const brandId = String(formData.get("brandId") ?? "");
  let items: { url: string; name: string; type?: string }[] = [];
  try { items = JSON.parse(String(formData.get("items") ?? "[]")); } catch { items = []; }
  if (!brandId || items.length === 0) return;
  const rows = items
    .filter((it) => it.url && it.url.trim())
    .map((it) => ({
      id: uid(), brandId, status: "pending_review" as const,
      name: (it.name || "Creative").slice(0, 120),
      type: it.type === "video" ? "video" : "image",
      fileUrl: it.url.trim(), clickUrl: null, width: null, height: null, durationSeconds: null,
    }));
  if (rows.length === 0) return;
  await db.insert(schema.adCreatives).values(rows);
  await audit(admin.id, "creative.bulk_create", "creative", `${rows.length} creatives`);
  revalidatePath("/admin/creatives");
}

export async function reviewCreative(creativeId: string, approve: boolean) {
  const admin = await requireArea("ads");
  const db = await getDb();
  await db.update(schema.adCreatives).set({ status: approve ? "approved" : "rejected" })
    .where(eq(schema.adCreatives.id, creativeId));
  await audit(admin.id, approve ? "creative.approve" : "creative.reject", "creative", creativeId);
  revalidatePath("/admin/creatives");
}

export async function assignCreative(formData: FormData) {
  const admin = await requireArea("ads");
  const db = await getDb();
  const values = {
    campaignId: String(formData.get("campaignId") ?? ""),
    creativeId: String(formData.get("creativeId") ?? ""),
    placementId: String(formData.get("placementId") ?? ""),
    weight: Number(formData.get("weight")) || 1,
    priority: Number(formData.get("priority")) || 0,
  };
  if (!values.campaignId || !values.creativeId || !values.placementId) return;
  // Don't double-assign the same creative to the same placement in the same campaign.
  const [dupe] = await db.select({ id: schema.adCampaignCreatives.id }).from(schema.adCampaignCreatives)
    .where(and(
      eq(schema.adCampaignCreatives.campaignId, values.campaignId),
      eq(schema.adCampaignCreatives.creativeId, values.creativeId),
      eq(schema.adCampaignCreatives.placementId, values.placementId),
    )).limit(1);
  if (dupe) return;
  await db.insert(schema.adCampaignCreatives).values({ id: uid(), ...values });
  await audit(admin.id, "campaign_creative.assign", "campaign_creative", values.creativeId);
  revalidatePath("/admin/ads/schedule");
  revalidatePath("/admin/creatives");
  revalidatePath("/admin/placements");
  revalidatePath(`/admin/ads/campaign/${values.campaignId}`);
}

export async function removeAssignment(id: string) {
  const admin = await requireArea("ads");
  const db = await getDb();
  await db.delete(schema.adCampaignCreatives).where(eq(schema.adCampaignCreatives.id, id));
  await audit(admin.id, "campaign_creative.remove", "campaign_creative", id);
  revalidatePath("/admin/ads/schedule");
  revalidatePath("/admin/creatives");
  revalidatePath("/admin/placements");
}

export async function savePlacement(formData: FormData) {
  const admin = await requireArea("ads");
  const db = await getDb();
  const placementId = String(formData.get("placementId") ?? "");
  const values = {
    pageScope: String(formData.get("pageScope") ?? "").trim(),
    device: String(formData.get("device") ?? "both"),
    width: Number(formData.get("width")) || 728,
    height: Number(formData.get("height")) || 90,
    maxCreativesInRotation: Number(formData.get("maxCreativesInRotation")) || 3,
    rotationIntervalSeconds: Number(formData.get("rotationIntervalSeconds")) || 5,
  };
  if (placementId) {
    await db.update(schema.adPlacements).set(values).where(eq(schema.adPlacements.id, placementId));
    await audit(admin.id, "placement.update", "placement", placementId);
  }
  revalidatePath("/admin/placements");
}

// ---------- Leaderboards ----------
export async function saveLeaderboard(formData: FormData) {
  const admin = await requireStaff();
  const db = await getDb();
  const lbId = String(formData.get("lbId") ?? "");
  const values = {
    game: String(formData.get("game") ?? "").trim(),
    metricKey: String(formData.get("metricKey") ?? "").trim(),
    title: String(formData.get("title") ?? "").trim(),
    unit: String(formData.get("unit") ?? "").trim() || null,
    sortDir: String(formData.get("sortDir") ?? "desc"),
    isActive: formData.get("isActive") === "on",
  };
  if (!values.game || !values.metricKey || !values.title) return;
  if (lbId) {
    await db.update(schema.leaderboards).set(values).where(eq(schema.leaderboards.id, lbId));
    await audit(admin.id, "leaderboard.update", "leaderboard", lbId);
  } else {
    await db.insert(schema.leaderboards).values({ id: uid(), ...values }).onConflictDoNothing();
    await audit(admin.id, "leaderboard.create", "leaderboard", values.title);
  }
  revalidatePath("/admin/leaderboards");
  revalidatePath("/leaderboards");
}

export async function deleteLeaderboard(lbId: string) {
  const admin = await requireStaff();
  const db = await getDb();
  await db.delete(schema.leaderboards).where(eq(schema.leaderboards.id, lbId));
  await audit(admin.id, "leaderboard.delete", "leaderboard", lbId);
  revalidatePath("/admin/leaderboards");
}

// ---------- Games catalog ----------
function parseCustomMetrics(raw: string): { key: string; label: string; unit?: string; higherIsBetter?: boolean }[] {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((m) => m && typeof m.label === "string" && m.label.trim())
      .slice(0, 24)
      .map((m) => ({
        key: String(m.key ?? m.label).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "metric",
        label: String(m.label).trim().slice(0, 60),
        unit: m.unit ? String(m.unit).trim().slice(0, 16) : undefined,
        higherIsBetter: m.higherIsBetter !== false,
      }));
  } catch { return []; }
}

export async function saveGame(formData: FormData) {
  const admin = await requireStaff();
  const db = await getDb();
  const gameId = String(formData.get("gameId") ?? "");
  const values = {
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    logoUrl: String(formData.get("logoUrl") ?? "").trim() || null,
    coverUrl: String(formData.get("coverUrl") ?? "").trim() || null,
    planetImageUrl: String(formData.get("planetImageUrl") ?? "").trim() || null,
    planetBgUrl: String(formData.get("planetBgUrl") ?? "").trim() || null,
    coverAdjust: {
      zoom: Number(formData.get("coverZoom")) || 1,
      x: Number(formData.get("coverX")) || 50,
      y: Number(formData.get("coverY")) || 50,
    },
    sortOrder: Number(formData.get("sortOrder")) || 0,
    showInNav: formData.get("showInNav") === "on",
    isActive: formData.get("isActive") === "on",
    customMetrics: parseCustomMetrics(String(formData.get("customMetrics") ?? "[]")),
    accent: String(formData.get("accent") ?? "").trim() || null,
    accent2: String(formData.get("accent2") ?? "").trim() || null,
    planetLayout: ["auto", "globe", "cover"].includes(String(formData.get("planetLayout"))) ? String(formData.get("planetLayout")) : "auto",
  };
  if (!values.name) return;
  if (gameId) {
    await db.update(schema.games).set(values).where(eq(schema.games.id, gameId));
    await audit(admin.id, "game.update", "game", gameId);
  } else {
    await db.insert(schema.games).values({ id: uid(), slug: slugify(values.name), ...values }).onConflictDoNothing();
    await audit(admin.id, "game.create", "game", values.name);
  }
  revalidatePath("/admin/games");
  revalidatePath("/planets");
  revalidatePath("/");
}

export async function deleteGame(gameId: string) {
  const admin = await requireStaff();
  const db = await getDb();
  await db.delete(schema.games).where(eq(schema.games.id, gameId));
  await audit(admin.id, "game.delete", "game", gameId);
  revalidatePath("/admin/games");
  revalidatePath("/planets");
}

// Upload/replace a game's planet globe skin + space background from the pin
// editor — a reliable per-planet home for the globe art (the games form is busy).
export async function savePlanetArt(gameId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireStaff();
  const db = await getDb();
  const planetImageUrl = String(formData.get("planetImageUrl") ?? "").trim() || null;
  const planetBgUrl = String(formData.get("planetBgUrl") ?? "").trim() || null;
  await db.update(schema.games).set({ planetImageUrl, planetBgUrl }).where(eq(schema.games.id, gameId));
  await audit(admin.id, "game.planet_art", "game", gameId);
  revalidatePath("/admin/games");
  revalidatePath(`/admin/games/${gameId}/planet`);
  revalidatePath("/planets");
  revalidatePath("/");
  return { ok: true, message: "Planet globe art saved." };
}

// Save per-game globe region pins (position/label/color overrides) from the
// visual pin editor. Values arrive as a single JSON blob built client-side.
export async function savePlanetPins(gameId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireStaff();
  const db = await getDb();
  let pins: Record<string, { x: number; y: number; color: string; label: string }> = {};
  try {
    const parsed = JSON.parse(String(formData.get("pins") ?? "{}"));
    if (parsed && typeof parsed === "object") {
      for (const [key, v] of Object.entries(parsed as Record<string, { x: number; y: number; color: string; label: string }>)) {
        pins[key] = {
          x: Math.max(0, Math.min(100, Number(v.x))),
          y: Math.max(0, Math.min(100, Number(v.y))),
          color: String(v.color || "").slice(0, 12),
          label: String(v.label || "").slice(0, 40),
        };
      }
    }
  } catch { pins = {}; }
  await db.update(schema.games).set({ planetPins: pins }).where(eq(schema.games.id, gameId));
  await audit(admin.id, "game.planet_pins", "game", gameId);
  revalidatePath("/admin/games");
  revalidatePath("/planets");
  revalidatePath("/");
  return { ok: true, message: "Planet pins saved." };
}

// ---------- Partners ("Trusted by") ----------
export async function savePartner(formData: FormData) {
  const admin = await requireStaff();
  const db = await getDb();
  const partnerId = String(formData.get("partnerId") ?? "");
  const values = {
    name: String(formData.get("name") ?? "").trim(),
    logoUrl: String(formData.get("logoUrl") ?? "").trim(),
    url: String(formData.get("url") ?? "").trim() || null,
    sortOrder: Number(formData.get("sortOrder")) || 0,
    isActive: formData.get("isActive") === "on",
  };
  if (!values.name || !values.logoUrl) return;
  if (partnerId) {
    await db.update(schema.partners).set(values).where(eq(schema.partners.id, partnerId));
    await audit(admin.id, "partner.update", "partner", partnerId);
  } else {
    await db.insert(schema.partners).values({ id: uid(), ...values });
    await audit(admin.id, "partner.create", "partner", values.name);
  }
  revalidatePath("/admin/partners");
  revalidatePath("/");
}

export async function deletePartner(partnerId: string) {
  const admin = await requireStaff();
  const db = await getDb();
  await db.delete(schema.partners).where(eq(schema.partners.id, partnerId));
  await audit(admin.id, "partner.delete", "partner", partnerId);
  revalidatePath("/admin/partners");
  revalidatePath("/");
}

// ---------- Trophies ----------
export async function saveTrophy(formData: FormData) {
  const admin = await requireStaff();
  const db = await getDb();
  const trophyId = String(formData.get("trophyId") ?? "");
  const values = {
    name: String(formData.get("name") ?? "").trim(),
    imageUrl: String(formData.get("imageUrl") ?? "").trim(),
    tier: String(formData.get("tier") ?? "gold"),
    game: String(formData.get("game") ?? "").trim() || null,
  };
  if (!values.name || !values.imageUrl) return;
  if (trophyId) {
    await db.update(schema.trophies).set(values).where(eq(schema.trophies.id, trophyId));
    await audit(admin.id, "trophy.update", "trophy", trophyId);
  } else {
    await db.insert(schema.trophies).values({ id: uid(), ...values });
    await audit(admin.id, "trophy.create", "trophy", values.name);
  }
  revalidatePath("/admin/trophies");
}

export async function deleteTrophy(trophyId: string) {
  const admin = await requireStaff();
  const db = await getDb();
  await db.delete(schema.trophies).where(eq(schema.trophies.id, trophyId));
  await audit(admin.id, "trophy.delete", "trophy", trophyId);
  revalidatePath("/admin/trophies");
}

// ---------- Site content (CMS) ----------
export async function saveContent(formData: FormData) {
  const admin = await requireStaff();
  const { setContent } = await import("@/lib/cms");
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("content:") && typeof value === "string") {
      await setContent(key.slice("content:".length), value.trim());
    }
  }
  await audit(admin.id, "content.update", "site_content");
  revalidatePath("/", "layout");
}
