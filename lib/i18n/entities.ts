// Per-entity admin translations (EN + AR) for dynamic DB content — quests,
// quest milestones, game planets, challenges and leaderboards. Values are stored
// in the SAME two override maps as UI strings (ui.overrides.en / ui.overrides.ar)
// under a namespaced key `tr.<kind>.<id>.<field>`, so they reuse the existing
// storage, cache (getUiOverrides) and save action (saveUiString). At render, the
// override wins; otherwise we fall back to the entity's own (English) DB value.

// The translatable fields per entity kind — drives both the admin editor and the
// render helpers so they never drift.
export const ENTITY_FIELDS: Record<string, { field: string; label: string; multiline?: boolean }[]> = {
  quest: [
    { field: "name", label: "Quest name" },
    { field: "tagline", label: "Tagline" },
    { field: "lore", label: "Story / how it works", multiline: true },
  ],
  tier: [
    { field: "name", label: "Milestone name" },
    { field: "description", label: "Milestone description", multiline: true },
  ],
  planet: [
    { field: "name", label: "Planet name" },
    { field: "description", label: "Description", multiline: true },
  ],
  challenge: [
    { field: "title", label: "Title" },
    { field: "description", label: "How to win / description", multiline: true },
    { field: "prizeDescription", label: "Prize", multiline: true },
  ],
  leaderboard: [
    { field: "title", label: "Title" },
  ],
};

export type EntityKind = keyof typeof ENTITY_FIELDS;

// The override-map key for one entity field.
export function entityTrKey(kind: string, id: string, field: string): string {
  return `tr.${kind}.${id}.${field}`;
}

// Resolve a localized entity field value from an override map, falling back to
// the entity's own DB value (kept in English) when no override is set.
export function trEntity(
  overrides: Record<string, string> | null | undefined,
  kind: string,
  id: string,
  field: string,
  fallback: string | null | undefined,
): string {
  const v = overrides?.[entityTrKey(kind, id, field)];
  return (v && v.length > 0 ? v : (fallback ?? "")) as string;
}

export type TeFn = (kind: string, id: string, field: string, fallback: string | null | undefined) => string;

// Return a copy of a quest with its name/tagline/lore and every milestone's
// name/description swapped for the viewer's language (generic over the concrete
// quest shape so callers keep their exact type).
export function localizeQuest<
  Q extends { id: string; name: string; tagline: string; lore: string; tiers: { id: string; name: string; description: string }[] },
>(q: Q, te: TeFn): Q {
  return {
    ...q,
    name: te("quest", q.id, "name", q.name),
    tagline: te("quest", q.id, "tagline", q.tagline),
    lore: te("quest", q.id, "lore", q.lore),
    tiers: q.tiers.map((t) => ({ ...t, name: te("tier", t.id, "name", t.name), description: te("tier", t.id, "description", t.description) })),
  };
}
