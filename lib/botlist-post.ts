import { eq, count } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getContent } from "@/lib/cms";
import { appId } from "@/lib/discord/config";
import { BOT_LISTS, BOT_LIST_CMS_KEYS, botListKeyName, type BotList } from "@/lib/botlists";

// Telling the bot lists how many servers we're in.
//
// Server count is a ranking signal on every list, and a stale one is worse than
// none: a directory showing "12 servers" next to a bot that is in four hundred
// is an argument against installing it. This runs on the same daily cron as
// everything else periodic.
//
// Nothing here throws. A list that is down, has rotated our token, or has
// changed its API must not take the cron with it — the other lists still need
// posting, and the failure needs REPORTING rather than swallowing, which is why
// every attempt comes back with its own outcome.

export type PostOutcome = {
  id: string;
  name: string;
  /** No key configured — not a failure, just not set up yet. */
  skipped: boolean;
  ok: boolean;
  status: number;
  detail: string;
};

export type PostReport = {
  guilds: number;
  results: PostOutcome[];
  posted: number;
  failed: number;
  skipped: number;
};

/** How many servers the bot is actually in, right now. */
export async function liveGuildCount(): Promise<number> {
  try {
    const db = await getDb();
    const [row] = await db.select({ n: count() }).from(schema.discordGuilds)
      .where(eq(schema.discordGuilds.status, "active"));
    return Number(row?.n ?? 0);
  } catch {
    return 0;
  }
}

function body(list: BotList, id: string, guilds: number): Record<string, unknown> {
  // BotBlock is the odd one: the bot id goes in the body, and it carries every
  // OTHER list's key so it can fan the post out to the long tail.
  if (list.id === "botblock") return { bot_id: id, server_count: guilds };
  return { [list.countField]: guilds, ...(list.extra ?? {}) };
}

/**
 * Post the count to every list we hold a key for.
 *
 * A list with no key is SKIPPED, not failed. The distinction is the whole
 * point of this report: "we never set that one up" and "that one rejected us"
 * are different problems with different fixes, and a single number hides both.
 */
export async function postBotListStats(): Promise<PostReport> {
  const id = appId();
  const guilds = await liveGuildCount();
  const keys = await getContent(BOT_LIST_CMS_KEYS).catch(() => ({} as Record<string, string>));

  const results: PostOutcome[] = [];
  for (const list of BOT_LISTS) {
    const key = (keys[botListKeyName(list.id)] ?? "").trim();
    const base: Omit<PostOutcome, "ok" | "status" | "detail"> = {
      id: list.id, name: list.name, skipped: false,
    };

    if (!list.postUrl) {
      results.push({ ...base, skipped: true, ok: false, status: 0, detail: "No posting API — listing only." });
      continue;
    }
    if (!key && list.id !== "botblock") {
      results.push({ ...base, skipped: true, ok: false, status: 0, detail: "No API key set." });
      continue;
    }
    if (!id) {
      results.push({ ...base, skipped: true, ok: false, status: 0, detail: "No Discord application id configured." });
      continue;
    }

    // BotBlock needs at least one other key to be worth calling.
    const carried: Record<string, string> = {};
    if (list.id === "botblock") {
      for (const other of BOT_LISTS) {
        if (other.id === "botblock") continue;
        const k = (keys[botListKeyName(other.id)] ?? "").trim();
        if (k) carried[new URL(other.site).host] = k;
      }
      if (!Object.keys(carried).length) {
        results.push({ ...base, skipped: true, ok: false, status: 0, detail: "Nothing to forward — no other list keys set." });
        continue;
      }
    }

    const url = list.postUrl.replace("{id}", id);
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (list.authHeader && key) headers[list.authHeader] = `${list.authPrefix ?? ""}${key}`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...body(list, id, guilds), ...carried }),
        // A directory that hangs must not hold the cron open.
        signal: AbortSignal.timeout(8000),
      });
      const text = await res.text().catch(() => "");
      results.push({
        ...base,
        ok: res.ok,
        status: res.status,
        detail: res.ok
          ? `Posted ${guilds} server${guilds === 1 ? "" : "s"}.`
          // The list's own words, trimmed. A 401 that says "invalid token" and a
          // 401 that says "bot not approved yet" need different actions.
          : `${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 140)}` : ""}`,
      });
    } catch (e) {
      results.push({ ...base, ok: false, status: 0, detail: `Couldn't reach it: ${String(e).slice(0, 100)}` });
    }
  }

  return {
    guilds,
    results,
    posted: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok && !r.skipped).length,
    skipped: results.filter((r) => r.skipped).length,
  };
}
