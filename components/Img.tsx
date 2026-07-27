"use client";

import { useEffect, useRef, useState } from "react";
import { optImg } from "@/lib/img";

// An <img> that goes through Next's optimizer, and survives it failing.
//
// Optimizing is a billing necessity — every Blob read counts against Fast
// Origin Transfer, and a raw 24 MB upload served on every view is how a Hobby
// project burns its whole month. But routing through `/_next/image` adds a
// component that can fail on its own: an unreachable source host, a format it
// can't decode, or the plan's transformation quota running out. Previously a
// raw <img> would at least have shown the original.
//
// So a failed optimized load falls back to the source URL once. The expensive
// path is the fallback, not the default — which is the right way round.
export default function Img({
  src, width = 640, quality = 70, alt = "", ...rest
}: {
  src?: string | null;
  /** Rendered width in CSS pixels — what to ask the optimizer for. */
  width?: number;
  quality?: number;
} & Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "width">) {
  const [raw, setRaw] = useState(false);
  const ref = useRef<HTMLImageElement | null>(null);

  // `onError` alone is not enough on a server-rendered image.
  //
  // The browser starts fetching the moment the HTML arrives, which is BEFORE
  // React hydrates and attaches the handler — so an image that fails fast
  // (unreachable host, 403 from the optimizer) fails silently and stays broken
  // forever. This checks the real DOM state once on mount: an <img> that has
  // finished loading with no intrinsic width did not load.
  useEffect(() => {
    const el = ref.current;
    if (!el || raw) return;
    if (el.complete && el.naturalWidth === 0) setRaw(true);
  }, [raw]);

  if (!src) return null;
  const optimized = optImg(src, width, quality) ?? src;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={raw ? src : optimized}
      alt={alt}
      onError={() => { if (!raw) setRaw(true); }}
      {...rest}
    />
  );
}
