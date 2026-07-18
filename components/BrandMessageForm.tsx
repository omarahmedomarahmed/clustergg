"use client";

import { useRef, useState, useTransition } from "react";
import { portalSendMessage } from "@/app/actions/brand-portal";

// Brand-side send box for the shared inbox (key-validated server-side).
export default function BrandMessageForm({ brandId, keyStr }: { brandId: string; keyStr: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <form ref={ref} onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      start(async () => { const r = await portalSendMessage(brandId, keyStr, fd); setErr(r?.error ?? null); if (!r?.error) ref.current?.reset(); });
    }} className="flex gap-2 mb-1">
      <input name="body" placeholder="Ask a question, request a change…" className="input-cosmic flex-1" />
      <button disabled={pending} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">Send</button>
      {err && <span className="text-xs text-rose-300 self-center">{err}</span>}
    </form>
  );
}
