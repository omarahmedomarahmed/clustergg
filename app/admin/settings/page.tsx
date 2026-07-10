import { isDemoMode } from "@/lib/db";
import { PROVIDERS, isProviderLive } from "@/lib/providers/registry";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Settings" };

const CORE_ENV = [
  { key: "DATABASE_URL", desc: "Neon Postgres pooled connection. Unset = in-memory demo mode (resets on cold start)." },
  { key: "AUTH_SECRET", desc: "JWT session signing secret — set a long random string in production." },
  { key: "SETUP_TOKEN", desc: "Protects POST /api/setup (schema init + seed) on a real database." },
  { key: "CRON_SECRET", desc: "Bearer token required by /api/cron/sync (Vercel Cron sends it automatically)." },
  { key: "AD_ANALYTICS_SALT", desc: "Salt for hashing visitor IPs in ad impressions." },
  { key: "NEXT_PUBLIC_APP_URL", desc: "Canonical URL for OpenGraph/links (https://clustergg.com)." },
];

export default function AdminSettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Platform settings</h1>

      <div className={`glass p-5 mb-8 ${isDemoMode ? "!border-amber-400/40" : "!border-emerald-400/40"}`}>
        <div className="font-bold">{isDemoMode ? "⚠ Demo mode" : "✓ Production database connected"}</div>
        <p className="text-sm text-muted mt-1">
          {isDemoMode
            ? "Running on in-memory PGlite with seeded demo data. Everything works, but state resets on cold start. Set DATABASE_URL to a Neon connection string, redeploy, then POST /api/setup once to migrate + seed."
            : "Connected to Postgres via DATABASE_URL."}
        </p>
      </div>

      <h2 className="font-bold mb-3">Core environment</h2>
      <div className="glass overflow-x-auto mb-8">
        <table className="w-full table-cosmic min-w-[560px]">
          <thead><tr><th>Variable</th><th>Status</th><th>Purpose</th></tr></thead>
          <tbody>
            {CORE_ENV.map((v) => (
              <tr key={v.key}>
                <td className="font-mono text-xs text-cyan-300">{v.key}</td>
                <td>
                  <span className={`text-xs ${process.env[v.key] ? "text-emerald-300" : "text-amber-300"}`}>
                    {process.env[v.key] ? "● set" : "○ unset"}
                  </span>
                </td>
                <td className="text-xs text-muted">{v.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="font-bold mb-3">Game provider keys</h2>
      <div className="glass overflow-x-auto">
        <table className="w-full table-cosmic min-w-[560px]">
          <thead><tr><th>Provider</th><th>Status</th><th>Env vars</th><th>Docs</th></tr></thead>
          <tbody>
            {PROVIDERS.map((p) => (
              <tr key={p.id}>
                <td className="text-sm">{p.name}</td>
                <td>
                  <span className={`text-xs ${isProviderLive(p) ? "text-emerald-300" : p.legalFlag && p.phase === 3 ? "text-rose-300" : "text-amber-300"}`}>
                    {isProviderLive(p) ? "live" : p.legalFlag && p.phase === 3 ? "legal review" : "needs key"}
                  </span>
                </td>
                <td className="font-mono text-[10px] text-muted">{p.envVars.join(", ") || "none (public API)"}</td>
                <td>
                  {p.docsUrl && (
                    <a href={p.docsUrl} target="_blank" rel="noopener" className="text-xs text-cyan-300 hover:underline">
                      get key
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
