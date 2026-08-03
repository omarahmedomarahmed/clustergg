import { createHmac } from "node:crypto";
import { fail, providerError, providerFetch, type Counterparty, type PayoutAdapter, type PayoutRequest } from "@/lib/payments/types";

// Trolley — the server-owner payout rail.
//
// A server owner is a named counterparty we pay every month in whatever country
// they live in, which makes their payout a completely different problem from a
// gamer's trophy. Two things have to be true and neither is optional:
//
//   1. Their bank details are entered on TROLLEY'S page, not ours. That is what
//      the widget below is for — an iframe we embed in the portal, whose form
//      posts to Trolley. We receive an opaque recipient id and nothing else,
//      which is why there is no bank column anywhere in this schema.
//
//   2. Their tax form is Trolley's problem. Paying a hundred owners across
//      thirty countries means W-8BENs, and building that is a company we are
//      not starting.
//
// Trolley signs requests rather than using a bearer token: HMAC-SHA256 over
// timestamp, method, path and body. That means the secret never travels, and a
// captured request expires.
//
// NOTE FOR WHOEVER CONNECTS THIS: the widget URL signature format is the one
// piece here that must be confirmed against Trolley's current docs with real
// keys in hand — it is a query-string HMAC and they have revised the parameter
// set before. Everything else follows the documented v1 REST API. Until keys
// exist, `configured()` is false and none of this code runs.

const API = "https://api.trolley.com";
const WIDGET = "https://widget.trolley.com/v1/";

export function trolleyConfigured(): boolean {
  return !!(process.env.TROLLEY_ACCESS_KEY && process.env.TROLLEY_SECRET_KEY);
}

function sign(method: string, path: string, body: string): { headers: Record<string, string> } {
  const ts = Math.floor(Date.now() / 1000).toString();
  const message = `${ts}\n${method}\n${path}\n${body}\n`;
  const signature = createHmac("sha256", process.env.TROLLEY_SECRET_KEY ?? "").update(message).digest("hex");
  return {
    headers: {
      Authorization: `prsign ${process.env.TROLLEY_ACCESS_KEY}:${signature}`,
      "X-PR-Timestamp": ts,
      "Content-Type": "application/json",
    },
  };
}

async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<Response> {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const { headers } = sign(method, path, payload);
  return providerFetch(`${API}${path}`, { method, headers, body: payload || undefined });
}

/** Find or create the Trolley recipient for one of our counterparties. */
async function recipientFor(to: Counterparty): Promise<{ id: string } | { error: string }> {
  try {
    const res = await call("POST", "/v1/recipients", {
      type: "individual",
      // Our id, so the same owner is never created twice and a webhook can be
      // traced back to a guild without a lookup table.
      referenceId: to.ref,
      name: to.name,
      email: to.email || undefined,
      ...(to.country ? { address: { country: to.country } } : {}),
    });
    if (res.ok) {
      const json = await res.json() as { recipient?: { id?: string } };
      const id = json.recipient?.id;
      if (id) return { id };
      return { error: "Trolley created the recipient but returned no id." };
    }
    // Already there: fetch by our own reference rather than failing.
    const search = await call("GET", `/v1/recipients?search=${encodeURIComponent(to.ref)}`);
    if (search.ok) {
      const json = await search.json() as { recipients?: { id: string; referenceId?: string }[] };
      const found = (json.recipients ?? []).find((r) => r.referenceId === to.ref);
      if (found) return { id: found.id };
    }
    return { error: await providerError(res, "Trolley") };
  } catch (e) {
    return { error: `Could not reach Trolley: ${(e as Error).message}` };
  }
}

export const trolleyPayout: PayoutAdapter = {
  key: "trolley",
  label: "Trolley — hosted onboarding, 210 countries",
  configured: trolleyConfigured,

  async onboardingUrl(to: Counterparty) {
    if (!trolleyConfigured()) return fail("Trolley is not connected yet — add TROLLEY_ACCESS_KEY and TROLLEY_SECRET_KEY.");
    const rec = await recipientFor(to);
    if ("error" in rec) return fail(rec.error);

    // A signed, time-limited URL for the embedded widget. Everything sensitive
    // happens inside it and never touches this origin.
    const params = new URLSearchParams({
      ts: Math.floor(Date.now() / 1000).toString(),
      key: process.env.TROLLEY_ACCESS_KEY ?? "",
      email: to.email ?? "",
      refid: to.ref,
      locale: "en",
      hideEmail: "true",
      roinfo: "1",
    });
    const signature = createHmac("sha256", process.env.TROLLEY_SECRET_KEY ?? "")
      .update(params.toString()).digest("hex");
    params.set("sign", signature);

    return { ok: true as const, url: `${WIDGET}?${params.toString()}`, embeddable: true, recipientRef: rec.id };
  },

  async send(req: PayoutRequest) {
    if (!trolleyConfigured()) return fail("Trolley is not connected yet.");
    if (!(req.amount.amount > 0)) return fail("Nothing to send.");
    const rec = await recipientFor(req.to);
    if ("error" in rec) return fail(rec.error);

    try {
      // One payment, one batch. Batching several owners into one run is a
      // finance optimisation; paying the wrong owner because two rows shared a
      // batch is not recoverable. Keep them separate until volume argues.
      const batch = await call("POST", "/v1/batches", {
        sourceCurrency: req.amount.currency,
        description: req.memo,
        payments: [{
          recipient: { id: rec.id },
          sourceAmount: req.amount.amount.toFixed(2),
          memo: req.memo,
          externalId: req.payoutRef,
        }],
      });
      if (!batch.ok) return fail(await providerError(batch, "Trolley"));
      const json = await batch.json() as { batch?: { id?: string } };
      const batchId = json.batch?.id;
      if (!batchId) return fail("Trolley created the batch but returned no id — check the dashboard before retrying.");

      const start = await call("POST", `/v1/batches/${batchId}/start-processing`);
      if (!start.ok) {
        return fail(`${await providerError(start, "Trolley")} — the batch exists as ${batchId} and can be released from their dashboard.`);
      }
      return { ok: true as const, ref: batchId, link: null, settled: false };
    } catch (e) {
      return fail(`Could not reach Trolley: ${(e as Error).message}`);
    }
  },
};
