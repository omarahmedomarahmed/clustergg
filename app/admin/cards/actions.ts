"use server";

// The card editor's actions. `14-EDITABLE` E8–E12.
//
// ===== E10 IS THE ONE THAT MATTERS HERE =====
//
// *"A card family that cannot render is refused at save, not discovered by a
// gamer."* And the discovery would be quiet: `cardReply` fences the renderer,
// so a family that throws produces a **text card with all its buttons**, which
// looks like a design choice. That fence is right and it stays — house rule 11
// — but it means nothing downstream will ever complain. The only place a
// broken layout can be caught is here, before it goes live.
//
// So a save renders the sample through the real renderer and refuses if it
// throws. Not a validation of the fields: an actual render, of the actual
// spec, by the actual function the bot calls.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "../../../lib/db/index.ts";
import { currentStaff } from "../../../lib/admin/session.ts";
import { saveOverride } from "../../../lib/content/store.ts";
import { CARD_FAMILIES } from "../../../lib/discord/screens/index.ts";
import {
  assertLayoutRenders,
  isCardLayout,
  readSettings,
  LayoutRefused,
} from "../../../lib/cards/settings.ts";
import { acceptImage, UploadRefused } from "../../../lib/cards/upload.ts";
import { putImage } from "../../../lib/cards/store.ts";
import { uid } from "../../../lib/core/utils.ts";

const MAX_BYTES = 8 * 1024 * 1024;

function back(params: Record<string, string> = {}): never {
  const qs = new URLSearchParams(params).toString();
  redirect(qs ? `/admin/cards?${qs}` : "/admin/cards");
}

export async function saveCardAction(form: FormData): Promise<void> {
  const staff = await currentStaff();
  if (!staff) redirect("/signup");

  const family = String(form.get("family") ?? "");
  if (!(family in CARD_FAMILIES)) {
    back({ error: `There is no card family called “${family}”.` });
  }

  const layout = String(form.get("layout") ?? "standard");
  if (!isCardLayout(layout)) {
    back({ error: `“${layout}” is not a layout this renderer knows how to draw.`, family });
  }

  const accentRaw = String(form.get("accent") ?? "").trim();
  if (accentRaw && !/^#[0-9a-f]{3,8}$/i.test(accentRaw)) {
    back({ error: "An accent is a hex colour, like #22d3ee.", family });
  }

  // ===== E11 — WEBP IS CONVERTED ON UPLOAD, AT THE SAME DOOR =====
  //
  // `acceptImage` is the rule and `putImage` is the store, and this uses both
  // rather than reimplementing either. `10-SETUP` §8: the renderer cannot
  // decode WebP, and a WebP background is a silently broken card — the fence
  // turns it into text and nobody is told.
  let backgroundUrl = String(form.get("backgroundUrl") ?? "").trim() || null;
  const file = form.get("art");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) {
      back({ error: `That file is larger than ${MAX_BYTES / 1024 / 1024} MB.`, family });
    }
    try {
      const accepted = await acceptImage({
        bytes: new Uint8Array(await file.arrayBuffer()),
        contentType: file.type,
        filename: file.name,
      });
      backgroundUrl = (await putImage(accepted, uid())).url;
    } catch (e) {
      if (e instanceof UploadRefused) back({ error: e.message, family });
      throw e;
    }
  }
  if (String(form.get("clearArt") ?? "") === "on") backgroundUrl = null;

  const settings = readSettings({ layout, accent: accentRaw || null, backgroundUrl });

  // ===== THE RENDER, BEFORE THE WRITE =====
  //
  // The rule lives in `lib/cards/settings.ts` rather than here, for the reason
  // `app/redeem/actions.ts` gives about the $0 refusal: an action that decides
  // anything is an action that can be kinder than the rule, and the next
  // surface that saves a layout would have to remember to decide the same way.
  try {
    await assertLayoutRenders(family, settings);
  } catch (e) {
    if (e instanceof LayoutRefused) back({ error: e.message, family });
    throw e;
  }

  const db = await getDb();
  await saveOverride(db, {
    scope: "card",
    key: family,
    settings: settings as unknown as Record<string, unknown>,
    editedBy: staff.userId,
  });
  revalidatePath("/admin/cards");
  back({ saved: family, family });
}

/** Back to what the code ships. A row, like every other edit (E4). */
export async function clearCardAction(form: FormData): Promise<void> {
  const staff = await currentStaff();
  if (!staff) redirect("/signup");
  const family = String(form.get("family") ?? "");
  const db = await getDb();
  await saveOverride(db, { scope: "card", key: family, settings: null, editedBy: staff.userId });
  revalidatePath("/admin/cards");
  back({ cleared: family, family });
}
