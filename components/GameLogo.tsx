import Icon from "@/components/Icon";

// Game logo from the DB-managed games catalog; falls back to a styled
// gamepad tile until an admin uploads the real logo (/admin/games).
export default function GameLogo({
  logoUrl, name, size = 40, className = "", rounded = "rounded-xl",
}: { logoUrl?: string | null; name: string; size?: number; className?: string; rounded?: string }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl} alt={name} width={size} height={size}
        className={`${rounded} object-cover border border-violet-400/25 bg-black/40 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={`${rounded} flex items-center justify-center border border-violet-400/25 bg-gradient-to-br from-violet-600/30 to-cyan-600/20 text-violet-200 ${className}`}
      style={{ width: size, height: size }}
      title={name}
    >
      <Icon name="gamepad" size={size * 0.55} />
    </div>
  );
}
