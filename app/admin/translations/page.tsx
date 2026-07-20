import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getRawContent } from "@/lib/cms";
import { entityTrKey, ENTITY_FIELDS } from "@/lib/i18n/entities";
import UiStringsEditor, { type UiGroup, type UiItem } from "@/components/UiStringsEditor";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Content translations" };

// Admin editor for translating every dynamic DB entity (quests + milestones,
// game planets, challenges, leaderboards) into Arabic AND English. Values are
// stored as per-locale overrides under `tr.<kind>.<id>.<field>` and win over the
// entity's DB text on the public pages, based on the viewer's language.
export default async function TranslationsAdminPage() {
  const db = await getDb();
  const [quests, tiers, planets, challenges, boards, ovRaw] = await Promise.all([
    db.select().from(schema.quests).orderBy(asc(schema.quests.sortOrder)),
    db.select().from(schema.questTiers).orderBy(asc(schema.questTiers.tierIndex)),
    db.select({ id: schema.spaces.id, slug: schema.spaces.slug, name: schema.spaces.name, description: schema.spaces.description, game: schema.spaces.game })
      .from(schema.spaces).where(eq(schema.spaces.isActive, true)).orderBy(asc(schema.spaces.name)),
    db.select({ id: schema.challenges.id, title: schema.challenges.title, description: schema.challenges.description, prizeDescription: schema.challenges.prizeDescription, game: schema.challenges.game })
      .from(schema.challenges).orderBy(desc(schema.challenges.createdAt)).limit(120),
    db.select({ id: schema.leaderboards.id, title: schema.leaderboards.title, game: schema.leaderboards.game })
      .from(schema.leaderboards).where(eq(schema.leaderboards.isActive, true)).orderBy(asc(schema.leaderboards.game)),
    getRawContent(["ui.overrides.en", "ui.overrides.ar"], "en"),
  ]);

  const parse = (s?: string) => { try { const j = JSON.parse(s || "{}"); return j && typeof j === "object" ? j as Record<string, string> : {}; } catch { return {}; } };
  const enOv = parse(ovRaw["ui.overrides.en"]);
  const arOv = parse(ovRaw["ui.overrides.ar"]);

  // Build one UiItem per entity field: EN defaults to the override or the DB
  // value; AR defaults to the override (blank falls back to English at render).
  const item = (kind: string, id: string, field: string, dbValue: string | null | undefined, label: string): UiItem => {
    const key = entityTrKey(kind, id, field);
    return { key, label, en: enOv[key] ?? (dbValue ?? ""), ar: arOv[key] ?? "" };
  };
  const fieldsFor = (kind: string, id: string, row: Record<string, unknown>): UiItem[] =>
    (ENTITY_FIELDS[kind] ?? []).map((f) => item(kind, id, f.field, row[f.field] as string | null, f.label));

  const groups: UiGroup[] = [];

  // Quests — one group per quest, with the quest's fields + its milestones' fields.
  for (const q of quests) {
    const items: UiItem[] = fieldsFor("quest", q.id, q as unknown as Record<string, unknown>);
    for (const t of tiers.filter((x) => x.questId === q.id)) {
      for (const f of ENTITY_FIELDS.tier) {
        items.push(item("tier", t.id, f.field, (t as unknown as Record<string, unknown>)[f.field] as string | null, `Milestone “${t.name}” · ${f.label}`));
      }
    }
    groups.push({ page: `Quest · ${q.name}`, items });
  }

  // Planets (game community spaces).
  groups.push({
    page: "Game planets",
    items: planets.flatMap((p) => fieldsFor("planet", p.id, p as unknown as Record<string, unknown>).map((it, i) => ({ ...it, label: `${p.name} · ${ENTITY_FIELDS.planet[i].label}` }))),
  });

  // Challenges.
  if (challenges.length) {
    groups.push({
      page: "Challenges",
      items: challenges.flatMap((c) => fieldsFor("challenge", c.id, c as unknown as Record<string, unknown>).map((it, i) => ({ ...it, label: `${c.title} · ${ENTITY_FIELDS.challenge[i].label}` }))),
    });
  }

  // Leaderboards.
  if (boards.length) {
    groups.push({
      page: "Leaderboards",
      items: boards.flatMap((b) => fieldsFor("leaderboard", b.id, b as unknown as Record<string, unknown>).map((it) => ({ ...it, label: `${b.game} · ${b.title}` }))),
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Icon name="globe" size={20} className="text-cyan-300" /> Content translations</h1>
        <p className="text-sm text-muted mt-1">
          Translate every quest, milestone, game planet, challenge and leaderboard into Arabic and English.
          The translated text shows on the public pages based on the gamer&apos;s language. Blank Arabic falls back to English.
        </p>
      </div>
      {groups.length === 0
        ? <div className="glass p-8 text-center text-muted">No translatable content yet.</div>
        : <UiStringsEditor groups={groups} />}
    </div>
  );
}
