import Link from "next/link";
import Icon from "@/components/Icon";
import type { UnlockState } from "@/lib/unlock";

// The steps, and what is on the other side of them. B83 → B94.
//
// The count is read off `state.steps` rather than written into the copy. It was
// "two steps" in three places, and B89.2 added a third — a sentence that says
// "two" over a list of three is the kind of thing a gamer screenshots.
//
// ===== WHAT CHANGED, AND WHY THE COPY IS DIFFERENT =====
//
// This used to lead with a held CP balance, because a number is a better
// argument than a checklist. B94 stopped crediting anything before onboarding
// is finished, so for a new gamer that number is zero and leading with it would
// be leading with nothing.
//
// So there are two cases and they are not the same sentence:
//
//   a new account   nothing has accrued, so the argument is what earning IS.
//   an old account  a real balance, earned under the old rules, sitting there.
//                   The only thing it needs to hear is that it is SAFE.
//
// It is one component with two presentations — the onboarding page draws it
// whole, the nav draws the compact one — because two components would drift and
// the day they disagree is the day a gamer is told two different things about
// their own money.

const n = (v: number) => v.toLocaleString("en-US");

export default function UnlockChecklist({ state, compact = false }: {
  state: UnlockState;
  compact?: boolean;
}) {
  if (state.unlocked) return null;
  const left = state.steps.filter((s) => !s.done).length;
  const held = state.heldCp > 0;

  if (compact) {
    return (
      <Link
        href="/onboarding"
        className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-100 transition hover:border-amber-300/70"
      >
        <Icon name="alert" size={12} />
        {held ? `${n(state.heldCp)} CP safe` : "Finish setting up"}
        <span className="font-normal text-amber-200/80">· {left} step{left === 1 ? "" : "s"} left</span>
      </Link>
    );
  }

  return (
    <section className="glass border border-amber-400/30 bg-amber-500/[0.05] p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {held ? (
            <>
              <div className="text-[10px] uppercase tracking-widest text-amber-200/80">Yours, and safe</div>
              <div className="text-4xl font-black tabular-nums text-amber-200">{n(state.heldCp)} CP</div>
              <p className="mt-1 text-xs text-muted">
                {/* Never "you might lose these". They are earned and they are theirs. */}
                Earned before we started asking these questions. Nothing is taken and nothing expires —
                {" "}{state.steps.length} step{state.steps.length === 1 ? "" : "s"} and it is spendable again.
              </p>
            </>
          ) : (
            <>
              <div className="text-[10px] uppercase tracking-widest text-amber-200/80">Not switched on yet</div>
              <div className="text-2xl font-black text-amber-100">Challenges · Missions · Points</div>
              <p className="mt-1 text-xs text-muted">
                {/* No pending number, because there is no pending number. B94. */}
                None of it counts until the {state.steps.length} step{state.steps.length === 1 ? " is" : "s are"} done.
                It takes about a minute and it is free.
              </p>
            </>
          )}
        </div>
      </div>

      <ul className="mt-5 space-y-2.5">
        {state.steps.map((s) => (
          <li key={s.key} className="flex items-start gap-3">
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                s.done ? "bg-emerald-500/25 text-emerald-300" : "bg-white/10 text-muted"
              }`}
            >
              <Icon name={s.done ? "check" : "lock"} size={11} />
            </span>
            <span className="min-w-0">
              <span className={`block text-sm font-bold ${s.done ? "text-muted line-through" : ""}`}>
                {s.label}
              </span>
              {!s.done && <span className="block text-[11px] leading-relaxed text-muted">{s.detail}</span>}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        Until they are all done nothing accrues — no points, no trophies, and challenges will not let you in.
        {held ? " What you already have stays exactly where it is." : ""}
        {" "}
        <b className="text-ink">It is free to unlock</b>, and you can do all of it from Discord.
      </p>
    </section>
  );
}
