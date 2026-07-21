"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { setContent } from "@/lib/cms";
import { parseBottomTabs, parseDrawerLinks, type MobileTab, type DrawerLink } from "@/lib/mobile-nav";

// Persist the admin-editable mobile chrome: the bottom tab bar + the extra
// side-drawer links. Empty arrays clear the override (back to defaults).
export async function saveMobileChrome(bottom: MobileTab[], drawer: DrawerLink[]) {
  await requireStaff();
  // Re-validate through the parsers so we only ever store clean data.
  const cleanBottom = parseBottomTabs(JSON.stringify(bottom)) ?? [];
  const cleanDrawer = parseDrawerLinks(JSON.stringify(drawer));
  await setContent("mobile.bottomnav", cleanBottom.length ? JSON.stringify(cleanBottom) : "", "en");
  await setContent("mobile.drawer.extra", cleanDrawer.length ? JSON.stringify(cleanDrawer) : "", "en");
  revalidatePath("/", "layout");
  revalidatePath("/admin/mobile");
  return { ok: true };
}
