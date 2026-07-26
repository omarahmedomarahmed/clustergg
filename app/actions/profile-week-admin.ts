"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { setContent } from "@/lib/cms";
import {
  FREEZE_KEY, PODIUM_TROPHY_KEY, STREAM_LIVE_KEY, STREAM_URL_KEY,
  closeWeek, recordWeekAction, reopenWeek, setWeekStream,
} from "@/lib/profile-week";
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
  refresh();
  const names = res.podium.map((p, i) => `#${i + 1} ${p.displayName}`).join(" · ");
  return { ok: `Called. ${names}${res.trophies ? ` — ${res.trophies} trophies awarded` : " — no podium trophy configured"}.` };
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

  const trophyId = String(fd.get("trophyId") ?? "").trim();
  if (trophyId) {
    const db = await getDb();
    const [t] = await db.select({ id: schema.trophies.id }).from(schema.trophies)
      .where(eq(schema.trophies.id, trophyId)).limit(1);
    if (!t) return fail("That trophy no longer exists.");
  }

  const frozen = fd.get("freeze") === "on" || fd.get("freeze") === "1";
  try {
    await setContent(WEEK_TZ_KEY, tz);
    await setContent(FREEZE_KEY, frozen ? "1" : "0");
    await setContent(PODIUM_TROPHY_KEY, trophyId);
  } catch { return fail("Couldn't save the settings."); }

  refresh();
  const now = weekAt(new Date(), tz || "UTC");
  return { ok: `Saved. Current week is ${now.key} (${now.phase === "voting" ? "voting" : "announcement day"}).` };
}
