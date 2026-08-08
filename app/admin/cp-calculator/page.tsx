import { getDb, schema } from "@/lib/db";
import { requireSystemFor } from "@/lib/departments";
import { ACTION_CATALOG, dailyCpCeiling } from "@/lib/quests";
import { cpPerDollar } from "@/lib/marketplace";
import type { ActionConfig, EconConfig } from "@/lib/cp-economics";
import { activeGamers } from "@/lib/active-gamers";
import CpCalculator from "@/components/CpCalculator";
import FeatureShot from "@/components/FeatureShot";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · CP calculator" };

/**
 * Every point we give away, modelled before we give it (B16).
 *
 * The config is read from the QUESTS, not from the catalog defaults, because
 * the quests are what `awardQuestAction` actually pays. A calculator that
 * modelled the defaults would be modelling a configuration nobody is running the
 * moment an admin touches anything.
 */
export default async function CpCalculatorPage() {
  const access = await requireSystemFor("/admin/cp-calculator");
  const db = await getDb();

  const [quests, rate, ceiling, measured] = await Promise.all([
    db.select().from(schema.quests),
    cpPerDollar(db),
    dailyCpCeiling(db),
    // C12. The calculator's daily-active slider was the only "expected active
    // gamers" figure anywhere, and it is a guess. This is the counted one.
    activeGamers(db),
  ]);

  // One row per action, carrying every quest that listens to it. Where two
  // quests disagree on a weight the HIGHER is modelled — the model's job is the
  // worst case, and quietly averaging them would understate it.
  const byKey = new Map<string, ActionConfig>();
  for (const a of ACTION_CATALOG) {
    byKey.set(a.key, { key: a.key, label: a.label, weight: 0, cap: 0, quests: [] });
  }
  for (const q of quests) {
    const weights = (q.actionWeights ?? {}) as Record<string, number>;
    const caps = (q.dailyCaps ?? {}) as Record<string, number>;
    for (const [key, w] of Object.entries(weights)) {
      const row = byKey.get(key);
      if (!row || !(w > 0)) continue;
      row.quests.push(q.key);
      row.weight = Math.max(row.weight, w);
      // An action uncapped on ANY quest is uncapped, so a zero wins over a
      // number rather than losing to it.
      const c = Number(caps[key] ?? 0);
      row.cap = row.cap === 0 && row.quests.length > 1 ? 0 : (c > 0 ? Math.max(row.cap, c) : 0);
    }
  }
  const initial: EconConfig = {
    cpPerDollar: rate, ceiling,
    actions: [...byKey.values()].filter((a) => a.quests.length > 0),
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">CP calculator</h1>
      <p className="text-sm text-muted mb-6 max-w-3xl">
        Every point we give away, modelled before we give it. Change anything and the numbers move; nothing is
        written until you save, and saving goes to the quests that actually pay — with every before → after in the
        audit log.
      </p>

      <FeatureShot shotKey="admin.cp.calculator" className="mb-6" />

      <CpCalculator initial={initial} canSave={access.isAdmin} measured={measured} />
    </div>
  );
}
