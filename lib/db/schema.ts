import {
  pgTable, text, timestamp, integer, boolean, jsonb, doublePrecision,
  primaryKey, uniqueIndex, index,
} from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey();
const now = (name: string) => timestamp(name, { withTimezone: true, mode: "date" }).defaultNow().notNull();

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
  country: text("country"),
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
  logoUrl: text("logo_url"),
  industry: text("industry").notNull().default("other"),
  contactEmail: text("contact_email"),
  status: text("status").notNull().default("active"), // active | paused
  createdAt: now("created_at"),
});

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
  sortOrder: integer("sort_order").notNull().default(0),
  showInNav: boolean("show_in_nav").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
});

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
