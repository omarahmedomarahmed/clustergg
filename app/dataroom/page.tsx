import Link from "next/link";
import { listDocs, liveData } from "@/lib/dataroom";
import Icon from "@/components/Icon";
import { optImg } from "@/lib/img";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Data room",
  description: "Cluster's investor and sales documents — the media-buying and monetization platform for Discord gaming communities, with live traction.",
  robots: { index: false, follow: false },
};

const nf = (n: number) => n.toLocaleString();

// The room itself: the documents, and the three numbers that matter before you
// open any of them.
//
// Not indexed — a data room is shared by link. Indexing it would put our
// fundraising position and partner terms into a search result.
export default async function DataroomPage() {
  const [docs, live] = await Promise.all([listDocs(), liveData()]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-14">
      <header className="max-w-2xl">
        <div className="text-xs uppercase tracking-widest text-cyan-300">ClusterGG</div>
        <h1 className="text-3xl sm:text-5xl font-black mt-2 leading-tight">Data room</h1>
        <p className="text-muted mt-4 text-lg leading-relaxed">
          Everything we&apos;d send you, with the numbers read from production rather than typed into a slide.
          Open a document and it shows you today.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3 mt-9">
        <Stat value={nf(live.network.reach)} label="gamers reachable" />
        <Stat value={nf(live.network.servers)} label="servers" />
        <Stat value={nf(live.network.linked)} label="verified accounts" />
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mt-9">
        {docs.map((d) => (
          <Link
            key={d.id}
            href={`/dataroom/${d.slug}`}
            className="group relative overflow-hidden glass rounded-3xl p-7 transition hover:ring-1"
            style={{ ["--tw-ring-color" as string]: d.accent }}
          >
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-1"
              style={{ background: `linear-gradient(90deg, ${d.accent}, ${d.accent2})` }}
            />
            {d.coverUrl && (
              <div aria-hidden className="absolute inset-0 bg-cover bg-center opacity-20" style={{ backgroundImage: `url(${optImg(d.coverUrl, 1200)})` }} />
            )}
            <div className="relative">
              <span className="text-[11px] uppercase tracking-widest" style={{ color: d.accent }}>
                {d.kind === "deck" ? "For investors" : "For brands & publishers"}
              </span>
              <h2 className="text-xl font-black mt-2">{d.title}</h2>
              {d.subtitle && <p className="text-sm text-muted mt-1.5 leading-snug">{d.subtitle}</p>}
              {d.summary && <p className="text-sm text-muted mt-4 leading-relaxed">{d.summary}</p>}
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold mt-6" style={{ color: d.accent }}>
                Open <Icon name="arrowRight" size={14} />
              </span>
              {d.accessKey && (
                <span className="absolute right-0 top-0 inline-flex items-center gap-1 text-[10px] text-muted">
                  <Icon name="lock" size={11} /> key required
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {docs.length === 0 && (
        <div className="glass rounded-2xl p-8 mt-9 text-center text-sm text-muted">
          No documents yet. Build one in Admin → Data room.
        </div>
      )}

      <p className="text-xs text-muted mt-10">
        Every figure in these documents is counted from production when you load them. Nothing is modelled or
        projected. If a number looks small, it is small — we&apos;d rather you saw that than a chart.
      </p>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="text-2xl sm:text-3xl font-black tabular-nums text-cyan-300">{value}</div>
      <div className="text-[11px] uppercase tracking-widest text-muted mt-1 leading-tight">{label}</div>
    </div>
  );
}
