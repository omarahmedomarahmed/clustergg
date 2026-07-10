import { getDb, schema } from "@/lib/db";
import { savePlacement } from "@/app/actions/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Placements" };

export default async function AdminPlacementsPage() {
  const db = await getDb();
  const placements = await db.select().from(schema.adPlacements);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Ad placements</h1>
      <p className="text-sm text-muted mb-6">
        The eight inventory slots from the plan. Edit sizes, rotation cadence and caps —
        the serving layer picks these up immediately.
      </p>
      <div className="space-y-4">
        {placements.map((p) => (
          <form key={p.id} action={savePlacement} className="glass p-5 grid sm:grid-cols-3 md:grid-cols-6 gap-3 items-end">
            <input type="hidden" name="placementId" value={p.id} />
            <div className="sm:col-span-3 md:col-span-2">
              <div className="font-mono text-xs text-cyan-300">{p.key}</div>
              <input name="pageScope" defaultValue={p.pageScope} className="input-cosmic mt-1 text-sm" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted">Device</label>
              <select name="device" defaultValue={p.device} className="input-cosmic mt-1 text-sm">
                <option value="both">both</option>
                <option value="desktop">desktop</option>
                <option value="mobile">mobile</option>
              </select>
            </div>
            <div className="flex gap-2">
              <div>
                <label className="text-[10px] uppercase text-muted">W</label>
                <input name="width" type="number" defaultValue={p.width} className="input-cosmic mt-1 text-sm" />
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted">H</label>
                <input name="height" type="number" defaultValue={p.height} className="input-cosmic mt-1 text-sm" />
              </div>
            </div>
            <div className="flex gap-2">
              <div>
                <label className="text-[10px] uppercase text-muted">Max rot.</label>
                <input name="maxCreativesInRotation" type="number" defaultValue={p.maxCreativesInRotation} className="input-cosmic mt-1 text-sm" />
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted">Interval s</label>
                <input name="rotationIntervalSeconds" type="number" defaultValue={p.rotationIntervalSeconds} className="input-cosmic mt-1 text-sm" />
              </div>
            </div>
            <button className="ghost-btn rounded-full px-4 py-2 text-xs h-fit">Save</button>
          </form>
        ))}
      </div>
    </div>
  );
}
