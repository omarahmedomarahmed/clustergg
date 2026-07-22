"use client";

import { useEffect, useRef, useState } from "react";

// A video that plays like a BOOMERANG — forward to the end, then backward to
// the start, forever — with no stutter. HTML5 video can't play in reverse and
// seeking backwards through a compressed MP4 is far too slow to look smooth, so
// we capture the decoded frames once (into GPU-backed ImageBitmaps) and then
// blit them forward-then-reverse onto a canvas at a steady frame rate. If the
// frames can't be read (e.g. the source blocks cross-origin canvas access) we
// fall back to a plain looping <video> so it still plays.
export default function LoopVideo({
  src, poster, className = "", style, fps = 24, maxFrames = 60, maxWidth = 640,
}: { src: string; poster?: string; className?: string; style?: React.CSSProperties; fps?: number; maxFrames?: number; maxWidth?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let stopped = false;
    let raf = 0;
    const frames: ImageBitmap[] = [];

    const video = document.createElement("video");
    video.src = src;
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    (video as HTMLVideoElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = true;

    // Offscreen canvas we capture each decoded frame into.
    const cap = document.createElement("canvas");
    const capCtx = cap.getContext("2d");
    const ctx = canvas.getContext("2d");
    if (!capCtx || !ctx) { setFallback(true); return; }

    let lastCapT = -1;
    const minDelta = 1 / fps; // seconds between captured frames

    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    // Draw a bitmap covering the canvas (object-fit: cover).
    const drawCover = (bmp: ImageBitmap) => {
      const cw = canvas.width, ch = canvas.height;
      const s = Math.max(cw / bmp.width, ch / bmp.height);
      const w = bmp.width * s, h = bmp.height * s;
      ctx.drawImage(bmp, (cw - w) / 2, (ch - h) / 2, w, h);
    };

    const captureFrame = async () => {
      try {
        capCtx.drawImage(video, 0, 0, cap.width, cap.height);
        const bmp = await createImageBitmap(cap);
        if (stopped) { bmp.close(); return; }
        frames.push(bmp);
        // Live preview while capturing so there's no blank first pass.
        drawCover(bmp);
      } catch {
        // Tainted canvas (no CORS) or decode error → give up, play the <video>.
        cleanup();
        setFallback(true);
      }
    };

    const onLoaded = () => {
      const s = Math.min(1, maxWidth / (video.videoWidth || maxWidth));
      cap.width = Math.max(2, Math.round((video.videoWidth || maxWidth) * s));
      cap.height = Math.max(2, Math.round((video.videoHeight || maxWidth * 0.56) * s));
    };

    // Prefer requestVideoFrameCallback (real decoded frames); fall back to rAF.
    type RVFCVideo = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
    const rvfc = (video as RVFCVideo).requestVideoFrameCallback?.bind(video);
    const onFrame = () => {
      if (stopped || fallback) return;
      if (frames.length >= maxFrames || (video.duration && video.currentTime >= video.duration - 0.02)) {
        startPlayback();
        return;
      }
      if (lastCapT < 0 || video.currentTime - lastCapT >= minDelta) {
        lastCapT = video.currentTime;
        captureFrame();
      }
      if (rvfc) rvfc(onFrame); else raf = requestAnimationFrame(onFrame);
    };

    // Boomerang playback from the captured frames.
    const startPlayback = () => {
      try { video.pause(); } catch { /* ignore */ }
      if (frames.length < 2) { cleanup(); setFallback(true); return; }
      let i = 0, dir = 1, last = performance.now();
      const frameMs = 1000 / fps;
      const play = (now: number) => {
        if (stopped) return;
        if (now - last >= frameMs) {
          last = now;
          drawCover(frames[i]);
          i += dir;
          if (i >= frames.length - 1) { i = frames.length - 1; dir = -1; }
          else if (i <= 0) { i = 0; dir = 1; }
        }
        raf = requestAnimationFrame(play);
      };
      raf = requestAnimationFrame(play);
    };

    const cleanup = () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      try { video.pause(); video.removeAttribute("src"); video.load(); } catch { /* ignore */ }
    };

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", () => { cleanup(); setFallback(true); });
    video.play().then(() => { if (rvfc) rvfc(onFrame); else raf = requestAnimationFrame(onFrame); }).catch(() => { cleanup(); setFallback(true); });

    return () => { stopped = true; cleanup(); for (const f of frames) f.close(); };
  }, [src, fps, maxFrames, maxWidth, fallback]);

  if (fallback) {
    // eslint-disable-next-line jsx-a11y/media-has-caption
    return <video src={src} poster={poster ?? undefined} autoPlay muted loop playsInline preload="auto" className={className} style={style} />;
  }
  return <canvas ref={canvasRef} className={className} style={style} aria-hidden />;
}
