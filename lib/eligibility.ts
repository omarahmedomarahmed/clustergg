// Who we can pay, and what we have to know before we pay them (B37).
//
// Free points → trophies → real money, paid worldwide, is a prize and promotion
// scheme. This file is the ENFORCEMENT half of that: the prose lives at
// /legal/economy, and prose that nothing in the code checks is a wish.
//
// **Not legal advice.** Every threshold here is a placeholder a lawyer has to
// confirm before launch, and each one says so where it is defined. What this
// file guarantees is that when those numbers change, they change in one place
// and the redemption path already reads them.

import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/**
 * The minimum age to redeem for money.
 *
 * 18, not 13. Playing is one thing; being PAID is a contract, and a minor's
 * contract is voidable nearly everywhere — which means a payout to a
 * fifteen-year-old is money we may have to return and cannot get back from the
 * payout provider. Under-18s can still earn points, hold trophies and win
 * challenges; what they cannot do is cash out.
 *
 * ⚠ Confirm with counsel before launch. Some jurisdictions set it higher.
 */
export const MIN_REDEEM_AGE = 18;

/**
 * Countries we will not pay into.
 *
 * Comprehensively sanctioned jurisdictions. The payout provider will refuse
 * these anyway, so refusing here is not extra strictness — it is **kinder**: a
 * gamer learns before they lock their trophies into a request that will fail,
 * rather than after.
 *
 * ⚠ This list moves. It is a placeholder for counsel and has to be reviewed
 * against the current OFAC/EU/UK lists before launch, and on a schedule after.
 */
export const BLOCKED_COUNTRIES: Record<string, string> = {
  // Comprehensively sanctioned. These are the OFAC country programs where the
  // embargo covers the whole jurisdiction rather than named persons.
  CU: "Cuba", IR: "Iran", KP: "North Korea",
  // The three Ukrainian regions. Restricted by their own OFAC programs and
  // ABSENT from this list until B73 found them — the list was wrong in BOTH
  // directions, which is the failure mode a "placeholder for counsel" reaches
  // when nobody revisits it.
  //
  // ISO 3166-2 subdivisions, not countries. A gamer selecting Ukraine is not
  // blocked; this catches a payout provider or a form that reports the region.
  "UA-43": "Crimea", "UA-14": "Donetsk", "UA-09": "Luhansk",
};

/**
 * Removed from the block list by B73, and worth recording rather than
 * silently dropping.
 *
 *   SYRIA — the comprehensive program was REVOKED by Executive Order 14312.
 *   RUSSIA, BELARUS — never comprehensive embargoes. Sectoral and
 *   list-based, which is a screening question, not a country block.
 *
 * Blocking a country that is not embargoed is not "extra safety": it refuses
 * money to people entitled to it, and it hides the fact that nobody is doing
 * the screening that IS required.
 *
 * ⚠ Sanctions move monthly. B73 §5 Q10 asks counsel to confirm this list and,
 * more importantly, to name an owner and a review cadence. A list with neither
 * is the list this one just was.
 */
export const UNBLOCKED_BY_B73 = ["SY", "RU", "BY"] as const;

/**
 * The US information-reporting line that arrives first.
 *
 * We are not filing anything from code. What this number does is make the
 * question answerable: which recipients crossed it this year, so the people who
 * do file have the list rather than a database and a hope.
 *
 * **$2,000, not $600.** This said 600 and presented it as the current line.
 * Per the Instructions for Forms 1099-MISC and 1099-NEC (Rev. 12/2026), IRC
 * §6041(a) as amended by P.L. 119-21 §70433 sets the threshold for payments
 * made after 2025-12-31 at $2,000, indexed from 2027. Found by B73.
 *
 * The old value OVER-reported, so it was never a compliance risk — it was a
 * comment that stated a fact confidently and was wrong, which is the kind of
 * error that survives review because nobody re-checks a number that looks
 * familiar.
 *
 * ⚠ Thresholds vary by country and change by year, and this one is now indexed
 * — it moves again in 2027. Counsel decides who reports what; this is the
 * trigger for asking.
 */
export const US_REPORT_THRESHOLD = 2000;

export type EligibilityReason =
  | "ok" | "no_age" | "no_country" | "underage" | "blocked_country" | "outside_payout_region";

/**
 * Where cash redemption is open. B73 §5 Q4.
 *
 * THE FINDING: prize payments to non-US gamers may be US-source FDAP income
 * requiring **30% withholding and a Form 1042-S, with no de-minimis threshold**
 * — and the research could not locate a primary source settling the sourcing
 * rule. It is the largest unanswered question in the whole document, and for a
 * platform whose gamers are concentrated in MENA it is a pre-launch blocker
 * rather than a cleanup item.
 *
 * So cash redemption opens where we can pay correctly today, and nowhere else.
 * A gamer outside it keeps every trophy and every point; what is closed is the
 * conversion to money, and the reason is said plainly rather than dressed as a
 * technical limitation.
 *
 * This is a BETA position, not a permanent one. It opens the moment counsel
 * answers Q4 and the withholding path exists.
 */
export const PAYOUT_REGIONS: Record<string, string> = { US: "the United States" };

export type Eligibility = {
  ok: boolean;
  reason: EligibilityReason;
  /** What to say to the gamer. Empty when ok. */
  message: string;
  /** What we still need from them, so the form can ask for exactly that. */
  missing: ("age" | "country")[];
  age: number | null;
  country: string | null;
};

/** Whole years between a birth date and now. Nothing clever, and no timezone. */
/**
 * The lowest age a band could mean.
 *
 * Lowest, always. A range is not a number, and rounding it upward would pay
 * somebody on the strength of an age they never claimed — "16 or 17" must fail
 * the 18 test, not scrape past it.
 */
export function ageForBand(band: string | null | undefined): number | null {
  if (band === "adult") return MIN_REDEEM_AGE;
  if (band === "teen") return 16;
  if (band === "under16") return 0;
  return null;
}

export function ageFrom(birthDate: Date | string | null | undefined, now = new Date()): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

/**
 * Pure: given an age and a country, may this person be paid?
 *
 * Separated from the database read so the rule can be tested without one, and
 * so the same rule can be applied to a form the gamer is still filling in.
 */
export function eligibilityOf(age: number | null, country: string | null): Eligibility {
  // `age` is now derived from a BAND, not a birthday (B72.4). The signature is
  // unchanged so every caller and every message below still works, but the only
  // thing this function ever needed was "is this person old enough", and a band
  // answers that without us holding a date we have no use for.
  const cc = (country ?? "").trim().toUpperCase() || null;
  const missing: ("age" | "country")[] = [];
  if (age === null) missing.push("age");
  if (!cc) missing.push("country");

  if (age === null) {
    return { ok: false, reason: "no_age", missing, age, country: cc,
      message: "Tell us your age range before we can pay out. Points and trophies are unaffected — this is only about cashing out." };
  }
  if (!cc) {
    return { ok: false, reason: "no_country", missing, age, country: cc,
      message: "We need the country you live in before we can pay out — it decides which payout methods exist for you." };
  }
  if (age < MIN_REDEEM_AGE) {
    return { ok: false, reason: "underage", missing, age, country: cc,
      message: `You have to be ${MIN_REDEEM_AGE} to cash out. Keep earning — your points and trophies are yours and they keep, and you can redeem them when you turn ${MIN_REDEEM_AGE}.` };
  }
  if (BLOCKED_COUNTRIES[cc]) {
    return { ok: false, reason: "blocked_country", missing, age, country: cc,
      message: `We cannot send payments to ${BLOCKED_COUNTRIES[cc]}. Our payout partner will not process them, so we are telling you now rather than after your trophies are locked into a request that fails. You keep the trophies.` };
  }
  // Checked LAST, so a gamer in a sanctioned country gets the sanctions message
  // rather than this one — the two are not the same thing and must not read as
  // if they were.
  if (!PAYOUT_REGIONS[cc]) {
    return { ok: false, reason: "outside_payout_region", missing, age, country: cc,
      message:
        "Cash redemption is open in the United States only while we are in beta. "
        + "This is a tax-withholding question we are getting answered properly rather than guessing at, "
        + "and it is the honest reason rather than a technical one. "
        + "Every point and every trophy you have is yours and keeps — nothing expires while you wait." };
  }
  return { ok: true, reason: "ok", missing: [], age, country: cc, message: "" };
}

/** The same rule, against the account on file. */
export async function eligibilityFor(db: DB, userId: string): Promise<Eligibility> {
  try {
    const [u] = await db.select({ band: schema.users.ageBand, country: schema.users.country })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    // The BAND decides, not a stored birthday. `birthDate` is no longer
    // collected and B80's purge removes what is there; reading it here would
    // keep a column alive that we have told a regulator we stopped using.
    //
    // A band maps to the LOWEST age it could mean, which is the only safe
    // direction: "16 or 17" becomes 16, so it fails the 18 test, and nobody is
    // paid on the strength of a range that merely might have contained an adult.
    return eligibilityOf(ageForBand(u?.band), u?.country ?? null);
  } catch {
    // Fail CLOSED. This gate decides whether money leaves, and B35 settled the
    // principle: a guard that opens when the database hiccups is not a guard.
    return { ok: false, reason: "no_age", missing: ["age", "country"], age: null, country: null,
      message: "We could not check your details just now. Try again in a moment." };
  }
}

/**
 * What one recipient was PAID in a calendar year.
 *
 * Counted from `paidAt` and from paid rows only — a request that was approved in
 * December and paid in January belongs to January, because the year that matters
 * for reporting is the year the money moved. Counting by request date would put
 * it in the wrong year every time, and the error would only ever be found by
 * somebody reconciling a tax form.
 */
export async function annualPayout(db: DB, userId: string, year: number): Promise<number> {
  try {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const [row] = await db.select({ n: sql<number>`COALESCE(SUM(${schema.trophyRedeems.amount}), 0)` })
      .from(schema.trophyRedeems)
      .where(and(
        eq(schema.trophyRedeems.userId, userId),
        eq(schema.trophyRedeems.status, "paid"),
        gte(schema.trophyRedeems.paidAt, start),
        lt(schema.trophyRedeems.paidAt, end),
      ));
    return Math.round(Number(row?.n ?? 0) * 100) / 100;
  } catch { return 0; }
}

export type RecipientYear = { userId: string; name: string; slug: string; country: string | null; total: number; overThreshold: boolean };

/**
 * Everyone we paid in a year, and who crossed the reporting line.
 *
 * The whole list rather than only those over the threshold: the threshold is a
 * number counsel may move, and a report that pre-filters by it cannot answer
 * the question after it moves.
 */
export async function annualRecipients(db: DB, year: number): Promise<RecipientYear[]> {
  try {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const rows = await db.select({
      userId: schema.trophyRedeems.userId,
      name: schema.users.displayName,
      slug: schema.users.slug,
      country: schema.users.country,
      total: sql<number>`COALESCE(SUM(${schema.trophyRedeems.amount}), 0)`,
    }).from(schema.trophyRedeems)
      .innerJoin(schema.users, eq(schema.users.id, schema.trophyRedeems.userId))
      .where(and(
        eq(schema.trophyRedeems.status, "paid"),
        gte(schema.trophyRedeems.paidAt, start),
        lt(schema.trophyRedeems.paidAt, end),
      ))
      .groupBy(schema.trophyRedeems.userId, schema.users.displayName, schema.users.slug, schema.users.country);
    return rows
      .map((r) => ({
        userId: r.userId, name: r.name, slug: r.slug, country: r.country,
        total: Math.round(Number(r.total ?? 0) * 100) / 100,
        overThreshold: Number(r.total ?? 0) >= US_REPORT_THRESHOLD,
      }))
      .sort((a, b) => b.total - a.total);
  } catch { return []; }
}
