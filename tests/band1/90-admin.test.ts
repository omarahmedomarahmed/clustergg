// Stage 9 — admin, and the dashboard that comes before the rest of it.
//
// A1: the challenges dashboard is the most important page on the platform. The
// property under test is not that it renders — it is that it names **the
// specific thing** blocking each challenge, and that checks 1–3 from
// docs/07-DATA-MODEL.md are live indicators rather than a nightly report.

import { ok, eq, no } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema, type DB } from "../../lib/db/index.ts";
import { dashboard, notifications, weekendChecklist, vaultSearch } from "../../lib/admin/dashboard.ts";
import { createChallenge, attachInvoice, markScheduled, announce } from "../../lib/challenges/lifecycle.ts";
import { createInvoice, markPaid } from "../../lib/money/invoices.ts";
import { createTrophy, awardTrophy } from "../../lib/trophies/trophies.ts";
import { createGamer, setAgeBand, setCountry } from "../../lib/identity/gamers.ts";
import { signUpBrand } from "../../lib/portal/brand.ts";
import { allocateToPool } from "../../lib/money/pool.ts";
import { draftPayout, releasePayout } from "../../lib/money/payouts.ts";
import { CHALLENGE_PRICE_CENTS, splitOf } from "../../lib/money/amounts.ts";
import { uid } from "../../lib/core/utils.ts";
import { eq as sqlEq } from "drizzle-orm";

const NOW = new Date("2026-09-09T12:00:00Z");
const THIS_WEEK = new Date("2026-09-07T00:00:00Z");
const NEXT_WEEK = new Date("2026-09-14T00:00:00Z");
const PRIZE = splitOf(CHALLENGE_PRICE_CENTS).prize;

async function aChallenge(
  db: DB,
  opts: { paid?: boolean; metrics?: boolean; trophies?: number; startAt?: Date } = {},
) {
  const challengeId = await createChallenge(db, {
    title: "Weekly Chess",
    game: "Chess",
    provider: "chesscom",
    startAt: opts.startAt ?? NEXT_WEEK,
    prizePoolCents: PRIZE,
    metrics: opts.metrics === false ? null : { wins: 10, matches: 1 },
  });
  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    lines: [{ description: "Challenge", amountCents: CHALLENGE_PRICE_CENTS }],
  });
  await attachInvoice(db, challengeId, invoiceId);
  if (opts.paid !== false) {
    await markPaid(db, invoiceId);
    await markScheduled(db, challengeId);
  }
  if (opts.trophies !== undefined) {
    await db.insert(schema.trophies).values({
      id: uid(),
      type: "podium",
      name: "First",
      valueCents: opts.trophies,
      challengeId,
      place: 1,
    });
  }
  return { challengeId, invoiceId };
}

// ── The dashboard ───────────────────────────────────────────────────────────

test("the dashboard names the specific thing blocking each challenge", async () => {
  const db = await resetDemoDb();
  await aChallenge(db, { paid: false, metrics: false });

  const board = await dashboard(db, NOW);
  eq(board.queue.length, 1, "one challenge in the queue");
  const entry = board.queue[0];
  no(entry.ready, "not ready");

  ok(
    entry.blocking.some((b) => /bill is not paid/.test(b)),
    "it says the bill is not paid",
  );
  ok(
    entry.blocking.some((b) => /Metrics are not set/.test(b)),
    "and that metrics are not set",
  );
  ok(
    entry.blocking.some((b) => /prize pool/i.test(b)),
    "and that the trophies do not match the pool",
  );
  ok(
    entry.blocking.every((b) => b.length > 20 && !/needs attention/i.test(b)),
    "every one a sentence somebody can act on, never 'needs attention'",
  );
});

test("a challenge whose week started and never announced is the loudest row", async () => {
  const db = await resetDemoDb();
  await aChallenge(db, { startAt: THIS_WEEK, trophies: PRIZE });

  const board = await dashboard(db, NOW);
  const entry = board.queue[0];
  ok(
    /never announced/.test(entry.blocking[0]),
    "it leads with the fact that a brand paid and nothing happened",
  );
  ok(/Push it to a later week or refund/.test(entry.blocking[0]), "and says what to do");
  no(entry.ready, "and it is not 'ready' however complete its setup is");
});

test("a fully set-up challenge reads as ready", async () => {
  const db = await resetDemoDb();
  await aChallenge(db, { trophies: PRIZE });
  const board = await dashboard(db, NOW);
  ok(board.queue[0].ready, "paid, metrics set, trophies matching — ready to announce");
  eq(board.queue[0].blocking, [], "with nothing blocking it");
});

test("the prize-vault check is a live indicator, not a nightly report", async () => {
  const db = await resetDemoDb();
  await aChallenge(db, { trophies: PRIZE });

  const amber = await dashboard(db, NOW);
  const vaultIndicator = amber.indicators.find((i) => i.key === "prize_vault")!;
  no(vaultIndicator.ok, "money is in and not yet on a profile");
  ok(/not yet promised/.test(vaultIndicator.detail), "and the indicator says which amber it is");

  const userId = await createGamer(db, { displayName: "Winner" });
  const [trophy] = await db.select().from(schema.trophies);
  await awardTrophy(db, { trophyId: trophy.id, userId });

  const green = await dashboard(db, NOW);
  ok(green.indicators.find((i) => i.key === "prize_vault")!.ok, "and green once it is");
});

test("a prize-pool mismatch on an announced challenge is flagged on the dashboard", async () => {
  const db = await resetDemoDb();
  const { challengeId } = await aChallenge(db, { trophies: PRIZE });
  await announce(db, challengeId, "admin-1", []);

  ok(
    (await dashboard(db, NOW)).indicators.find((i) => i.key === "prize_pool_guards")!.ok,
    "matching to start with",
  );

  // Somebody edits the pool after the fact. The guard at announce cannot catch
  // that, which is exactly why the dashboard re-checks continuously.
  await db
    .update(schema.challenges)
    .set({ prizePoolCents: PRIZE + 5_000 })
    .where(sqlEq(schema.challenges.id, challengeId));

  const indicator = (await dashboard(db, NOW)).indicators.find(
    (i) => i.key === "prize_pool_guards",
  )!;
  no(indicator.ok, "and caught the moment it stops matching");
  ok(/against a pool of/.test(indicator.detail), "naming the challenge and both figures");
});

test("the pool ceiling is on the dashboard with the reason for it", async () => {
  const db = await resetDemoDb();
  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    lines: [{ description: "c", amountCents: CHALLENGE_PRICE_CENTS }],
  });
  await markPaid(db, invoiceId);
  await allocateToPool(db, { weekStart: THIS_WEEK, amountCents: 4_000 });

  const indicator = (await dashboard(db, NOW)).indicators.find(
    (i) => i.key === "pool_allocation",
  )!;
  ok(indicator.ok, "within the ceiling");
  ok(/never exceed half/.test(indicator.detail), "and the reason is on the page, not in a doc");
  ok(
    /refunds, disputes and quiet weeks/.test(indicator.detail),
    "including what the held half is for",
  );
});

test("an announced challenge with an unpaid bill is an alarm", async () => {
  const db = await resetDemoDb();
  const { challengeId } = await aChallenge(db, { trophies: PRIZE });
  await announce(db, challengeId, "admin-1", []);

  ok(
    (await dashboard(db, NOW)).indicators.find((i) => i.key === "announced_unpaid")!.ok,
    "nothing announced is unpaid",
  );

  // This should be impossible through the model. If it ever happens, something
  // wrote a state directly — so the dashboard has to be able to see it.
  const [challenge] = await db
    .select()
    .from(schema.challenges)
    .where(sqlEq(schema.challenges.id, challengeId));
  await db
    .update(schema.invoices)
    .set({ paidAt: null, status: "issued" })
    .where(sqlEq(schema.invoices.id, challenge.invoiceId as string));

  const indicator = (await dashboard(db, NOW)).indicators.find(
    (i) => i.key === "announced_unpaid",
  )!;
  no(indicator.ok, "and it is seen");
  ok(/announced and unpaid/.test(indicator.detail), "naming what is wrong");
});

// ── Notifications ───────────────────────────────────────────────────────────

test("the three notifications, and admin never has to go looking", async () => {
  const db = await resetDemoDb();
  const since = new Date(Date.now() - 60_000);

  await signUpBrand(db, { name: "Acme", contactEmail: "a@acme.test" });
  await createChallenge(db, {
    title: "A draft",
    game: "Chess",
    provider: "chesscom",
    startAt: NEXT_WEEK,
  });
  const { invoiceId } = await aChallenge(db);

  const list = await notifications(db, since);
  const kinds = new Set(list.map((n) => n.kind));
  ok(kinds.has("brand_signup"), "a brand signed up");
  ok(kinds.has("brand_building"), "a brand started building");
  ok(kinds.has("challenge_paid"), "a challenge was paid");
  ok(
    list.every((n, i) => i === 0 || list[i - 1].at.getTime() >= n.at.getTime()),
    "newest first",
  );
  ok(list.some((n) => n.refId === invoiceId), "and each one points at the thing it is about");
});

test("notifications are derived, so none is lost and none is duplicated", async () => {
  const db = await resetDemoDb();
  const since = new Date(Date.now() - 60_000);
  await signUpBrand(db, { name: "Acme", contactEmail: "a@acme.test" });

  const first = await notifications(db, since);
  const second = await notifications(db, since);
  eq(first.length, second.length, "asking twice gives the same answer");

  const later = await notifications(db, new Date(Date.now() + 60_000));
  eq(later.length, 0, "and asking about the future gives nothing");
});

// ── The weekend routine ─────────────────────────────────────────────────────

test("the weekend checklist derives its state rather than being ticked", async () => {
  // docs/08: it survives one person being ill. A checklist somebody ticks says
  // "done" when they meant "started".
  const db = await resetDemoDb();
  const steps = await weekendChecklist(db, NOW);

  ok(steps.length >= 6, "every step of the routine is there");
  ok(
    steps.every((s) => s.detail.length > 10),
    "each with a detail that says where things actually stand",
  );

  const allocate = steps.find((s) => s.key === "allocate")!;
  no(allocate.done, "nothing is allocated yet");
  ok(
    /nothing auto-allocates/i.test(allocate.detail),
    "and the step says why that is not an oversight",
  );

  const nextWeek = steps.find((s) => s.key === "next-week-paid")!;
  ok(nextWeek.done, "nothing unpaid, because nothing is sold");
});

test("the checklist notices a payout still sitting in draft", async () => {
  const db = await resetDemoDb();
  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    lines: [{ description: "c", amountCents: CHALLENGE_PRICE_CENTS }],
  });
  await markPaid(db, invoiceId);
  await allocateToPool(db, { weekStart: THIS_WEEK, amountCents: 4_000 });
  const payoutId = await draftPayout(db, {
    guildId: "g1",
    weekStart: THIS_WEEK,
    lines: [{ kind: "flat", description: "Flat", amountCents: 4_000 }],
  });

  const before = (await weekendChecklist(db, NOW)).find((s) => s.key === "payouts")!;
  no(before.done, "a draft is not a payout");
  ok(/human releases/.test(before.detail), "and the step says whose job that is");

  await releasePayout(db, payoutId, "admin-1");
  const after = (await weekendChecklist(db, NOW)).find((s) => s.key === "payouts")!;
  ok(after.done, "released is done");
});

test("the checklist says what the Saturday deadline means", async () => {
  const db = await resetDemoDb();
  await aChallenge(db, { paid: false });
  const step = (await weekendChecklist(db, NOW)).find((s) => s.key === "next-week-paid")!;
  no(step.done, "something for next week is unpaid");
  ok(
    /cannot start Monday/.test(step.detail),
    "and the step says the consequence, not just the count",
  );
});

test("the checklist reports orphaned money and what to do with it", async () => {
  const db = await resetDemoDb();
  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    lines: [{ description: "c", amountCents: CHALLENGE_PRICE_CENTS }],
  });
  await markPaid(db, invoiceId);
  const trophyId = await createTrophy(db, { type: "podium", name: "Prize", valueCents: PRIZE });
  const userId = await createGamer(db, { displayName: "Departing" });
  await awardTrophy(db, { trophyId, userId });
  await db.update(schema.users).set({ status: "deleted" }).where(sqlEq(schema.users.id, userId));

  const step = (await weekendChecklist(db, NOW)).find((s) => s.key === "sweep-check")!;
  no(step.done, "there is orphaned money");
  ok(/held for deleted accounts/.test(step.detail), "the checklist says so");
  ok(/Sweep it/.test(step.detail), "and what to do about it");
});

// ── The vault search ────────────────────────────────────────────────────────

test("the prize vault is searchable by gamer name", async () => {
  // V4 — admin can search by gamer name and see every trophy they hold and
  // whether a redeem is pending.
  const db = await resetDemoDb();
  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    lines: [{ description: "c", amountCents: CHALLENGE_PRICE_CENTS * 2 }],
  });
  await markPaid(db, invoiceId);

  const userId = await createGamer(db, { displayName: "Searchable Gamer" });
  await setAgeBand(db, userId, "adult");
  await setCountry(db, userId, "GB");
  for (const value of [PRIZE, 0]) {
    const trophyId = await createTrophy(db, {
      type: value > 0 ? "podium" : "participation",
      name: value > 0 ? "Prize" : "Entrant",
      valueCents: value,
    });
    await awardTrophy(db, { trophyId, userId });
  }

  const results = await vaultSearch(db, "searchable");
  eq(results.length, 2, "every trophy they hold");
  ok(results[0].trophy.valueCents >= results[1].trophy.valueCents, "money first");
  eq(results[0].redemption, null, "and whether a redeem is pending — here, none is");

  eq((await vaultSearch(db, "nobody")).length, 0, "and a name nobody has finds nothing");
});
