// Client-safe shared types for the playable quest game. Free of server imports
// so client components (QuestGame, QuestMapHero) and server code (quest page,
// quest-hero loader) can both use them.

// One scoring rule of a quest: an action, the CP it grants, and its daily cap.
export type QuestRule = { key: string; label: string; points: number; cap?: number };

// One CP award in the gamer's history (what they did, when, what it earned).
export type QuestLogEntry = { id: string; actionKey: string; label: string; qp: number; at: string };

// Guided starter missions — the first-time actions we walk new gamers through.
// Single-shot missions hold the ISO date the gamer FIRST did it (null = not
// yet). Ads are threshold-based (e.g. "see 5 ads"): we ship the count plus the
// dates of the earliest ad events so any admin-set threshold resolves exactly.
export type StarterMissions = {
  connectAt: string | null;   // connected their first game account
  planetAt: string | null;    // joined their first planet
  challengeAt: string | null; // joined their first challenge
  adCount: number;            // total ad signals (impressions + clicks) so far
  adDates: string[];          // dates of the earliest ad events, oldest first
};

// Admin-editable mission roster per quest (Admin → Quests → quest → Game
// screens). `kind` decides how completion is measured; label/href/icon/
// threshold are fully editable, labels are translatable via the UI-strings
// editor (rendered through tr()).
export type MissionKind = "connect" | "planet" | "challenge" | "ads";
export type MissionConfig = { kind: MissionKind; label: string; href: string; icon: string; threshold?: number; enabled?: boolean };

export const DEFAULT_MISSIONS: MissionConfig[] = [
  { kind: "connect", label: "Connect your first game account", href: "/profile", icon: "link", enabled: true },
  { kind: "planet", label: "Join your first planet", href: "/planets", icon: "planet", enabled: true },
  { kind: "challenge", label: "Join your first challenge", href: "/planets", icon: "zap", enabled: true },
  { kind: "ads", label: "Spot 5 sponsor signals (ads)", href: "/feed", icon: "eye", threshold: 5, enabled: true },
];

// The ISO date a mission was completed (null = still open).
export function missionDone(m: MissionConfig, s: StarterMissions): string | null {
  if (m.kind === "connect") return s.connectAt;
  if (m.kind === "planet") return s.planetAt;
  if (m.kind === "challenge") return s.challengeAt;
  const need = Math.max(1, m.threshold ?? 5);
  if (s.adCount < need) return null;
  return s.adDates[Math.min(need, s.adDates.length) - 1] ?? null;
}

// How many missions are still open for a quest (drives the red dots).
export function openMissions(cfg: MissionConfig[] | null | undefined, s: StarterMissions | null | undefined): number {
  if (!s) return 0;
  const list = (cfg && cfg.length ? cfg : DEFAULT_MISSIONS).filter((m) => m.enabled !== false);
  return list.filter((m) => !missionDone(m, s)).length;
}

// Per-quest admin overrides for the in-game screens: each panel (rules / log /
// guide / missions / the milestone card) can carry its own title text,
// background image with a dark-overlay strength, and button color.
export type PanelCfg = { title?: string; bg?: string; dim?: number; btn?: string };
export type QuestGameUi = { rules?: PanelCfg; log?: PanelCfg; guide?: PanelCfg; missions?: PanelCfg; milestone?: PanelCfg };

// Admin-tunable 3D terrain texture mapping — projects the flat quest map art
// onto the 3D mesh so features land in the right place, unlit (never dark).
// `projection: "planar"` drapes the art top-down by world XZ (correct
// placement); "uv" uses the mesh's own baked UVs. offset/scale/rotation/flip
// nudge the art to line up perfectly; yaw spins the model; brightness tints it.
export type MapGlbCfg = {
  projection?: "planar" | "uv";
  planarAxis?: "y" | "x" | "z";         // which world plane to drape the art on
                                        //   "y" = top-down (XZ) · "z" = front (XY) · "x" = side (ZY)
  offsetX?: number; offsetY?: number;   // 0..1
  scaleX?: number; scaleY?: number;     // repeat (1 = fill once)
  rotation?: number;                    // degrees (texture)
  flipX?: boolean; flipY?: boolean;
  yaw?: number;                         // degrees (model spin, Y)
  pitch?: number;                       // degrees (model tilt, X) — see the top of the rock
  brightness?: number;                  // 0.4..2 (1 = as-is)
  contrast?: number;                    // 0.5..2 (1 = as-is) via material — subtle depth
  autoRotate?: boolean;
  wireframe?: boolean;                  // debug: show the mesh edges over the art
  fitContain?: boolean;                 // auto-fit: scale the art so it covers the mesh footprint once
};

export const DEFAULT_MAP_GLB_CFG: Required<MapGlbCfg> = {
  projection: "planar", planarAxis: "y", offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1,
  rotation: 0, flipX: false, flipY: false, yaw: 0, pitch: 0, brightness: 1, contrast: 1,
  autoRotate: true, wireframe: false, fitContain: false,
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
