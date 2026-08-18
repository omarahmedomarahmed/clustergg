// Runs once, when a server runtime starts. Next calls this itself.
//
// ===== THIS FILE IS THE ANSWER TO "WHAT READS IT?" =====
//
// The production image backend is a seam. A seam with an implementation and no
// caller is `setImageBackend` in exactly the state that took production down
// last time: written, correct, and run by nobody. Next.js calls `register()`
// on every runtime boot, so this is the one place where "installed on every
// deploy" is a fact rather than an intention.
//
// Nothing else belongs here. It is not a place to warm caches or open
// connections — `getDb()` is lazy on purpose, and a boot hook that opens a
// pool makes every cold start pay for a request that may never come.

export async function register(): Promise<void> {
  // Node only. The edge runtime has no Blob client and no reason to store an
  // image, and importing it there would fail the build rather than this hook.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { installBlobBackend } = await import("./lib/cards/blob.ts");
  const { imageBackendName } = await import("./lib/cards/store.ts");

  installBlobBackend();
  // Which store is live, said out loud once per boot. A deployment quietly
  // holding card images in a process that is about to restart is the failure
  // this line exists to make impossible to miss in a log.
  console.log(`[cluster] image backend: ${imageBackendName()}`);
}
