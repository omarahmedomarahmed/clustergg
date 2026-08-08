import { requireSystemFor } from "@/lib/departments";
import { getDb } from "@/lib/db";
import { balances, currentSplit, VAULTS, SPLIT_PRESETS, type Vault } from "@/lib/vaults";
import { measureBreakage, reachedGamersPct } from "@/lib/breakage";
import { pricingConfig } from "@/lib/pricing-live";
import { activeGamers, vaultRunwayDays } from "@/lib/active-gamers";
import { cpPerDollar } from "@/lib/marketplace";
import { dailyCpCeiling } from "@/lib/quests";
import { Page, Section, StatRow, Stat, Table, Tr, Td, Money, Note, Pill, num } from "@/components/admin/kit";
import SplitEditor from "@/components/admin/SplitEditor";
import VaultTransfer from "@/components/admin/VaultTransfer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Vaults" };

// Where every dollar is. B87/C13, and the screen that item was missing.
//
// The console had billing, payouts and a brand ledger, and no view of the four
// pools the commercial model actually divides money into. The prize half — the
// largest line — had no screen at all, which is the reporting version of the
// defect C13 fixed in the schema: the pool big enough to sink us was the one
// nothing watched.
//
// EVERY NUMBER HERE IS A SUM OF LEDGER ROWS. There is no stored balance on this
// page and there is nothing an admin can type that changes one directly: money
// moves by allocation (a paid invoice), by payout, or by an explicit transfer
// that writes two rows and demands a reason.

export default async function VaultsPage() {
  const access = await requireSystemFor("/admin/vaults");
  const db = await getDb();

  const [bal, split, breakage, cfg, actives, rate, ceiling] = await Promise.all([
    balances(db),
    currentSplit(db),
    measureBreakage(db),
    pricingConfig().catch(() => null),
    activeGamers(db),
    cpPerDollar(db),
    dailyCpCeiling(db),
  ]);

  const total = VAULTS.reduce((a, v) => a + bal[v], 0);
  const prizePct = cfg?.prizePct ?? 50;
  const reached = reachedGamersPct(breakage, prizePct);
  const runway = vaultRunwayDays(bal.cp, rate, ceiling, actives.day);

  const LABEL: Record<Vault, string> = {
    prize: "Prize vault",
    server: "Server pool",
    cp: "CP vault",
    cluster: "Cluster revenue",
  };
  const WHAT: Record<Vault, string> = {
    prize: "Owed to gamers as trophies. A liability, not income.",
    server: "Divided weekly between the servers that carried a challenge.",
    cp: "Funds every point a gamer earns.",
    cluster: "Ours. Everything else is somebody's money we are holding.",
  };

  return (
    <Page
      title="Vaults"
      lede="Every dollar a brand has paid, and which of the four pools it is sitting in. Balances are summed from the ledger — there is no stored number here for anything to drift from."
    >
      <StatRow>
        {VAULTS.map((v) => (
          <Stat
            key={v}
            label={LABEL[v]}
            value={bal[v].toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
            note={`${split[v]}% of every sale · ${WHAT[v]}`}
            tone={v === "cluster" ? "good" : v === "prize" ? "warn" : "plain"}
          />
        ))}
      </StatRow>

      <Note tone="info">
        <b>{total.toLocaleString("en-US", { style: "currency", currency: "USD" })}</b> has arrived in
        total. Money reaches a vault when an invoice is marked <b>paid</b>, never when it is issued —
        allocating on an invoice would fill these with money nobody has sent, and every payout below
        would be drawing on a promise.
      </Note>

      <Section
        title="The split"
        note="What each new sale divides into. Presets are an ordinary change; editing by hand is a danger-zone action, and nothing that does not total 100 will save."
      >
        <SplitEditor
          current={split}
          presets={SPLIT_PRESETS}
          canEdit={access.isAdmin}
        />
      </Section>

      <Section
        title="Move money between vaults"
        note="A transfer writes TWO rows sharing one id, so the two halves can never be read apart or reconciled separately. A reason is required — a movement nobody can audit is one nobody should be able to make."
      >
        {access.isAdmin
          ? <VaultTransfer balances={bal} />
          : <Note tone="warn">Transfers are admin-only. Ask a super admin.</Note>}
      </Section>

      {/* ===== The prize half, told honestly ===== */}
      <Section
        title="What actually reached gamers"
        note="C14. A prize is awarded as a trophy and becomes cash only on redemption, and redemption opens at 18 — so some of the prize half never reaches anybody. It is measured and reported here. It is never banked."
      >
        <StatRow>
          <Stat
            label="Awarded, ever"
            value={breakage.awarded.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
            note="Trophy value handed to gamers"
          />
          <Stat
            label="Redeemed"
            value={breakage.redeemed.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
            note="Settled payouts only — an approved one that never sent is still owed"
            tone="good"
          />
          <Stat
            label="Outstanding"
            value={breakage.outstanding.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
            note="Held on shelves. A liability."
            tone="warn"
          />
          <Stat
            label={`Actually reached gamers`}
            value={reached == null ? "—" : `${reached}%`}
            note={reached == null
              ? "Nothing awarded yet, so there is no rate to quote"
              : `We promise ${prizePct}%. This is what was collected.`}
            tone={reached == null ? "plain" : reached < prizePct * 0.6 ? "bad" : "plain"}
          />
        </StatRow>

        <div className="mt-4">
          <Table
            cols={[
              { key: "what", label: "Held by" },
              { key: "amount", label: "Value", align: "right" },
              { key: "why", label: "Why it is not collectable", secondary: true },
            ]}
            empty="Nothing is outstanding — every trophy awarded has been redeemed."
          >
            {breakage.heldByUnderAge > 0 && (
              <Tr key="age" tone="warn">
                <Td>Gamers who cannot cash out yet</Td>
                <Td align="right" mono><Money value={breakage.heldByUnderAge} /></Td>
                <Td secondary>Under 18, or they have not told us their age band. They may collect later.</Td>
              </Tr>
            )}
            {breakage.heldByGoneAccounts > 0 && (
              <Tr key="gone" tone="bad">
                <Td>Deleted or suspended accounts</Td>
                <Td align="right" mono><Money value={breakage.heldByGoneAccounts} /></Td>
                <Td secondary>Realistically gone. Still not swept — see the note below.</Td>
              </Tr>
            )}
          </Table>
        </div>

        <Note tone="warn">
          <b>Breakage is never banked.</b> Unredeemed value stays in the prize vault as a liability —
          not swept into revenue, not counted toward margin, not netted off the next challenge. A
          gift-card business books it on an actuarial schedule; doing that here means recognising
          money out of teenagers who were told they had won it. No trophy expires, and inventing an
          expiry is a decision for counsel, not for a sweep job.
        </Note>
      </Section>

      {/* ===== The CP vault's runway ===== */}
      <Section
        title="How long the CP vault lasts"
        note="The constraint the whole company runs on. Roughly one brand per 1,400 daily-active gamers just to hold the floor."
      >
        <StatRow>
          <Stat
            label="Daily active"
            value={num(actives.day)}
            note="Gamers we credited CP to yesterday — the only definition that divides this vault"
          />
          <Stat
            label="CP per dollar"
            value={num(rate)}
            note="The live rate, from settings"
          />
          <Stat
            label="Daily ceiling"
            value={num(ceiling)}
            note="The most one gamer can be credited in a day"
          />
          <Stat
            label="Runway"
            value={runway == null ? "—" : `${num(runway)} days`}
            note={runway == null
              ? "Nobody measured yet — this is not 'fine', it is unknown"
              : "At today's active count and the current ceiling"}
            tone={runway == null ? "plain" : runway < 30 ? "bad" : runway < 90 ? "warn" : "good"}
          />
        </StatRow>
      </Section>

      <Section title="Where the numbers come from">
        <Table
          cols={[{ key: "n", label: "Number" }, { key: "s", label: "Source" }]}
          empty="—"
        >
          <Tr key="1"><Td>Vault balances</Td><Td><code>sum(vault_ledger.amount)</code> per vault. No stored balance exists.</Td></Tr>
          <Tr key="2"><Td>Awarded</Td><Td><code>user_trophies</code> joined to the trophy&apos;s value at award time.</Td></Tr>
          <Tr key="3"><Td>Redeemed</Td><Td><code>trophy_redeems</code> where status is <Pill tone="good">paid</Pill>.</Td></Tr>
          <Tr key="4"><Td>Daily active</Td><Td>Distinct gamers with a CP credit in the last day. A credit of zero does not count.</Td></Tr>
        </Table>
      </Section>
    </Page>
  );
}
