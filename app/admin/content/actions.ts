"use server";

// The copy editor's actions. `14-EDITABLE` E5–E7.
//
// Every one of them is three lines around `saveOverride`, and that is the
// point: the refusal lives at the store, so this file cannot be kinder than
// the rule and neither can anything else somebody wires up later.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "../../../lib/db/index.ts";
import { currentStaff } from "../../../lib/admin/session.ts";
import { saveOverride, CopyRefused } from "../../../lib/content/store.ts";
import { COPY } from "../../../lib/content/copy.ts";

function back(params: Record<string, string> = {}): never {
  const qs = new URLSearchParams(params).toString();
  redirect(qs ? `/admin/content?${qs}` : "/admin/content");
}

async function editor(): Promise<string> {
  const staff = await currentStaff();
  if (!staff) redirect("/signup");
  return staff.userId;
}

/**
 * E7 — live on save. There is no deploy in this loop.
 *
 * `revalidatePath("/", "layout")` rather than the one page: copy renders on
 * the homepage, the challenge pages and the portals, and an edit that only
 * refreshed the editor would look saved and read stale everywhere it matters.
 */
export async function saveCopyAction(form: FormData): Promise<void> {
  const who = await editor();
  const key = String(form.get("key") ?? "");
  const value = String(form.get("value") ?? "");

  if (!(key in COPY)) {
    back({ error: `There is no copy key called “${key}”.` });
  }

  const db = await getDb();
  try {
    await saveOverride(db, { scope: "copy", key, value, editedBy: who });
  } catch (e) {
    if (e instanceof CopyRefused) {
      // E2 — the refusal and its alternative travel together. Splitting them
      // is how an operator ends up reading "no" with no next step.
      back({ error: e.message, focus: key });
    }
    throw e;
  }

  revalidatePath("/", "layout");
  back({ saved: key, focus: key });
}

/**
 * E6 — removing an override is a first-class action, not an edit to blank.
 *
 * A store that could not tell them apart would make the default unreachable
 * the moment anybody typed into the key, which is the opposite of what a
 * revert is for.
 */
export async function clearCopyAction(form: FormData): Promise<void> {
  const who = await editor();
  const key = String(form.get("key") ?? "");
  const db = await getDb();
  await saveOverride(db, { scope: "copy", key, value: null, editedBy: who });
  revalidatePath("/", "layout");
  back({ cleared: key, focus: key });
}

/**
 * Revert to a specific earlier value. E4's *"one click away"*.
 *
 * A revert is a **new row**, not a resurrection of the old one: the history has
 * to say that somebody went back, and when. It also goes through `saveOverride`
 * like everything else, so a value that was legal when it was written and is
 * not legal now — a figure that has since been given a placeholder — cannot be
 * restored by the back door.
 */
export async function revertCopyAction(form: FormData): Promise<void> {
  const who = await editor();
  const key = String(form.get("key") ?? "");
  const to = form.get("to");
  const db = await getDb();
  try {
    await saveOverride(db, {
      scope: "copy",
      key,
      value: to === null ? null : String(to),
      editedBy: who,
    });
  } catch (e) {
    if (e instanceof CopyRefused) back({ error: e.message, focus: key });
    throw e;
  }
  revalidatePath("/", "layout");
  back({ saved: key, focus: key });
}
