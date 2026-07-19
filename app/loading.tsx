import { getContent } from "@/lib/cms";
import LoadingPhrases from "@/components/LoadingPhrases";
import BrandHeader from "@/components/BrandHeader";
import AdSlot from "@/components/AdSlot";
import AppStoreBadges from "@/components/AppStoreBadges";

// Global navigation fallback — shown while a new (dynamic) route segment loads.
// Fully admin-editable (Brand kit): orb color/size/logo, the gamified astronaut,
// rotating phrases + timing, a background image, an ad slot, and the wordmark.
export default async function Loading() {
  const c = await getContent([
    "brand.loading.color", "brand.loading.logo", "brand.loading.phrases",
    "brand.loading.interval", "brand.loading.astronaut", "brand.loading.bg",
    "brand.loading.wordmark", "brand.loading.orbSize",
  ]).catch(() => ({} as Record<string, string>));

  const color = c["brand.loading.color"] || "#8b5cf6";
  const logo = c["brand.loading.logo"];
  const astronaut = c["brand.loading.astronaut"];
  const bg = c["brand.loading.bg"];
  const showWordmark = (c["brand.loading.wordmark"] ?? "1") !== "0";
  const orb = Math.max(72, Math.min(200, Number(c["brand.loading.orbSize"]) || 80));
  const intervalMs = Math.max(1, Math.min(20, Number(c["brand.loading.interval"]) || 3)) * 1000;
  const phrases = (c["brand.loading.phrases"] || "Traversing the cluster…")
    .split("\n").map((s) => s.trim()).filter(Boolean);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden">
      {/* Background — admin art or the default dark blur */}
      {bg ? (
        <div className="absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: `linear-gradient(rgba(4,5,26,0.72), rgba(4,5,26,0.86)), url(${bg})` }} />
      ) : (
        <div className="absolute inset-0 -z-10 bg-[#04051a]/80 backdrop-blur-sm" />
      )}

      <div className="flex flex-col items-center">
        {/* Astronaut riding above the orb */}
        {astronaut && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={astronaut} alt="" className="mb-2 float-y object-contain drop-shadow-[0_0_16px_rgba(34,211,238,0.5)]" style={{ height: orb * 0.9 }} />
        )}

        {/* The orb */}
        <div className="relative" style={{ height: orb, width: orb }}>
          <div className="absolute inset-[12%] flex items-center justify-center rounded-full overflow-hidden"
            style={{ background: logo ? "#04051a" : `radial-gradient(circle at 35% 30%, ${color}, ${color}99 65%, #0a0a1c)`, boxShadow: `0 0 30px -4px ${color}` }}>
            {logo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={logo} alt="" className="h-full w-full object-contain p-1.5" />}
          </div>
          <div className="absolute inset-0 animate-spin" style={{ animationDuration: "1s" }}>
            <span className="absolute left-1/2 top-0 h-[12%] w-[12%] -translate-x-1/2 rounded-full" style={{ background: color, boxShadow: `0 0 10px 2px ${color}` }} />
          </div>
          <div className="absolute inset-0 rounded-full border" style={{ borderColor: `${color}44` }} />
        </div>

        <LoadingPhrases phrases={phrases} intervalMs={intervalMs} />

        {/* Ad slot — only renders if a creative is assigned to loading_screen */}
        <div className="mt-6 w-full max-w-[728px] px-4">
          <AdSlot placement="loading_screen" className="mx-auto" />
        </div>
      </div>

      {/* Wordmark + app badges pinned to the bottom */}
      <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-3">
        <AppStoreBadges size="sm" />
        {showWordmark && <div className="opacity-90"><BrandHeader placement="footer" /></div>}
      </div>
    </div>
  );
}
