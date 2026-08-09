// The way out, the mark, and the code that sends itself. B95/B96/B98.
//
// Three features that all exist because of one question — "how old is the
// person behind this account, and what may we do about it" — and every
// assertion here is about a case that cannot be apologised for afterwards.
//
// The one this file exists for is in the middle: a deleted under-13 account
// cannot be made again. Keeping nothing after a deletion is the comfortable
// answer and it makes the whole feature pointless, so we keep a hash and this
// proves it works and proves what it is.
//
//   DEMO_DB=1 npx tsx tests/db/under13.mts

process.env.DEMO_DB = "1";

import { readFileSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const code = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");

const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq, sql } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const { deleteForUnderThirteen, isSignupBlocked, blockHash, MIN_ACCOUNT_AGE } =
  await import("../../lib/under13.ts");
const { markFor } = await import("../../lib/verified-mark.ts");
const { maskEmail } = await import("../../lib/email-verify.ts");

const db = await getDb();
const tag = uid().slice(0, 8);

const mkGamer = async (email: string) => {
  const id = uid();
  await db.insert(schema.users).values({
    id, email, displayName: `U13 ${id.slice(0, 4)}`,
    slug: `u13-${tag}-${id.slice(0, 6)}`, passwordHash: "x", ageBand: "teen",
  });
  return id;
};

console.log("== confirming under-13 deletes the account ==");
{
  const email = `kid-${tag}@ob.test`;
  const id = await mkGamer(email);

  // Give them something worth losing, because the promise being tested is that
  // we delete it anyway. There is no version of this where a child's data stays
  // because they had four hundred points.
  const [quest] = await db.select().from(schema.quests).limit(1);
  await db.insert(schema.questEvents).values({
    id: uid(), userId: id, questId: quest.id, actionKey: "manual",
    qpAwarded: 0, cpAwarded: 4000, refType: "seed", refId: "u13",
  });
  await db.insert(schema.linkedGameAccounts).values({
    id: uid(), userId: id, provider: "chesscom",
    providerAccountId: `u13-${uid().slice(0, 8)}`, inGameName: "x", verified: true,
  });

  const res = await deleteForUnderThirteen(db, id);
  ok("the deletion succeeds", res.ok === true, JSON.stringify(res));

  const [row] = await db.select({ n: sql<number>`count(*)` })
    .from(schema.users).where(sqlEq(schema.users.id, id));
  eq("the account is gone", Number(row.n), 0);

  // Asserted rather than assumed, and it is how the missing cascades were
  // found: quest_events has no foreign key, so deleting the user left every
  // one of these rows behind. The claim made to the person on the way out is
  // "everything", so this checks everything.
  const [ev] = await db.select({ n: sql<number>`count(*)` })
    .from(schema.questEvents).where(sqlEq(schema.questEvents.userId, id));
  eq("…and so is everything hanging off it", Number(ev.n), 0);
}

console.log("\n== and they cannot make it again ==");
{
  const email = `again-${tag}@ob.test`;
  const id = await mkGamer(email);
  await db.insert(schema.oauthIdentities).values({
    id: uid(), userId: id, provider: "discord", providerUserId: `disc-${tag}`,
  });

  ok("before: this email could sign up", !(await isSignupBlocked(db, { email })));
  await deleteForUnderThirteen(db, id);

  // THE ASSERTION THIS FILE EXISTS FOR. Both identifiers, because somebody who
  // is blocked on email and not on Discord is not blocked.
  ok("after: the email is blocked", await isSignupBlocked(db, { email }));
  ok("…and so is the Discord account", await isSignupBlocked(db, { discordId: `disc-${tag}` }));
  ok("…and the block is case-insensitive on the address",
    await isSignupBlocked(db, { email: email.toUpperCase() }));
  ok("somebody else is not blocked", !(await isSignupBlocked(db, { email: `other-${tag}@ob.test` })));
  ok("…and nothing at all is not a block", !(await isSignupBlocked(db, {})));
}

console.log("\n== what survives is a hash and nothing else ==");
{
  const email = `hash-${tag}@ob.test`;
  const id = await mkGamer(email);
  await deleteForUnderThirteen(db, id);

  const rows = await db.select().from(schema.blockedSignups)
    .where(sqlEq(schema.blockedSignups.keyHash, blockHash("email", email)));
  eq("one row per identifier", rows.length, 1);

  // The row is READ to prove what it does not contain. A table that keeps a
  // child's address in clear because somebody wrote `value` instead of
  // `keyHash` would pass every other test in this file.
  const dump = JSON.stringify(rows[0]).toLowerCase();
  ok("the address is not in it", !dump.includes(email.toLowerCase()));
  ok("the local part is not in it either", !dump.includes(`hash-${tag}`));
  ok("nor is a name, a band or an age", !/displayname|ageband|adult|teen|under1[67]/.test(dump));
  eq("the reason is one word", rows[0].reason, "under13");
  ok("the hash is a sha-256", /^[0-9a-f]{64}$/.test(rows[0].keyHash));
  ok("…and it is salted, so it is not a bare digest of the address",
    rows[0].keyHash !== (await import("node:crypto")).createHash("sha256").update(email).digest("hex"));
}

console.log("\n== the signup doors read the block list ==");
{
  ok("the email signup checks it", /isSignupBlocked/.test(code("app/actions/auth.ts")));
  ok("the OAuth signup checks it",
    /isSignupBlocked/.test(code("app/api/auth/[provider]/callback/route.ts")));
  // It must be checked where an account is CREATED, not where one signs in —
  // blocking the sign-in path would lock somebody out of an account we already
  // decided they may have.
  const cb = code("app/api/auth/[provider]/callback/route.ts");
  ok("…at the create step, not the sign-in step",
    cb.indexOf("isSignupBlocked") > cb.indexOf("Known identity"));
  ok("the message does not accuse the reader of anything",
    !/you told us|twelve|your age/i.test(
      (await import("../../lib/under13.ts")).BLOCKED_SIGNUP_MESSAGE));
  eq("the line is 13", MIN_ACCOUNT_AGE, 13);
}

console.log("\n== under-13 is not a band, anywhere ==");
{
  const { AGE_BANDS, parseBand } = await import("../../lib/age.ts");
  ok("it is not selectable", !(AGE_BANDS as readonly string[]).includes("under13"));
  eq("it cannot be stored", parseBand("under13"), null);
  // A picker with three options teaches a twelve-year-old to press one of the
  // other two. The way out is a link, and it deletes.
  const picker = code("components/onboarding/ProfileStep.tsx");
  ok("the picker offers exactly two ages",
    /"adult"/.test(picker) && /"teen"/.test(picker) && !/under13/.test(picker));
  const way = code("components/onboarding/UnderThirteen.tsx");
  ok("…and the way out asks for a typed confirmation", /DELETE/.test(way));
  ok("…and says what it destroys before it destroys it",
    /delete your account/i.test(way) && /cannot be undone/i.test(way));
}

console.log("\n== the mark is a colour, never a number ==");
{
  const adult = markFor({ ageBand: "adult", unlockedAt: new Date(), showAgeMark: true });
  const teen = markFor({ ageBand: "teen", unlockedAt: new Date(), showAgeMark: true });
  ok("18+ is gold", adult?.tone === "gold");
  ok("13-17 is a different colour", teen?.tone === "cyan" && teen.color !== adult?.color);
  ok("both say the same thing on hover", adult?.title === teen?.title);
  ok("…and what they say is not an age",
    !/18|13|17|adult|teen|age/i.test(`${adult?.title} ${teen?.title}`), String(adult?.title));

  ok("an unfinished account has no mark", markFor({ ageBand: "adult", unlockedAt: null }) === null);
  ok("a hidden mark is nothing at all, not a grey one",
    markFor({ ageBand: "adult", unlockedAt: new Date(), showAgeMark: false }) === null);
  ok("the legacy bottom band earns no mark",
    markFor({ ageBand: "under16", unlockedAt: new Date(), showAgeMark: true }) === null);

  // The card is the surface that gets posted in public channels, so the check
  // that it never prints a band matters more there than anywhere.
  const card = code("lib/cards/render.tsx");
  ok("the card draws the tick from the mark's colour", /d\.mark/.test(card));
  ok("…and never writes the band out", !/13-17|13 to 17|18\+/.test(card));
  ok("…and draws it as geometry rather than a glyph that might be missing",
    /function Tick/.test(card) && !/✓/.test(card));

  // Hideable in one place, applied everywhere, because two switches would drift
  // and the day they disagree somebody's age is public against their wishes.
  ok("one switch turns it off", /showAgeMark/.test(code("app/actions/connections.ts")));
  ok("…and it lives with the other privacy settings",
    /showAgeMark/.test(code("app/settings/privacy/page.tsx")));
}

console.log("\n== the code sends itself, and the address is masked ==");
{
  ok("the email signup sends one", /autoSendSignupCode/.test(code("app/actions/auth.ts")));
  ok("the Discord signup sends one too",
    /autoSendSignupCode/.test(code("app/api/auth/[provider]/callback/route.ts")));
  ok("…and neither can fail the signup",
    /catch \{[^}]*\}/.test(code("app/actions/auth.ts")));

  const m = maskEmail("gamer.name@gmail.com");
  ok("the mask keeps enough to recognise", m.startsWith("ga") && m.endsWith(".com"), m);
  ok("…and not enough to retype", !m.includes("gamer.name") && !m.includes("gmail"), m);
  eq("junk masks to nothing rather than to junk", maskEmail("not-an-email"), "");
  eq("…and so does nothing", maskEmail(null), "");

  ok("the page shows the masked one", /masked/.test(code("app/onboarding/page.tsx")));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
