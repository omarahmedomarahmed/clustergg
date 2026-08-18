// The handful of shapes every page uses. Not a design system — Stage 7 builds
// the real surface. This exists so Stage 1's screens are clickable without
// each one inventing its own panel.

export function Panel({
  children,
  className = "",
  title,
  note,
}: {
  children: React.ReactNode;
  className?: string;
  /** Optional heading, so a page does not hand-roll one beside every panel. */
  title?: string;
  /** The line under it that says what the panel is for. */
  note?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-line bg-panel p-6 ${className}`}
    >
      {title ? (
        <div className="mb-4">
          <h2 className="font-medium">{title}</h2>
          {note ? <p className="mt-1 text-sm text-mute">{note}</p> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function Button({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-lg bg-accent px-4 py-2 font-medium text-white transition hover:opacity-90 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function Step({
  n,
  title,
  state,
  children,
}: {
  n: number;
  title: string;
  state: "done" | "now" | "later";
  children?: React.ReactNode;
}) {
  const mark = state === "done" ? "✓" : String(n);
  return (
    <Panel className={state === "later" ? "opacity-40" : ""}>
      <div className="flex items-center gap-3">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
            state === "done" ? "bg-green-600 text-white" : "bg-line text-mute"
          }`}
        >
          {mark}
        </span>
        <h2 className="font-medium">{title}</h2>
      </div>
      {state === "now" ? <div className="mt-4">{children}</div> : null}
    </Panel>
  );
}

/** A refusal, shown in the words the module that refused actually used. */
export function Refusal({
  children,
  testId,
}: {
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <p
      data-testid={testId}
      className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200"
    >
      {children}
    </p>
  );
}

/**
 * H1 — an **`i` icon on everything** in both portals.
 *
 * Clicking opens an overlay explaining what it is and the rule behind it. Built
 * as `<details>` rather than a modal on purpose: it needs no JavaScript, it is
 * in the DOM for the screenshot record whether open or shut, and a help overlay
 * that depends on a client bundle is a help overlay that is missing on exactly
 * the page that failed to hydrate.
 *
 * House rule 11 — a decoration may never take a card down. This renders text
 * it was handed and can throw on nothing.
 */
export function Help({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="inline-block align-middle" data-help={title}>
      <summary
        className="ml-1 inline-flex h-4 w-4 cursor-pointer list-none items-center justify-center rounded-full border border-line text-[10px] text-mute"
        aria-label={`What is ${title}?`}
      >
        i
      </summary>
      <div className="mt-2 rounded-lg border border-line bg-ink p-3 text-sm text-mute">
        <p className="font-medium text-white">{title}</p>
        <div className="mt-1">{children}</div>
      </div>
    </details>
  );
}

// ===== EVERY BAR IN THIS CODEBASE IS DRAWN HERE, AND THAT IS THE GUARD =====
//
// H4 — *"**never** a progress bar on raw member count"* — is a rule about what
// a bar is allowed to count, and a rule like that cannot be enforced at the
// component: by the time a width arrives it is a number with no history.
//
// So the enforcement is a chokepoint (trap 16: guard the chokepoint, not the
// vocabulary). There are exactly two bar-drawing components and they both live
// in this file; `tests/band1/94-progress.test.ts` walks `app/` and fails if a
// third appears inline anywhere. A hand-rolled bar over `guild.memberCount`
// then fails the band on the way in, rather than being caught by somebody
// reading the diff.
//
// The two are separated because they say different things and only one of them
// is H3's subject:
//
//   `Progress` — steps somebody controls, and they are this far through them.
//   `Meter`    — a measured position in a field. Not progress, not a promise
//                that finishing is possible, and never something to optimise.

/**
 * H3's bar. Takes a `Progress` from `lib/site/progress.ts` — never loose
 * numbers, so the thing it counts is decided in a module with a guard on it.
 */
export function Progress({
  progress,
  note,
  testId = "progress",
}: {
  progress: { done: number; total: number; percent: number; label: string; subject: string };
  /** The half of a gate that is **not** a bar. 12 §5's *"· 6 more linked gamers"*. */
  note?: string | null;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      data-progress={progress.subject}
      data-done={progress.done}
      data-total={progress.total}
    >
      <div className="flex items-baseline justify-between text-xs text-mute">
        <span>
          {progress.label}
          {note ? <span className="text-mute"> · {note}</span> : null}
        </span>
        <span>{progress.percent}%</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-line">
        <div
          className="h-1.5 rounded-full bg-accent transition-all"
          style={{ width: `${Math.max(2, progress.percent)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * A measured position, not progress — a percentile rank in a field of servers.
 *
 * Deliberately a different component with a different name, because the two
 * are one careless edit apart: a percentile drawn as *progress* reads as "you
 * are 40% of the way to finishing", which is not a thing a rank means.
 */
export function Meter({
  percent,
  label,
  testId,
}: {
  percent: number;
  label?: string;
  testId?: string;
}) {
  return (
    <div data-testid={testId} data-meter={label ?? ""}>
      <div className="h-1.5 rounded-full bg-line">
        <div
          className="h-1.5 rounded-full bg-accent"
          style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
        />
      </div>
    </div>
  );
}
