// What the nav needs to know about whoever is looking at the page.
//
// Split from `lib/site/nav.ts` so the four states and the switcher stay pure
// and assertable. This half needs `next/headers` and therefore a live request;
// the half that decides anything does not, and that is what lets the rule
// *"never a brand"* be guarded without a browser.

import { cookies } from "next/headers";
import { getDb, schema } from "../db/index.ts";
import { eq, inArray } from "drizzle-orm";
import { currentGamer } from "../auth/current.ts";
import type { NavFacts } from "./nav.ts";

/**
 * Resolve the nav's facts, and **never throw**.
 *
 * House rule 11. This runs in the site header on every public page, including
 * pages a signed-out stranger loads — a nav that can throw is a nav that takes
 * the homepage down, and the homepage is the product.
 */
export async function navContext(onPublicSite = true): Promise<NavFacts> {
  const empty: NavFacts = {
    gamer: null,
    brand: null,
    managedGuilds: [],
    installableGuilds: [],
    onPublicSite,
  };

  try {
    const gamer = await currentGamer();

    // A brand session is a cookie against `brand_users`, on its own route and
    // its own table (I2). It is read here only so a brand browsing the public
    // site gets a way home — never so a gamer can be offered one.
    const jar = await cookies();
    const brandCookie = jar
      .getAll()
      .find((c) => c.name.startsWith("portal_brand_") && c.value.length > 0);
    let brand: NavFacts["brand"] = null;
    if (brandCookie) {
      const brandId = brandCookie.name.replace("portal_brand_", "");
      const db = await getDb();
      const [row] = await db
        .select({ id: schema.brands.id, name: schema.brands.name })
        .from(schema.brands)
        .where(eq(schema.brands.id, brandId));
      brand = row ?? null;
    }

    if (!gamer) return { ...empty, brand };

    // Servers this Discord identity has been **seen** administering (G5), and
    // which of them have the bot. A server without it is an *Add Cluster to …*
    // entry rather than a portal link (12 §9).
    const db = await getDb();
    const managed: NavFacts["managedGuilds"] = [];
    const installable: NavFacts["installableGuilds"] = [];
    if (gamer.discordId) {
      const seen = await db
        .select({ guildId: schema.guildAdmins.guildId })
        .from(schema.guildAdmins)
        .where(eq(schema.guildAdmins.discordId, gamer.discordId));
      const ids = [...new Set(seen.map((s) => s.guildId))];
      if (ids.length > 0) {
        const guilds = await db
          .select()
          .from(schema.guilds)
          .where(inArray(schema.guilds.guildId, ids));
        for (const g of guilds) {
          (g.removedAt ? installable : managed).push({ guildId: g.guildId, name: g.name });
        }
      }
    }

    // `currentGamer` returns the session's narrow shape deliberately — a
    // session should not carry a display name that can go stale. The nav needs
    // one, so it reads it, once.
    const [row] = await db
      .select({ displayName: schema.users.displayName })
      .from(schema.users)
      .where(eq(schema.users.id, gamer.id));

    return {
      gamer: { displayName: row?.displayName ?? gamer.slug, slug: gamer.slug },
      brand,
      managedGuilds: managed,
      installableGuilds: installable,
      onPublicSite,
    };
  } catch {
    // A nav that cannot resolve renders as a guest's. Honest, and it keeps the
    // page up — which is the whole of house rule 11.
    return empty;
  }
}
