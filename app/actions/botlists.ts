"use server";

import { revalidatePath } from "next/cache";
import { requireSystemFor } from "@/lib/departments";
import { setContent } from "@/lib/cms";
import { BOT_LISTS, botListKeyName, botListStatusName } from "@/lib/botlists";
import { postBotListStats } from "@/lib/botlist-post";

export type BotListActionState = { ok?: string; error?: string } | undefined;

// Saving the bot-list tokens, and pushing the count on demand.
//
// The tokens are secrets and are stored the same way every other platform
// secret is: in settings, editable by staff, never in the repository. Getting
// listed is an operational task with a human on the other end of it, and the
// code's job is to be ready the moment somebody pastes a token in.

export async function saveBotListKeys(_prev: BotListActionState, fd: FormData): Promise<BotListActionState> {
  await requireSystemFor("/admin/discord");

  let keys = 0;
  let hooks = 0;
  for (const list of BOT_LISTS) {
    const key = String(fd.get(botListKeyName(list.id)) ?? "").trim();
    const status = String(fd.get(botListStatusName(list.id)) ?? "none").trim();
    const hook = String(fd.get(`botlist.${list.id}.webhook`) ?? "").trim();

    await setContent(botListKeyName(list.id), key);
    await setContent(botListStatusName(list.id), status);
    // Only lists that send vote webhooks have the field on the form; writing an
    // empty string for the others would be harmless but noisy.
    if (list.votes) await setContent(`botlist.${list.id}.webhook`, hook);

    if (key) keys++;
    if (hook) hooks++;
  }

  revalidatePath("/admin/discord");
  return {
    ok: `Saved. ${keys} list${keys === 1 ? "" : "s"} with a token, ${hooks} vote webhook${hooks === 1 ? "" : "s"} configured.`,
  };
}

/**
 * Push the server count now, and report per list.
 *
 * Per list, because "3 of 5 succeeded" is not actionable: a rejected token, a
 * bot that hasn't been approved yet and a directory that is simply down all
 * need different responses, and each list says which in its own words.
 */
export async function postToBotLists(_prev: BotListActionState): Promise<BotListActionState> {
  await requireSystemFor("/admin/discord");
  const r = await postBotListStats();

  const lines = r.results.map((x) =>
    `${x.ok ? "✓" : x.skipped ? "·" : "✗"} ${x.name} — ${x.detail}`);
  const head = `${r.guilds} server${r.guilds === 1 ? "" : "s"} · ${r.posted} updated`
    + (r.failed ? ` · ${r.failed} failed` : "")
    + (r.skipped ? ` · ${r.skipped} not set up` : "");

  revalidatePath("/admin/discord");
  const body = `${head}\n${lines.join("\n")}`;
  return r.failed ? { error: body } : { ok: body };
}
