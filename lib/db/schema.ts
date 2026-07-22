import {
  pgTable, text, timestamp, integer, boolean, jsonb, doublePrecision,
  primaryKey, uniqueIndex, index,
} from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey();
const now = (name: string) => timestamp(name, { withTimezone: true, mode: "date" }).defaultNow().notNull();

// Forward declaration note: `publicUserColumns` (the light projection used
// everywhere a user is only shown as an avatar + name + slug) is defined at the
// bottom of this file, after the `users` table.

// ===== Users & auth =====
export const users = pgTable("users", {
  id: id(),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  displayName: text("display_name").notNull(),
  slug: text("slug").notNull().unique(),
  avatarUrl: text("avatar_url"),
  bannerUrl: text("banner_url"),
  bio: text("bio"),
  country: text("country"),           // ISO-3166 alpha-2 (e.g. "EG") → flag shown next to the name everywhere
  locale: text("locale").notNull().default("en"), // "en" | "ar" — the gamer's chosen site language
  title: text("title"), // flex title shown under the name (e.g. "Blitz Grandmaster")
  role: text("role").notNull().default("user"), // user | admin | superadmin | brand
  status: text("status").notNull().default("active"), // active | suspended | banned
  isVerified: boolean("is_verified").notNull().default(false),
  primarySignupProvider: text("primary_signup_provider"),
  discordUsername: text("discord_username"), // Discord handle — the gamer's universal identity, shown everywhere
  profileViews: integer("profile_views").notNull().default(0), // public view counter (brag number)
  profileVisibility: text("profile_visibility").notNull().default("public"), // public | followers | private
  allowMessagesFrom: text("allow_messages_from").notNull().default("everyone"), // everyone | following | nobody
  emailNotifications: boolean("email_notifications").notNull().default(true),
  // Full profile customization ("profile builder"): theme, layout, cursor,
  // section order & visibility. Rendered as inline CSS vars on the public page.
  theme: jsonb("theme").$type<Record<string, unknown>>().notNull().default({}),
  // Feed control-panel prefs: which stat tiles to show + which challenges /
  // game-leaderboards the gamer follows (pinned to the top of their feed).
  feedPrefs: jsonb("feed_prefs").$type<{ stats?: string[]; challenges?: string[]; leaderboards?: string[] }>().notNull().default({}),
  createdAt: now("created_at"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "date" }),
}, (t) => [index("users_slug_idx").on(t.slug)]);

export const oauthIdentities = pgTable("oauth_identities", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerUserId: text("provider_user_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
  scopes: text("scopes"),
  connectedAt: now("connected_at"),
}, (t) => [uniqueIndex("oauth_provider_uid_idx").on(t.provider, t.providerUserId)]);

// ===== Game accounts & stats =====
export const linkedGameAccounts = pgTable("linked_game_accounts", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // registry key: chesscom, lichess, steam, riot, ...
  providerAccountId: text("provider_account_id").notNull(),
  inGameName: text("in_game_name").notNull(),
  region: text("region"),
  verified: boolean("verified").notNull().default(false),
  syncStatus: text("sync_status").notNull().default("pending"), // pending | ok | rate_limited | error | revoked | needs_key
  syncError: text("sync_error"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true, mode: "date" }),
  nextSyncAt: timestamp("next_sync_at", { withTimezone: true, mode: "date" }),
  providerData: jsonb("provider_data").$type<Record<string, unknown>>().default({}),
  createdAt: now("created_at"),
}, (t) => [
  uniqueIndex("lga_user_provider_acct_idx").on(t.userId, t.provider, t.providerAccountId),
  index("lga_provider_idx").on(t.provider),
]);

export const statSnapshots = pgTable("stat_snapshots", {
  id: id(),
  linkedAccountId: text("linked_account_id").notNull().references(() => linkedGameAccounts.id, { onDelete: "cascade" }),
  game: text("game").notNull(),
  metricKey: text("metric_key").notNull(),
  metricValue: doublePrecision("metric_value").notNull(),
  recordedAt: now("recorded_at"),
}, (t) => [index("snap_game_metric_idx").on(t.game, t.metricKey, t.metricValue)]);

export const statCurrent = pgTable("stat_current", {
  id: id(),
  linkedAccountId: text("linked_account_id").notNull().references(() => linkedGameAccounts.id, { onDelete: "cascade" }),
  game: text("game").notNull(),
  metricKey: text("metric_key").notNull(),
  metricValue: doublePrecision("metric_value").notNull(),
  rankLabel: text("rank_label"),
  updatedAt: now("updated_at"),
}, (t) => [
  uniqueIndex("sc_acct_game_metric_idx").on(t.linkedAccountId, t.game, t.metricKey),
  index("sc_game_metric_idx").on(t.game, t.metricKey),
]);

// ===== Badges =====
export const badges = pgTable("badges", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull().default("star"), // sprite key or emoji
  category: text("category").notNull().default("platform"), // game | community | challenge | platform
  criteria: jsonb("criteria").$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
});

export const userBadges = pgTable("user_badges", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  badgeId: text("badge_id").notNull().references(() => badges.id, { onDelete: "cascade" }),
  context: text("context"),
  awardedAt: now("awarded_at"),
}, (t) => [uniqueIndex("ub_user_badge_idx").on(t.userId, t.badgeId)]);

// ===== Social =====
export const follows = pgTable("follows", {
  followerId: text("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  followingId: text("following_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: now("created_at"),
}, (t) => [primaryKey({ columns: [t.followerId, t.followingId] })]);

export const conversations = pgTable("conversations", {
  id: id(),
  createdAt: now("created_at"),
  lastMessageAt: now("last_message_at"),
});

export const conversationParticipants = pgTable("conversation_participants", {
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lastReadAt: timestamp("last_read_at", { withTimezone: true, mode: "date" }),
}, (t) => [primaryKey({ columns: [t.conversationId, t.userId] })]);

export const messages = pgTable("messages", {
  id: id(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: now("created_at"),
}, (t) => [index("msg_conv_idx").on(t.conversationId, t.createdAt)]);

export const notifications = pgTable("notifications", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // follow | badge | challenge | mention | system | message
  title: text("title").notNull(),
  body: text("body"),
  href: text("href"),
  readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
  createdAt: now("created_at"),
}, (t) => [index("notif_user_idx").on(t.userId, t.createdAt)]);

// ===== Leaderboards =====
export const leaderboards = pgTable("leaderboards", {
  id: id(),
  game: text("game").notNull(),
  metricKey: text("metric_key").notNull(),
  title: text("title").notNull(),
  unit: text("unit"),
  sortDir: text("sort_dir").notNull().default("desc"),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [uniqueIndex("lb_game_metric_idx").on(t.game, t.metricKey)]);

// ===== Spaces (community) =====
export const spaces = pgTable("spaces", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  game: text("game"),
  coverEmoji: text("cover_emoji").notNull().default("🌌"),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by"),
  memberCount: integer("member_count").notNull().default(0),
  postCount: integer("post_count").notNull().default(0),
  expertThresholds: jsonb("expert_thresholds").$type<{ contributor: number; helper: number; expert: number }>()
    .notNull().default({ contributor: 10, helper: 50, expert: 150 }),
  createdAt: now("created_at"),
});

export const spaceMembers = pgTable("space_members", {
  spaceId: text("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"), // member | moderator
  joinedAt: now("joined_at"),
}, (t) => [primaryKey({ columns: [t.spaceId, t.userId] })]);

export const spaceRequests = pgTable("space_requests", {
  id: id(),
  requestedBy: text("requested_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  proposedName: text("proposed_name").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  reviewedBy: text("reviewed_by"),
  reviewNote: text("review_note"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
  createdAt: now("created_at"),
});

export const posts = pgTable("posts", {
  id: id(),
  spaceId: text("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  mediaUrl: text("media_url"),
  isPinned: boolean("is_pinned").notNull().default(false),
  createdAt: now("created_at"),
  editedAt: timestamp("edited_at", { withTimezone: true, mode: "date" }),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
}, (t) => [index("posts_space_idx").on(t.spaceId, t.createdAt)]);

export const postReactions = pgTable("post_reactions", {
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reactionType: text("reaction_type").notNull(), // like | dislike | meh
  createdAt: now("created_at"),
}, (t) => [primaryKey({ columns: [t.postId, t.userId] })]);

export const comments = pgTable("comments", {
  id: id(),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  parentCommentId: text("parent_comment_id"),
  authorId: text("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: now("created_at"),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
}, (t) => [index("comments_post_idx").on(t.postId, t.createdAt)]);

export const commentReactions = pgTable("comment_reactions", {
  commentId: text("comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reactionType: text("reaction_type").notNull(),
  createdAt: now("created_at"),
}, (t) => [primaryKey({ columns: [t.commentId, t.userId] })]);

export const spaceExpertScores = pgTable("space_expert_scores", {
  spaceId: text("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  points: integer("points").notNull().default(0),
  tier: text("tier"), // contributor | helper | expert
  computedAt: now("computed_at"),
}, (t) => [primaryKey({ columns: [t.spaceId, t.userId] })]);

// ===== Challenges =====
export const challenges = pgTable("challenges", {
  id: id(),
  spaceId: text("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  game: text("game").notNull(),
  provider: text("provider").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  format: text("format").notNull().default("top3"), // top1 | top3 | threshold_race
  rules: jsonb("rules").$type<{ conditions: { metric: string; op: string; value: number }[] }>()
    .notNull().default({ conditions: [] }),
  pointsEngine: jsonb("points_engine").$type<Record<string, number>>().notNull().default({}),
  thresholdTarget: integer("threshold_target"),
  // Entry gate: require N completion badges of a given quest to join.
  gateQuestId: text("gate_quest_id"),
  gateMinBadges: integer("gate_min_badges").notNull().default(0),
  startAt: timestamp("start_at", { withTimezone: true, mode: "date" }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true, mode: "date" }).notNull(),
  status: text("status").notNull().default("draft"), // draft | active | completed | cancelled
  cadence: text("cadence").notNull().default("custom"), // daily | weekly | monthly | custom
  heroType: text("hero_type").notNull().default("image"), // image | video | stream
  heroUrl: text("hero_url"),
  coverUrl: text("cover_url"),
  coverAdjust: jsonb("cover_adjust").$type<{ zoom: number; x: number; y: number }>()
    .notNull().default({ zoom: 1, x: 50, y: 50 }),
  trophyId: text("trophy_id"),
  prizeDescription: text("prize_description"),
  createdBy: text("created_by"),
  createdAt: now("created_at"),
});

export const challengeParticipants = pgTable("challenge_participants", {
  id: id(),
  challengeId: text("challenge_id").notNull().references(() => challenges.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  linkedAccountId: text("linked_account_id").notNull().references(() => linkedGameAccounts.id, { onDelete: "cascade" }),
  baseline: jsonb("baseline").$type<Record<string, number>>().notNull().default({}),
  currentPoints: integer("current_points").notNull().default(0),
  status: text("status").notNull().default("active"), // active | completed | disqualified
  finalPlacement: integer("final_placement"),
  joinedAt: now("joined_at"),
}, (t) => [uniqueIndex("cp_challenge_user_idx").on(t.challengeId, t.userId)]);

export const challengeEvents = pgTable("challenge_events", {
  id: id(),
  challengeId: text("challenge_id").notNull().references(() => challenges.id, { onDelete: "cascade" }),
  participantId: text("participant_id").notNull().references(() => challengeParticipants.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  pointsAwarded: integer("points_awarded").notNull().default(0),
  rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().default({}),
  createdAt: now("created_at"),
}, (t) => [index("ce_challenge_idx").on(t.challengeId, t.createdAt)]);

// ===== Ads & monetization =====
export const brands = pgTable("brands", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").unique(),          // portal URL: /brands/<slug>
  accessKey: text("access_key"),        // key that unlocks the brand portal
  logoUrl: text("logo_url"),
  coverUrl: text("cover_url"),          // brand portal cover art
  portalBgUrl: text("portal_bg_url"),   // full-page background art behind the portal
  chartPrefs: jsonb("chart_prefs").$type<unknown>(), // brand/admin chart layout config
  about: text("about"),                 // shown on the portal (creative brief etc.)
  industry: text("industry").notNull().default("other"),
  contactEmail: text("contact_email"),
  status: text("status").notNull().default("active"), // active | paused
  createdAt: now("created_at"),
});

// Shared brand <-> admin inbox, shown on both the brand portal and the master
// ads dashboard. `sender` is "brand" or "admin".
export const brandMessages = pgTable("brand_messages", {
  id: id(),
  brandId: text("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  sender: text("sender").notNull(), // brand | admin
  body: text("body").notNull(),
  readByAdmin: boolean("read_by_admin").notNull().default(false),
  readByBrand: boolean("read_by_brand").notNull().default(false),
  createdAt: now("created_at"),
}, (t) => [index("brand_msg_idx").on(t.brandId, t.createdAt)]);

export const adPlacements = pgTable("ad_placements", {
  id: id(),
  key: text("key").notNull().unique(),
  pageScope: text("page_scope").notNull(),
  device: text("device").notNull().default("both"),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  mobileWidth: integer("mobile_width"),
  mobileHeight: integer("mobile_height"),
  maxCreativesInRotation: integer("max_creatives_in_rotation").notNull().default(3),
  rotationIntervalSeconds: integer("rotation_interval_seconds").notNull().default(5),
});

export const adCreatives = pgTable("ad_creatives", {
  id: id(),
  brandId: text("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull().default("image"), // image | video
  fileUrl: text("file_url").notNull(),
  clickUrl: text("click_url"),
  width: integer("width"),
  height: integer("height"),
  durationSeconds: integer("duration_seconds"),
  status: text("status").notNull().default("pending_review"), // pending_review | approved | rejected
  createdAt: now("created_at"),
});

export const adCampaigns = pgTable("ad_campaigns", {
  id: id(),
  brandId: text("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  startDate: timestamp("start_date", { withTimezone: true, mode: "date" }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true, mode: "date" }).notNull(),
  budget: doublePrecision("budget"),
  targetGeo: text("target_geo"),
  targetDevice: text("target_device").notNull().default("both"),
  status: text("status").notNull().default("active"), // active | paused | completed
  // A campaign only starts serving once launched (all placement creatives in).
  launchedAt: timestamp("launched_at", { withTimezone: true, mode: "date" }),
  coverUrl: text("cover_url"),   // campaign cover (falls back to the brand cover)
  logoUrl: text("logo_url"),     // campaign logo (falls back to the brand logo)
  createdAt: now("created_at"),
});

export const adCampaignCreatives = pgTable("ad_campaign_creatives", {
  id: id(),
  campaignId: text("campaign_id").notNull().references(() => adCampaigns.id, { onDelete: "cascade" }),
  creativeId: text("creative_id").notNull().references(() => adCreatives.id, { onDelete: "cascade" }),
  placementId: text("placement_id").notNull().references(() => adPlacements.id, { onDelete: "cascade" }),
  weight: integer("weight").notNull().default(1),
  priority: integer("priority").notNull().default(0),
});

export const adImpressions = pgTable("ad_impressions", {
  id: id(),
  campaignCreativeId: text("campaign_creative_id").notNull().references(() => adCampaignCreatives.id, { onDelete: "cascade" }),
  userId: text("user_id"),
  sessionId: text("session_id"),
  pagePath: text("page_path"),
  deviceType: text("device_type"),
  hashedIp: text("hashed_ip"),
  geoCountry: text("geo_country"),
  geoCity: text("geo_city"),
  durationViewedMs: integer("duration_viewed_ms"),
  createdAt: now("created_at"),
}, (t) => [index("imp_cc_idx").on(t.campaignCreativeId, t.createdAt)]);

export const adClicks = pgTable("ad_clicks", {
  id: id(),
  campaignCreativeId: text("campaign_creative_id").notNull().references(() => adCampaignCreatives.id, { onDelete: "cascade" }),
  impressionId: text("impression_id"),
  createdAt: now("created_at"),
});

// ===== Games catalog (logos/covers are DB-driven, admin-editable) =====
export const games = pgTable("games", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  logoUrl: text("logo_url"),
  coverUrl: text("cover_url"),
  planetImageUrl: text("planet_image_url"), // per-game interactive planet hero skin
  planetBgUrl: text("planet_bg_url"),       // per-game space background behind the globe
  // Per-game overrides for the globe region markers (position/label/color),
  // keyed by macro-region so staff can align pins to each planet's artwork.
  planetPins: jsonb("planet_pins").$type<Record<string, { x: number; y: number; color: string; label: string }>>()
    .notNull().default({}),
  coverAdjust: jsonb("cover_adjust").$type<{ zoom: number; x: number; y: number }>()
    .notNull().default({ zoom: 1, x: 50, y: 50 }),
  // Admin-defined trackable metrics for a game (so a brand-new game can be
  // "integrated" from the UI — its metrics flow into leaderboards/challenges).
  customMetrics: jsonb("custom_metrics").$type<{ key: string; label: string; unit?: string; higherIsBetter?: boolean }[]>()
    .notNull().default([]),
  // Per-planet theme + layout control.
  accent: text("accent"),                              // primary accent color (hero glow/gradient)
  accent2: text("accent2"),                            // secondary accent
  planetLayout: text("planet_layout").notNull().default("auto"), // auto | globe | cover
  heroLayout: jsonb("hero_layout").$type<unknown>(),   // admin-configured left/right hero sidebar modules
  sortOrder: integer("sort_order").notNull().default(0),
  showInNav: boolean("show_in_nav").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
});

// ===== Admin overrides for a game's world catalogue =====
// The champions/agents/weapons/legends/maps normally come from Data Dragon /
// valorant-api / static catalogues. This table lets an admin edit any of them
// (name, role, lore, image, splash, skins, abilities), hide them, reorder, or
// add brand-new custom entities (e.g. PUBG heroes). Merged on top of the base.
export const gameEntityOverrides = pgTable("game_entity_overrides", {
  id: id(),
  game: text("game").notNull(),
  kind: text("kind").notNull(),          // champion | agent | weapon | hero | outfit | legend | map
  entityId: text("entity_id").notNull(), // base id, or a generated id for custom entries
  custom: boolean("custom").notNull().default(false),
  hidden: boolean("hidden").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  name: text("name"),
  role: text("role"),
  image: text("image"),
  splash: text("splash"),
  lore: text("lore"),
  meta: jsonb("meta").$type<{ label: string; value: string }[]>().notNull().default([]),
  abilities: jsonb("abilities").$type<{ name: string; icon: string | null; desc: string }[]>().notNull().default([]),
  skins: jsonb("skins").$type<{ name: string; image: string }[]>().notNull().default([]),
  updatedAt: now("updated_at"),
}, (t) => [uniqueIndex("geo_game_kind_entity_idx").on(t.game, t.kind, t.entityId)]);

// ===== Partners ("Trusted by" slider, admin-managed) =====
export const partners = pgTable("partners", {
  id: id(),
  name: text("name").notNull(),
  logoUrl: text("logo_url").notNull(),
  url: text("url"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

// ===== Trophy art for challenge prizes =====
export const trophies = pgTable("trophies", {
  id: id(),
  name: text("name").notNull(),
  imageUrl: text("image_url").notNull(),
  tier: text("tier").notNull().default("gold"), // gold | silver | bronze | legendary
  game: text("game"),
});

// ===== Admin =====
export const auditLog = pgTable("audit_log", {
  id: id(),
  adminId: text("admin_id").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
  createdAt: now("created_at"),
});

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>(),
  updatedAt: now("updated_at"),
});

// ===== Quests & gamification =====
// A Quest is a themed progression track (fully admin-editable). It "listens" to
// a subset of the engine's known actions via `actionWeights` (actionKey -> QP)
// and has an ordered list of tiers (badges), each with its own QP threshold and
// art. Admins can add quests, add any number of tiers, and edit every field.
export const quests = pgTable("quests", {
  id: id(),
  key: text("key").notNull().unique(),         // stable slug (e.g. conquest)
  name: text("name").notNull(),
  tagline: text("tagline").notNull().default(""),
  lore: text("lore").notNull().default(""),    // the story shown to gamers
  color: text("color").notNull().default("#8b5cf6"),
  accent2: text("accent2").notNull().default("#22d3ee"),
  icon: text("icon").notNull().default("trophy"),
  logoUrl: text("logo_url"),
  cardBgUrl: text("card_bg_url"),              // gamified floating-card background
  coverUrl: text("cover_url"),
  mapArtUrl: text("map_art_url"),              // treasure-map art for the quest hero
  pathPoints: jsonb("path_points").$type<{ x: number; y: number }[]>(), // curved trail waypoints the astronaut rides
  pathPointsMobile: jsonb("path_points_mobile").$type<{ x: number; y: number }[]>(), // separate trail for the 4:5 mobile map (curves differ per aspect)
  actionWeights: jsonb("action_weights").$type<Record<string, number>>().notNull().default({}),
  dailyCaps: jsonb("daily_caps").$type<Record<string, number>>().notNull().default({}),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

// The ordered tiers (badges) inside a quest. Any count; threshold is cumulative
// QP. Reaching a tier's threshold unlocks its badge.
export const questTiers = pgTable("quest_tiers", {
  id: id(),
  questId: text("quest_id").notNull().references(() => quests.id, { onDelete: "cascade" }),
  tierIndex: integer("tier_index").notNull().default(0), // order within the quest
  name: text("name").notNull(),                 // e.g. Bronze / "Star Recruit"
  description: text("description").notNull().default(""), // the badge's story/path
  thresholdQp: integer("threshold_qp").notNull().default(100),
  iconUrl: text("icon_url"),                    // uploaded badge art
  color: text("color"),                          // optional tier accent
  mapX: integer("map_x").notNull().default(50),  // pin position on the quest map (%)
  mapY: integer("map_y").notNull().default(50),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [index("qt_quest_idx").on(t.questId, t.tierIndex)]);

// A gamer's accumulated Quest Points per quest (monotonic).
export const userQuestProgress = pgTable("user_quest_progress", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  questId: text("quest_id").notNull().references(() => quests.id, { onDelete: "cascade" }),
  qp: integer("qp").notNull().default(0),
  // How many full times this quest has been completed (re-enrolled), and the
  // lifetime CP earned across all completed cycles. Total CP = lifetimeQp + qp.
  completions: integer("completions").notNull().default(0),
  lifetimeQp: integer("lifetime_qp").notNull().default(0),
  updatedAt: now("updated_at"),
}, (t) => [primaryKey({ columns: [t.userId, t.questId] })]);

// Append-only ledger of awarded actions — powers dedup, daily caps and the
// "recent progress" feed.
export const questEvents = pgTable("quest_events", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  questId: text("quest_id").notNull().references(() => quests.id, { onDelete: "cascade" }),
  actionKey: text("action_key").notNull(),
  qpAwarded: integer("qp_awarded").notNull().default(0),
  refType: text("ref_type"),
  refId: text("ref_id"),
  createdAt: now("created_at"),
}, (t) => [
  index("qe_user_idx").on(t.userId, t.createdAt),
  uniqueIndex("qe_dedup_idx").on(t.userId, t.questId, t.actionKey, t.refType, t.refId),
]);

// Which tier-badges a gamer has unlocked (for profile display + leaderboards).
export const userQuestTiers = pgTable("user_quest_tiers", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  questTierId: text("quest_tier_id").notNull().references(() => questTiers.id, { onDelete: "cascade" }),
  awardedAt: now("awarded_at"),
}, (t) => [uniqueIndex("uqt_user_tier_idx").on(t.userId, t.questTierId)]);

// ===== Light user projection =====
// The `users` row carries three heavy columns — `avatarUrl`/`bannerUrl` (which
// can be inline base64 data URLs when Vercel Blob isn't configured) and `theme`
// (a JSONB profile-builder blob). The vast majority of places that join a user
// only render a small avatar + display name + slug. Selecting the whole row on
// those hot, high-fan-out joins (post authors, comment authors, planet players,
// leaderboards, message threads, …) is what made Neon data-transfer explode.
//
// Use `publicUserColumns` as the projection for any user join that just needs
// to link + show an avatar. It omits `bannerUrl` and `theme` entirely and keeps
// `avatarUrl` (genuinely rendered). `PublicUser` is the resulting row type.
export const publicUserColumns = {
  id: users.id,
  displayName: users.displayName,
  slug: users.slug,
  avatarUrl: users.avatarUrl,
  role: users.role,
  isVerified: users.isVerified,
  title: users.title,
  discordUsername: users.discordUsername,
} as const;

export type PublicUser = {
  id: string;
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  role: string;
  isVerified: boolean;
  title: string | null;
  discordUsername: string | null;
};
