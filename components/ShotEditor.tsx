"use client";

import { useActionState, useState } from "react";
import ImageUpload from "@/components/ImageUpload";
import Icon from "@/components/Icon";
import { saveFeatureShot, type ShotActionState } from "@/app/actions/shots";

export type EditableShot = {
  key: string;
  imageUrl: string | null;
  altText: string;
  caption: string;
  claim: string;
  capturedFrom: string | null;
  capturedAt: string | null;
};

/**
 * One shot's editor: the picture, and the words under it.
 *
 * Both, always. The screenshot is the evidence and the caption is the claim it
 * supports, and an admin who can only replace the picture is left unable to fix
 * a page whose wording went stale — which happens more often than the
 * screenshot going stale does.
 *
 * Deliberately usable on a shot that has never been captured: a blank row is
 * still editable, so an admin can upload their own image for any slot on the
 * site without waiting for a capture run. That includes slots whose captured
 * version has no art in it — a card rendered before its logos existed is still
 * a real screenshot of a real screen, and replacing it later is one upload.
 */
export default function ShotEditor({ shot, defaultOpen = false }: { shot: EditableShot; defaultOpen?: boolean }) {
  const [state, formAction, pending] = useActionState<ShotActionState, FormData>(saveFeatureShot, undefined);
  const [open, setOpen] = useState(defaultOpen);
  const [imageUrl, setImageUrl] = useState(shot.imageUrl ?? "");

  return (
    <div className="rounded-2xl border border-violet-400/15 bg-black/20 overflow-hidden" id={`shot-${shot.key}`}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left">
        <div className="h-12 w-20 shrink-0 overflow-hidden rounded-lg border border-violet-400/20 bg-black/40">
          {shot.imageUrl
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={shot.imageUrl} alt="" className="h-full w-full object-cover object-top" />
            : <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-widest text-muted">none</div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] text-cyan-300 truncate">{shot.key}</div>
          <div className="text-xs text-muted truncate">{shot.claim || "No claim recorded"}</div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${shot.imageUrl ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
          {shot.imageUrl ? "captured" : "pending"}
        </span>
        <Icon name={open ? "chevronDown" : "chevronRight"} size={15} className="text-muted shrink-0" />
      </button>

      {open && (
        <form action={formAction} className="border-t border-violet-400/10 p-4 space-y-4">
          <input type="hidden" name="key" value={shot.key} />

          <div>
            <div className="text-xs font-semibold mb-1">Screenshot</div>
            <p className="text-[11px] text-muted mb-2">
              Replacing this changes it on <b className="text-ink">every page that claims this component</b>, not just one.
              Clearing it puts the labelled placeholder back, which is the honest state when the screen it showed no longer exists.
            </p>
            <ImageUpload name="imageUrl" value={imageUrl} onChange={setImageUrl}
              aspect="16/9" maxDim={1600} scope="content"
              hint="A real screenshot of the real screen. Wide crops read best." />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold">Caption</span>
              <p className="text-[11px] text-muted">Printed under the image, on the page.</p>
              <input name="caption" defaultValue={shot.caption} maxLength={200}
                className="mt-1 w-full rounded-lg border border-violet-400/20 bg-black/30 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold">Alt text</span>
              <p className="text-[11px] text-muted">Read aloud by a screen reader. It is a claim too.</p>
              <input name="altText" defaultValue={shot.altText} maxLength={200}
                className="mt-1 w-full rounded-lg border border-violet-400/20 bg-black/30 px-3 py-2 text-sm" />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold">What this proves</span>
            <p className="text-[11px] text-muted">Internal only — the marketing claim this screenshot is evidence for.</p>
            <input name="claim" defaultValue={shot.claim} maxLength={200}
              className="mt-1 w-full rounded-lg border border-violet-400/20 bg-black/30 px-3 py-2 text-sm" />
          </label>

          <label className="block">
            <span className="text-xs font-semibold">Captured from</span>
            <p className="text-[11px] text-muted">The route it was taken on, so it can be re-shot without guessing.</p>
            <input name="capturedFrom" defaultValue={shot.capturedFrom ?? ""} maxLength={300}
              className="mt-1 w-full rounded-lg border border-violet-400/20 bg-black/30 px-3 py-2 text-sm font-mono text-[12px]" />
          </label>

          <div className="flex items-center gap-3">
            <button disabled={pending} className="glow-btn rounded-full px-5 py-2 text-sm font-semibold text-white">
              {pending ? "Saving…" : "Save"}
            </button>
            {state?.ok && <span className="text-xs text-emerald-300">{state.message}</span>}
            {state?.error && <span className="text-xs text-rose-300">{state.error}</span>}
            {shot.capturedAt && <span className="text-[11px] text-muted ml-auto">Captured {shot.capturedAt}</span>}
          </div>
        </form>
      )}
    </div>
  );
}
