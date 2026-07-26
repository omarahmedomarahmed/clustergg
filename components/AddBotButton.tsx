import BrandGlyph from "@/components/BrandGlyph";
import { installUrl } from "@/lib/discord/config";

// "Add ClusterBot to your server".
//
// Deliberately NOT the same control as "Sign in with Discord". They both wear
// Discord's colour, and confusing them is expensive in both directions: a
// gamer who wanted to sign in ends up on a permissions screen, and an owner
// who wanted the bot ends up with an account and no bot. So this one always
// says "Add to server", carries a + on the glyph, and links to the install
// URL rather than the OAuth login.
export default function AddBotButton({
  size = "md", className = "", label,
}: { size?: "sm" | "md" | "lg"; className?: string; label?: string }) {
  const href = installUrl() ?? "/discord-bot";
  const pad = size === "sm" ? "px-3.5 py-1.5 text-xs" : size === "lg" ? "px-7 py-3 text-base" : "px-5 py-2.5 text-sm";
  const glyph = size === "sm" ? 15 : size === "lg" ? 22 : 18;

  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noreferrer" : undefined}
      title="Add ClusterBot to your Discord server"
      className={`pressable inline-flex items-center justify-center gap-2 rounded-full font-bold text-white whitespace-nowrap ${pad} ${className}`}
      style={{ background: "#5865f2", boxShadow: "0 8px 22px -10px #5865f2" }}
    >
      <span className="relative inline-flex items-center justify-center">
        <BrandGlyph provider="discord" size={glyph} />
      </span>
      {label ?? "Add to server"}
    </a>
  );
}
