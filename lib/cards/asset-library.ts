import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getContent } from "@/lib/cms";
import { CARD_BG_KEYS } from "@/lib/card-bg";

// Every image already on the platform, offered to the card editor.
//
// An admin placing art on a card almost never wants to go and find a file: they
// want the mascot, or that game's globe, or the trophy, or the champion splash —
// things that already exist here. Making them re-upload art we are already
// hosting is how a card ends up carrying a second, slightly different copy of
// the same logo.
//
// So the picker is populated from the real catalogue, and upload is the fallback
// rather than the only route.

export type LibraryImage = { url: string; label: string };
export type LibraryGroup = { key: string; label: string; note: string; images: LibraryImage[] };

const cap = (list: LibraryImage[], n = 40) => list.filter((i) => !!i.url).slice(0, n);

export async function assetLibrary(): Promise<LibraryGroup[]> {
  const groups: LibraryGroup[] = [];

  // ---- Brand + platform art (from the CMS) ----
  try {
    const keys = [
      "brand.logo", "brand.wordmark", "brand.cpIcon",
      "brand.loading.astronaut", "brand.loading.logo", "brand.loading.bg",
      "brand.quest.astronaut.front", "brand.quest.astronaut.left",
      "brand.quest.astronaut.right", "brand.quest.astronaut.back",
      "brand.orb.icon", "brand.discordOrb.icon", "brand.nav.planetsIcon",
      ...CARD_BG_KEYS.map((k) => `card.bg.${k}`),
    ];
    const c = await getContent(keys);
    const label: Record<string, string> = {
      "brand.logo": "Letter mark",
      "brand.wordmark": "Wordmark",
      "brand.cpIcon": "Cluster Points coin",
      "brand.loading.astronaut": "Astronaut (loading)",
      "brand.quest.astronaut.front": "Astronaut · front",
      "brand.quest.astronaut.left": "Astronaut · left",
      "brand.quest.astronaut.right": "Astronaut · right",
      "brand.quest.astronaut.back": "Astronaut · back",
    };
    groups.push({
      key: "brand", label: "Brand & mascot",
      note: "The logo, the astronaut in each pose, and the CP coin.",
      images: cap(Object.entries(c)
        .filter(([k]) => !k.startsWith("card.bg."))
        .map(([k, url]) => ({ url, label: label[k] ?? k.replace(/^brand\./, "") }))),
    });
    groups.push({
      key: "cardbg", label: "Card background art",
      note: "Everything already uploaded in Card backgrounds — reusable as a placed image too.",
      images: cap(CARD_BG_KEYS.map((k) => ({ url: c[`card.bg.${k}`], label: k }))),
    });
  } catch { /* the picker just has fewer groups */ }

  // ---- Games: logos, covers, planet globes ----
  try {
    const db = await getDb();
    const games = await db.select({
      name: schema.games.name,
      logoUrl: schema.games.logoUrl,
      coverUrl: schema.games.coverUrl,
      planetImageUrl: schema.games.planetImageUrl,
      planetBgUrl: schema.games.planetBgUrl,
    }).from(schema.games).where(eq(schema.games.isActive, true)).orderBy(asc(schema.games.sortOrder));

    groups.push({
      key: "gameLogos", label: "Game logos",
      note: "Drop a game's mark onto any card.",
      images: cap(games.map((g) => ({ url: g.logoUrl ?? "", label: g.name }))),
    });
    groups.push({
      key: "globes", label: "Planet globes",
      note: "The floating globe art for each game world.",
      images: cap(games.map((g) => ({ url: g.planetImageUrl ?? "", label: `${g.name} globe` }))),
    });
    groups.push({
      key: "covers", label: "Game covers & space backdrops",
      note: "Wide art — good as a right-side cover or a full-bleed layer.",
      images: cap([
        ...games.map((g) => ({ url: g.coverUrl ?? "", label: `${g.name} cover` })),
        ...games.map((g) => ({ url: g.planetBgUrl ?? "", label: `${g.name} space` })),
      ], 60),
    });
  } catch { /* skip */ }

  // ---- Quest maps + trophies ----
  try {
    const db = await getDb();
    const [quests, trophies] = await Promise.all([
      db.select({ name: schema.quests.name, mapArtUrl: schema.quests.mapArtUrl, logoUrl: schema.quests.logoUrl, cardBgUrl: schema.quests.cardBgUrl })
        .from(schema.quests).where(eq(schema.quests.isActive, true)),
      db.select({ name: schema.trophies.name, imageUrl: schema.trophies.imageUrl }).from(schema.trophies).limit(40),
    ]);
    groups.push({
      key: "quests", label: "Quest maps & badges",
      note: "Treasure maps and quest marks.",
      images: cap([
        ...quests.map((q) => ({ url: q.mapArtUrl ?? "", label: `${q.name} map` })),
        ...quests.map((q) => ({ url: q.logoUrl ?? "", label: `${q.name} badge` })),
        ...quests.map((q) => ({ url: q.cardBgUrl ?? "", label: `${q.name} card art` })),
      ], 40),
    });
    groups.push({
      key: "trophies", label: "Trophies",
      note: "The prize catalogue — the same art a winner shows on their profile.",
      images: cap(trophies.map((t) => ({ url: t.imageUrl, label: t.name }))),
    });
  } catch { /* skip */ }

  return groups.filter((g) => g.images.length > 0);
}
