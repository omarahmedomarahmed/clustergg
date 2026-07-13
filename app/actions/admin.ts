"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { uid, slugify } from "@/lib/utils";
import { syncAccount } from "@/lib/sync";

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
  const admin = await requireAdmin();
  const db = await getDb();
  const brandId = String(formData.get("brandId") ?? "");
  const values = {
    name: String(formData.get("name") ?? "").trim(),
    industry: String(formData.get("industry") ?? "other"),
    contactEmail: String(formData.get("contactEmail") ?? "").trim() || null,
    status: String(formData.get("status") ?? "active"),
  };
  if (!values.name) return;
  if (brandId) {
    await db.update(schema.brands).set(values).where(eq(schema.brands.id, brandId));
    await audit(admin.id, "brand.update", "brand", brandId);
  } else {
    await db.insert(schema.brands).values({ id: uid(), ...values });
    await audit(admin.id, "brand.create", "brand", values.name);
  }
  revalidatePath("/admin/brands");
}

export async function saveCampaign(brandId: string, formData: FormData) {
  const admin = await requireAdmin();
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
  };
  if (!values.name) return;
  if (campaignId) {
    await db.update(schema.adCampaigns).set(values).where(eq(schema.adCampaigns.id, campaignId));
    await audit(admin.id, "campaign.update", "campaign", campaignId);
  } else {
    await db.insert(schema.adCampaigns).values({ id: uid(), brandId, ...values });
    await audit(admin.id, "campaign.create", "campaign", values.name);
  }
  revalidatePath(`/admin/brands/${brandId}`);
}

export async function saveCreative(formData: FormData) {
  const admin = await requireAdmin();
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

export async function reviewCreative(creativeId: string, approve: boolean) {
  const admin = await requireAdmin();
  const db = await getDb();
  await db.update(schema.adCreatives).set({ status: approve ? "approved" : "rejected" })
    .where(eq(schema.adCreatives.id, creativeId));
  await audit(admin.id, approve ? "creative.approve" : "creative.reject", "creative", creativeId);
  revalidatePath("/admin/creatives");
}

export async function assignCreative(formData: FormData) {
  const admin = await requireAdmin();
  const db = await getDb();
  const values = {
    campaignId: String(formData.get("campaignId") ?? ""),
    creativeId: String(formData.get("creativeId") ?? ""),
    placementId: String(formData.get("placementId") ?? ""),
    weight: Number(formData.get("weight")) || 1,
    priority: Number(formData.get("priority")) || 0,
  };
  if (!values.campaignId || !values.creativeId || !values.placementId) return;
  await db.insert(schema.adCampaignCreatives).values({ id: uid(), ...values });
  await audit(admin.id, "campaign_creative.assign", "campaign_creative", values.creativeId);
  revalidatePath("/admin/ads/schedule");
}

export async function removeAssignment(id: string) {
  const admin = await requireAdmin();
  const db = await getDb();
  await db.delete(schema.adCampaignCreatives).where(eq(schema.adCampaignCreatives.id, id));
  await audit(admin.id, "campaign_creative.remove", "campaign_creative", id);
  revalidatePath("/admin/ads/schedule");
}

export async function savePlacement(formData: FormData) {
  const admin = await requireAdmin();
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
    coverAdjust: {
      zoom: Number(formData.get("coverZoom")) || 1,
      x: Number(formData.get("coverX")) || 50,
      y: Number(formData.get("coverY")) || 50,
    },
    sortOrder: Number(formData.get("sortOrder")) || 0,
    showInNav: formData.get("showInNav") === "on",
    isActive: formData.get("isActive") === "on",
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
