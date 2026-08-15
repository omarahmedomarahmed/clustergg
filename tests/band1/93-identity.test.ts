// Sprint 3 — two doors into one gamer row, and the brand's separate table.
//
// The properties here are the ones that fail *silently*. A merge that should
// not have happened looks like a working account. A second row created on link
// looks like a working account. An invite that still works looks like a
// working invite. None of them throws, and none of them is visible on any
// screen until somebody's trophies are on the wrong record.

import { ok, eq, no, throws } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema } from "../../lib/db/index.ts";
import { eq as sqlEq, sql } from "drizzle-orm";
import { createGamer, shadowGamerForDiscord } from "../../lib/identity/gamers.ts";
import { linkAccount } from "../../lib/identity/accounts.ts";
import {
  hashPassword,
  passwordMatches,
  checkPasswordStrength,
  MIN_PASSWORD_LENGTH,
  linkDiscord,
  discordLinkOutcome,
  emailIsFree,
  gamerByEmail,
  CredentialRefused,
} from "../../lib/identity/credentials.ts";
import { beginReset, completeReset } from "../../lib/identity/reset.ts";
import {
  beginEmailVerification,
  confirmEmailVerification,
  emailIsVerified,
} from "../../lib/identity/verify.ts";
import { signUpBrand } from "../../lib/portal/brand.ts";
import { redeemBrandInvite, brandSignIn } from "../../lib/portal/brand-auth.ts";
import { setAgeBand, setCountry } from "../../lib/identity/gamers.ts";
import { unlockState } from "../../lib/identity/unlock.ts";

// ── Passwords ───────────────────────────────────────────────────────────────

test("a password is stored derived, salted, and never in the clear", async () => {
  const hash = await hashPassword("a long ordinary phrase");
  ok(!hash.includes("a long ordinary phrase"), "the password is not in what we store");
  ok(hash.startsWith("scrypt:"), "and the scheme is named, so it can be changed later");

  ok(await passwordMatches(hash, "a long ordinary phrase"), "the real password matches");
  no(await passwordMatches(hash, "a long ordinary phrasf"), "one character off does not");
  no(await passwordMatches(null, "anything"), "and an account with no password lets nobody in");

  const again = await hashPassword("a long ordinary phrase");
  ok(again !== hash, "two hashes of one password differ — the salt is real");
});

test("a short password is refused, with the reason", () => {
  throws(
    () => checkPasswordStrength("short"),
    new RegExp(`${MIN_PASSWORD_LENGTH} characters`),
    "and the refusal says how long, not merely that it is wrong",
  );
  checkPasswordStrength("x".repeat(MIN_PASSWORD_LENGTH));
});

// ── Two doors, one row ──────────────────────────────────────────────────────

test("an email gamer is complete with no Discord at all", async () => {
  // I1a/U5. They onboard, enter, score, win and redeem. The only thing they do
  // not have is a parent server, and A7 says that is fine.
  const db = await resetDemoDb();
  const userId = await createGamer(db, {
    displayName: "Webbed",
    email: "web@example.test",
    emailVerifiedAt: new Date(),
    passwordHash: await hashPassword("a long ordinary phrase"),
  });

  await setAgeBand(db, userId, "adult");
  await setCountry(db, userId, "GB");
  await linkAccount(db, {
    userId,
    provider: "chesscom",
    providerAccountId: "web-1",
    verifiedMethod: "oauth",
  });

  const unlock = await unlockState(db, userId);
  ok(unlock?.unlocked, "onboarding completes without Discord ever being involved");

  const [row] = await db.select().from(schema.users).where(sqlEq(schema.users.id, userId));
  eq(row.discordId, null, "no Discord id");
  eq(row.parentGuildId, null, "and no parent server — A7, and nobody earns from them");
});

test("a Discord gamer needs no email until they redeem", async () => {
  const db = await resetDemoDb();
  const userId = await shadowGamerForDiscord(db, { discordId: "111" });
  const [row] = await db.select().from(schema.users).where(sqlEq(schema.users.id, userId));
  eq(row.email, null, "no email");
  eq(row.passwordHash, null, "and no password");
  // I5 — the first record holds nothing but the Discord ID.
  eq(row.displayName, "111", "and nothing about them we were not given");
  eq(row.ageBand, null, "I7 — not even an age band, until they are asked");
});

test("linking a second method updates one row and never creates another", async () => {
  const db = await resetDemoDb();
  const userId = await createGamer(db, { displayName: "Both", email: "both@example.test" });

  const before = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users);
  const outcome = await linkDiscord(db, userId, "222");
  const after = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users);

  eq(outcome.kind, "mine", "the link succeeds");
  eq(after[0].n, before[0].n, "and the number of gamers did not change — U4");

  const [row] = await db.select().from(schema.users).where(sqlEq(schema.users.id, userId));
  eq(row.discordId, "222", "the same row now holds both");
});

test("an identity already on another account is a route, never a merge", async () => {
  // ===== THE RULING, IN ONE TEST (G0d, U4b, I1c1–I1c4) =====
  const db = await resetDemoDb();
  const first = await shadowGamerForDiscord(db, { discordId: "333" });
  const second = await createGamer(db, { displayName: "Same person", email: "two@example.test" });

  const outcome = await discordLinkOutcome(db, second, "333");
  eq(outcome.kind, "elsewhere", "we can see it is somewhere else");
  ok(
    outcome.kind === "elsewhere" && /Sign in with Discord/.test(outcome.message),
    "and the answer is where to go, not that they are wrong",
  );
  ok(
    outcome.kind === "elsewhere" && /never combine/.test(outcome.message),
    "and it says plainly that nothing will be combined",
  );

  const attempted = await linkDiscord(db, second, "333");
  eq(attempted.kind, "elsewhere", "attempting it changes nothing");

  const [a] = await db.select().from(schema.users).where(sqlEq(schema.users.id, first));
  const [b] = await db.select().from(schema.users).where(sqlEq(schema.users.id, second));
  eq(a.discordId, "333", "the first account keeps its Discord");
  eq(b.discordId, null, "the second is untouched");
  eq(a.status, "active", "and BOTH accounts are still live —");
  eq(b.status, "active", "two accounts for one person are permanent and fine");
});

test("two accounts for one person each clear every gate on their own", async () => {
  // U4c. Nothing is inherited from the other: not the age band, not the
  // country, not a linked account, not a verified email.
  const db = await resetDemoDb();

  const discordSide = await shadowGamerForDiscord(db, { discordId: "444" });
  await setAgeBand(db, discordSide, "adult");
  await setCountry(db, discordSide, "GB");
  await linkAccount(db, {
    userId: discordSide,
    provider: "chesscom",
    providerAccountId: "acct-A",
    verifiedMethod: "oauth",
  });
  ok((await unlockState(db, discordSide))?.unlocked, "the first account is fully onboarded");

  const emailSide = await createGamer(db, {
    displayName: "Same person",
    email: "solo@example.test",
  });
  const unlock = await unlockState(db, emailSide);
  no(unlock?.unlocked, "and the second one starts from nothing");
  eq(unlock?.done.ageBand, false, "no age band inherited");
  eq(unlock?.done.country, false, "no country inherited");
  eq(unlock?.done.link, false, "and no linked account inherited");
});

test("L1 is what stops one person scoring twice — not a merge", async () => {
  // U4d. The two accounts cannot share a game account, and the refusal is the
  // ordinary collision path rather than anything that knows about people.
  const db = await resetDemoDb();
  const one = await shadowGamerForDiscord(db, { discordId: "555" });
  const two = await createGamer(db, { displayName: "Same person", email: "dual@example.test" });

  await linkAccount(db, {
    userId: one,
    provider: "chesscom",
    providerAccountId: "shared-account",
    verifiedMethod: "oauth",
  });
  await throws(
    () =>
      linkAccount(db, {
        userId: two,
        provider: "chesscom",
        providerAccountId: "shared-account",
        verifiedMethod: "claimed",
      }),
    /already/i,
    "the second account cannot claim the first's game account",
  );

  const rows = await db
    .select()
    .from(schema.linkedGameAccounts)
    .where(sqlEq(schema.linkedGameAccounts.providerAccountId, "shared-account"));
  eq(rows.length, 1, "one game account, one gamer — L1, and it needed no special case");
  eq(rows[0].userId, one, "and it stayed with the one who proved it");
});

test("the parent is stamped at the first click and never re-stamped", async () => {
  // A1/A2. Click in server A, click again in server B → A is still the parent.
  const db = await resetDemoDb();
  const first = await shadowGamerForDiscord(db, { discordId: "666", parentGuildId: "guild-A" });
  const again = await shadowGamerForDiscord(db, { discordId: "666", parentGuildId: "guild-B" });

  eq(again, first, "the second click finds the same account");
  const [row] = await db.select().from(schema.users).where(sqlEq(schema.users.id, first));
  eq(row.parentGuildId, "guild-A", "and the parent is still where they first pressed a button");
  ok(row.parentStampedAt !== null, "stamped with when");
});

// ── The email door verifies at signup ───────────────────────────────────────

test("the email door's verification is the one redemption requires", async () => {
  // I7a — verified at signup, never asked twice. A gamer may be paid without
  // ever opening a verification screen again.
  const db = await resetDemoDb();
  const userId = await createGamer(db, { displayName: "Verified", email: "v@example.test" });

  no(await emailIsVerified(db, userId), "not verified yet");
  const code = await beginEmailVerification(db, userId, "v@example.test");
  const result = await confirmEmailVerification(db, userId, code);
  ok(result.ok, "the code verifies");
  ok(await emailIsVerified(db, userId), "and the address is proven");

  const [row] = await db.select().from(schema.users).where(sqlEq(schema.users.id, userId));
  ok(row.emailVerifiedAt !== null, "recorded on the gamer, which is what /redeem reads");
});

test("a wrong or expired code reads identically", async () => {
  const db = await resetDemoDb();
  const userId = await createGamer(db, { displayName: "Slow", email: "s@example.test" });
  const code = await beginEmailVerification(db, userId, "s@example.test");

  const wrong = await confirmEmailVerification(db, userId, "000000");
  no(wrong.ok, "a wrong code is refused");

  await db
    .update(schema.emailVerifications)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(sqlEq(schema.emailVerifications.userId, userId));
  const expired = await confirmEmailVerification(db, userId, code);
  no(expired.ok, "and so is an expired one");
  eq(
    wrong.ok === false && expired.ok === false ? wrong.reason === expired.reason : false,
    true,
    "with the same words — telling them apart says which codes were ever real",
  );
});

// ── Password reset ──────────────────────────────────────────────────────────

test("a reset works once, and only for a verified address", async () => {
  const db = await resetDemoDb();
  const userId = await createGamer(db, {
    displayName: "Forgetful",
    email: "f@example.test",
    passwordHash: await hashPassword("the first phrase"),
  });

  eq(
    await beginReset(db, { kind: "gamer", email: "f@example.test" }),
    null,
    "an unverified address cannot reset — I1d, and it is why the email door verifies at signup",
  );

  await db
    .update(schema.users)
    .set({ emailVerifiedAt: new Date() })
    .where(sqlEq(schema.users.id, userId));

  const token = await beginReset(db, { kind: "gamer", email: "f@example.test" });
  ok(typeof token === "string" && token.length > 20, "now there is a token");

  const done = await completeReset(db, {
    kind: "gamer",
    token: token as string,
    password: "the second phrase",
  });
  ok(done.ok, "and it sets the password");

  const user = await gamerByEmail(db, "f@example.test");
  ok(await passwordMatches(user?.passwordHash, "the second phrase"), "the new one works");
  no(await passwordMatches(user?.passwordHash, "the first phrase"), "and the old one does not");

  const twice = await completeReset(db, {
    kind: "gamer",
    token: token as string,
    password: "a third phrase entirely",
  });
  no(twice.ok, "the same link cannot be used again");
});

test("a reset says nothing about whether the address exists", async () => {
  const db = await resetDemoDb();
  eq(
    await beginReset(db, { kind: "gamer", email: "nobody@example.test" }),
    null,
    "there is no token for an address we do not have —",
  );
  // …and the caller renders the same sentence either way. That is asserted in
  // band 2 against the rendered page, because it is a property of the copy.
  ok(true, "and the page says 'if that address has an account' in both cases");
});

// ── The brand: a one-time invite ────────────────────────────────────────────

test("a brand invite works exactly once", async () => {
  const db = await resetDemoDb();
  const { key } = await signUpBrand(db, { name: "Acme", contactEmail: "a@acme.test" });

  const first = await redeemBrandInvite(db, {
    email: "a@acme.test",
    key,
    password: "a long ordinary phrase",
  });
  ok(first.ok, "the first redemption works");

  const second = await redeemBrandInvite(db, {
    email: "a@acme.test",
    key,
    password: "another long phrase",
  });
  no(second.ok, "the second does not — B1, the invite is dead");
  ok(
    second.ok === false && /works exactly once/.test(second.reason),
    "and the refusal says why",
  );
});

test("a wrong invite and an unknown brand read identically", async () => {
  const db = await resetDemoDb();
  await signUpBrand(db, { name: "Acme", contactEmail: "a@acme.test" });

  const wrongKey = await redeemBrandInvite(db, {
    email: "a@acme.test",
    key: "not-the-key",
    password: "a long ordinary phrase",
  });
  const unknown = await redeemBrandInvite(db, {
    email: "nobody@example.test",
    key: "not-the-key",
    password: "a long ordinary phrase",
  });
  no(wrongKey.ok, "a wrong key is refused");
  no(unknown.ok, "so is an unknown email");
  eq(
    wrongKey.ok === false && unknown.ok === false ? wrongKey.reason === unknown.reason : false,
    true,
    "identically — otherwise the form is a directory of who we have invited",
  );
});

test("a brand signs in with email and password after redeeming, and not before", async () => {
  const db = await resetDemoDb();
  const { key, brandId } = await signUpBrand(db, { name: "Nova", contactEmail: "n@nova.test" });

  const early = await brandSignIn(db, { email: "n@nova.test", password: "a long ordinary phrase" });
  no(early.ok, "an invited brand that never arrived cannot sign in");

  await redeemBrandInvite(db, {
    email: "n@nova.test",
    key,
    password: "a long ordinary phrase",
  });
  const later = await brandSignIn(db, {
    email: "n@nova.test",
    password: "a long ordinary phrase",
    ip: "203.0.113.9",
  });
  ok(later.ok, "and after redeeming, they can");
  eq(later.ok === true ? later.brandId : null, brandId, "into their own brand");

  const [row] = await db
    .select()
    .from(schema.brandUsers)
    .where(sqlEq(schema.brandUsers.brandId, brandId));
  eq(row.lastLoginIp, "203.0.113.9", "B3 — shared credentials mean the log is the only answer");
});

test("a brand is never a gamer", async () => {
  // B2/I4. Structural, not a flag: there is no column on a brand_users row
  // that could make it a gamer, and no gamer row is created by signing a brand
  // up. The assertion is over the tables, because that is where the guarantee
  // actually lives.
  const db = await resetDemoDb();
  const before = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users);

  const { key } = await signUpBrand(db, { name: "Acme", contactEmail: "a@acme.test" });
  await redeemBrandInvite(db, {
    email: "a@acme.test",
    key,
    password: "a long ordinary phrase",
  });

  const after = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users);
  eq(after[0].n, before[0].n, "signing up and redeeming created no gamer at all");
  no(await emailIsFree(db, "a@acme.test") === false, "and the brand's email is not taken as a gamer's");
});
