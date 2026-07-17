"use client";

import { useActionState } from "react";
import { savePageBackgrounds, type ActionState } from "@/app/actions/admin";
import ImageUpload from "@/components/ImageUpload";
import { PAGE_BG_PAGES } from "@/lib/page-bg";

// One combined form: an image picker per editable page. Empty = default nebula.
export default function PageBackgroundsEditor({ current }: { current: Record<string, string> }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(savePageBackgrounds, undefined);

  return (
    <form action={formAction}>
      <div className="grid sm:grid-cols-2 gap-4">
        {PAGE_BG_PAGES.map((p) => (
          <div key={p.key} className="rounded-2xl border border-violet-400/15 bg-black/20 p-4">
            <div className="font-semibold text-sm">{p.label}</div>
            <div className="text-[11px] text-muted mb-3">{p.note}</div>
            <ImageUpload name={`bg__${p.key}`} defaultValue={current[p.key] || ""}
              aspect="16/9" maxDim={1920} scope="content"
              hint="Wide space art. Sits behind the page under a dark veil for readability." />
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-3">
        <button disabled={pending} className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">
          {pending ? "Saving…" : "Save backgrounds"}
        </button>
        {state?.ok && <span className="text-xs text-emerald-300">✓ {state.message}</span>}
        {state?.error && <span className="text-xs text-rose-300">{state.error}</span>}
      </div>
    </form>
  );
}
