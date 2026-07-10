"use client";

import { useEffect, useRef } from "react";

// Animated starfield: three parallax depth layers of twinkling stars plus
// occasional shooting stars. Renders behind everything, pointer-events: none.
export default function Starfield({ density = 1 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0, h = 0;
    type Star = { x: number; y: number; r: number; depth: number; tw: number; hue: number };
    type Meteor = { x: number; y: number; vx: number; vy: number; life: number };
    let stars: Star[] = [];
    let meteors: Meteor[] = [];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.floor((w * h) / 5200 * density);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.3 + 0.25,
        depth: Math.random() * 0.8 + 0.2,
        tw: Math.random() * Math.PI * 2,
        hue: Math.random() < 0.12 ? 265 : Math.random() < 0.24 ? 190 : 0,
      }));
    };

    let scrollY = 0;
    const onScroll = () => { scrollY = window.scrollY; };

    const frame = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const twinkle = reduced ? 0.8 : 0.55 + 0.45 * Math.sin(t / 900 + s.tw);
        const y = (s.y - scrollY * s.depth * 0.25 + h * 4) % h;
        ctx.beginPath();
        ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = s.hue
          ? `hsla(${s.hue}, 90%, 78%, ${twinkle * s.depth})`
          : `rgba(232, 234, 246, ${twinkle * s.depth})`;
        ctx.fill();
      }
      if (!reduced) {
        if (Math.random() < 0.004 && meteors.length < 2) {
          meteors.push({
            x: Math.random() * w, y: Math.random() * h * 0.4,
            vx: 5 + Math.random() * 5, vy: 2.5 + Math.random() * 2.5, life: 1,
          });
        }
        meteors = meteors.filter((m) => m.life > 0);
        for (const m of meteors) {
          const grad = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 14, m.y - m.vy * 14);
          grad.addColorStop(0, `rgba(190, 200, 255, ${m.life})`);
          grad.addColorStop(1, "rgba(190, 200, 255, 0)");
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(m.x, m.y);
          ctx.lineTo(m.x - m.vx * 14, m.y - m.vy * 14);
          ctx.stroke();
          m.x += m.vx; m.y += m.vy; m.life -= 0.016;
        }
      }
      raf = requestAnimationFrame(frame);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", onScroll, { passive: true });
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
    };
  }, [density]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
}
