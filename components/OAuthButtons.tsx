import { availableSigninProviders } from "@/lib/oauth";
import BrandGlyph from "@/components/BrandGlyph";

const META: Record<string, { label: string; bg: string; fg: string; border?: string }> = {
  discord: { label: "Discord", bg: "#5865f2", fg: "#fff" },
  steam: { label: "Steam", bg: "#1b2838", fg: "#c7d5e0", border: "#2a475e" },
  epic: { label: "Epic Games", bg: "#121212", fg: "#fff", border: "#2a2a2a" },
  battlenet: { label: "Battle.net", bg: "#0e1a2b", fg: "#00aeff", border: "#12365c" },
};

// Discord-first third-party sign-in. Discord always leads (the universal gamer
// identity); any other configured provider follows. `intent="link"` attaches to
// the signed-in account instead of creating a session.
export default function OAuthButtons({
  next = "/feed",
  intent = "signin",
  compact = false,
}: { next?: string; intent?: "signin" | "link"; compact?: boolean }) {
  let providers = availableSigninProviders();
  // Always surface Discord as the primary identity, even before it's configured
  // (the route shows a friendly message), so the brand is present everywhere.
  if (!providers.includes("discord")) providers = ["discord", ...providers];

  const q = `next=${encodeURIComponent(next)}${intent === "link" ? "&intent=link" : ""}`;
  const verb = intent === "link" ? "Link" : "Continue with";

  const discord = providers.find((p) => p === "discord");
  const rest = providers.filter((p) => p !== "discord");

  return (
    <div className={compact ? "flex flex-wrap gap-2" : "space-y-2.5"}>
      {discord && (
        <a href={`/api/auth/discord?${q}`}
          className={`group flex items-center justify-center gap-2.5 rounded-full font-semibold transition-transform hover:-translate-y-0.5 ${compact ? "px-4 py-2 text-sm" : "w-full px-5 py-3"}`}
          style={{ background: META.discord.bg, color: META.discord.fg, boxShadow: "0 8px 24px -8px #5865f2aa" }}>
          <BrandGlyph provider="discord" size={compact ? 18 : 22} />
          {verb} <span className="font-bold">Discord</span>
        </a>
      )}
      {rest.length > 0 && (
        <div className={compact ? "flex flex-wrap gap-2" : "grid grid-cols-1 sm:grid-cols-2 gap-2.5"}>
          {rest.map((p) => {
            const m = META[p];
            return (
              <a key={p} href={`/api/auth/${p}?${q}`}
                className={`flex items-center justify-center gap-2 rounded-full font-semibold text-sm transition-transform hover:-translate-y-0.5 ${compact ? "px-4 py-2" : "px-4 py-2.5"}`}
                style={{ background: m.bg, color: m.fg, border: m.border ? `1px solid ${m.border}` : undefined }}>
                <BrandGlyph provider={p} size={18} /> {m.label}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
