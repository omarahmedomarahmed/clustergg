"use client";

import { useActionState, useState } from "react";
import Icon from "@/components/Icon";
import { requestEmailCode, confirmEmailCode, type OnboardState } from "@/app/actions/onboarding";

// Confirm your email, without leaving the page. B93.
//
// Two forms, one after the other, and which one is showing depends on whether a
// code has been sent — not on a route. Sending somebody to a separate page to
// type six digits is how a signup loses the people who close the tab.
//
// If we already have an address (Discord gave us one at sign-in) the code has
// already been sent and this opens on "check your inbox", with the address on
// screen so a typo is visible rather than mysterious.

export default function EmailStep({ email, masked, done, alreadySent }: {
  /** What we have on file, if anything. Never rendered — see `masked`. */
  email: string | null;
  /**
   * The same address with most of it taken out. B98.
   *
   * THE PAGE SHOWS THIS ONE. It is enough to recognise the inbox — "yes, that's
   * my gmail" — and not enough to read an address off a shared screen or a
   * screenshot posted in a Discord channel. The full value stays in the input
   * they typed it into, where they can already see it.
   */
  masked: string;
  done: boolean;
  /** A code went out at sign-in because we already had the address. */
  alreadySent: boolean;
}) {
  const [sendState, send, sending] = useActionState<OnboardState | undefined, FormData>(requestEmailCode, undefined);
  const [checkState, check, checking] = useActionState<OnboardState | undefined, FormData>(confirmEmailCode, undefined);
  const [typed, setTyped] = useState(email ?? "");

  // Once they have typed an address themselves it is on their own screen
  // already, so masking what they just sent to would be theatre.
  const sentTo = sendState?.sentTo ?? (alreadySent ? masked : null);
  const waiting = !!sentTo;

  if (done) {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-300">
        <Icon name="check" size={15} /> {masked} — confirmed.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <form action={send} className="flex flex-wrap items-end gap-2">
        <label className="min-w-[16rem] flex-1 text-[10px] uppercase tracking-widest text-muted">
          Your email
          <input
            name="email" type="email" required value={typed} autoComplete="email"
            onChange={(e) => setTyped(e.target.value)}
            placeholder="you@example.com"
            className="input-cosmic mt-1 block w-full text-sm"
          />
        </label>
        <button
          disabled={sending}
          className="ghost-btn pressable mb-0.5 rounded-full px-5 py-2 text-sm disabled:opacity-50"
        >
          {sending ? "Sending…" : waiting ? "Send it again" : "Send me a code"}
        </button>
      </form>

      {sendState?.error && (
        <p className="flex items-start gap-1.5 text-xs text-rose-300">
          <Icon name="alert" size={13} className="mt-0.5 shrink-0" /> <span>{sendState.error}</span>
        </p>
      )}

      {waiting && (
        <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/[0.06] p-4">
          <p className="text-sm">
            Check <b>{sentTo}</b> — we sent a six-digit code. It works for 20 minutes.
          </p>

          {/* Only ever present when this deployment cannot send mail at all.
              A local copy of the product has to be usable past step two. */}
          {sendState?.demoCode && (
            <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              Mail is not switched on here, so the code is{" "}
              <b className="font-mono tracking-widest">{sendState.demoCode}</b>.
            </p>
          )}

          <form action={check} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-[10px] uppercase tracking-widest text-muted">
              The code
              <input
                name="code" inputMode="numeric" autoComplete="one-time-code"
                maxLength={6} placeholder="000000" required
                className="input-cosmic mt-1 block w-36 text-center font-mono text-lg tracking-[0.3em]"
              />
            </label>
            <button
              disabled={checking}
              className="money-btn pressable mb-0.5 rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {checking ? "Checking…" : "Confirm"}
            </button>
          </form>

          {checkState?.error && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-300">
              <Icon name="alert" size={13} className="mt-0.5 shrink-0" /> <span>{checkState.error}</span>
            </p>
          )}
          {checkState?.ok && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-300">
              <Icon name="check" size={13} /> {checkState.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
