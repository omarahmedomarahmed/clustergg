CREATE TABLE "ad_campaign_creatives" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"creative_id" text NOT NULL,
	"placement_id" text NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"budget" double precision,
	"target_geo" text,
	"target_device" text DEFAULT 'both' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_clicks" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_creative_id" text NOT NULL,
	"impression_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_creatives" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'image' NOT NULL,
	"file_url" text NOT NULL,
	"click_url" text,
	"width" integer,
	"height" integer,
	"duration_seconds" integer,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_impressions" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_creative_id" text NOT NULL,
	"user_id" text,
	"session_id" text,
	"page_path" text,
	"device_type" text,
	"hashed_ip" text,
	"geo_country" text,
	"geo_city" text,
	"duration_viewed_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_placements" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"page_scope" text NOT NULL,
	"device" text DEFAULT 'both' NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"mobile_width" integer,
	"mobile_height" integer,
	"max_creatives_in_rotation" integer DEFAULT 3 NOT NULL,
	"rotation_interval_seconds" integer DEFAULT 5 NOT NULL,
	CONSTRAINT "ad_placements_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "badges" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"icon" text DEFAULT 'star' NOT NULL,
	"category" text DEFAULT 'platform' NOT NULL,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "badges_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"industry" text DEFAULT 'other' NOT NULL,
	"contact_email" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_events" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"event_type" text NOT NULL,
	"points_awarded" integer DEFAULT 0 NOT NULL,
	"raw_payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge_id" text NOT NULL,
	"user_id" text NOT NULL,
	"linked_account_id" text NOT NULL,
	"baseline" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current_points" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"final_placement" integer,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"game" text NOT NULL,
	"provider" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"format" text DEFAULT 'top3' NOT NULL,
	"rules" jsonb DEFAULT '{"conditions":[]}'::jsonb NOT NULL,
	"points_engine" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"threshold_target" integer,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"cadence" text DEFAULT 'custom' NOT NULL,
	"hero_type" text DEFAULT 'image' NOT NULL,
	"hero_url" text,
	"cover_url" text,
	"cover_adjust" jsonb DEFAULT '{"zoom":1,"x":50,"y":50}'::jsonb NOT NULL,
	"trophy_id" text,
	"prize_description" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_reactions" (
	"comment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reaction_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_reactions_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"parent_comment_id" text,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"conversation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"last_read_at" timestamp with time zone,
	CONSTRAINT "conversation_participants_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_id" text NOT NULL,
	"following_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_following_id_pk" PRIMARY KEY("follower_id","following_id")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"logo_url" text,
	"cover_url" text,
	"cover_adjust" jsonb DEFAULT '{"zoom":1,"x":50,"y":50}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"show_in_nav" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "games_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "leaderboards" (
	"id" text PRIMARY KEY NOT NULL,
	"game" text NOT NULL,
	"metric_key" text NOT NULL,
	"title" text NOT NULL,
	"unit" text,
	"sort_dir" text DEFAULT 'desc' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linked_game_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"in_game_name" text NOT NULL,
	"region" text,
	"verified" boolean DEFAULT false NOT NULL,
	"sync_status" text DEFAULT 'pending' NOT NULL,
	"sync_error" text,
	"last_synced_at" timestamp with time zone,
	"next_sync_at" timestamp with time zone,
	"provider_data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"scopes" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"logo_url" text NOT NULL,
	"url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_reactions" (
	"post_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reaction_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_reactions_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"media_url" text,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "space_expert_scores" (
	"space_id" text NOT NULL,
	"user_id" text NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"tier" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_expert_scores_space_id_user_id_pk" PRIMARY KEY("space_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "space_members" (
	"space_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_members_space_id_user_id_pk" PRIMARY KEY("space_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "space_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"requested_by" text NOT NULL,
	"proposed_name" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"game" text,
	"cover_emoji" text DEFAULT '🌌' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"member_count" integer DEFAULT 0 NOT NULL,
	"post_count" integer DEFAULT 0 NOT NULL,
	"expert_thresholds" jsonb DEFAULT '{"contributor":10,"helper":50,"expert":150}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "stat_current" (
	"id" text PRIMARY KEY NOT NULL,
	"linked_account_id" text NOT NULL,
	"game" text NOT NULL,
	"metric_key" text NOT NULL,
	"metric_value" double precision NOT NULL,
	"rank_label" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stat_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"linked_account_id" text NOT NULL,
	"game" text NOT NULL,
	"metric_key" text NOT NULL,
	"metric_value" double precision NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trophies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"image_url" text NOT NULL,
	"tier" text DEFAULT 'gold' NOT NULL,
	"game" text
);
--> statement-breakpoint
CREATE TABLE "user_badges" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"badge_id" text NOT NULL,
	"context" text,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"password_hash" text,
	"display_name" text NOT NULL,
	"slug" text NOT NULL,
	"avatar_url" text,
	"banner_url" text,
	"bio" text,
	"country" text,
	"title" text,
	"role" text DEFAULT 'user' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"primary_signup_provider" text,
	"profile_visibility" text DEFAULT 'public' NOT NULL,
	"allow_messages_from" text DEFAULT 'everyone' NOT NULL,
	"email_notifications" boolean DEFAULT true NOT NULL,
	"theme" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "ad_campaign_creatives" ADD CONSTRAINT "ad_campaign_creatives_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaign_creatives" ADD CONSTRAINT "ad_campaign_creatives_creative_id_ad_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."ad_creatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaign_creatives" ADD CONSTRAINT "ad_campaign_creatives_placement_id_ad_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."ad_placements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_clicks" ADD CONSTRAINT "ad_clicks_campaign_creative_id_ad_campaign_creatives_id_fk" FOREIGN KEY ("campaign_creative_id") REFERENCES "public"."ad_campaign_creatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_impressions" ADD CONSTRAINT "ad_impressions_campaign_creative_id_ad_campaign_creatives_id_fk" FOREIGN KEY ("campaign_creative_id") REFERENCES "public"."ad_campaign_creatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_events" ADD CONSTRAINT "challenge_events_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_events" ADD CONSTRAINT "challenge_events_participant_id_challenge_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."challenge_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_linked_account_id_linked_game_accounts_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "public"."linked_game_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_users_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_game_accounts" ADD CONSTRAINT "linked_game_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_identities" ADD CONSTRAINT "oauth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_expert_scores" ADD CONSTRAINT "space_expert_scores_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_expert_scores" ADD CONSTRAINT "space_expert_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_requests" ADD CONSTRAINT "space_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stat_current" ADD CONSTRAINT "stat_current_linked_account_id_linked_game_accounts_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "public"."linked_game_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stat_snapshots" ADD CONSTRAINT "stat_snapshots_linked_account_id_linked_game_accounts_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "public"."linked_game_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_badge_id_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "imp_cc_idx" ON "ad_impressions" USING btree ("campaign_creative_id","created_at");--> statement-breakpoint
CREATE INDEX "ce_challenge_idx" ON "challenge_events" USING btree ("challenge_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cp_challenge_user_idx" ON "challenge_participants" USING btree ("challenge_id","user_id");--> statement-breakpoint
CREATE INDEX "comments_post_idx" ON "comments" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lb_game_metric_idx" ON "leaderboards" USING btree ("game","metric_key");--> statement-breakpoint
CREATE UNIQUE INDEX "lga_user_provider_acct_idx" ON "linked_game_accounts" USING btree ("user_id","provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "lga_provider_idx" ON "linked_game_accounts" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "msg_conv_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "notif_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_provider_uid_idx" ON "oauth_identities" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE INDEX "posts_space_idx" ON "posts" USING btree ("space_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sc_acct_game_metric_idx" ON "stat_current" USING btree ("linked_account_id","game","metric_key");--> statement-breakpoint
CREATE INDEX "sc_game_metric_idx" ON "stat_current" USING btree ("game","metric_key");--> statement-breakpoint
CREATE INDEX "snap_game_metric_idx" ON "stat_snapshots" USING btree ("game","metric_key","metric_value");--> statement-breakpoint
CREATE UNIQUE INDEX "ub_user_badge_idx" ON "user_badges" USING btree ("user_id","badge_id");--> statement-breakpoint
CREATE INDEX "users_slug_idx" ON "users" USING btree ("slug");