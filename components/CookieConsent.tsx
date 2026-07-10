"use client";

import { useEffect, useState } from "react";

export default function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("cluster-consent")) setShow(true);
  }, []);

  if (!show) return null;
  const decide = (v: string) => {
    localStorage.setItem("cluster-consent", v);
    setShow(false);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-xl glass p-4 shadow-2xl">
      <p className="text-sm text-muted">
        Cluster uses cookies for sign-in sessions and privacy-preserving ad analytics
        (IP addresses are hashed, never stored raw). See our{" "}
        <a href="/legal/cookies" className="text-cyan-300 underline">Cookie Policy</a>.
      </p>
      <div className="mt-3 flex gap-3">
        <button onClick={() => decide("all")} className="glow-btn rounded-full px-4 py-1.5 text-sm font-semibold text-white">
          Accept all
        </button>
        <button onClick={() => decide("essential")} className="ghost-btn rounded-full px-4 py-1.5 text-sm">
          Essential only
        </button>
      </div>
    </div>
  );
}
