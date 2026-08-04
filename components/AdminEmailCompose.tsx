"use client";

import { useActionState, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { sendAdminEmail, type ComposeState, type RecipientKind } from "@/app/actions/admin-email";

export type Recipient = { id: string; name: string; email: string | null; kind: RecipientKind };

/**
 * Email anyone, by hand (B47).
 *
 * A recipient with no address on file is listed and **disabled, with the
 * reason** rather than hidden. "I can't reach this server" is exactly the fact
 * this console exists to surface, and a picker that silently omits them teaches
 * an admin that the list is everybody.
 */
export default function AdminEmailCompose({ recipients }: { recipients: Recipient[] }) {
  const [state, formAction, pending] = useActionState<ComposeState, FormData>(sendAdminEmail, undefined);
  const [kind, setKind] = useState<RecipientKind>("gamer");
  const [id, setId] = useState("");
  const [open, setOpen] = useState(false);

  const list = useMemo(() => recipients.filter((r) => r.kind === kind), [recipients, kind]);
  const chosen = list.find((r) => r.id === id);
  const unreachable = list.filter((r) => !r.email).length;

  const KINDS: { k: RecipientKind; label: string }[] = [
    { k: "gamer", label: "A gamer" },
    { k: "brand", label: "A brand" },
    { k: "server", label: "A server owner" },
  ];

  return (
    <section className="glass p-5 mb-6">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left">
        <Icon name="message" size={16} className="text-cyan-300" />
        <span className="font-bold">Write to someone</span>
        <span className="text-xs text-muted">Any gamer, brand or server owner</span>
        <Icon name={open ? "chevronDown" : "chevronRight"} size={15} className="text-muted ml-auto" />
      </button>

      {open && (
        <form action={formAction} className="mt-4 space-y-4">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="recipientId" value={id} />

          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button key={k.k} type="button" onClick={() => { setKind(k.k); setId(""); }}
                className={`rounded-full border px-3 py-1.5 text-xs ${kind === k.k ? "border-cyan-400/60 text-cyan-300" : "border-violet-400/20 text-muted hover:text-ink"}`}>
                {k.label}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="text-xs font-semibold">Who</span>
            <select value={id} onChange={(e) => setId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-violet-400/20 bg-black/30 px-3 py-2 text-sm">
              <option value="">Choose…</option>
              {list.map((r) => (
                // Listed but unselectable, with the reason in the label.
                <option key={r.id} value={r.id} disabled={!r.email}>
                  {r.name}{r.email ? ` — ${r.email}` : " — no contact email on file"}
                </option>
              ))}
            </select>
            {unreachable > 0 && (
              <span className="mt-1 block text-[11px] text-amber-300">
                {unreachable} {kind === "server" ? "server" : kind}{unreachable === 1 ? "" : "s"} here {unreachable === 1 ? "has" : "have"} no address on file and cannot be reached at all.
              </span>
            )}
          </label>

          <label className="block">
            <span className="text-xs font-semibold">Subject</span>
            <input name="subject" maxLength={200} required
              className="mt-1 w-full rounded-lg border border-violet-400/20 bg-black/30 px-3 py-2 text-sm" />
          </label>

          <label className="block">
            <span className="text-xs font-semibold">Message</span>
            <p className="text-[11px] text-muted">
              Plain text — a blank line starts a new paragraph. No HTML: free-text markup from a console is
              a phishing vector wearing our own brand.
            </p>
            <textarea name="body" rows={7} maxLength={4000} required
              className="mt-1 w-full rounded-lg border border-violet-400/20 bg-black/30 px-3 py-2 text-sm" />
          </label>

          <div className="flex items-center gap-3">
            <button disabled={pending || !chosen?.email} className="glow-btn rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {pending ? "Sending…" : "Send"}
            </button>
            {state?.ok && <span className="text-xs text-emerald-300">{state.message}</span>}
            {state?.error && <span className="text-xs text-rose-300">{state.error}</span>}
          </div>
        </form>
      )}
    </section>
  );
}
