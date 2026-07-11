import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

// Symmetric encryption for provider tokens at rest (AES-256-GCM), keyed off
// AUTH_SECRET. Stored tokens are only used server-side by the sync engine.
const KEY = createHash("sha256")
  .update(process.env.AUTH_SECRET ?? "cluster-demo-secret")
  .digest();

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptSecret(blob: string): string | null {
  try {
    const [ivHex, tagHex, dataHex] = blob.split(":");
    if (!ivHex || !tagHex || !dataHex) return null;
    const decipher = createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
