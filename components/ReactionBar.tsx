"use client";

import { useTransition } from "react";
import { reactToPost } from "@/app/actions/social";
import Icon from "@/components/Icon";
import { useTr } from "@/components/LocaleProvider";

const REACTIONS = [
  { type: "like" as const, icon: "arrowUp", label: "Like" },
  { type: "dislike" as const, icon: "arrowDown", label: "Dislike" },
  { type: "meh" as const, icon: "diamond", label: "Meh" },
];

export default function ReactionBar({
  postId, counts, mine, path, loggedIn,
}: {
  postId: string;
  counts: Record<string, number>;
  mine: string | null;
  path: string;
  loggedIn: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const tr = useTr();
  return (
    <div className="flex items-center gap-2">
      {REACTIONS.map((r) => (
        <button
          key={r.type}
          disabled={pending || !loggedIn}
          title={loggedIn ? tr(r.label) : tr("Log in to react")}
          onClick={() => startTransition(() => reactToPost(postId, r.type, path))}
          className={`pressable flex items-center gap-1.5 rounded-full px-3 py-1 text-xs border transition-colors ${
            mine === r.type
              ? "border-cyan-400/70 bg-cyan-400/15 text-cyan-200"
              : "border-violet-400/20 text-muted hover:border-violet-400/50"
          } ${!loggedIn ? "opacity-50 cursor-default" : ""}`}
        >
          <Icon name={r.icon} size={12} />
          <span>{counts[r.type] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}
