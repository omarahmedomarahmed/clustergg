// The override store. Live on save, append-only, and it refuses a figure.
//
// ===== E7 — LIVE ON SAVE IS THE WHOLE POINT =====
//
// *"There is no deploy in this loop — that is the whole point of the store
// existing."* So a read here goes to the database on the request that needs it,
// and the only caching is Next's own on the page.
//
// ===== E4 — EVERY EDIT IS A NEW ROW =====
//
// The current value of a key is the newest row for it. Nothing is ever updated
// and nothing is ever deleted: **deleting an override is itself a row**, with a
// null value, which is what makes E6's "a key with no override reads as its
// default" a state you can arrive at and leave again without losing the
// history of how.
//
// ===== AND EVERY WRITE GOES THROUGH THE REFUSAL =====
//
// `checkCopy` is called here rather than in the page, for the reason
// `app/redeem/actions.ts` gives about the $0 refusal: a rule that only a form
// knows is a rule until somebody posts to the endpoint. There is exactly one
// way to write an override and it is this function.

import { and, desc, eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";
import { COPY } from "./copy.ts";
import { checkCopy, refusalText } from "./validate.ts";

export const SCOPES = ["copy", "page_art", "card"] as const;
export type Scope = (typeof SCOPES)[number];

/** Thrown when a save states a figure or a rule. Carries E2's alternative. */
export class CopyRefused extends Error {
  constructor(
    message: string,
    readonly rule: string,
    readonly alternative: string,
  ) {
    super(message);
    this.name = "CopyRefused";
  }
}

export type OverrideRow = {
  id: string;
  scope: string;
  key: string;
  value: string | null;
  settings: Record<string, unknown> | null;
  editedBy: string;
  editedAt: Date;
};

/**
 * Save an override, or record its removal.
 *
 * `value: null` is the removal — E6 — and it is deliberately not "save an empty
 * string": one means *read the default* and the other means *this key is
 * blank on purpose*, and a store that cannot tell them apart makes the default
 * unreachable once anybody has typed into the key.
 *
 * Only `copy` is validated, and that is not an oversight. A page's overlay
 * strength and a card's accent colour are not sentences; they cannot state a
 * figure because they cannot state anything. What they can do is fail to
 * render, and `14-EDITABLE` E10 handles that at its own door.
 */
export async function saveOverride(
  db: DB,
  input: {
    scope: Scope;
    key: string;
    value?: string | null;
    settings?: Record<string, unknown> | null;
    editedBy: string;
  },
): Promise<void> {
  if (!input.editedBy) {
    throw new CopyRefused(
      "An edit is recorded against the person who made it.",
      "attribution",
      "Sign in to the console and try again.",
    );
  }

  if (input.scope === "copy" && typeof input.value === "string") {
    const check = checkCopy(input.key, input.value);
    if (!check.ok) {
      throw new CopyRefused(refusalText(check)!, check.rule, check.alternative);
    }
  }

  await db.insert(schema.contentOverrides).values({
    id: uid(),
    scope: input.scope,
    key: input.key,
    value: input.value ?? null,
    settings: input.settings ?? null,
    editedBy: input.editedBy,
  });
}

/** The newest row per key in one scope. The live overrides. */
export async function currentOverrides(db: DB, scope: Scope): Promise<Map<string, OverrideRow>> {
  const rows = await db
    .select()
    .from(schema.contentOverrides)
    .where(eq(schema.contentOverrides.scope, scope))
    .orderBy(desc(schema.contentOverrides.editedAt));

  // Newest first, so the first row seen for a key is the live one. Done here
  // rather than in SQL because the shape a page wants is a map and every
  // driver this runs against spells `DISTINCT ON` differently.
  const live = new Map<string, OverrideRow>();
  for (const row of rows) if (!live.has(row.key)) live.set(row.key, row as OverrideRow);
  return live;
}

/** Every edit to one key, newest first. E4's "one click away". */
export async function historyOf(db: DB, scope: Scope, key: string): Promise<OverrideRow[]> {
  return (await db
    .select()
    .from(schema.contentOverrides)
    .where(and(eq(schema.contentOverrides.scope, scope), eq(schema.contentOverrides.key, key)))
    .orderBy(desc(schema.contentOverrides.editedAt))) as OverrideRow[];
}

/**
 * What a copy key says right now — the override if there is one, the code-side
 * default otherwise.
 *
 * Fenced, and that is not decoration: this is on the path of every page that
 * renders a word. House rule 11 — a store that is unreachable must degrade to
 * the defaults the deploy shipped, not to an error page. The failure mode of
 * a content store is a site with the wrong words; the failure mode of an
 * unfenced one is no site.
 */
export async function liveCopy(): Promise<typeof COPY> {
  try {
    const { getDb } = await import("../db/index.ts");
    const live = await currentOverrides(await getDb(), "copy");
    const out: Record<string, string> = { ...COPY };
    for (const [key, row] of live) {
      // `key in COPY` and not merely "is a key": an override for a key that no
      // longer exists is history, not copy, and rendering it would resurrect a
      // string the deploy deliberately removed.
      if (row.value !== null && key in COPY) out[key] = row.value;
    }
    return out as typeof COPY;
  } catch (e) {
    console.error("[content] the override store was unreachable; serving defaults", e);
    return COPY;
  }
}
