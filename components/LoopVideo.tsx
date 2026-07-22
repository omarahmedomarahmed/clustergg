"use client";

import { useEffect, useRef } from "react";

// A video that plays like a BOOMERANG: forward to the end, then smoothly
// reverses back to the start, then forward again — instead of jump-cutting
// from the last frame back to the first. HTML5 video can't play at a negative
// rate, so the reverse leg is driven by stepping currentTime with rAF.
export default function LoopVideo({
  src, poster, className = "", style,
}: { src: string; poster?: string; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    let raf = 0;
    let reversing = false;
    let last = 0;
    v.loop = false;
    v.muted = true;

    const startReverse = () => {
      reversing = true;
      try { v.pause(); } catch { /* ignore */ }
      last = performance.now();
      raf = requestAnimationFrame(step);
    };
    const step = (now: number) => {
      if (!reversing) return;
      const dt = Math.min(0.05, (now - last) / 1000); // clamp big gaps
      last = now;
      const t = v.currentTime - dt;
      if (t <= 0.02) {
        v.currentTime = 0;
        reversing = false;
        v.play().catch(() => {});
        return;
      }
      v.currentTime = t;
      raf = requestAnimationFrame(step);
    };
    const onEnded = () => { if (!reversing) startReverse(); };
    // Some browsers don't fire "ended" reliably when we seek; also watch for
    // the play head reaching the very end.
    const onTime = () => {
      if (!reversing && v.duration && v.currentTime >= v.duration - 0.05) startReverse();
    };

    v.addEventListener("ended", onEnded);
    v.addEventListener("timeupdate", onTime);
    v.play().catch(() => {});

    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("timeupdate", onTime);
    };
  }, [src]);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video ref={ref} src={src} poster={poster ?? undefined} autoPlay muted playsInline preload="auto"
      className={className} style={style} />
  );
}
