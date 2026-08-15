// The shapes both portals use.
//
// Shared rather than duplicated because the brand and the owner are looking at
// the same kinds of thing — a figure, a row, a refusal — and two copies drift
// into two visual languages for one product.

import { formatMoney } from "../../lib/money/amounts.ts";

export function Panel({
  title,
  note,
  action,
  children,
}: {
  title: string;
  note?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-panel">
      <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
        <div>
          <h2 className="font-medium">{title}</h2>
          {note ? <p className="mt-0.5 text-xs text-mute">{note}</p> : null}
        </div>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function Figure({
  label,
  value,
  note,
  testId,
}: {
  label: string;
  value: string;
  note?: string;
  testId?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel px-5 py-4" data-testid={testId}>
      <p className="text-xs uppercase tracking-wide text-mute">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {note ? <p className="mt-1 text-xs text-mute">{note}</p> : null}
    </div>
  );
}

export function Money({ cents }: { cents: number }) {
  return <span className="tabular-nums">{formatMoney(cents)}</span>;
}

export function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-0">
      {children}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-mute">{children}</p>;
}

/**
 * A refusal.
 *
 * Every builder in this product refuses in the same shape and says *why* — a
 * refusal that only says no teaches somebody to try the same thing again.
 */
export function Refusal({ children, testId }: { children: React.ReactNode; testId?: string }) {
  if (!children) return null;
  return (
    <p
      data-testid={testId ?? "refusal"}
      className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300"
    >
      {children}
    </p>
  );
}
