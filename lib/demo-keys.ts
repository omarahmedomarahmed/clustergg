import { eq, like, or, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { newPortalKey } from "@/lib/portal-auth";
import { newAccessKey } from "@/lib/brands";

// A PREDICTABLE CREDENTIAL IS NOT A CREDENTIAL. BR1.
//
// ===== WHAT WAS WRONG =====
//
// The seeds minted portal keys by deriving them from something public:
//
//     brands          `DEMO-${slug.toUpperCase()}`         seed-activity.ts
//     discord_guilds  `DEMO-${guildId.slice(-8)}`          seed.ts
//
// A brand's slug is in its own public URL. So `/brands/ionmark?key=DEMO-IONMARK`
// opened Ionmark's portal — campaigns, spend, delivery, billing, messages —
// to anybody who could read the address bar. The audit confirmed it by guessing
// one and walking in.
//
// Production has never run the demo seed, so this was never an active exposure.
// It is fixed anyway, because "the deployment that ran it was only ever a demo"
// is a fact about history and not a property of the code, and the next person to
// point the seed at a real database would not know to check.
//
// ===== WHY THE DEMO STILL GETS A FIXED KEY, AND WHY THAT IS SAFE =====
//
// `lib/shots.ts` opens the demo portals by URL to capture screenshots
// (`/servers/demo-guild-nebula-1?key=DEMO-DNEBULA1`), and the browser suites do
// the same. Those URLs have to be knowable in advance or the capture harness
// cannot sign in at all.
//
// That is a legitimate need, and it is legitimate ONLY in the in-process demo,
// where there is no customer behind the key and the whole database is rebuilt
// on every boot. So the fixed key survives — behind a gate that makes writing
// one anywhere else a hard failure rather than a silent downgrade.
//
// The failure is loud on purpose. `POST /api/setup?demo=1` against a real Neon
// database would previously have seeded guessable keys into production and
// answered `{ok: true}`; it now throws, and the message says which key and why.

const DEMO_PREFIX = "DEMO-";

/** The in-process demo: PGlite, no `DATABASE_URL`, rebuilt on every boot. */
function inDemo(): boolean {
  return process.env.DEMO_DB === "1" || !process.env.DATABASE_URL;
}

export const DEMO_KEY_REFUSED =
  "Refusing to write a predictable portal key outside the in-process demo. "
  + "Keys of the form DEMO-<something public> are derivable from a brand slug or "
  + "a guild id, which means the portal they open is derivable too. Seed a real "
  + "database without `demo=1`, or set DEMO_DB=1 if this really is the demo.";

/**
 * A fixed, human-typeable key for the demo — and a thrown error anywhere else.
 *
 * Takes the value rather than building it so the two call sites keep their own
 * shapes (`DEMO-DNEBULA1`, `DEMO-NEBULATECH`), which `lib/shots.ts` and the
 * browser suites both hard-code.
 */
export function demoOnlyKey(key: string): string {
  if (!inDemo()) throw new Error(`${DEMO_KEY_REFUSED} (refused: ${key})`);
  return key;
}

export function isDemoKey(key: string | null | undefined): boolean {
  return !!key && key.startsWith(DEMO_PREFIX);
}

export type RotationReport = { brands: number; guilds: number };

/**
 * Replace every predictable key on a real database with a random one.
 *
 * Runs on boot outside the demo (see `lib/db/index.ts`). A no-op on every
 * deployment that never ran the demo seed, which is all of them today — it
 * exists so that "somebody once pointed the demo seed at this database" is
 * recoverable without anybody having to notice.
 *
 * Row by row rather than one UPDATE, because each row needs its OWN random
 * value. A single statement would either need SQL to generate the key — which
 * would be a second implementation of `newPortalKey` that could drift from the
 * first — or would give every rotated row the same key, which is worse than the
 * bug it is fixing.
 *
 * Never throws: a boot that cannot rotate must still boot. The keys it failed
 * to rotate are exactly as guessable as they were a moment ago, and refusing to
 * start would take a working platform down over a demo artefact.
 */
export async function rotateDemoKeys(db: DB): Promise<RotationReport> {
  const report: RotationReport = { brands: 0, guilds: 0 };
  if (inDemo()) return report;

  try {
    const brands = await db.select({ id: schema.brands.id, key: schema.brands.accessKey })
      .from(schema.brands).where(like(schema.brands.accessKey, `${DEMO_PREFIX}%`));
    for (const b of brands) {
      await db.update(schema.brands).set({ accessKey: newAccessKey() })
        .where(eq(schema.brands.id, b.id));
      report.brands++;
    }

    const guilds = await db.select({ id: schema.discordGuilds.guildId, key: schema.discordGuilds.portalKey })
      .from(schema.discordGuilds).where(like(schema.discordGuilds.portalKey, `${DEMO_PREFIX}%`));
    for (const g of guilds) {
      await db.update(schema.discordGuilds).set({ portalKey: newPortalKey() })
        .where(eq(schema.discordGuilds.guildId, g.id));
      report.guilds++;
    }

    if (report.brands || report.guilds) {
      // Loud, because somebody is now locked out and has to be sent a new key.
      // A silent rotation is the B45 failure in a different costume: access
      // moved and nobody told the person who lost it.
      console.warn(
        `[keys] rotated ${report.brands} brand and ${report.guilds} server portal key(s) that were `
        + "predictable (DEMO-…). Whoever held them is now locked out and needs the new key sent to them.",
      );
    }
  } catch (e) {
    console.error("[keys] could not rotate predictable portal keys:", String(e).slice(0, 200));
  }
  return report;
}

/** Anything still predictable, for the guard in `tests/db/portal-keys.mts`. */
export async function predictableKeyCount(db: DB): Promise<number> {
  const [row] = await db.select({ c: sql<number>`count(*)` }).from(schema.brands)
    .where(or(like(schema.brands.accessKey, `${DEMO_PREFIX}%`)));
  const [row2] = await db.select({ c: sql<number>`count(*)` }).from(schema.discordGuilds)
    .where(or(like(schema.discordGuilds.portalKey, `${DEMO_PREFIX}%`)));
  return Number(row?.c ?? 0) + Number(row2?.c ?? 0);
}
