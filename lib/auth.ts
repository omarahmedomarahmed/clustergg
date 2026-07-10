import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "cluster-demo-secret-set-AUTH_SECRET-in-production"
);
const COOKIE = "cluster_session";

export { hashPassword, verifyPassword } from "@/lib/password";

export type SessionPayload = { uid: string; role: string };

export async function createSession(userId: string, role: string) {
  const token = await new SignJWT({ uid: userId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export const getSession = cache(async (): Promise<SessionPayload | null> => {
  try {
    const store = await cookies();
    const token = store.get(COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, SECRET);
    if (typeof payload.uid !== "string") return null;
    return { uid: payload.uid, role: (payload.role as string) ?? "user" };
  } catch {
    return null;
  }
});

export type CurrentUser = typeof schema.users.$inferSelect;

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;
  const db = await getDb();
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, session.uid)).limit(1);
  const user = rows[0] ?? null;
  if (user && user.status !== "active") return null;
  return user;
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

export function isAdmin(user: { role: string } | null): boolean {
  return !!user && (user.role === "admin" || user.role === "superadmin");
}

// Staff can access the admin portal for moderation (spaces, challenges) and
// read-only views; full CRUD elsewhere requires admin/superadmin.
export function isStaff(user: { role: string } | null): boolean {
  return !!user && (user.role === "staff" || isAdmin(user));
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) throw new Error("FORBIDDEN");
  return user;
}

export async function requireStaff(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) throw new Error("FORBIDDEN");
  return user;
}
