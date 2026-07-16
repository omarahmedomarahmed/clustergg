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

// The two heaviest user columns are `bannerUrl` (can be a base64 data URL when
// Vercel Blob isn't configured) and `theme` (a JSONB profile-builder blob).
// `getCurrentUser` runs on EVERY request (Nav, layout, most pages) but almost
// none of them render the banner or the theme — only the profile editor and the
// public profile page do, and the public page fetches its own target row. So we
// project every OTHER column here and leave `bannerUrl`/`theme` out of the
// per-request fetch. This alone removes megabytes of Neon data-transfer per page
// view on databases whose avatars/banners are stored inline. Pages that truly
// need the banner/theme call `getCurrentUserFull()`.
const LIGHT_USER_COLUMNS = {
  id: schema.users.id,
  email: schema.users.email,
  passwordHash: schema.users.passwordHash,
  displayName: schema.users.displayName,
  slug: schema.users.slug,
  avatarUrl: schema.users.avatarUrl,
  bio: schema.users.bio,
  country: schema.users.country,
  title: schema.users.title,
  role: schema.users.role,
  status: schema.users.status,
  isVerified: schema.users.isVerified,
  primarySignupProvider: schema.users.primarySignupProvider,
  discordUsername: schema.users.discordUsername,
  profileViews: schema.users.profileViews,
  profileVisibility: schema.users.profileVisibility,
  allowMessagesFrom: schema.users.allowMessagesFrom,
  emailNotifications: schema.users.emailNotifications,
  createdAt: schema.users.createdAt,
  lastLoginAt: schema.users.lastLoginAt,
} as const;

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;
  const db = await getDb();
  const rows = await db.select(LIGHT_USER_COLUMNS).from(schema.users)
    .where(eq(schema.users.id, session.uid)).limit(1);
  const row = rows[0] ?? null;
  if (!row) return null;
  if (row.status !== "active") return null;
  // Fill the omitted heavy columns with safe placeholders so the returned shape
  // still matches `CurrentUser` for callers that reference them structurally.
  return { ...row, bannerUrl: null, theme: {} } as CurrentUser;
});

// Full row incl. bannerUrl + theme — only for the profile editor. Not cached
// with the light fetch so the two never collide.
export const getCurrentUserFull = cache(async (): Promise<CurrentUser | null> => {
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
