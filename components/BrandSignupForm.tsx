"use client";

import Link from "next/link";
import { useActionState } from "react";
import Icon from "@/components/Icon";
import { createBrandAccount, type SignupState } from "@/app/actions/brand-signup";

// Four fields. B90.1.
//
// Two of them are required and two are not, and that ratio is the whole design:
// every extra box on a signup form is a reason to close the tab, and everything
// we actually need — what they want to run, on which games, for how long — is a
// better question to ask inside the product where they can see the prices.
//
// The key is shown ON THE PAGE as well as emailed. Email is not configured on
// every deployment and providers have bad days; a signup whose only output is
// an email is one that silently dead-ends. It is shown once, said to be shown
// once, and the portal link beside it is the thing to click.

const INDUSTRIES = [
  "games", "energy drinks", "hardware", "apparel", "esports", "fintech", "food", "other",
];

export default function BrandSignupForm() {
  const [state, act, busy] = useActionState<SignupState | undefined, FormData>(createBrandAccount, undefined);

  if (state?.ok && state.key) {
    return (
      <div className="glass border border-emerald-400/30 bg-emerald-500/[0.06] p-6">
        <div className="flex items-center gap-2 text-lg font-black text-emerald-200">
          <Icon name="check" size={18} /> {state.brand} is on Cluster
        </div>
        <p className="mt-2 text-sm text-muted">
          This key opens your portal. It is shown <b className="text-ink">once</b> — save it now.
          {state.emailed
            ? " We have emailed you a copy too."
            : " We could not email a copy, so this is the only place it exists."}
        </p>
        <div className="mt-4 rounded-xl border border-white/12 bg-black/40 px-4 py-3 font-mono text-lg tracking-widest text-cyan-200">
          {state.key}
        </div>
        <Link
          href={state.portalUrl ?? "/brands"}
          className="money-btn pressable mt-4 inline-block rounded-full px-6 py-2.5 text-sm font-semibold text-white"
        >
          Open your portal
        </Link>
        {/* Said here rather than discovered later. A brand that builds a
            campaign and finds out at checkout that the account was never
            approved has been wasting its own time with our encouragement. */}
        <p className="mt-4 text-[11px] leading-relaxed text-muted">
          You can build a campaign straight away. Before anything of yours runs on the network a person
          here checks the account — normally within one business day. Nothing is charged until you
          approve a bill.
        </p>
      </div>
    );
  }

  return (
    <form action={act} className="glass p-6">
      <h2 className="font-bold">Open a brand account</h2>
      <p className="mt-1 text-sm text-muted">
        Two boxes and you are in. You can look at the network, build a campaign and see what it costs
        before you talk to anybody.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-muted">Company</span>
          <input name="company" required maxLength={160} placeholder="Nova Drinks"
            className="input-cosmic mt-1 block w-full" />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-muted">Work email</span>
          <input name="email" type="email" required maxLength={200} placeholder="you@novadrinks.com"
            className="input-cosmic mt-1 block w-full" />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-muted">Website <span className="normal-case tracking-normal">(optional)</span></span>
          <input name="website" maxLength={300} placeholder="novadrinks.com"
            className="input-cosmic mt-1 block w-full" />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-muted">Industry <span className="normal-case tracking-normal">(optional)</span></span>
          <select name="industry" defaultValue="other" className="input-cosmic mt-1 block w-full">
            {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </label>
      </div>

      {/* Off-screen, never shown, never focusable by a person. */}
      <input name="website_url" tabIndex={-1} autoComplete="off" aria-hidden
        className="absolute left-[-9999px] h-0 w-0 opacity-0" />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button disabled={busy}
          className="money-btn pressable rounded-full px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Opening…" : "Open the account"}
        </button>
        <span className="text-[11px] text-muted">
          Rather talk first? <Link href="/pricing" className="text-cyan-300 hover:underline">See the rate card</Link>.
        </span>
      </div>

      {state?.error && (
        <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-rose-300">
          <Icon name="alert" size={13} className="mt-0.5 shrink-0" /> <span>{state.error}</span>
        </p>
      )}
    </form>
  );
}
