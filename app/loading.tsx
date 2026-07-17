import { getContent } from "@/lib/cms";

// Global navigation fallback — shown while a new (dynamic) route segment loads.
// The circle color and the logo inside it are admin-editable (Brand kit).
export default async function Loading() {
  const c = await getContent(["brand.loading.color", "brand.loading.logo"]).catch(() => ({} as Record<string, string>));
  const color = c["brand.loading.color"] || "#8b5cf6";
  const logo = c["brand.loading.logo"];

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#04051a]/70 backdrop-blur-sm">
      <div className="relative h-20 w-20">
        {/* Core disc (with optional logo inside) */}
        <div className="absolute inset-3 flex items-center justify-center rounded-full overflow-hidden"
          style={{ background: logo ? "#04051a" : `radial-gradient(circle at 35% 30%, ${color}, ${color}99 65%, #0a0a1c)`, boxShadow: `0 0 30px -4px ${color}` }}>
          {logo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={logo} alt="" className="h-full w-full object-contain p-1.5" />}
        </div>
        {/* Orbiting moon */}
        <div className="absolute inset-0 animate-spin" style={{ animationDuration: "1s" }}>
          <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full" style={{ background: color, boxShadow: `0 0 10px 2px ${color}` }} />
        </div>
        <div className="absolute inset-0 rounded-full border" style={{ borderColor: `${color}44` }} />
      </div>
      <div className="mt-4 text-sm font-semibold tracking-wide grad-text animate-pulse">Traversing the cluster…</div>
    </div>
  );
}
