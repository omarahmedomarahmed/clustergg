import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { createQuest } from "@/app/actions/quests-admin";
import Icon from "@/components/Icon";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Quests" };

const ICONS = ["trophy", "users", "chart", "zap", "rocket", "star", "shield", "flame", "target", "globe", "planet", "spark"];

export default async function AdminQuestsPage() {
  const db = await getDb();
  const quests = await db.select().from(schema.quests).orderBy(asc(schema.quests.sortOrder));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Quests</h1>
      <p className="text-sm text-muted mb-6">Themed progression tracks. Each quest has any number of tier badges and listens to gamer actions for Quest Points. Everything here is editable and shown live.</p>

      <div className="glass p-6 mb-8">
        <h2 className="font-bold mb-4">New quest</h2>
        <form action={createQuest} className="grid sm:grid-cols-2 gap-3">
          <input name="name" required placeholder="Quest name (e.g. Conquest)" className="input-cosmic" />
          <input name="key" placeholder="key (optional slug)" className="input-cosmic" />
          <input name="tagline" placeholder="Tagline" className="input-cosmic sm:col-span-2" />
          <textarea name="lore" rows={2} placeholder="Lore / story" className="input-cosmic sm:col-span-2" />
          <label className="flex items-center gap-2 text-sm text-muted">Color <input type="color" name="color" defaultValue="#8b5cf6" className="h-8 w-10 rounded bg-transparent border border-white/10" /></label>
          <label className="flex items-center gap-2 text-sm text-muted">Accent <input type="color" name="accent2" defaultValue="#22d3ee" className="h-8 w-10 rounded bg-transparent border border-white/10" /></label>
          <select name="icon" className="input-cosmic sm:col-span-2">{ICONS.map((i) => <option key={i} value={i}>{i}</option>)}</select>
          <div className="sm:col-span-2"><SubmitButton pendingText="Creating…" className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">Create quest</SubmitButton></div>
        </form>
      </div>

      <div className="space-y-3">
        {quests.map((q) => (
          <Link key={q.id} href={`/admin/quests/${q.id}`} className="glass p-4 flex items-center gap-4 hover:border-violet-400/40 transition-colors">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: `${q.color}22`, border: `1px solid ${q.color}55` }}>
              {q.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={q.logoUrl} alt="" className="h-7 w-7 object-contain" /> : <Icon name={q.icon} size={20} style={{ color: q.color }} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold">{q.name} {!q.isActive && <span className="text-xs text-rose-300">(hidden)</span>}</div>
              <div className="text-xs text-muted truncate">{q.tagline}</div>
            </div>
            <span className="text-xs text-cyan-300">Edit →</span>
          </Link>
        ))}
        {quests.length === 0 && <p className="text-sm text-muted">No quests yet — the defaults seed on next boot, or create one above.</p>}
      </div>
    </div>
  );
}
