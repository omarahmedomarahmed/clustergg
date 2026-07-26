"use client";

import Icon from "@/components/Icon";

// Print / save as PDF. The browser's own dialog is the export — it produces a
// real PDF on every platform without shipping a PDF library to do worse.
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="ghost-btn pressable rounded-full px-4 py-1.5 text-xs inline-flex items-center gap-1.5"
    >
      <Icon name="copy" size={12} /> Save as PDF
    </button>
  );
}
