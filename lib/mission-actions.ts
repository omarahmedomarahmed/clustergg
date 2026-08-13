import type { QuestActionKey } from "@/lib/quests";

/**
 * Where a mission task sends you, and what it looks like.
 *
 * ===== WHY THIS EXISTS =====
 *
 * The mission band listed today's tasks as plain text with a tick beside them.
 * No icon, no link, and no way to tell which quest a task belonged to — so
 * "Move your score in a challenge" was a sentence a gamer could read and not
 * act on. Reported from the live site as *the mission actions list has no
 * images or icons and is not clickable*, and both halves were true.
 *
 * The information needed to fix it was already there: `lib/missions.ts` builds
 * every task from a `QuestActionKey`, and `components/Nav.tsx` threw the key
 * away when it mapped tasks for the band. This module is what the key resolves
 * to.
 *
 * ===== WHY A TABLE RATHER THAN A COLUMN =====
 *
 * A destination is a property of the ACTION, not of anybody's mission. "Join a
 * challenge" leads to the challenge list for every gamer, every day, for ever.
 * Storing that per row would be twenty-six copies of one fact, and the first
 * time a route moved, some of them would be stale.
 *
 * ===== EVERY KEY IS PRESENT ON PURPOSE =====
 *
 * `Record<QuestActionKey, …>` rather than a partial: adding an action to
 * `ACTION_CATALOG` without deciding where it sends people is then a type error
 * rather than a task that silently renders as unclickable text — which is the
 * exact defect this module was written to end.
 */
export type MissionDestination = {
  /** An `Icon` name. */
  icon: string;
  /** Where tapping the task goes. */
  href: string;
  /** The part of the product it belongs to, shown as the task's context. */
  where: string;
};

export const MISSION_DESTINATIONS: Record<QuestActionKey, MissionDestination> = {
  // ===== Challenges =====
  join_challenge: { icon: "trophy", href: "/planets", where: "Challenges" },
  finish_challenge: { icon: "trophy", href: "/planets", where: "Challenges" },
  challenge_progress: { icon: "chart", href: "/planets", where: "Challenges" },
  top3_challenge: { icon: "trophy", href: "/leaderboards", where: "Challenges" },
  win_challenge: { icon: "crown", href: "/leaderboards", where: "Challenges" },

  // ===== Your profile and the people around it =====
  share_card: { icon: "share", href: "/profile", where: "Your profile" },
  profile_views_25: { icon: "eye", href: "/profile", where: "Your profile" },
  follower_gained: { icon: "user", href: "/profile", where: "Your profile" },
  profile_vote_received: { icon: "spark", href: "/vote", where: "Profile of the Week" },
  best_profile_award: { icon: "crown", href: "/vote", where: "Profile of the Week" },
  write_post: { icon: "message", href: "/feed", where: "The feed" },
  write_comment: { icon: "message", href: "/feed", where: "The feed" },
  reaction_given: { icon: "spark", href: "/feed", where: "The feed" },
  reaction_received: { icon: "spark", href: "/feed", where: "The feed" },
  message_new: { icon: "message", href: "/messages", where: "Messages" },
  join_planet: { icon: "planet", href: "/planets", where: "Planets" },

  // ===== Points, trophies and the wallet =====
  gift_sent: { icon: "gift", href: "/marketplace", where: "Marketplace" },
  gift_received: { icon: "gift", href: "/marketplace", where: "Marketplace" },
  redeem_trophy: { icon: "trophy", href: "/marketplace", where: "Marketplace" },

  // ===== Accounts and play =====
  connect_account: { icon: "link", href: "/profile?tab=accounts", where: "Your accounts" },
  stat_levelup: { icon: "arrowUp", href: "/profile?tab=accounts", where: "Your accounts" },
  play_session: { icon: "gamepad", href: "/profile?tab=accounts", where: "Your accounts" },

  // ===== Things that happen TO a gamer rather than because of one =====
  //
  // An impression is served, a click is somebody else's, a bot install is the
  // server owner's. There is no page a gamer can visit to make one happen, so
  // these point at the explanation instead of pretending they are actionable.
  ad_impression: { icon: "eye", href: "/rules/gamer", where: "How points work" },
  ad_click: { icon: "target", href: "/rules/gamer", where: "How points work" },
  botlist_vote: { icon: "spark", href: "/discord-bot", where: "The bot" },
  bot_added: { icon: "plus", href: "/discord-bot", where: "The bot" },
};

/** The destination for an action, with a safe default for anything unmapped. */
export function missionDestination(action: string): MissionDestination {
  return MISSION_DESTINATIONS[action as QuestActionKey]
    ?? { icon: "spark", href: "/quests", where: "Quests" };
}
