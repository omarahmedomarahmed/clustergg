"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

// Top-level tabs on /profile: the customization builder shows FIRST by default;
// linked game accounts live in their own dedicated tab.
export default function ProfileHub({
  customize, accounts, accountCount,
}: {
  customize: React.ReactNode;
  accounts: React.ReactNode;
  accountCount: number;
}) {
  const [tab, setTab] = useState<"customize" | "accounts">("customize");
  const btn = (active: boolean) =>
    `inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold border transition-colors ${
      active ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-100" : "border-violet-400/25 text-muted hover:text-ink hover:border-violet-400/50"
    }`;

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        <button onClick={() => setTab("customize")} className={btn(tab === "customize")}>
          <Icon name="edit" size={16} /> Customize profile
        </button>
        <button onClick={() => setTab("accounts")} className={btn(tab === "accounts")}>
          <Icon name="link" size={16} /> Game accounts{accountCount > 0 ? ` (${accountCount})` : ""}
        </button>
      </div>
      <div className={tab === "customize" ? "" : "hidden"}>{customize}</div>
      <div className={tab === "accounts" ? "" : "hidden"}>{accounts}</div>
    </div>
  );
}
