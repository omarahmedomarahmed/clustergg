import { redirect } from "next/navigation";
import { MOVED_ROUTES } from "@/lib/admin-nav";

// Merged into /admin/art. This route also stood in front of /admin/cards/guide,
// which is now the "Card layouts" tab of the same page.
//
// The destination comes from MOVED_ROUTES so the redirect and the access guard
// read the same line — the guard resolves a moved path to where it lands, and a
// stub that pointed somewhere else would send staff to a page they may not open.
export default function LegacyCardsPage() {
  redirect(MOVED_ROUTES["/admin/cards"]);
}
