"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

// Signing in to a brand or server portal.
//
// The portals are deliberately not behind a Cluster account — a brand's media
// buyer and a server owner should not need to create a gamer profile to read
// their own dashboard. So the credential is a key, and the only hard part is
// knowing WHICH portal it opens: people know their company's name, not our
// slug. Hence: type the name, pick it from the matches, paste the key.
//
// The form POSTs to /api/portal/unlock, which is a Route Handler because only
// a handler may set the session cookie. The key therefore never enters a URL,
// never reaches browser history, and never leaks through a Referer header.

type Match = { name: string; slug: string; imageUrl?: string | null };

export default function PortalLogin({ kind, initialSlug = "", initialName = "" }: {
  kind: "brand" | "server";
  initialSlug?: string;
  initialName?: string;
}) {
  const [q, setQ] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [picked, setPicked] = useState<Match | null>(initialSlug ? { name: initialName || initialSlug, slug: initialSlug } : null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Debounced so a search doesn't fire per keystroke — the endpoint is public
  // and there is no reason to let a typist DDoS it.
  useEffect(() => {
    if (picked && q === picked.name) return;
    const term = q.trim();
    if (term.length < 2) { setMatches([]); return; }
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/portal/search?kind=${kind}&q=${encodeURIComponent(term)}`);
        const json = await res.json();
        setMatches(Array.isArray(json?.results) ? json.results : []);
        setOpen(true);
      } catch { setMatches([]); }
      setBusy(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, kind, picked]);

  useEffect(() => {
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const choose = (m: Match) => {
    setPicked(m); setSlug(m.slug); setQ(m.name); setOpen(false);
  };

  const noun = kind === "brand" ? "brand" : "server";

  return (
    <form method="POST" action="/api/portal/unlock" className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="slug" value={slug} />

      <div ref={box} className="relative">
        <label className="mb-1.5 block text-xs font-semibold">Your {noun}</label>
        <div className="relative">
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPicked(null); setSlug(""); }}
            onFocus={() => matches.length && setOpen(true)}
            placeholder={kind === "brand" ? "Start typing your company name" : "Start typing your server name"}
            autoComplete="off"
            className="input-cosmic w-full pr-9"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
            <Icon name={busy ? "clock" : picked ? "check" : "search"} size={15} className={picked ? "text-emerald-300" : ""} />
          </span>
        </div>

        {open && matches.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-white/15 bg-[#070826] p-1 shadow-xl">
            {matches.map((m) => (
              <li key={m.slug}>
                <button
                  type="button" onClick={() => choose(m)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-white/[0.06]"
                >
                  {m.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={m.imageUrl} alt="" className="h-7 w-7 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-muted">
                      <Icon name={kind === "brand" ? "grid" : "discord"} size={13} />
                    </span>
                  )}
                  <span className="truncate">{m.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {open && !busy && q.trim().length >= 2 && matches.length === 0 && (
          <p className="mt-1.5 text-[11px] text-muted">
            No {noun} by that name. Check the spelling, or ask your Cluster contact for the direct link.
          </p>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold">Access key</label>
        <input
          name="key" required placeholder="CLSTR-XXXX-XXXX-XXXX"
          autoComplete="off" spellCheck={false}
          className="input-cosmic w-full font-mono"
        />
      </div>

      <button
        disabled={!slug}
        className={`pressable w-full rounded-full px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
          kind === "brand" ? "brand-btn" : "glow-btn"
        }`}
      >
        {slug ? `Open ${picked?.name ?? "the portal"}` : `Pick your ${noun} first`}
      </button>
    </form>
  );
}
