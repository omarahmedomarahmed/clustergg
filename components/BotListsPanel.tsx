"use client";

import { useActionState } from "react";
import Icon from "@/components/Icon";
import { saveBotListKeys, postToBotLists, type BotListActionState } from "@/app/actions/botlists";
import { BOT_LISTS, LIST_STATUSES, VOTE_COOLDOWN_HOURS, botListKeyName, botListStatusName } from "@/lib/botlists";

// Getting Cluster onto the bot lists, and keeping it there.
//
// This is a CHECKLIST as much as a settings page, because the work is mostly
// not code: each list approves the bot on its own terms and only then issues a
// token. So every row carries the submit link, where the token appears once
// you're approved, and where we currently stand with them — otherwise "are we
// on Top.gg yet?" is a question nobody can answer without logging into four
// sites.

export default function BotListsPanel({ values, siteOrigin }: {
  /** Current CMS values, keyed by setting name. */
  values: Record<string, string>;
  /** Where webhooks should point — the live origin, not a guess. */
  siteOrigin: string;
}) {
  const [saveState, save, saving] = useActionState<BotListActionState, FormData>(saveBotListKeys, undefined);
  const [postState, post, posting] = useActionState<BotListActionState, FormData>(postToBotLists, undefined);

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-4">
        <div className="flex items-start gap-2">
          <Icon name="spark" size={16} className="mt-0.5 shrink-0 text-amber-300" />
          <p className="text-xs leading-relaxed text-muted">
            Discord has no app store — <b className="text-ink">bot lists are the discovery layer</b>, and every one
            of them ranks by <b className="text-ink">votes</b>. A person can vote for a bot every{" "}
            {VOTE_COOLDOWN_HOURS} hours, so a bot that gives voters something climbs and a bot that
            doesn&apos;t, doesn&apos;t. Cluster pays a vote in <b className="text-ink">Cluster Points</b>, straight
            into the currency they already care about — the amount is the Signal quest&apos;s weight for
            &ldquo;Vote for Cluster on a bot list&rdquo;, editable in Admin → Quests.
          </p>
        </div>
      </div>

      {/* Every list asks for the command JSON, and every list means the array
          Discord ANSWERS with — not the one we send it. Pasting the
          registration payload is what produces "we were unable to parse your
          discord application command JSON". This link serves the response
          shape, proxied live from Discord when the bot token is set. */}
      <div className="glass rounded-2xl p-4">
        <div className="flex flex-wrap items-start gap-2">
          <Icon name="type" size={16} className="mt-0.5 shrink-0 text-cyan-300" />
          <div className="min-w-0 flex-1">
            <p className="text-xs leading-relaxed text-muted">
              When a list asks you to <b className="text-ink">import your slash commands</b>, give it this
              file. It is the exact array Discord&apos;s API returns for our app — the shape their
              parsers expect. Our registration payload is a different, smaller shape, and pasting that
              is what gets rejected as unparseable.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <a
                href={`${siteOrigin}/api/discord/commands.json`}
                target="_blank" rel="noreferrer"
                className="ghost-btn pressable inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs"
              >
                <Icon name="arrowRight" size={12} /> Open the command JSON
              </a>
              <code className="truncate text-[11px] text-muted">{siteOrigin}/api/discord/commands.json</code>
            </div>
          </div>
        </div>
      </div>

      <form action={save} className="space-y-3">
        {BOT_LISTS.map((list) => {
          const status = values[botListStatusName(list.id)] || "none";
          const hasKey = !!(values[botListKeyName(list.id)] ?? "").trim();
          const webhookUrl = `${siteOrigin}/api/botlist/vote/${list.id}`;
          return (
            <fieldset key={list.id} className="rounded-xl border border-white/10 p-3 space-y-2.5">
              <legend className="px-1.5">
                <span className="text-xs font-semibold text-ink">{list.name}</span>
                {status === "live" && <span className="ml-2 text-[10px] uppercase tracking-wider text-emerald-300">Live</span>}
                {status === "submitted" && <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-300">In review</span>}
              </legend>

              <p className="text-[11px] leading-snug text-muted">{list.note}</p>

              {/* The steps, in the place the work is done.
                  A separate document is a document nobody has open while they
                  are pasting a token, and the order matters: submit first, get
                  approved, THEN the token exists. */}
              <details className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                <summary className="cursor-pointer text-[11px] font-semibold text-cyan-300">
                  How to get listed here, step by step
                </summary>
                <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-[11px] leading-snug text-muted">
                  <li>
                    Make sure the bot is <b className="text-ink">online</b> and{" "}
                    <b className="text-ink">Public Bot is ON</b> in the Discord Developer Portal. A bot that is
                    offline or private during review is declined, and re-submitting goes to the back of the queue.
                  </li>
                  <li>
                    Open <a href={list.submitUrl} target="_blank" rel="noreferrer" className="text-cyan-300 hover:underline">{list.submitUrl}</a>{" "}
                    and paste the <b className="text-ink">Application ID</b> (Developer Portal → General Information).
                  </li>
                  <li>
                    Fill in the description, tags, invite link and support server. Add screenshots of the rendered
                    cards — every list ranks a listing with images above one without.
                  </li>
                  <li>Submit, and wait for their review. They email you either way.</li>
                  <li>
                    Once approved, get the token: <span className="text-ink">{list.keyHint}</span>
                  </li>
                  <li>Paste it below, set <b className="text-ink">Where we stand</b> to Live, and Save.</li>
                  {list.votes && (
                    <li>
                      Invent a long random <b className="text-ink">webhook secret</b>, save it below, then paste{" "}
                      <b className="text-ink">both</b> the webhook URL and that same secret into this list&apos;s
                      webhook settings. Votes then pay CP.
                    </li>
                  )}
                  <li>Press <b className="text-ink">Post now</b> to push the server count immediately.</li>
                </ol>
              </details>

              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <a href={list.submitUrl} target="_blank" rel="noreferrer" className="text-cyan-300 hover:underline inline-flex items-center gap-1">
                  <Icon name="rocket" size={11} /> Submit the bot
                </a>
                <a href={list.site} target="_blank" rel="noreferrer" className="text-muted hover:text-ink">
                  {new URL(list.site).host}
                </a>
              </div>

              <div className="grid sm:grid-cols-[9rem_1fr] gap-2">
                <label className="block">
                  <span className="mb-1 block text-[10px] text-muted">Where we stand</span>
                  <select
                    name={botListStatusName(list.id)}
                    defaultValue={status}
                    className="input-cosmic w-full px-2 py-1 text-xs"
                  >
                    {LIST_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] text-muted">
                    API token {hasKey && <span className="text-emerald-300">· set</span>}
                  </span>
                  <input
                    type="password"
                    name={botListKeyName(list.id)}
                    defaultValue={values[botListKeyName(list.id)] ?? ""}
                    placeholder={list.id === "botblock" ? "No key of its own — it forwards the ones above" : "Paste the token this list gave you"}
                    autoComplete="off"
                    className="input-cosmic w-full px-2 py-1 text-xs"
                  />
                  <span className="mt-1 block text-[10px] leading-snug text-muted">{list.keyHint}</span>
                </label>
              </div>

              {list.votes && (
                <div className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-muted">Vote webhook</div>
                  <code className="mt-1 block select-all break-all text-[11px] text-cyan-300">{webhookUrl}</code>
                  <label className="mt-2 block">
                    <span className="mb-1 block text-[10px] text-muted">
                      Webhook secret — invent one, paste the SAME string into the list
                    </span>
                    <input
                      type="password"
                      name={`botlist.${list.id}.webhook`}
                      defaultValue={values[`botlist.${list.id}.webhook`] ?? ""}
                      placeholder="Anything long and random"
                      autoComplete="off"
                      className="input-cosmic w-full px-2 py-1 text-xs"
                    />
                  </label>
                  <p className="mt-1 text-[10px] leading-snug text-muted">
                    Without it the endpoint refuses every vote — otherwise this URL is &ldquo;give me CP&rdquo;,
                    typed by anyone.
                  </p>
                </div>
              )}
            </fieldset>
          );
        })}

        <div className="flex flex-wrap items-center gap-3">
          <button disabled={saving} className="cta-btn pressable rounded-full px-5 py-1.5 text-xs disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
          {saveState?.ok && <span className="text-[11px] text-emerald-300">{saveState.ok}</span>}
          {saveState?.error && <span className="text-[11px] text-rose-300">{saveState.error}</span>}
        </div>
      </form>

      <form action={post} className="glass rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-ink">Post our server count now</div>
            <p className="mt-0.5 text-[11px] leading-snug text-muted">
              Runs nightly anyway. A stale count is worse than none — a directory showing twelve servers next to a
              bot that is in four hundred is an argument against installing it.
            </p>
          </div>
          <button disabled={posting} className="ghost-btn pressable rounded-full px-4 py-1.5 text-xs disabled:opacity-60">
            {posting ? "Posting…" : "Post now"}
          </button>
        </div>
        {postState?.ok && <p className="mt-2 whitespace-pre-line text-[11px] text-emerald-300">{postState.ok}</p>}
        {postState?.error && <p className="mt-2 whitespace-pre-line text-[11px] text-amber-300">{postState.error}</p>}
      </form>

      <p className="text-[11px] leading-snug text-muted">
        Which list to do first, and what to do when one declines us, is in{" "}
        <code className="text-cyan-300">docs/OPERATIONS.md</code>.
      </p>
    </div>
  );
}
