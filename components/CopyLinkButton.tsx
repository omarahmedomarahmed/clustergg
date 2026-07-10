"use client";

import { useState } from "react";

export default function CopyLinkButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(`${location.origin}${path}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-xs ghost-btn rounded-full px-2.5 py-0.5"
      title="Copy profile link"
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
