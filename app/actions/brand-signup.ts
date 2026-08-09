"use server";

import { revalidatePath } from "next/cache";
import { signUpBrand } from "@/lib/brand-signup";
import { sendEmail } from "@/lib/email";

// The public brand signup. B90.1.
//
// Unauthenticated by design, like the enquiry form beside it: a brand
// evaluating us has no account, and making one a prerequisite for looking at
// the product loses the lead. Everything a stranger can reach from here is
// bounded in `lib/brand-signup.ts` — an hourly ceiling, one account per inbox,
// and a row that lands `pending` so nothing they typed can serve an impression.

export type SignupState = {
  ok?: true;
  error?: string;
  /** Shown ONCE, on the page. See the note on the email below. */
  key?: string;
  portalUrl?: string;
  brand?: string;
  emailed?: boolean;
};

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

export async function createBrandAccount(_prev: SignupState | undefined, fd: FormData): Promise<SignupState> {
  // Honeypot. Bots fill every input they find; people cannot fill one they
  // cannot see. Answered with the same cheerful nothing a success gets, so a
  // script learns nothing from the difference.
  if (str(fd, "website_url").trim()) return { ok: true, brand: "", key: "", portalUrl: "/brands" };

  const res = await signUpBrand({
    company: str(fd, "company"),
    email: str(fd, "email"),
    website: str(fd, "website"),
    industry: str(fd, "industry"),
  });
  if (!res.ok) return { error: res.message };

  const portalUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://clustergg.com"}/brands/${res.slug}?key=${encodeURIComponent(res.key)}`;

  // Awaited, never floated — a promise left hanging in a server action is
  // frozen the moment the request returns, and an un-awaited send is a key
  // nobody receives.
  //
  // The key is ALSO returned to the page. Email is not configured on every
  // deployment, and a signup that depends on a working mail provider is one
  // that silently dead-ends the day the provider is down.
  const mail = await sendEmail({
    to: str(fd, "email").trim(),
    template: "brand.portal.key",
    data: { brand: res.slug, key: res.key, portalUrl },
    ref: { type: "brand", id: res.brandId },
  });

  revalidatePath("/admin/brands");
  return {
    ok: true,
    brand: str(fd, "company").trim(),
    key: res.key,
    portalUrl: `/brands/${res.slug}?key=${encodeURIComponent(res.key)}`,
    emailed: mail.ok,
  };
}
