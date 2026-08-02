import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { currentAccess } from "@/lib/departments";
import { systemBy, SYSTEMS } from "@/lib/systems";
import { ADMIN_NAV, pagesOfSystem } from "@/lib/admin-nav";
import { loadMetrics } from "@/lib/admin-metrics";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const s = systemBy(key);
  return { title: s ? `Admin · ${s.name}` : "Admin · System" };
}

// A system's workspace: what it is, what you do, and the doors into it.
//
// This is the page a new employee is pointed at on their first morning. It
// deliberately reads as a brief rather than a dashboard — the numbers are
// there, but the first thing on the screen is what the job IS, because
// somebody who understands the outcome will find the right page and somebody
// who only has a list of pages will not.
export default async function SystemPage({ params }: { params: Promise<{ key: string }> }) {
  await requireStaff();
  const { key } = await params;
  const system = systemBy(key);
  if (!system) notFound();

  const access = await currentAccess();
  const mine = !!access?.isAdmin || (access?.systems ?? []).includes(system.key);

  // The pages this desk owns, read from the console's own map — the same
  // declaration the rail renders and the guard enforces, so a page can never
  // appear here under a name it doesn't have there, or at all if it doesn't.
  const links = pagesOfSystem(system.key);

  const metrics = await loadMetrics().catch(() => ({} as Record<string, number>));
  const numbers = links
    .filter((i) => i.metric && typeof metrics[i.metric] === "number")
    .map((i) => ({ label: i.label, value: metrics[i.metric!], href: i.href }));

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-baseline justify-between gap-3 flex-wrap">
        <Link href="/admin/systems" className="text-sm text-cyan-300 hover:underline">← All systems</Link>
        {!mine && (
          <span className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-muted">
            Not your system — read-only overview
          </span>
        )}
      </div>

      <div className="glass p-7">
        <div className="flex items-center gap-2">
          <Icon name={system.icon} size={20} className="text-cyan-300" />
          <h1 className="text-2xl font-bold">{system.name}</h1>
        </div>
        <p className="mt-2 text-lg text-ink/90">{system.outcome}</p>
        <p className="mt-4 rounded-xl border border-cyan-400/25 bg-cyan-500/[0.06] px-4 py-3 text-sm">
          {system.brief.role}
        </p>
      </div>

      {numbers.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {numbers.map((n) => (
            <Link key={n.href} href={n.href} className="glass p-4 transition hover:border-cyan-400/40">
              <div className="text-2xl font-bold tabular-nums">{n.value.toLocaleString()}</div>
              <div className="text-[10px] uppercase tracking-widest text-muted">{n.label}</div>
            </Link>
          ))}
        </div>
      )}

      <section className="glass mt-6 p-7">
        <h2 className="font-bold">What you do</h2>
        <ol className="mt-3 space-y-2.5">
          {system.brief.doing.map((d, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-cyan-500/15 text-[10px] font-bold text-cyan-200">
                {i + 1}
              </span>
              <span className="text-muted">{d}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="glass mt-6 p-7">
        <h2 className="font-bold">Why it matters</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{system.brief.bigger}</p>
      </section>

      <section className="glass mt-6 p-7">
        <h2 className="font-bold">Who you work with</h2>
        <p className="mt-1 text-sm text-muted">
          Nothing here is finished alone. These are the systems either side of yours — go to them directly
          rather than escalating through anyone.
        </p>
        <div className="mt-4 space-y-2">
          {system.brief.withWhom.map((w) => {
            const other = systemBy(w.system);
            if (!other) return null;
            return (
              <Link
                key={w.system}
                href={`/admin/systems/${other.key}`}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/25 p-4 transition hover:border-cyan-400/40"
              >
                <Icon name={other.icon} size={16} className="mt-0.5 shrink-0 text-cyan-300" />
                <div>
                  <div className="text-sm font-semibold">{other.name}</div>
                  <div className="text-xs text-muted">{w.why}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="glass mt-6 border border-amber-400/25 p-7">
        <h2 className="font-bold flex items-center gap-2">
          <Icon name="alert" size={16} className="text-amber-300" /> Ask before you act
        </h2>
        <p className="mt-1 text-sm text-muted">
          These are not yours to decide alone. Nobody minds being asked; everybody minds finding out
          afterwards.
        </p>
        <ul className="mt-3 space-y-1.5">
          {system.brief.escalate.map((e, i) => (
            <li key={i} className="flex gap-2 text-sm text-amber-100/90">
              <span className="text-amber-300">·</span>{e}
            </li>
          ))}
        </ul>
      </section>

      <section className="glass mt-6 p-7">
        <h2 className="font-bold">Your pages</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {links.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={`rounded-xl border p-4 transition ${
                mine ? "border-white/12 hover:border-cyan-400/40" : "border-white/8 opacity-60 pointer-events-none"
              }`}
            >
              <div className="text-sm font-semibold">{i.label}</div>
              {i.desc && <div className="mt-0.5 text-xs text-muted">{i.desc}</div>}
            </Link>
          ))}
        </div>
        {!mine && (
          <p className="mt-3 text-xs text-muted">
            You can read what this system does, but not open its pages — those belong to whoever runs it.
          </p>
        )}
      </section>

      <p className="mt-8 text-center text-xs text-muted">
        One of {SYSTEMS.length} systems.{" "}
        <Link href="/admin/systems" className="text-cyan-300 hover:underline">See them all</Link>
      </p>
    </div>
  );
}
