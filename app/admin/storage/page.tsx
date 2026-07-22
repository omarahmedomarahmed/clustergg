import { eq } from "drizzle-orm";
import { collectImageRefs, measureSizes, classifyUrl, type ImageCategory } from "@/lib/storage-audit";
import { getDb, schema } from "@/lib/db";
import { gameHasDirectory } from "@/lib/game-entities";
import { getSnapshotMeta } from "@/lib/game-world-cache";
import RehostImagesButton from "@/components/RehostImagesButton";
import GameWorldSyncPanel from "@/components/GameWorldSyncPanel";
import StorageCompressor from "@/components/StorageCompressor";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
// Give the game-world "Sync + art" action room to re-host images (best-effort;
// the sync itself also self-limits to a time budget under this).
export const maxDuration = 60;
export const metadata = { title: "Admin · Image storage" };

const CAT_META: Record<ImageCategory, { label: string; cls: string; note: string }> = {
  "vercel-blob": { label: "Vercel Blob", cls: "text-emerald-300 border-emerald-400/30 bg-emerald-500/10", note: "✓ served from our own storage" },
  "higgsfield": { label: "Higgsfield / CDN", cls: "text-amber-300 border-amber-400/30 bg-amber-500/10", note: "should be re-hosted to Blob" },
  "inline-dataurl": { label: "Inline data-URL", cls: "text-rose-300 border-rose-400/30 bg-rose-500/10", note: "stored IN the database — bloats Neon" },
  "external": { label: "External", cls: "text-sky-300 border-sky-400/30 bg-sky-500/10", note: "hosted elsewhere (e.g. Discord)" },
  "empty": { label: "—", cls: "text-muted border-white/10", note: "" },
};

const HUGE = 500 * 1024; // 0.5 MB — flag anything bigger to compress
const kb = (n: number) => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${Math.round(n / 1024)} KB`;

export default async function AdminStoragePage() {
  const refs = await collectImageRefs();
  const sizes = await measureSizes(refs);

  // Game-world snapshot status: every active catalogue game + when it was cached.
  const db = await getDb();
  const activeGames = await db.select({ name: schema.games.name }).from(schema.games).where(eq(schema.games.isActive, true));
  const dirGames = [...new Set(activeGames.map((g) => g.name))].filter(gameHasDirectory);
  const gwRows = await Promise.all(dirGames.map(async (game) => {
    const meta = await getSnapshotMeta(game);
    return { game, syncedAt: meta?.syncedAt ?? null, art: meta?.art ?? false, count: meta?.count ?? 0 };
  }));

  const rows = refs.map((r) => ({ ...r, cat: classifyUrl(r.url), size: sizes.get(r.url) ?? null }))
    .sort((a, b) => (b.size ?? -1) - (a.size ?? -1));

  const byCat = new Map<ImageCategory, number>();
  for (const r of rows) byCat.set(r.cat, (byCat.get(r.cat) ?? 0) + 1);
  const totalBytes = [...new Set(rows.map((r) => r.url))].reduce((s, u) => s + (sizes.get(u) ?? 0), 0);
  const higgs = byCat.get("higgsfield") ?? 0;
  const inline = byCat.get("inline-dataurl") ?? 0;
  const needsRehost = higgs + inline;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Image storage audit</h1>
        <p className="text-sm text-muted mt-1">Every image the platform stores — where it lives (our Blob vs Higgsfield) and how big it is, so you know exactly what to compress. Neon should only ever hold short Blob links.</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="Total images" value={String(rows.length)} />
        <Stat label="On Vercel Blob" value={String(byCat.get("vercel-blob") ?? 0)} accent="#34d399" />
        <Stat label="On Higgsfield/CDN" value={String(higgs)} accent={higgs ? "#fbbf24" : undefined} />
        <Stat label="Inline in DB" value={String(inline)} accent={inline ? "#fb7185" : undefined} />
        <Stat label="Total art weight" value={kb(totalBytes)} />
      </div>

      {/* Re-host action */}
      <div className="glass p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {needsRehost === 0
            ? <span className="text-emerald-300 inline-flex items-center gap-1.5"><Icon name="check" size={15} /> Everything is on Blob. Neon is storing only short links.</span>
            : <span className="text-amber-200">{needsRehost} image{needsRehost === 1 ? "" : "s"} still on Higgsfield/CDN or inline — re-host them so Neon stays lean.</span>}
        </div>
        <RehostImagesButton />
      </div>

      {/* Game-world catalogue snapshots */}
      <GameWorldSyncPanel rows={gwRows} />

      {/* Bulk compress + replace + delete (fixes Vercel Blob data transfer) */}
      <StorageCompressor rows={rows.map((r) => ({ url: r.url, label: r.label, table: r.table, field: r.field, size: r.size, cat: r.cat }))} />

      {/* Full table */}
      <div className="glass overflow-x-auto">
        <table className="w-full table-cosmic min-w-[720px]">
          <thead><tr><th></th><th>Where</th><th>Item</th><th>Source</th><th>Size</th><th></th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const m = CAT_META[r.cat];
              return (
                <tr key={i} className="hover:bg-white/5">
                  <td className="w-14">
                    <div className="h-9 w-9 rounded-md overflow-hidden border border-white/10 bg-black/40">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </div>
                  </td>
                  <td className="text-xs font-mono text-cyan-300 whitespace-nowrap">{r.table}·{r.field}</td>
                  <td className="text-sm truncate max-w-[220px]">{r.label}</td>
                  <td><span className={`text-[11px] rounded-full border px-2 py-0.5 ${m.cls}`}>{m.label}</span></td>
                  <td className={`text-sm font-bold whitespace-nowrap ${(r.size ?? 0) >= HUGE ? "text-rose-300" : "text-cyan-200"}`}>{r.size != null ? kb(r.size) : <span className="text-muted text-xs">—</span>}</td>
                  <td><a href={r.url} target="_blank" rel="noopener" className="text-xs text-cyan-300 hover:underline inline-flex items-center gap-1"><Icon name="link" size={11} /> open</a></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="glass p-4 text-center">
      <div className="text-2xl font-bold" style={accent ? { color: accent } : { color: "#a5f3fc" }}>{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted mt-1">{label}</div>
    </div>
  );
}
