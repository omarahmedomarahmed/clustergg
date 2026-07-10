import { getDb, schema } from "@/lib/db";
import { saveTrophy, deleteTrophy } from "@/app/actions/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Trophies" };

export default async function AdminTrophiesPage() {
  const db = await getDb();
  const trophies = await db.select().from(schema.trophies);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Trophy library</h1>
      <p className="text-sm text-muted mb-6">
        Prize art attached to challenges. Winners display their trophy on their profile.
        Add game-themed trophies by pasting any hosted image URL.
      </p>

      <div className="glass p-6 mb-8">
        <h2 className="font-bold mb-4">Add trophy</h2>
        <form action={saveTrophy} className="grid sm:grid-cols-2 gap-3">
          <input name="name" required placeholder="Trophy name" className="input-cosmic" />
          <input name="imageUrl" required placeholder="Image URL" className="input-cosmic" />
          <select name="tier" className="input-cosmic">
            {["gold", "silver", "bronze", "legendary"].map((t) => <option key={t}>{t}</option>)}
          </select>
          <input name="game" placeholder="Game (optional — blank = universal)" className="input-cosmic" />
          <div><button className="glow-btn pressable rounded-full px-6 py-2 text-sm font-semibold text-white">Add trophy</button></div>
        </form>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {trophies.map((t) => (
          <div key={t.id} className="glass p-4 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.imageUrl} alt={t.name} className="mx-auto h-32 object-contain" />
            <div className="font-semibold text-sm mt-2">{t.name}</div>
            <div className="text-xs text-muted capitalize">{t.tier}{t.game ? ` · ${t.game}` : " · universal"}</div>
            <form action={deleteTrophy.bind(null, t.id)} className="mt-2">
              <button className="text-xs text-rose-300 hover:underline">Delete</button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
