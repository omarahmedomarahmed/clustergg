import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { getDoc, getSections, getPeople, liveData, recordDocView } from "@/lib/dataroom";
import { botShowcaseSteps } from "@/lib/bot-showcase";
import { installHref } from "@/lib/discord/config";
import { DocShell } from "@/components/dataroom/DocShell";
import { DetailProvider } from "@/components/dataroom/DetailModal";
import { SectionBand } from "@/components/dataroom/Sections";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = await getDoc(slug);
  if (!doc) return { title: "Not found" };
  return {
    title: doc.title,
    description: doc.summary ?? doc.subtitle ?? undefined,
    // A data room is shared by link, not found by search. Indexing it would put
    // our fundraising position and partner terms in a search result.
    robots: { index: false, follow: false },
    openGraph: { title: doc.title, description: doc.summary ?? undefined, type: "website" },
  };
}

// A document, read.
//
// Every section is a full-bleed band with its own art; the shell handles jump
// navigation and records which sections were actually read and for how long.
// The numbers come from `liveData()` once and are handed to every section that
// needs them, so a page with five live sections makes one set of queries.
export default async function DataroomDocPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const doc = await getDoc(slug);
  if (!doc || !doc.isPublished) notFound();

  // A key, when set, gates the document — but the default is open, because a
  // link you have to negotiate access to is a link that doesn't get forwarded,
  // and forwarding is the entire point of a data room.
  if (doc.accessKey && sp.key !== doc.accessKey) {
    return <Locked title={doc.title} accent={doc.accent} />;
  }

  const [sections, people, live, steps] = await Promise.all([
    getSections(doc.id),
    getPeople(doc.id),
    liveData(),
    botShowcaseSteps().catch(() => []),
  ]);

  // The page view itself. Section dwell time arrives separately from the shell
  // — this is the "someone opened it" record, and it must never delay the
  // render, so it goes in `after()`.
  const [jar, h] = await Promise.all([cookies(), headers()]);
  const visitorId = jar.get("cl_visitor")?.value ?? null;
  const referrer = h.get("referer");
  const ua = h.get("user-agent") ?? "";
  after(() => recordDocView({
    docId: doc.id,
    visitorId,
    referrer,
    device: /mobile|android|iphone|ipad/i.test(ua) ? "mobile" : "desktop",
  }));

  const nav = sections.map((s) => ({ anchor: s.anchor, label: s.navLabel }));
  const install = installHref();

  return (
    <DetailProvider accent={doc.accent}>
      <DocShell docId={doc.id} sections={nav} accent={doc.accent}>
        <div className="pb-10">
          {/* The one piece of chrome above the document: where you are, and the
              way back to the rest of the room. */}
          <div className="mx-auto max-w-6xl px-4 pt-6 lg:pl-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Link href="/dataroom" className="text-sm text-muted hover:text-ink inline-flex items-center gap-1.5">
                <Icon name="arrowLeft" size={14} /> Data room
              </Link>
              <span className="text-[11px] uppercase tracking-widest" style={{ color: doc.accent }}>
                {doc.kind === "deck" ? "Investor deck" : "Partnership profile"}
              </span>
            </div>
          </div>

          {sections.map((s, i) => (
            <SectionBand
              key={s.id}
              section={s}
              doc={doc}
              live={live}
              people={people}
              steps={steps}
              installUrl={install}
              index={i}
            />
          ))}

          <footer className="mx-auto max-w-6xl px-4 py-10 lg:pl-4 border-t border-white/10">
            <p className="text-xs text-muted">
              Every figure in this document was counted from production when you loaded it. Nothing here is
              modelled, projected or rounded up — refresh and it changes as we do.
            </p>
          </footer>
        </div>
      </DocShell>
    </DetailProvider>
  );
}

function Locked({ title, accent }: { title: string; accent: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl mx-auto" style={{ background: `${accent}26`, color: accent }}>
        <Icon name="lock" size={24} />
      </div>
      <h1 className="text-2xl font-black mt-5">{title}</h1>
      <p className="text-sm text-muted mt-2">
        This document needs the access key it was shared with. Append it to the link, or ask whoever sent it.
      </p>
      <Link href="/dataroom" className="ghost-btn pressable rounded-full px-6 py-2.5 text-sm inline-block mt-6">
        Back to the data room
      </Link>
    </div>
  );
}
