"use client";

import Link from "next/link";
import { useState } from "react";

export default function MobileMenu({ links, loggedIn }: { links: { href: string; label: string }[]; loggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <button aria-label="Menu" className="text-xl px-1" onClick={() => setOpen((o) => !o)}>
        {open ? "✕" : "☰"}
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-16 z-50 border-b border-violet-500/20 bg-[#04051a]/97 backdrop-blur-xl px-6 py-4 flex flex-col gap-3">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-muted hover:text-ink py-1">
              {l.label}
            </Link>
          ))}
          <Link href="/search" onClick={() => setOpen(false)} className="text-muted hover:text-ink py-1">Search</Link>
          {loggedIn && (
            <>
              <Link href="/settings/connections" onClick={() => setOpen(false)} className="text-muted hover:text-ink py-1">Settings</Link>
              <Link href="/notifications" onClick={() => setOpen(false)} className="text-muted hover:text-ink py-1">Notifications</Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
