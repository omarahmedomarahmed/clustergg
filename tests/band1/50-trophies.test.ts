// Stage 5 — trophies, the prize-pool guard, milestones and redemption.
//
// The invariant that has to hold at every step:
//
//   prizeVault.balance == Σ(unredeemed money-trophies on live accounts)
//
// Several cases below assert it *after* the thing they are testing, not
// instead of it. A trophy operation that leaves the invariant intact but does
// the wrong thing is a bug; one that does the right thing and breaks the
// invariant is a broken promise.

import { ok, eq, no, throws } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema, type DB } from "../../lib/db/index.ts";
import {
  createTrophy,
  editTrophy,
  awardTrophy,
  checkPrizePool,
  instantiateTemplates,
  holderCountOf,
  sweepEligibleAt,
  TrophyRefused,
} from "../../lib/trophies/trophies.ts";
import {
  checkEligibility,
  requestRedemption,
  approveRedemption,
  markSent,
  markRedemptionPaid,
  beginEmailVerification,
  confirmEmailVerification,
  redemptionsInFlight,
  RedemptionRefused,
} from "../../lib/trophies/redemption.ts";
import { progressFor, consecutiveWeeks, awardEarnedMilestones } from "../../lib/trophies/milestones.ts";
import { settleChallenge, sweep, reverseSweep } from "../../lib/trophies/settle.ts";
import { checkPrizeVault } from "../../lib/money/prize-vault.ts";
import { balanceOf } from "../../lib/money/ledger.ts";
import { createInvoice, markPaid } from "../../lib/money/invoices.ts";
import {
  createGamer,
  setAgeBand,
  setCountry,
  deleteAccount,
  DeletionRefused,
} from "../../lib/identity/gamers.ts";
import { CHALLENGE_PRICE_CENTS, TROPHY_HOLD_YEARS, formatMoney } from "../../lib/money/amounts.ts";
import { createChallenge, attachInvoice, markScheduled } from "../../lib/challenges/lifecycle.ts";
import { uid } from "../../lib/core/utils.ts";
import { eq as sqlEq } from "drizzle-orm";

const MONDAY = new Date("2026-09-07T00:00:00Z");
const PRIZE = CHALLENGE_PRICE_CENTS / 2;

/** A paid challenge, so the prize vault actually holds the money. */
async function aFundedChallenge(db: DB, prizeCents = PRIZE) {
  const challengeId = await createChallenge(db, {
    title: "Funded",
    game: "Test Game",
    provider: "chesscom",
    startAt: MONDAY,
    prizePoolCents: prizeCents,
    metrics: { wins: 10, matches: 1 },
  });
  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    lines: [{ description: "Challenge", amountCents: CHALLENGE_PRICE_CENTS }],
  });
  await attachInvoice(db, challengeId, invoiceId);
  await markPaid(db, invoiceId);
  await markScheduled(db, challengeId);
  return challengeId;
}

async function anAdult(db: DB, name: string) {
  const userId = await createGamer(db, { displayName: name });
  await setAgeBand(db, userId, "adult");
  await setCountry(db, userId, "GB");
  return userId;
}

// ── Definitions ─────────────────────────────────────────────────────────────

test("a collectable can never carry money", async () => {
  const db = await resetDemoDb();
  await throws(
    () => createTrophy(db, { type: "participation", name: "Entrant", valueCents: 500 }),
    /always \$0/,
    "a participation trophy with a value would be a liability nobody funded",
  );
  await throws(
    () => createTrophy(db, { type: "milestone", name: "Five", valueCents: 100 }),
    /always \$0/,
    "and so would a milestone",
  );
  ok(
    (await createTrophy(db, { type: "podium", name: "First", valueCents: 10_000 })).length > 0,
    "only a podium trophy carries prize money",
  );
});

test("a value can never be edited; a name can, everywhere at once", async () => {
  const db = await resetDemoDb();
  const trophyId = await createTrophy(db, { type: "podium", name: "Old", valueCents: 10_000 });
  const userId = await anAdult(db, "Holder");

  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    lines: [{ description: "c", amountCents: 20_000 }],
  });
  await markPaid(db, invoiceId);
  await awardTrophy(db, { trophyId, userId });

  await editTrophy(db, trophyId, { name: "New", imageUrl: "/new.png", brandId: "brand-1" });
  const [after] = await db
    .select()
    .from(schema.trophies)
    .where(sqlEq(schema.trophies.id, trophyId));
  eq(after.name, "New", "the name changed");
  eq(after.imageUrl, "/new.png", "and the image");
  eq(after.valueCents, 10_000, "and the value did not — a $100 trophy is a $100 trophy forever");

  // T8 — an edit propagates to every holder because holders point at the
  // definition rather than copying it. There is nothing to propagate.
  const [holding] = await db
    .select({ name: schema.trophies.name })
    .from(schema.userTrophies)
    .innerJoin(schema.trophies, sqlEq(schema.userTrophies.trophyId, schema.trophies.id))
    .where(sqlEq(schema.userTrophies.userId, userId));
  eq(holding.name, "New", "so every holder already sees it");
});

// ── The prize-pool guard ────────────────────────────────────────────────────

test("the prize-pool guard flags over and under, and says by how much", async () => {
  const db = await resetDemoDb();
  const challengeId = await aFundedChallenge(db);

  const none = await checkPrizePool(db, challengeId);
  eq(none.direction, "under", "no trophies at all is under, not merely incomplete");
  eq(none.differenceCents, -PRIZE, "by the whole pool");

  const first = await createTrophy(db, {
    type: "podium",
    name: "First",
    valueCents: 10_000,
    challengeId,
    place: 1,
  });
  const stillUnder = await checkPrizePool(db, challengeId);
  eq(stillUnder.direction, "under", "part of the pool is still under");
  ok(/under by \$75\.00/.test(stillUnder.message), "and it says by how much");

  await createTrophy(db, {
    type: "podium",
    name: "Second",
    valueCents: 10_000,
    challengeId,
    place: 2,
  });
  const over = await checkPrizePool(db, challengeId);
  eq(over.direction, "over", "too much is over");
  ok(/over by \$25\.00/.test(over.message), "and it says by how much");
  no(over.ok, "and neither direction passes");

  await db
    .update(schema.trophies)
    .set({ valueCents: 7_500 })
    .where(sqlEq(schema.trophies.id, first));
  const exact = await checkPrizePool(db, challengeId);
  ok(exact.ok, "exactly equal passes");
  eq(exact.direction, "exact", "and says so");
});

test("templates instantiate a daily series without hand-making 21 trophies", async () => {
  // docs/03-CHALLENGES.md §6: a 7-day series with 3 winners a day is 21
  // trophies, and hand-making 21 of anything is how one gets the wrong value
  // and the pool guard fails on a Sunday night.
  const db = await resetDemoDb();
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const start = new Date(MONDAY.getTime() + i * 86_400_000);
    days.push(
      await createChallenge(db, {
        title: `Day ${i + 1}`,
        game: "Test Game",
        provider: "chesscom",
        startAt: start,
        cadence: "daily",
        prizePoolCents: 1_000,
        metrics: { wins: 10, matches: 1 },
      }),
    );
  }

  const created = await instantiateTemplates(db, days, [
    { place: 1, name: "Day winner", valueCents: 500 },
    { place: 2, name: "Runner-up", valueCents: 300 },
    { place: 3, name: "Third", valueCents: 200 },
  ]);

  eq(created.length, 21, "three templates across seven days is 21 trophies");
  for (const challengeId of days) {
    ok((await checkPrizePool(db, challengeId)).ok, "and every day's pool guard passes");
  }
});

// ── Awarding, and the invariant ─────────────────────────────────────────────

test("awarding a money-trophy keeps the vault invariant green", async () => {
  const db = await resetDemoDb();
  await aFundedChallenge(db);
  const trophyId = await createTrophy(db, { type: "podium", name: "First", valueCents: PRIZE });
  const userId = await anAdult(db, "Winner");

  eq((await checkPrizeVault(db)).state, "unallocated", "money in, not yet promised");
  await awardTrophy(db, { trophyId, userId });

  const check = await checkPrizeVault(db);
  eq(check.state, "green", "and now every dollar sits on a gamer's profile");
  ok(check.holds, "the invariant holds");
  eq(check.liabilityCents, PRIZE, "with exactly the prize as liability");
});

test("a duplicate award is a no-op, not a second liability", async () => {
  const db = await resetDemoDb();
  await aFundedChallenge(db);
  const trophyId = await createTrophy(db, { type: "podium", name: "First", valueCents: PRIZE });
  const userId = await anAdult(db, "Winner");

  ok((await awardTrophy(db, { trophyId, userId })).awarded, "the first award lands");
  no((await awardTrophy(db, { trophyId, userId })).awarded, "the second says plainly it did not");
  ok((await checkPrizeVault(db)).holds, "and the invariant is untouched");
});

test("an award with no money behind it is refused", async () => {
  const db = await resetDemoDb();
  // No invoice, so no money in the vault at all.
  const trophyId = await createTrophy(db, { type: "podium", name: "Unfunded", valueCents: 10_000 });
  const userId = await anAdult(db, "Hopeful");

  await throws(
    () => awardTrophy(db, { trophyId, userId }),
    /more money than the prize vault holds/,
    "a promise we cannot keep is refused at the moment it is made",
  );
  eq(await holderCountOf(db, trophyId), 0, "and nobody was told they won");
});

test("a $0 trophy never touches the vault", async () => {
  const db = await resetDemoDb();
  const trophyId = await createTrophy(db, { type: "participation", name: "Entrant" });
  const userId = await anAdult(db, "TurnedUp");
  ok((await awardTrophy(db, { trophyId, userId })).awarded, "it is awarded freely");
  eq(await balanceOf(db, "prize"), 0, "with no money involved at all");
  eq((await checkPrizeVault(db)).liabilityCents, 0, "and no liability created");
});

// ── Settling a challenge ────────────────────────────────────────────────────

test("settling awards the podium, the $0 participation trophy, and nothing twice", async () => {
  const db = await resetDemoDb();
  const challengeId = await aFundedChallenge(db);
  await createTrophy(db, {
    type: "podium",
    name: "Champion",
    valueCents: PRIZE,
    challengeId,
    place: 1,
  });

  const winner = await anAdult(db, "Champion");
  const others = [await anAdult(db, "Second"), await anAdult(db, "Third")];
  const all = [winner, ...others];
  for (let i = 0; i < all.length; i++) {
    await db.insert(schema.challengeParticipants).values({
      id: uid(),
      challengeId,
      userId: all[i],
      linkedAccountId: `acct-${i}`,
      placement: i + 1,
    });
  }

  const settled = await settleChallenge(db, challengeId, { actorId: "admin-1" });
  eq(settled.podium, 1, "one podium trophy for one place");
  eq(settled.participation, 2, "and the branded collectable for everybody else");

  const again = await settleChallenge(db, challengeId, { actorId: "admin-1" });
  eq(again.podium + again.participation, 0, "re-running settles nothing twice");

  const participation = await db
    .select()
    .from(schema.trophies)
    .where(sqlEq(schema.trophies.type, "participation"));
  eq(participation.length, 1, "there is ONE participation trophy definition");
  eq(await holderCountOf(db, participation[0].id), 2, "with a holder count — T3, not a row each");

  ok((await checkPrizeVault(db)).holds, "and the vault invariant holds after settlement");
});

// ── Milestones ──────────────────────────────────────────────────────────────

test("a milestone shows what is missing, not just a number", async () => {
  const db = await resetDemoDb();
  const userId = await anAdult(db, "Grinder");

  for (let i = 0; i < 3; i++) {
    const challengeId = await createChallenge(db, {
      title: `C${i}`,
      game: "League of Legends",
      provider: "riot-lol",
      startAt: new Date(MONDAY.getTime() + i * 7 * 86_400_000),
      metrics: { wins: 10 },
    });
    await db.insert(schema.challengeParticipants).values({
      id: uid(),
      challengeId,
      userId,
      linkedAccountId: "acct-1",
    });
  }

  const progress = await progressFor(db, userId);
  const perGame = progress.find((p) => p.kind === "five_in_game");
  eq(perGame?.have, 3, "three challenges in League");
  no(perGame?.earned ?? true, "not earned yet");
  ok(/3 of 5 challenges in League/.test(perGame?.missing ?? ""), "and the card says exactly that");
  ok(/2 to go/.test(perGame?.missing ?? ""), "including what is missing — T13");
});

test("consecutive weeks means consecutive, and a gap resets", async () => {
  const db = await resetDemoDb();
  const userId = await anAdult(db, "Streaker");

  // Weeks 1, 2, 3 — then a gap, then weeks 5 and 6.
  for (const offset of [0, 1, 2, 4, 5]) {
    const challengeId = await createChallenge(db, {
      title: `W${offset}`,
      game: "Test Game",
      provider: "chesscom",
      startAt: new Date(MONDAY.getTime() + offset * 7 * 86_400_000),
      metrics: { wins: 10 },
    });
    await db.insert(schema.challengeParticipants).values({
      id: uid(),
      challengeId,
      userId,
      linkedAccountId: "acct-1",
    });
  }

  eq(
    await consecutiveWeeks(db, userId),
    3,
    "five weeks entered, but the longest unbroken run is three — a gap resets rather than pausing",
  );
});

test("an earned milestone is awarded once, and it is worth nothing", async () => {
  const db = await resetDemoDb();
  const userId = await anAdult(db, "FiveTimer");
  for (let i = 0; i < 5; i++) {
    const challengeId = await createChallenge(db, {
      title: `C${i}`,
      game: "Chess",
      provider: "chesscom",
      startAt: new Date(MONDAY.getTime() + i * 7 * 86_400_000),
      metrics: { wins: 10 },
    });
    await db.insert(schema.challengeParticipants).values({
      id: uid(),
      challengeId,
      userId,
      linkedAccountId: "acct-1",
    });
  }

  const first = await awardEarnedMilestones(db, userId);
  ok(first.length >= 1, "the five-in-a-game milestone lands");
  eq(await awardEarnedMilestones(db, userId), [], "and it does not land again");

  const trophies = await db
    .select()
    .from(schema.trophies)
    .where(sqlEq(schema.trophies.type, "milestone"));
  ok(trophies.every((t) => t.valueCents === 0), "every milestone is a collectable");
  eq((await checkPrizeVault(db)).liabilityCents, 0, "so the vault is untouched");
});

// ── Redemption ──────────────────────────────────────────────────────────────

async function aHolding(db: DB, userId: string, valueCents: number) {
  if (valueCents > 0) {
    const invoiceId = await createInvoice(db, {
      payerType: "brand",
      lines: [{ description: "funding", amountCents: valueCents * 2 }],
    });
    await markPaid(db, invoiceId);
  }
  const trophyId = await createTrophy(db, {
    type: valueCents > 0 ? "podium" : "participation",
    name: valueCents > 0 ? "Prize" : "Entrant",
    valueCents,
  });
  await awardTrophy(db, { trophyId, userId });
  const [holding] = await db
    .select()
    .from(schema.userTrophies)
    .where(sqlEq(schema.userTrophies.trophyId, trophyId));
  return holding.id;
}

test("a $0 trophy is unredeemable at the action, not merely hidden", async () => {
  const db = await resetDemoDb();
  const userId = await anAdult(db, "Collector");
  const holdingId = await aHolding(db, userId, 0);

  const eligibility = await checkEligibility(db, holdingId, userId);
  no(eligibility.ok, "the page can grey the button");
  eq(eligibility.ok ? "" : eligibility.code, "zero_value", "for the right reason");

  const err = await throws(
    () => requestRedemption(db, { userTrophyId: holdingId, userId, method: "bank" }),
    /collectable/,
    "and the action refuses it too, however you reached the button",
  );
  ok(err instanceof RedemptionRefused, "with the redemption error");
});

test("/redeem is handed the collectable too, so the refusal is reachable", async () => {
  // ===== T2's SECOND HALF, WHICH IS THE ONE ABOUT SURFACES =====
  //
  // *"Enforced at the redeem action, **not merely hidden in the UI**."* The
  // test above proves the action refuses. This one proves the button can be
  // reached: a page whose query never returns the $0 holding would satisfy
  // the rule and photograph nothing, and 09 Band 2 shot 21 exists to
  // photograph exactly that refusal.
  //
  // Asserted on the query rather than on the JSX, because "does the template
  // render a button" is a rendering property and belongs in the browser pass
  // (break 179's lesson). What band 1 can hold is that the page is **given**
  // the row, with the refusal already attached, from the same function the
  // action calls.
  const db = await resetDemoDb();
  const userId = await anAdult(db, "Holder Of Both");
  const code = await beginEmailVerification(db, userId, "both@example.com");
  await confirmEmailVerification(db, userId, code);
  await aHolding(db, userId, 0);
  await aHolding(db, userId, 5_000);

  const { myRedeemables } = await import("../../lib/site/queries.ts");
  const { rows } = await myRedeemables(userId);
  eq(rows.length, 2, "both holdings reach the page");

  const collectable = rows.find((r) => r.trophy.valueCents === 0);
  ok(collectable !== undefined, "including the one worth nothing");
  eq(
    collectable!.eligibility.ok ? "" : collectable!.eligibility.code,
    "zero_value",
    "carrying the refusal the action would give, from the same function",
  );

  // The positive half, or a query that refused everything would pass.
  const money = rows.find((r) => r.trophy.valueCents > 0);
  ok(money !== undefined && money.eligibility.ok, "and the money one is offered");
});

test("a teen keeps the trophy and is told when they can have it", async () => {
  const db = await resetDemoDb();
  const userId = await createGamer(db, { displayName: "Young Winner" });
  await setAgeBand(db, userId, "teen");
  await setCountry(db, userId, "GB");
  const holdingId = await aHolding(db, userId, 10_000);

  const eligibility = await checkEligibility(db, holdingId, userId);
  eq(eligibility.ok ? "" : eligibility.code, "under_18", "refused");
  ok(
    !eligibility.ok && /keeps/.test(eligibility.reason),
    "and told the trophy is theirs, not that they lose it",
  );
  ok(
    !eligibility.ok && /support/.test(eligibility.reason),
    "with what to do when they turn 18 — G10",
  );
  eq(
    (await checkPrizeVault(db)).liabilityCents,
    10_000,
    "and the money is still held for them",
  );
});

test("email is asked only at redemption, and must be verified", async () => {
  const db = await resetDemoDb();
  const userId = await anAdult(db, "Cashing Out");
  const holdingId = await aHolding(db, userId, 10_000);

  const [before] = await db.select().from(schema.users).where(sqlEq(schema.users.id, userId));
  eq(before.email, null, "no email was asked for at onboarding — G2");

  const blocked = await checkEligibility(db, holdingId, userId);
  eq(blocked.ok ? "" : blocked.code, "email_unverified", "and a redeem needs one");

  const code = await beginEmailVerification(db, userId, "Winner@Example.com ");
  no((await confirmEmailVerification(db, userId, "000000")).ok, "a wrong code does nothing");
  ok((await confirmEmailVerification(db, userId, code)).ok, "the right one verifies");

  const [after] = await db.select().from(schema.users).where(sqlEq(schema.users.id, userId));
  eq(after.email, "winner@example.com", "stored normalised");
  ok(after.emailVerifiedAt !== null, "and marked verified");
  ok((await checkEligibility(db, holdingId, userId)).ok, "so now they can redeem");
});

test("an expired verification code does not verify", async () => {
  const db = await resetDemoDb();
  const userId = await anAdult(db, "Slow");
  const code = await beginEmailVerification(db, userId, "slow@example.com");
  await db
    .update(schema.emailVerifications)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(sqlEq(schema.emailVerifications.userId, userId));
  no((await confirmEmailVerification(db, userId, code)).ok, "expired is expired");
});

test("the full redemption sequence, and the vault falls by exactly the value", async () => {
  const db = await resetDemoDb();
  const userId = await anAdult(db, "Paid Out");
  const holdingId = await aHolding(db, userId, 10_000);
  const code = await beginEmailVerification(db, userId, "paid@example.com");
  await confirmEmailVerification(db, userId, code);

  const before = await balanceOf(db, "prize");
  const id = await requestRedemption(db, { userTrophyId: holdingId, userId, method: "bank" });

  eq(await balanceOf(db, "prize"), before, "requesting moves no money");
  await approveRedemption(db, id, "admin-1");
  eq(await balanceOf(db, "prize"), before, "and neither does approving");
  await markSent(db, id, "admin-1", "provider-ref-abc");
  eq(await balanceOf(db, "prize"), before, "nor sending");

  await markRedemptionPaid(db, id, "admin-1");
  eq(
    await balanceOf(db, "prize"),
    before - 10_000,
    "the vault falls by exactly the trophy's value, and only when it is paid — R4",
  );

  const check = await checkPrizeVault(db);
  ok(check.holds, "and the invariant still holds, because both sides moved together");
  eq(check.liabilityCents, 0, "the trophy is no longer a liability");
});

test("a redemption cannot skip a step, and cannot be paid twice", async () => {
  const db = await resetDemoDb();
  const userId = await anAdult(db, "Impatient");
  const holdingId = await aHolding(db, userId, 10_000);
  const code = await beginEmailVerification(db, userId, "i@example.com");
  await confirmEmailVerification(db, userId, code);
  const id = await requestRedemption(db, { userTrophyId: holdingId, userId, method: "bank" });

  await throws(
    () => markRedemptionPaid(db, id, "admin-1"),
    /Only a sent redemption/,
    "a pending redemption is not a paid one",
  );
  await approveRedemption(db, id, "admin-1");
  await markSent(db, id, "admin-1");
  await markRedemptionPaid(db, id, "admin-1");
  await throws(
    () => markRedemptionPaid(db, id, "admin-1"),
    /Only a sent redemption/,
    "and paying twice would pay twice",
  );
});

test("the same trophy cannot be redeemed twice", async () => {
  const db = await resetDemoDb();
  const userId = await anAdult(db, "Twice");
  const holdingId = await aHolding(db, userId, 10_000);
  const code = await beginEmailVerification(db, userId, "t@example.com");
  await confirmEmailVerification(db, userId, code);

  const id = await requestRedemption(db, { userTrophyId: holdingId, userId, method: "bank" });
  await approveRedemption(db, id, "admin-1");
  await markSent(db, id, "admin-1");
  await markRedemptionPaid(db, id, "admin-1");

  await throws(
    () => requestRedemption(db, { userTrophyId: holdingId, userId, method: "bank" }),
    /already cashed/,
    "a redeemed holding is spent",
  );
});

// ===== R3 / V17 — AND THE TEST THAT USED TO BE NAMED AFTER IT =====
//
// Until Sprint 11 there was a case here called *"deletion is refused while a
// redemption is in flight"* whose body did what the first test below does and
// stopped. Every assertion was true; not one of them was about deletion —
// because **nothing on the platform deleted an account**, and every suite that
// needed a deleted gamer wrote `UPDATE users SET status='deleted'` by hand.
//
// That is §0.1 with its halves reversed. The usual shape is evidence that
// exists and nothing that reads it; this was a guard that existed and a rule
// that did not, and the test name read identically either way. Trap 2, in the
// suite most likely to be believed about money.
//
// So the two claims are now two tests, named for what each actually proves.

test("what counts as in flight is pending, approved or sent — and not paid", async () => {
  const db = await resetDemoDb();
  const userId = await anAdult(db, "Leaving Mid-Payout");
  const holdingId = await aHolding(db, userId, 10_000);
  const code = await beginEmailVerification(db, userId, "l@example.com");
  await confirmEmailVerification(db, userId, code);
  const id = await requestRedemption(db, { userTrophyId: holdingId, userId, method: "bank" });

  eq((await redemptionsInFlight(db, userId)).length, 1, "one in flight");
  await approveRedemption(db, id, "admin-1");
  await markSent(db, id, "admin-1");
  eq((await redemptionsInFlight(db, userId)).length, 1, "still in flight once sent");

  await markRedemptionPaid(db, id, "admin-1");
  eq((await redemptionsInFlight(db, userId)).length, 0, "and settled once paid");
});

test("deletion is refused while a redemption is in flight, and allowed once it lands", async () => {
  // ===== CAN THIS FAIL? =====
  //
  // Yes, both ways, which is what the old version could not do. Dropping the
  // check makes the first half green and the refusal disappear; making
  // `deleteAccount` refuse unconditionally makes the second half red. Guard
  // 118's lesson: without the positive half, a function that refuses everybody
  // satisfies the negative one.
  const db = await resetDemoDb();
  const userId = await anAdult(db, "Closing Mid-Payout");
  const holdingId = await aHolding(db, userId, 10_000);
  const code = await beginEmailVerification(db, userId, "c@example.com");
  await confirmEmailVerification(db, userId, code);
  const id = await requestRedemption(db, { userTrophyId: holdingId, userId, method: "bank" });

  await throws(
    () => deleteAccount(db, userId),
    /cannot close the account/i,
    "money already handed to a provider cannot be paid to a record that is gone",
  );
  const [stillHere] = await db
    .select()
    .from(schema.users)
    .where(sqlEq(schema.users.id, userId));
  eq(stillHere.status, "active", "and the refusal left the account exactly as it was");

  await approveRedemption(db, id, "admin-1");
  await markSent(db, id, "admin-1");
  await throws(
    () => deleteAccount(db, userId),
    /cannot close the account/i,
    "still refused once sent — that is the moment the money is furthest out of reach",
  );

  await markRedemptionPaid(db, id, "admin-1");
  await deleteAccount(db, userId);
  const [gone] = await db.select().from(schema.users).where(sqlEq(schema.users.id, userId));
  eq(gone.status, "deleted", "and it goes through once the payout has landed");
});

test("a closed account is not a deleted row, because the trophy money was real", async () => {
  // V14/T6 — the holding **survives** the holder, as an orphan, so the prize
  // vault keeps accounting for money a brand actually paid. V15 then lets
  // admin sweep it, which is the only thing that makes the invariant hold
  // again — and none of that is possible if the row is hard-deleted.
  //
  // The contrast worth being exact about: the under-13 path *is* a hard
  // delete, because there is no lawful reason to keep a row we should never
  // have made. Two closures, two mechanisms, and the difference is the money.
  const db = await resetDemoDb();
  const userId = await anAdult(db, "Closing With A Trophy");
  await aHolding(db, userId, 10_000);

  await deleteAccount(db, userId);

  const holdings = await db
    .select()
    .from(schema.userTrophies)
    .where(sqlEq(schema.userTrophies.userId, userId));
  eq(holdings.length, 1, "the holding is still there");
  eq(holdings[0].redeemedAt, null, "and it was never marked cashed out, because it was not");

  const check = await checkPrizeVault(db);
  eq(check.state, "orphaned", "the vault says so rather than quietly balancing");
});

// ── Sweeps ──────────────────────────────────────────────────────────────────

test("orphaned money is swept to Cluster and the invariant comes back", async () => {
  const db = await resetDemoDb();
  const userId = await anAdult(db, "Departing");
  await aHolding(db, userId, 10_000);

  await db.update(schema.users).set({ status: "deleted" }).where(sqlEq(schema.users.id, userId));
  const orphaned = await checkPrizeVault(db);
  eq(orphaned.state, "orphaned", "the money is real and unclaimable");

  const clusterBefore = await balanceOf(db, "cluster");
  const swept = await sweep(db, { actorId: "admin-1", reason: "orphaned" });
  eq(swept.swept, 1, "one holding swept");
  eq(swept.amountCents, 10_000, "for its whole value");
  eq(await balanceOf(db, "cluster"), clusterBefore + 10_000, "and Cluster holds it now");

  const after = await checkPrizeVault(db);
  eq(after.state, "green", "the invariant holds again — V16");
  ok(after.holds, "with balance equal to live liability");
});

test("a sweep is logged with date, holder, value and reason", async () => {
  const db = await resetDemoDb();
  const userId = await anAdult(db, "Logged");
  await aHolding(db, userId, 10_000);
  await db.update(schema.users).set({ status: "deleted" }).where(sqlEq(schema.users.id, userId));
  await sweep(db, { actorId: "admin-1", reason: "orphaned" });

  const [entry] = await db.select().from(schema.auditLog);
  ok(entry !== undefined, "there is an audit row");
  eq(entry.actorId, "admin-1", "naming who did it");
  const detail = entry.detail as Record<string, unknown>;
  eq(detail.holder, userId, "the holder");
  eq(detail.valueCents, 10_000, "the value");
  eq(detail.reason, "orphaned", "the reason");
  ok(typeof detail.awardedAt === "string", "and when it was awarded — all four, V11");
});

test("a sweep is reversible, and re-funds the trophy", async () => {
  const db = await resetDemoDb();
  const userId = await anAdult(db, "Returning");
  const holdingId = await aHolding(db, userId, 10_000);
  await db.update(schema.users).set({ status: "deleted" }).where(sqlEq(schema.users.id, userId));
  await sweep(db, { actorId: "admin-1", reason: "orphaned" });

  // They come back.
  await db.update(schema.users).set({ status: "active" }).where(sqlEq(schema.users.id, userId));
  await reverseSweep(db, holdingId, "admin-1");

  const [holding] = await db
    .select()
    .from(schema.userTrophies)
    .where(sqlEq(schema.userTrophies.id, holdingId));
  eq(holding.sweptAt, null, "the trophy is theirs again — it always was");
  eq(await balanceOf(db, "prize"), 10_000, "and the money is back in the prize vault");
  ok((await checkPrizeVault(db)).holds, "with the invariant intact");
});

test("trophies are held for five years", () => {
  const awarded = new Date("2026-09-07T00:00:00Z");
  const due = sweepEligibleAt(awarded);
  eq(
    due.getUTCFullYear() - awarded.getUTCFullYear(),
    TROPHY_HOLD_YEARS,
    "five years — because a 13-year-old who wins must still have it at 18",
  );
});

test("an expired sweep takes only what is actually five years old", async () => {
  const db = await resetDemoDb();
  const oldHolder = await anAdult(db, "Long Ago");
  const recentHolder = await anAdult(db, "Recent");
  const oldHolding = await aHolding(db, oldHolder, 10_000);
  await aHolding(db, recentHolder, 10_000);

  const sixYearsAgo = new Date();
  sixYearsAgo.setUTCFullYear(sixYearsAgo.getUTCFullYear() - (TROPHY_HOLD_YEARS + 1));
  await db
    .update(schema.userTrophies)
    .set({ awardedAt: sixYearsAgo })
    .where(sqlEq(schema.userTrophies.id, oldHolding));

  const swept = await sweep(db, { actorId: "admin-1", reason: "expired" });
  eq(swept.swept, 1, "only the one past five years");
  eq(formatMoney(swept.amountCents), "$100.00", "for its value");
  eq(
    (await checkPrizeVault(db)).liabilityCents,
    10_000,
    "and the recent one is still held",
  );
});

test("a sweep needs a person", async () => {
  const db = await resetDemoDb();
  await throws(
    () => sweep(db, { actorId: "", reason: "orphaned" }),
    /admin action/,
    "a job never sweeps money to Cluster",
  );
});
