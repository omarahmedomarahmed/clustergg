import Icon from "@/components/Icon";
import { BADGE_ART } from "@/lib/assets";

// Badge art: badges.icon holds either a full image URL, a legacy sprite key
// (b1..b6 → generated medallion art), or an Icon name as final fallback.
export function BadgeIcon({ icon, size = 40 }: { icon: string; size?: number }) {
  const url = icon.startsWith("http")
    ? icon
    : (BADGE_ART as Record<string, string>)[icon];
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url} alt="" width={size} height={size}
        className="inline-block shrink-0 rounded-full object-cover"
        style={{ width: size, height: size, boxShadow: "0 0 14px -4px rgba(139,92,246,.7)" }}
      />
    );
  }
  return <Icon name={icon || "medal"} size={size * 0.8} className="text-amber-300" />;
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
