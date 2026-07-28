"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { setContent } from "@/lib/cms";
import {
  NAV_SETTING_KEY, FOOTER_SETTING_KEY, parseNav, parseFooter,
  type NavSettings, type FooterColumn,
} from "@/lib/site-chrome";

// Saving the nav and footer.
//
// Both go through the same parsers the renderers use, so what is stored is
// always something the site can draw — an admin cannot save a footer link with
// a `javascript:` href or a nav toggle for an item that no longer exists.
export async function saveNavChrome(settings: NavSettings) {
  await requireStaff();
  const clean = parseNav(JSON.stringify(settings));
  await setContent(NAV_SETTING_KEY, JSON.stringify(clean), "en");
  // The nav is in the root layout, so every route's cached shell is stale.
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveFooterChrome(columns: FooterColumn[]) {
  await requireStaff();
  const clean = parseFooter(JSON.stringify(columns));
  await setContent(FOOTER_SETTING_KEY, JSON.stringify(clean), "en");
  revalidatePath("/", "layout");
  return { ok: true };
}
