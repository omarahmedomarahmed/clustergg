"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { uploadDataUrlToBlob } from "@/lib/blob";
import { replaceUrlEverywhere, deleteUrlEverywhere, delBlobObject } from "@/lib/storage-audit";

// Replace one stored image with its browser-compressed version: upload the new
// (smaller) image to Blob, repoint EVERY reference from the old URL to the new
// one, then delete the old Blob object. The client does the pixel compression
// (canvas); this only stores + rewires + deletes — so the big originals stop
// counting toward Vercel Blob data transfer.
export async function recompressImage(input: { oldUrl: string; dataUrl: string; name?: string }): Promise<{ ok?: true; error?: string; newUrl?: string; bytes?: number; replaced?: number }> {
  await requireStaff();
  const { oldUrl, dataUrl } = input;
  if (!oldUrl || !dataUrl?.startsWith("data:image/")) return { error: "bad input" };
  const scope = (input.name || "recompressed").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 40) || "recompressed";
  const newUrl = await uploadDataUrlToBlob(dataUrl, scope);
  if (!newUrl) return { error: "Blob not configured — cannot store the compressed image." };
  if (newUrl === oldUrl) return { ok: true, newUrl, replaced: 0 };
  const replaced = await replaceUrlEverywhere(oldUrl, newUrl);
  await delBlobObject(oldUrl); // free the old (big) object's storage + transfer
  const bytes = Math.round((dataUrl.length * 3) / 4);
  revalidatePath("/", "layout");
  return { ok: true, newUrl, bytes, replaced };
}

// Bulk delete: wipe references and remove the Blob objects. Used as the fallback
// when an image should just be removed rather than replaced.
export async function deleteImages(urls: string[]): Promise<{ ok?: true; removed: number }> {
  await requireStaff();
  let removed = 0;
  for (const url of [...new Set(urls)].slice(0, 500)) {
    await deleteUrlEverywhere(url);
    if (await delBlobObject(url)) removed++;
  }
  revalidatePath("/", "layout");
  revalidatePath("/admin/storage");
  return { ok: true, removed };
}
