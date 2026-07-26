import Link from "next/link";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { areaAllowed, getStaffGrants } from "@/lib/permissions";
import { navFor, accessOf, ACCESS_LABEL, type AdminLink, type AdminAccess } from "@/lib/admin-nav";
import { loadMetrics, attentionOf, type Metrics } from "@/lib/admin-metrics";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Command centre" };

// The command centre.
//
// There are 45 admin pages. The dashboard used to show seven numbers and a
// sentence telling you to look in the sidebar — so finding anything meant
// already knowing where it was, nothing said what a page was for, and there
// was no way to tell whether staff could open it.
//
// Now every console is on this page: grouped, described in one line, carrying
// its own live number, and labelled with who can reach it. Queues come first,
// because the only question this page really has to answer is "what needs me?"
export default async function AdminCommandCentre() {
  const user = await getCurrentUser();
  const admin = isAdmin(user!);
  const grants = admin ? [] : await getStaffGrants();
  const metrics = await loadMetrics();
  const groups = navFor(admin, grants, areaAllowed);
  const attention = attentionOf(metrics);

  return (
    <div>
      <div className="mb-7">
        <div className="text-xs uppercase tracking-widest text-amber-300 flex items-center gap-2">
          <Icon name="shield" size={14} /> {admin ? "Admin" : "Staff"}
        </div>
        <h1 className="text-2xl sm:text-3xl font-black mt-1">Command centre</h1>
        <p className="text-muted text-sm mt-1 max-w-2xl">
          Every console on one page. {admin
            ? "You can open everything here. Each card says whether staff can too."
            : "Areas an admin hasn't granted you are hidden rather than shown locked."}
        </p>
      </div>

      {/* Needs you — the reason to open this page at all. */}
      <section className="mb-8">
        <h2 className="text-[11px] uppercase tracking-widest text-muted mb-2.5">Needs you</h2>
        {attention.length === 0 ? (
          <div className="glass rounded-2xl px-5 py-4 text-sm text-muted flex items-center gap-2">
            <Icon name="check" size={15} className="text-emerald-300" />
            Nothing waiting. Every queue is clear.
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {attention.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className={`glass rounded-2xl p-4 border transition hover:ring-1 ${
                  a.tone === "danger"
                    ? "border-rose-400/35 hover:ring-rose-400/50"
                    : "border-amber-400/35 hover:ring-amber-400/50"
                }`}
              >
                <div className={`text-3xl font-black ${a.tone === "danger" ? "text-rose-300" : "text-amber-300"}`}>
                  {a.value.toLocaleString()}
                </div>
                <div className="text-xs mt-1 leading-snug">{a.label}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* The headline numbers, in the order the product actually works:
          servers → their reach → the gamers who linked → what they compete in. */}
      <section className="mb-9">
        <h2 className="text-[11px] uppercase tracking-widest text-muted mb-2.5">The platform right now</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Big label="Servers" value={metrics.guilds} href="/admin/discord" accent />
          <Big label="Reach" value={metrics.guildMembers} href="/admin/discord" hint="members across every server" accent />
          <Big label="Gamers" value={metrics.users} href="/admin/users" />
          <Big label="Linked accounts" value={metrics.linkedAccounts} href="/admin/linked-accounts" />
          <Big label="Live challenges" value={metrics.challenges} href="/admin/challenges" />
        </div>
        <Link href="/admin/analytics" className="inline-flex items-center gap-1.5 text-sm text-cyan-300 hover:underline mt-3">
          Every metric we track, with filters and exports <Icon name="arrowRight" size={13} />
        </Link>
      </section>

      {/* Every console. */}
      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.section}>
            <div className="flex items-baseline gap-3 flex-wrap">
              <h2 className="font-bold flex items-center gap-2">
                {g.icon && <Icon name={g.icon} size={15} className="text-cyan-300" />} {g.section}
              </h2>
              {g.blurb && <p className="text-xs text-muted">{g.blurb}</p>}
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
              {g.items.map((item) => (
                <Console key={item.href} item={item} metrics={metrics} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Big({ label, value, href, hint, accent }: {
  label: string; value: number; href: string; hint?: string; accent?: boolean;
}) {
  return (
    <Link href={href} className="glass rounded-2xl p-4 hover:ring-1 hover:ring-cyan-400/40 transition">
      <div className={`text-2xl sm:text-3xl font-black ${accent ? "text-cyan-300" : ""}`}>{value.toLocaleString()}</div>
      <div className="text-[11px] uppercase tracking-widest text-muted mt-1">{label}</div>
      {hint && <div className="text-[10px] text-muted/70 mt-0.5 leading-snug">{hint}</div>}
    </Link>
  );
}

function Console({ item, metrics }: { item: AdminLink; metrics: Metrics }) {
  const access = accessOf(item.area);
  const value = item.metric ? metrics[item.metric] : undefined;
  const flagged = !!item.queue && !!value;
  return (
    <Link
      href={item.href}
      className={`glass rounded-2xl p-4 flex flex-col gap-1 transition hover:ring-1 hover:ring-cyan-400/40 ${
        flagged ? "border border-amber-400/40" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-sm">{item.label}</span>
        {value !== undefined && (
          <span className={`shrink-0 text-sm font-black tabular-nums ${flagged ? "text-amber-300" : "text-cyan-300"}`}>
            {value.toLocaleString()}
          </span>
        )}
      </div>
      {item.desc && <p className="text-xs text-muted leading-snug">{item.desc}</p>}
      <AccessTag access={access} />
    </Link>
  );
}

// Who can open this. Staff shouldn't discover a boundary by hitting it, and an
// admin delegating work needs to see what they're delegating.
function AccessTag({ access }: { access: AdminAccess }) {
  const tone = access === "admin"
    ? "border-rose-400/30 text-rose-200"
    : access === "grantable"
      ? "border-amber-400/30 text-amber-200"
      : "border-white/12 text-muted";
  return (
    <span className={`mt-auto pt-1.5 inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] ${tone}`}>
      {ACCESS_LABEL[access]}
    </span>
  );
}
