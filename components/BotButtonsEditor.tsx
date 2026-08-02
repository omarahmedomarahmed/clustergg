"use client";

import { useActionState, useState } from "react";
import { saveBotButtons, type CardActionState } from "@/app/actions/cards";
import type { BotButton, ButtonCopy } from "@/lib/discord/buttons";

// The buttons under this card, as editable copy.
//
// A card is half the reply. The other half is the row of buttons beneath it,
// which is the entire navigation surface of the product inside Discord — and
// until now the only way to change one word of it was a deploy.
//
// Shown per card so an admin edits in context, saved globally because that is
// what they are: "Connect a game" is one button that appears under a dozen
// cards, and four different wordings for it in four places is how one bot
// starts feeling like four. The panel says so rather than pretending otherwise.

export default function BotButtonsEditor({ kind, buttons, copy }: {
  kind: string;
  /** The buttons this card kind actually carries. */
  buttons: BotButton[];
  /** What's been changed from the defaults, across the whole bot. */
  copy: ButtonCopy;
}) {
  const [state, save, saving] = useActionState<CardActionState, FormData>(saveBotButtons, undefined);
  const [draft, setDraft] = useState<ButtonCopy>(copy);
  const [open, setOpen] = useState(false);

  const edit = (key: string, patch: Partial<{ label: string; emoji: string; hidden: boolean }>) =>
    setDraft((d) => ({ ...d, [key]: { ...d[key], ...patch } }));

  const changed = buttons.filter((b) => {
    const e = draft[b.key];
    return !!e && (!!e.label || !!e.emoji || e.hidden);
  }).length;

  return (
    <form action={save} className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <input type="hidden" name="kind" value={kind} />

      <button
        type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="text-sm font-semibold text-ink">The buttons under this card</span>
          <span className="ml-2 text-[11px] text-muted">
            {buttons.length} button{buttons.length === 1 ? "" : "s"}
            {changed > 0 && <span className="text-cyan-300"> · {changed} reworded</span>}
          </span>
        </span>
        <span className="text-[11px] text-muted">{open ? "Close" : "Edit wording"}</span>
      </button>

      {!open && (
        // Closed, it is still worth something: the row of buttons this card
        // posts with, in order, as they currently read.
        <div className="mt-3 flex flex-wrap gap-1.5">
          {buttons.map((b) => {
            const e = draft[b.key] ?? {};
            if (e.hidden) return null;
            return (
              <span key={b.key} className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-ink">
                {e.emoji || b.emoji} {e.label || b.label}
              </span>
            );
          })}
        </div>
      )}

      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] leading-snug text-muted">
            These are shared: a button appears under several cards and carries one wording everywhere.
            Leave a box empty to keep the default. Unticking a button takes it off every card it
            appears on — the destination is still reachable from <b className="text-ink">More</b>.
          </p>
          {buttons.map((b) => {
            const e = draft[b.key] ?? {};
            return (
              <div key={b.key} className="rounded-lg border border-white/10 p-2.5">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox" name={`btn.${b.key}.hidden`}
                    checked={!!e.hidden} className="accent-cyan-500 shrink-0"
                    title={e.hidden ? "Hidden — tick to show it" : "Shown — untick to hide it"}
                    onChange={(ev) => edit(b.key, { hidden: ev.target.checked })}
                  />
                  <span className={`text-xs font-semibold ${e.hidden ? "text-muted line-through" : "text-ink"}`}>
                    {b.emoji} {b.label}
                  </span>
                </div>
                <p className="mt-1 text-[10px] leading-snug text-muted">{b.note}</p>
                <div className="mt-2 grid grid-cols-[1fr_5rem] gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[10px] text-muted">Say instead</span>
                    <input
                      type="text" name={`btn.${b.key}.label`} value={e.label ?? ""} maxLength={80}
                      placeholder={b.label}
                      onChange={(ev) => edit(b.key, { label: ev.target.value })}
                      className="input-cosmic w-full px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] text-muted">Icon</span>
                    <input
                      type="text" name={`btn.${b.key}.emoji`} value={e.emoji ?? ""} maxLength={8}
                      placeholder={b.emoji ?? "—"}
                      onChange={(ev) => edit(b.key, { emoji: ev.target.value })}
                      className="input-cosmic w-full px-2 py-1 text-center text-xs"
                    />
                  </label>
                </div>
              </div>
            );
          })}

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={saving} className="cta-btn pressable rounded-full px-5 py-1.5 text-xs disabled:opacity-60">
              {saving ? "Saving…" : "Save button wording"}
            </button>
            {state?.ok && <span className="text-[11px] text-emerald-300">{state.ok}</span>}
            {state?.error && <span className="text-[11px] text-rose-300">{state.error}</span>}
          </div>
        </div>
      )}
    </form>
  );
}
