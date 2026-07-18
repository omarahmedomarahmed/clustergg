"use client";

import { useEffect, useState } from "react";

// Cycles the loading phrases every second. The list comes from the CMS
// (brand.loading.phrases), so admins control the copy.
export default function LoadingPhrases({ phrases }: { phrases: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (phrases.length < 2) return;
    const t = setInterval(() => setI((v) => (v + 1) % phrases.length), 1000);
    return () => clearInterval(t);
  }, [phrases.length]);
  return (
    <div key={i} className="mt-4 text-sm font-semibold tracking-wide grad-text loading-phrase">
      {phrases[i] ?? "Loading…"}
    </div>
  );
}
