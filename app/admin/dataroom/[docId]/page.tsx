import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getSections, docAnalytics, type Doc } from "@/lib/dataroom";
import { METRICS } from "@/lib/admin-metrics";
import { AdminHeader, AdminSection, AdminSettings } from "@/components/AdminPage";
import { SectionEditor } from "@/components/dataroom/SectionEditor";
import { DocSettings, AddSection, DeleteDoc, ReseedDoc } from "@/components/dataroom/DocForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Edit document" };

// One document, section by section.
//
// Sections first and settings below, the same rule the rest of the admin
// follows: the common visit is reordering or rewriting a section, and the
// document's colours and access key are the rare one.
export default async function EditDocPage({ params }: { params: Promise<{ docId: string }> }) {
  await requireAdmin();
  const { docId } = await params;

  const db = await getDb();
  const [row] = await db.select().from(schema.dataroomDocs).where(eq(schema.dataroomDocs.id, docId)).limit(1);
  if (!row) notFound();
  const doc = row as Doc;

  const [sections, stats] = await Promise.all([
    getSections(doc.id, true),
    docAnalytics(doc.id, 30),
  ]);

  const metricOptions = METRICS.map((m) => ({ key: m.key as string, label: m.label }));
  const read = new Map(stats.sections.map((s) => [s.anchor, s]));

  return (
    <div>
      <AdminHeader
        title={doc.title}
        subtitle={doc.subtitle ?? undefined}
        back={{ href: "/admin/dataroom", label: "Data room" }}
        stats={[
          { label: "Sections", value: sections.length },
          { label: "Hidden", value: sections.filter((s) => !s.isVisible).length, tone: sections.some((s) => !s.isVisible) ? "warn" : undefined },
          { label: "Opens · 30d", value: stats.views, tone: "accent" },
          { label: "Readers · 30d", value: stats.visitors, tone: "accent" },
        ]}
        actions={
          <Link href={`/dataroom/${doc.slug}${doc.accessKey ? `?key=${doc.accessKey}` : ""}`} target="_blank"
            className="ghost-btn pressable rounded-full px-5 py-2 text-sm">
            Open it
          </Link>
        }
      />

      <AdminSection
        title="Sections"
        hint="In the order they appear. Collapsed until you open one — the common visit is reordering, not rewriting. Sections marked live read their numbers from production every time someone loads the page."
      >
        <div className="space-y-2">
          {sections.map((s) => (
            <div key={s.id}>
              <SectionEditor section={s} metricOptions={metricOptions} />
              {read.has(s.anchor) && (
                <div className="px-4 pt-1 text-[10px] text-muted">
                  read {read.get(s.anchor)!.views}× · {Math.round(read.get(s.anchor)!.seconds / Math.max(1, read.get(s.anchor)!.views))}s average
                </div>
              )}
            </div>
          ))}
          {sections.length === 0 && (
            <p className="text-sm text-muted">No sections yet. Add one below.</p>
          )}
        </div>

        <div className="mt-6 pt-5 border-t border-white/10">
          <AddSection docId={doc.id} />
        </div>
      </AdminSection>

      <AdminSettings title="Document settings">
        <div className="glass p-6">
          <DocSettings doc={doc} />
        </div>
        <div className="glass p-6">
          <h3 className="font-bold text-sm mb-1">Danger zone</h3>
          <p className="text-xs text-muted mb-4">
            Restoring pulls in the sections we ship — the visual version, with graphic explainers and
            live product cards — and deletes the ones here. Deleting removes the document entirely and
            anyone holding the link gets a 404; unpublishing does that reversibly.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <ReseedDoc doc={doc} />
            <DeleteDoc doc={doc} />
          </div>
        </div>
      </AdminSettings>
    </div>
  );
}
