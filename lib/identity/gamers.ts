// Creating a gamer, and setting the two answers onboarding asks for.
//
// ===== TWO DOORS. NEITHER IS SECOND CLASS =====
//
// G0/I1. Discord sign-in, or email + password. Either reaches every gamer
// surface, and each is complete on its own: a gamer with no Discord has no
// parent server and is otherwise identical (U5), a gamer with no email is
// complete until they redeem (U6).
//
// The **email** door verifies the address at signup, because it *is* the
// credential and a reset is impossible without it (I7a) — and that same
// verification is the one redemption later requires, so it is never asked
// twice. The **Discord** door never asks for one at all (G2).
//
// The slug is derived through the ported slugifier, which is the reason a
// gamer called 日本語ゲーマー does not end up at `/u/gamer`.

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
  input: {
    displayName: string;
    discordId?: string | null;
    /** Where they first pressed a bot button. Stamped once, permanent (A1). */
    parentGuildId?: string | null;
    email?: string | null;
    emailVerifiedAt?: Date | null;
    passwordHash?: string | null;
    at?: Date;
  },
): Promise<string> {
  const id = uid();
  await db.insert(schema.users).values({
    id,
    slug: await freeSlug(db, input.displayName, id),
    displayName: input.displayName,
    discordId: input.discordId ?? null,
    email: input.email ?? null,
    emailVerifiedAt: input.emailVerifiedAt ?? null,
    passwordHash: input.passwordHash ?? null,
    parentGuildId: input.parentGuildId ?? null,
    // Stamped with the parent or not at all. A `parentStampedAt` without a
    // parent would read as "we looked and there was none", which is a
    // different claim from "we never looked".
    parentStampedAt: input.parentGuildId ? (input.at ?? new Date()) : null,
  });
  return id;
}

/**
 * The shadow account the first bot click creates.
 *
 * I5 — **it holds nothing but the Discord ID.** No name, no avatar, nothing.
 * I6 — it accrues nothing and counts as nobody until onboarding completes.
 * I7 — the age question comes before any other data is stored, which is why
 * there is no display name here to be helpful with: we do not hold data on a
 * child we have not yet asked about.
 *
 * The display name is the Discord ID itself rather than a placeholder word, so
 * an account that somehow surfaces before onboarding is obviously unfinished
 * rather than looking like a real gamer called "New Gamer".
 */
export async function shadowGamerForDiscord(
  db: DB,
  input: { discordId: string; parentGuildId?: string | null; at?: Date },
): Promise<string> {
  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.discordId, input.discordId));
  if (existing) {
    // A1/A2 — the parent is stamped at the FIRST click and never moves. A
    // second click in another server must not re-stamp it, and this early
    // return is the only thing standing between that rule and a parent that
    // follows a gamer around.
    return existing.id;
  }

  const id = uid();
  await db.insert(schema.users).values({
    id,
    slug: `gamer-${id.toLowerCase()}`,
    displayName: input.discordId,
    discordId: input.discordId,
    parentGuildId: input.parentGuildId ?? null,
    parentStampedAt: input.parentGuildId ? (input.at ?? new Date()) : null,
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
