// Who may see which admin page.
//
// ===== HOUSE RULE 7 IS ABSOLUTE =====
//
//   `/admin/users` and `/admin/linked-accounts` are **admin-only**. No staff
//   department reaches the gamer directory, ever.
//
// "Ever" is doing work in that sentence. It is not "admins and whoever needs
// it": the gamer directory is names, ages, countries and linked game accounts,
// and a finance clerk approving a redemption needs the trophy and the amount,
// not the person's whole life. So the department list for those two pages is
// empty, and the type system says so — `ADMIN_ONLY` is not a role set anyone
// can be added to at a call site.
//
// The gate is a function of the page, not of the person. A page declares what
// it needs; a person has a department; the check is one comparison, in one
// place, and a page cannot forget to call it because the layout calls it.

import { eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";

/** Every department. `admin` is not a department, it is everything. */
export const DEPARTMENTS = ["admin", "finance", "support", "sales"] as const;
export type Department = (typeof DEPARTMENTS)[number];

/**
 * The access a page requires.
 *
 * `admin_only` is deliberately not "the set containing admin" — it is its own
 * kind, so that a well-meaning edit widening a department list cannot reach
 * the two pages that must never widen.
 */
export type Access = { kind: "admin_only" } | { kind: "departments"; allow: Department[] };

export const ADMIN_ONLY: Access = { kind: "admin_only" };
export const departments = (...allow: Department[]): Access => ({ kind: "departments", allow });

/**
 * What each admin route requires. **One table, walked by a test.**
 *
 * A route missing from here fails closed — `accessFor` returns `ADMIN_ONLY`
 * for anything it does not recognise, so forgetting to add a page makes it
 * *more* restricted rather than less. The opposite default is how a directory
 * ends up readable by sales.
 */
export const ROUTE_ACCESS: Record<string, Access> = {
  "/admin": departments("admin", "finance", "support", "sales"),
  "/admin/challenges": departments("admin", "sales"),
  "/admin/vaults": departments("admin", "finance"),
  "/admin/vaults/prize": departments("admin", "finance"),
  "/admin/vaults/server": departments("admin", "finance"),
  "/admin/trophies": departments("admin", "finance"),
  "/admin/brands": departments("admin", "sales"),
  "/admin/servers": departments("admin", "sales", "support"),
  "/admin/payouts": departments("admin", "finance"),
  "/admin/redeems": departments("admin", "finance"),
  "/admin/weekend": departments("admin", "finance", "support", "sales"),
  // ===== TWO SURFACES, ONE TEAM. RULED. =====
  //
  // 05 §6 / MS2 keep the two inboxes apart as **data**: a brand thread never
  // appears in the server inbox, and that is guard 153, in the query itself.
  // Who may *read* each one is a different question, and the answer is that
  // one small team answers both.
  //
  // The first version split them — support for owners, sales for brands, by
  // analogy with `/admin/servers` and `/admin/brands`. Overturned: **a support
  // person unable to reply to a brand is a worse failure than a sales person
  // seeing a server's message.** Silence is the failure mode H7 exists to
  // prevent, and a departmental wall is a way to produce it.
  //
  // The directories are untouched by this and by anything else (ST2).
  "/admin/inbox/servers": departments("admin", "sales", "support"),
  "/admin/inbox/brands": departments("admin", "sales", "support"),
  // 05 §6 — the weekly history. Finance answers "why was this payout this
  // size", support answers "why did I earn nothing", and sales reads a
  // server's record before a call. The gamer directory is not here, and
  // nothing on these pages names a gamer.
  "/admin/weeks": departments("admin", "finance", "support", "sales"),
  // The wiring, not the data. It names which secrets are SET — never a value —
  // and which services answer. That is a map of where the platform is soft, so
  // it is admin-only by kind rather than by department: knowing that
  // STRIPE_WEBHOOK_SECRET is missing is knowing exactly which door is open.
  "/admin/preflight": ADMIN_ONLY,
  "/admin/settings": ADMIN_ONLY,
  // ST1 — a title is what opens this console, so granting one is the single
  // thing a title must never be able to do. Admin-only by kind, like the
  // directories, and for the same reason: it is not a department list that
  // could be widened by a well-meaning edit.
  "/admin/staff": ADMIN_ONLY,

  // ===== SPRINT 13'S PAGES. EACH ONE A DECISION, NOT AN INHERITANCE =====
  //
  // Most of these would inherit a sensible rule by prefix — `/admin/vaults/…`
  // from `/admin/vaults`, `/admin/challenges/…` from `/admin/challenges`. The
  // census still demands an explicit entry, and trap 29 is why: silence reads
  // as agreement, and the anchor table in `91-admin-access` is where the
  // decision is actually recorded. Inheriting is a fine *answer*; it is not a
  // decision until somebody writes it down.

  // The builder creates an invoice, so it is money-adjacent — but the money it
  // creates is a **bill**, which is a sales act. Same as `/admin/challenges`.
  "/admin/challenges/new": departments("admin", "sales"),
  "/admin/challenges/series": departments("admin", "sales"),

  // The ledger is the balance sheet. Finance, like every other vault page.
  "/admin/vaults/ledger": departments("admin", "finance"),

  // Trophies are prize-vault liabilities, which is why they sit with finance
  // rather than with the sales team who sold the challenge.
  "/admin/trophies/new": departments("admin", "finance"),
  "/admin/trophies/templates": departments("admin", "finance"),

  // A draft built into a brand's portal is a sales act — 06 §3's last row is
  // somebody on a call. It bills them for nothing until they confirm.
  "/admin/brands/draft": departments("admin", "sales"),

  // ===== `/admin/invoices` IS THE ONE THAT NEEDED THINKING ABOUT =====
  //
  // Finance owns the money and sales chases the payment: 05 §9 step 8 is
  // *"chase unpaid drafts — deadline Saturday evening"*, and that is the
  // salesperson who sold it, not the finance team. Both, therefore.
  //
  // There is no **mark paid** control on the page for either of them — the
  // payment webhook is the only thing that routes money into the vaults — so
  // widening the readership does not widen what anybody can move.
  "/admin/invoices": departments("admin", "finance", "sales"),

  // Community requests are a server question, and the page deliberately has no
  // approve button: only the guild owner approves their own spend (P1).
  "/admin/servers/requests": departments("admin", "sales", "support"),

  // Copy, the catalogue and the card layouts. Not admin-only: an operator who
  // cannot see which games are sellable, or which bot screen is registered, is
  // an operator who has to ask — and `/admin/settings` and `/admin/staff` stay
  // admin-only, because those change what the platform *does*.
  // The bot's outbox. It names servers and the Discord ids of their owners —
  // never a gamer, and nothing about money — and the question it answers is
  // *"why did our server not get the card"*, which is support's question and
  // sales's. Finance is out because there is nothing here they could act on,
  // and 10-SETUP §8's outage table is written for the same two.
  "/admin/queue": departments("admin", "sales", "support"),

  "/admin/content": departments("admin", "sales"),
  "/admin/games": departments("admin", "sales", "support"),
  "/admin/cards": departments("admin", "support"),

  // ===== The two that are never anything else. =====
  "/admin/users": ADMIN_ONLY,
  "/admin/linked-accounts": ADMIN_ONLY,
};

/**
 * Fails closed: an unknown route is admin-only until somebody says otherwise.
 *
 * ===== `/admin` MATCHES EXACTLY, AND THAT IS THE WHOLE GUARD =====
 *
 * The first version of this used a plain longest-prefix match, and the
 * dashboard's own entry defeated it: `/admin` is a prefix of every admin
 * route, so `/admin/anything-unclassified` inherited the dashboard's rule —
 * which is the LOOSEST one on the platform, open to all four departments.
 * The fail-closed default was unreachable, and a page added in a hurry would
 * have been readable by sales.
 *
 * Found by the test that asserts the default, which is the only reason it was
 * found at all: every other assertion in the suite passed.
 *
 * So the root is matched exactly and prefix inheritance starts one level down,
 * where it is what you want — `/admin/users/abc` inheriting `/admin/users`.
 */
export function accessFor(route: string): Access {
  if (route === "/admin") return ROUTE_ACCESS["/admin"];
  const match = Object.keys(ROUTE_ACCESS)
    .filter((r) => r !== "/admin")
    .filter((r) => route === r || route.startsWith(`${r}/`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? ROUTE_ACCESS[match] : ADMIN_ONLY;
}

export function mayAccess(access: Access, department: Department | null): boolean {
  if (!department) return false;
  if (access.kind === "admin_only") return department === "admin";
  return access.allow.includes(department);
}

/** The staff member behind a session, or null. */
export async function staffFor(
  db: DB,
  userId: string | null,
): Promise<{ userId: string; department: Department; name: string } | null> {
  if (!userId) return null;
  const [row] = await db.select().from(schema.staff).where(eq(schema.staff.userId, userId));
  if (!row) return null;
  return {
    userId: row.userId,
    department: row.department as Department,
    name: row.name,
  };
}

export async function grantStaff(
  db: DB,
  input: { userId: string; name: string; department: Department },
): Promise<void> {
  await db
    .insert(schema.staff)
    .values(input)
    .onConflictDoUpdate({
      target: schema.staff.userId,
      set: { department: input.department, name: input.name },
    });
}
