import { asc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { listDocs, type Doc, type Person } from "@/lib/dataroom";
import { AdminHeader, AdminSection, AdminSettings } from "@/components/AdminPage";
import { PersonEditor } from "@/components/dataroom/DocForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Data room team" };

// The people who appear in every document.
//
// Kept on one page rather than per-document, because the same founders appear
// in both and two copies drift the moment someone updates one.
export default async function DataroomTeamPage() {
  await requireAdmin();
  const db = await getDb();
  const [people, docs] = await Promise.all([
    db.select().from(schema.dataroomPeople).orderBy(asc(schema.dataroomPeople.sortOrder)),
    listDocs(true),
  ]);

  return (
    <div>
      <AdminHeader
        title="Team"
        subtitle="Everyone who appears in the data room. Each card opens a modal with their bio, past companies and a direct line — which is what a reader is actually looking for."
        back={{ href: "/admin/dataroom", label: "Data room" }}
        stats={[
          { label: "People", value: people.length },
          { label: "Hidden", value: people.filter((p) => !p.isVisible).length },
          { label: "On every doc", value: people.filter((p) => !p.docId).length },
        ]}
      />

      <AdminSection title="People" hint="Drag order is the order they appear. Founders first is conventional and works.">
        <div className="space-y-2">
          {(people as Person[]).map((p) => (
            <PersonEditor key={p.id} person={p} docs={docs as Doc[]} />
          ))}
        </div>
      </AdminSection>

      <AdminSettings title="Add someone">
        <div className="glass p-2">
          <PersonEditor docs={docs as Doc[]} />
        </div>
      </AdminSettings>
    </div>
  );
}
