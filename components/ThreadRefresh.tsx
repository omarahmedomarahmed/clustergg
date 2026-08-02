"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { refreshThread } from "@/app/actions/threads";
import type { ThreadKind, ThreadMessageView, ThreadSide } from "@/lib/threads";

// The refresh that reloads a conversation and nothing else.
//
// Every message box in the product had exactly one way to show a new message:
// reload the page. On the brand portal that is forty queries, a chart rebuild
// and a lost scroll position to find out whether one row appeared. So the
// thread keeps its own copy of the messages, seeded by the server render, and
// a button swaps that copy for a fresh one.
//
// Server props still win. When the page DOES re-render — after sending, which
// revalidates — the new props replace whatever the button had fetched, so the
// two paths can never disagree about what the thread contains.

export function useThread(
  kind: ThreadKind, id: string, side: ThreadSide, initial: ThreadMessageView[],
) {
  const [messages, setMessages] = useState<ThreadMessageView[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState<number | null>(null);

  // Identity comparison, not length: a page re-render after a send hands us a
  // brand-new array, and that array is the truth from here on.
  const seeded = useRef(initial);
  useEffect(() => {
    if (initial !== seeded.current) {
      seeded.current = initial;
      setMessages(initial);
      setAt(null);
    }
  }, [initial]);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await refreshThread(kind, id, side);
      if (res.ok) { setMessages(res.messages); setAt(Date.now()); }
      else setError(res.error);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }, [kind, id, side]);

  return { messages, refresh, busy, error, at };
}

/**
 * The button itself.
 *
 * It says when it last looked, because "I pressed refresh and nothing changed"
 * and "I pressed refresh and nothing happened" are different problems and a
 * spinner that flashes for 200ms cannot tell them apart.
 */
export function RefreshButton({ onClick, busy, at, error, className = "" }: {
  onClick: () => void;
  busy: boolean;
  /** When the last successful load finished. */
  at?: number | null;
  error?: string | null;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {error
        ? <span className="text-[11px] text-rose-300">{error}</span>
        : at
          ? <span className="text-[11px] text-muted">Updated {new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          : null}
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        title="Reload just this conversation"
        aria-label="Refresh messages"
        className="ghost-btn pressable inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold disabled:opacity-60"
      >
        <Icon name="refresh" size={12} className={busy ? "animate-spin" : ""} />
        {busy ? "Checking…" : "Refresh"}
      </button>
    </span>
  );
}
