import Link from "next/link";
import Icon from "@/components/Icon";
import { LOCKED_CP_CAP, type UnlockState } from "@/lib/unlock";

// Two steps, and the balance waiting behind them. B83.
//
// The number is the argument. A checklist on its own is a chore; a checklist
// with a balance sitting next to it that the gamer earned and cannot spend yet
// is a reason. So the CP comes first and large, the steps come second, and the
// copy never once implies the points might not be theirs.
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

  if (compact) {
    return (
      <Link
        href="/onboarding"
        className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-100 transition hover:border-amber-300/70"
      >
        <Icon name="alert" size={12} />
        {n(state.lockedCp)} CP locked
        <span className="font-normal text-amber-200/80">· {left} step{left === 1 ? "" : "s"} left</span>
      </Link>
    );
  }

  return (
    <section className="glass border border-amber-400/30 bg-amber-500/[0.05] p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-amber-200/80">Waiting for you</div>
          <div className="text-4xl font-black tabular-nums text-amber-200">{n(state.lockedCp)} CP</div>
          <p className="mt-1 text-xs text-muted">
            {/* Never "you might lose these". They are earned and they are theirs. */}
            Earned and held. Two steps and it is yours to spend.
          </p>
        </div>
        <div className="text-right text-[11px] text-muted">
          {state.capped ? (
            <span className="text-amber-200">
              You have reached the {n(LOCKED_CP_CAP)} CP holding cap, so nothing more is being added.
              Everything you do is still recorded.
            </span>
          ) : (
            <>Holds up to {n(LOCKED_CP_CAP)} CP</>
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
        Until both are done your points are held — they cannot be spent in the marketplace or cashed out, and a
        trophy you win is held with them. Nothing is taken and nothing expires.
        {" "}
        <b className="text-ink">It is free to unlock</b>, and you can do all of it from Discord.
      </p>
    </section>
  );
}
