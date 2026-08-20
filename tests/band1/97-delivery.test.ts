// Delivery — email and DM. `docs/15-DELIVERY.md` L1–L11.
//
// ===== THE LAUNCH BLOCKER, AND WHY EVERY BAND WAS GREEN OVER IT =====
//
// `beginEmailVerification` minted a six-digit code, hashed it into a row, and
// **returned it**. Both call sites handed it to `isDemoMode ? { code } : {}`,
// so in production the code existed for the length of one function call and
// reached nobody. The page said *"sent"*.
//
// Downstream of that: `users.emailVerifiedAt` could never be written, so
// `checkEligibility` refused **every money trophy on the platform** with
// `email_unverified`. The money path was broken end to end and nothing on
// either band could see it, because every test that needed a verified gamer
// called `beginEmailVerification` and read its return value — which is exactly
// what production could not do.
//
// So the first test here is the one that would have caught it, and it is
// deliberately written the way production works rather than the way a test
// finds convenient: drive the **action**, and ask the transport what it was
// handed.
//
// ===== L5 IS THE ONE THAT MATTERS, AND IT IS THE NEGATIVE HALF =====
//
// *"Nothing that moves money waits on an email."* A guard that only proves
// emails are sent is a guard that would pass on an implementation where the
// send sits inside the redemption transaction — and that implementation loses
// an approval every time Resend times out. So the last test breaks the sender
// and asserts the money moves anyway.

import { ok, eq, no } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema, type DB } from "../../lib/db/index.ts";
import { TRANSPORT, sendEmail, type Email, type SendResult } from "../../lib/delivery/send.ts";
import { sendVerificationCode } from "../../lib/delivery/emails.ts";
import { notifyRedemptionProgress } from "../../lib/delivery/notify.ts";
import { confirmEmailVerification } from "../../lib/identity/verify.ts";
import { createGamer, setAgeBand, setCountry } from "../../lib/identity/gamers.ts";
import { createTrophy, awardTrophy } from "../../lib/trophies/trophies.ts";
import {
  requestRedemption,
  approveRedemption,
  checkEligibility,
} from "../../lib/trophies/redemption.ts";
import { createInvoice, markPaid } from "../../lib/money/invoices.ts";
import { eq as sqlEq } from "drizzle-orm";

/** Everything the transport was handed, so a test can read the code itself. */
function collector(): { sent: Email[]; transport: (e: Email) => Promise<SendResult> } {
  const sent: Email[] = [];
  return {
    sent,
    transport: async (e: Email) => {
      sent.push(e);
      return { status: "sent", error: null };
    },
  };
}

async function anAdultWithATrophy(db: DB, email: string | null): Promise<{
  userId: string;
  userTrophyId: string;
}> {
  const userId = await createGamer(db, { displayName: "Holder" });
  await setAgeBand(db, userId, "adult");
  await setCountry(db, userId, "GB");
  if (email) {
    await db
      .update(schema.users)
      .set({ email, emailVerifiedAt: new Date() })
      .where(sqlEq(schema.users.id, userId));
  }
  const trophyId = await createTrophy(db, { type: "podium", name: "First", valueCents: 10_000 });
  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    lines: [{ description: "c", amountCents: 20_000 }],
  });
  await markPaid(db, invoiceId);
  await awardTrophy(db, { trophyId, userId });
  const [holding] = await db
    .select({ id: schema.userTrophies.id })
    .from(schema.userTrophies)
    .where(sqlEq(schema.userTrophies.userId, userId));
  return { userId, userTrophyId: holding.id };
}

// ── L1 · the code reaches the sender ────────────────────────────────────────

test("the verification code reaches the sender, and the code that arrives is the code that works", async () => {
  const db = await resetDemoDb();
  const userId = await createGamer(db, { displayName: "Gamer" });
  const key = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "test-key";
  const { sent, transport } = collector();
  const previous = TRANSPORT.email;
  TRANSPORT.email = transport;

  try {
    const { beginEmailVerification } = await import("../../lib/identity/verify.ts");
    const code = await beginEmailVerification(db, userId, "gamer@example.test");
    await sendVerificationCode({ to: "gamer@example.test", code, userId });

    eq(sent.length, 1, "one email left, for one code");
    eq(sent[0].to, "gamer@example.test", "to the address they typed");
    eq(sent[0].kind, "verification", "recorded as what it is");

    // ===== THE ASSERTION THAT COULD NOT HAVE PASSED BEFORE =====
    //
    // Not "an email was sent" — **the code in the body is the code that
    // verifies**. A sender wired to the wrong variable, or to a freshly minted
    // second code, would pass every other assertion in this test and leave the
    // money path exactly as broken as it was.
    const inBody = /\b(\d{6})\b/.exec(sent[0].body)?.[1];
    ok(inBody !== undefined, "the body carries a six-digit code");
    const result = await confirmEmailVerification(db, userId, inBody!);
    ok(result.ok, "and typing that code verifies the address");
    eq(result.ok ? result.email : "", "gamer@example.test", "the one it was sent to");
  } finally {
    TRANSPORT.email = previous;
    if (key === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = key;
  }
});

// ── L2 · a missing key records and does not throw ───────────────────────────

test("an absent RESEND_API_KEY records the message as undelivered and does not throw", async () => {
  // L2 — *"a missing key is a misconfiguration, not an outage."* The tempting
  // implementation throws, and on a background path that is an unhandled
  // rejection nobody sees; on a request path it is a 500 for an operation that
  // otherwise worked.
  const db = await resetDemoDb();
  const key = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  let threw = false;
  let result: SendResult | null = null;

  try {
    result = await sendEmail({
      to: "nobody@example.test",
      kind: "verification",
      subject: "Your code",
      body: "123456",
    });
  } catch {
    threw = true;
  } finally {
    if (key !== undefined) process.env.RESEND_API_KEY = key;
  }

  no(threw, "nothing was thrown");
  eq(result?.status, "undelivered", "and the answer says it never left");
  ok(
    /RESEND_API_KEY/.test(result?.error ?? ""),
    "naming the variable, because that is the whole fix",
  );

  // L3 — *"an operator asked 'did they get the code?' needs an answer that is
  // not a guess."*
  const rows = await db.select().from(schema.deliveries);
  eq(rows.length, 1, "the attempt is recorded");
  eq(rows[0].recipient, "nobody@example.test", "to whom");
  eq(rows[0].kind, "verification", "which kind");
  eq(rows[0].status, "undelivered", "and whether it left");
  ok(rows[0].attemptedAt instanceof Date, "and when");

  // House rule 5, one level up from the schema: no body is ever stored. A
  // table of every secret we ever sent is worth more than the accounts it
  // opens, and a verification code, a reset token and a brand's one-time key
  // all pass through this function.
  const stored = JSON.stringify(rows[0]);
  no(stored.includes("123456"), "and the code itself is nowhere in the row");
});

test("a provider that refuses is recorded as failed, with what it said", async () => {
  // L4 — *"a failed send is a recorded state a human can see, never an
  // exception swallowed on a background path."* `undelivered` and `failed` are
  // different words on purpose: one is a misconfiguration somebody can fix and
  // the other is a provider saying no.
  const db = await resetDemoDb();
  const key = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "test-key";
  const previous = TRANSPORT.email;
  TRANSPORT.email = async () => ({ status: "failed", error: "422 domain not verified" });

  try {
    const result = await sendEmail({
      to: "someone@example.test",
      kind: "brand_invite",
      subject: "Your dashboard",
      body: "key",
    });
    eq(result.status, "failed", "the answer says it did not leave");
    const [row] = await db.select().from(schema.deliveries);
    eq(row.status, "failed", "recorded as failed, not as undelivered");
    ok(/domain not verified/.test(row.error ?? ""), "carrying what the provider actually said");
  } finally {
    TRANSPORT.email = previous;
    if (key === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = key;
  }
});

test("a transport that throws is a recorded failure, not an exception", async () => {
  const db = await resetDemoDb();
  const key = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "test-key";
  const previous = TRANSPORT.email;
  TRANSPORT.email = async () => {
    throw new Error("socket hang up");
  };

  let threw = false;
  try {
    const result = await sendEmail({
      to: "someone@example.test",
      kind: "password_reset",
      subject: "Reset",
      body: "link",
    });
    eq(result.status, "failed", "the answer says so");
  } catch {
    threw = true;
  } finally {
    TRANSPORT.email = previous;
    if (key === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = key;
  }

  no(threw, "sendEmail cannot throw — that is what lets it sit downstream of money");
  const [row] = await db.select().from(schema.deliveries);
  ok(/socket hang up/.test(row.error ?? ""), "and the reason survives into the record");
});

// ── L5 · the negative half, and the one that matters ────────────────────────

test("break the sender and the money still moves", async () => {
  // ===== THE HALF A "DID IT SEND?" GUARD CANNOT SEE =====
  //
  // L5 — *"nothing that moves money waits on an email. A payout, a trophy, a
  // placement is never blocked by a send failing. The email is the notice, not
  // the mechanism."*
  //
  // The tempting implementation puts the send inside `approveRedemption`, and
  // it passes every other test in this file. It also loses an approval every
  // time Resend times out, because the send is then part of the transaction
  // that wrote it. So: a transport that throws on every call, and the money
  // asserted afterwards.
  const db = await resetDemoDb();
  const key = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "test-key";
  const previous = TRANSPORT.email;
  TRANSPORT.email = async () => {
    throw new Error("the email provider is down");
  };

  try {
    const { userId, userTrophyId } = await anAdultWithATrophy(db, "holder@example.test");

    // The trophy exists and is redeemable — the first thing a broken sender
    // must not have prevented.
    const eligible = await checkEligibility(db, userTrophyId, userId);
    ok(eligible.ok, "the trophy is redeemable with the sender broken");

    const redemptionId = await requestRedemption(db, {
      userTrophyId,
      userId,
      method: "bank",
      providerHandle: "opaque-handle",
    });
    ok(redemptionId.length > 0, "and the redemption is requested");

    await approveRedemption(db, redemptionId, "admin-1");
    await notifyRedemptionProgress(db, redemptionId, "approved");

    const [row] = await db
      .select()
      .from(schema.redemptions)
      .where(sqlEq(schema.redemptions.id, redemptionId));
    eq(row.status, "approved", "and the approval stands, with the sender throwing on every call");
    ok(row.approvedAt !== null, "stamped, so nothing rolled back");

    // And L4 in the same breath: the failure is not silent, it is a row.
    const [delivery] = await db
      .select()
      .from(schema.deliveries)
      .where(sqlEq(schema.deliveries.kind, "redemption_progress"));
    eq(delivery.status, "failed", "the notice that could not be sent is recorded as failed");
    ok(/provider is down/.test(delivery.error ?? ""), "with the reason");
  } finally {
    TRANSPORT.email = previous;
    if (key === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = key;
  }
});

test("the money modules do not import the sender at all", async () => {
  // ===== L5 AS A STRUCTURAL FACT, NOT A HABIT =====
  //
  // The test above proves the current wiring survives a broken sender. This
  // proves the next person cannot quietly change that: if
  // `lib/trophies/redemption.ts` imported the delivery modules, a send inside
  // the transaction would be one line away and nothing would flag it.
  //
  // Read from source rather than asserted about behaviour, because the property
  // is "there is no edge", and an edge that exists but is not currently taken
  // is exactly the shape that gets taken later.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const repoRoot = path.join(import.meta.dirname, "..", "..");

  const MONEY = [
    "lib/trophies/redemption.ts",
    "lib/trophies/settle.ts",
    "lib/money/payouts.ts",
    "lib/money/ledger.ts",
    "lib/money/pool.ts",
    "lib/pool/score.ts",
  ];
  const offenders: string[] = [];
  for (const rel of MONEY) {
    const src = await fs.readFile(path.join(repoRoot, rel), "utf8");
    if (/from\s+["'][^"']*delivery\/(send|emails|notify|dm)\.ts["']/.test(src)) {
      offenders.push(rel);
    }
    if (/import\s*\(\s*["'][^"']*delivery\/(send|emails|notify|dm)\.ts["']\s*\)/.test(src)) {
      offenders.push(rel);
    }
  }
  eq(
    offenders,
    [],
    "a module that moves money must not be able to reach the sender — the notice " +
      "is downstream of the money, and an import is the first half of not being",
  );

  // The canary: the check reads real files with real imports in them, so an
  // empty answer means "no edges", not "nothing was read".
  const known = await fs.readFile(path.join(repoRoot, "lib/trophies/redemption.ts"), "utf8");
  ok(/from\s+["']\.\.\/money\/amounts\.ts["']/.test(known), "the read found real imports to reject");
});

test("every door that mints a secret also sends it", async () => {
  // ===== WHAT L14 CANNOT SEE, AND WHY THIS EXISTS BESIDE IT =====
  //
  // `94-export-reach`'s L14 assertion fires when a return value is unused at
  // **every** call site. That is the right rule and it caught the original
  // defect, when both doors dropped the code. It cannot catch the regression:
  // remove the send from `/redeem` alone and the signup door still consumes
  // the value, so L14 stays green while the money path is broken again for
  // every Discord gamer.
  //
  // Proven by doing exactly that — deleting the `sendVerificationCode` call
  // from `app/redeem/actions.ts` — and watching L14 not move.
  //
  // So: a file that mints a secret must also send it. Source-level, because
  // the thing being asserted is *"this door is wired"*, and a server action
  // cannot be driven from band 1 — it needs a request, a session and a cookie
  // jar. Band 2 walks the flow with a real browser; this stops the wire being
  // cut between those runs.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { walkSource, withoutComments } = await import("../helpers/source.ts");
  const repoRoot = path.join(import.meta.dirname, "..", "..");

  /** What each mint owes, and the sender that discharges it. */
  const MINTS = [
    { mint: "beginEmailVerification", sender: "sendVerificationCode" },
    { mint: "beginReset", sender: "sendPasswordReset" },
    { mint: "issueBrandInvite", sender: "sendBrandInvite" },
  ];

  const files: { rel: string; src: string }[] = [];
  for (const dir of ["app", "lib"]) {
    for (const abs of await walkSource(path.join(repoRoot, dir))) {
      files.push({
        rel: path.relative(repoRoot, abs),
        // Comments stripped: this file's own reasoning names both halves, and
        // `lib/delivery/*` explains the defect in prose. A guard that counted
        // an explanation as a wire would be satisfied by a comment.
        src: withoutComments(await fs.readFile(abs, "utf8")),
      });
    }
  }

  const unsent: string[] = [];
  for (const { mint, sender } of MINTS) {
    // The declaring module is not a door — it is where the value comes from.
    const callers = files.filter(
      (f) =>
        new RegExp(`\\b${mint}\\s*\\(`).test(f.src) &&
        !new RegExp(`export\\s+(?:async\\s+)?function\\s+${mint}\\b`).test(f.src),
    );
    for (const c of callers) {
      if (!new RegExp(`\\b${sender}\\s*\\(`).test(c.src)) {
        unsent.push(`${c.rel} calls ${mint} and never calls ${sender}`);
      }
    }
  }

  eq(
    unsent.sort(),
    [],
    "a door that mints a code and does not send it is the launch blocker, one " +
      "door at a time — the page says sent and nobody receives anything",
  );

  // The canary. An empty answer must mean "every door sends", not "no door was
  // found": if the mint names ever change, this reads zero callers and passes
  // over everything.
  const found = files.filter((f) =>
    MINTS.some(
      (m) =>
        new RegExp(`\\b${m.mint}\\s*\\(`).test(f.src) &&
        !new RegExp(`export\\s+(?:async\\s+)?function\\s+${m.mint}\\b`).test(f.src),
    ),
  );
  ok(found.length >= 3, `the walk found ${found.length} doors that mint a secret`);
  ok(
    found.some((f) => f.rel === "app/redeem/actions.ts"),
    "including /redeem, the one whose absence broke every payout on the platform",
  );
});

// ── L6–L11 · the DM half ────────────────────────────────────────────────────

test("a DM goes through the post queue, never inline, and carries what it is", async () => {
  // L11 — *"DMs are sent through the post queue, never inline. A per-guild loop
  // inside a request is in 10-SETUP §8's outage table already."* The week close
  // would run one Discord round trip per server inside a cron; the install DM
  // would run one inside an OAuth redirect.
  const db = await resetDemoDb();
  await db.insert(schema.guilds).values({
    guildId: "g-dm",
    name: "DM Server",
    slug: "dm-server",
    memberCount: 100,
    ownerDiscordId: "owner-1",
  });

  const { dmGuildInstalled, dmOwnerEarnings } = await import("../../lib/delivery/dm.ts");
  ok(await dmGuildInstalled(db, { guildId: "g-dm", discordId: "owner-1" }), "install DM queued");
  ok(
    await dmOwnerEarnings(db, {
      guildId: "g-dm",
      weekStart: new Date("2026-09-07T00:00:00Z"),
      amountCents: 12_345,
    }),
    "earnings DM queued",
  );

  const rows = await db.select().from(schema.discordPostQueue);
  eq(rows.length, 2, "two rows, and no Discord call was made to write them");
  ok(
    rows.every((r) => r.dmUserId === "owner-1" && r.channelId === null),
    "addressed to a person rather than a channel",
  );
  ok(
    rows.every((r) => r.status === "pending"),
    "pending — the cron delivers them, with the same backoff an announcement gets",
  );
  eq(
    rows.map((r) => r.ledgerKind).sort(),
    ["guild_installed", "owner_earnings"],
    "each carrying what it is, so the drain can record the outcome without guessing",
  );

  // House rule 2 — the figure in the body comes from the money module, and the
  // one thing this card must never do is round it into something friendlier.
  const earnings = rows.find((r) => r.ledgerKind === "owner_earnings")!;
  ok(
    /\$123\.45/.test(String((earnings.payload as { content?: string }).content ?? "")),
    "and the amount is formatted by formatMoney, not retyped",
  );
});

test("a DM Discord refuses is a recorded state the registry shows, with when", async () => {
  // L10 — *"an owner who blocks DMs from server members never receives it and
  // Discord says so quietly. A failed DM is a recorded state the guild registry
  // shows, with when it was tried — never a swallowed error."*
  //
  // 50007 is the real code for it, and it is the reason `dmUser` reports a
  // status rather than the boolean it used to: an operator told "the DM failed"
  // cannot tell a setting the owner chose from us being rate-limited.
  const db = await resetDemoDb();
  await db.insert(schema.guilds).values({
    guildId: "g-blocked",
    name: "Blocked Server",
    slug: "blocked-server",
    memberCount: 100,
    ownerDiscordId: "owner-blocked",
    installedAt: new Date("2026-08-01T00:00:00Z"),
  });

  const { dmReassignmentWarning } = await import("../../lib/delivery/dm.ts");
  await dmReassignmentWarning(db, { guildId: "g-blocked" });

  // Delivered the way the cron delivers it, with Discord refusing the way it
  // does. 50007 is the real code for "this person does not take DMs from
  // members of this server", and it arrives as a 403 on the call that opens
  // the channel — before any message exists to fail.
  const { drainPostQueue, DM_TRANSPORT } = await import("../../lib/discord/post-queue.ts");
  const realDm = DM_TRANSPORT.send;
  DM_TRANSPORT.send = async () => ({
    ok: false as const,
    status: 403,
    error: "50007 Cannot send messages to this user",
  });
  try {
    await drainPostQueue();
  } finally {
    DM_TRANSPORT.send = realDm;
  }

  const { guildRegistry } = await import("../../lib/admin/registry.ts");
  const registry = await guildRegistry(db, "g-blocked");
  eq(registry?.ownership.dmState, "failed", "the registry shows the state");
  ok(registry?.ownership.lastDmAt instanceof Date, "and when it was tried");
  eq(registry?.ownership.dms[0].kind, "reassignment_warning", "and which message it was");
  ok(
    /50007/.test(registry?.ownership.dms[0].error ?? ""),
    "and what Discord actually said, so an operator can tell a block from a rate limit",
  );
});

test("a guild whose owner was never successfully told cannot be reassigned", async () => {
  // ===== L9, AND THE SENTENCE THAT MAKES IT A REFUSAL =====
  //
  // *"Reassigning somebody who was never told is indistinguishable from taking
  // their money."* Both of the conditions that existed before this — four weeks
  // elapsed, and the claimant holding ADMINISTRATOR right now — are met here,
  // and it is still refused.
  const db = await resetDemoDb();
  const installedAt = new Date("2026-07-01T00:00:00Z");
  const later = new Date("2026-08-15T00:00:00Z");
  await db.insert(schema.guilds).values({
    guildId: "g-quiet",
    name: "Quiet",
    slug: "quiet",
    memberCount: 10,
    installedAt,
  });

  const { reassignOwner, RegistryRefused } = await import("../../lib/admin/registry.ts");
  const attempt = () =>
    reassignOwner(
      db,
      {
        guildId: "g-quiet",
        actorId: "admin-1",
        newOwnerDiscordId: "claimant",
        claimantHoldsAdministrator: true,
        reason: "never appeared",
      },
      later,
    );

  let refusal: unknown;
  try {
    await attempt();
  } catch (e) {
    refusal = e;
  }
  ok(refusal instanceof RegistryRefused, "it is refused");
  ok(
    /has not been warned yet/.test((refusal as Error).message),
    "and the refusal says what to do about it, rather than only saying no",
  );

  // And a warning Discord refused is not a warning either.
  const { recordOwnerDm } = await import("../../lib/admin/registry.ts");
  await recordOwnerDm(db, { guildId: "g-quiet", state: "failed" });
  refusal = undefined;
  try {
    await attempt();
  } catch (e) {
    refusal = e;
  }
  ok(
    /Discord refused to deliver it/.test((refusal as Error).message),
    "a failed DM leaves them un-reassignable, which is the intended answer",
  );

  // Delivered, and only then.
  await recordOwnerDm(db, { guildId: "g-quiet", state: "sent" });
  await attempt();
  const [after] = await db
    .select({ owner: schema.guilds.ownerDiscordId })
    .from(schema.guilds)
    .where(sqlEq(schema.guilds.guildId, "g-quiet"));
  eq(after.owner, "claimant", "once they were actually told, it goes through");
});
