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

import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid, slugify } from "../core/utils.ts";
import { isAgeBand, isBlocked, registrationFingerprint, type AgeBand } from "./age.ts";
import { isCountryAllowed } from "./countries.ts";
import { authSecret } from "../core/secret.ts";

/**
 * Thrown when the identity signing up already answered "under 13".
 *
 * ===== U3 IS ENFORCED WHERE THE ROW IS MADE, NOT AT EACH DOOR =====
 *
 * It was at each door, and that is exactly how it came to be missing from two
 * of them: the email signup route and the Discord callback both created a
 * `users` row without ever asking. A child who took the under-13 path — which
 * deletes the account and keeps a salted fingerprint *precisely* so the answer
 * cannot be retaken — could sign up again with the same address or the same
 * Discord account and walk straight back in.
 *
 * Found by the screenshot record, whose "cannot come back with a different
 * answer" step photographed a successful signup.
 *
 * A door may still check first, to answer more gracefully than an exception.
 * What it may not do is be the only thing checking.
 */
export class UnderThirteenError extends Error {
  constructor() {
    super("That account was closed because its holder is under 13. It cannot be reopened.");
    this.name = "UnderThirteenError";
  }
}

async function refuseIfBlocked(
  db: DB,
  parts: { discordId?: string | null; email?: string | null },
): Promise<void> {
  const hash = registrationFingerprint({ ...parts, salt: authSecret() });
  if (await isBlocked(db, hash)) throw new UnderThirteenError();
}

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
  await refuseIfBlocked(db, { discordId: input.discordId, email: input.email });

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
    .select({
      id: schema.users.id,
      parentGuildId: schema.users.parentGuildId,
      parentStampedAt: schema.users.parentStampedAt,
    })
    .from(schema.users)
    .where(eq(schema.users.discordId, input.discordId));
  if (existing) {
    // ===== "HAS A ROW" IS NOT "HAS ALREADY CLICKED" =====
    //
    // A1/A2 — the parent is stamped at the FIRST click and never moves. A
    // second click in another server must not re-stamp it, and the early
    // return here is the only thing standing between that rule and a parent
    // that follows a gamer around.
    //
    // But it was also the only thing standing between `12-IDENTITY` §3's *"No
    // parent yet"* and being unreachable. A gamer who signed up on the web and
    // linked Discord has a row, no parent, and **has never clicked**. The
    // document tells exactly that person: *open Discord, go to a server that
    // has Cluster and use `/cluster` — that becomes your parent.* The early
    // return made that sentence false, and nobody noticed because until this
    // sprint there was no `/cluster` for them to use.
    //
    // So the condition is "was a parent ever stamped", not "does a row exist".
    // Three things make this safe to do here rather than nowhere:
    //
    //   * It can only ever fill a null. A stamped parent is never moved, which
    //     is A1 unchanged — and A8 keeps the admin correction the only thing
    //     that can move one.
    //   * It cannot move money that has already moved. A1b — a closed week
    //     reads `week_records`, and a parent stamped in week 6 has no bearing
    //     on week 3.
    //   * A7 is the state it replaces: no parent at all, and **no server
    //     earning anything**. Filling it takes nothing from anybody.
    //
    // `isNull` in the WHERE, not just in the `if`: two presses landing together
    // would otherwise both read null and both write, and the loser would be
    // whichever guild the database happened to commit second.
    if (input.parentGuildId && !existing.parentGuildId && !existing.parentStampedAt) {
      await db
        .update(schema.users)
        .set({ parentGuildId: input.parentGuildId, parentStampedAt: input.at ?? new Date() })
        .where(and(eq(schema.users.id, existing.id), isNull(schema.users.parentStampedAt)));
    }
    return existing.id;
  }

  // Checked after the early return, not before: a gamer who already has a row
  // is not registering, and the fingerprint only exists for identities whose
  // row was deleted.
  await refuseIfBlocked(db, { discordId: input.discordId });

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

export async function gamerByDiscordId(db: DB, discordId: string) {
  const [row] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.discordId, discordId));
  return row ?? null;
}

// ===== DELETING AN ACCOUNT. R3 / V17 / V14 / T6 =====
//
// ===== WHY THIS FUNCTION DID NOT EXIST UNTIL SPRINT 11 =====
//
// It should have. `tests/band1/50-trophies.test.ts` carried a test called
// *"deletion is refused while a redemption is in flight"* whose body asserted
// only that `redemptionsInFlight` counts a redemption while it is pending,
// approved or sent, and stops counting it once paid. All true, and not one
// word about deletion — because nothing deleted an account, and every other
// suite that needed a deleted gamer wrote `UPDATE users SET status='deleted'`
// by hand.
//
// That is §0.1's shape with the halves reversed. Usually the evidence exists
// and nothing reads it; here **the guard existed and the rule did not**, and
// the test name read identically either way. Trap 2, in the suite most likely
// to be trusted about money.
//
// ===== THREE RULES, AND THEY PULL AGAINST EACH OTHER =====
//
//   R3 / V17 — deletion is **refused outright** while a redemption is in
//              flight. Money already handed to a payment provider cannot be
//              paid to a record that no longer exists.
//   V14 / T6 — a holding **survives** the holder, as an orphan, so the money
//              stays accounted for. The brand really did pay it.
//   V15      — the balance therefore no longer equals live redeemable
//              liability, so admin may sweep it to Cluster, logged.
//
// So this is a status change and not a delete. The under-13 path above *is* a
// hard delete, and the difference is the whole point: there is no lawful
// reason to keep a row we should never have made, and every reason to keep the
// accounting behind a trophy a brand funded.

export class DeletionRefused extends Error {
  constructor(readonly code: "redemption_in_flight", message: string) {
    super(message);
    this.name = "DeletionRefused";
  }
}

/**
 * Close a gamer's account.
 *
 * Refuses while a redemption is in flight, and otherwise marks the row
 * `deleted` — leaving `user_trophies` untouched, which is what keeps the money
 * accounted for and turns the prize vault amber until admin sweeps it.
 */
export async function deleteAccount(
  db: DB,
  userId: string,
): Promise<{ ok: true } | never> {
  const { withTx, lockGamer } = await import("../db/tx.ts");
  const { redemptionsInFlight } = await import("../trophies/redemption.ts");

  return withTx(db, async (tx) => {
    // The lock before the read the write depends on, for the same reason
    // `requestRedemption` takes it: a redeem landing between the check and the
    // update would be a payout aimed at a deleted record.
    await lockGamer(tx, userId);

    const inFlight = await redemptionsInFlight(tx, userId);
    if (inFlight.length > 0) {
      throw new DeletionRefused(
        "redemption_in_flight",
        "You have a payout on its way. We cannot close the account until it " +
          "lands — money already handed to a payment provider cannot be paid " +
          "to a record that no longer exists. Come back once it says paid.",
      );
    }

    // Not a delete. V14 — the trophies stay, as orphans, because the money
    // behind them was real and the vault has to keep saying so.
    await tx
      .update(schema.users)
      .set({ status: "deleted" })
      .where(eq(schema.users.id, userId));

    return { ok: true as const };
  });
}
