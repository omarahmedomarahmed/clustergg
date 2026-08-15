// Sprint 2 — what the portal screens rest on.
//
// The pages themselves render; they decide nothing. What they decide *with* is
// three things that did not exist before this sprint, and all three are the
// kind that fail silently:
//
//   1. **The gate.** A portal session is for exactly one portal. §9's
//      *"see another brand's numbers · which is exactly why nobody sees
//      theirs"* is one property, and it fails open by default in every
//      cookie-based scheme that keys on "is logged in" rather than "is logged
//      in *here*".
//   2. **The standing.** A position and a lever. Wrong ranking is invisible —
//      the page still renders a number, and the number is still plausible.
//   3. **The payout preference.** House rule 5, at the one place on the
//      platform where somebody is being asked how to be paid, which is
//      precisely where an IBAN gets typed.

import { ok, eq, no, throws } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema, type DB } from "../../lib/db/index.ts";
import { uid } from "../../lib/core/utils.ts";
import { eq as sqlEq } from "drizzle-orm";
import {
  ownerStanding,
  setPayoutPreference,
  setOwnerContact,
  PAYOUT_PREFERENCES,
  CommunityBuilderRefused,
} from "../../lib/portal/owner.ts";
import { portalCookieName, signPayload, verifyPayload } from "../../lib/core/portal-auth.ts";
import { KPI_WEIGHTS } from "../../lib/money/amounts.ts";
import { signUpBrand, confirmAndPay, onInvoicePaid } from "../../lib/portal/brand.ts";
import { announce } from "../../lib/challenges/lifecycle.ts";
import { enterChallenge } from "../../lib/challenges/entry.ts";
import { createGamer } from "../../lib/identity/gamers.ts";
import { linkAccount } from "../../lib/identity/accounts.ts";
import { createTrophy } from "../../lib/trophies/trophies.ts";
import { CHALLENGE_PRICE_CENTS, splitOf } from "../../lib/money/amounts.ts";

const NOW = new Date("2026-09-16T12:00:00Z");
const WEEK = new Date("2026-09-14T00:00:00Z");

async function aGuild(db: DB, guildId: string, over: Record<string, unknown> = {}) {
  await db.insert(schema.guilds).values({
    guildId,
    name: `Server ${guildId}`,
    slug: `server-${guildId}`,
    memberCount: 500,
    community: "A competitive gaming community.",
    announceChannelId: `chan-${guildId}`,
    ...over,
  });
}

// ── The gate ────────────────────────────────────────────────────────────────

test("a portal session is scoped to one portal, by construction", () => {
  // The id is part of the COOKIE NAME, not only of the signature. That is what
  // makes "logged into brand A" structurally unable to mean "logged in" at
  // brand B — the browser does not even send the other portal's cookie.
  const a = portalCookieName("brand", "brand-a");
  const b = portalCookieName("brand", "brand-b");
  ok(a !== b, "two brands do not share a cookie name");
  ok(a.includes("brand-a"), "the portal's id is in the name");

  const server = portalCookieName("server", "brand-a");
  ok(
    server !== a,
    "and a server portal with the same id is still a different cookie — the kind is in the name too",
  );
});

test("a portal signature does not transfer between portals", () => {
  // Belt as well as braces: even handed the *value*, it does not verify
  // against another portal's payload.
  const mine = signPayload("brand:brand-a");
  ok(verifyPayload("brand:brand-a", mine), "my own payload verifies");
  no(verifyPayload("brand:brand-b", mine), "another brand's does not");
  no(verifyPayload("server:brand-a", mine), "nor the same id as a server");
  no(verifyPayload("brand:brand-a", null), "and nothing verifies as nothing");
});

// ── The standing ────────────────────────────────────────────────────────────

/**
 * Two servers, one challenge, one entrant each — but one server has half the
 * linked members, so it wins on conversion.
 */
async function twoServersOneChallenge(db: DB) {
  await aGuild(db, "big");
  await aGuild(db, "small", { memberCount: 100 });

  const { brandId } = await signUpBrand(db, { name: "Acme", contactEmail: "a@acme.test" });
  const { invoiceId, challengeIds } = await confirmAndPay(
    db,
    { brandId, games: ["chesscom"], challengesPerGame: 1, startingWeek: WEEK, weeks: 1 },
    new Date("2026-09-09T12:00:00Z"),
  );
  await onInvoicePaid(db, invoiceId);
  const challengeId = challengeIds[0];

  // The linked-member counts are the conversion denominator, and they are the
  // whole point of this fixture: one entrant out of 10 linked members beats one
  // out of 200.
  for (const guildId of ["big", "small"]) {
    await db.insert(schema.guildSnapshots).values({
      id: uid(),
      guildId,
      weekStart: WEEK,
      memberCount: guildId === "big" ? 500 : 100,
      linkedCount: guildId === "big" ? 200 : 10,
    });
  }

  // A5 — the builder deliberately leaves metrics unset, because a brand does
  // not choose how a challenge scores, and the readiness guard refuses to
  // announce without them.
  await db
    .update(schema.challenges)
    .set({ metrics: { wins: 10, matches: 1 } })
    .where(sqlEq(schema.challenges.id, challengeId));
  await createTrophy(db, {
    type: "podium",
    name: "Acme Champion",
    valueCents: splitOf(CHALLENGE_PRICE_CENTS).prize,
    brandId,
    challengeId,
    place: 1,
  });
  await announce(db, challengeId, "admin-1", ["big", "small"]);

  for (const guildId of ["big", "small"]) {
    const userId = await createGamer(db, { displayName: `Player ${guildId}` });
    await db
      .update(schema.users)
      .set({ ageBand: "adult", country: "GB" })
      .where(sqlEq(schema.users.id, userId));
    await linkAccount(db, {
      userId,
      provider: "chesscom",
      providerAccountId: `ext-${guildId}`,
      inGameName: `player-${guildId}`,
      verifiedMethod: "oauth",
    });
    await db.insert(schema.guildMembers).values({ id: uid(), guildId, userId });
    await enterChallenge(db, { challengeId, userId, guildId }, NOW);
  }
  return challengeId;
}

test("a standing is a position, a field size, and a lever", async () => {
  const db = await resetDemoDb();
  await twoServersOneChallenge(db);

  const small = await ownerStanding(db, "small", NOW);
  const big = await ownerStanding(db, "big", NOW);

  eq(small.of, 2, "the field is both servers");
  ok(small.position !== null && big.position !== null, "both are placed");
  ok(
    small.position !== big.position,
    "and they are not both first — a position that never separates anybody is not a position",
  );
  ok(
    (small.position as number) < (big.position as number),
    "the server converting 1 of 10 members beats the one converting 1 of 200 — " +
      "K4, being twice as big is worth one position, not twice the score",
  );
  ok(typeof small.lever === "string" && small.lever.length > 20, "and there is a lever, in words");
});

test("the lever names the weakest KPI, not the loudest one", async () => {
  const db = await resetDemoDb();
  await twoServersOneChallenge(db);

  // `big` has the same single entrant and a far worse conversion, so the thing
  // that would move it is conversion — not "get more entrants", which is the
  // advice a page would give if it just named the biggest weight.
  const big = await ownerStanding(db, "big", NOW);
  const weakest = [...big.kpis].sort((a, b) => a.rank - b.rank)[0];
  eq(weakest.key, "conversion", "conversion is where this server actually loses");
  ok(
    (big.lever ?? "").toLowerCase().includes("conversion"),
    "and that is what the lever talks about",
  );
  ok(
    KPI_WEIGHTS.entrants > KPI_WEIGHTS.conversion,
    "even though entrants carries the larger weight — the lever is about rank, not weight",
  );
});

test("a dropped server is told it is out of the run, not ranked last", async () => {
  const db = await resetDemoDb();
  await twoServersOneChallenge(db);
  await db
    .update(schema.guilds)
    .set({ community: null })
    .where(sqlEq(schema.guilds.guildId, "small"));

  const standing = await ownerStanding(db, "small", NOW);
  eq(standing.position, null, "no position at all — K7, dropped is not last place");
  ok(
    (standing.droppedReason ?? "").length > 0,
    "and the reason is carried to the page that has to say it",
  );
  ok(
    /describe/i.test(standing.droppedReason ?? ""),
    "with the thing to do about it, not just the diagnosis",
  );
});

// ── House rule 5, at the point of sale ──────────────────────────────────────

test("a payout preference is a word from a fixed list", async () => {
  const db = await resetDemoDb();
  await aGuild(db, "g1");

  for (const preference of PAYOUT_PREFERENCES) {
    await setPayoutPreference(db, "g1", { preference, handle: "acct_9f3b" });
  }
  const [guild] = await db.select().from(schema.guilds).where(sqlEq(schema.guilds.guildId, "g1"));
  eq(guild.payoutPreference, PAYOUT_PREFERENCES.at(-1), "the last one stuck");

  await throws(
    () => setPayoutPreference(db, "g1", { preference: "cheque in the post" }),
    /not one of the ways we pay/,
    "and a word nobody ratified is refused — the list is closed on purpose",
  );
});

test("an account number cannot be typed into the payout handle", async () => {
  // House rule 5. The field a person is asked to fill in while thinking about
  // being paid is exactly where an IBAN goes, and a form's `maxlength` is not
  // a guard — this is checked in the function, which is what an HTTP client
  // posting directly also goes through.
  const db = await resetDemoDb();
  await aGuild(db, "g1");

  for (const attempt of [
    "GB29 NWBK 6016 1331 9268 19",
    "4111 1111 1111 1111",
    "12345678901234",
    "sort 20-00-00 acct 55779911",
  ]) {
    await throws(
      () => setPayoutPreference(db, "g1", { preference: "bank", handle: attempt }),
      /looks like an account number/,
      `refused: ${attempt}`,
    );
  }

  await setPayoutPreference(db, "g1", { preference: "bank", handle: "acct_1QxZr9" });
  const [guild] = await db.select().from(schema.guilds).where(sqlEq(schema.guilds.guildId, "g1"));
  eq(guild.payoutHandle, "acct_1QxZr9", "an opaque provider reference is fine, and is all we want");
});

test("the admin role is stored as an ID, never a name", async () => {
  // S5. A renamed role must not silently revoke access, and it would if we
  // keyed on the thing people rename.
  const db = await resetDemoDb();
  await aGuild(db, "g1");

  await throws(
    () => setOwnerContact(db, "g1", { adminRoleId: "Moderators" }),
    /not a role ID/,
    "a role name is refused, with how to find the ID",
  );
  await setOwnerContact(db, "g1", { adminRoleId: "889912345678901234", contactName: "Ali" });

  const [guild] = await db.select().from(schema.guilds).where(sqlEq(schema.guilds.guildId, "g1"));
  eq(guild.adminRoleId, "889912345678901234", "an ID is kept");
  eq(guild.contactName, "Ali", "alongside the contact");
});

test("a refusal from settings is a refusal, not a crash", async () => {
  const db = await resetDemoDb();
  await aGuild(db, "g1");
  let caught: unknown = null;
  try {
    await setPayoutPreference(db, "g1", { preference: "bitcoin" });
  } catch (e) {
    caught = e;
  }
  ok(
    caught instanceof CommunityBuilderRefused,
    "it is the refusal type the portal actions catch and show, not a bare Error",
  );
});
