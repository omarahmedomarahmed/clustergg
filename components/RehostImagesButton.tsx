"use client";

import { useActionState } from "react";
import { rehostAllImagesNow, type ActionState } from "@/app/actions/admin";
import Icon from "@/components/Icon";

// One-click: re-host every Higgsfield/cloudfront + inline image to Vercel Blob.
export default function RehostImagesButton() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    async () => rehostAllImagesNow(), undefined,
  );
  return (
    <form action={action} className="flex items-center gap-3">
      <button disabled={pending} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-50">
        <Icon name="satellite" size={14} className={pending ? "animate-spin" : ""} /> {pending ? "Re-hosting…" : "Re-host all → Blob"}
      </button>
      {state?.ok && <span className="text-xs text-emerald-300">✓ {state.message} — reload to see updated sources.</span>}
      {state?.error && <span className="text-xs text-rose-300">{state.error}</span>}
    </form>
  );
}
