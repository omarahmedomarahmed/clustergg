import { redirect } from "next/navigation";
import { MOVED_ROUTES } from "@/lib/admin-nav";

// Merged into /admin/content as the "Nav & footer" tab.
//
// The destination comes from MOVED_ROUTES so the redirect and the access guard
// read the same line — the guard resolves a moved path to where it lands, and a
// stub that pointed somewhere else would send staff to a page they may not open.
export default function LegacyChromePage() {
  redirect(MOVED_ROUTES["/admin/chrome"]);
}
