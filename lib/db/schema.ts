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
  /**
   * Date of birth, asked for ONCE and only when it is needed (B37).
   *
   * Not collected at signup: playing has no age gate here, being PAID does, and
   * a birthday field on a signup form is a field most people lie in and all of
   * them resent. It is asked for at the first redemption, where the reason for
   * asking is self-evident.
   */
  birthDate: timestamp("birth_date", { withTimezone: true, mode: "date" }),
  locale: text("locale").notNull().default("en"), // "en" | "ar" — the gamer's chosen site language
  title: text("title"), // flex title shown under the name (e.g. "Blitz Grandmaster")
  role: text("role").notNull().default("user"), // user | admin | superadmin | brand
  /**
   * Which department a staff member works in, and therefore what they can open.
   *
   * Null for everybody who isn't staff, and for staff nobody has placed yet —
   * who correctly see an empty console until someone does.
   */
  departmentId: text("department_id"),
  status: text("status").notNull().default("active"), // active | suspended | banned
  isVerified: boolean("is_verified").notNull().default(false),
  primarySignupProvider: text("primary_signup_provider"),
  discordUsername: text("discord_username"), // Discord handle — the gamer's universal identity, shown everywhere
  profileViews: integer("profile_views").notNull().default(0), // public view counter (brag number)
  /**
   * The age BAND. B72.4. Never a date of birth.
   *
   * `under16` | `teen` | `adult`, or null when nobody has answered. Null earns
   * nothing — see `lib/age.ts` for what each band may do and why the line is 16
   * rather than 13.
   */
  ageBand: text("age_band"),
  /** When they answered. A record of having asked, which is half the point. */
  ageBandSetAt: timestamp("age_band_set_at", { withTimezone: true, mode: "date" }),
  /**
   * How many times they have changed it. Locks at `MAX_BAND_CHANGES`.
   *
   * A band asked in one click with no confirm WILL be mis-tapped, and a mis-tap
   * onto "Under 16" locks somebody out of everything. So it is editable — and
   * counted, because a band that can change without limit means nothing.
   */
  ageBandChanges: integer("age_band_changes").notNull().default(0),
  /**
   * The address this account was created from. B80.
   *
   * Stored so account-creation velocity can be counted per address at all — the
   * guard had an IP branch that nothing ever reached, because there was nothing
   * to compare against. Fifty accounts from one address in a day is a script;
   * ten is a university.
   *
   * It is the only network identifier we keep, it is written once at signup and
   * never updated, and B80's purge removes it with the account. It is NOT used
   * to identify or track a gamer anywhere else in the product.
   */
  signupIp: text("signup_ip"),
  /**
   * When this gamer finished onboarding. B83.
   *
   * Null means locked: CP accrues to a cap and cannot be spent or redeemed
   * until they link a game account and customize their profile.
   *
   * **Backfilled from `created_at` for every account that existed before this
   * shipped.** Nothing anybody already earned is ever locked — see the
   * grandfather rule in `lib/unlock.ts`. That backfill is the whole of the
   * promise, and it lives in the migration rather than in a runtime check
   * precisely so it cannot be forgotten on a later read path.
   */
  unlockedAt: timestamp("unlocked_at", { withTimezone: true, mode: "date" }),
  discordViews: integer("discord_views").notNull().default(0), // views that came from someone showing this profile in Discord
  voteCount: integer("vote_count").notNull().default(0),       // Best Profile votes, denormalized for cheap sorting
  /**
   * A PREFERENCE, not an instrument: {currency: "USD", method: "bank"}.
   *
   * This column used to carry a `details` object holding routing and account
   * numbers. It doesn't any more, and the migration in lib/db/index.ts strips
   * that key from every existing row — see the comment there. Where the money
   * actually goes is decided by the gamer on the payout provider's own page,
   * which is the only place it is ever typed.
   */
  payoutMethod: jsonb("payout_method").$type<{ currency: string; method: string }>(),
  payoutChanges: integer("payout_changes").notNull().default(0), // method edits used (locks at 3)
  profileVisibility: text("profile_visibility").notNull().default("public"), // public | followers | private
  allowMessagesFrom: text("allow_messages_from").notNull().default("everyone"), // everyone | following | nobody
  emailNotifications: boolean("email_notifications").notNull().default(true),
  // Full profile customization ("profile builder"): theme, layout, cursor,
  // section order & visibility. Rendered as inline CSS vars on the public page.
  theme: jsonb("theme").$type<Record<string, unknown>>().notNull().default({}),
  // Feed control-panel prefs: which stat tiles to show + which challenges /
  // game-leaderboards the gamer follows (pinned to the top of their feed).
  /**
   * What this gamer says about their OWN bot card (B58/B59).
   *
   * Narrowing only: which of their accounts it may draw, which sections they
   * have switched off, and whether it appears on their public profile. It can
   * never widen what the card shows and never names a row that is not theirs —
   * see `narrow()` in lib/cards/refs.ts, which filters rows already fetched for
   * them rather than building a query from what they typed.
   */
  cardPrefs: jsonb("card_prefs").$type<{ accounts?: string[]; hide?: string[]; showOnProfile?: boolean }>().notNull().default({}),
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
  /**
   * Ownership is PROVEN, not merely asserted.
   *
   * This used to be set true whenever the provider's API answered — which only
   * ever proved the account exists. Anyone could type "Faker#KR1" and wear it.
   * It now means what it says, and `verifiedMethod` says how we know.
   */
  verified: boolean("verified").notNull().default(false),
  /** claimed | exists | icon | oauth | openid | vc | admin — see lib/account-ownership.ts */
  verifiedMethod: text("verified_method").notNull().default("claimed"),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
  /**
   * An open ownership challenge: what the gamer has to do to prove it, and
   * until when. Null once proven (or when the game has no proof available).
   */
  proofChallenge: jsonb("proof_challenge").$type<Record<string, unknown>>(),
  proofExpiresAt: timestamp("proof_expires_at", { withTimezone: true, mode: "date" }),
  /**
   * ok | disputed. Set when two gamers already held the same account before
   * uniqueness was enforced. Nothing is deleted — a season of prize-money
   * history is not something to silently discard — so staff resolve it.
   */
  ownershipStatus: text("ownership_status").notNull().default("ok"),
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
  // Server-gated challenges: a challenge that belongs to one Discord server.
  // Announced only there (with extra hype), hidden on the web behind an access
  // key. This is the thing a server owner gets that no other server has.
  visibility: text("visibility").notNull().default("public"), // public | private
  guildId: text("guild_id"),
  // A private challenge can run across SEVERAL servers. `guildId` stays the
  // server it belongs to (the one that requested it, whose logo leads); this is
  // every server it's been launched on, all of which get the key and the
  // announcement. Empty means "just guildId".
  guildIds: jsonb("guild_ids").$type<string[]>().notNull().default([]),
  accessKey: text("access_key"),
  announceHype: boolean("announce_hype").notNull().default(false),
  startAt: timestamp("start_at", { withTimezone: true, mode: "date" }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true, mode: "date" }).notNull(),
  status: text("status").notNull().default("draft"), // draft | active | completed | cancelled
  /**
   * When the bot told the servers this was coming. B90.3.
   *
   * The rung between "paid" and "running". A challenge announced on Thursday
   * for the following Monday is one every server has had four days to talk
   * about; one announced at the moment it starts is a surprise, and a surprise
   * competition gets the entrants of whoever happened to be online.
   *
   * It is a TIMESTAMP rather than a status value because a challenge can be
   * announced and then still be edited, cancelled or rescheduled — and because
   * "when did we tell people" is the question reach reporting actually asks.
   */
  announcedAt: timestamp("announced_at", { withTimezone: true, mode: "date" }),
  cadence: text("cadence").notNull().default("custom"), // daily | weekly | monthly | custom
  // ===== Repeating series =====
  //
  // A repeating challenge is a series of separate rows, one per run, because a
  // run is the unit of revenue: its own entrants, standings, winners, trophies
  // and reach, all still reportable a year later. A single row with a sliding
  // end date can report none of that.
  /** Groups every run of one repeating challenge. The first run's own id. */
  seriesId: text("series_id"),
  /** 1-based: Week 1, Week 2… Also what the title suffix is built from. */
  runIndex: integer("run_index").notNull().default(1),
  /** How many runs were bought. 4 = a sponsored month. 0 = until stopped. */
  runsPlanned: integer("runs_planned").notNull().default(1),
  /** The title without its "— Week N" suffix, so the suffix never doubles up. */
  baseTitle: text("base_title"),
  heroType: text("hero_type").notNull().default("image"), // image | video | stream
  heroUrl: text("hero_url"),
  coverUrl: text("cover_url"),
  coverAdjust: jsonb("cover_adjust").$type<{ zoom: number; x: number; y: number }>()
    .notNull().default({ zoom: 1, x: 50, y: 50 }),
  trophyId: text("trophy_id"),
  prizes: jsonb("prizes").$type<{ first?: string[]; second?: string[]; third?: string[] }>(), // multi-trophy podium prizes per place
  prizeDescription: text("prize_description"),
  // ===== Sponsorship =====
  //
  // A sponsored challenge is one a brand bought. It is the unit of the whole
  // business — the brand's money enters here, and `pricing.prizePct` of it (50%
  // under COMMERCIAL_MODEL_V2 §2) leaves as prize money to gamers, with the
  // rest split between the server pool, the CP vault and Cluster. The figure
  // used to be written here as 70%, which stopped being true and could not be
  // noticed, which is exactly why it is a percentage in one place now. None of that arithmetic can be done without knowing which brand
  // paid and how much, so it is recorded on the challenge itself rather than
  // inferred from a campaign later.
  /**
   * What kind of challenge this is (B43.2).
   *
   * `welcome` is the funded one a server gets on install — private to its
   * guild, sponsored by the house brand, billed to Cluster. Admin can create
   * one for any server at any time, which is what lets a draft cancelled for
   * want of a game be recreated once we know the game.
   */
  kind: text("kind").notNull().default("standard"), // standard | welcome
  sponsorBrandId: text("sponsor_brand_id"),
  /** The ad campaign this challenge was bought under, when there is one. */
  sponsorCampaignId: text("sponsor_campaign_id"),
  /** What the brand paid for THIS challenge. Zero for anything unsponsored. */
  sponsorPrice: doublePrecision("sponsor_price").notNull().default(0),
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
  // web | discord — the funnel metric that shows whether the bot actually
  // drives participation, rather than just being installed somewhere.
  joinedFrom: text("joined_from").notNull().default("web"),
  /**
   * WHICH SERVER this entry came from, recorded at join time.
   *
   * B86. The server pool pays real money for "entrants from that server", and
   * until this column existed there was no such fact: attribution was derived
   * from current guild membership, so **one entrant counted once for every
   * server they happened to be in** and the shares summed past 100%.
   *
   * Nullable because it cannot be backfilled — a join that already happened
   * did not record where it came from, and guessing later is the bug this
   * column exists to remove. Rows before B86 read null and are excluded from
   * scoring rather than attributed to somebody.
   *
   * Not a foreign key to `discordGuilds` on purpose: a server can remove the
   * bot, and an entrant's history must survive that.
   */
  guildId: text("guild_id"),
  joinedAt: now("joined_at"),
}, (t) => [
  uniqueIndex("cp_challenge_user_idx").on(t.challengeId, t.userId),
  index("cp_guild_idx").on(t.guildId, t.challengeId),
]);

/**
 * One row per guild per week. B86.
 *
 * The server pool scores on things that change over time — how many members a
 * server has, how many of them are QUALIFIED linked gamers — and none of it was
 * being written down. `discordGuilds.memberCount` is a single current integer,
 * so "growth versus last week" had no last week to compare against and could
 * not be computed at all.
 *
 * **This is the unbackfillable one.** Every week that passes without a snapshot
 * is a week of history nobody can reconstruct, which is why B86 sits ahead of
 * items that are more urgent but not time-critical.
 *
 * `qualifiedLinked` is deliberately separate from `linked`: `lib/abuse.ts`
 * already refuses to pay on members who have not cleared `QUALIFY_AFTER_DAYS`
 * with a verified game account, and the scoring formula uses the qualified
 * figure precisely because the raw one can be bought for about five dollars.
 */
export const guildSnapshots = pgTable("guild_snapshots", {
  id: id(),
  guildId: text("guild_id").notNull(),
  /** The Monday of the week this snapshot describes, UTC. */
  weekStart: timestamp("week_start", { withTimezone: true, mode: "date" }).notNull(),
  /** Discord's approximate member count at capture time. Buyable — context only. */
  memberCount: integer("member_count").notNull().default(0),
  /** Linked Cluster gamers in this guild. */
  linked: integer("linked").notNull().default(0),
  /** …of which have cleared the qualification rule. This is what scores. */
  qualifiedLinked: integer("qualified_linked").notNull().default(0),
  createdAt: now("created_at"),
}, (t) => [uniqueIndex("guild_snap_idx").on(t.guildId, t.weekStart)]);

/**
 * Every movement of money into and out of a vault. B86.
 *
 * The four vaults in `docs/COMMERCIAL_MODEL_V2.md` are only meaningful if their
 * balance is a SUM OF ROWS rather than a stored number somebody edits. A stored
 * balance drifts, and there is no way to prove afterwards what it should have
 * been.
 *
 * So there is no balance column anywhere: a vault's balance is
 * `sum(amount) where vault = ?`, and every row says who moved it and why.
 * Inflows are positive, outflows negative, and a transfer between vaults is two
 * rows sharing a `transferId`.
 */
export const vaultLedger = pgTable("vault_ledger", {
  id: id(),
  /** prize | server | cp | cluster */
  vault: text("vault").notNull(),
  /**
   * Positive in, negative out. Money, not CP — CP converts at the live rate.
   *
   * `doublePrecision` to match every other money column in this schema
   * (`trophies.value:730`, `serverPayouts.amount:822`). A second convention for
   * money would be worse than the imperfect one already here: reconciling two
   * types is how a rounding difference becomes an unexplained balance.
   */
  amount: doublePrecision("amount").notNull().default(0),
  /** challenge_sale | payout | transfer | sweep | adjustment | breakage */
  kind: text("kind").notNull(),
  /** What caused it: a challenge id, a payout id, a redemption id. */
  refType: text("ref_type"),
  refId: text("ref_id"),
  /** Both halves of a transfer carry the same id, so they can never be read apart. */
  transferId: text("transfer_id"),
  /** Required on any manual movement. Null for automatic ones. */
  reason: text("reason"),
  /** The admin who did it, when a human did. */
  actorId: text("actor_id"),
  createdAt: now("created_at"),
}, (t) => [
  index("vault_ledger_idx").on(t.vault, t.createdAt),
  index("vault_ledger_ref_idx").on(t.refType, t.refId),
]);

/**
 * What an admin RELEASED for one week, per vault. B88.2.
 *
 * THE PROBLEM THIS SOLVES. The gamer ceiling and the server pool were both
 * computed against the whole vault, which meant a week with no sales paid
 * nothing and a week with a big sale paid all of it. There was no reserve and
 * no way to hold one, because there was nowhere to say "this much, this week."
 *
 * So an allocation is a deliberate act: somebody decides what a week may spend,
 * and what is NOT allocated is the reserve. The vault is the bank; this is the
 * week's budget.
 *
 * Three rules, and they are the reason the table exists rather than a settings
 * row:
 *
 *   1. **Per week and per vault**, so history is readable. "What did we release
 *      in March" is a query, not an archaeology exercise.
 *   2. **Raisable, never lowerable, once locked.** Gamers have been shown a
 *      ceiling computed from it and servers have been shown a pool. Taking that
 *      back mid-week is the one move that would make both numbers untrustworthy.
 *   3. **Owners see the allocation, never the vault.** The reserve is ours to
 *      manage, and showing it invites "why am I not paid out of that".
 */
export const weekAllocations = pgTable("week_allocations", {
  id: id(),
  /** The Monday it applies to, as YYYY-MM-DD. Same key the weekly close uses. */
  week: text("week").notNull(),
  /** `cp` or `server`. The prize and cluster vaults are not allocated weekly. */
  vault: text("vault").notNull(),
  /** Dollars released for that week. Never a percentage — a percentage of a
   *  moving balance is a number that changes after somebody has been shown it. */
  amount: doublePrecision("amount").notNull().default(0),
  /** Set when the week starts. Before that the amount is freely editable. */
  lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
  /** Who released it, and why they chose this number. */
  actorId: text("actor_id"),
  note: text("note"),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [
  // One row per week per vault. The upsert target, and the thing that stops two
  // admins releasing two budgets for the same week.
  uniqueIndex("week_alloc_once_idx").on(t.week, t.vault),
]);

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
  /**
   * When this brand was granted its founding month of challenge credit.
   *
   * Null means it is owed one. Existing customers are owed it too — we are not
   * going to make the brands who backed us first pay to watch new ones get a
   * better deal.
   */
  /**
   * Our own brand record (B31.2).
   *
   * Welcome challenges are sponsored by Cluster and BILLED to Cluster, through
   * the same invoice machinery a paying brand uses. That is the whole point: a
   * giveaway that skips billing is a giveaway nobody can add up, and when
   * somebody asks what customer acquisition cost, the answer should be a query
   * rather than an estimate. This flag is what keeps the house brand out of
   * every list that means "customers".
   */
  isHouse: boolean("is_house").notNull().default(false),
  founderCreditAt: timestamp("founder_credit_at", { withTimezone: true, mode: "date" }),
  /** What was granted, in dollars, so the ledger is not inferred from a date. */
  founderCreditValue: doublePrecision("founder_credit_value").notNull().default(0),
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
  /**
   * The brand's own words on the Discord button under this creative.
   *
   * Every card the bot posts carries a link button for its sponsor — that is
   * the only clickable surface a Discord ad has, because an image in a message
   * is not a link. The button reads "Sponsored: <brand> — <this>", so a brand
   * writes the half that is theirs and the disclosure half is not negotiable.
   *
   * Per CREATIVE, not per campaign: a brand running three creatives is running
   * three messages, and the button is part of the message.
   */
  ctaLabel: text("cta_label"),
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

/**
 * One creative, running in one placement, for one campaign.
 *
 * This row is the thing impressions and clicks point at, so it is never
 * deleted — it is RETIRED. A brand replacing the art on a placement used to
 * delete this row and insert a new one, and every impression and click ever
 * recorded there went with it on cascade: their thirty-day numbers reset to
 * zero for uploading a better image. The placement's performance belongs to
 * the placement, not to whichever file is currently in it.
 */
export const adCampaignCreatives = pgTable("ad_campaign_creatives", {
  id: id(),
  campaignId: text("campaign_id").notNull().references(() => adCampaigns.id, { onDelete: "cascade" }),
  creativeId: text("creative_id").notNull().references(() => adCreatives.id, { onDelete: "cascade" }),
  placementId: text("placement_id").notNull().references(() => adPlacements.id, { onDelete: "cascade" }),
  weight: integer("weight").notNull().default(1),
  priority: integer("priority").notNull().default(0),
  /** Out of rotation since. Null means live. Its history stays either way. */
  retiredAt: timestamp("retired_at", { withTimezone: true, mode: "date" }),
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
  // Set when the impression came from a bot post in a Discord server, so
  // Discord revenue flows through the EXISTING ad analytics rather than a
  // parallel pipeline that would have to be reconciled later.
  guildId: text("guild_id"),
  /**
   * One viewer, one creative, one hour. B72.2.
   *
   * A unique index rather than a check in the route, because two racing beacon
   * calls would both pass a SELECT and both insert — the same read-then-write
   * shape B74 found on the money paths. Here the database refuses the second
   * one and no transaction is needed to make that true.
   *
   * It fixes two things that looked unrelated: an unauthenticated flood padding
   * a brand's count, and the web slot rotating every five seconds and logging a
   * fresh impression on each tick, so one idle tab produced twelve views a
   * minute. Nullable for rows written before this existed.
   */
  dedupeKey: text("dedupe_key"),
  /**
   * WHERE the card was delivered. B81.2.
   *
   * `discord_private` | `discord_public` | `web`. Stored, and **never shown to
   * a brand.** A brand knowing which of its views came from private DMs versus
   * public channels is a step toward inferring who saw it in a small server;
   * we need the split for our own operations and pacing, and they do not.
   */
  surface: text("surface"),
  /**
   * WHAT card it was — profile, challenge, planet, game-stats, market.
   *
   * This one IS shown: it is the breakdown a brand actually asks for, and it
   * says something about placement quality without saying anything about a
   * person.
   */
  cardKind: text("card_kind"),
  createdAt: now("created_at"),
}, (t) => [
  index("imp_cc_idx").on(t.campaignCreativeId, t.createdAt),
  uniqueIndex("imp_dedupe_idx").on(t.dedupeKey),
  // The report groups by these. Without the index a brand's dashboard is a
  // sequential scan over every impression ever logged.
  index("imp_kind_idx").on(t.campaignCreativeId, t.cardKind),
  index("imp_guild_idx").on(t.campaignCreativeId, t.guildId),
]);

export const adClicks = pgTable("ad_clicks", {
  id: id(),
  campaignCreativeId: text("campaign_creative_id").notNull().references(() => adCampaignCreatives.id, { onDelete: "cascade" }),
  impressionId: text("impression_id"),
  /** The Discord server the click came from, when it came from one. */
  guildId: text("guild_id"),
  /** `web` or `discord` — the same two funnels the impressions have. */
  source: text("source"),
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
  value: doublePrecision("value").notNull().default(0), // admin-assigned $ value (shown on prizes, redeemable)
  /**
   * The brand whose logo is on it.
   *
   * A branded trophy is the thing a sponsored challenge actually leaves behind:
   * the winner keeps it on their profile with the sponsor's mark on it, long
   * after the week is over. Set means "made for this brand" — it is offered
   * first when staff build that brand's challenge and never mixed into the
   * general catalogue, because awarding one brand's trophy in another's
   * competition would put the wrong logo on somebody's profile forever.
   */
  brandId: text("brand_id").references(() => brands.id, { onDelete: "set null" }),
  /**
   * What it costs in Cluster Points, and whether the marketplace lists it.
   *
   * 0 means "let the model price it" — see lib/marketplace.ts. A price set here
   * is an explicit admin override and always wins.
   */
  cpPrice: integer("cp_price").notNull().default(0),
  inMarketplace: boolean("in_marketplace").notNull().default(true),
  /**
   * The line under the name, and the story behind it (B53).
   *
   * Both propagate to everyone already holding the trophy, because a trophy is
   * one object shown in many places — a holding stores only `trophyId`, so
   * there is nothing per-gamer to go stale.
   */
  title: text("title"),
  description: text("description"),
});

/**
 * A trophy bought with Cluster Points, for yourself or as a gift.
 *
 * The ledger is the point. CP is earned free, so the only thing standing
 * between a gamer and an unlimited pile of redeemable trophies is that every
 * purchase is written down and subtracted from a balance — and this table IS
 * that subtraction. `lib/marketplace.ts` computes balance as earned minus the
 * sum of this table, which is also why buying never costs a gamer a level:
 * quest progress is untouched, and levels read progress, not balance.
 */
export const marketplaceOrders = pgTable("marketplace_orders", {
  id: id(),
  buyerId: text("buyer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** Who ends up owning it — the buyer, or whoever they gifted it to. */
  recipientId: text("recipient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  trophyId: text("trophy_id").notNull().references(() => trophies.id, { onDelete: "restrict" }),
  /** The award row this created, so a refund can find it. */
  awardId: text("award_id"),
  cpSpent: integer("cp_spent").notNull(),
  /** The trophy's cash value at purchase time — what it redeems for later. */
  value: doublePrecision("value").notNull().default(0),
  kind: text("kind").notNull().default("self"), // self | gift
  message: text("message"),
  status: text("status").notNull().default("complete"), // complete | refunded
  createdAt: now("created_at"),
}, (t) => [
  index("mo_buyer_idx").on(t.buyerId, t.createdAt),
  index("mo_recipient_idx").on(t.recipientId),
]);

// A trophy AWARDED to a gamer (challenge podium win). Lives on their profile
// until redeemed; "pending" = locked inside an open redeem request.
export const userTrophies = pgTable("user_trophies", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  trophyId: text("trophy_id").notNull().references(() => trophies.id, { onDelete: "cascade" }),
  challengeId: text("challenge_id"),
  placement: integer("placement").notNull().default(1), // 1 | 2 | 3
  status: text("status").notNull().default("held"),     // held | pending | redeemed
  awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A gamer's request to cash out trophies.
 *
 * pending → approved (staff) → sent (the provider issues a collection link) →
 * paid (the gamer collected it, or staff recorded a manual transfer).
 *
 * `details` is dead. It used to hold the routing and account numbers a gamer
 * typed into our form; the migration nulls it on every row and nothing writes
 * it again. The column stays only so a deploy that rolls back does not error on
 * a missing NOT NULL column — it is empty, and it is meant to be.
 *
 * What replaced it: `method` is a preference word, and `collectUrl` is a link
 * to the provider's page where the gamer picks a gift card, a bank transfer or
 * PayPal for themselves. We never learn which.
 */
export const trophyRedeems = pgTable("trophy_redeems", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  awardIds: jsonb("award_ids").$type<string[]>().notNull().default([]),
  amount: doublePrecision("amount").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  /** bank | paypal | wallet | giftcard | other — a word, never an account. */
  method: text("method").notNull().default("bank"),
  /** Deprecated and permanently empty. See the comment above. */
  details: jsonb("details").$type<Record<string, string>>().notNull().default({}),
  /** pending | approved | sent | paid | rejected | cancelled */
  status: text("status").notNull().default("pending"),
  /**
   * Why the last send attempt failed, from the provider (B39).
   *
   * `sendRedeem` returned the provider's error to whoever pressed the button and
   * recorded NOTHING — the row stayed `approved`, which is the right state, but
   * the reason lived in a toast that closed. The next person saw an approved
   * payout that had simply never gone, with no way to know it had been tried.
   * Cleared on a successful send.
   */
  failedReason: text("failed_reason"),
  /** Which provider was used, and its id for this payment. */
  providerKey: text("provider_key"),
  providerRef: text("provider_ref"),
  /** Where the gamer goes to choose how they want the money. Shown only to them. */
  collectUrl: text("collect_url"),
  gamerConfirmedAt: timestamp("gamer_confirmed_at", { withTimezone: true }),
  proofUrl: text("proof_url"),                          // staff-recorded confirmation, for manual sends
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
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
  mapVideoUrl: text("map_video_url"),          // looping animated map (mp4) — plays instead of the still art
  mapGlbUrl: text("map_glb_url"),              // 3D terrain mesh (GLB) — powers the in-game 3D view
  mapGlbCfg: jsonb("map_glb_cfg").$type<Record<string, unknown>>(), // admin texture-mapping tuning for the 3D terrain
  pathPoints: jsonb("path_points").$type<{ x: number; y: number }[]>(), // curved trail waypoints the astronaut rides
  pathPointsMobile: jsonb("path_points_mobile").$type<{ x: number; y: number }[]>(), // separate trail for the 4:5 mobile map (curves differ per aspect)
  missionsConfig: jsonb("missions_config").$type<{ kind: string; label: string; href: string; icon: string; threshold?: number; enabled?: boolean }[]>(), // admin-edited starter missions
  gameUi: jsonb("game_ui").$type<Record<string, { title?: string; bg?: string; dim?: number; btn?: string }>>(), // per-panel game-screen overrides (title/bg/overlay/button)
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
  /**
   * What this event PAID, as opposed to what it progressed (B34).
   *
   * One action credits CP once and progresses every listening quest, so a
   * second listener writes qpAwarded > 0 and cpAwarded = 0. NULL means the row
   * predates the split, when the two were the same number — readers coalesce to
   * qpAwarded, which is why this is nullable rather than defaulted.
   */
  cpAwarded: integer("cp_awarded"),
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

// ===== Gamer identity: votes and views =====
// A vote for someone's profile in the Best Profile race. Deliberately allows
// BOTH a signed-in web voter and a Discord voter who hasn't linked an account —
// the point is to let a whole server back one of their own, and requiring a
// sign-up first would kill exactly that moment. Uniqueness is enforced per
// identity by partial indexes, so nobody votes twice either way.
export const profileVotes = pgTable("profile_votes", {
  id: id(),
  profileUserId: text("profile_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  voterUserId: text("voter_user_id"),        // set for web votes
  voterDiscordId: text("voter_discord_id"),  // set for Discord votes
  guildId: text("guild_id"),                 // which server the vote came from
  source: text("source").notNull().default("web"), // web | discord | admin
  // Which competition week this vote banks to — the ISO date of that week's
  // Monday. NULL means it counts toward a lifetime total and no week: votes
  // cast on announcement day, and admin adjustments made outside a week.
  //
  // This is also what makes the competition weekly at all. One vote per voter
  // per profile FOR ALL TIME would mean a gamer who won you over in week one
  // could never be voted for again; the uniqueness is per week instead, so
  // every Monday is a genuinely fresh race.
  weekKey: text("week_key"),
  createdAt: now("created_at"),
});

// Everything staff do to a competition week, and why.
//
// Disqualifications and manual vote adjustments decide who wins a public
// competition with real prizes attached, so none of it is allowed to happen
// invisibly. Each row is one act by one person with a reason attached, and the
// weekly standings are computed from these alongside the real votes rather
// than by editing the votes themselves — an audit trail you can delete is not
// an audit trail.
export const voteWeekActions = pgTable("vote_week_actions", {
  id: id(),
  weekKey: text("week_key").notNull(),
  profileUserId: text("profile_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // disqualify | reinstate | adjust
  action: text("action").notNull(),
  // Signed, for `adjust`. Applied on top of the counted votes.
  delta: integer("delta").notNull().default(0),
  reason: text("reason").notNull().default(""),
  actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: now("created_at"),
}, (t) => [index("vwa_week_idx").on(t.weekKey, t.profileUserId)]);

// A finished week, as it was called.
//
// Written when staff close a week. Stored rather than recomputed because the
// standings depend on votes, disqualifications and adjustments that can all
// keep changing afterwards — and last Sunday's winner has to stay last
// Sunday's winner.
export const voteWeeks = pgTable("vote_weeks", {
  weekKey: text("week_key").primaryKey(),
  // The podium, in order, as it stood when the week was closed.
  podium: jsonb("podium").$type<{ userId: string; slug: string; displayName: string; votes: number; trophyId?: string | null }[]>()
    .notNull().default([]),
  streamUrl: text("stream_url"),
  streamLive: boolean("stream_live").notNull().default(false),
  announcedAt: timestamp("announced_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: now("created_at"),
});

// Where a profile was seen. This is what powers a gamer's own analytics — how
// many people saw them on the site vs in Discord, and in which servers.
export const profileViews = pgTable("profile_views", {
  id: id(),
  profileUserId: text("profile_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  source: text("source").notNull().default("web"), // web | discord
  guildId: text("guild_id"),
  guildName: text("guild_name"),
  viewerUserId: text("viewer_user_id"),
  viewerDiscordId: text("viewer_discord_id"),
  createdAt: now("created_at"),
}, (t) => [index("pvw_profile_idx").on(t.profileUserId, t.createdAt)]);

// ===== Discord servers =====
// A server that has installed ClusterBot. This is the unit the whole growth
// loop is measured in: an owner installs, watches their members join Cluster,
// and unlocks brand-sponsored challenges once enough of them have linked a game.
/**
 * One row per (server, kind, window) we have posted in (B1.3).
 *
 * Correctly scoped is not the same as bearable: a server with 200 members
 * linking accounts on launch day gets 200 correctly-scoped messages, and the
 * owner removes the bot on the same reasoning as if they had been wrong. This
 * is the cooldown — an insert that conflicts means "we already posted this kind
 * here in this window", and the event is counted instead of sent.
 */
export const discordPostLog = pgTable("discord_post_log", {
  id: id(),
  guildId: text("guild_id").notNull(),
  kind: text("kind").notNull(),
  /** `<kind>:<bucket>`, where bucket is the window index. Unique per guild. */
  windowKey: text("window_key").notNull(),
  /** How many events this window swallowed after the first. */
  suppressed: integer("suppressed").notNull().default(0),
  /** Who they were, for the batch message. Capped — a list is not a log. */
  names: jsonb("names").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (t) => [uniqueIndex("dpl_guild_window_idx").on(t.guildId, t.windowKey)]);

export const discordGuilds = pgTable("discord_guilds", {
  guildId: text("guild_id").primaryKey(),
  name: text("name").notNull().default(""),
  iconUrl: text("icon_url"),
  ownerDiscordId: text("owner_discord_id"),
  memberCount: integer("member_count").notNull().default(0),
  channelId: text("channel_id"),                       // the #clustergg channel we created
  status: text("status").notNull().default("active"),  // active | removed | paused
  announcementsEnabled: boolean("announcements_enabled").notNull().default(true),
  adOptIn: boolean("ad_opt_in").notNull().default(true),
  adUnlockedAt: timestamp("ad_unlocked_at", { withTimezone: true, mode: "date" }),
  /**
   * When this server first crossed a paying tier (B35).
   *
   * Written ONCE and never rewritten, so a server that dips below the threshold
   * and climbs back does not get a fresh holding period — and, more to the
   * point, cannot be given one deliberately. Null on a server that has never
   * reached a tier, and also on one that reached it before this column existed;
   * `payoutHold` treats an unknown start date as held rather than released,
   * because that is exactly the case where somebody arrived by a route we did
   * not record.
   */
  tierUnlockedAt: timestamp("tier_unlocked_at", { withTimezone: true, mode: "date" }),
  /**
   * The gamer who brought us this server (B22).
   *
   * Deliberately NOT a foreign key: the credit is a historical fact about how
   * this server arrived, and it should survive the gamer deleting their account
   * rather than cascading away and rewriting how we got here. Null is the
   * ordinary case — Discord's own "Add App" button carries no state, and most
   * installers have no Cluster account at all.
   */
  installedByUserId: text("installed_by_user_id"),
  /**
   * When this server's funded welcome challenge was created.
   *
   * Null means it is owed one — including for every server that installed the
   * bot BEFORE the offer existed. That is deliberate: an offer only new
   * signups can take teaches your earliest supporters that waiting would have
   * been better.
   */
  welcomeChallengeAt: timestamp("welcome_challenge_at", { withTimezone: true, mode: "date" }),
  /** The challenge itself, so it can be found again rather than re-created. */
  welcomeChallengeId: text("welcome_challenge_id"),
  revenueSharePct: integer("revenue_share_pct").notNull().default(70),
  // Public invite to this server. A private challenge is visible to everyone,
  // so the only way to GET the key is to be in the server — which makes this
  // link the thing that turns our challenge pages into traffic for them.
  inviteUrl: text("invite_url"),
  // The owner's portal: /servers/<slug>, unlocked by <portal_key>. Same shape
  // as the brand portal, because it's the same job — someone who doesn't have
  // a Cluster account needs to see their own numbers.
  slug: text("slug"),
  portalKey: text("portal_key"),
  /**
   * What this community actually is — answered by its own owner.
   *
   * This is inventory description. A brand buying Discord has to be able to ask
   * for "PUBG players in MENA" and get an answer, and the only person who
   * reliably knows what a server plays and where it lives is the person running
   * it. Everything else we hold is derived (linked accounts, challenge entries)
   * and lags reality by weeks; this is asked once, at install, in about twenty
   * seconds, and can be corrected any time.
   *
   * Shape and validation live in `lib/discord/community.ts` — this column is
   * deliberately loose so a new question doesn't need a migration.
   */
  community: jsonb("community").$type<Record<string, unknown>>().notNull().default({}),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  installedAt: now("installed_at"),
  removedAt: timestamp("removed_at", { withTimezone: true, mode: "date" }),
  /**
   * Where we reach the person running this server (B47).
   *
   * A column rather than a field inside `community`: it is an operational
   * contact, not audience data, and "every server we cannot reach" has to be a
   * query. Never inferred from Discord — the bot cannot read an owner's email,
   * and guessing one from a username puts a made-up address on a billing path.
   */
  contactEmail: text("contact_email"),
});

// The attribution ledger: which Cluster gamers came from which server.
// `firstLinkedAt` is the one that counts — a member who signed up but never
// linked a game hasn't yet become the thing advertisers pay for, so the unlock
// threshold deliberately measures LINKED gamers, not sign-ups.
export const discordGuildMembers = pgTable("discord_guild_members", {
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  attributedVia: text("attributed_via").notNull().default("bot"), // bot | announcement | manual
  joinedAt: now("joined_at"),
  firstLinkedAt: timestamp("first_linked_at", { withTimezone: true, mode: "date" }),
  leftAt: timestamp("left_at", { withTimezone: true, mode: "date" }),
}, (t) => [
  primaryKey({ columns: [t.guildId, t.userId] }),
  index("dgm_guild_idx").on(t.guildId, t.firstLinkedAt),
]);

// Every command and button press, per server. Powers the admin analytics and
// tells us which screens people actually use.
export const discordCommandLogs = pgTable("discord_command_logs", {
  id: id(),
  guildId: text("guild_id"),
  userId: text("user_id"),
  discordId: text("discord_id"),
  command: text("command").notNull(),   // e.g. "cluster show" or "button"
  screen: text("screen"),
  arg: text("arg"),
  latencyMs: integer("latency_ms").notNull().default(0),
  createdAt: now("created_at"),
}, (t) => [index("dcl_guild_idx").on(t.guildId, t.createdAt)]);

// What a private challenge page did for the server that owns it.
//
// A gated challenge is public to watch, and the only way to get the key is to
// be in the server — so these three numbers are the whole value exchange, and
// the owner should be able to see it: people looked, people clicked through to
// your invite, people joined you.
export const serverEvents = pgTable("server_events", {
  id: id(),
  guildId: text("guild_id").notNull(),
  type: text("type").notNull(),          // challenge_view | invite_click | member_joined
  challengeId: text("challenge_id"),
  userId: text("user_id"),
  sessionId: text("session_id"),
  createdAt: now("created_at"),
}, (t) => [index("sev_guild_idx").on(t.guildId, t.type, t.createdAt)]);

// A server owner asking us to run a challenge for their community.
//
// This is the engine of the growth loop: an owner needs linked gamers to unlock
// revenue, and the way to get them is a competition their members actually want
// to enter. They build it here — game, dates, trophies, prize value — and staff
// approve it. Approval is what creates the real `challenges` row, generates the
// access key, and announces it to their server.
/**
 * A brand buying a month of sponsored challenges on one game.
 *
 * This is the media buy. A brand picks a game, sees who it reaches, and buys
 * four weekly challenges — one month, one payment, no subscription. Every
 * challenge is $250: $175 of prize money and a $75 platform fee. Four of them
 * on one game is $1,000, and four is the minimum, because one challenge is a
 * post and four is a campaign.
 *
 * The four are NOT created at once. Only the first becomes a live challenge;
 * the next opens when it ends. A game runs one sponsored challenge at a time —
 * two competing on the same game in the same week split the field and make both
 * look empty. A brand can buy a second game in parallel, and that game runs its
 * own one-at-a-time queue.
 */
export const sponsoredCampaigns = pgTable("sponsored_campaigns", {
  id: id(),
  brandId: text("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  /**
   * The campaign's LEAD game. C7.
   *
   * It used to be the only game — a campaign was one game × four weeks, and a
   * mixed-game package had no row shape at all. The game now lives on each
   * SLOT, because that is where it is actually decided: a week is one challenge
   * on one game, and two of the same game in the same week split the field.
   *
   * This column stays as the first slot's game so `spc_game_idx`, the admin
   * lists and every existing read keep working. Anything asking "which games is
   * this campaign on" must read the slots — `campaignGames()`.
   */
  game: text("game").notNull(),
  /** How many weekly challenges were bought. One to four. */
  slots: integer("slots").notNull().default(4),
  /** What one challenge cost, and the total. Frozen at purchase. */
  pricePerChallenge: doublePrecision("price_per_challenge").notNull().default(250),
  total: doublePrecision("total").notNull().default(1000),
  /** draft | submitted | running | completed | cancelled */
  status: text("status").notNull().default("submitted"),
  /** Monday of the first week. Every slot is seven days from here. */
  startAt: timestamp("start_at", { withTimezone: true, mode: "date" }).notNull(),
  /** One cover for every week, unless a slot overrides it. */
  coverUrl: text("cover_url"),
  /**
   * Per-slot state: the cover, the request, the challenge it became.
   *
   * Held as one document rather than a table because a slot has no identity
   * outside its campaign — you never query "all slot 3s" — and because the
   * brand edits the upcoming one as a whole.
   */
  slotState: jsonb("slot_state").$type<{
    index: number;
    startAt: string;
    endAt: string;
    /**
     * This week's game. C7. Absent on campaigns bought before mixed packages
     * existed, which read as the campaign's lead game rather than as a gap.
     */
    game?: string | null;
    coverUrl?: string | null;
    requestId?: string | null;
    challengeId?: string | null;
    status: "waiting" | "requested" | "live" | "done";
  }[]>().notNull().default([]),
  /**
   * Who the brand asked for.
   *
   * `regions` and `games` come from what server owners told us about their
   * communities; `guildIds` is a hand-picked list when a brand wants specific
   * servers. Empty means the whole network, which is the default and usually
   * the right answer — a challenge nobody can enter is worth nothing.
   */
  targeting: jsonb("targeting").$type<{ regions?: string[]; countries?: string[]; guildIds?: string[] }>()
    .notNull().default({}),
  createdAt: now("created_at"),
}, (t) => [index("spc_brand_idx").on(t.brandId, t.createdAt), index("spc_game_idx").on(t.game, t.status)]);

/**
 * A department: a team, and the systems it runs.
 *
 * Staff do not hold permissions; departments do. A person is put in a
 * department and inherits whatever that department runs, which means access is
 * changed by moving somebody rather than by editing a checklist per head — the
 * difference between an org chart and a spreadsheet of exceptions.
 *
 * A staff member in no department sees nothing. That is the intended state for
 * a new hire on their first morning, not an error: somebody decides what they
 * run before they can run it.
 */
export const departments = pgTable("departments", {
  id: id(),
  name: text("name").notNull(),
  /** What this team is responsible for, in the manager's own words. */
  purpose: text("purpose").notNull().default(""),
  /** System keys from lib/systems.ts. */
  systems: jsonb("systems").$type<string[]>().notNull().default([]),
  createdAt: now("created_at"),
});

/**
 * The conversation between a server owner and Cluster.
 *
 * One thread per server, written to from three places and read from two: the
 * owner types in Discord or on their portal, staff reply from the admin
 * console, and the reply is delivered as a DM from the bot. To the owner it is
 * one conversation with the bot they installed; to staff it is a support inbox
 * with a thread per server. Modelled on `brandMessages` for exactly that
 * reason — the shape is proven and the two are read the same way.
 *
 * `deliveredAt` is what separates this from a comment log: a staff reply that
 * never reached Discord is a reply the owner never got, and the console has to
 * be able to say which.
 */
export const serverMessages = pgTable("server_messages", {
  id: id(),
  guildId: text("guild_id").notNull(),
  /** owner | admin */
  sender: text("sender").notNull(),
  body: text("body").notNull(),
  /** The Discord user who wrote it, or who a staff reply was sent to. */
  discordUserId: text("discord_user_id"),
  /** Where it came from: discord | portal | admin. */
  source: text("source").notNull().default("portal"),
  /** Set when the bot actually delivered a staff reply as a DM. */
  deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: "date" }),
  /** Why delivery failed, when it did — usually the owner's DMs are closed. */
  deliveryError: text("delivery_error"),
  readByAdmin: boolean("read_by_admin").notNull().default(false),
  readByOwner: boolean("read_by_owner").notNull().default(false),
  createdAt: now("created_at"),
}, (t) => [index("srv_msg_idx").on(t.guildId, t.createdAt)]);

/**
 * What a player said about a sponsored challenge, in their own words.
 *
 * The end-of-month report a brand receives ends with testimonials, and the only
 * kind worth printing is a real one. So these are entered by a human — staff
 * collect a quote from a winner and attribute it — rather than generated from
 * anything. A month with no quotes shows no quotes.
 */
export const brandTestimonials = pgTable("brand_testimonials", {
  id: id(),
  brandId: text("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id"),
  challengeId: text("challenge_id"),
  /** The gamer, when they're on the platform — their avatar and profile link. */
  userId: text("user_id"),
  /** Who said it, as printed. Falls back to the user's display name. */
  name: text("name").notNull().default(""),
  quote: text("quote").notNull(),
  /** draft | published — only published quotes reach the brand's report. */
  status: text("status").notNull().default("published"),
  createdAt: now("created_at"),
}, (t) => [index("btm_brand_idx").on(t.brandId, t.createdAt)]);

/**
 * Where a challenge announcement actually landed, and how many people were there.
 *
 * A brand asks "how many people saw it", and the only honest answer is a count
 * taken at the moment we posted: which servers received the message and how
 * many members each had. Recomputing it later from today's server sizes would
 * quietly rewrite history every time a server grew — so the number is frozen
 * per delivery, once, and never recalculated.
 *
 * One row per (challenge, server). The unique index is what makes a retrying
 * cron or a second announcement idempotent rather than double-counted.
 */
export const challengeDeliveries = pgTable("challenge_deliveries", {
  id: id(),
  challengeId: text("challenge_id").notNull(),
  guildId: text("guild_id").notNull(),
  /** Server members at the moment of delivery — the reach of this one post. */
  members: integer("members").notNull().default(0),
  /** Of those, the ones who had linked a game account and could actually enter. */
  linked: integer("linked").notNull().default(0),
  /** launch | ending | result — the same challenge is announced more than once. */
  kind: text("kind").notNull().default("launch"),
  createdAt: now("created_at"),
}, (t) => [
  uniqueIndex("cdel_once_idx").on(t.challengeId, t.guildId, t.kind),
  index("cdel_challenge_idx").on(t.challengeId),
]);

export const challengeRequests = pgTable("challenge_requests", {
  id: id(),
  // A request comes from one of two places, and admin has to be able to tell
  // them apart at a glance: a server owner asking to run something for their
  // community, or a BRAND who has paid for a slot in a campaign. Both land in
  // the same queue because both end in the same thing — a challenge with our
  // name on it — but they are reviewed with different questions in mind.
  guildId: text("guild_id").notNull(),
  brandId: text("brand_id"),
  campaignId: text("campaign_id"),
  /** Which of the campaign's four weeks this request is for. */
  slotIndex: integer("slot_index"),
  requestedByDiscordId: text("requested_by_discord_id"),
  requestedByUserId: text("requested_by_user_id"),
  game: text("game").notNull(),
  provider: text("provider").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  format: text("format").notNull().default("top3"),
  metric: text("metric"),                  // which tracked stat decides it
  days: integer("days").notNull().default(7),
  // What the owner is putting up. `prizeValue` is their own money, in whole
  // currency units — we record it so staff can sanity-check a request before
  // it goes live with our name on it.
  prizeValue: integer("prize_value").notNull().default(0),
  prizeCurrency: text("prize_currency").notNull().default("USD"),
  prizeDescription: text("prize_description"),
  // Trophies picked from OUR catalogue, per placement.
  prizes: jsonb("prizes").$type<{ first?: string[]; second?: string[]; third?: string[] }>(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  reviewNote: text("review_note"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
  challengeId: text("challenge_id"),       // set once approved
  createdAt: now("created_at"),
}, (t) => [index("creq_guild_idx").on(t.guildId, t.createdAt), index("creq_status_idx").on(t.status)]);

// A brand asking to buy.
//
// The pricing page states the rate card, so the next click has to be a real one.
// This records what they configured on the slider alongside who they are, which
// means the first sales reply already knows the plan, the games and the budget
// instead of opening with "what were you looking for?".
export const brandEnquiries = pgTable("brand_enquiries", {
  id: id(),
  company: text("company").notNull(),
  contactName: text("contact_name").notNull().default(""),
  email: text("email").notNull(),
  phone: text("phone"),
  website: text("website"),
  message: text("message").notNull().default(""),
  // The configuration they were looking at when they clicked.
  tier: text("tier").notNull().default("reach"),      // reach | challenge | ultimate
  games: integer("games").notNull().default(0),
  addon: boolean("addon").notNull().default(false),
  billing: text("billing").notNull().default("monthly"), // monthly | yearly
  quotedMonthly: integer("quoted_monthly").notNull().default(0),
  status: text("status").notNull().default("new"),    // new | contacted | won | lost
  note: text("note"),                                  // staff note
  brandId: text("brand_id"),                           // set once converted to a brand
  createdAt: now("created_at"),
}, (t) => [index("benq_status_idx").on(t.status, t.createdAt)]);

// Ads the bot has posted into a server, linked to the existing ad pipeline.
export const discordAdPosts = pgTable("discord_ad_posts", {
  id: id(),
  guildId: text("guild_id").notNull(),
  campaignCreativeId: text("campaign_creative_id"),
  channelId: text("channel_id"),
  messageId: text("message_id"),
  status: text("status").notNull().default("posted"), // posted | failed
  createdAt: now("created_at"),
}, (t) => [index("dap_guild_idx").on(t.guildId, t.createdAt)]);

// Profile of the Week posts the bot has already made into a server.
//
// The whole point of this row is the unique index. The daily post runs from a
// cron that is allowed to fire twice, and a retry after a partial failure must
// not repost into the servers that already got it — so "have I posted this
// already" is a database constraint rather than a timing assumption.
export const discordWeekPosts = pgTable("discord_week_posts", {
  id: id(),
  guildId: text("guild_id").notNull(),
  /** `update:<yyyy-mm-dd>` or `result:<weekKey>` — one post per key per guild. */
  postKey: text("post_key").notNull(),
  weekKey: text("week_key").notNull(),
  kind: text("kind").notNull().default("update"), // update | result
  channelId: text("channel_id"),
  messageId: text("message_id"),
  status: text("status").notNull().default("posted"), // posted | failed
  createdAt: now("created_at"),
}, (t) => [
  uniqueIndex("dwp_guild_key_idx").on(t.guildId, t.postKey),
  index("dwp_week_idx").on(t.weekKey),
]);

// ===== Rendered PNG cards =====
// Every "glorified snapshot" the Discord bot attaches (and every OG image a
// shared profile link produces) is a PNG rendered from live platform data.
// Rendering on every request would be slow AND would burn Vercel Blob data
// transfer, so each render is stored once in Blob and reused until the data
// behind it actually changes. `dataHash` is a hash of the exact card payload:
// same hash → serve the stored URL, different hash → re-render, replace, and
// delete the stale Blob object so storage never grows unbounded.
export const cardRenders = pgTable("card_renders", {
  id: id(),
  kind: text("kind").notNull(),         // profile | quest | leaderboard | guide | …
  cacheKey: text("cache_key").notNull(), // identity within the kind, e.g. a slug or "game:quest"
  dataHash: text("data_hash").notNull(),
  url: text("url").notNull(),
  bytes: integer("bytes").notNull().default(0),
  hits: integer("hits").notNull().default(0),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [uniqueIndex("card_render_idx").on(t.kind, t.cacheKey)]);

// ===== Data room =====
//
// Investor and partner documents — the pitch deck and the company profile —
// built out of ordered sections rather than written as pages. That's the whole
// design: an admin adds, reorders, retitles and re-arts a section without a
// deploy, and a section that pulls live numbers keeps pulling them.
//
// Docs are public by default because a link you have to negotiate access to is
// a link that doesn't get forwarded, and forwarding is the point. Setting an
// access key gates one without changing anything else.
export const dataroomDocs = pgTable("dataroom_docs", {
  id: id(),
  slug: text("slug").notNull().unique(),
  kind: text("kind").notNull().default("deck"),   // deck | profile
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  summary: text("summary"),                       // meta description + the hub card
  coverUrl: text("cover_url"),
  accent: text("accent").notNull().default("#8b5cf6"),
  accent2: text("accent2").notNull().default("#22d3ee"),
  accessKey: text("access_key"),                  // null = anyone with the link
  isPublished: boolean("is_published").notNull().default(true),
  contactEmail: text("contact_email"),
  contactNote: text("contact_note"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
});

// One slide. `kind` picks the renderer; `data` carries whatever that renderer
// needs (logo lists, gallery images, GTM stages, milestone targets…), which is
// why it's jsonb rather than a column per feature — new section types must not
// need a migration.
export const dataroomSections = pgTable("dataroom_sections", {
  id: id(),
  docId: text("doc_id").notNull().references(() => dataroomDocs.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),                   // hero | traction | milestones | gtm | product | team | logos | gallery | text | servers | contact | ad | metrics
  anchor: text("anchor").notNull(),               // the #id the nav jumps to
  navLabel: text("nav_label").notNull(),
  title: text("title"),
  subtitle: text("subtitle"),
  body: text("body"),                             // markdown-lite: blank-line paragraphs
  bgUrl: text("bg_url"),
  dim: integer("dim").notNull().default(62),      // 0-100 veil over the art
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  sortOrder: integer("sort_order").notNull().default(0),
  isVisible: boolean("is_visible").notNull().default(true),
});

// People, with the logos of where they've been. Shown as a card that opens a
// modal — an investor reading a deck wants the background before the contact
// details, and both belong in the same place.
export const dataroomPeople = pgTable("dataroom_people", {
  id: id(),
  docId: text("doc_id").references(() => dataroomDocs.id, { onDelete: "cascade" }), // null = on every doc
  name: text("name").notNull(),
  role: text("role").notNull(),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  email: text("email"),
  linkedin: text("linkedin"),
  x: text("x"),
  // [{name, logoUrl, url}] — the companies behind them.
  logos: jsonb("logos").$type<{ name: string; logoUrl?: string | null; url?: string | null }[]>().notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  isVisible: boolean("is_visible").notNull().default(true),
});

// Who opened what. A data room whose owner can't say which investor read the
// traction section is a PDF with extra steps.
export const dataroomViews = pgTable("dataroom_views", {
  id: id(),
  docId: text("doc_id").notNull(),
  sectionAnchor: text("section_anchor"),          // null = a page view
  visitorId: text("visitor_id"),                  // first-party cookie, not an identity
  referrer: text("referrer"),
  country: text("country"),
  device: text("device"),                         // mobile | desktop
  seconds: integer("seconds").notNull().default(0),
  createdAt: now("created_at"),
}, (t) => [index("droom_view_idx").on(t.docId, t.createdAt)]);

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
// Every attempt to unlock a brand or server portal, successful or not.
//
// The in-memory throttle this replaces was a speed bump that reset on every
// cold start and was invisible to staff — so a brand whose key was being ground
// down produced no record anywhere. Rows here do three jobs: they lock a portal
// after too many misses, they show staff exactly what happened and when, and
// they are the only place a "somebody tried to get into your account" answer
// can come from.
//
// The key itself is NEVER stored, not even hashed: a short shared secret in a
// log is a short shared secret in a backup.
export const portalLoginAttempts = pgTable("portal_login_attempts", {
  id: id(),
  /** "brand" | "server" */
  kind: text("kind").notNull(),
  portalId: text("portal_id").notNull(),
  /** Denormalised so a deleted brand still has a readable history. */
  portalName: text("portal_name"),
  ok: boolean("ok").notNull().default(false),
  hashedIp: text("hashed_ip"),
  userAgent: text("user_agent"),
  createdAt: now("created_at"),
}, (t) => [index("pla_portal_idx").on(t.kind, t.portalId, t.createdAt)]);

// ===== Money =====
//
// Three flows, three sets of tables, one rule that governs all of them:
// **nothing in here is a payment detail.** No card, no IBAN, no wallet address,
// no routing number. What is stored is a preference ("pay me by bank transfer")
// and an opaque handle a provider gave us. Everything that could be used to
// move money lives with the provider, behind their login, on their page.
//
// That is not caution for its own sake. A gaming platform holding the bank
// details of a few thousand teenagers is a breach waiting to be somebody's
// worst year, and the only version of this feature worth shipping is the one
// where there is nothing to steal.

/**
 * How a counterparty prefers to be paid — and, when a provider is connected,
 * their id on that provider's system.
 *
 * `providerRecipientId` is the whole point: an opaque string from Trolley or
 * Tremendous that means "the bank details you already hold for this person".
 * We can pay them with it and can learn nothing from it.
 */
export const payoutAccounts = pgTable("payout_accounts", {
  id: id(),
  /** "server" (a guild id) | "gamer" (a user id). */
  ownerType: text("owner_type").notNull(),
  ownerId: text("owner_id").notNull(),
  /** Which provider holds their details. */
  providerKey: text("provider_key").notNull().default("manual"),
  providerRecipientId: text("provider_recipient_id"),
  /**
   * A word, not an account. "bank" | "paypal" | "wallet" | "giftcard" | "other".
   * Shown so staff know what to expect and the recipient knows what they chose;
   * useless to anybody who reads it.
   */
  methodPreference: text("method_preference"),
  /** ISO-3166 alpha-2. Decides which methods a provider will offer, nothing else. */
  country: text("country"),
  currency: text("currency").notNull().default("USD"),
  /** none | pending | ready | blocked */
  status: text("status").notNull().default("none"),
  /** Free text from staff — why it's blocked, what's missing. Never details. */
  note: text("note"),
  updatedAt: now("updated_at"),
}, (t) => [uniqueIndex("payout_acct_owner_idx").on(t.ownerType, t.ownerId)]);

/**
 * What a brand owes.
 *
 * The totals are NOT stored. An invoice's total is the sum of its lines, always
 * recomputed, because an invoice whose stored total disagrees with its own line
 * items is the single worst bug this table could have — and it is the one that
 * happens the first time somebody edits a line and forgets to re-save the head.
 */
export const brandInvoices = pgTable("brand_invoices", {
  id: id(),
  brandId: text("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  /** Human-facing, sequential, never reused: CGG-0007. */
  number: text("number").notNull(),
  /** draft | sent | paid | void */
  status: text("status").notNull().default("draft"),
  currency: text("currency").notNull().default("USD"),
  /** The month this bills for, as a date staff can read. */
  periodLabel: text("period_label"),
  issuedAt: timestamp("issued_at", { withTimezone: true, mode: "date" }),
  dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }),
  paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
  /** Shown on the invoice, editable. Terms, PO number, anything. */
  notes: text("notes"),
  /**
   * Where the brand pays. Either minted by a provider adapter or pasted in by
   * staff from Payoneer, Wise, a bank — the invoice does not care which.
   */
  payLinkUrl: text("pay_link_url"),
  payProvider: text("pay_provider"),
  payRef: text("pay_ref"),
  /** Whether that link is safe to iframe. Hosted checkouts usually are not. */
  payEmbeddable: boolean("pay_embeddable").notNull().default(false),
  /** How it was actually settled, recorded by staff. A note, not an instrument. */
  paidVia: text("paid_via"),
  paidRef: text("paid_ref"),
  /** The unguessable token in /pay/<token>. Rotatable; never the invoice id. */
  payToken: text("pay_token"),
  createdAt: now("created_at"),
}, (t) => [
  uniqueIndex("brand_invoice_number_idx").on(t.number),
  index("brand_invoice_brand_idx").on(t.brandId, t.createdAt),
]);

/**
 * One line on an invoice. Every field is editable by an admin, including the
 * label and the amount, because the alternative is sales negotiating a number
 * the software refuses to print.
 *
 * A discount is a line with a negative amount rather than a separate concept:
 * one list that sums to the total is an invoice a brand can check, and two
 * lists that have to be reconciled is a dispute.
 */
export const invoiceLines = pgTable("invoice_lines", {
  id: id(),
  invoiceId: text("invoice_id").notNull().references(() => brandInvoices.id, { onDelete: "cascade" }),
  /** base | game | challenge | addon | discount | credit | adjustment */
  kind: text("kind").notNull().default("adjustment"),
  label: text("label").notNull(),
  quantity: doublePrecision("quantity").notNull().default(1),
  unitAmount: doublePrecision("unit_amount").notNull().default(0),
  /** What generated it, when something did — a campaign, a challenge. */
  sourceType: text("source_type"),
  sourceId: text("source_id"),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [index("invoice_line_inv_idx").on(t.invoiceId, t.sortOrder)]);

/**
 * A payment to a server owner.
 *
 * Always initiated by an admin — an owner cannot press a button and make money
 * leave. They can see what they are owed and ask about it; the release is ours.
 */
/**
 * What a server owner SPENT out of their earnings. B89.1.
 *
 * The other side of the wallet. Pool earnings are credits, computed from the
 * weekly close's payout lines; withdrawals are payouts. This is the third
 * movement: an owner buying a private challenge for their own members and
 * paying for it out of what they earned.
 *
 * It is a CHARGE and not a transfer, and that distinction is the whole reason
 * the table looks like this. The owner buys a product from us at a price; we
 * then owe the prize as our own obligation out of our own revenue. A row here
 * reduces what we owe the owner and increases what we owe their members — it
 * never moves value from one person to another, which is the thing that would
 * make us a money transmitter (`docs/B73_RESEARCH.md` Q3).
 */
export const serverCharges = pgTable("server_charges", {
  id: id(),
  guildId: text("guild_id").notNull(),
  /** Positive dollars. What was taken out of the wallet. */
  amount: doublePrecision("amount").notNull().default(0),
  /** `private_challenge` today. Named so a second kind cannot be confused with it. */
  kind: text("kind").notNull().default("private_challenge"),
  /** The challenge this bought, so the charge and the thing are one click apart. */
  challengeId: text("challenge_id"),
  /** What the owner reads on their statement. */
  label: text("label").notNull().default(""),
  /** Our margin on it, recorded separately so "what did we make" is a query. */
  feeAmount: doublePrecision("fee_amount").notNull().default(0),
  createdAt: now("created_at"),
}, (t) => [index("server_charge_idx").on(t.guildId, t.createdAt)]);

export const serverPayouts = pgTable("server_payouts", {
  id: id(),
  guildId: text("guild_id").notNull(),
  /** Denormalised so a server that removes the bot keeps a readable payout history. */
  guildName: text("guild_name"),
  /** draft | requested | approved | processing | paid | failed | cancelled */
  status: text("status").notNull().default("draft"),
  currency: text("currency").notNull().default("USD"),
  periodStart: timestamp("period_start", { withTimezone: true, mode: "date" }),
  periodEnd: timestamp("period_end", { withTimezone: true, mode: "date" }),
  /** Which provider sent it, and its id over there. */
  providerKey: text("provider_key"),
  providerRef: text("provider_ref"),
  /** Set when the recipient has to open something to collect it. */
  collectUrl: text("collect_url"),
  note: text("note"),
  /** Who released it. Payouts are never anonymous. */
  requestedBy: text("requested_by"),
  requestedAt: timestamp("requested_at", { withTimezone: true, mode: "date" }),
  paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
  failedReason: text("failed_reason"),
  createdAt: now("created_at"),
}, (t) => [index("server_payout_guild_idx").on(t.guildId, t.createdAt)]);

/** What a payout is made of, so an owner can check it line by line. */
export const serverPayoutLines = pgTable("server_payout_lines", {
  id: id(),
  payoutId: text("payout_id").notNull().references(() => serverPayouts.id, { onDelete: "cascade" }),
  /** sponsored_share | bonus | adjustment */
  kind: text("kind").notNull().default("sponsored_share"),
  label: text("label").notNull(),
  challengeId: text("challenge_id"),
  amount: doublePrecision("amount").notNull().default(0),
}, (t) => [index("server_payout_line_idx").on(t.payoutId)]);

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

// ===== Feature screenshots (B7) =====
//
// One row per COMPONENT worth proving, keyed by a stable name like
// "server.earnings.ledger". Every page that claims that component renders
// `<FeatureShot shotKey="server.earnings.ledger" />`, so changing this one row
// updates the picture everywhere it appears — which is the entire requirement:
// an admin changes one image and it changes on every page the component is
// claimed on.
//
// The text lives here too, not in the page. An admin who can swap the picture
// but not the caption under it can only half-fix a stale claim, and the caption
// is a claim: it is the sentence the screenshot is being used to support.
export const featureShots = pgTable("feature_shots", {
  /** Stable component name, e.g. "gamer.cp.ledger". The primary key. */
  key: text("key").primaryKey(),
  /** Blob URL. Null means "not captured yet" — the component shows a labelled placeholder. */
  imageUrl: text("image_url"),
  /** Accessibility text. Also a claim, so it is admin-editable like the rest. */
  altText: text("alt_text").notNull().default(""),
  /** The line printed under the shot. Empty renders no caption rather than an empty bar. */
  caption: text("caption").notNull().default(""),
  /** What this shot is being used to prove. Shown in the admin console, never to visitors. */
  claim: text("claim").notNull().default(""),
  /** {title, subtitle, badge, focusRect, blur[]} — drawn over the image. */
  overlay: jsonb("overlay").$type<Record<string, unknown>>().default({}),
  /** The route it was captured from, so it can be recaptured without guessing. */
  capturedFrom: text("captured_from"),
  capturedAt: timestamp("captured_at", { withTimezone: true, mode: "date" }),
  /** Natural size, so the component can reserve the right box and never shift the page. */
  width: integer("width"),
  height: integer("height"),
  updatedBy: text("updated_by"),
  updatedAt: now("updated_at"),
});

// ===== Email delivery log (B32) =====
//
// Every message we attempt, whether or not it left the building.
//
// A row is written even when mail is UNCONFIGURED — status `skipped` — because
// the question a human actually asks is "did the brand get told they owe us
// $1,000", and "we never sent it because nobody set the API key" is an answer.
// A layer that silently does nothing when it is switched off teaches you to
// trust it exactly when it is doing the least.
/**
 * One row per (announcement, server) waiting to be posted (B33).
 *
 * The unit of retry is ONE SERVER, not one announcement. A fan-out where the
 * fortieth guild has revoked the channel must not re-post to the first
 * thirty-nine, and a rate limit on one server must not stall the rest.
 *
 * Why a queue at all: `announce()` posted to every guild sequentially, awaiting
 * each call, from inside server actions that declare no `maxDuration`. At ~200ms
 * a call that is 20 seconds at 100 servers and three minutes at 1,000, inside a
 * request killed long before — and the failure was SILENT and PARTIAL, because
 * the ledger checkpoints every ten servers and therefore recorded a
 * plausible-looking number and stopped. It read as "reach was lower than
 * expected" rather than "the process was killed".
 *
 * Parallelising instead would have traded a slow failure for a rate-limit ban,
 * which is worse.
 */
export const discordPostQueue = pgTable("discord_post_queue", {
  id: id(),
  /** Groups every row of one fan-out, so a batch can be reported on. */
  batchId: text("batch_id").notNull(),
  channelId: text("channel_id").notNull(),
  guildId: text("guild_id"),
  /**
   * The finished message for THIS server.
   *
   * Built at enqueue rather than at drain, because the sponsor row under an
   * announcement is minted per recipient — rebuilding it later would attribute
   * a click to the wrong server.
   */
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  /** Set when this fan-out counts toward a challenge's reach. */
  ledgerChallengeId: text("ledger_challenge_id"),
  ledgerKind: text("ledger_kind"),
  /** pending | done | failed */
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  /** Backoff, and how a 429 reschedules instead of dropping. */
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  postedAt: timestamp("posted_at", { withTimezone: true, mode: "date" }),
  createdAt: now("created_at"),
}, (t) => [
  index("dpq_drain_idx").on(t.status, t.nextAttemptAt),
  index("dpq_batch_idx").on(t.batchId),
]);

export const emailLog = pgTable("email_log", {
  id: id(),
  /** Who it went to. */
  toAddress: text("to_address").notNull(),
  /** Which template — the key in lib/email/templates.ts, never free text. */
  template: text("template").notNull(),
  subject: text("subject").notNull(),
  /** Resend's id, once it has one. Null while skipped or failed before send. */
  providerId: text("provider_id"),
  /**
   * queued | skipped | sent | delivered | bounced | complained | failed
   *
   * `skipped` means mail is not configured on this deployment. It is not an
   * error and must never read as one, but it is not a delivery either.
   */
  status: text("status").notNull().default("queued"),
  /** Why it failed, or why it was skipped. Shown to staff, never to a customer. */
  error: text("error"),
  /** What it was about — an invoice id, a payout id — so the console can link out. */
  refType: text("ref_type"),
  refId: text("ref_id"),
  createdAt: now("created_at"),
  updatedAt: now("updated_at"),
}, (t) => [
  index("email_log_created_idx").on(t.createdAt),
  index("email_log_status_idx").on(t.status),
]);
