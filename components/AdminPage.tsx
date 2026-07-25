import Link from "next/link";
import Icon from "@/components/Icon";

// One shape for every admin page.
//
// The rule this enforces: **entries first, settings below.** Staff come to
// these pages to act on a row — approve this, pause that, open the other —
// and configuration is the rare visit. Pages that opened with a settings panel
// made the common case scroll past the uncommon one.

export function AdminHeader({ title, subtitle, back, actions, stats }: {
  title: string;
  subtitle?: string;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
  stats?: { label: string; value: string | number; tone?: "accent" | "warn" }[];
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="text-sm text-cyan-300 hover:underline inline-flex items-center gap-1.5 mb-2">
          <Icon name="arrowLeft" size={14} /> {back.label}
        </Link>
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="text-muted text-sm mt-1 max-w-2xl">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
      </div>
      {stats && stats.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {stats.map((s) => (
            <div key={s.label} className="glass rounded-xl px-4 py-3">
              <div className="text-[10px] uppercase tracking-widest text-muted">{s.label}</div>
              <div className={`text-xl font-black ${
                s.tone === "accent" ? "text-cyan-300" : s.tone === "warn" ? "text-amber-300" : ""
              }`}>
                {typeof s.value === "number" ? s.value.toLocaleString() : s.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// The entries. Always the first thing on the page.
export function AdminSection({ title, hint, actions, children, tone }: {
  title: string;
  hint?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  tone?: "warn";
}) {
  return (
    <section className={`glass p-6 mb-6 ${tone === "warn" ? "border border-amber-400/30" : ""}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h2 className="font-bold">{title}</h2>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {hint && <p className="text-xs text-muted mb-4 max-w-2xl">{hint}</p>}
      {!hint && <div className="mb-4" />}
      {children}
    </section>
  );
}

// Settings, configuration, danger zone — everything that isn't a row of work.
// Visually demoted and always after the entries.
export function AdminSettings({ title = "Settings", children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 pt-6 border-t border-white/10">
      <div className="text-[11px] uppercase tracking-widest text-muted mb-4 flex items-center gap-1.5">
        <Icon name="settings" size={12} /> {title}
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/15 p-8 text-center">
      <div className="font-semibold">{title}</div>
      {hint && <p className="text-sm text-muted mt-1 max-w-md mx-auto">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
