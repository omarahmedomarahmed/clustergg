// Sprint 4a — the HTTP surface, and the three things it must get right.
//
// The routes themselves are thin: they read a body, call a library that is
// already tested, and answer. What is *not* thin, and what this suite is
// about, is the small amount of decision-making that only exists at the
// transport layer and therefore has no test anywhere else:
//
//   1. **Cron authorisation** — the direction of the default. These are public
//      URLs, and one of them closes the week.
//   2. **Stripe's signature** — raw bytes, rotation, and replay.
//   3. **Idempotency** — because Stripe retries for three days, and without it
//      one payment routes into the vaults twice and the prize-vault invariant
//      stops holding.

import { ok, eq, no } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { createHmac } from "node:crypto";
import { resetDemoDb, schema } from "../../lib/db/index.ts";
import { authoriseCron } from "../../lib/core/cron-auth.ts";
import {
  verifySignature,
  handleStripeEvent,
  alreadyHandled,
  HANDLED_EVENTS,
  SIGNATURE_TOLERANCE_SECONDS,
  type StripeEvent,
} from "../../lib/money/stripe.ts";
import { signUpBrand, confirmAndPay } from "../../lib/portal/brand.ts";
import { balanceOf } from "../../lib/money/ledger.ts";
import { checkPrizeVault } from "../../lib/money/prize-vault.ts";

const WEEK = new Date("2026-09-14T00:00:00Z");
const BUYING = new Date("2026-09-09T12:00:00Z");

// ── Cron authorisation ──────────────────────────────────────────────────────

test("a cron route with no secret configured refuses on a real deployment", () => {
  // ===== THE DIRECTION IS THE WHOLE GUARD =====
  //
  // `/api/cron/daily` closes the week. If an unset secret meant "let anybody
  // in", every scheduled job on the platform would be an open endpoint — and
  // the misconfiguration that caused it would look like nothing at all.
  const previous = { cron: process.env.CRON_SECRET, db: process.env.DATABASE_URL };
  try {
    delete process.env.CRON_SECRET;
    process.env.DATABASE_URL = "postgres://example/not-a-demo";

    const verdict = authoriseCron("Bearer anything");
    no(verdict.ok, "a real deployment with no secret refuses");
    eq(verdict.ok === false ? verdict.status : 0, 503, "and says it is a misconfiguration, not a wrong key");
  } finally {
    if (previous.cron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous.cron;
    if (previous.db === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.db;
  }
});

test("a wrong bearer token is refused, and the right one is not", () => {
  const previous = process.env.CRON_SECRET;
  try {
    process.env.CRON_SECRET = "a-long-scheduler-secret";

    no(authoriseCron(null).ok, "no header at all is refused");
    no(authoriseCron("Bearer wrong").ok, "a wrong token is refused");
    no(authoriseCron("Bearer ").ok, "and so is an empty one");
    ok(authoriseCron("Bearer a-long-scheduler-secret").ok, "the right one is not");
    ok(authoriseCron("a-long-scheduler-secret").ok, "with or without the Bearer prefix");
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});

test("the demo runs its jobs without a secret, and only the demo", () => {
  // Fenced on the absence of a database, like every other demo allowance —
  // never on NODE_ENV, which is set to whatever the host feels like.
  const previous = { cron: process.env.CRON_SECRET, db: process.env.DATABASE_URL };
  try {
    delete process.env.CRON_SECRET;
    delete process.env.DATABASE_URL;
    ok(authoriseCron(null).ok, "the in-process demo needs no scheduler secret");
  } finally {
    if (previous.cron !== undefined) process.env.CRON_SECRET = previous.cron;
    if (previous.db !== undefined) process.env.DATABASE_URL = previous.db;
  }
});

// ── Stripe's signature ──────────────────────────────────────────────────────

const SECRET = "whsec_test_secret";

function signed(body: string, at: Date, secret = SECRET): string {
  const t = Math.floor(at.getTime() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

test("a Stripe signature is checked against the raw body", () => {
  const now = new Date("2026-09-15T12:00:00Z");
  const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });

  ok(verifySignature(body, signed(body, now), SECRET, now).ok, "the real signature verifies");

  // ===== THE TRAP FROM 10-SETUP §5 =====
  //
  // Re-serialising the JSON produces a byte-identical string here only by
  // luck. Any handler that parses and re-stringifies is signing different
  // bytes, and every delivery 400s on a perfectly valid request.
  const reserialised = JSON.stringify(JSON.parse(body));
  const changed = `${reserialised} `;
  no(
    verifySignature(changed, signed(body, now), SECRET, now).ok,
    "one byte of difference and it does not — which is why the route reads text(), never json()",
  );
});

test("a signature from during a secret rotation still verifies", () => {
  // Stripe sends more than one `v1` while a signing secret is being rotated.
  // A verifier that reads only the first is broken for the whole rotation
  // window, and the symptom is "payments stopped" with no code change.
  const now = new Date("2026-09-15T12:00:00Z");
  const body = JSON.stringify({ id: "evt_2", type: "checkout.session.completed" });
  const t = Math.floor(now.getTime() / 1000);
  const old = createHmac("sha256", "whsec_old").update(`${t}.${body}`).digest("hex");
  const current = createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex");

  ok(
    verifySignature(body, `t=${t},v1=${old},v1=${current}`, SECRET, now).ok,
    "any one of the signatures matching is a valid delivery",
  );
});

test("an old delivery is refused however well signed", () => {
  const now = new Date("2026-09-15T12:00:00Z");
  const body = JSON.stringify({ id: "evt_3", type: "checkout.session.completed" });
  const stale = new Date(now.getTime() - (SIGNATURE_TOLERANCE_SECONDS + 60) * 1000);

  no(
    verifySignature(body, signed(body, stale), SECRET, now).ok,
    "a replay of a genuinely signed old delivery is still a replay",
  );
});

test("a missing secret or header is refused, not skipped", () => {
  const now = new Date();
  const body = "{}";
  no(verifySignature(body, signed(body, now), undefined, now).ok, "no configured secret refuses");
  no(verifySignature(body, null, SECRET, now).ok, "no header refuses");
  no(verifySignature(body, "t=1,v1=", SECRET, now).ok, "and a malformed header refuses");
});

// ── The webhook, and the three days of retries ──────────────────────────────

async function aPaidCheckout(db: Awaited<ReturnType<typeof resetDemoDb>>) {
  const { brandId } = await signUpBrand(db, { name: "Acme", contactEmail: "a@acme.test" });
  const { invoiceId } = await confirmAndPay(
    db,
    { brandId, games: ["chesscom"], challengesPerGame: 1, startingWeek: WEEK, weeks: 1 },
    BUYING,
  );
  return invoiceId;
}

function event(id: string, type: string, invoiceId: string): StripeEvent {
  return { id, type, data: { object: { client_reference_id: invoiceId } } };
}

test("the webhook is the only thing that moves a challenge to scheduled", async () => {
  const db = await resetDemoDb();
  const invoiceId = await aPaidCheckout(db);

  const before = await db.select().from(schema.challenges);
  eq(before[0].state, "pending_payment", "a bill exists and nothing has moved");

  const outcome = await handleStripeEvent(
    db,
    event("evt_paid_1", "checkout.session.completed", invoiceId),
  );
  eq(outcome.kind, "paid", "the event is a payment");

  const after = await db.select().from(schema.challenges);
  eq(after[0].state, "scheduled", "and A2 is satisfied — the webhook moved it");
});

test("a retried event is a no-op, and still answers", async () => {
  // ===== THE EXPENSIVE ONE (10-SETUP §5 trap 4) =====
  //
  // Stripe retries any non-2xx for three days. Without idempotency one payment
  // becomes two sets of vault entries — and `prizeVault.balance == Σ(unredeemed
  // money-trophies)` is the invariant the platform rests on.
  const db = await resetDemoDb();
  const invoiceId = await aPaidCheckout(db);
  const delivery = event("evt_paid_2", "checkout.session.completed", invoiceId);

  await handleStripeEvent(db, delivery);
  const before = await checkPrizeVault(db);
  const once = {
    income: await balanceOf(db, "income"),
    prize: await balanceOf(db, "prize"),
    server: await balanceOf(db, "server"),
    cluster: await balanceOf(db, "cluster"),
  };
  ok(once.prize > 0, "the first delivery routed money");

  const replay = await handleStripeEvent(db, delivery);
  eq(replay.kind, "replay", "the second is recognised as the same event");
  const after = await checkPrizeVault(db);

  eq(await balanceOf(db, "income"), once.income, "and no vault moved a cent");
  eq(await balanceOf(db, "prize"), once.prize, "not the prize vault");
  eq(await balanceOf(db, "server"), once.server, "not the server vault");
  eq(await balanceOf(db, "cluster"), once.cluster, "not Cluster's");

  // ===== WHAT A REPLAY MUST GUARANTEE, ASSERTED AS ITSELF =====
  //
  // The first version of this line read
  //
  //     ok(vault.ok || vault.state !== "over_allocated", "…the invariant is intact")
  //
  // There is no `ok` on `PrizeVaultCheck` — the field is `holds` — so the left
  // side was always `undefined`, the expression collapsed to a comparison
  // against one enum value, and it checked nothing it claimed to. That is the
  // exact defect this branch exists to end, and typecheck names it in one line.
  //
  // Fixing the field exposed the second half of the mistake: `holds` is the
  // WRONG QUESTION HERE. At this point in the flow $175 has been paid and no
  // trophy has been assigned, so the vault is legitimately **unallocated** —
  // the amber rhythm 02-MONEY §5 describes as normal — and `holds` is false by
  // design. Asserting it would have been a test demanding the platform be in a
  // state it should not be in.
  //
  // What a replay actually promises is that **nothing moved**. So that is what
  // is asserted, against the whole check rather than one field: a second
  // delivery of the same event must leave the vault byte-identical.
  eq(after.balanceCents, before.balanceCents, "the prize vault balance is unchanged");
  eq(after.liabilityCents, before.liabilityCents, "so is the liability");
  eq(after.differenceCents, before.differenceCents, "so is the difference between them");
  eq(after.state, before.state, `and the state is still ${before.state}`);
  no(
    after.state === "over_allocated",
    "and it is certainly not over-allocated — the one state that is a failure " +
      "rather than a phase, and the one a double-routed payment produces",
  );
});

test("every handled event is recorded, including the ones we ignore", async () => {
  const db = await resetDemoDb();
  const invoiceId = await aPaidCheckout(db);

  no(await alreadyHandled(db, "evt_unseen"), "an unseen event is not recorded");

  const ignored = await handleStripeEvent(
    db,
    event("evt_ignored", "customer.subscription.updated", invoiceId),
  );
  eq(ignored.kind, "ignored", "an event we do not subscribe to does nothing");
  ok(
    await alreadyHandled(db, "evt_ignored"),
    "but it is recorded — 'it arrived and we did nothing' is worth knowing when " +
      "somebody asks why nothing happened",
  );
});

test("an event with no invoice reference is refused rather than guessed at", async () => {
  const db = await resetDemoDb();
  const outcome = await handleStripeEvent(db, {
    id: "evt_orphan",
    type: "checkout.session.completed",
    data: { object: {} },
  });
  eq(outcome.kind, "ignored", "nothing is inferred from an amount");
  ok(
    outcome.kind === "ignored" && /invoice reference/.test(outcome.why),
    "and the reason says what was missing — an amount is not a key",
  );
});

test("the four subscribed events are the four the setup document names", () => {
  // 10-SETUP §5: "Do not subscribe to everything. Thousands of irrelevant
  // deliveries bury the useful ones."
  eq(HANDLED_EVENTS.length, 4, "four, not everything");
  for (const name of [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "charge.refunded",
  ]) {
    ok((HANDLED_EVENTS as readonly string[]).includes(name), `including ${name}`);
  }
});

test("a slow payment method settles through its own event", async () => {
  // Bank debits complete later. Without the async event a slow payment never
  // completes and the challenge sits pending for ever.
  const db = await resetDemoDb();
  const invoiceId = await aPaidCheckout(db);

  const outcome = await handleStripeEvent(
    db,
    event("evt_async", "checkout.session.async_payment_succeeded", invoiceId),
  );
  eq(outcome.kind, "paid", "an async success pays the bill exactly like a sync one");

  const after = await db.select().from(schema.challenges);
  eq(after[0].state, "scheduled", "and the challenge is scheduled");
});
