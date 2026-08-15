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
