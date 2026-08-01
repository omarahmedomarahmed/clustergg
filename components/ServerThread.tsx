"use client";

import { useActionState, useEffect, useRef } from "react";
import Icon from "@/components/Icon";
import { replyToServer, type ReplyState } from "@/app/actions/server-messages";

// Staff answering a server owner.
//
// The reply goes out as a DM from the bot, so it is written here the way it
// will be read there: no ticket number, no signature, no "your request has been
// received". The owner sees a message from the bot they installed.
//
// Delivery is shown per message and never assumed. A reply that never reached
// Discord is an owner who thinks they were ignored — worse than not answering —
// so the failure is stated on the message itself rather than logged somewhere.

export type AdminThreadMessage = {
  id: string;
  sender: string;
  body: string;
  createdAt: string;
  source: string;
  delivered: boolean;
  deliveryError: string | null;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

const WHY: Record<string, string> = {
  dm_blocked: "their DMs are closed — they'll only see this on their dashboard",
  no_owner_on_record: "we don't have an owner Discord id for this server",
  bot_not_configured: "the bot isn't connected in this environment",
  error: "delivery failed",
};

export default function ServerThread({
  guildId, messages, ownerKnown,
}: {
  guildId: string;
  messages: AdminThreadMessage[];
  /** Whether we hold a Discord id to DM. */
  ownerKnown: boolean;
}) {
  const [state, reply, sending] = useActionState<ReplyState, FormData>(
    replyToServer.bind(null, guildId), null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) formRef.current?.reset(); }, [state]);

  return (
    <section id="messages" className="glass mb-6 overflow-hidden">
      <div className="border-b border-white/10 p-6">
        <h2 className="font-bold flex items-center gap-2">
          <Icon name="messages" size={16} className="text-cyan-300" /> Conversation with this owner
        </h2>
        <p className="mt-1 text-sm text-muted">
          Your reply is delivered as a DM from ClusterBot and appears on their dashboard.
          {!ownerKnown && " We have no owner Discord id for this server, so it will only appear on their dashboard."}
        </p>
      </div>

      <div className="max-h-96 space-y-3 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet. You can open the conversation from here.</p>
        ) : messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender === "admin" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl border px-4 py-2.5 ${
              m.sender === "admin" ? "border-cyan-400/35 bg-cyan-500/10" : "border-white/12 bg-black/30"
            }`}>
              <div className="text-[10px] uppercase tracking-widest text-muted">
                {m.sender === "admin" ? "Cluster" : "Owner"} · {when(m.createdAt)}
                {m.sender === "owner" && m.source === "discord" && " · from Discord"}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
              {m.sender === "admin" && (
                <div className={`mt-1 text-[10px] ${m.delivered ? "text-emerald-300/80" : "text-rose-300"}`}>
                  {m.delivered
                    ? "Delivered to their Discord DMs"
                    : `Not delivered — ${WHY[m.deliveryError ?? "error"] ?? WHY.error}`}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <form ref={formRef} action={reply} className="border-t border-white/10 p-4">
        <textarea
          name="body" required rows={3} maxLength={2000}
          placeholder="Write as the bot — this is what lands in their DMs."
          className="input-cosmic w-full resize-y"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted">Sent from ClusterBot, not from a person&apos;s account.</span>
          <button disabled={sending} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-bold disabled:opacity-60">
            {sending ? "Sending…" : "Send reply"}
          </button>
        </div>
        {state?.error && <p className="mt-2 text-xs text-rose-300">{state.error}</p>}
        {state?.ok && <p className="mt-2 text-xs text-emerald-300">{state.ok}</p>}
      </form>
    </section>
  );
}
