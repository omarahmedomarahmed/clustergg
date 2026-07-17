import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { PROVIDERS, isProviderLive } from "@/lib/providers/registry";
import ChallengeBuilder from "@/components/ChallengeBuilder";
import Icon from "@/components/Icon";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Challenges" };

export default async function AdminChallengesPage() {
  const db = await getDb();
  const [spaces, challenges, trophies] = await Promise.all([
    db.select().from(schema.spaces),
    db.select().from(schema.challenges).orderBy(desc(schema.challenges.createdAt)).limit(50),
    db.select().from(schema.trophies),
  ]);

  const builderProviders = PROVIDERS
    .filter((p) => !p.identityOnly && p.capabilities.length > 0)
    .map((p) => ({
      id: p.id, name: p.name, game: p.game, live: isProviderLive(p),
      capabilities: p.capabilities.map((c) => ({ key: c.key, label: c.label, higherIsBetter: c.higherIsBetter })),
    }));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Challenge Builder</h1>
      <p className="text-sm text-muted mb-6">
        Pick a game and the builder shows exactly what its API can track, recommends a
        scoring engine, and publishes a glorified event page with live standings.
      </p>

      <details className="glass p-6 mb-6 group">
        <summary className="font-bold cursor-pointer list-none flex items-center gap-2">
          <Icon name="spark" size={16} className="text-cyan-300" /> Launch a new challenge
          <span className="ml-auto text-xs text-muted group-open:hidden">Open builder</span>
        </summary>
        <div className="mt-4 border-t border-violet-400/15 pt-4">
          <ChallengeBuilder
            providers={builderProviders}
            spaces={spaces.map((s) => ({ id: s.id, name: s.name, game: s.game }))}
            trophies={trophies.map((t) => ({ id: t.id, name: t.name, tier: t.tier, imageUrl: t.imageUrl }))}
          />
        </div>
      </details>

      <h2 className="text-xl font-bold mb-4">All challenges ({challenges.length})</h2>
      <div className="glass overflow-x-auto">
        <table className="w-full table-cosmic min-w-[640px]">
          <thead><tr><th>Title</th><th>Game</th><th>Cadence</th><th>Format</th><th>Status</th><th>Ends</th><th></th></tr></thead>
          <tbody>
            {challenges.map((c) => (
              <tr key={c.id}>
                <td className="font-semibold text-sm">{c.title}</td>
                <td className="text-sm text-muted">{c.game}</td>
                <td className="text-sm capitalize">{c.cadence}</td>
                <td className="text-sm">{c.format}</td>
                <td>
                  <span className={`text-xs ${c.status === "active" ? "text-emerald-300" : c.status === "completed" ? "text-cyan-300" : "text-muted"}`}>
                    {c.status}
                  </span>
                </td>
                <td className="text-xs text-muted">{timeAgo(c.endAt)}</td>
                <td><Link href={`/admin/challenges/${c.id}`} className="text-xs text-cyan-300 hover:underline">Edit / track</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
