"use client";

import { useActionState, useState } from "react";
import { purgeSocialContent, type SocialPurgeState } from "@/app/actions/admin";

// The button that destroys what people wrote. B111.
//
// The feature is gone from the product; the rows are not, on purpose. Dropping
// them in a migration would delete every post anybody ever wrote on the next
// deploy, as a side effect of shipping something else, with nothing shown first
// and no way back. This is what that decision looks like when it is taken
// deliberately instead.
//
// THREE THINGS THAT MAKE IT A REAL CONFIRMATION rather than the shape of one:
//
//   * The COUNT is on the page, beside the box, before anything is typed. A
//     dialog that cannot say "12,431 posts" is a dialog people click through.
//   * The word is typed, not clicked. A second button is a second click.
//   * The button stays disabled until the word matches, so the confirmation is
//     the action rather than a step in front of it.

export default function SocialPurgePanel({ counts }: {
  counts: { table: string; rows: number }[];
}) {
  const [state, act, busy] = useActionState<SocialPurgeState, FormData>(purgeSocialContent, {});
  const [typed, setTyped] = useState("");
  const total = counts.reduce((n, c) => n + c.rows, 0);
  const armed = typed.trim() === "DELETE";

  return (
    <section className="rounded-2xl border border-rose-400/30 bg-rose-500/5 p-5">
      <h2 className="text-lg font-bold text-rose-200">Posts, comments and reactions</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted leading-relaxed">
        The feature is gone — no composer, no feed, no moderation queue, and nothing writes another
        one. The rows are still here, because deleting what people wrote is a decision somebody
        should take on purpose rather than something a deploy does quietly.
      </p>

      {total === 0 ? (
        <p className="mt-4 text-sm text-emerald-300">Nothing left to delete.</p>
      ) : (
        <>
          <ul className="mt-4 grid gap-1 text-sm sm:grid-cols-2">
            {counts.map((c) => (
              <li key={c.table} className="flex justify-between gap-4 rounded-lg bg-black/20 px-3 py-1.5">
                <span className="text-muted">{c.table}</span>
                <span className="font-mono tabular-nums">{c.rows.toLocaleString()}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            <b className="text-rose-200">{total.toLocaleString()} rows</b> will be permanently
            deleted. There is no undo and no backup taken here.
          </p>
          <form action={act} className="mt-4 flex flex-wrap items-center gap-3">
            <input
              name="confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type DELETE"
              autoComplete="off"
              className="input-cosmic w-44"
            />
            <button
              disabled={!armed || busy}
              className="rounded-full border border-rose-400/50 bg-rose-500/15 px-5 py-2 text-sm font-semibold text-rose-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Deleting…" : "Delete them permanently"}
            </button>
          </form>
        </>
      )}

      {state?.error && <p className="mt-3 text-sm text-rose-300">{state.error}</p>}
      {state?.ok && <p className="mt-3 text-sm text-emerald-300">{state.message}</p>}

      <p className="mt-4 text-xs text-muted">
        Not touched: planets and their members, follows, conversations and messages. Following and
        messaging stay — they are how a gamer keeps track of people they compete against.
      </p>
    </section>
  );
}
