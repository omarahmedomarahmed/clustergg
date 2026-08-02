"use server";

import { currentAccess } from "@/lib/departments";
import { pathAllowedFor } from "@/lib/systems";
import { hasPortalSession } from "@/lib/portal-auth";
import { markThreadRead, readThread, type ThreadKind, type ThreadMessageView, type ThreadSide } from "@/lib/threads";

// Reloading one conversation, without reloading the page it sits on.
//
// The brand portal runs ~40 queries to render: a full refresh to see whether a
// reply arrived is absurd, and `router.refresh()` is exactly that refresh with
// the scroll position preserved. So the thread reloads on its own — one query,
// no re-render of anything else on the screen.
//
// Authorization is redone here from scratch. It would be tempting to trust the
// page that rendered the button, but a Server Action is a public POST endpoint
// with a guessable body: anyone could ask for `("brand", <someone else's id>)`.
// So the portal side must hold that portal's session cookie, and the staff side
// must hold the department that owns the inbox.

export type ThreadRefreshResult =
  | { ok: true; messages: ThreadMessageView[] }
  | { ok: false; error: string };

/**
 * Which admin pages own each inbox — the same keys the console gates on.
 *
 * A brand's thread is two departments' business: the brand team owns the
 * relationship, the ad team owns what runs. Both already reply to it (the reply
 * action asks for the ad area), so both can read it — gating the refresh
 * tighter than the reply would give staff a Send button next to a thread they
 * are not allowed to reload.
 */
const ADMIN_PATHS: Record<ThreadKind, string[]> = {
  server: ["/admin/discord/messages"],
  brand: ["/admin/brands", "/admin/ads"],
};

export async function refreshThread(
  kind: ThreadKind, id: string, side: ThreadSide,
): Promise<ThreadRefreshResult> {
  if (kind !== "server" && kind !== "brand") return { ok: false, error: "Unknown conversation." };
  if (!id) return { ok: false, error: "Unknown conversation." };

  if (side === "admin") {
    const access = await currentAccess();
    if (!access) return { ok: false, error: "Sign in to load this." };
    if (!access.isAdmin && !ADMIN_PATHS[kind].some((p) => pathAllowedFor(access.systems, p))) {
      return { ok: false, error: "Your department doesn't cover this inbox." };
    }
  } else {
    // The portal session is scoped to this one portal, so holding a brand's
    // session proves nothing about a server's and vice versa.
    if (!(await hasPortalSession(kind, id))) {
      return { ok: false, error: "Your session expired — unlock the portal again." };
    }
  }

  const messages = await readThread(kind, id);
  // Loading the thread is reading it, on whichever side asked.
  await markThreadRead(kind, id, side);
  return { ok: true, messages };
}
