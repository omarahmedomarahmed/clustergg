// Creating a gamer, and setting the two answers onboarding asks for.
//
// No email (G2). No password anywhere on this platform — a gamer arrives from
// Discord, an owner arrives with a portal key. What identifies a gamer is
// their Discord id, and the slug is derived from their display name through
// the ported slugifier, which is the reason a gamer called 日本語ゲーマー does
// not end up at `/u/gamer`.

import { eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid, slugify } from "../core/utils.ts";
import { isAgeBand, type AgeBand } from "./age.ts";
import { isCountryAllowed } from "./countries.ts";

/**
 * A slug nobody else holds.
 *
 * `slugify` returns empty for scripts with no Latin transliteration, and that
 * is a real answer — the fallback here says what the thing is (`gamer-<id>`)
 * rather than claiming the bare word `gamer`, which the first such person
 * would otherwise occupy permanently.
 */
async function freeSlug(db: DB, displayName: string, id: string): Promise<string> {
  const base = slugify(displayName) || `gamer-${id.toLowerCase().slice(0, 6)}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${id.toLowerCase().slice(0, attempt + 2)}`;
    const [taken] = await db
      .select({ slug: schema.users.slug })
      .from(schema.users)
      .where(eq(schema.users.slug, candidate));
    if (!taken) return candidate;
  }
  return `gamer-${id.toLowerCase()}`;
}

export async function createGamer(
  db: DB,
  input: { displayName: string; discordId?: string | null; attributedGuildId?: string | null },
): Promise<string> {
  const id = uid();
  await db.insert(schema.users).values({
    id,
    slug: await freeSlug(db, input.displayName, id),
    displayName: input.displayName,
    discordId: input.discordId ?? null,
    attributedGuildId: input.attributedGuildId ?? null,
  });
  return id;
}

export class AgeBandLockedError extends Error {
  constructor() {
    super(
      "Your age band is already set and cannot be changed here. Contact " +
        "support — if you have turned 18, they can move you.",
    );
    this.name = "AgeBandLockedError";
  }
}

/**
 * Set the age band, once.
 *
 * G9: not self-editable after it is set. Support only. Enforced here rather
 * than by hiding the control, because the control is not the only way to send
 * the request — and because the reason a 13-year-old would want to change it
 * is exactly the reason it must not be possible.
 */
export async function setAgeBand(db: DB, userId: string, band: AgeBand): Promise<void> {
  if (!isAgeBand(band)) throw new Error(`Not an age band: ${String(band)}`);
  const [user] = await db
    .select({ ageBand: schema.users.ageBand })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!user) throw new Error("No such gamer.");
  if (user.ageBand !== null) throw new AgeBandLockedError();
  await db.update(schema.users).set({ ageBand: band }).where(eq(schema.users.id, userId));
}

export class CountryNotAllowedError extends Error {
  constructor(readonly code: string) {
    super(
      "We cannot accept entries from that country. It was not in the list — " +
        "if you picked it another way, that is why.",
    );
    this.name = "CountryNotAllowedError";
  }
}

/**
 * Set the country.
 *
 * Checked here as well as filtered from the picker. The picker is what an
 * honest user sees; this is what a form post is.
 */
export async function setCountry(
  db: DB,
  userId: string,
  code: string,
  sanctioned?: readonly string[],
): Promise<void> {
  if (!isCountryAllowed(code, sanctioned)) throw new CountryNotAllowedError(code);
  await db
    .update(schema.users)
    .set({ country: code.toUpperCase() })
    .where(eq(schema.users.id, userId));
}

export async function gamerById(db: DB, userId: string) {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  return row ?? null;
}

export async function gamerByDiscordId(db: DB, discordId: string) {
  const [row] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.discordId, discordId));
  return row ?? null;
}
