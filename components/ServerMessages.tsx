"use client";

import { useActionState, useEffect, useRef } from "react";
import Icon from "@/components/Icon";
import { portalSendMessage, type PortalActionState } from "@/app/actions/server-portal";

// The owner's conversation with Cluster.
//
// To them this is one thread with the bot they installed: they write here or in
// Discord, and the answer arrives as a DM from the same bot. So it is styled as
// a conversation and not a ticket form — a support queue with reference numbers
// would make a one-person server feel like it is filing a complaint.
//
// It says plainly where the reply will arrive, because the most common way a
// support thread fails is somebody waiting on the wrong screen.

export type ThreadMessage = {
  id: string;
  sender: "owner" | "admin" | string;
  body: string;
  createdAt: string;
  source: string;
  delivered: boolean;
  deliveryError: string | null;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function ServerMessages({
  guildId, keyStr, messages, botLive,
}: {
  guildId: string;
  keyStr: string;
  messages: ThreadMessage[];
  /** Whether the bot can actually deliver a DM in this environment. */
  botLive: boolean;
}) {
  const [state, send, sending] = useActionState<PortalActionState, FormData>(
    portalSendMessage.bind(null, guildId, keyStr), null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  return (
    <div className="glass overflow-hidden">
      <div className="border-b border-white/10 p-5">
        <h2 className="font-bold flex items-center gap-2">
          <Icon name="messages" size={16} className="text-cyan-300" /> Talk to Cluster
        </h2>
        <p className="mt-1 text-sm text-muted max-w-2xl">
          Anything at all — a challenge you want run, a problem with the bot, a brand you&apos;d like on your
          server. Write here or DM the bot with <code className="text-cyan-300">/cluster show:admin</code> →
          Message Cluster. Our reply lands in this thread <b className="text-ink">and</b> as a DM from the bot.
        </p>
      </div>

      <div className="max-h-[26rem] space-y-3 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing yet. Whatever you send goes straight to the people who run the platform — there is no
            queue in between.
          </p>
        ) : messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender === "owner" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl border px-4 py-2.5 ${
              m.sender === "owner"
                ? "border-cyan-400/35 bg-cyan-500/10"
                : "border-white/12 bg-black/30"
            }`}>
              <div className="text-[10px] uppercase tracking-widest text-muted">
                {m.sender === "owner" ? "You" : "Cluster"} · {when(m.createdAt)}
                {m.sender === "owner" && m.source === "discord" && " · from Discord"}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
              {m.sender === "admin" && (
                <div className="mt-1 text-[10px] text-muted">
                  {m.delivered
                    ? "Also sent to your Discord DMs"
                    : m.deliveryError === "dm_blocked"
                      ? "We couldn't DM you — your Discord DMs are closed to server members"
                      : "Shown here only"}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form ref={formRef} action={send} className="border-t border-white/10 p-4">
        <textarea
          name="body" required rows={3} maxLength={2000}
          placeholder="What's on your mind?"
          className="input-cosmic w-full resize-y"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-muted">
            {botLive
              ? "You'll get the reply as a DM from ClusterBot."
              : "You'll get the reply here — Discord DMs turn on once the bot is live."}
          </span>
          <button disabled={sending} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-bold disabled:opacity-60">
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
        {state?.error && <p className="mt-2 text-xs text-rose-300">{state.error}</p>}
        {state?.ok && <p className="mt-2 text-xs text-emerald-300">{state.ok}</p>}
      </form>
    </div>
  );
}
