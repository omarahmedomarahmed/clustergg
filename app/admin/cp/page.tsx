import { getDb, schema } from "@/lib/db";
import { requireSystemFor } from "@/lib/departments";
import { dailyCpCeiling, ACTION_CATALOG, ACTION_LABEL } from "@/lib/quests";
import { cpPerDollar } from "@/lib/marketplace";
import { balances } from "@/lib/vaults";
import { activeGamers, vaultGamerDays, vaultRunwayDays } from "@/lib/active-gamers";
import { planCpDial, missionEligibleActions, DEFAULT_CEILING } from "@/lib/cp-dial";
import CpDial, { type PlanPreview } from "@/components/admin/CpDial";
import {
  Page, Section, StatRow, Stat, Table, Tr, Td, Note, Pill, num, AdminLink, LinkButton, Toolbar,
} from "@/components/admin/kit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · The CP dial" };

// One number decides what the gamer economy costs. C1.
//
// `lib/cp-dial.ts` has existed since C1 shipped and nothing called it, which
// means the ceiling has only ever been movable by editing a settings row by
// hand — with no view of what it does to a mission, and none of what it does to
// the vault. Those are the two questions, and this page is both of them beside
// the control.
//
// WHY THE CEILING AND NOT THE WEIGHTS. Three ways to build a dial were
// considered and two were rejected in cp-dial.ts: paying a bonus on mission
// completion doubles the exposure through a feature that reads as copywriting,
// and scaling every action weight drags the one-off actions along. What is left
// is: set the ceiling, and scale only the mission weights beneath it. The
// ceiling stays a hard bound, so the worst case is bounded by a number somebody
// chose rather than by the sum of a table.
//
// THE PRESETS ARE PRECOMPUTED HERE, on the server, from the weights the QUESTS
// are running. The dial is a lookup, not a second implementation of the
// arithmetic — a client-side copy that drifts is a screen that lies about what
// a button will do.
const PRESET_CEILINGS = [0, 100, 250, 500, 1000];

export default async function AdminCpPage() {
  const access = await requireSystemFor("/admin/cp");
  const db = await getDb();

  const [quests, ceiling, rate, vault, active] = await Promise.all([
    db.select().from(schema.quests),
    dailyCpCeiling(db),
    cpPerDollar(db),
    balances(db),
    activeGamers(db),
  ]);

  // The live weights, exactly as the apply action reads them. Where two quests
  // disagree on an action the HIGHER wins: the model's job is the worst case,
  // and averaging them would understate it.
  const live = new Map<string, { key: string; weight: number; cap: number; quests: string[] }>();
  for (const a of ACTION_CATALOG) live.set(a.key, { key: a.key, weight: 0, cap: a.defaultCap, quests: [] });
  for (const q of quests) {
    const weights = (q.actionWeights ?? {}) as Record<string, number>;
    const caps = (q.dailyCaps ?? {}) as Record<string, number>;
    for (const [key, w] of Object.entries(weights)) {
      const row = live.get(key);
      if (!row || !(Number(w) > 0)) continue;
      row.quests.push(q.key);
      row.weight = Math.max(row.weight, Number(w));
      const c = Number(caps[key] ?? 0);
      if (c > 0) row.cap = Math.max(row.cap, c);
    }
  }
  const current = [...live.values()].filter((a) => a.weight > 0);
  const eligible = new Set(missionEligibleActions());

  const dailyActive = active.everEarned > 0 ? active.day : null;

  const previewFor = (target: number): PlanPreview => {
    const plan = planCpDial(target, current);
    return {
      ceiling: plan.ceiling,
      scale: plan.scale,
      changed: Object.keys(plan.weights).length,
      missionTotal: plan.missionTotal,
      note: plan.note,
      // Null rather than a big number when the population is unmeasured. An
      // unmeasured denominator must never produce a comfortable answer.
      runwayDays: plan.ceiling > 0 && dailyActive !== null
        ? vaultRunwayDays(vault.cp, rate, plan.ceiling, dailyActive)
        : null,
    };
  };

  // Always includes the current ceiling, so "no change" is one of the choices
  // and the operator can see what they are already running.
  const targets = [...new Set([...PRESET_CEILINGS, ceiling, DEFAULT_CEILING])].sort((a, b) => a - b);
  const previews = targets.map(previewFor);
  const today = previews.find((p) => p.ceiling === ceiling)!;

  const gamerDays = vaultGamerDays(vault.cp, rate, ceiling);
  const runway = dailyActive !== null ? vaultRunwayDays(vault.cp, rate, ceiling, dailyActive) : null;
  const costPerMaximalGamerDay = rate > 0 ? ceiling / rate : 0;

  return (
    <Page
      title="The CP dial"
      lede="One number decides what the gamer economy costs: the most CP any one gamer can be credited in a day. Everything a gamer earns is funded from the CP vault, so this is the ceiling on how fast that vault can drain."
      actions={
        <Toolbar>
          <LinkButton href="/admin/vaults">The vaults</LinkButton>
          <LinkButton href="/admin/cp-calculator">Model it first</LinkButton>
          <LinkButton href="/admin/quests">Quests</LinkButton>
        </Toolbar>
      }
    >
      <StatRow>
        <Stat
          label="Ceiling now"
          value={`${num(ceiling)} CP`}
          note="Per gamer, per day. A hard bound, not a target."
          tone={ceiling === 0 ? "bad" : "plain"}
        />
        <Stat
          label="CP vault"
          value={vault.cp.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
          note="Funds every point a gamer earns"
          tone={vault.cp <= 0 ? "warn" : "good"}
        />
        <Stat
          label="Gamer-days funded"
          value={num(gamerDays)}
          note="Days of ONE maximal gamer. The worst case, not the forecast."
        />
        <Stat
          label="Runway"
          value={runway === null ? "Not measured" : `${num(runway)} days`}
          note={
            dailyActive === null
              ? "Nobody has been credited CP yet, so there is nothing to divide by."
              : `At ${num(dailyActive)} gamers credited CP in the last day`
          }
          tone={runway !== null && runway < 30 ? "warn" : "plain"}
        />
      </StatRow>

      {ceiling === 0 && (
        <Note tone="bad">
          The ceiling is <b>zero</b>, so nothing is earning. Actions are still recorded and nothing is
          backdated when it reopens — a gamer who played today at a zero ceiling earned nothing today, and
          raising it tomorrow does not pay them for it.
        </Note>
      )}

      <Section
        title="Move it"
        note="Sets the ceiling AND rescales the mission weights beneath it, in one write. Doing either alone is what breaks the model: raise the ceiling and a mission is still worth what it was worth; rescale the weights and the ceiling is a bound nobody is near, or one everybody hits by lunchtime."
      >
        {current.length === 0 ? (
          <Note tone="warn">
            No quest pays anything yet, so there is nothing to scale. Build a quest on{" "}
            <AdminLink href="/admin/quests">the quests page</AdminLink> first.
          </Note>
        ) : (
          <CpDial
            current={ceiling}
            presets={previews}
            canEdit={access.isAdmin}
            dailyActive={dailyActive}
          />
        )}
      </Section>

      <Section
        title="What the dial touches"
        note="Mission actions scale together, which is what keeps the per-quest block arithmetic intact — every eligible weight moves by the same factor, so the blocks stay in proportion. One-off actions keep their price whatever the dial does: they are paid for being rare, and scaling them would make a milestone cheaper on a quiet month."
      >
        <Table
          cols={[
            { key: "action", label: "Action" },
            { key: "kind", label: "Scaled?" },
            { key: "weight", label: "CP now", align: "right" },
            { key: "cap", label: "Daily cap", align: "right", secondary: true },
            { key: "quests", label: "Paid by", secondary: true },
          ]}
          empty="No quest pays anything yet, so the dial has nothing to move."
        >
          {current.map((a) => (
            <Tr key={a.key}>
              <Td>{ACTION_LABEL[a.key] ?? a.key}</Td>
              <Td>
                {eligible.has(a.key)
                  ? <Pill tone="info">mission</Pill>
                  : <Pill>fixed</Pill>}
              </Td>
              <Td align="right" mono bold>{num(a.weight)}</Td>
              <Td align="right" mono secondary>{a.cap > 0 ? num(a.cap) : "uncapped"}</Td>
              <Td secondary>{a.quests.join(", ") || "—"}</Td>
            </Tr>
          ))}
        </Table>
      </Section>

      <Section
        title="What a day costs"
        note="The arithmetic the whole model rests on, in the same terms the vault screen and the deck use — so all three quote the same figure."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Fact
            label="Rate"
            value={`${num(rate)} CP = $1`}
            note="Set on the marketplace. Changing it changes what every unspent point is worth."
          />
          <Fact
            label="One maximal gamer, one day"
            value={costPerMaximalGamerDay.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 })}
            note="Ceiling ÷ rate. Almost nobody hits the ceiling; this is the bound, not the average."
          />
          <Fact
            label="A day's mission"
            value={`${num(today?.missionTotal ?? 0)} CP`}
            note="What a gamer is actually shown and actually chases, averaged across the templates."
          />
        </div>
      </Section>

      <Note tone="info">
        Nothing here is retroactive. Moving the ceiling changes what tomorrow pays; every point already
        credited stays credited, and the ledger behind it is not rewritten. The money that funds it is on{" "}
        <AdminLink href="/admin/vaults">the vaults page</AdminLink>, and what a change would cost at scale
        is on <AdminLink href="/admin/cp-calculator">the calculator</AdminLink> — model it there before
        moving it here.
      </Note>

      <Note tone={vault.cp > 0 ? "info" : "warn"}>
        <b>&ldquo;Runway&rdquo; counts gamers we CREDITED, not gamers who showed up.</b> A gamer who played all
        day and earned nothing because they hit their ceiling is active by any product definition and absent
        from this one — the number&apos;s only job is to divide the vault, and the vault is only drained by
        people who were paid. Counting sessions instead would inflate the denominator with people who cost
        nothing and make the runway look longer than it is.
      </Note>
    </Page>
  );
}

// A small labelled figure. Not `Stat`: these are constants of the model rather
// than counts of anything, and giving them the same tile as a live number would
// invite somebody to watch them for movement.
function Fact({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className="mt-1 text-xl font-black tabular-nums">{value}</div>
      <p className="mt-1 text-xs leading-snug text-muted">{note}</p>
    </div>
  );
}
