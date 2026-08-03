import Link from "next/link";
import { requireSystemFor } from "@/lib/departments";
import { FLOW_LABEL, liveVendors, providerStatus, SETTING_KEYS } from "@/lib/payments";
import { RECOMMENDATION, RECOMMENDATION_WHY, VENDORS, vendorBy, vendorsFor, type Flow } from "@/lib/payments/vendors";
import { chooseProvider } from "@/app/actions/payments";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Payment providers" };

const FLOWS: Flow[] = ["collect", "payout", "rewards"];

const FLOW_BLURB: Record<Flow, string> = {
  collect: "A handful of B2B invoices a month, from companies anywhere. What matters is that a finance department can pay it without an account, and that the receipt is a real invoice.",
  payout: "Named counterparties paid every month, in whatever country they live in. What matters is that their bank details are entered on the provider's page and their tax form is the provider's problem.",
  rewards: "High volume, small amounts, often to teenagers, often unbanked, anywhere on earth. What matters is that we never ask where the money should go — they choose for themselves.",
};

// The one page that says where the money goes.
//
// It holds a CHOICE and nothing else. API keys live in environment variables
// and are never readable from here — a console that could show a secret is a
// console that eventually leaks one. What this page can tell you is whether the
// key exists, which is the only thing anybody needs to know from a browser.
export default async function AdminPaymentsPage() {
  await requireSystemFor("/admin/payments");
  const [statuses, live] = await Promise.all([providerStatus(), Promise.resolve(liveVendors())]);
  const byFlow = new Map(statuses.map((s) => [s.flow, s]));

  return (
    <div className="max-w-4xl">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">Payment providers</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/admin/billing" className="text-cyan-300 hover:underline">Billing →</Link>
          <Link href="/admin/payouts" className="text-cyan-300 hover:underline">Payouts →</Link>
        </div>
      </div>
      <p className="mb-6 max-w-3xl text-sm text-muted">
        Cluster does not hold funds, touch a card number or store a bank account. Three flows of money run
        through providers who do, and this is where you choose which. Everything works today whichever way
        these are set — with nothing connected, staff paste payment links and record transfers by hand, using
        the same invoices and the same payout queue.
      </p>

      <div className="mb-6 rounded-2xl border border-cyan-400/25 bg-cyan-500/[0.05] p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-cyan-200">
          <Icon name="alert" size={15} /> Where the secrets live
        </div>
        <p className="mt-1 text-xs text-muted">
          API keys are environment variables, set in your hosting dashboard, and cannot be read or written from
          this page. The green ticks below mean &quot;that key exists&quot; — nothing here can show you its value.
          Setup, click by click and with no terminal, is in{" "}
          <code className="text-cyan-300">docs/PAYMENTS.md</code>.
        </p>
      </div>

      {FLOWS.map((flow) => {
        const s = byFlow.get(flow);
        const options = vendorsFor(flow);
        const recommended = vendorBy(RECOMMENDATION[flow]);
        return (
          <section key={flow} className="glass mb-6 p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-bold">{FLOW_LABEL[flow]}</h2>
              {s && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted">running on</span>
                  <b>{vendorBy(s.effective)?.name ?? s.effective}</b>
                  {s.mode && (
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                      s.mode === "production" ? "border-emerald-400/40 text-emerald-200" : "border-amber-400/40 text-amber-200"}`}>
                      {s.mode}
                    </span>
                  )}
                </div>
              )}
            </div>
            <p className="mt-1 text-sm text-muted">{FLOW_BLURB[flow]}</p>

            {s?.note && (
              <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                {s.note}
              </div>
            )}

            {recommended && (
              <div className="mt-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs">
                <b className="text-emerald-300">Our pick: {recommended.name}.</b>{" "}
                <span className="text-muted">{RECOMMENDATION_WHY[flow]}</span>
              </div>
            )}

            <form action={async (fd: FormData) => { "use server"; await chooseProvider(flow, fd); }}
              className="mt-4 flex flex-wrap items-end gap-2">
              <label className="text-[10px] uppercase tracking-widest text-muted">
                Use
                <select name="provider" defaultValue={s?.picked ?? RECOMMENDATION[flow]}
                  className="input-cosmic !py-1 mt-0.5 block w-64 text-xs">
                  {options.map((v) => (
                    <option key={v.key} value={v.key}>
                      {v.name}{live.includes(v.key) ? " ✓ connected" : v.wired ? " — keys not set" : " — no API, manual"}
                    </option>
                  ))}
                </select>
              </label>
              <button className="rounded-full bg-cyan-500/25 px-4 py-1.5 text-xs font-bold text-cyan-100">Save</button>
              <span className="pb-1.5 text-[10px] text-muted">
                Stored as <code>{SETTING_KEYS[flow]}</code>
              </span>
            </form>
          </section>
        );
      })}

      {/* ===== The research, kept as data so it can't go stale in a doc ===== */}
      <section className="glass p-6">
        <h2 className="font-bold">Every provider we looked at</h2>
        <p className="mt-1 text-sm text-muted">
          Written down so the next person doesn&apos;t redo the search — including the reasons not to use each
          one, which is the half a vendor comparison usually leaves out.
        </p>
        <div className="mt-4 space-y-3">
          {VENDORS.map((v) => (
            <details key={v.key} className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                <b>{v.name}</b>
                <span className="text-[11px] text-muted">{v.flows.map((f) => FLOW_LABEL[f]).join(" · ")}</span>
                {v.verdict === "recommended" && <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-200">our pick</span>}
                {live.includes(v.key) && <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-cyan-200">connected</span>}
                {v.wired && !live.includes(v.key) && <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">built, keys not set</span>}
                {!v.wired && <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">not integrated</span>}
              </summary>
              <div className="mt-3 space-y-2 text-xs">
                <p className="text-muted">{v.what}</p>
                <Row label="Reach" value={v.coverage} />
                <Row label="Cost" value={v.cost} />
                <Row label="To get started" value={v.onboarding} />
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-emerald-300">Why it works</div>
                  <ul className="mt-1 space-y-0.5">
                    {v.strengths.map((x) => <li key={x} className="text-muted">· {x}</li>)}
                  </ul>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-amber-300">What it costs you</div>
                  <ul className="mt-1 space-y-0.5">
                    {v.limits.map((x) => <li key={x} className="text-muted">· {x}</li>)}
                  </ul>
                </div>
                {v.env.length > 0 && (
                  <Row label="Environment variables" value={v.env.join(", ")} mono />
                )}
                {v.url && (
                  <a href={v.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-300 hover:underline">
                    Open {v.name} <Icon name="arrowRight" size={11} />
                  </a>
                )}
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={mono ? "font-mono text-[11px] text-cyan-300" : "text-muted"}>{value}</div>
    </div>
  );
}
