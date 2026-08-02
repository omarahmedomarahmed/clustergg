"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshButton } from "@/components/ThreadRefresh";
import { timeAgo } from "@/lib/utils";

type Msg = { id: string; senderId: string; body: string; createdAt: string };

// Polls for new messages every 4s — lightweight realtime without a WS service.
//
// The manual refresh is not redundant with the poll: browsers throttle timers in
// a background tab to once a minute or stop them altogether, so a thread left
// open in another tab can be a minute stale the moment you look back at it. The
// button is the answer to "is it loading, or is there nothing new?".
export default function MessageThread({ conversationId, viewerId }: { conversationId: string; viewerId: string }) {
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const countRef = useRef(0);
  const firstRef = useRef(true);
  const aliveRef = useRef(true);

  const load = useCallback(async (manual = false) => {
    if (manual) { setBusy(true); setError(null); }
    try {
      const r = await fetch(`/api/messages/${conversationId}`);
      const d = r.ok ? await r.json() : null;
      if (!aliveRef.current) return;
      if (!d) { if (manual) setError("Couldn't load."); return; }
      const el = scrollRef.current;
      // Only keep pinned to the newest message if the reader is ALREADY at the
      // bottom — never yank the whole page or interrupt reading history. We
      // scroll the thread container itself (scrollTop), not the window.
      const nearBottom = el ? el.scrollHeight - el.scrollTop - el.clientHeight < 120 : true;
      const grew = d.messages.length !== countRef.current;
      countRef.current = d.messages.length;
      setMessages(d.messages);
      if (manual) setAt(Date.now());
      if (el && grew && (firstRef.current || nearBottom)) {
        const jump = firstRef.current;
        firstRef.current = false;
        requestAnimationFrame(() => { el.scrollTo({ top: el.scrollHeight, behavior: jump ? "auto" : "smooth" }); });
      }
    } catch {
      if (manual && aliveRef.current) setError("Couldn't reach the server.");
    } finally {
      if (manual && aliveRef.current) setBusy(false);
    }
  }, [conversationId]);

  useEffect(() => {
    aliveRef.current = true;
    load();
    const t = setInterval(() => load(), 4000);
    return () => { aliveRef.current = false; clearInterval(t); };
  }, [load]);

  return (
    <div ref={scrollRef} className="glass flex-1 overflow-y-auto overscroll-contain p-4 space-y-3" style={{ maxHeight: "55vh", minHeight: "300px" }}>
      <div className="sticky top-0 z-10 -mt-1 flex justify-end">
        <RefreshButton onClick={() => load(true)} busy={busy} at={at} error={error} />
      </div>
      {!messages && <div className="text-center text-muted text-sm py-10">Opening channel…</div>}
      {messages?.length === 0 && <div className="text-center text-muted text-sm py-10">Say hi across the void.</div>}
      {messages?.map((m) => {
        const mine = m.senderId === viewerId;
        return (
          <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                mine
                  ? "bg-gradient-to-r from-violet-600/80 to-cyan-600/70 text-white"
                  : "border border-violet-400/20 bg-white/[0.04]"
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <div className={`text-[10px] mt-1 ${mine ? "text-white/60" : "text-muted"}`}>{timeAgo(m.createdAt)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
