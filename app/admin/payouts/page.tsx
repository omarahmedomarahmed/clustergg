import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireSystemFor } from "@/lib/departments";
import { billingSummary } from "@/lib/billing";
import { pricingConfig } from "@/lib/pricing-live";
import { listPayouts, OPEN_STATUSES } from "@/lib/payouts";
import { payer } from "@/lib/payments";
import { vendorBy } from "@/lib/payments/vendors";
import { PAYOUT_HOLD_PHRASE } from "@/lib/abuse";
import PayoutQueue from "@/components/PayoutQueue";
import {
  Page, Section, StatRow, Stat, Table, Tr, Td, Money, Note, Pill, num, AdminLink, LinkButton, Toolbar,
} from "@/components/admin/kit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Payouts" };

// Money out to server owners.
//
// Two halves, and the gap between them is the only number that matters: what
// the weekly close says a server has earned, and what has actually been sent.
// An owner chasing us about that gap should find we already knew.
//
// MEMBERS' WINNINGS ARE NOT ON THIS PAGE. They belong to the gamers who won
// them and go out through the trophy redemption queue. Mixing the two would
// eventually put a gamer's prize into an owner's bank account, which is the one
// mistake on this screen nobody could apologise for.

export default async function AdminPayoutsPage() {
  await requireSystemFor("/admin/payouts");
  const db = await getDb();
  const cfg = await pricingConfig();

  const [b, payouts, guilds, pay] = await Promise.all([
    billingSummary(cfg),
    listPayouts({ limit: 200 }),
    db.select({
      guildId: schema.discordGuilds.guildId,
      name: schema.discordGuilds.name,
      slug: schema.discordGuilds.slug,
    }).from(schema.discordGuilds).where(eq(schema.discordGuilds.status, "active")).limit(400),
    payer("payout"),
  ]);
  const vendor = vendorBy(pay.adapter.key);

  const accounts = guilds.length
    ? await db.select().from(schema.payoutAccounts)
      .where(inArray(schema.payoutAccounts.ownerId, guilds.map((g) => g.guildId)))
    : [];
  const accountBy = new Map(accounts.filter((a) => a.ownerType === "server").map((a) => [a.ownerId, a]));

  const settled = new Map<string, { paid: number; open: number }>();
  for (const p of payouts) {
    const cur = settled.get(p.guildId) ?? { paid: 0, open: 0 };
    if (p.status === "paid") cur.paid += p.total;
    else if (OPEN_STATUSES.includes(p.status)) cur.open += p.total;
    settled.set(p.guildId, cur);
  }

  const owing = b.servers
    .map((s) => {
      const st = settled.get(s.guildId) ?? { paid: 0, open: 0 };
      return { ...s, ...st, unpaid: Math.round((s.owed - st.paid - st.open) * 100) / 100 };
    })
    .sort((a, c) => c.unpaid - a.unpaid);

  const totalUnpaid = owing.reduce((a, s) => a + Math.max(0, s.unpaid), 0);
  const totalOpen = payouts.filter((p) => OPEN_STATUSES.includes(p.status)).reduce((a, p) => a + p.total, 0);
  const totalPaid = payouts.filter((p) => p.status === "paid").reduce((a, p) => a + p.total, 0);
  const recentPayouts = [...payouts].sort((x, y) => +y.createdAt - +x.createdAt).slice(0, 60);
  const cur = cfg.currency;

  return (
    <Page
      title="Payouts"
      lede="What server owners have earned from the weekly pool, and what has been sent. Amounts are computed by the Monday close — nobody types them. Prize money is not here: it belongs to the gamers who won it and goes out through trophy redemptions."
      actions={
        <Toolbar>
          <LinkButton href="/admin/week">The week</LinkButton>
          <LinkButton href="/admin/redeems">Trophy redemptions</LinkButton>
          <LinkButton href="/admin/payments">Providers</LinkButton>
        </Toolbar>
      }
    >
      <StatRow>
        <Stat
          label="Owed, not yet opened"
          value={totalUnpaid.toLocaleString("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 })}
          note="Scored by a close and waiting for a payout row"
          tone={totalUnpaid > 0 ? "warn" : "plain"}
        />
        <Stat
          label="Open payouts"
          value={totalOpen.toLocaleString("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 })}
          note="Filed and not yet released"
        />
        <Stat
          label="Paid all time"
          value={totalPaid.toLocaleString("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 })}
          note="Actually sent to an owner"
          tone="good"
        />
        <Stat
          label="Servers earning"
          value={num(owing.filter((s) => s.owed > 0).length)}
          note="Carried a challenge and can be paid"
        />
      </StatRow>

      <Note tone={pay.reason ? "warn" : "info"}>
        Paying through <b>{vendor?.name ?? pay.adapter.key}</b>
        {pay.reason ? <> — <b>{pay.reason}</b></> : " — connected"}. {PAYOUT_HOLD_PHRASE}
      </Note>

      <Section
        title="Earned and unpaid"
        note="Opened by the weekly close, already scored and already netted against the server vault. There is no button here to open one by hand: that path existed, applied a per-challenge rate that no longer exists, and would have paid an owner twice."
      >
        <Table
          cols={[
            { key: "server", label: "Server" },
            { key: "linked", label: "Linked", align: "right", secondary: true },
            { key: "tier", label: "Tier", align: "right", secondary: true },
            { key: "owed", label: "Earned", align: "right" },
            { key: "paid", label: "Paid", align: "right" },
            { key: "unpaid", label: "Unpaid", align: "right" },
            { key: "acct", label: "Payout account", secondary: true },
          ]}
          empty="No server has been paid by a weekly close yet. A close needs money in the server pool and at least one server that carried a challenge with an entrant attributed to it."
        >
          {owing.map((s) => {
            const acct = accountBy.get(s.guildId);
            return (
              <Tr key={s.guildId} tone={s.unpaid > 0 && !acct?.methodPreference ? "warn" : undefined}>
                <Td>
                  <AdminLink href={`/admin/discord/${s.guildId}`}>{s.name}</AdminLink>
                </Td>
                <Td align="right" mono secondary>{num(s.linked)}</Td>
                {/* C3: a LABEL, not a rate. It decides who this server competes
                    against in the weekly pool and nothing else. */}
                <Td align="right" secondary>
                  <Pill>{s.tier}</Pill>
                </Td>
                <Td align="right" mono><Money value={s.owed} currency={cur} /></Td>
                <Td align="right" mono><Money value={s.paid} currency={cur} /></Td>
                <Td align="right" mono bold><Money value={Math.max(0, s.unpaid)} currency={cur} /></Td>
                <Td secondary>
                  {acct?.methodPreference
                    ? <Pill tone={acct.status === "ready" ? "good" : "warn"}>
                      {acct.methodPreference}{acct.country ? ` · ${acct.country}` : ""}
                    </Pill>
                    // An owner owed money with nowhere to send it is the row
                    // worth flagging, which is why this one tints the whole row.
                    : <Pill tone={s.unpaid > 0 ? "warn" : "plain"}>not set up</Pill>}
                </Td>
              </Tr>
            );
          })}
        </Table>
      </Section>

      <Section
        title="Payout queue"
        note="Review the lines, then release. Every release is attributed to whoever pressed it and written to the audit log — 'who authorised this payment' should never be a question this platform cannot answer."
      >
        <PayoutQueue
          payouts={recentPayouts.map((p) => ({
            id: p.id, guildId: p.guildId, guildName: p.guildName, status: p.status,
            total: p.total, currency: p.currency,
            createdAt: p.createdAt.toISOString(), paidAt: p.paidAt?.toISOString() ?? null,
            providerKey: p.providerKey, providerRef: p.providerRef, collectUrl: p.collectUrl,
            failedReason: p.failedReason, note: p.note,
            lines: p.lines.map((l) => ({ id: l.id, label: l.label, amount: l.amount, kind: l.kind })),
          }))}
          guilds={guilds.map((g) => ({ guildId: g.guildId, name: g.name || g.guildId }))}
          providerLabel={vendor?.name ?? pay.adapter.key}
          manual={pay.adapter.key === "manual"}
        />
      </Section>

      <Note tone="warn">
        A server owner disputing what they earned goes to a founder, not into a manual adjustment. The
        weekly close can be re-run and its working is on <AdminLink href="/admin/week">the week</AdminLink>;
        a hand-typed correction is a number nobody can reconstruct.
      </Note>
    </Page>
  );
}
