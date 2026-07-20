import { flagEmoji } from "@/lib/flags";

// The gamer's country flag, shown next to their name on leaderboards, quests,
// challenges and the planet hero. Pure render (works server + client). An
// explicit `emoji` (from an admin-customised country) wins over the derived one.
export default function Flag({ code, emoji, className = "", title }: {
  code?: string | null; emoji?: string | null; className?: string; title?: string;
}) {
  const e = emoji || flagEmoji(code);
  if (!e) return null;
  return (
    <span className={`inline-block leading-none align-middle ${className}`} title={title ?? code ?? undefined} aria-hidden>
      {e}
    </span>
  );
}
