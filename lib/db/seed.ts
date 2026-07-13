import { eq } from "drizzle-orm";
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
