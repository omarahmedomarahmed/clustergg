// Settings. **Admin only** — the vault split lives here.

import { DEFAULT_SPLIT_BPS, CHALLENGE_PRICE_CENTS, POOL_FLAT_BPS, KPI_WEIGHTS, BPS, formatMoney } from "../../../lib/money/amounts.ts";
import { DEFAULT_SANCTIONED, countryName } from "../../../lib/identity/countries.ts";
import { Panel, Row } from "../components.tsx";
import { setPullCeilingAction } from "../actions.ts";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const { getDb } = await import("../../../lib/db/index.ts");
  const { pullCeiling } = await import("../../../lib/analytics/consent.ts");
  const ceiling = await pullCeiling(await getDb());
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="text-sm text-mute">
        Every figure below is read from the module that enforces it. Nothing on
        this page is a second copy of a number.
      </p>

      <Panel title="The unit">
        <Row><span className="text-sm text-mute">One challenge, one game, one week</span><span className="tabular-nums">{formatMoney(CHALLENGE_PRICE_CENTS)}</span></Row>
      </Panel>

      <Panel title="The vault split">
        <Row><span className="text-sm text-mute">Prize</span><span className="tabular-nums">{DEFAULT_SPLIT_BPS.prize / 100}%</span></Row>
        <Row><span className="text-sm text-mute">Server owners</span><span className="tabular-nums">{DEFAULT_SPLIT_BPS.server / 100}%</span></Row>
        <Row><span className="text-sm text-mute">Cluster</span><span className="tabular-nums">{DEFAULT_SPLIT_BPS.cluster / 100}%</span></Row>
      </Panel>

      <Panel title="The weekly pool">
        <Row><span className="text-sm text-mute">Flat participation share</span><span className="tabular-nums">{POOL_FLAT_BPS / 100}%</span></Row>
        <Row><span className="text-sm text-mute">Scored share</span><span className="tabular-nums">{(BPS - POOL_FLAT_BPS) / 100}%</span></Row>
        <Row><span className="text-sm text-mute">Exclusive entrants</span><span className="tabular-nums">{KPI_WEIGHTS.entrants}</span></Row>
        <Row><span className="text-sm text-mute">Conversion</span><span className="tabular-nums">{KPI_WEIGHTS.conversion}</span></Row>
        <Row><span className="text-sm text-mute">Activation</span><span className="tabular-nums">{KPI_WEIGHTS.activation}</span></Row>
      </Panel>

      {/*
        ===== THE ONE SETTING ON THIS PAGE THAT IS A SETTING =====

        Everything else here is read-only on purpose: the unit, the split and
        the pool are decided in `lib/money/amounts.ts` and a console that could
        edit them would be a second answer to what a challenge costs.

        This one is different. It is a safety limit on how many analytics pulls
        the platform will make in a day, and it exists to be **lowered in a
        hurry** when a provider starts complaining. `setPullCeiling` was written
        for it and had no caller, so the only way to move it was a deploy —
        which is how a limit ends up being deleted from the code instead.
      */}
      <Panel title="Analytics pull ceiling">
        <p className="text-sm text-mute">
          The most snapshot refreshes the whole platform will make in a day,
          across every server. It sits above each server&apos;s own cooldown.
          Currently <strong className="tabular-nums">{ceiling}</strong>.
        </p>
        <form action={setPullCeilingAction} className="mt-3 flex items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Pulls per day</span>
            <input
              name="ceiling"
              type="number"
              min={1}
              defaultValue={ceiling}
              className="w-32 rounded-md border border-line bg-ink px-3 py-1.5 text-sm"
              data-testid="pull-ceiling"
            />
          </label>
          <button
            type="submit"
            className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-white/5"
            data-testid="save-ceiling"
          >
            Save
          </button>
        </form>
      </Panel>

      <Panel title="Sanctioned countries — never offered in the picker">
        {DEFAULT_SANCTIONED.map((code) => (
          <Row key={code}>
            <span className="text-sm">{countryName(code)}</span>
            <span className="text-xs text-mute">{code}</span>
          </Row>
        ))}
        <p className="mt-4 text-xs text-mute">
          This is a starting value that a human reviews, not a compliance
          decision. Countries here are absent from the picker entirely — never
          offered and then refused.
        </p>
      </Panel>
    </div>
  );
}
