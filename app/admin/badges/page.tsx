import { getDb, schema } from "@/lib/db";
import { BadgeIcon } from "@/components/BadgeChip";
import { saveBadge, deleteBadge } from "@/app/actions/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Badges" };

export default async function AdminBadgesPage() {
  const db = await getDb();
  const badges = await db.select().from(schema.badges);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Badges</h1>

      <div className="glass p-6 mb-8">
        <h2 className="font-bold mb-4">Create badge</h2>
        <form action={saveBadge} className="grid sm:grid-cols-2 gap-3">
          <input name="code" required placeholder="code (unique, e.g. void_walker)" className="input-cosmic" />
          <input name="name" required placeholder="Name" className="input-cosmic" />
          <input name="description" required placeholder="Description" className="input-cosmic sm:col-span-2" />
          <select name="icon" className="input-cosmic">
            {["b1", "b2", "b3", "b4", "b5", "b6"].map((i) => <option key={i} value={i}>Sprite {i}</option>)}
          </select>
          <select name="category" className="input-cosmic">
            {["platform", "game", "community", "challenge"].map((c) => <option key={c}>{c}</option>)}
          </select>
          <textarea
            name="criteria" rows={2} className="input-cosmic sm:col-span-2 font-mono text-xs"
            defaultValue='{"type":"stat_threshold","metric":"blitz_rating","min":2000}'
          />
          <p className="text-xs text-muted sm:col-span-2">
            Criteria types: account_linked, accounts_linked_count, stat_threshold, follower_count,
            community_activity, expert_tier, challenge_result.
          </p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked className="accent-violet-500" /> Active</label>
          <div className="sm:col-span-2">
            <button className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">Create badge</button>
          </div>
        </form>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {badges.map((b) => (
          <div key={b.id} className="glass p-4 flex items-start gap-3">
            <BadgeIcon icon={b.icon} size={44} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{b.name} {!b.isActive && <span className="text-xs text-rose-300">(inactive)</span>}</div>
              <div className="text-xs text-muted">{b.description}</div>
              <code className="text-[10px] text-cyan-300/80 block mt-1 truncate">{JSON.stringify(b.criteria)}</code>
            </div>
            <form action={deleteBadge.bind(null, b.id)}>
              <button className="text-xs text-rose-300 hover:underline">Delete</button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
