"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { slugify, uid } from "@/lib/utils";

/**
 * The address a signup came from. B80.
 *
 * Read from the proxy headers Vercel sets, first entry of `x-forwarded-for`
 * only — the rest of that header is whatever the client sent and is trivially
 * forged, so trusting it would hand an attacker a fresh "address" per request.
 * Null on any failure: a velocity guard that cannot read an address must let
 * the signup through, the same way the rest of `lib/abuse.ts` fails open.
 */
async function signupAddress(): Promise<string | null> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    const first = fwd?.split(",")[0]?.trim();
    return first || h.get("x-real-ip") || null;
  } catch { return null; }
}

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

  // B95. Somebody who told us they were under 13 had their account deleted; the
  // only thing kept was a hash of this address, precisely so the next signup ten
  // seconds later does not undo the whole thing.
  {
    const { isSignupBlocked, BLOCKED_SIGNUP_MESSAGE } = await import("@/lib/under13");
    if (await isSignupBlocked(db, { email })) return { error: BLOCKED_SIGNUP_MESSAGE };
  }

  let slug = slugify(displayName);
  const [slugTaken] = await db.select({ id: schema.users.id }).from(schema.users)
    .where(eq(schema.users.slug, slug)).limit(1);
  if (slugTaken) slug = `${slug}-${uid().slice(0, 4).toLowerCase()}`;

  // Defence 3 (B35): make fifty accounts feel like work.
  //
  // A FRICTION, never a wall. It refuses only on the count from a disposable
  // email domain — a mainstream domain is not a source, because "ten gmail
  // signups today" is a Tuesday and refusing the eleventh refuses a real gamer
  // for somebody else's behaviour. It also fails open: what it protects is
  // tidiness, and what failing closed costs is customers.
  //
  // B80: the ADDRESS is passed now. It was not, so the guard's IP branch could
  // never trip and an attacker using gmail aliases paid nothing per account.
  const ip = await signupAddress();
  {
    const { signupVelocity } = await import("@/lib/abuse");
    const v = await signupVelocity(db, { email, ip });
    if (!v.ok) return { error: v.message };
  }

  // Bootstrap, bound to SETUP_TOKEN rather than to being early (B104).
  //
  // This was `count() === 0 ? "superadmin" : "user"`, which handed full admin
  // to whoever signed up first on a fresh deployment — a race anybody who found
  // the domain could enter. The operator now names the address through
  // `/api/setup`, which already requires the token. See `lib/bootstrap.ts`.
  const { bootstrapRoleFor } = await import("@/lib/bootstrap");
  const role = await bootstrapRoleFor(db, email);

  const id = uid();
  await db.insert(schema.users).values({
    id, email, passwordHash: hashPassword(password), displayName, slug,
    role, primarySignupProvider: "email", lastLoginAt: new Date(),
    signupIp: ip,
  });
  // The code goes out with the account, not when they get round to asking for
  // it. B98 — they typed the address ten seconds ago; making them press a
  // button to have it used is a step that exists only because nobody wired it
  // up. Never blocks: a mail provider having a bad afternoon must not stop an
  // account being created.
  try {
    const { autoSendSignupCode } = await import("@/lib/email-verify");
    await autoSendSignupCode(db, id);
  } catch { /* the page has a "send it again" button */ }

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
