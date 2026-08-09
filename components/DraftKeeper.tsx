"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { saveFormDraft, readFormDraft, discardFormDraft } from "@/app/actions/drafts";
import type { DraftOwner } from "@/lib/form-drafts";

// Keeps what you were building. B91.8.
//
// ===== IT OFFERS, IT DOES NOT RESTORE =====
//
// A saved draft is shown as an OFFER — "you were building this on Tuesday,
// pick it up?" — and nothing is filled in until the person says yes. Silently
// repopulating a form is worse than losing it: somebody who came back to start
// fresh now has to work out which of the fields in front of them are theirs
// from today and which are from a session they had abandoned on purpose.
//
// ===== IT SAVES ON A TIMER, NOT ON EVERY KEYSTROKE =====
//
// Debounced, and only when something actually changed. A form that posts on
// every character is a form that posts a few hundred times while somebody
// writes a description, and the last one to land wins — which on a slow
// connection is not the last one they typed.
//
// ===== IT IS NEVER LOAD-BEARING =====
//
// Every failure here is silent and harmless: the person still has the form in
// front of them. Nothing about saving progress is allowed to interrupt, block
// or fail the thing being built.

const SAVE_AFTER_MS = 1500;

export default function DraftKeeper({
  ownerType, ownerId, formKey, values, onRestore, label,
}: {
  ownerType: DraftOwner;
  ownerId: string;
  formKey: string;
  /** Whatever the form currently holds. Serialisable. */
  values: Record<string, unknown>;
  /** Called with a saved payload when the person chooses to pick it up. */
  onRestore: (payload: Record<string, unknown>) => void;
  label?: string;
}) {
  const [offer, setOffer] = useState<{ payload: Record<string, unknown>; at: string } | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const lastSent = useRef<string>("");
  const restored = useRef(false);

  // Look once, on mount. A draft that appears halfway through typing is a
  // dialog interrupting the thing it exists to protect.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await readFormDraft(ownerType, ownerId, formKey);
        if (alive && d && Object.keys(d.payload ?? {}).length) {
          setOffer({ payload: d.payload, at: d.updatedAt });
        }
      } catch { /* no draft is the normal case */ }
    })();
    return () => { alive = false; };
  }, [ownerType, ownerId, formKey]);

  useEffect(() => {
    let json = "";
    try { json = JSON.stringify(values ?? {}); } catch { return; }
    if (json === lastSent.current) return;
    // Do not save an untouched empty form. Every visitor who opens the builder
    // and leaves would otherwise become a row in the sales list.
    if (json === "{}" || json.length < 8) return;

    const t = setTimeout(async () => {
      try {
        const res = await saveFormDraft(ownerType, ownerId, formKey, values, label);
        if (res.ok) {
          lastSent.current = json;
          setSavedAt(new Date().toISOString());
        }
      } catch { /* silent by design */ }
    }, SAVE_AFTER_MS);
    return () => clearTimeout(t);
  }, [values, ownerType, ownerId, formKey, label]);

  if (offer && !restored.current) {
    const when = new Date(offer.at).toLocaleString("en-US", {
      weekday: "long", hour: "numeric", minute: "2-digit",
    });
    return (
      <div className="glass mb-4 flex flex-wrap items-center gap-3 border border-cyan-400/30 bg-cyan-500/[0.06] p-4">
        <Icon name="clock" size={16} className="shrink-0 text-cyan-300" />
        <span className="text-sm">
          You were building this on <b>{when}</b>. Pick it up where you left off?
        </span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => { restored.current = true; onRestore(offer.payload); setOffer(null); }}
            className="money-btn pressable rounded-full px-4 py-1.5 text-xs font-semibold text-white"
          >
            Pick it up
          </button>
          <button
            type="button"
            onClick={() => {
              setOffer(null);
              void discardFormDraft(ownerType, ownerId, formKey).catch(() => {});
            }}
            className="ghost-btn pressable rounded-full px-4 py-1.5 text-xs"
          >
            Start fresh
          </button>
        </div>
      </div>
    );
  }

  if (!savedAt) return null;
  return (
    <p className="mb-3 flex items-center gap-1.5 text-[11px] text-muted">
      <Icon name="check" size={11} className="text-emerald-300" />
      Saved as you type — you can close this and come back.
    </p>
  );
}
