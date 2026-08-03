import { notFound } from "next/navigation";
import Link from "next/link";
import { invoiceByToken } from "@/lib/invoices";
import InvoiceView, { InvoiceStatus, DueLine, PayBlock } from "@/components/InvoiceView";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";

// The page a brand's finance department opens.
//
// Reached by an unguessable token, not by an invoice id — a URL that appears in
// admin screenshots and browser history is not one that should open somebody
// else's bill. The token is rotatable from the admin console for the day a pay
// link goes to the wrong inbox.
//
// It renders the document and one button. If the payment provider allows
// framing, the checkout appears inline; if it doesn't — and most hosted
// checkouts send X-Frame-Options: DENY — the button opens their page in a new
// tab. Either way, everything to do with a card or a bank account happens on
// the provider's origin. There is no field on this page that could collect one,
// which is the property that makes it safe to send to a stranger.

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await invoiceByToken(token);
  return {
    title: inv ? `Invoice ${inv.number} · ${inv.brandName}` : "Invoice",
    // A bill is not something to index.
    robots: { index: false, follow: false },
  };
}

export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await invoiceByToken(token);
  if (!invoice) notFound();
  // A draft is a working document. Nobody outside should see one, and least of
  // all should they be able to pay it.
  if (invoice.status === "draft") notFound();

  const issued = invoice.issuedAt?.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 text-sm font-bold">
          <Icon name="spark" size={16} className="text-cyan-300" /> Cluster
        </Link>
        <span className="text-xs text-muted">Invoice {invoice.number}</span>
      </div>

      <div className="glass overflow-hidden">
        <div className="border-b border-white/10 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">Invoice {invoice.number}</h1>
                <InvoiceStatus invoice={invoice} />
              </div>
              <p className="mt-1 text-sm text-muted">
                Billed to <b className="text-ink">{invoice.brandName}</b>
                {invoice.periodLabel ? ` · ${invoice.periodLabel}` : ""}
              </p>
            </div>
            <div className="text-right text-xs text-muted">
              {issued && <div>Issued {issued}</div>}
              <div className="mt-0.5"><DueLine invoice={invoice} /></div>
            </div>
          </div>
        </div>

        <div className="p-6">
          <InvoiceView invoice={invoice} />
        </div>

        <div className="border-t border-white/10 p-6">
          <PayBlock invoice={invoice} />

          {/* Inline where the provider permits it; a new tab where it doesn't.
              Trying to iframe a checkout that refuses to be framed produces a
              blank box and a brand who thinks the payment page is broken, so
              the flag is set by the adapter that minted the link rather than
              guessed here. */}
          {invoice.status === "sent" && invoice.payLinkUrl && invoice.payEmbeddable && (
            <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
              <iframe
                src={invoice.payLinkUrl}
                title={`Pay invoice ${invoice.number}`}
                className="h-[640px] w-full bg-white"
                allow="payment"
              />
            </div>
          )}
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        Questions about this invoice? Reply on your brand portal&apos;s message thread, or email{" "}
        <a href="mailto:partners@clustergg.com" className="text-cyan-300 hover:underline">partners@clustergg.com</a>.
      </p>
    </div>
  );
}
