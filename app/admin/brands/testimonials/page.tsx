import { redirect } from "next/navigation";
import { MOVED_ROUTES } from "@/lib/admin-nav";

// Merged into /admin/brands as the "Testimonials" tab.
//
// This stub is not optional. Without it `/admin/brands/testimonials` falls
// through to `/admin/brands/[id]` and renders a brand detail page for a brand
// whose id is the word "testimonials" — a 200 that looks like a broken brand
// rather than a moved page.
//
// The destination comes from MOVED_ROUTES so the redirect and the access guard
// read the same line — the guard resolves a moved path to where it lands, and a
// stub that pointed somewhere else would send staff to a page they may not open.
export default function LegacyTestimonialsPage() {
  redirect(MOVED_ROUTES["/admin/brands/testimonials"]);
}
