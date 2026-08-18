// The production image backend: Vercel Blob.
//
// ===== WHY THIS EXISTS NOW AND NOT TWO SPRINTS AGO =====
//
// `store.ts` left `setImageBackend` deliberately empty, with the reason
// written down: *"nothing in this environment can exercise it, and an
// integration nobody has ever run is the shape of code that looks finished and
// is not."* That has stopped being true — there is a real token and a real
// store — so it is written, and it is proven by putting bytes in and reading
// the same bytes back over HTTPS.
//
// ===== THE FENCE PROBLEM, WHICH IS TRAP 31 =====
//
// A card that renders and cannot store fails the same way the card renderer
// failed for a whole sprint: a `try` swallowed the error, the decoration went
// missing, and every test still passed because nothing asserted the *bytes*.
// So `installBlobBackend` does **not** swallow. If a put fails, it throws, and
// the caller decides — which for artwork is house rule 11's fence at the call
// site, and for a deliberate upload is a refusal the person can read.
//
// Nothing here reads a secret from anywhere but `process.env`, and the token
// is never logged: `blobConfigured()` reports presence, never the value.

import type { ImageBackend } from "./store.ts";
import { setImageBackend } from "./store.ts";

/**
 * Is the production store configured?
 *
 * Reported as a boolean, deliberately. `/admin/preflight` needs to say
 * "present" or "missing" and must never be able to print the token itself.
 */
export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function blobBackend(): ImageBackend {
  return {
    name: "vercel-blob",
    async put(image, id) {
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      if (!token) {
        throw new Error(
          "BLOB_READ_WRITE_TOKEN is not set, so there is nowhere to put this " +
            "image. Refusing rather than storing it in a process that restarts.",
        );
      }
      const { put } = await import("@vercel/blob");
      // `addRandomSuffix: false` — the id is already unique and the card
      // renderer fetches by the URL it was handed. A suffix would make the
      // stored name unpredictable, which is fine until somebody needs to find
      // an object again from an id in the database.
      const result = await put(`cards/${id}`, Buffer.from(image.bytes), {
        access: "public",
        contentType: image.contentType,
        token,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return { url: result.url };
    },
  };
}

/**
 * Install the production backend when there is a token, and say whether it
 * happened.
 *
 * Returns a boolean rather than throwing on a missing token: a demo run has no
 * token and must keep the in-process store, and that is not an error. What
 * would be an error is a *deployment* silently doing the same, which is why
 * `/admin/preflight` shows `imageBackendName()` rather than assuming.
 */
export function installBlobBackend(): boolean {
  if (!blobConfigured()) return false;
  setImageBackend(blobBackend());
  return true;
}
