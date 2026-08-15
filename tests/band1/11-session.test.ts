// Sessions.
//
// The property worth proving is not "a cookie round-trips". It is that the
// cookie carries no fact of its own: everything a request decides is read from
// the database behind the session id. The age band is the one that matters —
// support can correct it, and a cookie that cached it would keep paying out
// against a correction until it expired.

import { ok, eq, no } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema } from "../../lib/db/index.ts";
import { createGamer, setAgeBand } from "../../lib/identity/gamers.ts";
import { createSession, sessionUser, endSession, seal, unseal } from "../../lib/auth/session.ts";
import { eq as sqlEq } from "drizzle-orm";

test("a cookie is signed, and a tampered one is nobody", () => {
  const sealed = seal("session-abc");
  eq(unseal(sealed), "session-abc", "a valid cookie yields its session id");
  eq(unseal("session-abc.notasignature"), null, "a forged signature yields nothing");
  eq(unseal("session-abd." + sealed.split(".")[1]), null, "so does a swapped id");
  eq(unseal(""), null, "and so does an empty cookie");
  eq(unseal(null), null, "and no cookie at all");
});

test("the cookie carries an id and nothing else", () => {
  const sealed = seal("session-abc");
  const [id, sig] = sealed.split(".");
  eq(id, "session-abc", "the payload is the session id");
  ok(sig.length > 0, "followed by a signature");
  eq(sealed.split(".").length, 2, "and there is no third field to smuggle a claim into");
});

test("a session resolves to the gamer, reading the age band live", async () => {
  const db = await resetDemoDb();
  const id = await createGamer(db, { displayName: "Session Holder" });
  const cookie = await createSession(db, id);

  const before = await sessionUser(db, cookie);
  ok(before !== null, "the cookie resolves to a gamer");
  eq(before.ageBand, null, "who has not answered the age band yet");

  await setAgeBand(db, id, "adult");

  const after = await sessionUser(db, cookie);
  eq(after?.ageBand, "adult", "the same cookie now reads the new band — nothing was cached in it");
});

test("an expired session is nobody", async () => {
  const db = await resetDemoDb();
  const id = await createGamer(db, { displayName: "Expired" });
  const cookie = await createSession(db, id);
  const sessionId = unseal(cookie);
  ok(sessionId !== null, "the cookie is well formed to begin with");

  await db
    .update(schema.sessions)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(sqlEq(schema.sessions.id, sessionId));

  eq(await sessionUser(db, cookie), null, "and expiry makes it resolve to nobody");
});

test("a deleted account is nobody, cookie or not", async () => {
  const db = await resetDemoDb();
  const id = await createGamer(db, { displayName: "Gone" });
  const cookie = await createSession(db, id);
  ok((await sessionUser(db, cookie)) !== null, "resolves while the account is active");

  await db
    .update(schema.users)
    .set({ status: "deleted" })
    .where(sqlEq(schema.users.id, id));

  eq(await sessionUser(db, cookie), null, "and not once the account is gone");
});

test("signing out ends the session", async () => {
  const db = await resetDemoDb();
  const id = await createGamer(db, { displayName: "Leaving" });
  const cookie = await createSession(db, id);
  await endSession(db, cookie);
  eq(await sessionUser(db, cookie), null, "the cookie is worthless afterwards");
  const rows = await db.select().from(schema.sessions);
  no(rows.length > 0, "and the row is gone, not merely ignored");
});
