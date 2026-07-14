"use client";

import { useActionState, useState } from "react";
import { adminResetPassword, type ActionState } from "@/app/actions/admin";
import Icon from "@/components/Icon";

// Admin/staff sets a new password for a user who lost access. The admin can type
// one or generate a strong temp password to relay to the user.
export default function AdminPasswordReset({ userId }: { userId: string }) {
  const action = adminResetPassword.bind(null, userId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);
  const [pw, setPw] = useState("");

  const generate = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let out = "";
    const rnd = crypto.getRandomValues(new Uint32Array(14));
    for (let i = 0; i < 14; i++) out += chars[rnd[i] % chars.length];
    setPw(out);
  };

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input
        name="password" value={pw} onChange={(e) => setPw(e.target.value)}
        type="text" minLength={8} required placeholder="New password (8+ chars)"
        className="input-cosmic !py-1.5 flex-1 min-w-[180px] font-mono text-sm"
      />
      <button type="button" onClick={generate} className="ghost-btn rounded-full px-3 py-1.5 text-xs inline-flex items-center gap-1.5">
        <Icon name="spark" size={12} /> Generate
      </button>
      <button disabled={pending} className="glow-btn rounded-full px-4 py-1.5 text-sm font-semibold text-white">
        {pending ? "Setting…" : "Set password"}
      </button>
      {state?.error && <span className="text-xs text-rose-300 w-full">{state.error}</span>}
      {state?.ok && <span className="text-xs text-emerald-300 w-full">✓ {state.message}</span>}
    </form>
  );
}
