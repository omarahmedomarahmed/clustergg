/**
 * A brand paying makes money move, without a human. M1.
 *
 * ===== THE HOLE THIS COVERS =====
 *
 * There was no payment webhook. A brand paid a Stripe invoice and nothing
 * happened until staff clicked "Mark paid" — and since a challenge cannot be
 * announced before its bill is paid, an unnoticed payment silently withheld the
 * thing the brand had bought from every server on the network.
 *
 * ===== WHY THE SECURITY CASES ARE THE POINT =====
 *
 * This endpoint posts money into the vaults. An unsigned or replayable request
 * that reaches `settleInvoicePaid` lets anybody mark any invoice paid. So the
 * refusals are tested harder than the happy path: no secret, no signature,
 * wrong signature, and a signature that was valid an hour ago.
 *
 *   DEMO_DB=1 npx tsx tests/db/payment-webhook.mts
 */
process.env.DEMO_DB = "1";

import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

const SECRET = "whsec_test_secret_for_this_suite";
process.env.STRIPE_WEBHOOK_SECRET = SECRET;

const { POST } = await import("../../app/api/payments/webhook/route.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { settleInvoicePaid } = await import("../../lib/billing-settle.ts");
const { balances } = await import("../../lib/vaults.ts");
const { uid } = await import("../../lib/utils.ts");
const { eq } = await import("drizzle-orm");

const db = await getDb();

/** Build a request Stripe would actually send. */
function signed(body: unknown, opts: { secret?: string; at?: number } = {}) {
  const raw = JSON.stringify(body);
  const t = Math.floor((opts.at ?? Date.now()) / 1000);
  const sig = createHmac("sha256", opts.secret ?? SECRET).update(`${t}.${raw}`).digest("hex");
  return new Request("https://x/api/payments/webhook", {
    method: "POST",
    headers: { "stripe-signature": `t=${t},v1=${sig}` },
    body: raw,
  });
}

/** A real invoice with one line, so a total exists to allocate. */
async function makeInvoice(total: number) {
  const [brand] = await db.select({ id: schema.brands.id }).from(schema.brands).limit(1);
  const id = uid();
  const number = `CGG-T${Math.floor(Math.random() * 9000 + 1000)}`;
  await db.insert(schema.brandInvoices).values({
    id, brandId: brand.id, number, status: "sent",
    currency: "USD", payRef: `in_test_${id}`,
  });
  await db.insert(schema.invoiceLines).values({
    id: uid(), invoiceId: id, label: "Sponsored challenges", quantity: 1, unitAmount: total,
  });
  return { id, number };
}

console.log("== it refuses everything it should ==");
{
  const inv = await makeInvoice(350);
  const event = { id: "evt_1", type: "invoice.paid", data: { object: { id: inv.id, metadata: { invoiceRef: inv.id } } } };

  // No signature at all.
  const bare = new Request("https://x/api/payments/webhook", {
    method: "POST", body: JSON.stringify(event),
  });
  ok("an unsigned request is refused", (await POST(bare as never)).status === 400);

  // Signed with the wrong secret — somebody who has the body but not the key.
  const wrong = signed(event, { secret: "whsec_not_ours" });
  ok("a wrongly signed request is refused", (await POST(wrong as never)).status === 400);

  // A signature that WAS valid, an hour ago. Without a replay window a single
  // captured request is valid forever.
  const old = signed(event, { at: Date.now() - 3600_000 });
  ok("a replayed old signature is refused", (await POST(old as never)).status === 400);

  // And nothing above touched the invoice.
  const [after] = await db.select({ status: schema.brandInvoices.status })
    .from(schema.brandInvoices).where(eq(schema.brandInvoices.id, inv.id)).limit(1);
  ok("…and none of them marked it paid", after.status === "sent", after.status);
}

console.log("\n== an unset secret refuses rather than opens ==");
{
  const saved = process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  const req = new Request("https://x/api/payments/webhook", { method: "POST", body: "{}" });
  const res = await POST(req as never);
  // 503, not 200. Accepting everything when unconfigured is a hole that opens
  // itself on the deployment where somebody forgot a variable.
  ok("no secret configured means no writes", res.status === 503, String(res.status));
  process.env.STRIPE_WEBHOOK_SECRET = saved;
}

console.log("\n== a real payment moves the money ==");
{
  const inv = await makeInvoice(350);
  const before = await balances(db);

  const res = await POST(signed({
    id: "evt_paid", type: "invoice.paid",
    data: { object: { id: `in_test_${inv.id}`, metadata: { invoiceRef: inv.id } } },
  }) as never);
  const body = await res.json() as { ok: boolean; changed?: boolean; matched?: boolean };

  ok("the webhook accepts it", res.status === 200 && body.ok, JSON.stringify(body));
  ok("…and says it matched an invoice", body.matched === true);
  ok("…and that something changed", body.changed === true);

  const [after] = await db.select({ status: schema.brandInvoices.status, paidVia: schema.brandInvoices.paidVia })
    .from(schema.brandInvoices).where(eq(schema.brandInvoices.id, inv.id)).limit(1);
  ok("the invoice is paid", after.status === "paid", after.status);
  ok("…recorded as settled by stripe", after.paidVia === "stripe", String(after.paidVia));

  // THE ASSERTION THE WHOLE FEATURE EXISTS FOR. Marking a row paid is
  // bookkeeping; posting the four vaults is the money actually moving.
  const now = await balances(db);
  const moved = (now.prize - before.prize) + (now.server - before.server)
    + (now.cp - before.cp) + (now.cluster - before.cluster);
  ok("the four vaults were posted", Math.abs(moved - 350) < 0.01, `moved ${moved}`);
  ok("…and the players' half is the largest share",
    now.prize - before.prize >= now.cluster - before.cluster);
}

console.log("\n== twice is the same as once ==");
{
  // Stripe retries until it gets a 2xx and will re-deliver on its own. A second
  // delivery must not re-post the vaults or re-send a receipt.
  const inv = await makeInvoice(350);
  const event = {
    id: "evt_dupe", type: "invoice.paid",
    data: { object: { id: `in_test_${inv.id}`, metadata: { invoiceRef: inv.id } } },
  };

  await POST(signed(event) as never);
  const mid = await balances(db);
  const second = await POST(signed(event) as never);
  const body = await second.json() as { ok: boolean; changed?: boolean };
  const end = await balances(db);

  ok("the second delivery is accepted", second.status === 200 && body.ok);
  ok("…but reports nothing changed", body.changed === false, JSON.stringify(body));
  ok("…and posts no second allocation",
    Math.abs((end.prize + end.server + end.cp + end.cluster)
      - (mid.prize + mid.server + mid.cp + mid.cluster)) < 0.001);
}

console.log("\n== events we do not model are acknowledged, not rejected ==");
{
  // A 4xx makes Stripe retry forever and eventually disable the endpoint —
  // taking the events we DO want down with it.
  const res = await POST(signed({ id: "evt_x", type: "customer.created", data: { object: { id: "cus_1" } } }) as never);
  ok("an unmodelled event returns 200", res.status === 200, String(res.status));
  const res2 = await POST(signed({ id: "evt_y", type: "invoice.paid", data: { object: { id: "in_not_ours" } } }) as never);
  const b2 = await res2.json() as { matched?: boolean };
  ok("an invoice we do not have returns 200", res2.status === 200);
  ok("…and says it matched nothing", b2.matched === false);
}

console.log("\n== the button and the webhook cannot drift ==");
{
  // Both must go through the same function. Two copies of "what happens when a
  // brand pays" is two copies that disagree the first time one is edited.
  const action = read("app/actions/billing.ts");
  const route = read("app/api/payments/webhook/route.ts");
  ok("the admin button settles through the shared path", /settleInvoicePaid\(/.test(action));
  ok("…and so does the webhook", /settleInvoicePaid\(/.test(route));
  ok("…and the button no longer allocates on its own",
    !/allocatePaidInvoice\(db, invoiceId\);[\s\S]{0,80}markInvoicePaid/.test(action));

  // The raw body must be read as text. `req.json()` re-serialises, and the
  // re-serialised bytes are not what Stripe signed.
  ok("the route verifies the RAW body", /await req\.text\(\)/.test(route),
    "req.json() re-serialises and every genuine signature then fails");
  ok("…and has a replay window", /300/.test(route));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log(fails.map((f) => `  ✗ ${f}`).join("\n")); process.exit(1); }
