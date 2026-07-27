import { desc, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";

// Brands asking to buy.
//
// The pricing page publishes a real rate card, so the button under it has to do
// something real. This captures the enquiry WITH the configuration they had on
// screen — tier, games, add-on, billing, quoted price — so the first reply from
// sales already knows what they were looking at.
//
// It is an anonymous public write, so it is treated as one: nothing here is
// rendered as HTML, every field is length-capped, and a global hourly ceiling
// stops a script from filling the table. Anything that gets through is still
// just a row a human reads.

export type EnquiryInput = {
  company: string;
  contactName?: string;
  email: string;
  phone?: string;
  website?: string;
  message?: string;
  tier?: string;
  games?: number;
  addon?: boolean;
  billing?: string;
  quotedMonthly?: number;
};

export type EnquiryResult =
  | { ok: true; id: string }
  | { ok: false; reason: "no_company" | "bad_email" | "too_many" | "error" };

const MAX_PER_HOUR = 40;
const TIERS = new Set(["reach", "challenge", "ultimate"]);

// Deliberately permissive: the job of this check is to catch a typo and an empty
// box, not to adjudicate RFC 5322. A real address that we reject is a lost sale;
// a junk one that gets through is a row someone deletes.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clip(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

export async function submitEnquiry(input: EnquiryInput): Promise<EnquiryResult> {
  const company = clip(input.company, 160);
  const email = clip(input.email, 200).toLowerCase();
  if (!company) return { ok: false, reason: "no_company" };
  if (!EMAIL.test(email)) return { ok: false, reason: "bad_email" };

  try {
    const db = await getDb();

    const since = new Date(Date.now() - 60 * 60 * 1000);
    const [recent] = await db.select({ n: sql<number>`count(*)` })
      .from(schema.brandEnquiries).where(gte(schema.brandEnquiries.createdAt, since));
    if (Number(recent?.n ?? 0) >= MAX_PER_HOUR) return { ok: false, reason: "too_many" };

    const id = uid();
    await db.insert(schema.brandEnquiries).values({
      id,
      company,
      contactName: clip(input.contactName, 160),
      email,
      phone: clip(input.phone, 60) || null,
      website: clip(input.website, 300) || null,
      message: clip(input.message, 4000),
      tier: TIERS.has(String(input.tier)) ? String(input.tier) : "reach",
      games: Math.max(0, Math.min(24, Math.round(Number(input.games) || 0))),
      addon: Boolean(input.addon),
      billing: input.billing === "yearly" ? "yearly" : "monthly",
      // Stored in whole currency units. Rounded rather than trusted: this is a
      // client-supplied number and it exists to give context, never to bill on.
      quotedMonthly: Math.max(0, Math.min(1_000_000, Math.round(Number(input.quotedMonthly) || 0))),
    });
    return { ok: true, id };
  } catch { return { ok: false, reason: "error" }; }
}

export type EnquiryRow = typeof schema.brandEnquiries.$inferSelect;

export async function listEnquiries(status?: string, limit = 100): Promise<EnquiryRow[]> {
  try {
    const db = await getDb();
    const q = db.select().from(schema.brandEnquiries);
    const rows = status
      ? await q.where(eq(schema.brandEnquiries.status, status)).orderBy(desc(schema.brandEnquiries.createdAt)).limit(limit)
      : await q.orderBy(desc(schema.brandEnquiries.createdAt)).limit(limit);
    return rows;
  } catch { return []; }
}

export async function countNewEnquiries(): Promise<number> {
  try {
    const db = await getDb();
    const [row] = await db.select({ n: sql<number>`count(*)` })
      .from(schema.brandEnquiries).where(eq(schema.brandEnquiries.status, "new"));
    return Number(row?.n ?? 0);
  } catch { return 0; }
}
