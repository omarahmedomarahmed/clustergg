/**
 * ONBOARDING ONLY EVER GOES FORWARDS. G1.
 *
 * ===== THE DEFECT =====
 *
 * `UNLOCKED` carried `steps: []`. `unlockedAt` is set only when all three steps
 * are done and is never unset, so an unlocked account has by definition done all
 * three — but the empty list said the opposite to every surface that reads the
 * list rather than the boolean:
 *
 *   app/onboarding/page.tsx   `step("link")?.done` finds nothing in an empty
 *                             array, so all three rendered as NOT DONE. A gamer
 *                             who had just finished was shown the whole of
 *                             onboarding again — a live six-digit-code form for
 *                             an address they had confirmed, and a live age
 *                             selector on an account whose age is answered once
 *                             and which they are told they cannot change.
 *   lib/discord/screens.ts    the unlock card counted zero and listed nothing.
 *   components/OnboardingBar  `total = steps.length` → 0, and `done/total` NaN.
 *
 * ===== WHY THIS SUITE IS SHAPED LIKE THIS =====
 *
 * The bug is invisible from any single sequence. It appears the moment the LAST
 * step completes, whichever step that happens to be — so a test that walks the
 * steps in the obvious order (link, email, profile) sees it only at the very
 * end, and a test that stops one step short never sees it at all. My own first
 * reproduction ran link-then-email and reported "not reproduced".
 *
 * So the invariant is asserted over EVERY ORDER: six permutations, four
 * observations each, and no step's `done` may ever go from true back to false.
 * That is a property of onboarding rather than a fact about one screen, and it
 * holds whatever anybody adds to `unlockState` later.
 *
 *   DEMO_DB=1 npx tsx tests/db/unlock-monotonic.mts
 */
process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = <T,>(name: string, got: T, want: T) =>
  ok(name, got === want, `got ${String(got)}, want ${String(want)}`);

const { unlockState, stepsFor, UNLOCK_STEPS } = await import("../../lib/unlock.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");

const db = await getDb();

type StepKey = "link" | "email" | "profile";
const KEYS: StepKey[] = ["link", "email", "profile"];

/** A gamer who has done nothing at all. */
async function freshGamer(): Promise<string> {
  const id = uid();
  await db.insert(schema.users).values({
    id,
    displayName: "Monotonic Test",
    slug: `mono-${id.slice(0, 8).toLowerCase()}`,
    email: `mono-${id.slice(0, 8).toLowerCase()}@example.com`,
  });
  return id;
}

/** Complete one step, at the level the product completes it. */
async function complete(userId: string, key: StepKey): Promise<void> {
  if (key === "link") {
    await db.insert(schema.linkedGameAccounts).values({
      id: uid(), userId, provider: "chesscom",
      providerAccountId: `acct-${uid().slice(0, 8)}`, inGameName: "monotonic",
    });
  } else if (key === "email") {
    await db.update(schema.users).set({ emailVerifiedAt: new Date() }).where(sqlEq(schema.users.id, userId));
  } else {
    // All three answers at once, which is how the one button saves them.
    await db.update(schema.users)
      .set({ country: "US", ageBand: "adult", theme: { template: "cosmic" } })
      .where(sqlEq(schema.users.id, userId));
  }
}

/** What each step reports right now. A step missing from the list is NOT done. */
async function observe(userId: string): Promise<Record<StepKey, boolean> & { unlocked: boolean; n: number }> {
  const st = await unlockState(db, userId);
  const seen = new Map(st.steps.map((s) => [s.key, s.done]));
  return {
    link: seen.get("link") ?? false,
    email: seen.get("email") ?? false,
    profile: seen.get("profile") ?? false,
    unlocked: st.unlocked,
    n: st.steps.length,
  };
}

const permutations = <T,>(xs: T[]): T[][] =>
  xs.length <= 1 ? [xs] : xs.flatMap((x, i) =>
    permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]));

console.log("== a step never goes from done back to not-done, in ANY order ==");
{
  let regressions = 0;
  let shrinks = 0;
  for (const order of permutations(KEYS)) {
    const userId = await freshGamer();
    let prev = await observe(userId);

    for (const key of order) {
      await complete(userId, key);
      const now = await observe(userId);

      for (const k of KEYS) {
        if (prev[k] && !now[k]) {
          regressions++;
          console.log(`  FAIL [${order.join(">")}] after completing "${key}", step "${k}" went done -> NOT done`);
        }
      }
      // The list itself must never shrink either: an empty list is how the
      // original defect expressed itself, and "every step reports false" and
      // "there are no steps" are the same thing to every caller.
      if (now.n < UNLOCK_STEPS) {
        shrinks++;
        console.log(`  FAIL [${order.join(">")}] after completing "${key}", steps.length was ${now.n}, want ${UNLOCK_STEPS}`);
      }
      prev = now;
    }

    // Having done all three, the account is finished — and says so.
    ok(`[${order.join(" > ")}] ends unlocked with all three done`,
      prev.unlocked && prev.link && prev.email && prev.profile,
      JSON.stringify(prev));

    await db.delete(schema.linkedGameAccounts).where(sqlEq(schema.linkedGameAccounts.userId, userId));
    await db.delete(schema.users).where(sqlEq(schema.users.id, userId));
  }
  eq("no step regressed in any of the six orders", regressions, 0);
  eq("the step list never shrank", shrinks, 0);
}

console.log("== and a finished account describes itself completely ==");
{
  // THE EXACT G1 SHAPE. `unlockedAt` implies all three, so the finished state
  // has to SAY all three — a caller reading the list must not have to know that
  // `unlocked: true` overrides it.
  const userId = await freshGamer();
  for (const k of KEYS) await complete(userId, k);
  const st = await unlockState(db, userId);

  ok("unlocked", st.unlocked);
  eq("…and reports every step", st.steps.length, UNLOCK_STEPS);
  ok("…all of them done", st.steps.every((s) => s.done), JSON.stringify(st.steps.map((s) => [s.key, s.done])));
  ok("…with the same keys the locked state uses",
    st.steps.map((s) => s.key).join(",") === stepsFor({ linked: false, email: false, profile: false }).map((s) => s.key).join(","));

  // A shared array handed to every caller is one mutation away from being
  // everybody's problem, so each call gets its own.
  const again = await unlockState(db, userId);
  ok("each call gets its own array", st.steps !== again.steps);

  await db.delete(schema.linkedGameAccounts).where(sqlEq(schema.linkedGameAccounts.userId, userId));
  await db.delete(schema.users).where(sqlEq(schema.users.id, userId));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  - ${f}`); process.exit(1); }
