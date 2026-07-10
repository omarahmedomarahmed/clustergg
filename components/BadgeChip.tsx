const EMOJI: Record<string, string> = {
  b1: "🏆", b2: "✨", b3: "🧠", b4: "👑", b5: "📡", b6: "☄️",
};

export function BadgeIcon({ icon, size = 40 }: { icon: string; size?: number }) {
  if (/^b[1-6]$/.test(icon)) {
    return (
      <span
        className={`badge-sprite badge-${icon} inline-block shrink-0`}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }
  return <span style={{ fontSize: size * 0.7, lineHeight: 1 }}>{EMOJI[icon] ?? icon ?? "⭐"}</span>;
}

export default function BadgeChip({
  name, icon, description, size = 40,
}: { name: string; icon: string; description?: string; size?: number }) {
  return (
    <div className="glass glass-hover flex items-center gap-3 px-3 py-2" title={description}>
      <BadgeIcon icon={icon} size={size} />
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">{name}</div>
        {description && <div className="text-xs text-muted truncate max-w-[180px]">{description}</div>}
      </div>
    </div>
  );
}
