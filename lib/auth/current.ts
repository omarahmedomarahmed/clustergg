// The current gamer, for a server component or a server action.
//
// Split from `lib/auth/session.ts` on purpose: that module is pure enough to
// be exercised by the test band with a database handle and no request. This
// one reaches for `next/headers` and can only run inside a request, so nothing
// in the logic band has to fake one.

import { cookies } from "next/headers";
import { getDb } from "../db/index.ts";
import { SESSION_COOKIE, sessionUser, createSession, endSession, SESSION_TTL_MS } from "./session.ts";
import { unlockState, type UnlockState } from "../identity/unlock.ts";

export async function currentGamer() {
  const jar = await cookies();
  const db = await getDb();
  return sessionUser(db, jar.get(SESSION_COOKIE)?.value);
}

/** The gamer and their derived onboarding state, which is what most screens need. */
export async function currentGamerWithUnlock(): Promise<
  { gamer: Awaited<ReturnType<typeof currentGamer>>; unlock: UnlockState | null }
> {
  const gamer = await currentGamer();
  if (!gamer) return { gamer: null, unlock: null };
  const db = await getDb();
  return { gamer, unlock: await unlockState(db, gamer.id) };
}

export async function signIn(userId: string): Promise<void> {
  const db = await getDb();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSession(db, userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function signOut(): Promise<void> {
  const db = await getDb();
  const jar = await cookies();
  await endSession(db, jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
}
