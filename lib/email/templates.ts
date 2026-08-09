// Every message the product sends, and the one layout they all wear.
//
// A content template returns a subject and a body; the layout wraps it. That is
// the whole system, and it is a system rather than a pile of strings so a design
// change is one file rather than fourteen call sites, and so no call site can
// hand-build HTML — which is how an email ends up with a raw `undefined` in it
// in front of a customer.
//
// **These are receipts, not marketing.** Plain, short, and they state the
// number. Somebody reads one of these in a notification shade to find out
// whether they have been paid.
//
// TWO RULES THAT ARE NOT STYLE PREFERENCES:
//
//   1. **No payment detail, ever.** Not an account number, not an IBAN, not a
//      card. See docs/PAYMENTS.md — we do not hold them, so we cannot leak them,
//      and an email is the easiest place in a product to leak one.
//   2. **No secret in a subject line.** A portal key or an access key in a
//      subject is a secret rendered in a notification preview, on a lock screen,
//      over somebody's shoulder. Keys go in the body, once, with the warning.

export type Money = { amount: number; currency?: string };

const money = (m: Money) => `${(m.currency ?? "USD") === "USD" ? "$" : ""}${m.amount.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(m.amount) ? 0 : 2, maximumFractionDigits: 2 })}${(m.currency ?? "USD") === "USD" ? "" : ` ${m.currency}`}`;

const site = () => process.env.NEXT_PUBLIC_SITE_URL || "https://clustergg.com";

/** Everything a template may be handed, keyed by template. */
export type TemplateData = {
  "invoice.issued": { brand: string; number: string; total: Money; dueOn: string; payUrl: string };
  "invoice.due": { brand: string; number: string; total: Money; dueOn: string; payUrl: string };
  "invoice.paid": { brand: string; number: string; total: Money; paidOn: string };
  "payout.released": { name: string; amount: Money; collectUrl: string };
  "payout.paid": { name: string; amount: Money; paidOn: string };
  "redeem.approved": { name: string; amount: Money };
  "redeem.ready": { name: string; amount: Money; collectUrl: string };
  "portal.key": { serverName: string; key: string; portalUrl: string };
  "portal.key.rotated": { serverName: string; key: string; portalUrl: string; reason: string };
  "brand.portal.key": { brand: string; key: string; portalUrl: string };
  "challenge.approved": { serverName: string; title: string; startsOn: string; url: string };
  "challenge.published": { name: string; title: string; game: string; endsOn: string; url: string };
  "challenge.ended": { name: string; title: string; placement: number | null; points: number; prize: Money | null; url: string };
  "challenge.welcome.drafted": { serverName: string; title: string; url: string };
  "offer.applied": { brand: string; offer: string; savedThisMonth: Money; url: string };
  "account.deleted": { name: string; balanceCp: number; balanceValue: Money };
  /**
   * A message an admin typed (B47).
   *
   * Deliberately a template like every other, so it goes through the same
   * layout, the same log and the same degradation. The body is PLAIN TEXT — the
   * composer accepts no HTML, because free-text HTML from a console is a
   * phishing vector wearing our brand.
   */
  "admin.message": { subject: string; body: string };
};

export type TemplateKey = keyof TemplateData;

type Built = { subject: string; heading: string; lines: string[]; cta?: { label: string; url: string }; footnote?: string };

// One builder per event. Deliberately dull: the subject says what happened and
// to what, because that is all a notification preview shows.
const TEMPLATES: { [K in TemplateKey]: (d: TemplateData[K]) => Built } = {
  "invoice.issued": (d) => ({
    subject: `Invoice ${d.number} — ${money(d.total)} due ${d.dueOn}`,
    heading: `Invoice ${d.number}`,
    lines: [`${d.brand} — ${money(d.total)}, due ${d.dueOn}.`, "Every line is itemised on the invoice."],
    cta: { label: "View and pay", url: d.payUrl },
  }),
  "invoice.due": (d) => ({
    subject: `Invoice ${d.number} is due ${d.dueOn} — ${money(d.total)}`,
    heading: `Invoice ${d.number} is due`,
    lines: [`${money(d.total)}, due ${d.dueOn}.`, "If it is already paid, ignore this."],
    cta: { label: "View and pay", url: d.payUrl },
  }),
  "invoice.paid": (d) => ({
    subject: `Payment received — invoice ${d.number}`,
    heading: "Payment received",
    lines: [`${money(d.total)} received on ${d.paidOn}. Invoice ${d.number} is settled.`, "Thank you."],
  }),
  "payout.released": (d) => ({
    subject: `Your payout is ready — ${money(d.amount)}`,
    heading: "Your payout is ready",
    lines: [`${money(d.amount)} is waiting to be collected.`,
      "You choose where it lands on our payout partner's own page. We never see your account details."],
    cta: { label: "Collect it", url: d.collectUrl },
  }),
  "payout.paid": (d) => ({
    subject: `Paid — ${money(d.amount)}`,
    heading: "Paid",
    lines: [`${money(d.amount)} was sent on ${d.paidOn}.`],
  }),
  "redeem.approved": (d) => ({
    subject: `Redemption approved — ${money(d.amount)}`,
    heading: "Redemption approved",
    lines: [`${money(d.amount)} approved. We will email you again the moment it is ready to collect.`],
  }),
  "redeem.ready": (d) => ({
    subject: `Ready to collect — ${money(d.amount)}`,
    heading: "Ready to collect",
    lines: [`${money(d.amount)} is waiting for you.`,
      "You choose how it reaches you on the provider's own page. We never hold your account details."],
    cta: { label: "Collect it", url: d.collectUrl },
  }),
  // The key is in the BODY, never the subject — a subject is rendered in a
  // notification preview and on a lock screen.
  "portal.key": (d) => ({
    subject: `Your Cluster server portal is ready — ${d.serverName}`,
    heading: `${d.serverName} is on Cluster`,
    lines: ["Your portal key is below. Anyone holding it can open your server's portal, so keep it to yourself.",
      `Key: ${d.key}`],
    cta: { label: "Open your portal", url: d.portalUrl },
    footnote: "If you did not install Cluster on this server, reply to this email and we will remove it.",
  }),
  // Same rule as the server key: in the BODY, never the subject.
  "brand.portal.key": (d) => ({
    subject: `Your Cluster brand portal is ready — ${d.brand}`,
    heading: `${d.brand} is on Cluster`,
    lines: [
      "Your portal key is below. Anyone holding it can open your brand's portal, so keep it to yourself.",
      `Key: ${d.key}`,
      "You can build a campaign straight away. Before anything of yours runs on the network a person here checks the account — we will come back to you within one business day.",
    ],
    cta: { label: "Open your portal", url: d.portalUrl },
    footnote: "If you did not sign up for Cluster, reply to this email and we will delete the account.",
  }),
  "portal.key.rotated": (d) => ({
    subject: `New portal key for ${d.serverName}`,
    heading: "Your portal key changed",
    lines: [d.reason, "The old key no longer works. The new one is below.", `Key: ${d.key}`],
    cta: { label: "Open your portal", url: d.portalUrl },
  }),
  "challenge.approved": (d) => ({
    subject: `Approved: ${d.title}`,
    heading: "Your challenge was approved",
    lines: [`${d.title} starts ${d.startsOn} in ${d.serverName}.`],
    cta: { label: "See the challenge", url: d.url },
  }),
  "challenge.published": (d) => ({
    subject: `${d.title} is live`,
    heading: `${d.title} is live`,
    lines: [`${d.game} — ends ${d.endsOn}. Your stats count automatically once you have joined.`],
    cta: { label: "Join it", url: d.url },
  }),
  "challenge.ended": (d) => ({
    subject: d.placement ? `You placed #${d.placement} in ${d.title}` : `${d.title} has ended`,
    heading: d.placement ? `#${d.placement} — ${d.title}` : `${d.title} has ended`,
    lines: [
      `${d.points.toLocaleString()} points.`,
      ...(d.prize ? [`You won ${money(d.prize)}. It lands in your trophy case and can be cashed out from there.`] : []),
    ],
    cta: { label: "See the final standings", url: d.url },
  }),
  "challenge.welcome.drafted": (d) => ({
    subject: `A challenge is drafted for ${d.serverName}`,
    heading: "Your first challenge is drafted",
    lines: [`${d.title} is ready to run in ${d.serverName}. Cluster is paying for this one.`],
    cta: { label: "Review it", url: d.url },
  }),
  "offer.applied": (d) => ({
    subject: `${d.offer} applied to your ${d.brand} account`,
    heading: d.offer,
    lines: [`Applied to ${d.brand}. It saves you ${money(d.savedThisMonth)} this month, shown as its own line on the invoice.`],
    cta: { label: "See your billing", url: d.url },
  }),
  "admin.message": (d) => ({
    subject: d.subject,
    heading: d.subject,
    // Split on blank lines so an admin can write paragraphs; each becomes its
    // own <p> and every one is escaped by the layout.
    lines: d.body.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean),
  }),
  "account.deleted": (d) => ({
    subject: "Your Cluster account has been deleted",
    heading: "Your account is gone",
    lines: [`${d.name}, your Cluster account and everything on it has been deleted.`,
      ...(d.balanceCp > 0 ? [`You had ${d.balanceCp.toLocaleString()} Cluster Points (${money(d.balanceValue)}) at the time. Deleting the account forfeits them.`] : []),
      "Nothing further is stored about you."],
  }),
};

/**
 * The one layout every message wears.
 *
 * Table-based and inline-styled, because that is what mail clients render.
 * Outlook does not do flexbox and Gmail strips a `<style>` block; this is not
 * 2010 nostalgia, it is the rendering target.
 */
function layout(b: Built): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = b.lines.map((l) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#1f2333">${esc(l)}</p>`).join("");
  const cta = b.cta
    ? `<p style="margin:22px 0 0"><a href="${b.cta.url}" style="display:inline-block;background:#5b3df5;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:999px">${esc(b.cta.label)}</a></p>`
    : "";
  const foot = b.footnote ? `<p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#6b7080">${esc(b.footnote)}</p>` : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f9">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f9;padding:28px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;padding:30px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<tr><td>
<p style="margin:0 0 20px;font-size:13px;font-weight:800;letter-spacing:2px;color:#5b3df5">CLUSTER</p>
<h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#12141f">${esc(b.heading)}</h1>
${body}${cta}${foot}
<p style="margin:26px 0 0;padding-top:16px;border-top:1px solid #e8e9f0;font-size:12px;color:#8a8fa3">
Cluster · <a href="${site()}" style="color:#5b3df5;text-decoration:none">clustergg.com</a>
</p>
</td></tr></table></td></tr></table></body></html>`;
}

/** The same message as plain text, for clients that will not render HTML. */
function plain(b: Built): string {
  return [b.heading, "", ...b.lines, ...(b.cta ? ["", `${b.cta.label}: ${b.cta.url}`] : []), ...(b.footnote ? ["", b.footnote] : []), "", `Cluster · ${site()}`].join("\n");
}

export function renderEmail<K extends TemplateKey>(key: K, data: TemplateData[K]): { subject: string; html: string; text: string } {
  const build = TEMPLATES[key];
  if (!build) throw new Error(`unknown email template "${key}"`);
  const b = build(data as never);
  // A template that produced an unfilled slot is a bug that reaches a customer
  // as the literal word "undefined", so it is caught here rather than sent.
  const all = [b.subject, b.heading, ...b.lines, b.cta?.label ?? "", b.footnote ?? ""].join(" ");
  if (/\bundefined\b|\bnull\b|\bNaN\b/.test(all)) throw new Error(`template "${key}" rendered an unfilled value`);
  return { subject: b.subject, html: layout(b), text: plain(b) };
}

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];
