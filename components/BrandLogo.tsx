import { getContent } from "@/lib/cms";

// The platform logo shown in the nav + footer. Reads the admin-editable logo
// image + framing (zoom/position) from the CMS so staff can restyle it site-wide
// without a deploy. Rendered inside a fixed round frame with object-fit cover.
export default async function BrandLogo({ size = 34, className = "" }: { size?: number; className?: string }) {
  const c = await getContent(["brand.logo", "brand.logo.zoom", "brand.logo.x", "brand.logo.y"]);
  const url = c["brand.logo"] || "/assets/logo.png";
  const zoom = Number(c["brand.logo.zoom"]) || 1;
  const x = Number(c["brand.logo.x"] ?? 50);
  const y = Number(c["brand.logo.y"] ?? 50);
  return (
    <span className={`relative inline-block shrink-0 overflow-hidden rounded-full ${className}`} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Cluster" className="h-full w-full object-cover"
        style={{ objectPosition: `${x}% ${y}%`, transform: `scale(${zoom})` }} />
    </span>
  );
}
