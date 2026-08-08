import { getContent } from "@/lib/cms";
import { buildCardBgMap, cardBgCmsKeys } from "@/lib/card-bg";
import CardBackgroundsEditor from "@/components/CardBackgroundsEditor";
import { Section } from "@/components/admin/kit";

// The Card backgrounds tab of /admin/art. Was /admin/cards.
export default async function CardsPanel() {
  const current = buildCardBgMap(await getContent(cardBgCmsKeys));

  return (
    <Section
      title="Artwork per card type"
      note="Set an image and dial in the overlay darkness so text stays readable. Leave a type empty to keep its default look. Where the words and the mascot LAND on that art is the next tab."
    >
      <CardBackgroundsEditor current={current} />
    </Section>
  );
}
