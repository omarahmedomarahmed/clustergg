import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { campaignDiscountLine, type CampaignConfig } from "@/lib/campaigns";
import { PRICING_DEFAULTS, perGame, quote, type PricingConfig } from "@/lib/pricing";
import { uid } from "@/lib/utils";

// The brand billing cycle.
//
// One invoice per brand per month. What goes on it is not typed by anybody: it
// is DERIVED from the same `quote()` the pricing page runs, so an invoice can
// never quote a price the website doesn't. The shape a brand actually
// experiences, in the platform's own numbers:
//
//   Placements only          base $600/month
//   Buy one game's challenges  + $1,000  (four weekly challenges at $250)
//                              − $100    (the base drops to $500 once a game
//                                         is sponsored — you stop paying for
//                                         reach alone and start paying for
//                                         games)
//
// That "−$100" is not a promotion somebody remembers to apply. It falls out of
// `quote()` because `reachBase` and `challengeBase` are different numbers, and
// it is printed as its own line so a brand can see the discount they were
// given rather than a total they have to trust.
//
// Then every line is editable. Label, amount, quantity, all of it, plus manual
// discounts staff add by hand — because a billing system sales has to work
// around is a billing system that gets worked around, and the first invoice
// somebody rewrites in a spreadsheet is the last one this software sees.
//
// Two things it deliberately does NOT do:
//
//   1. It does not store totals. A total is the sum of its lines, computed on
//      read. The alternative is a header that disagrees with its own body the
//      first time a line is edited and the recompute is forgotten.
//   2. It does not touch money. Where a brand pays is a URL from a provider or
//      pasted in by staff, and "paid" is a human or a webhook saying so. There
//      is no card number in this file and there is no path by which one could
//      arrive.

const round2 = (n: number) => Math.round(n * 100) / 100;

export type InvoiceLine = {
  id: string;
  kind: string;
  label: string;
  quantity: number;
  unitAmount: number;
  amount: number;
  sourceType: string | null;
  sourceId: string | null;
  sortOrder: number;
};

export type Invoice = {
  id: string;
  brandId: string;
  brandName: string;
  brandEmail: string | null;
  number: string;
  status: string;
  currency: string;
  periodLabel: string | null;
  issuedAt: Date | null;
  dueAt: Date | null;
  paidAt: Date | null;
  notes: string | null;
  payLinkUrl: string | null;
  payProvider: string | null;
  payEmbeddable: boolean;
  paidVia: string | null;
  paidRef: string | null;
  payToken: string | null;
  createdAt: Date;
  lines: InvoiceLine[];
  /** Everything that isn't a discount. */
  subtotal: number;
  /** The discounts, as a positive number. */
  discount: number;
  total: number;
  /** Past due and not paid. Computed, never stored — a stored one goes stale overnight. */
  overdue: boolean;
  daysUntilDue: number | null;
};

export const INVOICE_KINDS = [
  { key: "base", label: "Monthly base" },
  { key: "game", label: "Sponsored game" },
  { key: "challenge", label: "One-off challenge" },
  { key: "addon", label: "Add-on" },
  { key: "discount", label: "Discount" },
  { key: "credit", label: "Credit" },
  { key: "adjustment", label: "Adjustment" },
] as const;

export const INVOICE_STATUSES = ["draft", "sent", "paid", "void"] as const;

function lineAmount(l: { quantity: number; unitAmount: number }): number {
  return round2(Number(l.quantity ?? 1) * Number(l.unitAmount ?? 0));
}

/** Sum a set of lines the one way this codebase is allowed to. */
export function totalsOf(lines: { quantity: number; unitAmount: number; kind?: string }[]) {
  let subtotal = 0;
  let discount = 0;
  for (const l of lines) {
    const amt = lineAmount(l);
    if (amt < 0) discount += -amt;
    else subtotal += amt;
  }
  return { subtotal: round2(subtotal), discount: round2(discount), total: round2(subtotal - discount) };
}

function shape(
  row: typeof schema.brandInvoices.$inferSelect,
  brand: { name: string; contactEmail: string | null } | undefined,
  lines: (typeof schema.invoiceLines.$inferSelect)[],
): Invoice {
  const shaped: InvoiceLine[] = lines
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((l) => ({
      id: l.id, kind: l.kind, label: l.label,
      quantity: Number(l.quantity), unitAmount: Number(l.unitAmount),
      amount: lineAmount({ quantity: Number(l.quantity), unitAmount: Number(l.unitAmount) }),
      sourceType: l.sourceType, sourceId: l.sourceId, sortOrder: l.sortOrder,
    }));
  const t = totalsOf(shaped);
  const due = row.dueAt ? new Date(row.dueAt) : null;
  const days = due ? Math.ceil((due.getTime() - Date.now()) / 86400000) : null;
  return {
    id: row.id, brandId: row.brandId,
    brandName: brand?.name ?? "Unknown brand",
    brandEmail: brand?.contactEmail ?? null,
    number: row.number, status: row.status, currency: row.currency,
    periodLabel: row.periodLabel, issuedAt: row.issuedAt, dueAt: due, paidAt: row.paidAt,
    notes: row.notes, payLinkUrl: row.payLinkUrl, payProvider: row.payProvider,
    payEmbeddable: row.payEmbeddable, paidVia: row.paidVia, paidRef: row.paidRef,
    payToken: row.payToken, createdAt: row.createdAt,
    lines: shaped, ...t,
    overdue: row.status === "sent" && !!due && due.getTime() < Date.now(),
    daysUntilDue: days,
  };
}

type DB = Awaited<ReturnType<typeof getDb>>;

async function hydrate(db: DB, rows: (typeof schema.brandInvoices.$inferSelect)[]): Promise<Invoice[]> {
  if (!rows.length) return [];
  const [brands, lines] = await Promise.all([
    db.select({ id: schema.brands.id, name: schema.brands.name, contactEmail: schema.brands.contactEmail })
      .from(schema.brands).where(inArray(schema.brands.id, [...new Set(rows.map((r) => r.brandId))])),
    db.select().from(schema.invoiceLines)
      .where(inArray(schema.invoiceLines.invoiceId, rows.map((r) => r.id))),
  ]);
  const byBrand = new Map(brands.map((b) => [b.id, b]));
  return rows.map((r) => shape(r, byBrand.get(r.brandId), lines.filter((l) => l.invoiceId === r.id)));
}

export async function listInvoices(opts: { brandId?: string; limit?: number } = {}): Promise<Invoice[]> {
  try {
    const db = await getDb();
    const rows = await db.select().from(schema.brandInvoices)
      .where(opts.brandId ? eq(schema.brandInvoices.brandId, opts.brandId) : sql`true`)
      .orderBy(desc(schema.brandInvoices.createdAt))
      .limit(opts.limit ?? 200);
    return hydrate(db, rows);
  } catch { return []; }
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  try {
    const db = await getDb();
    const [row] = await db.select().from(schema.brandInvoices).where(eq(schema.brandInvoices.id, id)).limit(1);
    if (!row) return null;
    return (await hydrate(db, [row]))[0] ?? null;
  } catch { return null; }
}

/**
 * The public pay page's lookup.
 *
 * By TOKEN, never by id. An invoice id appears in admin URLs and screenshots;
 * a pay token is minted for this purpose, rotatable, and the only thing that
 * opens somebody else's bill.
 */
export async function invoiceByToken(token: string): Promise<Invoice | null> {
  if (!token || token.length < 16) return null;
  try {
    const db = await getDb();
    const [row] = await db.select().from(schema.brandInvoices)
      .where(eq(schema.brandInvoices.payToken, token)).limit(1);
    if (!row) return null;
    return (await hydrate(db, [row]))[0] ?? null;
  } catch { return null; }
}

/** CGG-0001, CGG-0002 … Sequential, gapless within what exists, never reused. */
export async function nextInvoiceNumber(db: DB): Promise<string> {
  const rows = await db.select({ number: schema.brandInvoices.number }).from(schema.brandInvoices);
  const max = rows.reduce((m, r) => {
    const n = Number(String(r.number).replace(/\D/g, ""));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `CGG-${String(max + 1).padStart(4, "0")}`;
}

export function payToken(): string {
  return `${uid()}${uid()}`.replace(/-/g, "").slice(0, 32);
}

/**
 * The lines a month's bill starts as.
 *
 * `games` is how many games the brand is sponsoring this month, counted from
 * their live campaigns rather than asked for. The base line quotes whichever
 * base that lands them on, and when it is the cheaper one the difference is
 * printed as its own discount line — the same money, said in a way a brand can
 * check.
 */
export function draftLines(opts: {
  games: number;
  addon?: boolean;
  cfg?: PricingConfig;
  gameNames?: string[];
  /**
   * The promotional campaigns (B44). Omitted means none — a caller that does
   * not know about campaigns bills full price, which is the safe direction.
   */
  campaigns?: CampaignConfig;
}): { kind: string; label: string; quantity: number; unitAmount: number; sourceType?: string; sourceId?: string }[] {
  const cfg = opts.cfg ?? PRICING_DEFAULTS;
  const q = quote(cfg, { games: opts.games, addon: opts.addon });
  const out: { kind: string; label: string; quantity: number; unitAmount: number; sourceType?: string; sourceId?: string }[] = [];

  // The base line always quotes the LIST price — placements on their own — and
  // the reduction that sponsoring earns is a separate discount line below.
  //
  // Quoting the already-reduced base here and then also subtracting the
  // reduction takes it off twice, which is a $100 hole per invoice per month
  // that reconciles against nothing. The rule: one line states the price, one
  // line states the discount, and the total is what `quote()` says.
  out.push({
    kind: "base",
    label: "Placements — clustergg.com and every Discord server on the network",
    quantity: 1,
    unitAmount: cfg.reachBase,
  });

  if (opts.games > 0) {
    const names = opts.gameNames ?? [];
    for (let i = 0; i < opts.games; i++) {
      out.push({
        kind: "game",
        label: names[i]
          ? `${names[i]} — ${cfg.challengesPerGame} sponsored weekly challenges`
          : `Sponsored game — ${cfg.challengesPerGame} weekly challenges`,
        quantity: cfg.challengesPerGame,
        unitAmount: cfg.challengePrice,
        sourceType: names[i] ? "game" : undefined,
        sourceId: names[i],
      });
    }
    // The base they would have paid on placements alone, minus the base they
    // are paying now. Positive by construction whenever sponsoring is cheaper.
    const saved = round2(cfg.reachBase - q.base);
    if (saved > 0) {
      out.push({
        kind: "discount",
        label: `Sponsored-plan base reduction (${perGame(cfg) > 0 ? "you're paying for games, not for reach" : "plan discount"})`,
        quantity: 1,
        unitAmount: -saved,
      });
    }
  }

  if (opts.addon) {
    out.push({ kind: "addon", label: "Sunday Broadcast — presenting sponsor", quantity: 1, unitAmount: cfg.streamAddon });
  }

  // The founding brand campaign, LAST and as its own line (B44).
  //
  // Last, so it reads as a deduction from a stated price rather than as part of
  // the price. Its own line, never a reduced unit rate, because the gross
  // figure is what tells us what the campaign cost — and because a bill whose
  // numbers cannot be traced is a bill somebody disputes. It covers the
  // challenge lines only; the placements base above is still charged.
  if (opts.campaigns) {
    const promo = campaignDiscountLine(out, opts.campaigns);
    if (promo) out.push(promo);
  }

  return out;
}

/** How many games a brand has running right now, for the draft above. */
export async function liveGamesFor(db: DB, brandId: string): Promise<string[]> {
  try {
    const rows = await db.select({ game: schema.sponsoredCampaigns.game })
      .from(schema.sponsoredCampaigns)
      .where(and(
        eq(schema.sponsoredCampaigns.brandId, brandId),
        inArray(schema.sponsoredCampaigns.status, ["submitted", "running"]),
      ));
    return [...new Set(rows.map((r) => r.game))];
  } catch { return []; }
}

/**
 * The billing cycle a brand is on: 30 days from the day it goes live.
 *
 * Not "the 1st of the month". A brand that signs on the 20th and gets an
 * invoice due on the 1st has been given eleven days' terms and will say so.
 */
export function dueDateFrom(issued: Date, termsDays = 30): Date {
  return new Date(issued.getTime() + termsDays * 86400000);
}

export function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * What every brand owes right now, for the admin overview.
 *
 * Counted from invoices rather than from campaigns: a campaign that ran and was
 * never invoiced is revenue we lost, and the only way to see it is to compare
 * the two — which the admin page does, side by side.
 */
export type BrandBalance = {
  brandId: string;
  brandName: string;
  invoices: number;
  billed: number;
  paid: number;
  outstanding: number;
  overdue: number;
  oldestDue: Date | null;
};

export async function brandBalances(): Promise<BrandBalance[]> {
  const invoices = await listInvoices({ limit: 500 });
  const byBrand = new Map<string, BrandBalance>();
  for (const inv of invoices) {
    if (inv.status === "void" || inv.status === "draft") continue;
    const b = byBrand.get(inv.brandId) ?? {
      brandId: inv.brandId, brandName: inv.brandName,
      invoices: 0, billed: 0, paid: 0, outstanding: 0, overdue: 0, oldestDue: null,
    };
    b.invoices += 1;
    b.billed = round2(b.billed + inv.total);
    if (inv.status === "paid") b.paid = round2(b.paid + inv.total);
    else {
      b.outstanding = round2(b.outstanding + inv.total);
      if (inv.overdue) b.overdue = round2(b.overdue + inv.total);
      if (inv.dueAt && (!b.oldestDue || inv.dueAt < b.oldestDue)) b.oldestDue = inv.dueAt;
    }
    byBrand.set(inv.brandId, b);
  }
  return [...byBrand.values()].sort((a, b) => b.outstanding - a.outstanding || b.billed - a.billed);
}
