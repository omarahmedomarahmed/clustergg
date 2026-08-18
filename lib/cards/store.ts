// Where a converted image actually goes.
//
// ===== `acceptImage` DECIDES; THIS STORES. TWO JOBS =====
//
// `upload.ts` holds the rule — nothing that is not PNG or JPEG reaches storage
// — and had no caller for two sprints, which is exactly how a rule ends up
// enforced by nobody. This is the other half: somewhere to put the bytes once
// they are decodable.
//
// ===== THE PRODUCTION BACKEND IS A SEAM, AND DELIBERATELY EMPTY =====
//
// 10 §1 names `BLOB_READ_WRITE_TOKEN`, so the intended production store is
// Vercel Blob. It is **not** written here, and that is a decision rather than
// an omission: nothing in this environment can exercise it, and an integration
// nobody has ever run is the shape of code that looks finished and is not. The
// seam is `setImageBackend`, the deployment step that fills it belongs with
// 10-SETUP, and `imageBackendName()` says which one is live so a deployment
// cannot quietly be storing images in a process that is about to restart.
//
// The demo store is not a stub. The whole build runs against an in-process
// database for the same reason: the flow has to be walkable, and the
// screenshot record has to be able to photograph an upload without anybody
// configuring a bucket first.

import type { StoredImage } from "./upload.ts";

export type PutResult = { id: string; url: string; converted: boolean };
export type ImageBackend = {
  name: string;
  put: (image: StoredImage, id: string) => Promise<{ url: string }>;
};

type Held = { bytes: Uint8Array; contentType: string };

declare global {
  // eslint-disable-next-line no-var
  var __clusterImageStore: Map<string, Held> | undefined;
  // eslint-disable-next-line no-var
  var __clusterImageBackend: ImageBackend | undefined;
}

/** The in-process store. A module-level map would not survive a hot reload. */
function memory(): Map<string, Held> {
  return (globalThis.__clusterImageStore ??= new Map());
}

const IN_PROCESS: ImageBackend = {
  name: "in-process",
  async put(image, id) {
    memory().set(id, { bytes: image.bytes, contentType: image.contentType });
    return { url: `/api/uploads/${id}` };
  },
};

export function setImageBackend(backend: ImageBackend | null): void {
  globalThis.__clusterImageBackend = backend ?? undefined;
}

export function imageBackendName(): string {
  return (globalThis.__clusterImageBackend ?? IN_PROCESS).name;
}

/**
 * Put a converted image somewhere the card renderer can fetch it.
 *
 * Takes a `StoredImage` — the output of `acceptImage` — rather than raw bytes,
 * **so there is no path into storage that skips the conversion.** The type is
 * the gate: a caller holding raw bytes cannot call this at all, which is a
 * stronger guarantee than a check inside it would be.
 */
export async function putImage(image: StoredImage, id: string): Promise<PutResult> {
  const backend = globalThis.__clusterImageBackend ?? IN_PROCESS;
  const { url } = await backend.put(image, id);
  return { id, url, converted: image.converted };
}

export function readImage(id: string): Held | null {
  return memory().get(id) ?? null;
}
