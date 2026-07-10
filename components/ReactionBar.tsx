"use client";

import { useTransition } from "react";
import { reactToPost } from "@/app/actions/social";

const REACTIONS = [
  { type: "like" as const, glyph: "▲", label: "Like" },
  { type: "dislike" as const, glyph: "▼", label: "Dislike" },
  { type: "meh" as const, glyph: "◆", label: "Meh" },
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
  return (
    <div className="flex items-center gap-2">
      {REACTIONS.map((r) => (
        <button
          key={r.type}
          disabled={pending || !loggedIn}
          title={loggedIn ? r.label : "Log in to react"}
          onClick={() => startTransition(() => reactToPost(postId, r.type, path))}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs border transition-colors ${
            mine === r.type
              ? "border-cyan-400/70 bg-cyan-400/15 text-cyan-200"
              : "border-violet-400/20 text-muted hover:border-violet-400/50"
          } ${!loggedIn ? "opacity-50 cursor-default" : ""}`}
        >
          <span>{r.glyph}</span>
          <span>{counts[r.type] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}
