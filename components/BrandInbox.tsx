"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { RefreshButton, useThread } from "@/components/ThreadRefresh";
import type { ThreadMessageView } from "@/lib/threads";

// The brand's conversation with their Cluster team — one component, both ends.
//
// Staff and the brand read the same rows, so they get the same component with
// the sides swapped. Two near-identical inboxes is how the two ends of a
// conversation quietly drift apart: one gets a refresh button, the other keeps
// the old markup, and the bug only shows up when somebody is waiting.

export default function BrandInbox({
  brandId, brandName, side, messages: initial, send, note,
}: {
  brandId: string;
  /** How the other side is named in the transcript. */
  brandName: string;
  side: "portal" | "admin";
  messages: ThreadMessageView[];
  /** A bound server action — `portalSendMessage` or `adminSendBrandMessage`. */
  send: (formData: FormData) => Promise<{ error?: string } | void>;
  note?: string;
}) {
  const thread = useThread("brand", brandId, side, initial);
  const messages = thread.messages;
  const formRef = useRef<HTMLFormElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);

  const mine = side === "admin" ? "admin" : "brand";

  return (
    <div className="glass overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 p-5">
        <h2 className="font-bold flex items-center gap-2">
          <Icon name="messages" size={16} className="text-cyan-300" />
          {side === "admin" ? `Shared inbox — ${brandName}` : "Message your Cluster team"}
        </h2>
        <RefreshButton onClick={thread.refresh} busy={thread.busy} at={thread.at} error={thread.error} />
      </div>

      {note && <p className="border-b border-white/10 px-5 py-3 text-xs leading-relaxed text-muted">{note}</p>}

      <div className="max-h-[24rem] space-y-3 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <p className="text-sm text-muted">
            {side === "admin"
              ? "Nothing yet. You can open the conversation from here."
              : "Nothing yet. Whatever you send goes straight to the people who run your campaigns."}
          </p>
        ) : messages.map((m) => {
          const own = m.sender === mine;
          return (
            <div key={m.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl border px-4 py-2.5 ${
                own ? "border-cyan-400/35 bg-cyan-500/10" : "border-white/12 bg-black/30"
              }`}>
                <div className="text-[10px] uppercase tracking-widest text-muted">
                  {m.sender === "admin" ? (side === "admin" ? "You (Cluster)" : "Cluster team") : (side === "admin" ? brandName : "You")}
                  {" · "}
                  {new Date(m.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form
        ref={formRef}
        action={(fd) => start(async () => {
          setError(null);
          const res = await send(fd);
          if (res && "error" in res && res.error) setError(res.error);
          else { formRef.current?.reset(); await thread.refresh(); }
        })}
        className="border-t border-white/10 p-4"
      >
        <textarea
          name="body" required rows={3} maxLength={2000}
          placeholder={side === "admin" ? "Reply to the brand…" : "Ask a question, request a change, tell us what you need…"}
          className="input-cosmic w-full resize-y"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-muted">
            {side === "admin"
              ? "Appears on their portal the next time they look."
              : "A real person reads this — there is no ticket queue in between."}
          </span>
          <button disabled={pending} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-bold disabled:opacity-60">
            {pending ? "Sending…" : "Send"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
      </form>
    </div>
  );
}
