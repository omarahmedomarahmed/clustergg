"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";

// "Contact us to set it up", where the thing isn't set up.
//
// Some of what a brand can buy is self-serve — the monthly sponsored-challenge
// buy goes live without a human. The rest (the website placements, anything
// bespoke) needs us. The Discord card was self-serve too until M4 took it off
// the market: that slot is house-only now, because selling it made the bot an
// ad network instead of a delivery engine for challenges. Sending those brands to an email
// address loses them: the message lands in an inbox nobody on the account
// watches, and the brand has no record they ever asked.
//
// So this posts into the SAME thread as everything else, prefilled with what
// they're asking for, and shows them it landed. One conversation, one place to
// look, on both ends.

export default function ContactUs({
  title, body, topic, cta = "Contact us to set it up", send,
}: {
  title: string;
  body: string;
  /** The first line of the message, so staff know what was clicked. */
  topic: string;
  cta?: string;
  /** A bound server action that posts into the brand's inbox. */
  send: (formData: FormData) => Promise<{ error?: string } | void>;
}) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="glass p-6">
      <h2 className="font-bold text-lg flex items-center gap-2">
        <Icon name="rocket" size={18} className="text-cyan-300" /> {title}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>

      {sent ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-emerald-300">
          <Icon name="check" size={15} /> Sent — it&apos;s in your Messages tab, and someone will reply there.
        </p>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="cta-btn pressable mt-4 inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold"
        >
          <Icon name="message" size={15} /> {cta}
        </button>
      ) : (
        <form
          className="mt-4"
          action={(fd) => start(async () => {
            setError(null);
            const res = await send(fd);
            if (res && "error" in res && res.error) setError(res.error);
            else { setSent(true); setOpen(false); }
          })}
        >
          <textarea
            name="body" required rows={3} maxLength={2000}
            defaultValue={`${topic}\n\n`}
            className="input-cosmic w-full resize-y"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button disabled={pending} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-bold disabled:opacity-60">
              {pending ? "Sending…" : "Send to my Cluster team"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted hover:text-ink">
              Cancel
            </button>
            {error && <span className="text-xs text-rose-300">{error}</span>}
          </div>
        </form>
      )}
    </div>
  );
}
