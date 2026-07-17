"use client";

import { usePathname } from "next/navigation";
import { pathToPageKey } from "@/lib/page-bg";

// Renders the admin-chosen background image for the current page (behind all
// content, over the default nebula). Reads the whole page→url map from the
// server layout, so switching pages never triggers a fetch. When a page has no
// custom background the default nebula shows through.
export default function PageBackground({ map }: { map: Record<string, string> }) {
  const pathname = usePathname() || "/";
  const key = pathToPageKey(pathname);
  const url = key ? map[key] : "";
  if (!url) return null;

  return (
    <div
      aria-hidden
      className="fixed inset-0 pointer-events-none bg-cover bg-center bg-no-repeat"
      style={{
        zIndex: -1,
        backgroundImage: `linear-gradient(rgba(4,5,26,0.62), rgba(4,5,26,0.86)), url(${url})`,
      }}
    />
  );
}
