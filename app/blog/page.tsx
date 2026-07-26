import Link from "next/link";
import { POSTS } from "@/lib/blog";
import Icon from "@/components/Icon";
import AddBotButton from "@/components/AddBotButton";

export const metadata = {
  title: "The Cluster blog — running a gaming Discord",
  description:
    "Practical guides on running a gaming Discord: tracking real game stats, making a server active, and the ways communities actually make money.",
  alternates: { canonical: "/blog" },
  openGraph: { title: "The Cluster blog", url: "/blog", type: "website" },
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export default function BlogIndex() {
  const posts = [...POSTS].sort((a, b) => b.published.localeCompare(a.published));

  // An index page an assistant can read in one pass: every post's question and
  // its answer, structured, so the answer it quotes is the one we wrote.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "The Cluster blog",
    description: "Practical guides on running a gaming Discord community.",
    blogPost: posts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      description: p.description,
      datePublished: p.published,
      dateModified: p.updated ?? p.published,
      url: `/blog/${p.slug}`,
      keywords: p.tags.join(", "),
    })),
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="mb-10">
        <div className="text-xs uppercase tracking-widest text-cyan-300">Cluster</div>
        <h1 className="text-3xl sm:text-5xl font-black mt-2 leading-tight">Running a gaming Discord</h1>
        <p className="text-muted mt-4 max-w-2xl text-lg">
          What we&apos;ve learned building the bot that a few thousand gamers use inside their servers.
          Written to be useful whether or not you install anything.
        </p>
      </header>

      <div className="space-y-4">
        {posts.map((p) => (
          <Link
            key={p.slug}
            href={`/blog/${p.slug}`}
            className="glass block rounded-2xl p-6 hover:ring-1 hover:ring-cyan-400/40 transition"
          >
            <div className="flex items-center gap-2.5 text-[11px] text-muted">
              <span>{fmt(p.published)}</span>
              <span>·</span>
              <span>{p.readMinutes} min read</span>
            </div>
            <h2 className="text-xl font-bold mt-1.5 leading-snug">{p.title}</h2>
            <p className="text-sm text-muted mt-2 leading-relaxed">{p.description}</p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {p.tags.map((t) => (
                <span key={t} className="rounded-full border border-white/12 px-2.5 py-0.5 text-[10px] text-muted">{t}</span>
              ))}
            </div>
          </Link>
        ))}
      </div>

      <section className="glass rounded-2xl p-8 mt-10 text-center">
        <Icon name="rocket" size={26} className="text-cyan-300 mx-auto mb-3" />
        <h2 className="text-xl font-bold">The bot behind all of this</h2>
        <p className="text-sm text-muted mt-2 max-w-lg mx-auto">
          Ranked profiles, live stats from 24 games and challenges with real trophies — inside your server.
          Free, one click, nothing to configure.
        </p>
        <div className="flex flex-wrap justify-center gap-3 mt-5">
          <AddBotButton />
          <Link href="/discord-bot" className="ghost-btn pressable rounded-full px-5 py-2.5 text-sm font-semibold">
            See how it works
          </Link>
        </div>
      </section>
    </div>
  );
}
