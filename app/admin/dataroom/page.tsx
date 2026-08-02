import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listDocs, getSections, docAnalytics, missingShippedSections } from "@/lib/dataroom";
import { AdminHeader, AdminSection, AdminSettings } from "@/components/AdminPage";
import { DocSettings } from "@/components/dataroom/DocForms";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Data room" };

// Every investor and partner document, with how much each is actually read.
//
// The reading numbers lead, because the useful question about a data room isn't
// what's in it — it's whether the people you sent it to opened it.
export default async function AdminDataroomPage() {
  await requireAdmin();
  const docs = await listDocs(true);
  const detail = await Promise.all(docs.map(async (d) => ({
    doc: d,
    sections: (await getSections(d.id, true)).length,
    stats: await docAnalytics(d.id, 30),
    missing: await missingShippedSections(d.slug, d.id),
  })));

  const totalViews = detail.reduce((n, d) => n + d.stats.views, 0);
  const totalVisitors = detail.reduce((n, d) => n + d.stats.visitors, 0);

  return (
    <div>
      <AdminHeader
        title="Data room"
        subtitle="The pitch deck and the company profile. Every section is editable, and every number in them is read from production when someone opens the page."
        back={{ href: "/admin", label: "Command centre" }}
        stats={[
          { label: "Documents", value: docs.length },
          { label: "Opens · 30d", value: totalViews, tone: "accent" },
          { label: "Readers · 30d", value: totalVisitors, tone: "accent" },
          { label: "Team", value: "edit", tone: undefined },
        ]}
        actions={
          <>
            <Link href="/admin/dataroom/team" className="ghost-btn pressable rounded-full px-5 py-2 text-sm">Team</Link>
            <Link href="/dataroom" target="_blank" className="ghost-btn pressable rounded-full px-5 py-2 text-sm">View the room</Link>
          </>
        }
      />

      <AdminSection title="Documents" hint="Open one to edit its sections, art and order.">
        <div className="space-y-3">
          {detail.map(({ doc, sections, stats, missing }) => (
            <div key={doc.id} className="rounded-2xl border border-white/10 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/admin/dataroom/${doc.id}`} className="font-bold hover:text-cyan-300">{doc.title}</Link>
                    <span className="rounded-full border border-white/12 px-2 py-0.5 text-[10px] text-muted">
                      {doc.kind === "deck" ? "investors" : "partners"}
                    </span>
                    {!doc.isPublished && <span className="text-[10px] text-amber-300">unpublished</span>}
                    {doc.accessKey && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted"><Icon name="lock" size={10} /> key</span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted font-mono mt-0.5">/dataroom/{doc.slug}</div>
                  {doc.subtitle && <p className="text-sm text-muted mt-1.5 max-w-xl">{doc.subtitle}</p>}
                </div>
                <div className="flex items-center gap-4 shrink-0 text-right">
                  <Num label="sections" value={sections} />
                  <Num label="opens" value={stats.views} accent />
                  <Num label="readers" value={stats.visitors} accent />
                </div>
              </div>

              {/* Which sections actually got read. The most useful line on this
                  page: it says what an investor cared about. */}
              {stats.sections.length > 0 && (
                <div className="mt-4 pt-3 border-t border-white/5">
                  <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Most-read sections · 30 days</div>
                  <div className="flex flex-wrap gap-1.5">
                    {stats.sections.slice(0, 8).map((s) => (
                      <span key={s.anchor} className="rounded-full border border-white/12 px-2.5 py-1 text-[11px]">
                        <b>#{s.anchor}</b>
                        <span className="text-muted"> · {s.views} · {Math.round(s.seconds / Math.max(1, s.views))}s avg</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* A section we shipped that this copy has never had.
                  Seeding is once-only on purpose, so without this line a slide
                  written after the first deploy is invisible to the one person
                  who could publish it. */}
              {missing.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/[0.07] p-3">
                  <div className="text-[11px] font-semibold text-amber-200">
                    {missing.length} section{missing.length === 1 ? "" : "s"} we ship {missing.length === 1 ? "isn't" : "aren't"} in your copy
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {missing.map((m) => (
                      <span key={m.anchor} className="rounded-full border border-amber-400/25 px-2.5 py-0.5 text-[11px] text-amber-100">
                        {m.navLabel} <span className="text-amber-200/60">#{m.anchor}</span>
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] leading-snug text-muted">
                    Your document is never overwritten by a deploy, which is why these haven&apos;t appeared.
                    Add them by hand, or use <b className="text-ink">Restore the shipped sections</b> inside the
                    document — that replaces everything, so only do it if you haven&apos;t edited this one.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 mt-4">
                <Link href={`/admin/dataroom/${doc.id}`} className="ghost-btn pressable rounded-full px-4 py-1.5 text-xs">Edit sections</Link>
                <Link href={`/dataroom/${doc.slug}${doc.accessKey ? `?key=${doc.accessKey}` : ""}`} target="_blank"
                  className="ghost-btn pressable rounded-full px-4 py-1.5 text-xs">Open it</Link>
              </div>
            </div>
          ))}
        </div>
      </AdminSection>

      <AdminSettings title="New document">
        <div className="glass p-6">
          <p className="text-xs text-muted mb-5 max-w-2xl">
            A third document — a specific partner, a specific round — starts empty and gets its sections added
            one at a time. Give it its own access key if it isn&apos;t for general circulation.
          </p>
          <DocSettings />
        </div>
      </AdminSettings>
    </div>
  );
}

function Num({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div>
      <div className={`text-lg font-black tabular-nums ${accent ? "text-cyan-300" : ""}`}>{value.toLocaleString()}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
    </div>
  );
}
