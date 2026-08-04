// Outbound email.
//
// The rule this layer is built around: **nothing may throw because mail is not
// configured.** Without `RESEND_API_KEY` every send no-ops, writes a `skipped`
// row to `email_log`, and returns — exactly the way `lib/blob.ts` degrades
// without its token. That is what makes it safe to build and ship this before
// the domain is verified and the key exists, which is the actual order these
// things happen in.
//
// Why it is worth building at all: every money event in this product currently
// depends on somebody opening Discord or happening to log in. A brand that was
// never told it owes $1,000 does not pay it.
//
// No dependency on the Resend SDK. It is one authenticated POST to one endpoint,
// and a package that exists to wrap `fetch` is a package that has to be kept in
// step with a build, audited, and upgraded. `fetch` is already here.

import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { renderEmail, type TemplateKey, type TemplateData } from "@/lib/email/templates";

const ENDPOINT = "https://api.resend.com/emails";

/** Is outbound mail switched on for this deployment? */
export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/**
 * Who mail comes from.
 *
 * A verified sending domain is the whole game: SPF, DKIM and DMARC decide
 * whether any of this arrives, and billing mail that lands in spam is worse than
 * no billing mail because you believe it was delivered. The address is an env
 * var so the domain can be changed without a deploy, and it falls back to
 * something obviously-wrong-on-purpose rather than something plausible — a
 * silently wrong From is a deliverability problem you find out about in a month.
 */
export function emailFrom(): string {
  return process.env.EMAIL_FROM || "Cluster <onboarding@resend.dev>";
}

/** Where a human should reply. Optional; unset means replies go to `From`. */
function replyTo(): string | undefined {
  return process.env.EMAIL_REPLY_TO || undefined;
}

export type SendResult = {
  ok: boolean;
  /** True when mail is off — not an error, and callers must not treat it as one. */
  skipped: boolean;
  id: string | null;
  logId: string;
};

/**
 * Send one templated message.
 *
 * Never throws. Every failure path — no key, bad key, network, a 4xx from
 * Resend, a template that will not render — ends in a logged row and a returned
 * result. A caller awaiting this is awaiting a record, not a risk.
 *
 * Awaited on purpose at every call site: a floating promise in a server action
 * is frozen the moment the request returns (see the trap list in §0 of the
 * plan), and an un-awaited send is a receipt nobody gets.
 */
export async function sendEmail<K extends TemplateKey>(opts: {
  to: string;
  template: K;
  data: TemplateData[K];
  /** What this is about, so the console can link back to it. */
  ref?: { type: string; id: string };
}): Promise<SendResult> {
  const to = (opts.to ?? "").trim();
  let subject = "";
  let html = "";
  let text = "";

  try {
    const rendered = renderEmail(opts.template, opts.data);
    subject = rendered.subject;
    html = rendered.html;
    text = rendered.text;
  } catch (e) {
    return log({ to, template: opts.template, subject: `(${opts.template})`, status: "failed", error: `template: ${String(e).slice(0, 300)}`, ref: opts.ref });
  }

  // A missing or obviously-not-an-address recipient is a bug upstream, and
  // Resend would reject it anyway. Recorded rather than thrown, because a
  // receipt failing to render must not take down the thing it is a receipt for.
  if (!to || !to.includes("@")) {
    return log({ to: to || "(none)", template: opts.template, subject, status: "failed", error: "no valid recipient", ref: opts.ref });
  }

  if (!emailConfigured()) {
    return log({
      to, template: opts.template, subject, status: "skipped",
      error: "RESEND_API_KEY is not set on this deployment — nothing was sent.",
      ref: opts.ref,
    });
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom(),
        to: [to],
        subject,
        html,
        text,
        ...(replyTo() ? { reply_to: replyTo() } : {}),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) {
      return log({ to, template: opts.template, subject, status: "failed", error: `${res.status} ${body.name ?? ""} ${body.message ?? ""}`.trim().slice(0, 300), ref: opts.ref });
    }
    return log({ to, template: opts.template, subject, status: "sent", providerId: body.id ?? null, ref: opts.ref });
  } catch (e) {
    return log({ to, template: opts.template, subject, status: "failed", error: String(e).slice(0, 300), ref: opts.ref });
  }
}

/**
 * Write the attempt down.
 *
 * Even this cannot throw. If the log insert fails — a database blip mid-send —
 * the caller still gets a result, because the alternative is that a failure to
 * record a receipt becomes a failure to do the thing the receipt was for.
 */
async function log(row: {
  to: string; template: string; subject: string;
  status: "queued" | "skipped" | "sent" | "failed";
  providerId?: string | null; error?: string;
  ref?: { type: string; id: string };
}): Promise<SendResult> {
  const logId = uid();
  try {
    const db = await getDb();
    await db.insert(schema.emailLog).values({
      id: logId,
      toAddress: row.to,
      template: row.template,
      subject: row.subject,
      providerId: row.providerId ?? null,
      status: row.status,
      error: row.error ?? null,
      refType: row.ref?.type ?? null,
      refId: row.ref?.id ?? null,
    });
  } catch { /* a lost log line must never become a lost email */ }
  return {
    ok: row.status === "sent",
    skipped: row.status === "skipped",
    id: row.providerId ?? null,
    logId,
  };
}

/**
 * Send to a gamer by user id, looking up their address and their name.
 *
 * A convenience with a rule in it: **it respects `emailNotifications`.** A
 * receipt for money is arguably transactional and exempt, but a product that
 * decides for itself which of a person's preferences are the important ones is
 * a product that ends up in a spam folder. Staff can still see everything that
 * was suppressed, in the console, as a `skipped` row.
 */
export async function emailUser<K extends TemplateKey>(
  db: Awaited<ReturnType<typeof getDb>>,
  userId: string,
  template: K,
  data: (displayName: string) => TemplateData[K],
  ref?: { type: string; id: string },
): Promise<SendResult | null> {
  try {
    const { eq } = await import("drizzle-orm");
    const [u] = await db.select({
      email: schema.users.email,
      displayName: schema.users.displayName,
      emailNotifications: schema.users.emailNotifications,
    }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!u?.email) return null;
    if (!u.emailNotifications) {
      return log({ to: u.email, template, subject: `(${template})`, status: "skipped", error: "this gamer has email notifications switched off", ref });
    }
    return await sendEmail({ to: u.email, template, data: data(u.displayName), ref });
  } catch {
    return null;
  }
}
