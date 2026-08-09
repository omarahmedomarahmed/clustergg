"use client";

import { useEffect, useState } from "react";

// What we store, said once. B104.
//
// ===== WHY THE CHOICE WENT AWAY =====
//
// This used to offer two buttons: "Accept all" and "Essential only". Nothing in
// the product read the answer. Pressing "Essential only" wrote a string to
// localStorage and changed precisely nothing — the beacon carried on counting,
// which is exactly what the person pressing it had asked us not to do.
//
// That is worse than having no banner at all. A banner that asks and ignores
// the answer is not a compliance measure, it is a lie with a rounded corner,
// and it is the kind of lie somebody screenshots.
//
// So there are two honest options and the owner chose between them: gate the
// beacon on consent, or stop pretending to offer a choice. The decision was the
// second, and the reasoning is worth writing down because it is defensible
// rather than convenient:
//
//   * The beacon is FIRST-PARTY and exists to EVIDENCE DELIVERY. A brand is
//     billed a fixed price per challenge — never per view — so this counting
//     generates no money and meters nothing. It is how we show a brand what
//     their challenge actually reached. Measuring our own delivery, not
//     profiling an audience.
//   * It stores a salted hash of an address and a salted hash of a session key.
//     Neither can be reversed into a person, and neither follows anybody to
//     another site.
//   * There is no third-party tag, no cross-site identifier, no fingerprinting,
//     and nothing is sold or shared.
//
// ⚠ This is a position, not advice, and it is the kind that changes with where
// the audience is. If EU/UK traffic becomes material, gating the beacon is the
// next move and `lib/ads-beacon.ts` is where it would go in.
//
// ===== SO WHAT IS LEFT IS A NOTICE =====
//
// One dismiss button, because there is only one thing to say. It still
// remembers the dismissal, so it is not shown twice.

export default function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // The old key held "all" or "essential" — an answer to a question we no
    // longer ask. A new key means anybody who chose before is shown the notice
    // once, which is right: what we told them has changed.
    if (!localStorage.getItem("cluster-cookie-notice")) setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-xl glass p-4 shadow-2xl">
      <p className="text-sm leading-relaxed text-muted">
        We keep you signed in with one cookie, and we count which sponsored cards were shown so we
        can show a brand what their challenge reached. Nobody is billed per view — a brand pays a
        fixed price for the challenge itself. The counting stores a <b className="text-ink">salted
        hash</b> of your address and your session — never the values themselves, never anything that
        follows you to another site, and nothing is sold or shared.{" "}
        <a href="/legal/cookies" className="text-cyan-300 underline">The whole policy</a>.
      </p>
      <div className="mt-3">
        <button
          onClick={() => {
            localStorage.setItem("cluster-cookie-notice", "seen");
            setShow(false);
          }}
          className="glow-btn pressable rounded-full px-5 py-1.5 text-sm font-semibold text-white"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
