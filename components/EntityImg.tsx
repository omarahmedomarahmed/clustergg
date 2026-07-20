"use client";

import { useState } from "react";

// Class/kind-tinted gradient used when an entity has no art (or its art 404s).
// Apex legends + PUBG weapons have no free image CDN, so their tiles fall back
// to a clean initials chip instead of a broken-image icon.
const KIND_TINT: Record<string, [string, string]> = {
  champion: ["#3b1d6e", "#0e2a5e"],
  agent: ["#7a1d2e", "#2a0d4e"],
  weapon: ["#334155", "#0f172a"],
  hero: ["#5b2410", "#1e1b4b"],
  outfit: ["#6d28d9", "#0891b2"],
  legend: ["#b91c1c", "#7c2d12"],
  map: ["#065f46", "#0c4a6e"],
};

function initialsOf(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Drop-in <img> replacement that renders a gradient + initials tile when the
// source is empty or fails to load. `className` controls sizing/object-fit on
// the real image; the fallback fills the same box and centers the initials.
export default function EntityImg({
  src, name, kind, className = "", fallbackClassName = "",
}: { src?: string | null; name: string; kind?: string | null; className?: string; fallbackClassName?: string }) {
  const [bad, setBad] = useState(false);
  if (src && !bad) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} loading="lazy" className={className} onError={() => setBad(true)} />;
  }
  const [a, b] = KIND_TINT[kind ?? ""] ?? ["#312e81", "#0f172a"];
  return (
    <div className={`flex items-center justify-center ${className} ${fallbackClassName}`}
      style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} aria-label={name}>
      <span className="font-black text-white/70 tracking-wider" style={{ fontSize: "clamp(0.7rem, 22cqmin, 1.6rem)" }}>{initialsOf(name)}</span>
    </div>
  );
}
