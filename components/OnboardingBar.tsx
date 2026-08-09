import Link from "next/link";
import Icon from "@/components/Icon";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { unlockState } from "@/lib/unlock";

// The bar that follows an unfinished account. B93.
//
// A gamer who clicks away from onboarding has no way back except remembering a
// URL, and no way to know that anything is waiting. This is on every page until
// the last step is done, and then it is gone forever.
//
// It says how many steps are left and NOT what they are. The detail belongs on
// the page; a bar that tries to be the page is a bar people dismiss. What it
// does carry is the balance, because that is the argument — the points are
// already accruing and this is the thing standing between them and spending it.
//
// Server component: it reads the same `unlockState` every other surface reads,
// so it can never disagree with the checklist it links to.

export default async function OnboardingBar() {
  const user = await getCurrentUser();
  if (!user) return null;

  let state;
  try {
    state = await unlockState(await getDb(), user.id);
  } catch {
    // A bar that throws must never take a page down with it.
    return null;
  }
  if (state.unlocked) return null;

  const total = state.steps.length;
  const done = state.steps.filter((s) => s.done).length;
  const left = total - done;
  const next = state.steps.find((s) => !s.done);

  return (
    <Link
      href="/onboarding"
      className="group block border-b border-amber-400/25 bg-amber-500/[0.09] hover:bg-amber-500/[0.14]"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs">
        <Icon name="alert" size={13} className="shrink-0 text-amber-300" />
        <span className="font-bold text-amber-100">
          {left} {left === 1 ? "step" : "steps"} left before you can earn
        </span>

        {/* The dots are the progress. Small, and readable at a glance without
            reading a sentence. */}
        <span className="flex items-center gap-1">
          {state.steps.map((s) => (
            <span
              key={s.key}
              className={`h-1.5 w-5 rounded-full ${s.done ? "bg-emerald-400/80" : "bg-white/20"}`}
            />
          ))}
        </span>

        {next && <span className="text-amber-100/70">Next: {next.label.toLowerCase()}</span>}

        {state.lockedCp > 0 && (
          <span className="text-amber-100/70">
            · {state.lockedCp.toLocaleString("en-US")} CP waiting
          </span>
        )}

        <span className="ml-auto hidden font-semibold text-amber-200 group-hover:underline sm:inline">
          Finish setting up →
        </span>
      </div>
    </Link>
  );
}
