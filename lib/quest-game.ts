// Client-safe shared types for the playable quest game. Free of server imports
// so client components (QuestGame, QuestMapHero) and server code (quest page,
// quest-hero loader) can both use them.

// One scoring rule of a quest: an action, the CP it grants, and its daily cap.
export type QuestRule = { key: string; label: string; points: number; cap?: number };

// One CP award in the gamer's history (what they did, when, what it earned).
export type QuestLogEntry = { id: string; actionKey: string; label: string; qp: number; at: string };

// Guided starter missions — the first-time actions we walk new gamers through.
// Each holds the ISO date the gamer FIRST did it (null = not done yet).
export type StarterMissions = {
  connectAt: string | null;   // connected their first game account
  planetAt: string | null;    // joined their first planet
  challengeAt: string | null; // joined their first challenge
  adAt: string | null;        // saw (or clicked) their first ad
};

// Admin-set CSS `background` values for the in-game panels (from the universal
// card-background editor: quest_rules / quest_log / quest_guide / quest_missions).
export type QuestPanelArt = { rules?: string; log?: string; guide?: string; missions?: string };

// Everything the playable quest game needs beyond the QuestView itself.
export type QuestGamePayload = {
  rules: QuestRule[];
  log: QuestLogEntry[];
  totalCp: number;
  art?: QuestPanelArt;
  missions?: StarterMissions;
};
