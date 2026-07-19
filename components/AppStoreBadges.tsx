// "Coming soon" App Store + Google Play download badges. Self-contained (inline
// SVG logos, no external assets). Shown across the site + loading screen.
export default function AppStoreBadges({ className = "", size = "md", label = true }: { className?: string; size?: "sm" | "md"; label?: boolean }) {
  const h = size === "sm" ? 34 : 42;
  return (
    <div className={`flex flex-col items-center gap-1.5 ${className}`}>
      {label && <span className="text-[10px] uppercase tracking-[0.2em] text-muted">Cluster mobile — coming soon</span>}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Badge store="apple" height={h} />
        <Badge store="google" height={h} />
      </div>
    </div>
  );
}

function Badge({ store, height }: { store: "apple" | "google"; height: number }) {
  return (
    <span
      title={`${store === "apple" ? "App Store" : "Google Play"} — coming soon`}
      className="relative inline-flex items-center gap-2 rounded-xl border border-white/20 bg-black/70 px-3 text-left text-white select-none"
      style={{ height }}
      aria-disabled
    >
      {store === "apple" ? (
        <svg viewBox="0 0 24 24" width={height * 0.5} height={height * 0.5} fill="currentColor" aria-hidden><path d="M16.365 1.43c0 1.14-.42 2.2-1.13 3-.79.9-2.08 1.6-3.15 1.51-.13-1.09.42-2.24 1.09-3 .76-.86 2.11-1.5 3.19-1.51zM20.5 17.02c-.55 1.27-.82 1.84-1.53 2.96-.99 1.57-2.39 3.53-4.12 3.54-1.54.01-1.93-1-4.02-.99-2.09.01-2.52 1.01-4.06.99-1.73-.02-3.05-1.78-4.04-3.35C-.99 15.86-1.28 10.28 1.68 7.5c1.05-.99 2.4-1.62 3.83-1.62 1.46 0 2.38 1 3.99 1 1.57 0 2.53-1 4.22-1 1.28 0 2.63.7 3.6 1.9-3.16 1.73-2.64 6.24.18 7.24z" /></svg>
      ) : (
        <svg viewBox="0 0 512 512" width={height * 0.5} height={height * 0.5} aria-hidden>
          <path fill="#00d4ff" d="M47 24c-6 3-9 9-9 18v428c0 9 3 15 9 18l1 1 240-240v-1L48 23z" />
          <path fill="#00f076" d="M368 336l-80-80-240 241c8 8 20 9 33 1l287-162z" />
          <path fill="#fdd835" d="M368 336l-80-80 80-81 92 52c26 15 26 42 0 57z" />
          <path fill="#ff3a44" d="M48 23l240 233 80-80L81 22c-13-8-25-7-33 1z" />
        </svg>
      )}
      <span className="leading-tight">
        <span className="block text-[8px] uppercase tracking-wide text-white/70">{store === "apple" ? "Download on the" : "Get it on"}</span>
        <span className="block text-sm font-semibold -mt-0.5">{store === "apple" ? "App Store" : "Google Play"}</span>
      </span>
      <span className="absolute -top-1.5 -right-1.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[8px] font-bold uppercase text-black">Soon</span>
    </span>
  );
}
