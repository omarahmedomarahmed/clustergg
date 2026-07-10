import { scryptSync, timingSafeEqual, randomBytes } from "crypto";
import bcrypt from "bcryptjs";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// Supports both native scrypt hashes (salt:hex) and bcrypt hashes ($2a$/$2b$/$2y$),
// so externally generated admin credentials can be seeded directly.
export function verifyPassword(password: string, stored: string): boolean {
  if (/^\$2[aby]\$/.test(stored)) {
    try { return bcrypt.compareSync(password, stored); } catch { return false; }
  }
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}
