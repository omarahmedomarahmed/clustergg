// Stage 1 — identity.
//
// The rule under test is U1: **nothing accrues until an account is linked and
// an age band and a country are set.**
//
// ===== ASSERTED THROUGH THE DOOR, NOT THROUGH A HELPER =====
//
// This suite used to drive `requireUnlocked`, and its header said *"Stage 4's
// entry chain will call `requireUnlocked`"*. It never did — the entry chain
// calls `unlockState` and builds its own refusal, and `requireUnlocked` was a
// second implementation of the same gate with no caller at all
// (`94-export-reach`). So a suite written to stop a call being decorative was
// itself the only thing calling it.
//
// It now drives `enterChallenge`, which is the door the rule actually guards.
// That is stronger in the way that matters: the old version proved a helper
// threw, and this proves **a gamer cannot enter** — and that the refusal names
// which of the three steps is missing, because "complete onboarding" is a
// shrug rather than a message.

import { ok, eq, no, throws } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema } from "../../lib/db/index.ts";
import { deriveUnlock, unlockState } from "../../lib/identity/unlock.ts";
import {
  createGamer,
  shadowGamerForDiscord,
  setAgeBand,
  setCountry,
  AgeBandLockedError,
} from "../../lib/identity/gamers.ts";
import { linkAccount, isProven, AccountTakenError } from "../../lib/identity/accounts.ts";
import { blockUnderThirteen, isBlocked, registrationFingerprint, mayRedeem } from "../../lib/identity/age.ts";
import { offeredCountries, isCountryAllowed, DEFAULT_SANCTIONED } from "../../lib/identity/countries.ts";
import { emailIsFree } from "../../lib/identity/credentials.ts";
import { authSecret } from "../../lib/core/secret.ts";
import { eq as sqlEq } from "drizzle-orm";

test("the unlock derivation names which step is missing", () => {
  const none = deriveUnlock({ ageBand: null, country: null, linkedAccountCount: 0 });
  no(none.unlocked, "a gamer who has done nothing is not unlocked");
  // ===== AGE FIRST, AND THE ORDER IS THE RULE (I7) =====
  //
  // *"The age question comes before any other data is stored. We do not hold
  // data on a child we never asked about."* So `ageBand` leads both paths, and
  // `next` sends them there before anything else is asked for or kept.
  eq(none.missing, ["ageBand", "country", "link"], "all three steps are named, age first");
  eq(none.next, "ageBand", "and the age question is where they are sent");

  const partial = deriveUnlock({ ageBand: "adult", country: null, linkedAccountCount: 1 });
  no(partial.unlocked, "two of three is not unlocked");
  eq(partial.missing, ["country"], "the refusal says exactly what is left");

  const done = deriveUnlock({ ageBand: "teen", country: "GB", linkedAccountCount: 1 });
  ok(done.unlocked, "all three done is unlocked");
  eq(done.missing, [], "and nothing is outstanding");
});

test("an unrecognised age band does not count as an answer", () => {
  const bogus = deriveUnlock({ ageBand: "under_13", country: "GB", linkedAccountCount: 1 });
  no(bogus.unlocked, "under-13 is not an age band — that path deletes the account");
  eq(bogus.missing, ["ageBand"], "so the age band step is still outstanding");
});

test("a half-onboarded gamer cannot enter, and the refusal says why", async () => {
  const db = await resetDemoDb();
  const { createChallenge } = await import("../../lib/challenges/lifecycle.ts");
  const { enterChallenge } = await import("../../lib/challenges/entry.ts");

  const id = await createGamer(db, { displayName: "Halfway" });
  // A real week boundary. There is no date picker anywhere on this platform,
  // for anyone — `createChallenge` refuses anything else, which is the rule
  // doing its job in a fixture.
  const { weekFor } = await import("../../lib/challenges/week.ts");
  const challengeId = await createChallenge(db, {
    title: "Open Now",
    game: "League of Legends",
    provider: "riot-lol",
    startAt: weekFor(new Date()).start,
    metrics: { wins: 1 },
  });
  // Straight to `live`, rather than through the lifecycle. The subject here is
  // the onboarding gate, and walking a challenge through paid → scheduled →
  // live would make this suite fail for reasons that have nothing to do with
  // U1 — `40-challenges` owns the lifecycle and asserts every one of those
  // transitions properly.
  await db
    .update(schema.challenges)
    .set({ state: "live" })
    .where(sqlEq(schema.challenges.id, challengeId));

  const nothing = await enterChallenge(db, { challengeId, userId: id });
  no(nothing.ok, "a gamer with nothing linked cannot enter");
  eq(!nothing.ok ? nothing.code : "", "onboarding", "refused for onboarding, not for anything else");
  ok(
    !nothing.ok && /ageBand/.test(nothing.reason) && /country/.test(nothing.reason) && /link/.test(nothing.reason),
    "and the refusal names every missing step, not just the first — age first, I7",
  );

  await linkAccount(db, {
    userId: id,
    provider: "riot-lol",
    providerAccountId: "puuid-1",
    inGameName: "Halfway#EUW",
    verifiedMethod: "exists",
  });
  await setAgeBand(db, id, "adult");

  const twoOfThree = await enterChallenge(db, { challengeId, userId: id });
  no(twoOfThree.ok, "two of three still refuses");
  ok(
    !twoOfThree.ok && /country/.test(twoOfThree.reason),
    "naming the country step, and no longer naming the two they have done",
  );
  no(
    !twoOfThree.ok && /ageBand/.test(twoOfThree.reason),
    "which is what makes the refusal a next action rather than a status report",
  );

  await setCountry(db, id, "GB");
  ok((await unlockState(db, id)).unlocked, "and all three unlocks them");
});

test("unlock is derived, so removing a link removes the unlock", async () => {
  const db = await resetDemoDb();
  const id = await createGamer(db, { displayName: "Derived" });
  const link = await linkAccount(db, {
    userId: id,
    provider: "riot-lol",
    providerAccountId: "puuid-2",
    verifiedMethod: "exists",
  });
  await setAgeBand(db, id, "adult");
  await setCountry(db, id, "GB");
  ok((await unlockState(db, id)).unlocked, "unlocked while the link exists");

  await db
    .delete(schema.linkedGameAccounts)
    .where(sqlEq(schema.linkedGameAccounts.id, link.id));

  // Nothing flipped a flag. There is no flag.
  no((await unlockState(db, id)).unlocked, "and not unlocked the instant it does not");
});

test("an account that merely exists is not an account somebody owns", () => {
  no(isProven("claimed"), "typing a name is not proof");
  no(isProven("exists"), "the publisher confirming the account is real is not proof of ownership");
  ok(isProven("icon"), "the profile-icon challenge is proof");
  ok(isProven("oauth"), "OAuth is proof");
  ok(isProven("admin"), "an admin override is proof, and is recorded as one");
});

test("one game account belongs to one gamer, and proof takes it from a claim", async () => {
  const db = await resetDemoDb();
  const claimer = await createGamer(db, { displayName: "Claimer" });
  const prover = await createGamer(db, { displayName: "Prover" });

  await linkAccount(db, {
    userId: claimer,
    provider: "riot-lol",
    providerAccountId: "contested",
    verifiedMethod: "exists",
  });

  // L1 without L2 is a denial of service: whoever types the name first owns it.
  await throws(
    () =>
      linkAccount(db, {
        userId: prover,
        provider: "riot-lol",
        providerAccountId: "contested",
        verifiedMethod: "claimed",
      }),
    /already linked/,
    "another claim does not take a claimed account",
  );

  const moved = await linkAccount(db, {
    userId: prover,
    provider: "riot-lol",
    providerAccountId: "contested",
    verifiedMethod: "icon",
  });
  ok(moved.moved, "but proof takes it from a claim");

  const rows = await db
    .select()
    .from(schema.linkedGameAccounts)
    .where(sqlEq(schema.linkedGameAccounts.providerAccountId, "contested"));
  eq(rows.length, 1, "and there is still exactly one row for that game account");
  eq(rows[0].userId, prover, "held by the gamer who proved it");

  await throws(
    () =>
      linkAccount(db, {
        userId: claimer,
        provider: "riot-lol",
        providerAccountId: "contested",
        verifiedMethod: "icon",
      }),
    /already linked/,
    "and proof does not beat proof — first proof wins, the rest is support",
  );
});

test("re-linking never downgrades a proven account to a claim", async () => {
  const db = await resetDemoDb();
  const id = await createGamer(db, { displayName: "Proven" });
  await linkAccount(db, {
    userId: id,
    provider: "riot-lol",
    providerAccountId: "mine",
    verifiedMethod: "icon",
  });
  await linkAccount(db, {
    userId: id,
    provider: "riot-lol",
    providerAccountId: "mine",
    inGameName: "Renamed#EUW",
    verifiedMethod: "exists",
  });
  const [row] = await db
    .select()
    .from(schema.linkedGameAccounts)
    .where(sqlEq(schema.linkedGameAccounts.providerAccountId, "mine"));
  eq(row.verifiedMethod, "icon", "a retry after a failed proof keeps the proof it already had");
  eq(row.inGameName, "Renamed#EUW", "while still taking the fresh detail");
});

test("the age band is set once and never by the gamer again", async () => {
  const db = await resetDemoDb();
  const id = await createGamer(db, { displayName: "Fixed" });
  await setAgeBand(db, id, "teen");
  const err = await throws(
    () => setAgeBand(db, id, "adult"),
    /support/,
    "a second attempt is refused and points at support",
  );
  ok(err instanceof AgeBandLockedError, "with the error that says exactly which rule this is");
});

test("only adults may redeem, and a teen still holds the trophy", () => {
  no(mayRedeem("teen"), "13 to 17 cannot redeem");
  no(mayRedeem(null), "and neither can somebody who never answered");
  ok(mayRedeem("adult"), "18+ can");
});

test("under-13 deletes the account and cannot come back with a different answer", async () => {
  const db = await resetDemoDb();
  const discordId = "discord-child-1";
  const id = await createGamer(db, { displayName: "Too Young", discordId });
  const hash = registrationFingerprint({ discordId, salt: "test-salt" });

  no(await isBlocked(db, hash), "not blocked before they answer");
  await blockUnderThirteen(db, id, hash);

  const rows = await db.select().from(schema.users).where(sqlEq(schema.users.id, id));
  eq(rows.length, 0, "the account is deleted, not marked");
  ok(await isBlocked(db, hash), "and the fingerprint survives, so the answer cannot be retaken");
});

test("the under-13 answer cannot be retaken at any door that makes an account", async () => {
  // ===== THE FINGERPRINT ONLY WORKS IF SOMETHING READS IT =====
  //
  // It was written by `blockUnderThirteen` and read by exactly one door — the
  // demo sign-in action. The email signup route and the Discord callback both
  // created a `users` row without ever looking, so the child who answered
  // could sign up again with the same address, or the same Discord account,
  // and be back inside. The test above proved the fingerprint survives; it did
  // not prove anybody consults it, and those are different claims.
  //
  // The check now lives at the point the row is made, which is why this test
  // exercises `createGamer` and `shadowGamerForDiscord` rather than a route:
  // a door that forgets inherits it, and a door added tomorrow does too.
  const db = await resetDemoDb();
  const salt = authSecret();

  const email = "child@example.test";
  const emailUser = await createGamer(db, { displayName: "Child", email });
  await blockUnderThirteen(db, emailUser, registrationFingerprint({ email, salt }));
  await throws(
    () => createGamer(db, { displayName: "Child Again", email }),
    /under 13/,
    "the same address cannot open a second account",
  );
  // The address itself is free again — the account was deleted — so nothing
  // but the fingerprint is standing here.
  ok(await emailIsFree(db, email), "and it is the fingerprint doing it, not the address being taken");

  const discordId = "discord-child-2";
  const discordUser = await createGamer(db, { displayName: "Child Two", discordId });
  await blockUnderThirteen(db, discordUser, registrationFingerprint({ discordId, salt }));
  await throws(
    () => shadowGamerForDiscord(db, { discordId }),
    /under 13/,
    "and neither can the same Discord account, on the door that makes shadow rows",
  );

  // Nobody else is caught by it.
  const fine = await createGamer(db, { displayName: "Somebody Else", email: "adult@example.test" });
  ok(fine.length > 0, "an unrelated signup still works — the block is not a blanket refusal");
});

test("the under-13 fingerprint is one-way and salted", () => {
  const a = registrationFingerprint({ discordId: "abc", salt: "salt-one" });
  const b = registrationFingerprint({ discordId: "abc", salt: "salt-two" });
  ok(a !== b, "a different salt gives a different hash, so the table is not rainbow-tableable");
  ok(!a.includes("abc"), "and the subject does not appear in the hash");
  eq(a, registrationFingerprint({ discordId: "abc", salt: "salt-one" }),
    "the same person under the same salt hashes the same, which is the whole use");
});

test("the sanctions default is not empty", () => {
  // This assertion exists because its absence was a hole, found by breaking
  // the code: emptying `DEFAULT_SANCTIONED` was caught by zero suites. The
  // test below iterates the list, so an empty list ran its body zero times and
  // passed vacuously — every assertion green, nothing proven. A loop over a
  // configurable collection needs a guard that the collection is populated,
  // or the configuration can switch the test off.
  ok(
    DEFAULT_SANCTIONED.length > 0,
    "there is at least one comprehensively sanctioned jurisdiction in the default",
  );
});

test("the filter excludes whatever list it is given", () => {
  // The mechanism, exercised against a fixture rather than the default, so
  // this stays true whatever admin edits the list to.
  const fixture = ["GB", "FR"];
  const offered = offeredCountries(fixture);
  no(offered.some((c) => c.code === "GB"), "a listed country is not offered");
  no(offered.some((c) => c.code === "FR"), "nor is the second one");
  ok(offered.some((c) => c.code === "DE"), "an unlisted country still is");
  no(isCountryAllowed("GB", fixture), "and the action refuses what the picker omitted");
  ok(isCountryAllowed("DE", fixture), "while allowing what it offered");
});

test("sanctioned countries are not in the picker at all", () => {
  const offered = offeredCountries();
  ok(offered.length > 200, "the picker offers essentially every country");
  for (const code of DEFAULT_SANCTIONED) {
    no(
      offered.some((c) => c.code === code),
      `${code} is absent from the picker, not greyed out in it`,
    );
    no(isCountryAllowed(code), `and ${code} is refused at the action too, not only in the UI`);
  }
  ok(offered.some((c) => c.code === "GB"), "an ordinary country is offered");
  no(isCountryAllowed("ZZ"), "a code that is not a country is not a country");
  no(isCountryAllowed(null), "and neither is nothing");
});

test("a country outside the list is refused at the action, not just hidden", async () => {
  const db = await resetDemoDb();
  const id = await createGamer(db, { displayName: "Poster" });
  await throws(
    () => setCountry(db, id, DEFAULT_SANCTIONED[0]),
    /cannot accept/,
    "a form post naming a sanctioned country is refused",
  );
});

test("a gamer's slug is their name, not the word 'gamer'", async () => {
  const db = await resetDemoDb();
  const a = await createGamer(db, { displayName: "日本語ゲーマー" });
  const b = await createGamer(db, { displayName: "日本語プレイヤー" });
  const rows = await db.select({ id: schema.users.id, slug: schema.users.slug }).from(schema.users);
  const slugs = rows.map((r) => r.slug).sort();
  eq(slugs.length, 2, "two gamers, two slugs");
  ok(slugs[0] !== slugs[1], "and they are different — the first did not occupy a bare word");
  ok(
    slugs.every((s) => s !== "gamer"),
    "nobody holds the slug 'gamer'",
  );
  ok(a !== b, "and they are two distinct accounts");
});
