"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4">
      <input name="email" type="email" required placeholder="Email" className="input-cosmic" autoComplete="email" />
      <input name="password" type="password" required placeholder="Password" className="input-cosmic" autoComplete="current-password" />
      {state?.error && <p className="text-sm text-rose-300">{state.error}</p>}
      <button disabled={pending} className="glow-btn w-full rounded-full py-2.5 font-semibold text-white">
        {pending ? "Igniting thrusters…" : "Log in with email"}
      </button>
    </form>
  );
}
