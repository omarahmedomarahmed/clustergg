import { getContent } from "@/lib/cms";

// The brand lockup shown in the nav / footer. Admin chooses per placement
// whether to show the square letter-mark, the wide wordmark, or both — and the
// wordmark image replaces the gradient "CLUSTER" text when set.
export default async function BrandHeader({ placement = "nav" }: { placement?: "nav" | "footer" }) {
  const modeKey = placement === "nav" ? "brand.nav.mode" : "brand.footer.mode";
  const c = await getContent(["brand.logo", "brand.logo.zoom", "brand.logo.x", "brand.logo.y", "brand.wordmark", "brand.wordmark.zoom", modeKey]);
  const mode = c[modeKey] || "both";
  const markUrl = c["brand.logo"] || "/assets/logo.png";
  // No custom logo uploaded yet → the built-in placeholder path doesn't exist as
  // a file, so render a gradient "C" glyph instead of a broken image.
  const hasCustomMark = !!markUrl && markUrl !== "/assets/logo.png";
  const zoom = Number(c["brand.logo.zoom"]) || 1;
  const x = Number(c["brand.logo.x"] ?? 50);
  const y = Number(c["brand.logo.y"] ?? 50);
  const wordmark = c["brand.wordmark"];
  const wmZoom = Number(c["brand.wordmark.zoom"]) || 1;

  // Big, glorified marks — the square C mark matches the game-logo size and the
  // wordmark renders large and wide by default (the admin crops it to fill the
  // frame in the brand kit). `wmZoom` stays an optional extra multiplier.
  const markSize = placement === "nav" ? 44 : 34;
  const wmHeight = (placement === "nav" ? 54 : 40) * wmZoom;

  const showMark = mode !== "wordmark";
  const word = mode === "mark"
    ? null
    : wordmark
      ? (/* eslint-disable-next-line @next/next/no-img-element */ <img src={wordmark} alt="Cluster" style={{ height: wmHeight }} className={`w-auto object-contain ${placement === "nav" ? "max-w-[160px] sm:max-w-[260px]" : "max-w-[220px]"}`} />)
      : <span className={`${placement === "nav" ? "hidden sm:inline text-2xl" : "text-lg"} font-bold tracking-wide grad-text`}>CLUSTER</span>;

  return (
    <span className="flex items-center gap-2.5">
      {showMark && (
        <span className={`relative inline-flex items-center justify-center shrink-0 overflow-hidden rounded-xl ring-1 ring-violet-400/30 ${placement === "nav" ? "pulse-glow" : ""}`} style={{ width: markSize, height: markSize }}>
          {hasCustomMark ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={markUrl} alt="Cluster" className="h-full w-full object-cover" style={{ objectPosition: `${x}% ${y}%`, transform: `scale(${zoom})` }} />
          ) : (
            <span aria-label="Cluster" className="flex h-full w-full items-center justify-center font-black text-white"
              style={{ fontSize: markSize * 0.58, background: "radial-gradient(circle at 30% 25%, #8b5cf6, #22d3ee 95%)" }}>C</span>
          )}
        </span>
      )}
      {word}
    </span>
  );
}
