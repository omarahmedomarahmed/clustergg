"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { setContent } from "@/lib/cms";
import {
  FREEZE_KEY, PODIUM_TROPHY_KEYS, STREAM_LIVE_KEY, STREAM_URL_KEY,
  closeWeek, recordWeekAction, reopenWeek, setWeekStream,
} from "@/lib/profile-week";
import { announceWeekWinners, postWeekUpdate } from "@/lib/discord/week-feed";
import { WEEK_TZ_KEY, weekAt } from "@/lib/week";

// Running the competition.
//
// Everything here is staff-only and everything here is logged. Adding votes,
// removing votes and disqualifying a gamer are all real interventions in a
// public contest, so none of them edit the votes themselves — each one files a
// row in `vote_week_actions` with who did it and why, and the standings are
// recomputed from votes + actions on every read. That means a correction shows
// up immediately, an unfair one can be traced, and "the leaderboard changed and
// nobody knows why" is not a state this system can reach.

export type WeekAdminState = { ok?: string; error?: string } | undefined;

const fail = (error: string): WeekAdminState => ({ error });

function refresh() {
  try {
    revalidatePath("/admin/profile-week");
    // The band is on every page, so the whole site is showing this board.
    revalidatePath("/", "layout");
  } catch { /* the write stands whether or not a cache refresh worked */ }
}

async function staff(): Promise<{ id: string } | null> {
  try { return await requireStaff(); } catch { return null; }
}

const weekKeyOf = (fd: FormData) => String(fd.get("weekKey") ?? "").trim();

// ===== Per-gamer interventions =====

/** Add or remove votes from one gamer's week, with a reason. */
export async function adjustWeekVotes(_prev: WeekAdminState, fd: FormData): Promise<WeekAdminState> {
  const me = await staff();
  if (!me) return fail("Staff only.");

  const weekKey = weekKeyOf(fd);
  const userId = String(fd.get("userId") ?? "").trim();
  const delta = Math.trunc(Number(fd.get("delta") ?? 0));
  const reason = String(fd.get("reason") ?? "").trim();

  if (!weekKey || !userId) return fail("Missing gamer or week.");
  if (!Number.isFinite(delta) || delta === 0) return fail("Enter how many votes to add or remove.");
  if (Math.abs(delta) > 100000) return fail("That's not a plausible adjustment.");
  // A number with no reason beside it is indistinguishable from tampering when
  // somebody reads this back in three months.
  if (reason.length < 3) return fail("Say why — this goes in the audit trail.");

  const ok = await recordWeekAction({ weekKey, profileUserId: userId, action: "adjust", delta, reason, actorId: me.id });
  if (!ok) return fail("Couldn't record that adjustment.");
  refresh();
  return { ok: `${delta > 0 ? "+" : ""}${delta} votes recorded.` };
}

/** Take a gamer out of this week's running, or put them back. */
export async function setWeekDisqualified(_prev: WeekAdminState, fd: FormData): Promise<WeekAdminState> {
  const me = await staff();
  if (!me) return fail("Staff only.");

  const weekKey = weekKeyOf(fd);
  const userId = String(fd.get("userId") ?? "").trim();
  const action = String(fd.get("action") ?? "") === "reinstate" ? "reinstate" : "disqualify";
  const reason = String(fd.get("reason") ?? "").trim();

  if (!weekKey || !userId) return fail("Missing gamer or week.");
  if (action === "disqualify" && reason.length < 3) return fail("Disqualifying somebody needs a reason.");

  const ok = await recordWeekAction({ weekKey, profileUserId: userId, action, reason, actorId: me.id });
  if (!ok) return fail("Couldn't record that.");
  refresh();
  return { ok: action === "disqualify" ? "Disqualified for this week." : "Back in the running." };
}

// ===== Sunday =====

/** The announcement stream, per week: the link, and whether it's live now. */
export async function saveWeekStream(_prev: WeekAdminState, fd: FormData): Promise<WeekAdminState> {
  const me = await staff();
  if (!me) return fail("Staff only.");

  const weekKey = weekKeyOf(fd);
  if (!weekKey) return fail("Missing week.");
  const raw = String(fd.get("url") ?? "").trim();
  const live = fd.get("live") === "on" || fd.get("live") === "1";

  let url: string | null = null;
  if (raw) {
    // Only real web links: the band embeds this, and an embed pointed at
    // `javascript:` or a data URL is a script-injection hole in the nav bar.
    let parsed: URL | null = null;
    try { parsed = new URL(raw); } catch { return fail("That doesn't look like a link."); }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return fail("Use an http(s) link.");
    url = parsed.toString().slice(0, 500);
  }
  if (live && !url) return fail("Add the stream link before going live.");

  const ok = await setWeekStream(weekKey, url, live);
  if (!ok) return fail("Couldn't save the stream.");
  // The CMS copies are the fallback the band reads when a week has no row of
  // its own, so keeping them in step stops a stale link outliving its week.
  try {
    await setContent(STREAM_URL_KEY, url ?? "");
    await setContent(STREAM_LIVE_KEY, live ? "1" : "0");
  } catch { /* the week row is the source of truth */ }

  refresh();
  return { ok: live ? "Live — the stream is on every page." : url ? "Stream link saved." : "Stream cleared." };
}

/** Call the week: freeze the podium, award the trophies, tell the winners. */
export async function closeWeekNow(_prev: WeekAdminState, fd: FormData): Promise<WeekAdminState> {
  const me = await staff();
  if (!me) return fail("Staff only.");
  const weekKey = weekKeyOf(fd);
  if (!weekKey) return fail("Missing week.");

  const res = await closeWeek(weekKey, me.id);
  if (!res.ok) {
    return fail(res.reason === "no_entries"
      ? "Nobody has a vote this week — there's no podium to call."
      : "Couldn't close the week.");
  }

  // Straight out to every server running the bot. Calling the week IS the
  // announcement, so it shouldn't need a second button — and the post is keyed
  // on the week, so calling it twice announces it once.
  let told = 0;
  try { told = (await announceWeekWinners(weekKey)).posted; }
  catch { /* the result stands whether or not Discord was reachable */ }

  refresh();
  const names = res.podium.map((p, i) => `#${i + 1} ${p.displayName}`).join(" · ");
  return {
    ok: `Called. ${names}${res.trophies ? ` — ${res.trophies} trophies awarded` : " — no podium trophy configured"}`
      + `${told ? ` · announced in ${told} server${told === 1 ? "" : "s"}` : ""}.`,
  };
}

/** Re-post the winners, for a server that joined after the announcement went out. */
export async function announceWeekAgain(_prev: WeekAdminState, fd: FormData): Promise<WeekAdminState> {
  const me = await staff();
  if (!me) return fail("Staff only.");
  const weekKey = weekKeyOf(fd);
  if (!weekKey) return fail("Missing week.");

  const res = await announceWeekWinners(weekKey, { force: true });
  if (!res.considered) return fail("No server has the bot with announcements on yet.");
  if (!res.posted) return fail("Nothing was announced — has this week been called?");
  return { ok: `Announced in ${res.posted} server${res.posted === 1 ? "" : "s"}.` };
}

/** Push today's standings to every server now, rather than waiting for the cron. */
export async function postWeekUpdateNow(_prev: WeekAdminState, fd: FormData): Promise<WeekAdminState> {
  const me = await staff();
  if (!me) return fail("Staff only.");
  // Forced, because a human pressing this means "send it now" — the once-a-day
  // rule exists to stop the cron double-posting, not to overrule staff.
  const res = await postWeekUpdate({ force: fd.get("force") === "1" });
  if (!res.considered) return fail("No server has the bot with announcements on yet.");
  return {
    ok: res.posted
      ? `Posted into ${res.posted} server${res.posted === 1 ? "" : "s"}.`
      : "Every server already had today's update — tick Force to send it again.",
  };
}

/** Undo a close, for when the wrong week gets called mid-stream. */
export async function reopenWeekNow(_prev: WeekAdminState, fd: FormData): Promise<WeekAdminState> {
  const me = await staff();
  if (!me) return fail("Staff only.");
  const weekKey = weekKeyOf(fd);
  if (!weekKey) return fail("Missing week.");

  const ok = await reopenWeek(weekKey);
  if (!ok) return fail("Couldn't reopen the week.");
  await recordWeekAction({
    weekKey, profileUserId: me.id, action: "adjust", delta: 0,
    reason: "Week reopened — the recorded result was cleared.", actorId: me.id,
  });
  refresh();
  return { ok: "Reopened. Trophies already awarded stay awarded — pull them in Users if that's wrong." };
}

// ===== Competition settings =====

/** The clock, the Sunday rule, and the trophy the podium wins. */
export async function saveWeekSettings(_prev: WeekAdminState, fd: FormData): Promise<WeekAdminState> {
  const me = await staff();
  if (!me) return fail("Staff only.");

  const tz = String(fd.get("timezone") ?? "").trim();
  if (tz) {
    // Checked here rather than at read time: a bad zone silently falls back to
    // UTC everywhere, which looks like the week boundary moved on its own.
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date()); }
    catch { return fail(`"${tz}" isn't a timezone. Use an IANA name like Africa/Cairo.`); }
  }

  // One trophy per place (B51). Validated before ANY of them is written, so a
  // typo in third place cannot leave first and second saved and third not —
  // half-saved podium settings are the kind of thing nobody notices until a
  // week closes wrong.
  const prizeIds = ["trophyId", "trophyId2", "trophyId3"].map((k) => String(fd.get(k) ?? "").trim());
  const wanted = prizeIds.filter(Boolean);
  if (wanted.length) {
    const db = await getDb();
    const rows = await db.select({ id: schema.trophies.id }).from(schema.trophies)
      .where(inArray(schema.trophies.id, wanted));
    const known = new Set(rows.map((r) => r.id));
    const missing = wanted.find((id) => !known.has(id));
    if (missing) return fail("One of those trophies no longer exists.");
  }

  const frozen = fd.get("freeze") === "on" || fd.get("freeze") === "1";
  try {
    await setContent(WEEK_TZ_KEY, tz);
    await setContent(FREEZE_KEY, frozen ? "1" : "0");
    for (const [i, key] of PODIUM_TROPHY_KEYS.entries()) await setContent(key, prizeIds[i] ?? "");
  } catch { return fail("Couldn't save the settings."); }

  refresh();
  const now = weekAt(new Date(), tz || "UTC");
  return { ok: `Saved. Current week is ${now.key} (${now.phase === "voting" ? "voting" : "announcement day"}).` };
}
