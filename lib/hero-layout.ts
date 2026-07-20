// Admin-configured layout for a planet's hero sidebars. Each side is an ordered
// list of modules; the explorer renders them in order. Client-safe (no server
// imports) so both the admin editor and the explorer share it. Games with no
// saved layout fall back to a sensible default.

export type HeroModule =
  | { id: string; kind: "leaderboards"; limit?: number }
  | { id: string; kind: "board"; metricKey: string }
  | { id: string; kind: "champions"; limit?: number }
  | { id: string; kind: "entities"; entityKind?: "all" | "champion" | "hero" | "agent" | "weapon" | "outfit"; limit?: number }
  | { id: string; kind: "challenges" }
  | { id: string; kind: "regions" };

export type HeroModuleKind = HeroModule["kind"];
export type HeroLayout = { left: HeroModule[]; right: HeroModule[] };

// Catalogue of modules an admin can add, with whether each is game-specific.
export const HERO_MODULE_META: { kind: HeroModuleKind; label: string; icon: string; gameSpecific?: boolean; hasLimit?: boolean }[] = [
  { kind: "leaderboards", label: "All leaderboards", icon: "chart", hasLimit: true },
  { kind: "board", label: "One leaderboard", icon: "chart" },
  { kind: "champions", label: "Champion mastery boards", icon: "swords", gameSpecific: true, hasLimit: true },
  { kind: "entities", label: "Game-world (champions/agents/weapons)", icon: "swords", gameSpecific: true, hasLimit: true },
  { kind: "challenges", label: "Challenges", icon: "zap" },
  { kind: "regions", label: "Players by region", icon: "users" },
];

const rid = () => "m-" + Math.random().toString(36).slice(2, 9);

// The game-world entity kinds a game exposes (client-safe mapping).
export function entityKindsForGame(game: string | null | undefined): ("champion" | "hero" | "agent" | "weapon" | "outfit")[] {
  if (game === "League of Legends") return ["champion"];
  if (game === "VALORANT") return ["agent", "weapon"];
  if (game === "Dota 2") return ["hero"];
  if (game === "Fortnite") return ["outfit"];
  return [];
}
export function newModule(kind: HeroModuleKind): HeroModule {
  if (kind === "leaderboards") return { id: rid(), kind, limit: 5 };
  if (kind === "board") return { id: rid(), kind, metricKey: "" };
  if (kind === "champions") return { id: rid(), kind, limit: 10 };
  if (kind === "entities") return { id: rid(), kind, entityKind: "all", limit: 10 };
  return { id: rid(), kind } as HeroModule;
}

// Stable ids — the default layout is recomputed on every render for games with
// no saved layout, so random ids would remount (and flicker) the sidebar.
export function defaultHeroLayout(): HeroLayout {
  return {
    left: [{ id: "d-lb", kind: "leaderboards" }, { id: "d-ent", kind: "entities", entityKind: "all", limit: 12 }],
    right: [{ id: "d-ch", kind: "challenges" }, { id: "d-rg", kind: "regions" }],
  };
}

const VALID: Set<HeroModuleKind> = new Set(["leaderboards", "board", "champions", "entities", "challenges", "regions"]);

export function normalizeHeroLayout(raw: unknown): HeroLayout {
  const side = (arr: unknown): HeroModule[] => {
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((m): m is Record<string, unknown> => !!m && typeof m === "object" && typeof (m as { kind?: unknown }).kind === "string" && VALID.has((m as { kind: HeroModuleKind }).kind))
      .map((m) => {
        const base = { id: typeof m.id === "string" ? m.id : rid(), kind: m.kind as HeroModuleKind };
        const out: Record<string, unknown> = { ...base };
        if (typeof m.limit === "number") out.limit = Math.max(1, Math.min(60, m.limit));
        if (typeof m.metricKey === "string") out.metricKey = m.metricKey;
        if (typeof m.entityKind === "string") out.entityKind = m.entityKind;
        return out as unknown as HeroModule;
      });
  };
  if (raw && typeof raw === "object") {
    const l = side((raw as { left?: unknown }).left);
    const r = side((raw as { right?: unknown }).right);
    if (l.length || r.length) return { left: l, right: r };
  }
  return defaultHeroLayout();
}
