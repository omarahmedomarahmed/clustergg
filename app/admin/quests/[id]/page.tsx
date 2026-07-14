import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { ACTION_CATALOG } from "@/lib/quests";
import { saveQuest, deleteQuest, saveTier, deleteTier } from "@/app/actions/quests-admin";
import ImageUpload from "@/components/ImageUpload";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Edit quest" };

const ICONS = ["trophy", "users", "chart", "zap", "rocket", "star", "shield", "flame", "target", "globe", "planet", "spark"];

export default async function EditQuestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const [quest] = await db.select().from(schema.quests).where(eq(schema.quests.id, id)).limit(1);
  if (!quest) notFound();
  const tiers = await db.select().from(schema.questTiers).where(eq(schema.questTiers.questId, id)).orderBy(asc(schema.questTiers.tierIndex));
  const weights = quest.actionWeights as Record<string, number>;
  const caps = quest.dailyCaps as Record<string, number>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin/quests" className="text-xs text-cyan-300 hover:underline">← Quests</Link>
        <h1 className="text-2xl font-bold ml-2">Edit {quest.name}</h1>
      </div>

      {/* Quest fields + art + weights */}
      <form action={saveQuest.bind(null, quest.id)} className="glass p-6 space-y-5">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs text-muted">Name<input name="name" defaultValue={quest.name} className="input-cosmic mt-1" /></label>
          <label className="text-xs text-muted">Sort order<input name="sortOrder" type="number" defaultValue={quest.sortOrder} className="input-cosmic mt-1" /></label>
          <label className="text-xs text-muted sm:col-span-2">Tagline<input name="tagline" defaultValue={quest.tagline} className="input-cosmic mt-1" /></label>
          <label className="text-xs text-muted sm:col-span-2">Lore / story<textarea name="lore" rows={3} defaultValue={quest.lore} className="input-cosmic mt-1" /></label>
          <label className="flex items-center gap-2 text-sm text-muted">Color <input type="color" name="color" defaultValue={quest.color} className="h-8 w-10 rounded bg-transparent border border-white/10" /></label>
          <label className="flex items-center gap-2 text-sm text-muted">Accent <input type="color" name="accent2" defaultValue={quest.accent2} className="h-8 w-10 rounded bg-transparent border border-white/10" /></label>
          <label className="text-xs text-muted sm:col-span-2">Fallback icon<select name="icon" defaultValue={quest.icon} className="input-cosmic mt-1">{ICONS.map((i) => <option key={i} value={i}>{i}</option>)}</select></label>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <ImageUpload name="logoUrl" defaultValue={quest.logoUrl ?? ""} label="Quest emblem" aspect="1/1" rounded="rounded-xl" maxDim={512} scope="quest" hint="Square logo shown on cards + orb." />
          <ImageUpload name="cardBgUrl" defaultValue={quest.cardBgUrl ?? ""} label="Floating-card background" aspect="16/9" maxDim={1200} scope="quest" hint="Themed art behind the quest card." />
          <ImageUpload name="coverUrl" defaultValue={quest.coverUrl ?? ""} label="Cover banner" aspect="16/9" maxDim={1600} scope="quest" hint="Wide banner (optional)." />
        </div>

        {/* Action weights + caps */}
        <div>
          <div className="text-xs uppercase tracking-widest text-muted mb-2">Quest Points per action (0 = ignored) · daily cap</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {ACTION_CATALOG.map((a) => (
              <div key={a.key} className="flex items-center gap-2 rounded-lg border border-violet-400/15 px-3 py-2">
                <span className="text-sm flex-1 min-w-0 truncate" title={a.key}>{a.label}</span>
                <label className="text-[10px] text-muted">QP<input name={`weight:${a.key}`} type="number" min={0} defaultValue={weights[a.key] ?? 0} className="input-cosmic !py-1 w-16 ml-1" /></label>
                <label className="text-[10px] text-muted">cap<input name={`cap:${a.key}`} type="number" min={0} defaultValue={caps[a.key] ?? 0} className="input-cosmic !py-1 w-16 ml-1" /></label>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={quest.isActive} className="accent-violet-500" /> Active</label>
          <button className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">Save quest</button>
        </div>
      </form>

      {/* Tiers (badges) */}
      <div className="glass p-6">
        <h2 className="font-bold mb-1 flex items-center gap-2"><Icon name="trophy" size={16} className="text-cyan-300" /> Tier badges ({tiers.length})</h2>
        <p className="text-xs text-muted mb-4">Any number of tiers. A tier unlocks when the gamer&apos;s Quest Points reach its threshold. Order low → high.</p>

        <div className="space-y-3">
          {tiers.map((t) => (
            <form key={t.id} action={saveTier.bind(null, quest.id)} className="rounded-xl border border-violet-400/15 p-3 grid sm:grid-cols-[auto_1fr_auto] gap-3 items-start">
              <input type="hidden" name="tierId" value={t.id} />
              <ImageUpload name="iconUrl" defaultValue={t.iconUrl ?? ""} label="Badge art" aspect="1/1" rounded="rounded-full" maxDim={512} scope="quest" hint="" />
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-muted">Name<input name="name" defaultValue={t.name} className="input-cosmic !py-1.5 mt-1" /></label>
                <label className="text-xs text-muted">Threshold QP<input name="thresholdQp" type="number" min={0} defaultValue={t.thresholdQp} className="input-cosmic !py-1.5 mt-1" /></label>
                <label className="text-xs text-muted">Order<input name="tierIndex" type="number" defaultValue={t.tierIndex} className="input-cosmic !py-1.5 mt-1" /></label>
                <label className="flex items-center gap-2 text-xs text-muted mt-5">Accent<input type="color" name="color" defaultValue={t.color ?? quest.color} className="h-7 w-9 rounded bg-transparent border border-white/10" /></label>
                <label className="text-xs text-muted col-span-2">Story / how to earn<textarea name="description" rows={2} defaultValue={t.description} className="input-cosmic !py-1.5 mt-1" /></label>
              </div>
              <div className="flex sm:flex-col gap-2">
                <button className="glow-btn rounded-full px-4 py-1.5 text-xs font-semibold text-white">Save</button>
                <button formAction={deleteTier.bind(null, quest.id, t.id)} className="rounded-full px-4 py-1.5 text-xs border border-rose-400/40 text-rose-300">Delete</button>
              </div>
            </form>
          ))}
        </div>

        {/* Add tier */}
        <form action={saveTier.bind(null, quest.id)} className="mt-4 rounded-xl border border-dashed border-violet-400/25 p-3 grid sm:grid-cols-4 gap-2 items-end">
          <label className="text-xs text-muted">New tier name<input name="name" placeholder="e.g. Diamond" className="input-cosmic !py-1.5 mt-1" /></label>
          <label className="text-xs text-muted">Threshold QP<input name="thresholdQp" type="number" min={0} defaultValue={0} className="input-cosmic !py-1.5 mt-1" /></label>
          <label className="text-xs text-muted">Order<input name="tierIndex" type="number" defaultValue={tiers.length} className="input-cosmic !py-1.5 mt-1" /></label>
          <button className="ghost-btn rounded-full px-4 py-2 text-xs font-semibold">+ Add tier</button>
        </form>
      </div>

      <form action={deleteQuest.bind(null, quest.id)}>
        <button className="text-xs text-rose-300 hover:underline">Delete this quest</button>
      </form>
    </div>
  );
}
