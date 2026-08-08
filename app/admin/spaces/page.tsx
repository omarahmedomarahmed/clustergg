import { redirect } from "next/navigation";
import { MOVED_ROUTES } from "@/lib/admin-nav";

// Planets merged into Games — a game and its planet are one thing, and editing
// half of it on each of two pages was the reason nobody could remember which
// half lived where. Kept as a redirect: staff bookmark admin pages.
//
// `/admin/spaces/requests` is unaffected; it is a queue of games gamers have
// asked for, which is a different job from editing the ones we carry.
export default function LegacyPlanetsPage() {
  redirect(MOVED_ROUTES["/admin/spaces"]);
}
