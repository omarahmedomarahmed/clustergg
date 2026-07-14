"use client";

import Link from "next/link";
import { useActionState } from "react";
import { register } from "@/app/actions/auth";

export default function SignupForm() {
  const [state, action, pending] = useActionState(register, undefined);
  return (
    <>
      <form action={action} className="space-y-4">
        <input name="displayName" required placeholder="Display name (e.g. Nova)" className="input-cosmic" />
        <input name="email" type="email" required placeholder="Email" className="input-cosmic" autoComplete="email" />
        <input name="password" type="password" required minLength={8} placeholder="Password (8+ characters)" className="input-cosmic" autoComplete="new-password" />
        {state?.error && <p className="text-sm text-rose-300">{state.error}</p>}
        <button disabled={pending} className="glow-btn w-full rounded-full py-2.5 font-semibold text-white">
          {pending ? "Forging your star…" : "Create profile with email"}
        </button>
      </form>
      <p className="mt-4 text-xs text-muted/80">
        By joining you agree to the <Link href="/legal/terms" className="underline">Terms</Link> and{" "}
        <Link href="/legal/privacy" className="underline">Privacy Policy</Link>.
      </p>
    </>
  );
}
