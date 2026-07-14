import { getDb, schema } from "@/lib/db";
import { BadgeIcon } from "@/components/BadgeChip";
import { saveBadge, deleteBadge } from "@/app/actions/admin";
import BadgeCriteriaBuilder from "@/components/BadgeCriteriaBuilder";
import { PROVIDERS } from "@/lib/providers/registry";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Badges" };

// Turn a stored criteria object into a plain-English line for the badge list.
function describeCriteria(c: Record<string, unknown>): string {
  switch (c.type) {
    case "account_linked":
      return c.provider ? `Links ${PROVIDERS.find((p) => p.id === c.provider)?.name ?? c.provider}` : "Links any game account";
    case "accounts_linked_count":
      return `Links ${c.min ?? 1}+ game accounts`;
    case "stat_threshold":
      return `${c.metric}${c.game ? ` (${c.game})` : ""} reaches ${c.min ?? 0}`;
    case "follower_count":
      return `Reaches ${c.min ?? 1} followers`;
    case "community_activity":
      return `${c.posts_min ?? 0} posts · ${c.reactions_received_min ?? 0} likes received`;
    case "expert_tier":
      return `Earns ${c.tier} expert tier`;
    case "challenge_result":
      return c.placement === "top1" ? "Wins a challenge" : "Places top 3 in a challenge";
    default:
      return "Custom rule";
  }
}

export default async function AdminBadgesPage() {
  const db = await getDb();
  const badges = await db.select().from(schema.badges);

  const criteriaProviders = PROVIDERS
    .filter((p) => p.capabilities.length > 0)
    .map((p) => ({ id: p.id, name: p.name, game: p.game, metrics: p.capabilities.map((c) => ({ key: c.key, label: c.label })) }));

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
          <BadgeCriteriaBuilder providers={criteriaProviders} />
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
              <div className="text-[11px] text-cyan-300/80 mt-1">{describeCriteria(b.criteria as Record<string, unknown>)}</div>
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
