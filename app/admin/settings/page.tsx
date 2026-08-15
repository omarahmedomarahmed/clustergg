// Settings. **Admin only** — the vault split lives here.

import { DEFAULT_SPLIT_BPS, CHALLENGE_PRICE_CENTS, POOL_FLAT_BPS, KPI_WEIGHTS, BPS, formatMoney } from "../../../lib/money/amounts.ts";
import { DEFAULT_SANCTIONED, countryName } from "../../../lib/identity/countries.ts";
import { Panel, Row } from "../components.tsx";

export const dynamic = "force-dynamic";

export default function Settings() {
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
