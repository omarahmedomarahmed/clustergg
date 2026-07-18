"use client";

import { useEffect, useRef, useState } from "react";
import { timeAgo } from "@/lib/utils";

type Msg = { id: string; senderId: string; body: string; createdAt: string };

// Polls for new messages every 4s — lightweight realtime without a WS service.
export default function MessageThread({ conversationId, viewerId }: { conversationId: string; viewerId: string }) {
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const countRef = useRef(0);
  const firstRef = useRef(true);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/messages/${conversationId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!alive || !d) return;
          const el = scrollRef.current;
          // Only keep pinned to the newest message if the reader is ALREADY at the
          // bottom — never yank the whole page or interrupt reading history. We
          // scroll the thread container itself (scrollTop), not the window.
          const nearBottom = el ? el.scrollHeight - el.scrollTop - el.clientHeight < 120 : true;
          const grew = d.messages.length !== countRef.current;
          countRef.current = d.messages.length;
          setMessages(d.messages);
          if (el && grew && (firstRef.current || nearBottom)) {
            const jump = firstRef.current;
            firstRef.current = false;
            requestAnimationFrame(() => { el.scrollTo({ top: el.scrollHeight, behavior: jump ? "auto" : "smooth" }); });
          }
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [conversationId]);

  return (
    <div ref={scrollRef} className="glass flex-1 overflow-y-auto overscroll-contain p-4 space-y-3" style={{ maxHeight: "55vh", minHeight: "300px" }}>
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
