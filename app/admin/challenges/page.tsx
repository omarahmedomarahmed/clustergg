import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { saveChallenge } from "@/app/actions/admin";
import { PROVIDERS, isProviderLive } from "@/lib/providers/registry";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Challenges" };

export default async function AdminChallengesPage() {
  const db = await getDb();
  const [spaces, challenges] = await Promise.all([
    db.select().from(schema.spaces),
    db.select().from(schema.challenges).orderBy(desc(schema.challenges.createdAt)).limit(50),
  ]);
  const statProviders = PROVIDERS.filter((p) => !p.identityOnly && p.capabilities.length > 0);
  const toLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Challenge Builder</h1>

      <div className="glass p-6 mb-8">
        <form action={saveChallenge} className="grid sm:grid-cols-2 gap-3">
          <input name="title" required placeholder="Title (e.g. Weekly Wins Race)" className="input-cosmic sm:col-span-2" />
          <textarea name="description" rows={2} placeholder="Description shown to players" className="input-cosmic sm:col-span-2" />
          <select name="spaceId" required className="input-cosmic">
            {spaces.map((s) => <option key={s.id} value={s.id}>{s.coverEmoji} {s.name}</option>)}
          </select>
          <select name="provider" required className="input-cosmic">
            {statProviders.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.game}){isProviderLive(p) ? " — live" : " — needs key"}
              </option>
            ))}
          </select>
          <input name="game" required placeholder="Game label (e.g. Chess)" className="input-cosmic" />
          <select name="format" className="input-cosmic">
            <option value="top3">Top 3 podium</option>
            <option value="top1">Winner takes all</option>
            <option value="threshold_race">Threshold race</option>
          </select>
          <input name="startAt" type="datetime-local" defaultValue={toLocal(new Date())} className="input-cosmic" />
          <input name="endAt" type="datetime-local" defaultValue={toLocal(new Date(Date.now() + 7 * 86400000))} className="input-cosmic" />
          <div className="sm:col-span-2">
            <label className="text-xs text-muted">Points engine — JSON of metric → points per unit gained (capability keys below)</label>
            <textarea name="pointsEngine" rows={2} className="input-cosmic font-mono text-xs mt-1" defaultValue='{"wins": 10, "games": 1}' />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-muted">Qualification conditions (optional) — JSON array of {"{metric, op, value}"} on stat deltas</label>
            <textarea name="conditions" rows={2} className="input-cosmic font-mono text-xs mt-1" defaultValue="[]" />
          </div>
          <input name="thresholdTarget" type="number" placeholder="Threshold target (races only)" className="input-cosmic" />
          <input name="prizeDescription" placeholder="Prize description" className="input-cosmic" />
          <select name="status" className="input-cosmic">
            <option value="active">Active immediately</option>
            <option value="draft">Draft (activates at start time)</option>
          </select>
          <div>
            <button className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">Create challenge</button>
          </div>
        </form>
        <details className="mt-4 text-xs text-muted">
          <summary className="cursor-pointer">Capability schema reference (valid metric keys per provider)</summary>
          <div className="mt-2 grid sm:grid-cols-2 gap-2">
            {statProviders.map((p) => (
              <div key={p.id}>
                <b className="text-ink">{p.name}:</b> {p.capabilities.map((c) => c.key).join(", ")}
              </div>
            ))}
          </div>
        </details>
      </div>

      <h2 className="text-xl font-bold mb-4">All challenges</h2>
      <div className="glass overflow-x-auto">
        <table className="w-full table-cosmic min-w-[640px]">
          <thead><tr><th>Title</th><th>Game</th><th>Format</th><th>Status</th><th>Ends</th><th></th></tr></thead>
          <tbody>
            {challenges.map((c) => (
              <tr key={c.id}>
                <td className="font-semibold text-sm">{c.title}</td>
                <td className="text-sm text-muted">{c.game}</td>
                <td className="text-sm">{c.format}</td>
                <td>
                  <span className={`text-xs ${c.status === "active" ? "text-emerald-300" : c.status === "completed" ? "text-cyan-300" : "text-muted"}`}>
                    ● {c.status}
                  </span>
                </td>
                <td className="text-xs text-muted">{timeAgo(c.endAt)}</td>
                <td><Link href={`/admin/challenges/${c.id}`} className="text-xs text-cyan-300 hover:underline">Live tracker →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
