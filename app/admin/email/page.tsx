import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireSystemFor } from "@/lib/departments";
import { emailConfigured, emailFrom } from "@/lib/email";
import { TEMPLATE_KEYS } from "@/lib/email/templates";
import { timeAgo } from "@/lib/utils";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Email" };

/**
 * Every message we tried to send, and whether it arrived.
 *
 * The reason this screen exists rather than a log file: **a bounced invoice
 * email must be visible to a human.** A bounce is the moment you learn a
 * customer never heard from you, and it is worthless if it lands somewhere
 * nobody reads.
 */
const TONE: Record<string, string> = {
  delivered: "bg-emerald-500/15 text-emerald-300",
  sent: "bg-cyan-500/15 text-cyan-300",
  queued: "bg-slate-500/15 text-slate-300",
  skipped: "bg-amber-500/15 text-amber-300",
  bounced: "bg-rose-500/15 text-rose-300",
  complained: "bg-rose-500/15 text-rose-300",
  failed: "bg-rose-500/15 text-rose-300",
};

export default async function AdminEmailPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  await requireSystemFor("/admin/email");
  const { filter } = await searchParams;
  const db = await getDb();

  const rows = await db.select().from(schema.emailLog)
    .orderBy(desc(schema.emailLog.createdAt)).limit(300);
  const failed = rows.filter((r) => ["bounced", "complained", "failed"].includes(r.status));
  const skipped = rows.filter((r) => r.status === "skipped");
  const shown = filter === "failed" ? failed : filter === "skipped" ? skipped : rows;
  const on = emailConfigured();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Email</h1>
      <p className="text-sm text-muted mb-6 max-w-3xl">
        Every message the product tried to send, and what happened to it. A bounce is the moment you
        learn a customer never heard from you — that is the row worth looking for.
      </p>

      {/* Whether mail is on, stated plainly. An email layer that is switched off
          and does not say so is the most misleading thing on this page. */}
      <div className={`glass p-4 mb-6 flex flex-wrap items-center gap-4 text-sm ${on ? "" : "border border-amber-400/30"}`}>
        <span className={`inline-flex items-center gap-2 font-semibold ${on ? "text-emerald-300" : "text-amber-300"}`}>
          <Icon name={on ? "check" : "alert"} size={15} />
          {on ? "Sending is live" : "Sending is OFF"}
        </span>
        {on ? (
          <span className="text-muted">From <b className="text-ink">{emailFrom()}</b></span>
        ) : (
          <span className="text-muted">
            <code className="text-cyan-300">RESEND_API_KEY</code> is not set on this deployment. Nothing is sent and nothing
            errors — every message is recorded below as <b className="text-amber-300">skipped</b>, so you can see exactly what
            would have gone out once the key is added.
          </span>
        )}
        <span className="text-muted ml-auto">{TEMPLATE_KEYS.length} templates</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        {[
          { k: "", label: `All (${rows.length})` },
          { k: "failed", label: `Failed & bounced (${failed.length})` },
          { k: "skipped", label: `Skipped (${skipped.length})` },
        ].map((f) => (
          <Link key={f.k} href={f.k ? `/admin/email?filter=${f.k}` : "/admin/email"}
            className={`rounded-full px-3 py-1.5 border ${((filter ?? "") === f.k) ? "border-cyan-400/60 text-cyan-300" : "border-violet-400/20 text-muted hover:text-ink"}`}>
            {f.label}
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="glass p-8 text-center text-sm text-muted">
          {rows.length === 0
            ? "Nothing has been sent yet. Messages appear here the moment the product tries to send one — including while sending is off."
            : "Nothing matches that filter."}
        </div>
      ) : (
        <div className="glass overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-widest text-muted">
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3">When</th>
                <th className="text-left px-4 py-3">To</th>
                <th className="text-left px-4 py-3">Subject</th>
                <th className="text-left px-4 py-3">Template</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-white/5 align-top">
                  <td className="px-4 py-3 text-muted whitespace-nowrap">{timeAgo(r.createdAt)}</td>
                  <td className="px-4 py-3">{r.toAddress}</td>
                  <td className="px-4 py-3">
                    <div className="text-ink">{r.subject}</div>
                    {/* The reason, under the subject — a status with no cause is
                        a puzzle, and this is the screen somebody opens BECAUSE
                        something went wrong. */}
                    {r.error && <div className="text-[11px] text-rose-300/80 mt-0.5 max-w-lg">{r.error}</div>}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-cyan-300">{r.template}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONE[r.status] ?? "bg-slate-500/15 text-slate-300"}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
