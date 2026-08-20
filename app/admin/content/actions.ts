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

// ── Page background art. `14-EDITABLE` §4 ───────────────────────────────────

/**
 * E16 — *"it goes through the same upload door as everything else:
 * `acceptImage`, converted, stored in Blob."*
 *
 * The same two functions `/api/uploads` and the card editor call. A page
 * background is not a special case, and a second upload path is a second place
 * for the WebP rule to be missing — which is the rule whose absence turns a
 * card into a silently blank one.
 */
export async function savePageArtAction(form: FormData): Promise<void> {
  const who = await editor();
  const key = String(form.get("pageKey") ?? "");

  const { isPageKey, MIN_OVERLAY, MAX_OVERLAY, readArt } = await import(
    "../../../lib/site/page-art.ts"
  );
  if (!isPageKey(key)) back({ error: `There is no page called “${key}”.` });

  const overlay = Number(form.get("overlay") ?? MIN_OVERLAY);
  if (!Number.isFinite(overlay) || overlay < MIN_OVERLAY || overlay > MAX_OVERLAY) {
    // E14 — the overlay is part of the setting, not a guess, and it has a
    // floor. An operator picking art on a calibrated monitor cannot see the
    // phone in daylight that makes the words unreadable.
    back({
      error: `The readability overlay runs from ${MIN_OVERLAY} to ${MAX_OVERLAY}. It is not optional — art with no overlay is text on whatever happens to be behind it.`,
      art: key,
    });
  }

  let imageUrl = String(form.get("imageUrl") ?? "").trim() || null;
  const file = form.get("art");
  if (file instanceof File && file.size > 0) {
    const { acceptImage, UploadRefused } = await import("../../../lib/cards/upload.ts");
    const { putImage } = await import("../../../lib/cards/store.ts");
    const { uid } = await import("../../../lib/core/utils.ts");
    if (file.size > 8 * 1024 * 1024) back({ error: "That file is larger than 8 MB.", art: key });
    try {
      const accepted = await acceptImage({
        bytes: new Uint8Array(await file.arrayBuffer()),
        contentType: file.type,
        filename: file.name,
      });
      imageUrl = (await putImage(accepted, uid())).url;
    } catch (e) {
      if (e instanceof UploadRefused) back({ error: e.message, art: key });
      throw e;
    }
  }
  if (String(form.get("clearArt") ?? "") === "on") imageUrl = null;

  const db = await getDb();
  const { saveOverride: save } = await import("../../../lib/content/store.ts");
  await save(db, {
    scope: "page_art",
    key,
    settings: readArt({ imageUrl, overlay, focal: form.get("focal") }) as unknown as Record<
      string,
      unknown
    >,
    editedBy: who,
  });
  revalidatePath("/", "layout");
  back({ artSaved: key, art: key });
}
