"use client";

// The one client component on the public site, and it exists for one reason.
//
// D23 — *"a missing asset renders a designed placeholder, never a broken-image
// icon and never nothing."* Catching a source we will not serve can be done on
// the server; catching one that 404s **after** the browser asks for it cannot,
// because only the browser knows. So this is a client module, and the handler
// is the whole reason for it.

import { assetUrl, PLACEHOLDER } from "../lib/site/assets.ts";

/**
 * An image that cannot be broken. D23.
 *
 * Two fences, because there are two ways an image fails and they happen at
 * different times: `assetUrl` catches a source we will not serve **before the
 * request**, and `onError` catches one that 404s or is corrupt **after it**.
 * A guard on only the first is a broken-image icon the first time a Blob
 * upload is deleted.
 *
 * Deliberately not a `next/image`. That component optimises through a loader
 * that must be configured per host, and an unconfigured host is a 500 rather
 * than a picture — which is the failure mode this exists to remove.
 */
export function Art({
  src,
  alt,
  className,
  width,
  height,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
}) {
  const resolved = assetUrl(src);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolved}
      alt={alt}
      width={width}
      height={height}
      className={className}
      data-testid="art"
      data-placeholder={resolved === PLACEHOLDER ? "1" : "0"}
      // The runtime half. `onError` cannot be a server component's, so this is
      // the one place the site uses an inline handler — and it is inert unless
      // the image has already failed.
      onError={(e) => {
        const img = e.currentTarget;
        if (img.src.endsWith(PLACEHOLDER)) return;
        img.src = PLACEHOLDER;
        img.dataset.placeholder = "1";
      }}
    />
  );
}
