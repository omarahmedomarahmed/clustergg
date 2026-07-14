import BrandGlyph from "@/components/BrandGlyph";

// The Discord handle chip — a gamer's universal identity, shown on their
// profile alongside game accounts. Discord is who they are; games are what
// they play.
export default function DiscordTag({ username, size = "sm" }: { username: string; size?: "sm" | "md" }) {
  const pad = size === "md" ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${pad}`}
      style={{ background: "#5865f21f", color: "#c1c8f7", border: "1px solid #5865f240" }}>
      <BrandGlyph provider="discord" size={size === "md" ? 16 : 13} /> {username}
    </span>
  );
}
