import Link from "next/link";
import { getDb } from "../../../lib/db/index.ts";
import { allBalances, ledgerBalances } from "../../../lib/money/ledger.ts";
import { checkPrizeVault } from "../../../lib/money/prize-vault.ts";
import { Panel, Money, Row, Light } from "../components.tsx";

export const dynamic = "force-dynamic";

export default async function Vaults() {
  const db = await getDb();
  const [balances, vault, balanced] = await Promise.all([
    allBalances(db),
    checkPrizeVault(db),
    ledgerBalances(db),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Vaults</h1>

      <Panel title="Balances — every one of them a sum over the ledger">
        <Row><span className="text-sm text-mute">1 · Income</span><Money cents={balances.income} /></Row>
        <Row><span className="text-sm text-mute">2 · Prize</span><Money cents={balances.prize} /></Row>
        <Row><span className="text-sm text-mute">3 · Server</span><Money cents={balances.server} /></Row>
        <Row><span className="text-sm text-mute">— · Cluster</span><Money cents={balances.cluster} /></Row>
        <Row>
          <span className="flex items-center gap-2 text-sm text-mute">
            <Light ok={balanced} level="red" /> The ledger sums to zero
          </span>
          <span className="text-sm">{balanced ? "yes" : "NO — investigate"}</span>
        </Row>
      </Panel>

      <Panel
        title="Prize vault"
        action={<Link href="/admin/vaults/prize" className="text-sm text-mute hover:text-white">Open →</Link>}
      >
        <p className="flex items-center gap-2 text-sm">
          <Light ok={vault.holds} level={vault.state === "over_allocated" ? "red" : "amber"} />
          {vault.explanation}
        </p>
      </Panel>

      <Panel
        title="Server vault"
        action={<Link href="/admin/vaults/server" className="text-sm text-mute hover:text-white">Allocate →</Link>}
      >
        <p className="text-sm text-mute">
          Vault 3 accumulates the server share. Allocation to a weekly pool is a
          deliberate action, capped at half.
        </p>
      </Panel>
    </div>
  );
}
