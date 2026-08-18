import Link from "next/link";
import { formatMoney } from "../../lib/money/amounts.ts";
import { Help } from "../ui.tsx";

export function Panel({
  title,
  note,
  action,
  help,
  children,
}: {
  title: string;
  /** One line under the heading, for the rule this panel is enforcing. */
  note?: string;
  action?: React.ReactNode;
  /**
   * The rule behind the panel, at length.
   *
   * H1 names the two portals, not the console — but the console is where the
   * rules are *enforced*, and an operator refusing something at eleven on a
   * Saturday should be able to read why without leaving the page.
   */
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-panel">
      <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
        <div>
          <h2 className="font-medium">
            {title}
            {help ? <Help title={title}>{help}</Help> : null}
          </h2>
          {note ? <p className="mt-0.5 text-xs text-mute">{note}</p> : null}
        </div>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

/** A refusal, in the words of whatever refused. */
export function Refusal({
  children,
  testId,
}: {
  children: React.ReactNode;
  testId?: string;
}) {
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

/**
 * An indicator, in the colour of what it means.
 *
 * Amber is a phase, not an alarm: the prize vault cycles unallocated →
 * unclaimed → green with every challenge, and a console that shouts at a
 * normal rhythm is a console people stop reading.
 */
export function Light({ ok, level = "amber" }: { ok: boolean; level?: "amber" | "red" }) {
  const colour = ok ? "bg-green-500" : level === "red" ? "bg-red-500" : "bg-amber-400";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colour}`} />;
}

export function Money({ cents }: { cents: number }) {
  return <span className="tabular-nums">{formatMoney(cents)}</span>;
}

export function Row({ children, href }: { children: React.ReactNode; href?: string }) {
  const inner = (
    <div className="flex items-center justify-between border-b border-line py-3 last:border-0">
      {children}
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-80">{inner}</Link> : inner;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-mute">{children}</p>;
}

export function Blocking({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-green-400">Nothing is blocking this.</p>;
  }
  return (
    <ul className="flex flex-col gap-1 text-sm text-amber-300">
      {items.map((b, i) => (
        <li key={i}>· {b}</li>
      ))}
    </ul>
  );
}
