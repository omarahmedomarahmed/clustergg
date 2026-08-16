// Opt-in server analytics — 12 §7a.
//
// An owner hands us read access to their member list in exchange for their own
// dashboard. They choose, and if they never do, nothing about their earning or
// their pool position changes.
//
// The rule the whole feature rests on is N9/S2 — **no weekly-cycle figure may
// read a snapshot** — and it is guarded in `70-pool` and inside the four-week
// simulation rather than here, because that is where the money is. What this
// file guards is the consent itself: that it is permanent, that the cooldown is
// on the guild and not the session, that the ceiling holds everybody at once,
// and that no number is ever shown without its date.

import { ok, eq, no, throws } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema, type DB } from "../../lib/db/index.ts";
import {
  analyticsView,
  AnalyticsRefused,
  ANALYTICS_NOTICES,
  BASE_COOLDOWN_MS,
  consentFor,
  cooldownForLoad,
  DEFAULT_DAILY_PULL_CEILING,
  grantAnalytics,
  lastSnapshot,
  pullCeiling,
  pullsInWindow,
  refreshSnapshot,
  refreshState,
  setPullCeiling,
} from "../../lib/analytics/consent.ts";
import { uid } from "../../lib/core/utils.ts";
import { eq as sqlEq } from "drizzle-orm";

const NOW = new Date("2026-09-09T12:00:00Z");
const OWNER = "111111111111111111";

const reading = (over: Partial<{ memberCount: number; linkedCount: number }> = {}) =>
  async () => ({ memberCount: 4200, linkedCount: 61, ...over });

// ── The grant ───────────────────────────────────────────────────────────────

test("before the grant the tab exists and is empty, with what they would get", async () => {
  // N2 — the tab is not hidden. An owner who cannot see what they are being
  // offered cannot meaningfully consent to it.
  const db = await resetDemoDb();
  await aGuild(db);

  const view = await analyticsView(db, "g1", NOW);
  no(view.granted, "not granted");
  eq(view.snapshot, null, "and nothing to show");
  no(view.refresh.allowed, "Update does nothing yet");
  eq(!view.refresh.allowed && view.refresh.code, "not_granted", "and says which of the three reasons");
  ok(
    !view.refresh.allowed && /Allow analytics/.test(view.refresh.reason),
    "naming the button that changes it",
  );
});

test("the grant is permanent per server and survives a sign-out", async () => {
  // N1 — granted once, does not expire. Signing out changes nothing: the bot
  // keeps its access and we keep the snapshot. There is no session column on
  // the row, which is what makes this structural rather than a promise.
  const db = await resetDemoDb();
  await aGuild(db);
  await grantAnalytics(db, { guildId: "g1", grantedBy: OWNER }, NOW);

  const consent = await consentFor(db, "g1");
  ok(consent !== null, "granted");
  eq(consent!.grantedBy, OWNER, "and consent has an author");

  // There is nowhere for a session to live on this row, so nothing a sign-out
  // could clear. Asserted as a property of the columns rather than by
  // simulating a sign-out, because the claim *is* about the columns.
  const columns = Object.keys(consent!);
  eq(
    columns.filter((c) => /session|token|expires/i.test(c)),
    [],
    "no session, no token, no expiry — a grant that expired with a login is not a grant",
  );

  // ===== AND THROUGH THE PATH WHERE IT COULD ACTUALLY GO WRONG =====
  //
  // `granted` reads the row, so a grant expired **in code** rather than by a
  // column would leave it true and this test green. Break 144 did exactly
  // that: it aged the consent out inside `refreshState`, and every assertion
  // above still passed. The claim is not "a row exists a year later" — it is
  // that a year-old grant still works.
  const later = new Date(NOW.getTime() + 365 * 24 * 60 * 60 * 1000);
  const view = await analyticsView(db, "g1", later);
  ok(view.granted, "a year later it is still granted");
  ok(view.refresh.allowed, "and Update still works, which is what the grant is for");
});

test("granting twice does not re-date the consent or clear a cooldown", async () => {
  // The button is on the page after the grant too. If pressing it again reset
  // anything, it would be a way around N7 that costs one extra click.
  const db = await resetDemoDb();
  await aGuild(db);
  await grantAnalytics(db, { guildId: "g1", grantedBy: OWNER }, NOW);
  await refreshSnapshot(db, { guildId: "g1", takenBy: OWNER, read: reading() }, NOW);

  const before = await consentFor(db, "g1");
  await grantAnalytics(db, { guildId: "g1", grantedBy: "somebody-else" }, new Date(NOW.getTime() + 60_000));
  const after = await consentFor(db, "g1");

  eq(after!.grantedAt.getTime(), before!.grantedAt.getTime(), "the grant keeps its date");
  eq(after!.grantedBy, OWNER, "and its author");
  eq(
    after!.cooldownUntil?.getTime(),
    before!.cooldownUntil?.getTime(),
    "and the cooldown is untouched",
  );
});

// ── The cooldown ────────────────────────────────────────────────────────────

test("the cooldown is on the guild, so signing out and back in does not reset it", async () => {
  // N7, and the mutation 09 asks the band to catch: *put the analytics
  // cooldown on the session instead of the guild.*
  const db = await resetDemoDb();
  await aGuild(db);
  await grantAnalytics(db, { guildId: "g1", grantedBy: OWNER }, NOW);
  await refreshSnapshot(db, { guildId: "g1", takenBy: OWNER, read: reading() }, NOW);

  const soon = new Date(NOW.getTime() + 60_000);
  const held = await refreshState(db, "g1", soon);
  no(held.allowed, "a second refresh a minute later is held");
  eq(!held.allowed && held.code, "cooldown", "by the cooldown");

  // A different person entirely — a second administrator, a fresh session, a
  // different browser. The wait is on the server, so it is the same wait.
  const heldForAnyone = await refreshState(db, "g1", soon);
  eq(
    !heldForAnyone.allowed && heldForAnyone.until?.getTime(),
    !held.allowed ? held.until?.getTime() : undefined,
    "and it is the same wait for anybody who opens the page",
  );
  ok(
    !held.allowed && /on the server, not on you/.test(held.reason),
    "and the page says so, because an owner who thinks it is about them will try again",
  );

  // And it lifts.
  const later = new Date(NOW.getTime() + BASE_COOLDOWN_MS + 1000);
  ok((await refreshState(db, "g1", later)).allowed, "an hour later it lifts");
});

test("the refusal is a refusal, and the snapshot is still readable through it", async () => {
  // N6 — the last snapshot is **always readable**. It is data we already hold;
  // only Update costs a call. Hiding it during the cooldown would make the
  // wait feel like a punishment and push owners to refresh the instant it
  // lifts, which is the opposite of what the ceiling is for.
  const db = await resetDemoDb();
  await aGuild(db);
  await grantAnalytics(db, { guildId: "g1", grantedBy: OWNER }, NOW);
  await refreshSnapshot(db, { guildId: "g1", takenBy: OWNER, read: reading() }, NOW);

  const soon = new Date(NOW.getTime() + 60_000);
  await throws(
    () => refreshSnapshot(db, { guildId: "g1", takenBy: OWNER, read: reading() }, soon),
    /refreshed recently/,
    "the pull is refused",
  );
  eq((await db.select().from(schema.guildSnapshots)).length, 1, "and no second call was made");

  const view = await analyticsView(db, "g1", soon);
  ok(view.snapshot !== null, "the snapshot still reads");
  eq(view.takenAt?.getTime(), NOW.getTime(), "dated at the moment it was taken");
});

test("nothing is ever shown without its date", async () => {
  // S1 — every row carries `takenAt`, and is never displayed without it. A
  // stale snapshot presented as current is worse than no snapshot, because it
  // gets acted on.
  const db = await resetDemoDb();
  await aGuild(db);
  await grantAnalytics(db, { guildId: "g1", grantedBy: OWNER }, NOW);
  await refreshSnapshot(db, { guildId: "g1", takenBy: OWNER, read: reading() }, NOW);

  const snapshot = await lastSnapshot(db, "g1");
  ok(snapshot!.takenAt instanceof Date, "the row carries a date");
  eq(snapshot!.takenBy, OWNER, "and who took it");

  const view = await analyticsView(db, "g1", NOW);
  ok(
    view.snapshot !== null && view.takenAt !== null,
    "and the view cannot hand a page a snapshot without one — they arrive together",
  );
});

test("the newest snapshot is the one that reads", async () => {
  const db = await resetDemoDb();
  await aGuild(db);
  await grantAnalytics(db, { guildId: "g1", grantedBy: OWNER }, NOW);
  await refreshSnapshot(db, { guildId: "g1", takenBy: OWNER, read: reading({ linkedCount: 10 }) }, NOW);

  const later = new Date(NOW.getTime() + BASE_COOLDOWN_MS + 1000);
  await refreshSnapshot(db, { guildId: "g1", takenBy: OWNER, read: reading({ linkedCount: 61 }) }, later);

  const snapshot = await lastSnapshot(db, "g1");
  eq(snapshot!.linkedCount, 61, "the newest reading");
  eq(snapshot!.takenAt.getTime(), later.getTime(), "with its own date");
  eq(
    (await db.select().from(schema.guildSnapshots)).length,
    2,
    "and the older one is kept — a snapshot is a reading, not a cache",
  );
});

// ── The ceiling ─────────────────────────────────────────────────────────────

test("the ceiling is a setting, not a constant", async () => {
  // PLAN §5's one number. 12 §7a N8 requires a ceiling and gives no figure, so
  // it is ours — and admin must be able to lower it the day Discord tightens
  // something, without a deploy.
  const db = await resetDemoDb();
  eq(await pullCeiling(db), DEFAULT_DAILY_PULL_CEILING, "a named default when nothing is set");

  await setPullCeiling(db, 12, "admin-1", NOW);
  eq(await pullCeiling(db), 12, "and the setting wins");

  const [row] = await db
    .select()
    .from(schema.settings)
    .where(sqlEq(schema.settings.key, "analytics.dailyPullCeiling"));
  eq(row.updatedBy, "admin-1", "logged against who changed it");
});

test("the ceiling lengthens every server's cooldown at once, not just the one that hit it", async () => {
  // N8 — as the platform approaches Discord's limit the wait grows
  // *everywhere*. Not a hard stop at the limit and free below it: that would
  // let the first servers to press Update spend the whole budget and leave the
  // rest at a wall.
  eq(cooldownForLoad(0, 100), BASE_COOLDOWN_MS, "an idle platform: the base wait");
  ok(cooldownForLoad(60, 100) > cooldownForLoad(10, 100), "past half full, everybody waits longer");
  ok(cooldownForLoad(90, 100) > cooldownForLoad(60, 100), "and longer again");
  ok(cooldownForLoad(120, 100) > cooldownForLoad(90, 100), "and longest when it is over");
});

test("a server held by the ceiling is told it is not about them, and when", async () => {
  const db = await resetDemoDb();
  await aGuild(db);
  await aGuild(db, "g2");
  await setPullCeiling(db, 2, "admin-1", NOW);
  await grantAnalytics(db, { guildId: "g1", grantedBy: OWNER }, NOW);
  await grantAnalytics(db, { guildId: "g2", grantedBy: OWNER }, NOW);

  // Two pulls by other servers fill the platform's day.
  for (let i = 0; i < 2; i++) {
    await db.insert(schema.guildSnapshots).values({
      id: uid(),
      guildId: "someone-else",
      takenAt: new Date(NOW.getTime() - 1000 * (i + 1)),
      memberCount: 10,
      linkedCount: 1,
    });
  }
  eq(await pullsInWindow(db, NOW), 2, "the platform has spent its day");

  const held = await refreshState(db, "g1", NOW);
  no(held.allowed, "g1 is held");
  eq(!held.allowed && held.code, "ceiling", "by the ceiling, not by its own cooldown");
  ok(!held.allowed && /not about your server/.test(held.reason), "and told it is not about them");
  ok(!held.allowed && held.until !== null, "and when they can try");

  // The point of N8: it holds a server that has never refreshed at all.
  const g2 = await refreshState(db, "g2", NOW);
  eq(!g2.allowed && g2.code, "ceiling", "including one that has never pressed Update");

  // A day later the window has rolled and both are free.
  const tomorrow = new Date(NOW.getTime() + 25 * 60 * 60 * 1000);
  ok((await refreshState(db, "g1", tomorrow)).allowed, "and it lifts when the window rolls");
});

test("a refusal by the ceiling costs no call", async () => {
  // The negative half that matters operationally: a ceiling that still made
  // the request is not a ceiling.
  const db = await resetDemoDb();
  await aGuild(db);
  await setPullCeiling(db, 1, "admin-1", NOW);
  await grantAnalytics(db, { guildId: "g1", grantedBy: OWNER }, NOW);
  await db.insert(schema.guildSnapshots).values({
    id: uid(),
    guildId: "someone-else",
    takenAt: new Date(NOW.getTime() - 1000),
    memberCount: 10,
    linkedCount: 1,
  });

  let called = 0;
  const err = await throws(
    () =>
      refreshSnapshot(
        db,
        {
          guildId: "g1",
          takenBy: OWNER,
          read: async () => {
            called++;
            return { memberCount: 1, linkedCount: 1 };
          },
        },
        NOW,
      ),
    /daily limit/,
    "refused",
  );
  ok(err instanceof AnalyticsRefused, "by name");
  eq(called, 0, "and the member list was never read");
});

test("an ungranted server cannot be snapshotted at all", async () => {
  // The gate is ours, not Discord's — the GUILD_MEMBERS intent is app-wide, so
  // nothing outside this check stops a read.
  const db = await resetDemoDb();
  await aGuild(db);
  let called = 0;
  await throws(
    () =>
      refreshSnapshot(
        db,
        {
          guildId: "g1",
          takenBy: OWNER,
          read: async () => {
            called++;
            return { memberCount: 1, linkedCount: 1 };
          },
        },
        NOW,
      ),
    /Allow analytics/,
    "refused, and told how to change it",
  );
  eq(called, 0, "and their member list was not read");
});

// ── What the page must say ──────────────────────────────────────────────────

test("the page says we do not read this, and never that we cannot", async () => {
  // ===== THE SENTENCE WITH A TRAP IN IT =====
  //
  // The GUILD_MEMBERS intent is **app-wide**: one switch, every guild, no
  // per-guild control. So per-server consent is *our* gate, kept in code, and
  // "we cannot read your member list" would be a promise the architecture
  // cannot keep. 12 §7a is explicit about the wording.
  ok(/do not read/.test(ANALYTICS_NOTICES.scope), "we do not read it");
  no(/cannot read|can't read|unable to read/.test(ANALYTICS_NOTICES.scope), "never that we cannot");
  ok(
    /not for scoring|not for the pool|not for eligibility/.test(ANALYTICS_NOTICES.scope),
    "and it names what it is not used for, which is the claim S2 makes true",
  );

  // N3 — the warning, in plain words.
  ok(/looking over your shoulder/.test(ANALYTICS_NOTICES.sensitive), "the shoulder-surfing warning");
  // 12 §7a — read only, and the page says so.
  ok(/read only/i.test(ANALYTICS_NOTICES.readOnly), "and that it is read only");
  ok(
    /cannot manage your server/.test(ANALYTICS_NOTICES.readOnly),
    "which we can say because the bot never asks for the permission to",
  );
});

// ── Fixtures ────────────────────────────────────────────────────────────────

async function aGuild(db: DB, guildId = "g1") {
  await db.insert(schema.guilds).values({
    guildId,
    name: `Server ${guildId}`,
    slug: `server-${guildId}`,
    memberCount: 4200,
    ownerDiscordId: OWNER,
    community: "A competitive gaming community.",
    announceChannelId: `chan-${guildId}`,
    memberAgeRange: "18-24",
    gamesPlayed: ["Chess"],
    inviteUrl: `https://discord.gg/${guildId}`,
    coverImageUrl: `https://cdn.test/${guildId}.png`,
  });
}
