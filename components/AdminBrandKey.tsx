"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { regenerateBrandKey } from "@/app/actions/admin";

// Shows a brand's portal link + access key, with copy + rotate-key controls.
export default function AdminBrandKey({ brandId, slug, initialKey }: { brandId: string; slug: string | null; initialKey: string | null }) {
  const [key, setKey] = useState(initialKey ?? "");
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState<"" | "key" | "link">("");

  const portal = slug && key ? `${typeof window !== "undefined" ? window.location.origin : ""}/brands/${slug}?key=${encodeURIComponent(key)}` : "";
  const copy = (text: string, which: "key" | "link") => { navigator.clipboard?.writeText(text); setCopied(which); setTimeout(() => setCopied(""), 1500); };
  const reset = () => start(async () => { const k = await regenerateBrandKey(brandId); if (k) setKey(k); });

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-muted shrink-0">Access key</span>
        <code className="flex-1 truncate font-mono text-cyan-200">{key || "—"}</code>
        <button onClick={() => copy(key, "key")} className="text-muted hover:text-ink" title="Copy key"><Icon name={copied === "key" ? "check" : "copy"} size={13} /></button>
        <button onClick={reset} disabled={pending} className="text-amber-300 hover:text-amber-200" title="Reset key"><Icon name="satellite" size={13} /></button>
      </div>
      {portal && (
        <div className="flex items-center gap-2">
          <span className="text-muted shrink-0">Portal</span>
          <a href={`/brands/${slug}?key=${encodeURIComponent(key)}`} target="_blank" rel="noopener" className="flex-1 truncate text-cyan-300 hover:underline">/brands/{slug}</a>
          <button onClick={() => copy(portal, "link")} className="text-muted hover:text-ink" title="Copy shareable link"><Icon name={copied === "link" ? "check" : "link"} size={13} /></button>
        </div>
      )}
    </div>
  );
}
