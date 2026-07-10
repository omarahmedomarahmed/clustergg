"use server";

import { redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { slugify, uid } from "@/lib/utils";

export type FormState = { error?: string } | undefined;

export async function register(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (displayName.length < 2) return { error: "Pick a display name (2+ characters)." };

  const db = await getDb();
  const [existing] = await db.select({ id: schema.users.id }).from(schema.users)
    .where(eq(schema.users.email, email)).limit(1);
  if (existing) return { error: "An account with this email already exists." };

  let slug = slugify(displayName);
  const [slugTaken] = await db.select({ id: schema.users.id }).from(schema.users)
    .where(eq(schema.users.slug, slug)).limit(1);
  if (slugTaken) slug = `${slug}-${uid().slice(0, 4).toLowerCase()}`;

  // First user on a fresh database becomes superadmin (bootstrap).
  const [{ c }] = await db.select({ c: count() }).from(schema.users);
  const role = Number(c) === 0 ? "superadmin" : "user";

  const id = uid();
  await db.insert(schema.users).values({
    id, email, passwordHash: hashPassword(password), displayName, slug,
    role, primarySignupProvider: "email", lastLoginAt: new Date(),
  });
  await createSession(id, role);
  redirect("/onboarding");
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user?.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return { error: "Invalid email or password." };
  }
  if (user.status !== "active") return { error: "This account is suspended." };
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  await createSession(user.id, user.role);
  redirect("/feed");
}

export async function logout() {
  await destroySession();
  redirect("/");
}
