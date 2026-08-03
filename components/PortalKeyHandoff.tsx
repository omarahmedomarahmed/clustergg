"use client";

import { useEffect, useRef } from "react";
import Icon from "@/components/Icon";

// A shared `/servers/x?key=…` link, exchanged for a session.
//
// The exchange has to happen in a Route Handler — writing a cookie during a
// Server Component render throws — and the page can't `redirect()` there
// either: App Router redirects run through the client router, which is built
// for pages and does not reliably follow a route handler's 307.
//
// So the page renders this instead, and it POSTs. A real form submission is a
// real browser navigation: the handler sets the cookie, redirects to the clean
// URL, and the key never lands in history because it travelled in the body
// rather than the query string. Without JavaScript the same form is one button
// press away, so the link still works.
export default function PortalKeyHandoff({ kind, slug, portalKey, deep = "" }: {
  kind: "server" | "brand";
  slug: string;
  portalKey: string;
  /** The rest of the query string, so a deep link survives the exchange. */
  deep?: string;
}) {
  const form = useRef<HTMLFormElement | null>(null);
  useEffect(() => { form.current?.submit(); }, []);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-cyan-500/15 text-cyan-200">
        <Icon name="lock" size={24} />
      </span>
      <h1 className="mt-4 text-xl font-bold">Unlocking your portal…</h1>
      <p className="mt-2 text-sm text-muted">
        Checking your key and signing you in. Your key won&apos;t stay in the address bar.
      </p>
      <form ref={form} method="POST" action="/api/portal/unlock" className="mt-6">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="key" value={portalKey} />
        <input type="hidden" name="deep" value={deep} />
        <button className="glow-btn pressable rounded-full px-6 py-2.5 text-sm font-bold">Continue</button>
      </form>
    </div>
  );
}
