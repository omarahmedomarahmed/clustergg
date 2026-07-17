import { getContent } from "@/lib/cms";

// The brand lockup shown in the nav / footer. Admin chooses per placement
// whether to show the square letter-mark, the wide wordmark, or both — and the
// wordmark image replaces the gradient "CLUSTER" text when set.
export default async function BrandHeader({ placement = "nav" }: { placement?: "nav" | "footer" }) {
  const modeKey = placement === "nav" ? "brand.nav.mode" : "brand.footer.mode";
  const c = await getContent(["brand.logo", "brand.logo.zoom", "brand.logo.x", "brand.logo.y", "brand.wordmark", modeKey]);
  const mode = c[modeKey] || "both";
  const markUrl = c["brand.logo"] || "/assets/logo.png";
  const zoom = Number(c["brand.logo.zoom"]) || 1;
  const x = Number(c["brand.logo.x"] ?? 50);
  const y = Number(c["brand.logo.y"] ?? 50);
  const wordmark = c["brand.wordmark"];

  const markSize = placement === "nav" ? 34 : 28;
  const wmHeight = placement === "nav" ? 24 : 20;

  const showMark = mode !== "wordmark";
  const word = mode === "mark"
    ? null
    : wordmark
      ? (/* eslint-disable-next-line @next/next/no-img-element */ <img src={wordmark} alt="Cluster" style={{ height: wmHeight }} className="w-auto object-contain" />)
      : <span className={`${placement === "nav" ? "hidden sm:inline text-lg" : ""} font-bold tracking-wide grad-text`}>CLUSTER</span>;

  return (
    <span className="flex items-center gap-2.5">
      {showMark && (
        <span className={`relative inline-block shrink-0 overflow-hidden rounded-full ${placement === "nav" ? "pulse-glow" : ""}`} style={{ width: markSize, height: markSize }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markUrl} alt="Cluster" className="h-full w-full object-cover" style={{ objectPosition: `${x}% ${y}%`, transform: `scale(${zoom})` }} />
        </span>
      )}
      {word}
    </span>
  );
}
