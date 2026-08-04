"use server";

import { revalidatePath } from "next/cache";
import { requireSystemFor } from "@/lib/departments";
import { saveShot } from "@/lib/shots-data";
import { SHOT_REGISTRY } from "@/lib/shots";

export type ShotActionState = { ok?: boolean; error?: string; message?: string } | undefined;

/**
 * Replace a shot's image, or rewrite the words under it.
 *
 * Both halves matter and both are here on purpose. The screenshot is evidence;
 * the caption and the alt text are the claim that evidence supports. An admin
 * who can swap the picture but not the sentence can only half-fix a stale page —
 * and the sentence goes stale first, because copy changes more often than
 * screenshots do.
 *
 * Every field is optional. Submitting the caption alone leaves the image
 * untouched, so fixing a typo never costs a re-upload.
 */
export async function saveFeatureShot(_prev: ShotActionState, formData: FormData): Promise<ShotActionState> {
  // Gated by the same path rule the console page uses, so a department granted
  // the screenshots system can edit them and nobody else can — one definition of
  // who may touch this, not two that can drift apart.
  const admin = await requireSystemFor("/admin/shots");
  const key = String(formData.get("key") ?? "").trim();
  if (!key) return { error: "No shot key." };
  // The registry is the allow-list. Without this an arbitrary key could be
  // written and would then sit in the table forever with nothing rendering it.
  if (!SHOT_REGISTRY.some((s) => s.key === key)) return { error: `“${key}” is not a registered shot key.` };

  const str = (f: string) => {
    const v = formData.get(f);
    return v == null ? undefined : String(v).trim();
  };
  const num = (f: string) => {
    const v = formData.get(f);
    if (v == null || String(v).trim() === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
  };

  // An empty image field means "clear it", which is a real thing an admin wants
  // — a screenshot of a screen that no longer exists is worse than a
  // placeholder saying one is missing.
  const image = str("imageUrl");

  try {
    await saveShot(key, {
      imageUrl: image === undefined ? undefined : (image || null),
      altText: str("altText"),
      caption: str("caption"),
      claim: str("claim"),
      capturedFrom: str("capturedFrom"),
      width: num("width"),
      height: num("height"),
      updatedBy: admin.user.id,
      // An admin uploading a replacement HAS re-shot it, so the "captured"
      // stamp moves. Editing only the caption does not touch it.
      markCaptured: !!image,
    });
  } catch (e) {
    return { error: `Couldn't save: ${String(e).slice(0, 200)}` };
  }

  // Every page that claims this component, which is the entire point — one edit,
  // everywhere. There is no reverse index to walk, so the whole layout is
  // revalidated; shots change rarely enough that this is cheap.
  revalidatePath("/", "layout");
  return { ok: true, message: image ? "Screenshot replaced everywhere it appears." : "Saved." };
}
