"use client";

import { useEffect, useState } from "react";

// Cycles the loading phrases on an admin-set interval. The list + timing come
// from the CMS (brand.loading.phrases / brand.loading.interval).
export default function LoadingPhrases({ phrases, intervalMs = 3000 }: { phrases: string[]; intervalMs?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (phrases.length < 2) return;
    const t = setInterval(() => setI((v) => (v + 1) % phrases.length), Math.max(400, intervalMs));
    return () => clearInterval(t);
  }, [phrases.length, intervalMs]);
  return (
    <div key={i} className="mt-4 text-sm font-semibold tracking-wide grad-text loading-phrase">
      {phrases[i] ?? "Loading…"}
    </div>
  );
}
