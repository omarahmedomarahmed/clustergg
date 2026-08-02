import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { currentAccess } from "@/lib/departments";
import { SYSTEMS } from "@/lib/systems";
import { pagesOfSystem } from "@/lib/admin-nav";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Systems" };

// Cluster, described as the thing it is.
//
// Open to everyone on staff, including people not yet in a department, because
// the first thing a new person needs is not access — it's to understand what
// the company is made of and which part they're about to be handed.
export default async function SystemsPage() {
  await requireStaff();
  const access = await currentAccess();
  const mine = new Set(access?.isAdmin ? [] : access?.systems ?? []);
  const isAdminUser = !!access?.isAdmin;

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold">The systems</h1>
      <p className="mt-2 mb-8 max-w-3xl text-sm text-muted">
        Cluster is nine systems. Each one has an outcome it owns, a department that runs it, and a person
        responsible for it. They are not categories of page — they are the things that have to work for the
        company to work, and each one can be handed to somebody whole.
        {access?.department && (
          <> You&apos;re in <b className="text-ink">{access.department.name}</b>; your systems are marked.</>
        )}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {SYSTEMS.map((s) => {
          const owned = isAdminUser || mine.has(s.key);
          return (
            <Link
              key={s.key}
              href={`/admin/systems/${s.key}`}
              className={`glass block p-5 transition hover:border-cyan-400/40 ${
                owned ? "border border-cyan-400/25" : "border border-white/10 opacity-75"
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon name={s.icon} size={16} className={owned ? "text-cyan-300" : "text-muted"} />
                <h2 className="font-bold">{s.name}</h2>
                {mine.has(s.key) && (
                  <span className="ml-auto rounded-full border border-cyan-400/45 bg-cyan-500/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-cyan-200">
                    Yours
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-muted">{s.outcome}</p>
              <p className="mt-3 text-[11px] text-muted/70">
                {pagesOfSystem(s.key).length} page{pagesOfSystem(s.key).length === 1 ? "" : "s"} ·{" "}
                {s.brief.withWhom.length} systems it works with
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
