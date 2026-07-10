"use client";

import Link from "next/link";
import { useActionState } from "react";
import { register } from "@/app/actions/auth";

export default function SignupPage() {
  const [state, action, pending] = useActionState(register, undefined);
  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <div className="glass p-8">
        <h1 className="text-2xl font-bold">Claim your <span className="grad-text">cosmic profile</span></h1>
        <p className="text-sm text-muted mt-1">
          One profile for every game you play. Free forever.
        </p>
        <form action={action} className="mt-6 space-y-4">
          <input name="displayName" required placeholder="Display name (e.g. Nova)" className="input-cosmic" />
          <input name="email" type="email" required placeholder="Email" className="input-cosmic" autoComplete="email" />
          <input name="password" type="password" required minLength={8} placeholder="Password (8+ characters)" className="input-cosmic" autoComplete="new-password" />
          {state?.error && <p className="text-sm text-rose-300">{state.error}</p>}
          <button disabled={pending} className="glow-btn w-full rounded-full py-2.5 font-semibold text-white">
            {pending ? "Forging your star…" : "Create profile"}
          </button>
        </form>
        <p className="mt-4 text-xs text-muted/80">
          By joining you agree to the <Link href="/legal/terms" className="underline">Terms</Link> and{" "}
          <Link href="/legal/privacy" className="underline">Privacy Policy</Link>.
        </p>
        <p className="mt-4 text-sm text-muted text-center">
          Already aboard? <Link href="/login" className="text-cyan-300 hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  );
}
