import { getContent } from "@/lib/cms";
import { buildCardBgMap, cardBgCmsKeys } from "@/lib/card-bg";
import CardBackgroundsEditor from "@/components/CardBackgroundsEditor";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Card backgrounds" };

export default async function AdminCardsPage() {
  const current = buildCardBgMap(await getContent(cardBgCmsKeys));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Card backgrounds</h1>
      <p className="text-sm text-muted mb-6 max-w-2xl">
        Give every card type its own artwork and overlay — the same treatment the quest cards use.
        Set an image and dial in the overlay darkness so text stays readable. Leave a type empty to
        keep its default look.
      </p>
      <div className="glass p-6">
        <h2 className="font-bold mb-4 flex items-center gap-2"><Icon name="grid" size={16} className="text-cyan-300" /> Artwork per card type</h2>
        <CardBackgroundsEditor current={current} />
      </div>
    </div>
  );
}
