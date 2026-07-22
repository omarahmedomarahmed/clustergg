import { and, eq, isNull, lt, sql as dsql } from "drizzle-orm";
import type { DB } from "./index";
import * as schema from "./schema";
import { hashPassword } from "@/lib/password";
import { uid } from "@/lib/utils";
import { BADGE_ART, TROPHY_ART, BANNER_ART } from "@/lib/assets";

// Seeds platform defaults (badges, games, spaces, placements, leaderboards,
// trophies) and the superadmin from env. Demo mode additionally seeds a demo
// universe with real public game accounts so the keyless providers pull REAL
// data. Production (`demo:false`) seeds NO demo users.

const svgAd = (w: number, h: number, from: string, to: string, brand: string, tagline: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g)" rx="8"/>
<circle cx="${w * 0.85}" cy="${h * 0.3}" r="${Math.min(w, h) * 0.4}" fill="rgba(255,255,255,0.08)"/>
<text x="24" y="${h / 2 - 4}" font-family="Arial,sans-serif" font-weight="bold" font-size="${Math.min(h * 0.3, 28)}" fill="white">${brand}</text>
<text x="24" y="${h / 2 + Math.min(h * 0.28, 24)}" font-family="Arial,sans-serif" font-size="${Math.min(h * 0.18, 15)}" fill="rgba(255,255,255,0.85)">${tagline}</text>
</svg>`)}`;

export async function seed(db: DB, opts: { demo: boolean }) {
  // ---------- Superadmin from env (production bootstrap) ----------
  // SUPERADMIN_SEED_EMAIL + SUPERADMIN_SEED_PASSWORD_HASH (bcrypt or scrypt salt:hex).
  const adminEmail = process.env.SUPERADMIN_SEED_EMAIL?.trim().toLowerCase();
  const adminHash = process.env.SUPERADMIN_SEED_PASSWORD_HASH?.trim();
  let envAdminId: string | null = null;
  if (adminEmail && adminHash) {
    envAdminId = uid();
    await db.insert(schema.users).values({
      id: envAdminId, email: adminEmail, passwordHash: adminHash,
      displayName: "Mission Control", slug: "mission-control",
      bio: "Cluster platform operations.", role: "superadmin", isVerified: true,
      primarySignupProvider: "email",
    }).onConflictDoNothing();
  }

  // ---------- Games catalog (logos/covers admin-editable at /admin/games) ----------
  const gameDefs = [
    { slug: "chess", name: "Chess", description: "Chess.com & Lichess — blitz, bullet, rapid and puzzles, all live-synced." },
    { slug: "dota-2", name: "Dota 2", description: "Ranks, win rates and MMR pulled straight from OpenDota." },
    { slug: "valorant", name: "VALORANT", description: "Agents, comps and clutches on Riot's tactical shooter." },
    { slug: "league-of-legends", name: "League of Legends", description: "From Iron to Challenger on the Rift." },
    { slug: "fortnite", name: "Fortnite", description: "Victory Royales, K/D and battle pass grinding." },
    { slug: "counter-strike-2", name: "Counter-Strike 2", description: "FACEIT elo and skill levels for CS2." },
    { slug: "minecraft", name: "Minecraft", description: "Hypixel network levels, karma and achievements." },
    { slug: "steam", name: "Steam", description: "Levels, libraries and playtime across the Steam universe." },
    { slug: "speedrunning", name: "Speedrunning", description: "Personal bests, podiums and world records from Speedrun.com." },
    { slug: "roblox", name: "Roblox", description: "The creator universe — followers, friends and legacy." },
    { slug: "apex-legends", name: "Apex Legends", description: "Ranked RP and lifetime kills from the Outlands." },
    { slug: "pubg", name: "PUBG", description: "Chicken dinners, survival stats and the Outlands of Erangel." },
    { slug: "osu", name: "osu!", description: "Performance points and global rank precision clicking." },
    { slug: "mobile-legends", name: "Mobile Legends", description: "MLBB wins, win rate and MVPs — verified with an in-game code." },
  ];
  const gameIds: Record<string, string> = {};
  for (let i = 0; i < gameDefs.length; i++) {
    const gid = uid();
    gameIds[gameDefs[i].slug] = gid;
    await db.insert(schema.games).values({ id: gid, sortOrder: i, ...gameDefs[i] }).onConflictDoNothing();
  }

  // ---------- Trophies (challenge prize art) ----------
  const trophyDefs = [
    { name: "Champion's Nebula Cup", imageUrl: TROPHY_ART.gold, tier: "gold" },
    { name: "Silver Star Cup", imageUrl: TROPHY_ART.silver, tier: "silver" },
    { name: "Bronze Ember Cup", imageUrl: TROPHY_ART.bronze, tier: "bronze" },
    { name: "Supernova Crystal", imageUrl: TROPHY_ART.legendary, tier: "legendary" },
  ];
  const trophyIds: string[] = [];
  for (const t of trophyDefs) {
    const tid = uid();
    trophyIds.push(tid);
    await db.insert(schema.trophies).values({ id: tid, ...t }).onConflictDoNothing();
  }

  // ---------- Badges (individual generated art) ----------
  const badgeDefs = [
    { code: "star_forged", name: "Star Forged", description: "Linked your first game account", icon: BADGE_ART.b1, category: "platform", criteria: { type: "account_linked" } },
    { code: "constellation", name: "Constellation", description: "Linked 3+ game accounts", icon: BADGE_ART.b2, category: "platform", criteria: { type: "accounts_linked_count", min: 3 } },
    { code: "galaxy_brain", name: "Galaxy Brain", description: "Linked 5+ game accounts", icon: BADGE_ART.b3, category: "platform", criteria: { type: "accounts_linked_count", min: 5 } },
    { code: "verified_knight", name: "Verified Knight", description: "Connected a Chess.com account", icon: BADGE_ART.b2, category: "game", criteria: { type: "account_linked", provider: "chesscom" } },
    { code: "grandmaster_cluster", name: "Grandmaster Cluster", description: "Reached 2500+ blitz rating", icon: BADGE_ART.b4, category: "game", criteria: { type: "stat_threshold", metric: "blitz_rating", min: 2500 } },
    { code: "rising_star", name: "Rising Star", description: "Reached 1500+ rapid rating", icon: BADGE_ART.b1, category: "game", criteria: { type: "stat_threshold", metric: "rapid_rating", min: 1500 } },
    { code: "immortal_ancient", name: "Ancient One", description: "Reached Ancient rank or above in Dota 2", icon: BADGE_ART.b6, category: "game", criteria: { type: "stat_threshold", metric: "rank_tier", game: "Dota 2", min: 60 } },
    { code: "signal_boost", name: "Signal Boost", description: "Reached 10 followers", icon: BADGE_ART.b5, category: "community", criteria: { type: "follower_count", min: 10 } },
    { code: "voice_of_the_void", name: "Voice of the Void", description: "20 posts with 50 likes received", icon: BADGE_ART.b3, category: "community", criteria: { type: "community_activity", posts_min: 20, reactions_received_min: 50 } },
    { code: "space_expert", name: "Space Expert", description: "Earned Expert tier in a community Space", icon: BADGE_ART.b6, category: "community", criteria: { type: "expert_tier", tier: "expert" } },
    { code: "challenge_top1", name: "Supernova", description: "Won 1st place in a Challenge", icon: BADGE_ART.b4, category: "challenge", criteria: { type: "challenge_result", placement: "top1" } },
    { code: "challenge_top3", name: "Orbit Breaker", description: "Placed top 3 in a Challenge", icon: BADGE_ART.b1, category: "challenge", criteria: { type: "challenge_result", placement: "top3" } },
  ] as const;
  const badgeIds: Record<string, string> = {};
  for (const b of badgeDefs) {
    const bid = uid();
    badgeIds[b.code] = bid;
    await db.insert(schema.badges).values({ id: bid, ...b, criteria: { ...b.criteria } }).onConflictDoNothing();
  }

  // ---------- Spaces ----------
  const spaceDefs = [
    { slug: "valorant", name: "VALORANT", game: "VALORANT", description: "Agents, comps, clutches. The VALORANT nebula." },
    { slug: "league-of-legends", name: "League of Legends", game: "League of Legends", description: "From Iron to Challenger — the Rift constellation." },
    { slug: "fortnite", name: "Fortnite", game: "Fortnite", description: "Drop in, build up, fly out." },
    { slug: "chess", name: "Chess", game: "Chess", description: "Chess.com & Lichess grinders. Real rating leaderboards." },
    { slug: "dota-2", name: "Dota 2", game: "Dota 2", description: "MMR climbers and Immortal dreamers." },
    { slug: "apex-legends", name: "Apex Legends", game: "Apex Legends", description: "Ranked RP and lifetime kills from the Outlands." },
    { slug: "pubg", name: "PUBG", game: "PUBG", description: "Chicken dinners, survival stats and the Outlands of Erangel." },
    { slug: "mobile-legends", name: "Mobile Legends", game: "Mobile Legends", description: "MLBB grinders — rank up, rack up MVPs, top the win-rate board." },
    { slug: "general-gaming", name: "General Gaming", game: null, description: "Everything gaming across the galaxy." },
    { slug: "hardware-setups", name: "Hardware & Setups", game: null, description: "Battlestations, peripherals, and RGB supremacy." },
    { slug: "lfg-team-finder", name: "LFG / Team Finder", game: null, description: "Find your squad among the stars." },
  ];
  const spaceIds: Record<string, string> = {};
  for (const s of spaceDefs) {
    const sid = uid();
    spaceIds[s.slug] = sid;
    await db.insert(schema.spaces).values({ id: sid, isDefault: true, coverEmoji: "", ...s }).onConflictDoNothing();
  }

  // ---------- Leaderboard definitions ----------
  const lbDefs = [
    { game: "Chess", metricKey: "blitz_rating", title: "Chess · Blitz Rating", unit: "elo" },
    { game: "Chess", metricKey: "rapid_rating", title: "Chess · Rapid Rating", unit: "elo" },
    { game: "Chess", metricKey: "bullet_rating", title: "Chess · Bullet Rating", unit: "elo" },
    { game: "Chess", metricKey: "puzzle_rating", title: "Chess · Puzzle Rating", unit: "elo" },
    { game: "Chess", metricKey: "wins", title: "Chess · Total Wins", unit: "wins" },
    { game: "Dota 2", metricKey: "wins", title: "Dota 2 · Total Wins", unit: "wins" },
    { game: "Dota 2", metricKey: "win_rate", title: "Dota 2 · Win Rate", unit: "%" },
    { game: "Dota 2", metricKey: "rank_tier", title: "Dota 2 · Rank Tier", unit: "" },
    { game: "Speedrunning", metricKey: "world_records", title: "Speedrunning · World Records", unit: "WRs" },
    { game: "Speedrunning", metricKey: "personal_bests", title: "Speedrunning · Personal Bests", unit: "PBs" },
    { game: "Roblox", metricKey: "followers", title: "Roblox · Followers", unit: "" },
    { game: "Steam", metricKey: "steam_level", title: "Steam · Level", unit: "lvl" },
    { game: "Steam", metricKey: "playtime_hours", title: "Steam · Playtime", unit: "h" },
    { game: "League of Legends", metricKey: "solo_tier", title: "LoL · Solo/Duo Rank", unit: "" },
    { game: "League of Legends", metricKey: "win_rate", title: "LoL · Win Rate", unit: "%" },
    { game: "Fortnite", metricKey: "wins", title: "Fortnite · Victory Royales", unit: "wins" },
    { game: "Fortnite", metricKey: "kd_ratio", title: "Fortnite · K/D Ratio", unit: "" },
    { game: "Counter-Strike 2", metricKey: "elo", title: "CS2 · FACEIT Elo", unit: "elo" },
    { game: "Minecraft", metricKey: "network_level", title: "Minecraft · Hypixel Level", unit: "lvl" },
    { game: "osu!", metricKey: "pp", title: "osu! · Performance Points", unit: "pp" },
    { game: "Apex Legends", metricKey: "rank_score", title: "Apex · Rank Score", unit: "RP" },
    { game: "Mobile Legends", metricKey: "wins", title: "Mobile Legends · Total Wins", unit: "wins" },
    { game: "Mobile Legends", metricKey: "win_rate", title: "Mobile Legends · Win Rate", unit: "%" },
    { game: "Mobile Legends", metricKey: "mvp", title: "Mobile Legends · MVP Count", unit: "MVPs" },
    { game: "Mobile Legends", metricKey: "level", title: "Mobile Legends · Account Level", unit: "lvl" },
  ];
  for (const lb of lbDefs) {
    await db.insert(schema.leaderboards).values({ id: uid(), sortDir: "desc", ...lb }).onConflictDoNothing();
  }

  // ---------- Ad placements ----------
  const placementDefs = [
    { key: "landing_hero_banner", pageScope: "Landing page, below hero", device: "both", width: 970, height: 250, mobileWidth: 320, mobileHeight: 100 },
    { key: "profile_sidebar", pageScope: "Profile page right rail", device: "desktop", width: 300, height: 250, mobileWidth: null, mobileHeight: null },
    { key: "profile_footer_banner", pageScope: "Bottom of gamer profiles", device: "both", width: 728, height: 90, mobileWidth: 320, mobileHeight: 50 },
    { key: "leaderboard_top_banner", pageScope: "Top of leaderboard pages", device: "both", width: 728, height: 90, mobileWidth: 320, mobileHeight: 50 },
    { key: "leaderboard_sidebar", pageScope: "Leaderboard page right rail", device: "desktop", width: 300, height: 600, mobileWidth: null, mobileHeight: null },
    { key: "leaderboard_inline", pageScope: "Every 10 leaderboard rows", device: "both", width: 728, height: 90, mobileWidth: 300, mobileHeight: 50 },
    { key: "games_top_banner", pageScope: "Top of games pages", device: "both", width: 728, height: 90, mobileWidth: 320, mobileHeight: 50 },
    { key: "feed_top_banner", pageScope: "Top of the feed", device: "both", width: 728, height: 90, mobileWidth: 320, mobileHeight: 50 },
    { key: "feed_inline", pageScope: "Every 6 posts in a Space feed", device: "both", width: 728, height: 90, mobileWidth: 320, mobileHeight: 100 },
    { key: "challenge_sidebar", pageScope: "Challenge detail rail", device: "desktop", width: 300, height: 600, mobileWidth: null, mobileHeight: null },
    { key: "messages_footer", pageScope: "Above message compose box", device: "both", width: 320, height: 50, mobileWidth: 320, mobileHeight: 50 },
    { key: "interstitial_video", pageScope: "Between page transitions", device: "both", width: 640, height: 360, mobileWidth: 320, mobileHeight: 180 },
  ];
  const placementIds: Record<string, string> = {};
  for (const p of placementDefs) {
    const pid = uid();
    placementIds[p.key] = pid;
    await db.insert(schema.adPlacements).values({ id: pid, ...p }).onConflictDoNothing();
  }

  if (!opts.demo) return;

  // ================= DEMO UNIVERSE (demo mode only — never in production) =================
  const mkUser = async (u: {
    slug: string; displayName: string; email: string; bio: string; country: string;
    role?: string; password?: string;
  }) => {
    const id = uid();
    await db.insert(schema.users).values({
      id, email: u.email, passwordHash: hashPassword(u.password ?? "cluster-demo"),
      displayName: u.displayName, slug: u.slug, bio: u.bio, country: u.country,
      role: u.role ?? "user", isVerified: true, primarySignupProvider: "email",
      bannerUrl: BANNER_ART.profileDefault,
    });
    return id;
  };

  const admin = envAdminId ?? await mkUser({
    slug: "mission-control", displayName: "Mission Control", email: "admin@clustergg.com",
    bio: "Cluster platform operations. Keeping the galaxy spinning.", country: "US",
    role: "superadmin", password: "cluster-admin",
  });
  const nova = await mkUser({ slug: "nova", displayName: "Nova", email: "nova@demo.gg", bio: "Chess addict orbiting 2000 elo. Blitz or nothing.", country: "US" });
  const orion = await mkUser({ slug: "orion", displayName: "Orion", email: "orion@demo.gg", bio: "Dota 2 mid player. Immortal dreams, Archon reality.", country: "DE" });
  const vega = await mkUser({ slug: "vega", displayName: "Vega", email: "vega@demo.gg", bio: "Speedrunner. Frames are a social construct.", country: "JP" });
  const lyra = await mkUser({ slug: "lyra", displayName: "Lyra", email: "lyra@demo.gg", bio: "Puzzle rating > blitz rating and I will die on this hill.", country: "FR" });
  const atlas = await mkUser({ slug: "atlas", displayName: "Atlas", email: "atlas@demo.gg", bio: "Roblox dev by day, ranked grinder by night.", country: "BR" });

  const mkAccount = async (userId: string, provider: string, providerAccountId: string, inGameName: string) => {
    const id = uid();
    await db.insert(schema.linkedGameAccounts).values({
      id, userId, provider, providerAccountId, inGameName,
      verified: true, syncStatus: "pending", nextSyncAt: new Date(0),
    });
    return id;
  };

  const novaChess = await mkAccount(nova, "chesscom", "hikaru", "hikaru");
  await mkAccount(nova, "lichess", "penguingim1", "penguingim1");
  const lyraChess = await mkAccount(lyra, "chesscom", "magnuscarlsen", "magnuscarlsen");
  await mkAccount(lyra, "lichess", "drnykterstein", "DrNykterstein");
  const orionDota = await mkAccount(orion, "opendota", "105248644", "Miracle-");
  await mkAccount(orion, "chesscom", "gothamchess", "gothamchess");
  const vegaDota = await mkAccount(vega, "opendota", "86745912", "Arteezy");
  await mkAccount(vega, "speedruncom", "kjp4y75j", "Niftski");
  await mkAccount(atlas, "roblox", "156", "builderman");
  const atlasDota = await mkAccount(atlas, "opendota", "87278757", "Puppey");

  const followPairs: [string, string][] = [
    [nova, lyra], [nova, orion], [lyra, nova], [orion, nova], [orion, vega],
    [vega, orion], [vega, nova], [atlas, nova], [atlas, orion], [lyra, vega],
  ];
  for (const [a, b] of followPairs) {
    await db.insert(schema.follows).values({ followerId: a, followingId: b }).onConflictDoNothing();
  }

  const memberships: [string, string][] = [
    [spaceIds["chess"], nova], [spaceIds["chess"], lyra], [spaceIds["chess"], orion],
    [spaceIds["dota-2"], orion], [spaceIds["dota-2"], vega], [spaceIds["dota-2"], atlas],
    [spaceIds["general-gaming"], nova], [spaceIds["general-gaming"], vega], [spaceIds["general-gaming"], atlas],
    [spaceIds["hardware-setups"], lyra], [spaceIds["lfg-team-finder"], atlas],
  ];
  for (const [spaceId, userId] of memberships) {
    await db.insert(schema.spaceMembers).values({ spaceId, userId }).onConflictDoNothing();
  }

  const mkPost = async (spaceSlug: string, authorId: string, body: string, pinned = false) => {
    const id = uid();
    await db.insert(schema.posts).values({ id, spaceId: spaceIds[spaceSlug], authorId, body, isPinned: pinned });
    return id;
  };
  const p1 = await mkPost("chess", nova, "Just hit a new blitz peak. The trick was giving up bullet entirely — my brain needed the extra 120 seconds. Who else is grinding the blitz ladder this season?", true);
  const p2 = await mkPost("chess", lyra, "Hot take: puzzle rating is the single best predictor of real improvement. 30 minutes of puzzles > 3 hours of blitz tilt.");
  const p3 = await mkPost("dota-2", orion, "Mid diff is real. 60 wins this month and I still can't escape my bracket. Watching Miracle- replays tonight — join the watch party in LFG.");
  const p4 = await mkPost("general-gaming", vega, "New PB attempt stream this weekend. Chasing frame-perfect inputs is 90% suffering, 10% ascension.");
  await mkPost("hardware-setups", lyra, "Finally finished the all-white battlestation. RGB set to nebula purple, obviously. Pics soon.");
  const p6 = await mkPost("dota-2", vega, "Techies should be a bannable offense in ranked. This is not a discussion.");

  const c1 = uid();
  await db.insert(schema.comments).values({ id: c1, postId: p1, authorId: lyra, body: "Respect. Now do the same with rapid and become truly unstoppable." });
  await db.insert(schema.comments).values({ id: uid(), postId: p1, parentCommentId: c1, authorId: nova, body: "Rapid is next season's arc, trust the process." });
  await db.insert(schema.comments).values({ id: uid(), postId: p3, authorId: atlas, body: "Watch party is a great idea — count me in." });
  await db.insert(schema.comments).values({ id: uid(), postId: p6, authorId: orion, body: "Strong agree. Meh from me only because the rant is a classic." });

  const reactions: [string, string, string][] = [
    [p1, lyra, "like"], [p1, orion, "like"], [p1, vega, "like"], [p1, atlas, "like"],
    [p2, nova, "like"], [p2, orion, "meh"], [p3, nova, "like"], [p3, vega, "like"],
    [p4, nova, "like"], [p4, orion, "like"], [p4, lyra, "like"],
    [p6, atlas, "dislike"], [p6, lyra, "meh"],
  ];
  for (const [postId, userId, reactionType] of reactions) {
    await db.insert(schema.postReactions).values({ postId, userId, reactionType }).onConflictDoNothing();
  }

  const conv = uid();
  await db.insert(schema.conversations).values({ id: conv });
  await db.insert(schema.conversationParticipants).values([
    { conversationId: conv, userId: nova },
    { conversationId: conv, userId: orion },
  ]);
  await db.insert(schema.messages).values([
    { id: uid(), conversationId: conv, senderId: orion, body: "Nova — chess challenge just went live in the Chess space. You joining?" },
    { id: uid(), conversationId: conv, senderId: nova, body: "Already in. Bringing my whole blitz arsenal. Prepare to spectate greatness." },
    { id: uid(), conversationId: conv, senderId: orion, body: "Bold words for someone I outrank in Dota. See you on the leaderboard." },
  ]);

  // Challenges: two live, one completed (to showcase trophies on profiles)
  const ch1 = uid();
  await db.insert(schema.challenges).values({
    id: ch1, spaceId: spaceIds["chess"], game: "Chess", provider: "chesscom",
    title: "Blitz Supernova — Weekly Wins Race",
    description: "Most chess wins gained this week takes the crown. Points update automatically from the Chess.com API as you play — no submissions needed.",
    format: "top3", cadence: "weekly",
    rules: { conditions: [] },
    pointsEngine: { wins: 10, games: 1 },
    startAt: new Date(Date.now() - 2 * 86400000),
    endAt: new Date(Date.now() + 5 * 86400000),
    status: "active",
    heroType: "image", coverUrl: BANNER_ART.arena, trophyId: trophyIds[0],
    prizeDescription: "Champion's Nebula Cup + featured profile on the landing page",
    createdBy: admin,
  });
  const ch2 = uid();
  await db.insert(schema.challenges).values({
    id: ch2, spaceId: spaceIds["dota-2"], game: "Dota 2", provider: "opendota",
    title: "Ancient Ascension — Dota Win Sprint",
    description: "Every Dota 2 win counts 25 points while the window is open. Data pulled live from OpenDota.",
    format: "top1", cadence: "weekly",
    rules: { conditions: [] },
    pointsEngine: { wins: 25 },
    startAt: new Date(Date.now() - 86400000),
    endAt: new Date(Date.now() + 6 * 86400000),
    status: "active",
    heroType: "image", coverUrl: BANNER_ART.games, trophyId: trophyIds[3],
    prizeDescription: "Supernova Crystal + bragging rights of cosmic proportion",
    createdBy: admin,
  });
  const ch3 = uid();
  await db.insert(schema.challenges).values({
    id: ch3, spaceId: spaceIds["chess"], game: "Chess", provider: "chesscom",
    title: "Puzzle Storm — Season Opener",
    description: "The inaugural Cluster puzzle sprint. Completed last week — champions crowned.",
    format: "top3", cadence: "weekly",
    rules: { conditions: [] },
    pointsEngine: { games: 2 },
    startAt: new Date(Date.now() - 14 * 86400000),
    endAt: new Date(Date.now() - 7 * 86400000),
    status: "completed",
    heroType: "image", coverUrl: BANNER_ART.arena, trophyId: trophyIds[0],
    prizeDescription: "Champion's Nebula Cup",
    createdBy: admin,
  });

  const joinChallenge = async (challengeId: string, userId: string, linkedAccountId: string, points: number, placement?: number) => {
    await db.insert(schema.challengeParticipants).values({
      id: uid(), challengeId, userId, linkedAccountId,
      baseline: {}, currentPoints: points, finalPlacement: placement ?? null,
      status: placement ? "completed" : "active",
    });
  };
  await joinChallenge(ch1, nova, novaChess, 120);
  await joinChallenge(ch1, lyra, lyraChess, 90);
  await joinChallenge(ch2, orion, orionDota, 150);
  await joinChallenge(ch2, vega, vegaDota, 75);
  await joinChallenge(ch2, atlas, atlasDota, 50);
  await joinChallenge(ch3, lyra, lyraChess, 310, 1);
  await joinChallenge(ch3, nova, novaChess, 280, 2);

  const grant = async (userId: string, code: string) => {
    await db.insert(schema.userBadges).values({ id: uid(), userId, badgeId: badgeIds[code] }).onConflictDoNothing();
  };
  await grant(nova, "star_forged"); await grant(nova, "verified_knight"); await grant(nova, "grandmaster_cluster"); await grant(nova, "challenge_top3");
  await grant(lyra, "star_forged"); await grant(lyra, "verified_knight"); await grant(lyra, "challenge_top1");
  await grant(orion, "star_forged"); await grant(orion, "constellation"); await grant(orion, "challenge_top3");
  await grant(vega, "star_forged"); await grant(vega, "challenge_top3");
  await grant(atlas, "star_forged");

  // Demo partners for the "Trusted by" slider
  const partnerDefs = [
    ["NebulaTech", "#7c3aed", "#0e7490"], ["AstroFuel", "#9d174d", "#7c2d12"],
    ["VoidWear", "#1e3a8a", "#0e7490"], ["Photon Peripherals", "#065f46", "#0e7490"],
    ["StarForge Studios", "#7c2d12", "#7c3aed"],
  ] as const;
  for (let i = 0; i < partnerDefs.length; i++) {
    const [name, from, to] = partnerDefs[i];
    await db.insert(schema.partners).values({
      id: uid(), name, sortOrder: i,
      logoUrl: svgAd(240, 80, from, to, name, ""),
    });
  }

  // Demo brands / campaigns / creatives
  const brand1 = uid(), brand2 = uid();
  await db.insert(schema.brands).values([
    { id: brand1, name: "NebulaTech", industry: "hardware", contactEmail: "ads@nebulatech.example", status: "active" },
    { id: brand2, name: "AstroFuel", industry: "f&b", contactEmail: "brand@astrofuel.example", status: "active" },
  ]);
  const camp1 = uid(), camp2 = uid();
  await db.insert(schema.adCampaigns).values([
    { id: camp1, brandId: brand1, name: "NebulaTech GPU Launch", startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 30 * 86400000), budget: 5000, targetDevice: "both", status: "active" },
    { id: camp2, brandId: brand2, name: "AstroFuel Zero Sugar", startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 30 * 86400000), budget: 3000, targetDevice: "both", status: "active" },
  ]);
  const mkCreative = async (brandId: string, name: string, w: number, h: number, from: string, to: string, brandLabel: string, tagline: string) => {
    const id = uid();
    await db.insert(schema.adCreatives).values({
      id, brandId, name, type: "image", fileUrl: svgAd(w, h, from, to, brandLabel, tagline),
      clickUrl: "https://example.com", width: w, height: h, status: "approved",
    });
    return id;
  };
  const cr1 = await mkCreative(brand1, "GPU hero 970x250", 970, 250, "#4c1d95", "#0e7490", "NebulaTech", "Render the universe. RTX-class GPUs for creators.");
  const cr2 = await mkCreative(brand1, "GPU banner 728x90", 728, 90, "#4c1d95", "#0e7490", "NebulaTech", "Frames win games.");
  const cr3 = await mkCreative(brand2, "AstroFuel rail 300x250", 300, 250, "#9d174d", "#7c2d12", "AstroFuel", "Zero sugar. Full thrust.");
  const cr4 = await mkCreative(brand2, "AstroFuel banner 728x90", 728, 90, "#9d174d", "#7c2d12", "AstroFuel", "Fuel your ranked climb.");
  const cr5 = await mkCreative(brand2, "AstroFuel tower 300x600", 300, 600, "#9d174d", "#4c1d95", "AstroFuel", "Climb higher.");
  const ccRows = [
    { campaignId: camp1, creativeId: cr1, placementId: placementIds["landing_hero_banner"], weight: 2, priority: 1 },
    { campaignId: camp1, creativeId: cr2, placementId: placementIds["leaderboard_top_banner"], weight: 1, priority: 1 },
    { campaignId: camp1, creativeId: cr2, placementId: placementIds["leaderboard_inline"], weight: 1, priority: 0 },
    { campaignId: camp1, creativeId: cr2, placementId: placementIds["games_top_banner"], weight: 1, priority: 0 },
    { campaignId: camp1, creativeId: cr2, placementId: placementIds["profile_footer_banner"], weight: 1, priority: 0 },
    { campaignId: camp2, creativeId: cr3, placementId: placementIds["profile_sidebar"], weight: 1, priority: 1 },
    { campaignId: camp2, creativeId: cr4, placementId: placementIds["feed_inline"], weight: 1, priority: 0 },
    { campaignId: camp2, creativeId: cr4, placementId: placementIds["feed_top_banner"], weight: 1, priority: 0 },
    { campaignId: camp2, creativeId: cr5, placementId: placementIds["leaderboard_sidebar"], weight: 1, priority: 1 },
    { campaignId: camp2, creativeId: cr5, placementId: placementIds["challenge_sidebar"], weight: 1, priority: 1 },
  ];
  for (const cc of ccRows) {
    await db.insert(schema.adCampaignCreatives).values({ id: uid(), ...cc });
  }

  await db.insert(schema.spaceRequests).values({
    id: uid(), requestedBy: atlas, proposedName: "Rocket League",
    reason: "Big RL community with real rank APIs available via TRN — perfect fit for challenges.",
  });
  await db.insert(schema.notifications).values([
    { id: uid(), userId: nova, type: "challenge", title: "Blitz Supernova is live!", body: "The weekly wins race has begun. Points sync automatically.", href: "/planets/chess" },
    { id: uid(), userId: nova, type: "follow", title: "Orion started following you", href: "/u/orion" },
  ]);
}

// ================= HOUSE ADS (production + demo) =================
// Runs on every boot (idempotent — gated on the house brand existing). Fills
// EVERY ad placement with our own Cluster creatives so no slot is ever empty,
// for guests and signed-in gamers alike. Admin-sold campaigns outrank these
// (house ads are priority 0) so real inventory always wins; house ads backfill.
const HOUSE_BRAND_ID = "house-cluster-brand";
const HOUSE_TAGLINES: { title: string; from: string; to: string; click: string }[] = [
  { title: "Every game. One identity.", from: "#4c1d95", to: "#0e7490", click: "/signup" },
  { title: "Compete. Climb. Conquer.", from: "#7c2d12", to: "#4c1d95", click: "/planets" },
  { title: "Build your gamer profile.", from: "#0e7490", to: "#7c3aed", click: "/signup" },
  { title: "Join a planet. Find your crew.", from: "#9d174d", to: "#4c1d95", click: "/planets" },
  { title: "Your stats. Everywhere.", from: "#4338ca", to: "#0891b2", click: "/signup" },
];

// ================= PLANET SKINS =================
// Higgsfield-generated per-game planet heroes. Sets each game's planetImageUrl
// once (idempotent — only fills when null, so admin edits are never clobbered).
const HF_CDN = "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082";
// Superseded renders → migrate any DB row still pointing at them to the current skin.
const SUPERSEDED_SKINS: Record<string, string> = {
  // First LOL planet used the in-game Runeterra map; replaced with a real-world map.
  [`${HF_CDN}/hf_20260713_214125_1f7f8ec6-ee58-4c5c-9c9b-3201f6bf47c6.png`]: "League of Legends",
};
// PUBG + Fortnite use background-REMOVED floating globes (transparent) so they
// match the framed look of the LoL/VALORANT planets over the page background.
const PUBG_GLOBE = `${HF_CDN}/hf_20260718_155141_0b30c787-62a6-49a3-8313-81c92464e0a3.png`;
const FORTNITE_GLOBE = `${HF_CDN}/hf_20260718_155155_75051287-899b-4c82-ae31-0603744b5efd.png`;
// Apex Legends: background-removed floating globe (transparent) — same framed
// look + size as the LoL / VALORANT planets — over its own space background.
const APEX_GLOBE = `${HF_CDN}/hf_20260720_030624_a1f6d900-3452-4987-b428-ffd6954c59c5.png`;
const PLANET_SKINS: Record<string, string> = {
  "League of Legends": `${HF_CDN}/hf_20260714_114614_b3a4ad5b-e49a-4fab-99fb-056fd13ab71f.png`,
  "VALORANT": `${HF_CDN}/hf_20260713_214139_cba722cd-6ede-4996-b8a7-ae0315304705.png`,
  "PUBG": PUBG_GLOBE,
  "Dota 2": `${HF_CDN}/hf_20260717_223926_6bf3756b-3ee1-4629-98ae-e458dcddd180.png`,
  "Fortnite": FORTNITE_GLOBE,
  "Counter-Strike 2": `${HF_CDN}/hf_20260717_223931_14be7cf0-ff69-41dc-87f9-77d113662a37.png`,
  "Chess": `${HF_CDN}/hf_20260718_020410_c77327de-7a2e-4354-b26a-98aa0bb4aeb0.png`,
  "Apex Legends": APEX_GLOBE,
};
// Force PUBG + Fortnite onto the background-free globes on existing DBs (the user
// asked for both specifically), replacing whatever skin they currently hold.
const FORCE_GLOBES: Record<string, string> = {
  "PUBG": PUBG_GLOBE, "Fortnite": FORTNITE_GLOBE,
};
// Superseded chess globe (first, static render) — replaced by the animated one.
const SUPERSEDED_CHESS = `${HF_CDN}/hf_20260718_004005_7cbd4afc-202f-4acb-b558-519546ffd94c.png`;
const PLANET_BGS: Record<string, string> = {
  "League of Legends": `${HF_CDN}/hf_20260714_120620_3c2d92d2-00a7-4f38-ba68-7712e85b962d.png`,
  "VALORANT": `${HF_CDN}/hf_20260714_120636_4b63d00d-68e5-4379-b419-a0bc8b423124.png`,
  "PUBG": `${HF_CDN}/hf_20260717_224254_9bf2847f-9b30-40e6-89b1-7c0816a28962.png`,
  "Dota 2": `${HF_CDN}/hf_20260717_224257_d5b1ca32-3a9c-4434-a7e8-8aa256473b7a.png`,
  "Fortnite": `${HF_CDN}/hf_20260717_224259_eef07acf-cc6f-44ed-b0f0-715f2c6eb1d3.png`,
  "Counter-Strike 2": `${HF_CDN}/hf_20260717_224301_435984a4-647b-4da2-bdaa-906bae240009.png`,
  "Chess": `${HF_CDN}/hf_20260718_004014_550032cb-9efb-4a43-8ae8-a1ea21a123b4.png`,
  "Apex Legends": `${HF_CDN}/hf_20260720_030417_c62e0e73-7c73-4e30-91b9-da355b1b87fa.png`,
};
// Connect-picker / onboarding logo + cover for the newly-added games (Apex,
// PUBG). Only fills where null, so admin uploads are never clobbered. Reuses the
// planet globe as the game icon and generated game art as the cover.
const APEX_COVER = `${HF_CDN}/hf_20260720_030417_c62e0e73-7c73-4e30-91b9-da355b1b87fa.png`;
const PUBG_COVER = `${HF_CDN}/hf_20260720_030759_1a51629d-2149-4075-bba6-7079e5267163.png`;
const GAME_LOGOS: Record<string, string> = {
  "Apex Legends": APEX_GLOBE,
  "PUBG": PUBG_GLOBE,
};
const GAME_COVERS: Record<string, string> = {
  "Apex Legends": APEX_COVER,
  "PUBG": PUBG_COVER,
};
// ===== Image re-hosting: move inline base64 + external CDN art into our Blob =====
// The real Neon data-transfer fix: any base64 `data:image` stored INSIDE a row
// (notably the profile-builder `theme` JSONB, which can be megabytes) is
// re-transferred from Neon on every read. Re-host those to Blob. We also move
// Higgsfield/cloudfront links to our Blob so we serve art from our own storage.
// Idempotent + cheap once done (the LIKE filters return 0 rows). Non-fatal.
export async function rehostImagesToBlob(db: DB) {
  const { uploadUrlToBlob, rehostDataUrlsInObject, blobConfigured } = await import("@/lib/blob");
  if (!blobConfigured()) return; // nothing to do without Blob (never inline-store instead)
  const isExternal = (u: string | null | undefined) => !!u && /^https:\/\//i.test(u) && !/\.public\.blob\.vercel-storage\.com/i.test(u) && /cloudfront\.net|higgsfield/i.test(u);

  // 1) Users: inline data:image values inside theme (the 2MB culprit) + avatar/banner
  //    (both inline data: URLs AND external cloudfront/higgsfield links). Discord
  //    avatars (cdn.discordapp.com) are left alone — tiny + hosted elsewhere.
  const heavyUsers = await db.select({ id: schema.users.id, theme: schema.users.theme, avatarUrl: schema.users.avatarUrl, bannerUrl: schema.users.bannerUrl })
    .from(schema.users).where(dsql`theme::text LIKE '%data:image%' OR theme::text ILIKE '%cloudfront.net%' OR theme::text ILIKE '%higgsfield%' OR avatar_url LIKE 'data:image%' OR banner_url LIKE 'data:image%' OR avatar_url ~* 'cloudfront\\.net|higgsfield' OR banner_url ~* 'cloudfront\\.net|higgsfield'`);
  const { uploadDataUrlToBlob } = await import("@/lib/blob");
  for (const u of heavyUsers) {
    const patch: Record<string, unknown> = {};
    const theme = (u.theme ?? {}) as Record<string, unknown>;
    if (await rehostDataUrlsInObject(theme, "theme")) patch.theme = theme;
    if (u.avatarUrl?.startsWith("data:image")) { const h = await uploadDataUrlToBlob(u.avatarUrl, "avatar"); if (h) patch.avatarUrl = h; }
    else if (isExternal(u.avatarUrl)) { const h = await uploadUrlToBlob(u.avatarUrl!, "avatar"); if (h) patch.avatarUrl = h; }
    if (u.bannerUrl?.startsWith("data:image")) { const h = await uploadDataUrlToBlob(u.bannerUrl, "banner"); if (h) patch.bannerUrl = h; }
    else if (isExternal(u.bannerUrl)) { const h = await uploadUrlToBlob(u.bannerUrl!, "banner"); if (h) patch.bannerUrl = h; }
    if (Object.keys(patch).length) await db.update(schema.users).set(patch).where(eq(schema.users.id, u.id));
  }

  // 2) Games: external CDN art → our Blob.
  const games = await db.select().from(schema.games);
  for (const g of games) {
    const patch: Record<string, unknown> = {};
    if (isExternal(g.logoUrl)) patch.logoUrl = await uploadUrlToBlob(g.logoUrl!, "game");
    if (isExternal(g.coverUrl)) patch.coverUrl = await uploadUrlToBlob(g.coverUrl!, "game");
    if (isExternal(g.planetImageUrl)) patch.planetImageUrl = await uploadUrlToBlob(g.planetImageUrl!, "game");
    if (isExternal(g.planetBgUrl)) patch.planetBgUrl = await uploadUrlToBlob(g.planetBgUrl!, "game");
    if (Object.keys(patch).length) await db.update(schema.games).set(patch).where(eq(schema.games.id, g.id));
  }

  // 3) Quests + tiers.
  const quests = await db.select().from(schema.quests);
  for (const q of quests) {
    const patch: Record<string, unknown> = {};
    if (isExternal(q.logoUrl)) patch.logoUrl = await uploadUrlToBlob(q.logoUrl!, "quest");
    if (isExternal(q.cardBgUrl)) patch.cardBgUrl = await uploadUrlToBlob(q.cardBgUrl!, "quest");
    if (isExternal(q.mapArtUrl)) patch.mapArtUrl = await uploadUrlToBlob(q.mapArtUrl!, "quest");
    if (isExternal(q.coverUrl)) patch.coverUrl = await uploadUrlToBlob(q.coverUrl!, "quest");
    if (Object.keys(patch).length) await db.update(schema.quests).set(patch).where(eq(schema.quests.id, q.id));
  }
  const tiers = await db.select({ id: schema.questTiers.id, iconUrl: schema.questTiers.iconUrl }).from(schema.questTiers);
  for (const t of tiers) if (isExternal(t.iconUrl)) await db.update(schema.questTiers).set({ iconUrl: await uploadUrlToBlob(t.iconUrl!, "quest") }).where(eq(schema.questTiers.id, t.id));

  // 4) CMS content values (brand.cpIcon, brand.orb.icon, planet/quest defaults…).
  const contentRows = await db.select().from(schema.platformSettings).where(dsql`value::text LIKE '%cloudfront.net%' OR value::text LIKE '%higgsfield%'`);
  for (const row of contentRows) {
    const v = typeof row.value === "string" ? row.value : null;
    if (v && isExternal(v)) await db.update(schema.platformSettings).set({ value: await uploadUrlToBlob(v, "content") }).where(eq(schema.platformSettings.key, row.key));
  }

  // 5) Ad creatives.
  const creatives = await db.select({ id: schema.adCreatives.id, fileUrl: schema.adCreatives.fileUrl }).from(schema.adCreatives).where(dsql`file_url LIKE '%cloudfront.net%' OR file_url LIKE 'data:image%'`);
  for (const cr of creatives) {
    if (cr.fileUrl.startsWith("data:image")) { const h = await uploadDataUrlToBlob(cr.fileUrl, "creative"); if (h) await db.update(schema.adCreatives).set({ fileUrl: h }).where(eq(schema.adCreatives.id, cr.id)); }
    else if (isExternal(cr.fileUrl)) await db.update(schema.adCreatives).set({ fileUrl: await uploadUrlToBlob(cr.fileUrl, "creative") }).where(eq(schema.adCreatives.id, cr.id));
  }

  // 6) Trophies (badge art rendered on Higgsfield).
  const trophies = await db.select({ id: schema.trophies.id, imageUrl: schema.trophies.imageUrl }).from(schema.trophies);
  for (const t of trophies) if (isExternal(t.imageUrl)) await db.update(schema.trophies).set({ imageUrl: await uploadUrlToBlob(t.imageUrl!, "trophy") }).where(eq(schema.trophies.id, t.id));

  // 7) Challenges: cover + hero banners.
  const challenges = await db.select({ id: schema.challenges.id, coverUrl: schema.challenges.coverUrl, heroUrl: schema.challenges.heroUrl }).from(schema.challenges);
  for (const c of challenges) {
    const patch: Record<string, unknown> = {};
    if (isExternal(c.coverUrl)) patch.coverUrl = await uploadUrlToBlob(c.coverUrl!, "challenge");
    if (isExternal(c.heroUrl)) patch.heroUrl = await uploadUrlToBlob(c.heroUrl!, "challenge");
    if (Object.keys(patch).length) await db.update(schema.challenges).set(patch).where(eq(schema.challenges.id, c.id));
  }

  // 8) Brands: portal logo + cover.
  const brands = await db.select({ id: schema.brands.id, logoUrl: schema.brands.logoUrl, coverUrl: schema.brands.coverUrl }).from(schema.brands);
  for (const b of brands) {
    const patch: Record<string, unknown> = {};
    if (isExternal(b.logoUrl)) patch.logoUrl = await uploadUrlToBlob(b.logoUrl!, "brand");
    if (isExternal(b.coverUrl)) patch.coverUrl = await uploadUrlToBlob(b.coverUrl!, "brand");
    if (Object.keys(patch).length) await db.update(schema.brands).set(patch).where(eq(schema.brands.id, b.id));
  }

  // 9) Partners ("Trusted by" logos).
  const partners = await db.select({ id: schema.partners.id, logoUrl: schema.partners.logoUrl }).from(schema.partners);
  for (const p of partners) if (isExternal(p.logoUrl)) await db.update(schema.partners).set({ logoUrl: await uploadUrlToBlob(p.logoUrl!, "partner") }).where(eq(schema.partners.id, p.id));
}

// Backfill portal slug + access key for any brand created before those columns
// existed, so every brand has a shareable /brands/<slug> portal. Idempotent.
export async function ensureBrandKeys(db: DB) {
  const rows = await db.select({ id: schema.brands.id, name: schema.brands.name, slug: schema.brands.slug, accessKey: schema.brands.accessKey }).from(schema.brands);
  const { newAccessKey } = await import("@/lib/brands");
  const { slugify } = await import("@/lib/utils");
  const taken = new Set(rows.map((r) => r.slug).filter(Boolean) as string[]);
  for (const b of rows) {
    if (b.slug && b.accessKey) continue;
    let slug = b.slug ?? "";
    if (!slug) {
      const base = slugify(b.name) || "brand";
      slug = base; let n = 2;
      while (taken.has(slug)) slug = `${base}-${n++}`;
      taken.add(slug);
    }
    await db.update(schema.brands).set({ slug, accessKey: b.accessKey ?? newAccessKey() }).where(eq(schema.brands.id, b.id));
  }
}

// One-time rename: the game formerly seeded as "PUBG: Battlegrounds" is now just
// "PUBG" everywhere (provider registry, art maps, entity catalog). Older DBs
// still hold the long name on the games/spaces rows and every table that stores
// a game name, which broke art lookups (planet globe, connect logo/cover) that
// key off the canonical name. Rename them all in place. Idempotent — the WHERE
// clause matches nothing once done.
export async function renameLegacyGameNames(db: DB) {
  const renames: { table: string; col: string }[] = [
    { table: "games", col: "name" },
    { table: "spaces", col: "name" },
    { table: "spaces", col: "game" },
    { table: "challenges", col: "game" },
    { table: "leaderboards", col: "game" },
    { table: "stat_current", col: "game" },
    { table: "stat_snapshots", col: "game" },
    { table: "game_entity_overrides", col: "game" },
    { table: "trophies", col: "game" },
  ];
  for (const r of renames) {
    try {
      await db.execute(dsql`UPDATE ${dsql.identifier(r.table)} SET ${dsql.identifier(r.col)} = 'PUBG' WHERE ${dsql.identifier(r.col)} = 'PUBG: Battlegrounds'`);
    } catch { /* table/col may not exist on older schemas — non-fatal */ }
  }
}

export async function ensurePlanetSkins(db: DB) {
  // Replace superseded renders in place.
  for (const [oldUrl, name] of Object.entries(SUPERSEDED_SKINS)) {
    await db.update(schema.games).set({ planetImageUrl: PLANET_SKINS[name] })
      .where(eq(schema.games.planetImageUrl, oldUrl));
  }
  // Upgrade the first (static) chess globe to the animated render.
  await db.update(schema.games).set({ planetImageUrl: PLANET_SKINS["Chess"] })
    .where(eq(schema.games.planetImageUrl, SUPERSEDED_CHESS));
  // Force PUBG + Fortnite onto the background-free floating globes (by name).
  for (const [name, url] of Object.entries(FORCE_GLOBES)) {
    await db.update(schema.games).set({ planetImageUrl: url }).where(eq(schema.games.name, name));
  }
  // Set skins for games that don't have one yet (never clobbers admin uploads).
  for (const [name, url] of Object.entries(PLANET_SKINS)) {
    await db.update(schema.games).set({ planetImageUrl: url })
      .where(and(eq(schema.games.name, name), isNull(schema.games.planetImageUrl)));
  }
  for (const [name, url] of Object.entries(PLANET_BGS)) {
    await db.update(schema.games).set({ planetBgUrl: url })
      .where(and(eq(schema.games.name, name), isNull(schema.games.planetBgUrl)));
  }
  // Connect-picker / onboarding logo + cover for games that have none yet.
  for (const [name, url] of Object.entries(GAME_LOGOS)) {
    await db.update(schema.games).set({ logoUrl: url })
      .where(and(eq(schema.games.name, name), isNull(schema.games.logoUrl)));
  }
  for (const [name, url] of Object.entries(GAME_COVERS)) {
    await db.update(schema.games).set({ coverUrl: url })
      .where(and(eq(schema.games.name, name), isNull(schema.games.coverUrl)));
  }
}

// One-time cleanup: any game image still stored as a big inline data URL (from
// before Blob was configured) is re-hosted to Blob and replaced with a short
// URL — so logos show in the nav (the slim-image guard hid oversized inline
// data URLs) and list pages stay light. Idempotent: once converted they're
// plain URLs and skipped. No-op when Blob isn't configured.
// Every table/column that can hold an uploaded image. Anything stored as an
// inline data: URL here gets re-hosted to Blob and replaced with a short URL.
const IMAGE_COLUMNS: { table: string; col: string; scope: string }[] = [
  { table: "games", col: "logo_url", scope: "game" },
  { table: "games", col: "cover_url", scope: "game" },
  { table: "games", col: "planet_image_url", scope: "game" },
  { table: "games", col: "planet_bg_url", scope: "game" },
  { table: "challenges", col: "cover_url", scope: "challenge" },
  { table: "challenges", col: "hero_url", scope: "challenge" },
  { table: "users", col: "avatar_url", scope: "profile" },
  { table: "users", col: "banner_url", scope: "profile" },
  { table: "quests", col: "logo_url", scope: "quest" },
  { table: "quests", col: "card_bg_url", scope: "quest" },
  { table: "quests", col: "cover_url", scope: "quest" },
  { table: "quest_tiers", col: "icon_url", scope: "quest" },
  { table: "badges", col: "icon", scope: "badge" },
  { table: "trophies", col: "image_url", scope: "trophy" },
  { table: "partners", col: "logo_url", scope: "partner" },
  { table: "brands", col: "logo_url", scope: "brand" },
  { table: "ad_creatives", col: "file_url", scope: "creative" },
];

function rows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  return (result as { rows?: Record<string, unknown>[] })?.rows ?? [];
}

// Sweep EVERY image column across the whole DB: any base64/SVG data: URL is
// re-hosted to Blob and replaced with a short URL. Runs every boot; the SQL
// filter (LIKE 'data:image/%') means it returns zero rows and transfers ~nothing
// once the DB is clean, so it's safe to run continuously and self-heals.
export async function migrateGameImagesToBlob(db: DB) {
  const { uploadDataUrlToBlob, blobConfigured } = await import("@/lib/blob");
  if (!blobConfigured()) return;

  for (const t of IMAGE_COLUMNS) {
    try {
      const tbl = dsql.identifier(t.table);
      const col = dsql.identifier(t.col);
      const found = rows(await db.execute(
        dsql`SELECT id, ${col} AS v FROM ${tbl} WHERE ${col} LIKE 'data:image/%' LIMIT 200`,
      ));
      for (const r of found) {
        const hosted = await uploadDataUrlToBlob(String(r.v ?? ""), t.scope);
        if (hosted) {
          await db.execute(dsql`UPDATE ${tbl} SET ${col} = ${hosted} WHERE id = ${String(r.id)}`);
        }
      }
    } catch { /* one table failing must not block the others */ }
  }
}

// Runs the idempotent maintenance steps (house ads, planet skins, image→Blob
// migration) AT MOST ONCE per database per maintenance version — gated by a
// single tiny platform_settings read. This keeps steady-state cold boots from
// re-scanning tables (the original cause of the Neon data-transfer blowout).
// Bump MAINT_VERSION whenever the seeded ads/skins change so it re-runs once.
const MAINT_VERSION = "2026-07-22.2-ascension-3d";

// Looping animated quest maps (Higgsfield kling image→video from the original
// map art). Applied once per quest when no video is set; admins can replace or
// clear them in Admin → Quests.
const QUEST_MAP_VIDEOS: Record<string, string> = {
  conquest: "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260722_015922_4aea0000-d74e-4fb6-bae9-e456aa097c7f.mp4",
  orbit: "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260722_015928_fb0e499a-7988-4ac6-9a31-d1581010ea2c.mp4",
  // Regenerated with clearly-visible motion (the first pass barely moved).
  ascension: "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260722_021830_b29a5e1b-a43f-40cc-86e7-c6411310fd99.mp4",
  signal: "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260722_015940_f5a41d5c-72d3-4d5c-8707-bb6fd55a94b8.mp4",
};
// Superseded generated loops — auto-replaced by the new version above (admin
// uploads that aren't in this list are never touched).
const OLD_MAP_VIDEOS: string[] = [
  "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260722_015935_37dfb652-b7a4-4787-89b6-7c7f907fe1d9.mp4",
];

// 3D terrain meshes (Higgsfield image→3D GLB from the transparent map art) —
// power the in-game "3D" view. Filled once when unset; admin-replaceable.
const QUEST_MAP_GLBS: Record<string, string> = {
  conquest: "https://d3u0tzju9qaucj.cloudfront.net/7d051b5a-7bfe-49fe-a484-24e7b3a9458a/511ad436-7663-4201-b0ee-1e2bac4d1b8d.glb",
  orbit: "https://d3u0tzju9qaucj.cloudfront.net/7d051b5a-7bfe-49fe-a484-24e7b3a9458a/c08d5f64-e419-4176-8cb6-4a371ec1de9b.glb",
  ascension: "https://d3u0tzju9qaucj.cloudfront.net/7d051b5a-7bfe-49fe-a484-24e7b3a9458a/45afea60-f6c1-408b-a745-263705de23a2.glb",
  signal: "https://d3u0tzju9qaucj.cloudfront.net/7d051b5a-7bfe-49fe-a484-24e7b3a9458a/dfb92d96-cd1a-4650-b1c4-a9733abec294.glb",
};

// Extra Higgsfield trophies (style-matched to the original set).
const EXTRA_TROPHIES: { name: string; imageUrl: string; tier: string }[] = [
  { name: "Platinum Galaxy Ring Cup", imageUrl: "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260722_020023_311be94b-577b-4962-89f9-97c6ec3e53b8.png", tier: "legendary" },
  { name: "Emerald Comet Chalice", imageUrl: "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260722_020028_73daef83-147f-4088-a80f-be54819cd112.png", tier: "gold" },
  { name: "Violet Nebula Crown", imageUrl: "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260722_021802_1e8bd62d-f012-40a7-bc89-1a4803bab376.png", tier: "legendary" },
  { name: "Crimson Star Shard Obelisk", imageUrl: "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260722_021817_c5fc1387-5a85-44c5-8dc3-a3b93bf550b2.png", tier: "silver" },
];

export async function runBootMaintenance(db: DB) {
  try {
    const [row] = await db.select({ value: schema.platformSettings.value })
      .from(schema.platformSettings).where(eq(schema.platformSettings.key, "boot_maintenance")).limit(1);
    const done = (row?.value as { version?: string } | null)?.version;
    if (done === MAINT_VERSION) return; // already applied on this DB — do nothing
  } catch { /* settings table missing on a brand-new DB — fall through and run */ }

  await seedHouseAds(db);
  // Ensure the Apex Legends + PUBG planets exist (game row + community space) on
  // DBs seeded before they were added, so their skinned globes + game worlds
  // show up. Idempotent: onConflictDoNothing keyed on the unique slug.
  const ensurePlanets = [
    { slug: "apex-legends", name: "Apex Legends", game: "Apex Legends", description: "Ranked RP and lifetime kills from the Outlands." },
    { slug: "pubg", name: "PUBG", game: "PUBG", description: "Chicken dinners, survival stats and the Outlands of Erangel." },
  ];
  for (const p of ensurePlanets) {
    try {
      const [g] = await db.select({ id: schema.games.id }).from(schema.games).where(eq(schema.games.slug, p.slug)).limit(1);
      if (!g) {
        const [{ n } = { n: 0 }] = await db.select({ n: dsql<number>`coalesce(max(${schema.games.sortOrder}), 0) + 1` }).from(schema.games);
        await db.insert(schema.games).values({ id: uid(), slug: p.slug, name: p.name, description: p.description, sortOrder: Number(n) || 50 }).onConflictDoNothing();
      }
      const [s] = await db.select({ id: schema.spaces.id }).from(schema.spaces).where(eq(schema.spaces.slug, p.slug)).limit(1);
      if (!s) {
        await db.insert(schema.spaces).values({ id: uid(), slug: p.slug, name: p.name, game: p.game, description: p.description, isDefault: true, coverEmoji: "" }).onConflictDoNothing();
      }
    } catch { /* non-fatal */ }
  }
  // Canonicalize the PUBG game name on older DBs BEFORE skinning, so the art maps
  // (keyed on "PUBG") match the rows.
  await renameLegacyGameNames(db);
  await ensurePlanetSkins(db);
  // Ad inventory slots that pages reference (idempotent — insert if missing).
  const extraPlacements = [
    { key: "loading_screen", pageScope: "Loading screen (between pages)", width: 728, height: 90 },
    { key: "quests_footer", pageScope: "Bottom of the quests page", width: 728, height: 90 },
    { key: "messages_footer", pageScope: "Bottom of a conversation", width: 728, height: 90 },
  ];
  for (const p of extraPlacements) {
    const [ex] = await db.select({ id: schema.adPlacements.id }).from(schema.adPlacements)
      .where(eq(schema.adPlacements.key, p.key)).limit(1);
    if (!ex) {
      await db.insert(schema.adPlacements).values({
        id: uid(), key: p.key, pageScope: p.pageScope, device: "both",
        width: p.width, height: p.height, mobileWidth: 320, mobileHeight: 100,
      });
    }
  }
  // (migrateGameImagesToBlob is run unconditionally every boot from
  // ensureProvisioned — not gated here — so it self-heals if Blob became
  // available after this version flag was already set.)
  try { const { seedQuests, ensureQuestArt } = await import("@/lib/quests"); await seedQuests(db); await ensureQuestArt(db); } catch { /* non-fatal */ }

  // Animated quest maps: fill in the generated loop for quests that have none
  // (or still carry a superseded generated loop). 3D terrain meshes likewise.
  for (const [key, url] of Object.entries(QUEST_MAP_VIDEOS)) {
    try {
      const [q] = await db.select({ id: schema.quests.id, v: schema.quests.mapVideoUrl, g: schema.quests.mapGlbUrl }).from(schema.quests).where(eq(schema.quests.key, key)).limit(1);
      if (!q) continue;
      if (!q.v || OLD_MAP_VIDEOS.includes(q.v)) await db.update(schema.quests).set({ mapVideoUrl: url }).where(eq(schema.quests.id, q.id));
      if (!q.g && QUEST_MAP_GLBS[key]) await db.update(schema.quests).set({ mapGlbUrl: QUEST_MAP_GLBS[key] }).where(eq(schema.quests.id, q.id));
    } catch { /* non-fatal */ }
  }
  // New trophies (insert-if-missing by name; admin can edit/delete them after).
  for (const t of EXTRA_TROPHIES) {
    try {
      const [ex] = await db.select({ id: schema.trophies.id }).from(schema.trophies).where(eq(schema.trophies.name, t.name)).limit(1);
      if (!ex) await db.insert(schema.trophies).values({ id: uid(), ...t });
    } catch { /* non-fatal */ }
  }

  await db.insert(schema.platformSettings)
    .values({ key: "boot_maintenance", value: { version: MAINT_VERSION } })
    .onConflictDoUpdate({ target: schema.platformSettings.key, set: { value: { version: MAINT_VERSION }, updatedAt: new Date() } });
}

export async function seedHouseAds(db: DB) {
  const [exists] = await db.select({ id: schema.brands.id }).from(schema.brands)
    .where(eq(schema.brands.id, HOUSE_BRAND_ID)).limit(1);
  if (exists) return;

  // Ensure the feed rail placement exists (added with the feed redesign).
  await db.insert(schema.adPlacements).values({
    id: uid(), key: "feed_sidebar", pageScope: "Feed right rail", device: "desktop",
    width: 300, height: 250, mobileWidth: null, mobileHeight: null,
  }).onConflictDoNothing();

  await db.insert(schema.brands).values({
    id: HOUSE_BRAND_ID, name: "Cluster", industry: "gaming", status: "active", logoUrl: BANNER_ART.logo,
  }).onConflictDoNothing();

  const campId = uid();
  await db.insert(schema.adCampaigns).values({
    id: campId, brandId: HOUSE_BRAND_ID, name: "Cluster House Promos",
    startDate: new Date("2020-01-01"), endDate: new Date("2100-01-01"),
    targetDevice: "both", status: "active",
  });

  const placements = await db.select().from(schema.adPlacements);
  let i = 0;
  for (const p of placements) {
    const t = HOUSE_TAGLINES[i % HOUSE_TAGLINES.length];
    i++;
    const crId = uid();
    await db.insert(schema.adCreatives).values({
      id: crId, brandId: HOUSE_BRAND_ID, name: `Cluster · ${p.key}`, type: "image",
      fileUrl: svgAd(p.width, p.height, t.from, t.to, "CLUSTER", t.title),
      clickUrl: t.click, width: p.width, height: p.height, status: "approved",
    });
    await db.insert(schema.adCampaignCreatives).values({
      id: uid(), campaignId: campId, creativeId: crId, placementId: p.id, weight: 1, priority: 0,
    });
  }
}

// Idempotent: ensure the global top-banner placement exists and (on an already
// seeded DB where seedHouseAds early-returns) has a house creative to fill it.
// Runs every boot; a couple of guarded inserts, cheap once present.
// Recurring (daily/weekly/monthly) challenges that are still "active" but whose
// end time has passed roll their window forward to now, so they always show a
// real live countdown instead of "ends just now". Custom-cadence challenges
// keep their explicit dates. Cheap + filtered; runs every boot.
export async function refreshStaleChallengeWindows(db: DB) {
  const now = new Date();
  const cadenceDays: Record<string, number> = { daily: 1, weekly: 7, monthly: 30 };
  const rows = await db.select({ id: schema.challenges.id, cadence: schema.challenges.cadence })
    .from(schema.challenges)
    .where(and(eq(schema.challenges.status, "active"), lt(schema.challenges.endAt, now)));
  for (const r of rows) {
    const days = cadenceDays[r.cadence];
    if (!days) continue;
    await db.update(schema.challenges)
      .set({ startAt: now, endAt: new Date(now.getTime() + days * 86400000) })
      .where(eq(schema.challenges.id, r.id));
  }
}

export async function ensureTopBannerAd(db: DB) {
  await db.insert(schema.adPlacements).values({
    id: uid(), key: "top_banner", pageScope: "Global top banner (all pages)", device: "both",
    width: 970, height: 60, mobileWidth: 360, mobileHeight: 60,
  }).onConflictDoNothing();

  const [placement] = await db.select().from(schema.adPlacements).where(eq(schema.adPlacements.key, "top_banner")).limit(1);
  if (!placement) return;

  const [brand] = await db.select({ id: schema.brands.id }).from(schema.brands).where(eq(schema.brands.id, HOUSE_BRAND_ID)).limit(1);
  if (!brand) return; // fresh DB: seedHouseAds will create the creative for every placement
  const [camp] = await db.select({ id: schema.adCampaigns.id }).from(schema.adCampaigns).where(eq(schema.adCampaigns.brandId, HOUSE_BRAND_ID)).limit(1);
  if (!camp) return;

  const [link] = await db.select({ id: schema.adCampaignCreatives.id }).from(schema.adCampaignCreatives)
    .where(and(eq(schema.adCampaignCreatives.campaignId, camp.id), eq(schema.adCampaignCreatives.placementId, placement.id))).limit(1);
  if (link) return; // already has a creative

  const t = HOUSE_TAGLINES[0];
  const crId = uid();
  await db.insert(schema.adCreatives).values({
    id: crId, brandId: HOUSE_BRAND_ID, name: "Cluster · top_banner", type: "image",
    fileUrl: svgAd(placement.width, placement.height, t.from, t.to, "CLUSTER", t.title),
    clickUrl: t.click, width: placement.width, height: placement.height, status: "approved",
  });
  await db.insert(schema.adCampaignCreatives).values({
    id: uid(), campaignId: camp.id, creativeId: crId, placementId: placement.id, weight: 1, priority: 0,
  });
}
