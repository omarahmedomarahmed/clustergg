"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <div className="glass p-8">
        <h1 className="text-2xl font-bold">Welcome back, <span className="grad-text">star traveler</span></h1>
        <p className="text-sm text-muted mt-1">Log in to your Cluster profile.</p>
        <form action={action} className="mt-6 space-y-4">
          <input name="email" type="email" required placeholder="Email" className="input-cosmic" autoComplete="email" />
          <input name="password" type="password" required placeholder="Password" className="input-cosmic" autoComplete="current-password" />
          {state?.error && <p className="text-sm text-rose-300">{state.error}</p>}
          <button disabled={pending} className="glow-btn w-full rounded-full py-2.5 font-semibold text-white">
            {pending ? "Igniting thrusters…" : "Log in"}
          </button>
        </form>
        <p className="mt-5 text-sm text-muted text-center">
          New here? <Link href="/signup" className="text-cyan-300 hover:underline">Join the Cluster</Link>
        </p>
        <p className="mt-3 text-xs text-muted/70 text-center">
          Demo mode: try <code className="text-cyan-300/80">nova@demo.gg</code> / <code className="text-cyan-300/80">cluster-demo</code>
          {" "}or admin <code className="text-amber-300/80">admin@clustergg.com</code> / <code className="text-amber-300/80">cluster-admin</code>
        </p>
      </div>
    </div>
  );
}
