"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearStaffAlert } from "@/app/actions/alerts";

// Clearing puts a NAME on it. An alert that anybody can make disappear
// anonymously is one two people both ignore, each assuming the other has it.
export default function ClearAlert({ id }: { id: string }) {
  const [busy, start] = useTransition();
  const router = useRouter();
  return (
    <button
      disabled={busy}
      onClick={() => start(async () => { await clearStaffAlert(id); router.refresh(); })}
      className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-bold text-muted hover:text-ink disabled:opacity-50"
    >
      {busy ? "…" : "I've got this"}
    </button>
  );
}
