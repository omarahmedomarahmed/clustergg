// A brand signing itself up. B90.1.
//
// ===== WHY THIS EXISTS AT ALL =====
//
// Every brand on the platform was created by a staff member typing a name into
// an admin form. That is fine at four brands and it is the whole funnel at
// forty: somebody who lands on the pricing page at 2am, wants to look at the
// product, and finds a "talk to us" box has to wait for a human before they can
// see anything. The enquiry form still exists and is still the right thing for
// somebody who wants a conversation. This is for the one who wants an account.
//
// ===== WHAT A SELF-SIGNED-UP BRAND CAN AND CANNOT DO =====
//
// It gets a portal, a key, and a campaign builder. It does NOT get delivery:
// the row is created `pending`, and `lib/ads.ts` serves only `active` brands,
// so nothing a stranger typed into a form can appear on the site until a human
// has looked at it. That is the entire security posture and it is one column.
//
// A pending brand can build a campaign as a DRAFT and cannot pay for one — the
// unpaid draft is the sales signal (B90.3), which is the point: we would rather
// know what somebody wanted to buy than make them ask for permission to want it.
//
// ===== THE KEY IS SHOWN ONCE AND EMAILED ONCE =====
//
// Same shape as the server portal key. It is returned to the caller so the page
// can show it — email is not configured in every environment, and a signup flow
// that depends on a working mail provider is one that silently dead-ends when
// the provider is down.

import { eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid, slugify } from "@/lib/utils";
import { newPortalKey } from "@/lib/portal-auth";

export type SignupInput = {
  company: string;
  email: string;
  website?: string;
  industry?: string;
};

export type SignupResult =
  | { ok: true; brandId: string; slug: string; key: string }
  | { ok: false; reason: "no_company" | "bad_email" | "taken" | "too_many" | "error"; message: string };

/** Deliberately permissive — see the note in lib/brand-enquiries.ts. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Free-mail domains, which are NOT rejected.
 *
 * A real games studio of four people runs on Gmail. Refusing a free address
 * would turn away the exact customer this flow is for, and the check it looks
 * like it is doing — proving somebody works where they say — it does not do.
 * Kept as a flag for the human review instead.
 */
const FREE_MAIL = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com",
  "proton.me", "protonmail.com", "aol.com", "gmx.com", "mail.com",
]);

export const isFreeMail = (email: string) =>
  FREE_MAIL.has((email.split("@")[1] ?? "").toLowerCase());

/** A ceiling on how many strangers may create brands in an hour. */
const MAX_PER_HOUR = 20;

const clip = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/**
 * Make a slug nothing else is using.
 *
 * A collision here is not cosmetic: the slug IS the portal URL, and two brands
 * sharing one means the second one's key opens the first one's portal.
 */
async function freeSlug(db: Awaited<ReturnType<typeof getDb>>, name: string): Promise<string> {
  const base = slugify(name).slice(0, 40) || `brand-${uid().slice(0, 6)}`;
  for (let i = 0; i < 12; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const [taken] = await db.select({ id: schema.brands.id })
      .from(schema.brands).where(eq(schema.brands.slug, candidate)).limit(1);
    if (!taken) return candidate;
  }
  return `${base}-${uid().slice(0, 5)}`;
}

export async function signUpBrand(input: SignupInput): Promise<SignupResult> {
  const company = clip(input.company, 160);
  const email = clip(input.email, 200).toLowerCase();
  if (!company) return { ok: false, reason: "no_company", message: "Tell us the company name." };
  if (!EMAIL.test(email)) return { ok: false, reason: "bad_email", message: "That email doesn't look right — check it and try again." };

  try {
    const db = await getDb();

    const since = new Date(Date.now() - 60 * 60 * 1000);
    const [recent] = await db.select({ n: sql<number>`count(*)` })
      .from(schema.brands).where(gte(schema.brands.createdAt, since));
    if (Number(recent?.n ?? 0) >= MAX_PER_HOUR) {
      return {
        ok: false, reason: "too_many",
        message: "We're seeing a lot of signups right now. Email partners@clustergg.com and we'll open it by hand.",
      };
    }

    // One account per contact email. Two brands sharing an inbox is somebody
    // who already signed up and forgot — and minting a second portal for them
    // splits their campaigns across two places neither of which is complete.
    const [existing] = await db.select({ id: schema.brands.id, slug: schema.brands.slug })
      .from(schema.brands).where(eq(schema.brands.contactEmail, email)).limit(1);
    if (existing) {
      return {
        ok: false, reason: "taken",
        message: "There's already an account on that email. Ask us to resend the key rather than making a second one — partners@clustergg.com.",
      };
    }

    const id = uid();
    const slug = await freeSlug(db, company);
    const key = newPortalKey();
    await db.insert(schema.brands).values({
      id,
      name: company,
      slug,
      accessKey: key,
      contactEmail: email,
      industry: clip(input.industry, 40) || "other",
      // PENDING, not active. Nothing a stranger typed serves an impression
      // until a human has looked at it — see the note at the top.
      status: "pending",
      about: clip(input.website, 300) ? `Website: ${clip(input.website, 300)}` : null,
    });
    return { ok: true, brandId: id, slug, key };
  } catch {
    return { ok: false, reason: "error", message: "Something went wrong our end. Email partners@clustergg.com and we'll sort it." };
  }
}
