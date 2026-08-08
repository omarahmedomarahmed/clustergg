import Link from "next/link";
import Icon from "@/components/Icon";

// The admin kit — the whole console's vocabulary, in one file.
//
// ===== WHY THIS EXISTS =====
//
// The console was fifty pages and 8,500 lines of TSX, and every page drew its
// own heading, its own table, its own stat tile and its own empty state. That is
// the actual legacy problem — not the routing, which is fine, and not the
// permissions, which are good. It is that "a table of rows with a total" was
// written forty times, slightly differently each time, so nothing could be
// improved once and no two screens agreed on what a warning looked like.
//
// So: one vocabulary. A page is a `Page` with `Section`s. Numbers are `Stat`.
// Rows are `Table`. Anything irreversible is a `Danger`. A screen that needs
// something this file does not have is a screen that should say why in a
// comment, or a gap this file should close.
//
// ===== THE RULES THESE PRIMITIVES ENCODE =====
//
// 1. **Empty is a sentence, never a blank.** `Table` and `Section` take an
//    `empty` prop and it is required to be a sentence, because "no rows" tells
//    an operator nothing about whether that is normal.
// 2. **A number carries its own units and its own source.** `Stat` takes a
//    `note` for exactly this: an admin looking at "412" needs to know 412 of
//    what, counted when.
// 3. **Money is never a bare number.** `Money` formats it and marks negatives,
//    because a payout screen where -50 looks like 50 is a screen that costs
//    money.
// 4. **Destructive is visually distinct and says what cannot be undone.**
//    `Danger` requires a `consequence` string.
//
// Server components throughout. Nothing here holds state; interactivity lives
// in the small client components each page already owns.

// ===== Page =====

export function Page({ title, lede, actions, children }: {
  title: string;
  /** One line: what this page is FOR. Not what it contains. */
  lede?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{title}</h1>
          {lede && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{lede}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </header>
      <div className="space-y-6">{children}</div>
    </div>
  );
}

export function Section({ title, note, actions, empty, children }: {
  title?: string;
  note?: string;
  actions?: React.ReactNode;
  /**
   * What to say when there is nothing. A SENTENCE, not a label.
   *
   * "No payouts" tells an operator nothing. "Nothing has been earned this week
   * yet — the pool is divided on Monday" tells them whether to worry.
   */
  empty?: string;
  children?: React.ReactNode;
}) {
  const isEmpty = children == null
    || (Array.isArray(children) && children.filter(Boolean).length === 0);
  return (
    <section className="glass p-5 sm:p-6">
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-bold">{title}</h2>}
            {note && <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">{note}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {isEmpty && empty ? <Empty>{empty}</Empty> : children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-white/12 bg-black/20 px-4 py-6 text-center text-sm text-muted">
      {children}
    </p>
  );
}

// ===== Numbers =====

export function StatRow({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

export function Stat({ label, value, note, tone = "plain" }: {
  label: string;
  value: string;
  /** 412 of WHAT, counted WHEN. A number with no note is a number nobody trusts. */
  note?: string;
  tone?: "plain" | "good" | "warn" | "bad";
}) {
  const colour = tone === "good" ? "text-emerald-300"
    : tone === "warn" ? "text-amber-200"
      : tone === "bad" ? "text-rose-300" : "text-ink";
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`mt-0.5 text-2xl font-black tabular-nums ${colour}`}>{value}</div>
      {note && <div className="mt-0.5 text-[11px] leading-snug text-muted">{note}</div>}
    </div>
  );
}

/**
 * Money, always formatted and always signed.
 *
 * A payout screen where `-50` renders as `50` is a screen that costs money, and
 * a bare `Intl.NumberFormat` in forty places is forty chances to forget the
 * sign. Negative is rose and carries its minus; zero is muted rather than
 * green, because zero is not good news.
 */
export function Money({ value, currency = "USD", className = "" }: {
  value: number;
  currency?: string;
  className?: string;
}) {
  const neg = value < 0;
  const tone = neg ? "text-rose-300" : value === 0 ? "text-muted" : "";
  return (
    <span className={`tabular-nums ${tone} ${className}`}>
      {neg ? "−" : ""}
      {Math.abs(value).toLocaleString("en-US", {
        style: "currency", currency,
        minimumFractionDigits: Math.abs(value) % 1 ? 2 : 0,
        maximumFractionDigits: 2,
      })}
    </span>
  );
}

export const num = (v: number) => v.toLocaleString("en-US");

// ===== Tables =====

export type Col = {
  key: string;
  label: string;
  align?: "left" | "right";
  /** Hidden below `sm`. For anything that is context rather than the answer. */
  secondary?: boolean;
};

export function Table({ cols, empty, children }: {
  cols: Col[];
  /** A sentence. See `Section`. */
  empty: string;
  children?: React.ReactNode;
}) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    // Horizontal scroll on the TABLE, never on the page. An admin table with
    // eight columns on a laptop is normal; a page that scrolls sideways is not.
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-[10px] uppercase tracking-widest text-muted">
          <tr className="border-b border-white/10">
            {cols.map((c) => (
              <th
                key={c.key}
                className={`py-2 font-medium ${c.align === "right" ? "text-right" : "text-left"} ${
                  c.secondary ? "hidden sm:table-cell" : ""
                }`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

export function Tr({ children, tone }: { children: React.ReactNode; tone?: "warn" | "bad" }) {
  const bg = tone === "bad" ? "bg-rose-500/[0.05]" : tone === "warn" ? "bg-amber-500/[0.05]" : "";
  return <tr className={`border-b border-white/6 last:border-0 ${bg}`}>{children}</tr>;
}

export function Td({ children, align = "left", secondary, mono, bold }: {
  children?: React.ReactNode;
  align?: "left" | "right";
  secondary?: boolean;
  mono?: boolean;
  bold?: boolean;
}) {
  return (
    <td
      className={`py-2.5 ${align === "right" ? "text-right" : "text-left"} ${
        secondary ? "hidden sm:table-cell text-muted" : ""
      } ${mono ? "tabular-nums" : ""} ${bold ? "font-semibold" : ""}`}
    >
      {children}
    </td>
  );
}

// ===== Status =====

export function Pill({ children, tone = "plain" }: {
  children: React.ReactNode;
  tone?: "plain" | "good" | "warn" | "bad" | "info";
}) {
  const cls = {
    plain: "border-white/15 bg-white/5 text-muted",
    good: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
    warn: "border-amber-400/35 bg-amber-500/10 text-amber-200",
    bad: "border-rose-400/35 bg-rose-500/10 text-rose-200",
    info: "border-cyan-400/35 bg-cyan-500/10 text-cyan-200",
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      {children}
    </span>
  );
}

/** A one-line explanation an operator needs before they act. Never decoration. */
export function Note({ tone = "info", children }: {
  tone?: "info" | "warn" | "bad";
  children: React.ReactNode;
}) {
  const cls = {
    info: "border-cyan-400/25 bg-cyan-500/[0.06] text-cyan-100",
    warn: "border-amber-400/30 bg-amber-500/[0.06] text-amber-100",
    bad: "border-rose-400/30 bg-rose-500/[0.06] text-rose-100",
  }[tone];
  // `info` is not in the icon set — `spark` reads as "note", and inventing an
  // icon name here would render an empty box that nobody would notice.
  const icon = tone === "info" ? "spark" : "alert";
  return (
    <p className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${cls}`}>
      <Icon name={icon} size={13} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/**
 * The danger zone.
 *
 * `consequence` is required and is not a label — it is the sentence an operator
 * reads before doing something that cannot be undone. A destructive control
 * that only says "Delete" is a control somebody clicks by accident, and the
 * console has forty of them.
 */
export function Danger({ title, consequence, children }: {
  title: string;
  consequence: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-rose-400/30 bg-rose-500/[0.05] p-5">
      <h2 className="flex items-center gap-2 text-sm font-black text-rose-200">
        <Icon name="alert" size={14} /> {title}
      </h2>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-rose-100/80">{consequence}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

// ===== Links and buttons =====

export function AdminLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="text-cyan-300 hover:underline">{children}</Link>;
}

// ===== Tabs =====
//
// Merged pages, not a widget. Four screens that were each "edit some site text"
// became one page with four tabs, and the tab lives in the URL rather than in
// React state for three reasons that all matter to staff: a tab is bookmarkable,
// a server action's `revalidatePath` puts you back where you were, and the
// panels stay SERVER components — only the active tab's data is fetched, so a
// merge does not make the page four times as expensive to open.
//
// `desc` is required. A tab strip whose labels are one word each is a strip
// where the difference between "Nav & footer" and "Mobile" is a guess.
export type Tab = { key: string; label: string; desc: string };

/** The active tab, resolved safely. An unknown `?tab=` falls back to the first. */
export function activeTab(tabs: Tab[], value: string | undefined): Tab {
  return tabs.find((t) => t.key === value) ?? tabs[0];
}

export function Tabs({ tabs, active, base }: { tabs: Tab[]; active: string; base: string }) {
  const current = activeTab(tabs, active);
  return (
    <div>
      <nav className="flex flex-wrap gap-1.5 border-b border-white/10 pb-2">
        {tabs.map((t) => {
          const on = t.key === current.key;
          return (
            <Link
              key={t.key}
              href={`${base}?tab=${t.key}`}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                on
                  ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/40"
                  : "text-muted hover:bg-white/5 hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <p className="mt-2 text-xs text-muted">{current.desc}</p>
    </div>
  );
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

/** A link that looks like a button. Buttons that DO things are client components. */
export function LinkButton({ href, children, tone = "plain" }: {
  href: string;
  children: React.ReactNode;
  tone?: "plain" | "primary";
}) {
  const cls = tone === "primary"
    ? "glow-btn text-white"
    : "border border-white/15 bg-white/5 text-ink hover:border-white/30";
  return (
    <Link href={href} className={`pressable rounded-full px-4 py-2 text-xs font-bold ${cls}`}>
      {children}
    </Link>
  );
}
