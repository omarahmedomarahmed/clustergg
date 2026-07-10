"use client";

import { useEffect, useRef, useState } from "react";

type Served = {
  key: string;
  width: number;
  height: number;
  rotationIntervalSeconds: number;
  creatives: {
    campaignCreativeId: string;
    type: string;
    fileUrl: string;
    clickUrl: string | null;
    brandName: string;
    durationSeconds: number | null;
  }[];
};

// Renders a placement: fetches eligible creatives, rotates them on the
// placement's interval, logs an impression per creative shown (with viewed
// duration via IntersectionObserver), and routes clicks through the beacon.
export default function AdSlot({ placement, className = "" }: { placement: string; className?: string }) {
  const [served, setServed] = useState<Served | null>(null);
  const [idx, setIdx] = useState(0);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewStart = useRef<number>(0);
  const impressionId = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/ads/serve?placement=${encodeURIComponent(placement)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.creatives?.length) setServed(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [placement]);

  // Rotation
  useEffect(() => {
    if (!served || served.creatives.length < 2) return;
    const t = setInterval(
      () => setIdx((i) => (i + 1) % served.creatives.length),
      Math.max(3, served.rotationIntervalSeconds) * 1000
    );
    return () => clearInterval(t);
  }, [served]);

  // Impression logging per creative shown
  useEffect(() => {
    if (!served) return;
    const creative = served.creatives[idx];
    const el = hostRef.current;
    if (!creative || !el) return;

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !impressionId.current) {
          viewStart.current = Date.now();
          impressionId.current = "pending";
          fetch("/api/ads/beacon", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "impression", ccId: creative.campaignCreativeId, path: location.pathname }),
          }).then((r) => r.json()).then((d) => { impressionId.current = d?.id ?? null; }).catch(() => {});
        }
      }
    }, { threshold: 0.5 });
    io.observe(el);

    return () => {
      io.disconnect();
      if (impressionId.current && impressionId.current !== "pending" && viewStart.current) {
        navigator.sendBeacon?.(
          "/api/ads/beacon",
          JSON.stringify({
            type: "duration",
            id: impressionId.current,
            ms: Date.now() - viewStart.current,
          })
        );
      }
      impressionId.current = null;
    };
  }, [served, idx]);

  if (!served) return null;
  const creative = served.creatives[idx];
  const aspect = `${served.width} / ${served.height}`;

  const onClick = () => {
    fetch("/api/ads/beacon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "click",
        ccId: creative.campaignCreativeId,
        id: impressionId.current !== "pending" ? impressionId.current : null,
      }),
    }).catch(() => {});
  };

  return (
    <div ref={hostRef} className={`mx-auto w-full ${className}`} style={{ maxWidth: served.width }}>
      <div className="text-[10px] uppercase tracking-widest text-muted/60 mb-1 text-right">Sponsored</div>
      <a
        href={creative.clickUrl ?? "#"}
        target="_blank"
        rel="noopener sponsored"
        onClick={onClick}
        className="block overflow-hidden rounded-lg border border-violet-400/20 relative"
        style={{ aspectRatio: aspect }}
      >
        {creative.type === "video" ? (
          <video
            key={creative.campaignCreativeId}
            src={creative.fileUrl}
            className="w-full h-full object-cover"
            autoPlay muted playsInline
            // Hard 5s cap: advance rotation regardless of source length.
            onTimeUpdate={(e) => {
              if (e.currentTarget.currentTime >= 5) {
                e.currentTarget.pause();
                setIdx((i) => (served.creatives.length ? (i + 1) % served.creatives.length : 0));
              }
            }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={creative.campaignCreativeId}
            src={creative.fileUrl}
            alt={creative.brandName}
            className="w-full h-full object-cover"
          />
        )}
      </a>
    </div>
  );
}
