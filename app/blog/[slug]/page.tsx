import Link from "next/link";
import { notFound } from "next/navigation";
import { postBySlug, relatedPosts, POSTS, type BlogSection } from "@/lib/blog";
import Icon from "@/components/Icon";
import AddBotButton from "@/components/AddBotButton";

const SITE = process.env.NEXT_PUBLIC_APP_URL || "https://clustergg.com";

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) return { title: "Not found" };
  return {
    title: post.title,
    description: post.description,
    keywords: post.tags,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      url: `/blog/${post.slug}`,
      type: "article",
      publishedTime: post.published,
      modifiedTime: post.updated ?? post.published,
    },
    twitter: { card: "summary_large_image", title: post.title, description: post.description },
  };
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) notFound();
  const related = relatedPosts(post);

  // Two schemas, doing different jobs. Article is what a search engine ranks.
  // FAQPage carries the question this post exists to answer with the exact
  // answer we'd want quoted — an assistant summarising this page should
  // reproduce our sentence, not compose its own from skimmed paragraphs.
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.description,
      datePublished: post.published,
      dateModified: post.updated ?? post.published,
      author: { "@type": "Organization", name: "Cluster", url: SITE },
      publisher: { "@type": "Organization", name: "Cluster", url: SITE },
      mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE}/blog/${post.slug}` },
      keywords: post.tags.join(", "),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [{
        "@type": "Question",
        name: post.question,
        acceptedAnswer: { "@type": "Answer", text: post.answer },
      }],
    },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Link href="/blog" className="text-sm text-cyan-300 hover:underline inline-flex items-center gap-1.5">
        <Icon name="arrowLeft" size={14} /> All posts
      </Link>

      <article className="mt-6">
        <div className="flex items-center gap-2.5 text-[11px] text-muted">
          <span>{fmt(post.published)}</span>
          <span>·</span>
          <span>{post.readMinutes} min read</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black mt-2 leading-tight">{post.title}</h1>

        {/* The answer, up top and marked as such. Someone who came from a search
            gets it in one line; an assistant reading the page finds it before
            any of the argument. */}
        <div className="glass rounded-2xl p-5 mt-6 border-l-4 border-cyan-400">
          <div className="text-[11px] uppercase tracking-widest text-cyan-300">{post.question}</div>
          <p className="text-sm mt-1.5 leading-relaxed">{post.answer}</p>
        </div>

        <div className="mt-8 space-y-5">
          {post.body.map((s, i) => <Section key={i} s={s} />)}
        </div>
      </article>

      <section className="glass rounded-2xl p-7 mt-10 text-center">
        <h2 className="text-lg font-bold">ClusterBot for Discord</h2>
        <p className="text-sm text-muted mt-1.5 max-w-lg mx-auto">
          Ranked profiles and live stats from 24 games, plus challenges with real trophies — inside your server.
        </p>
        <div className="flex flex-wrap justify-center gap-3 mt-4">
          <AddBotButton />
          <Link href="/discord-bot" className="ghost-btn pressable rounded-full px-5 py-2.5 text-sm font-semibold">
            See how it works
          </Link>
        </div>
      </section>

      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs uppercase tracking-widest text-muted mb-3">Read next</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {related.map((r) => (
              <Link key={r.slug} href={`/blog/${r.slug}`} className="glass rounded-2xl p-5 hover:ring-1 hover:ring-cyan-400/40 transition">
                <div className="font-semibold text-sm leading-snug">{r.title}</div>
                <p className="text-xs text-muted mt-1.5 leading-snug line-clamp-3">{r.description}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Section({ s }: { s: BlogSection }) {
  switch (s.kind) {
    case "h2":
      return <h2 className="text-2xl font-bold pt-4">{s.text}</h2>;
    case "h3":
      return <h3 className="text-lg font-bold pt-2">{s.text}</h3>;
    case "p":
      return <p className="leading-relaxed text-[15px] text-ink/90">{s.text}</p>;
    case "ul":
      return (
        <ul className="space-y-2">
          {s.items.map((it, i) => (
            <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-ink/90">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="space-y-3">
          {s.items.map((it, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-ink/90">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-500/20 text-violet-200 text-xs font-black">
                {i + 1}
              </span>
              <span>{it}</span>
            </li>
          ))}
        </ol>
      );
    case "quote":
      return <blockquote className="border-l-2 border-violet-400/50 pl-4 italic text-muted">{s.text}</blockquote>;
    case "table":
      return (
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="text-left text-xs text-muted">
                {s.head.map((h) => <th key={h} className="py-2 pr-4 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r, i) => (
                <tr key={i} className="border-t border-white/10">
                  {r.map((cell, j) => (
                    <td key={j} className={`py-2.5 pr-4 align-top ${j === 0 ? "font-semibold whitespace-nowrap" : "text-muted"}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "cta":
      return (
        <div className="glass rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm">{s.text}</span>
          <Link href={s.href} className="ghost-btn pressable rounded-full px-5 py-2 text-sm font-semibold shrink-0">
            {s.label}
          </Link>
        </div>
      );
  }
}
