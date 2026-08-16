// The handful of shapes every page uses. Not a design system — Stage 7 builds
// the real surface. This exists so Stage 1's screens are clickable without
// each one inventing its own panel.

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-line bg-panel p-6 ${className}`}
    >
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
export function Refusal({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">
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
