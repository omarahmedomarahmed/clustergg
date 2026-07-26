"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

// `?embed=1` — the page with none of the site around it.
//
// Profile of the Week shows a gamer's real profile in a frame so voters can see
// the thing they're judging: the layout, the colours, the cards, the custom
// cursor. Framing the ordinary page put the whole site inside itself — nav,
// footer, and the competition band nested in its own modal.
//
// A route that renders bare would need a layout without the chrome, and nested
// layouts always inherit their parent's. So the chrome is hidden with a data
// attribute on <html> instead: one class, one rule, and every page gains a
// frameable form rather than just this one.
export default function EmbedMode() {
  const params = useSearchParams();
  const embed = params.get("embed") === "1";
  useEffect(() => {
    const root = document.documentElement;
    if (embed) root.setAttribute("data-embed", "1");
    else root.removeAttribute("data-embed");
    return () => root.removeAttribute("data-embed");
  }, [embed]);
  return null;
}
