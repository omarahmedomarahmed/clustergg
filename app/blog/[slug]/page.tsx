import Link from "next/link";
import { notFound } from "next/navigation";
import {
  postBySlug, relatedPosts, tableOfContents, anchorId, blogVars, fillTokens, chartData,
  type BlogSection, type BlogVars, type BlogPost,
} from "@/lib/blog";
import Icon from "@/components/Icon";
import AdSlot from "@/components/AdSlot";
import AddBotButton from "@/components/AddBotButton";
import BlogSidebar from "@/components/BlogSidebar";
import BlogChart from "@/components/BlogChart";
import { networkStats, type NetworkStats } from "@/lib/network";
import { pricingConfig } from "@/lib/pricing-live";
import type { PricingConfig } from "@/lib/pricing";

const SITE = process.env.NEXT_PUBLIC_APP_URL || "https://clustergg.com";

// Live numbers and a live ad slot, so `force-dynamic` rather than static. The
// posts themselves are still in the repo — what changes per request is the
// figures inside them.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) return { title: "Not found" };
  // The description carries {tokens} too, and a search result showing a literal
  // "{price}" is worse than a slightly stale number — so fill them here as well.
  const vars = blogVars(await networkStats().catch(() => null), await pricingConfig().catch(() => null));
  const description = fillTokens(post.description, vars);
  return {
    title: post.title,
    description,
    keywords: post.tags,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description,
      url: `/blog/${post.slug}`,
      type: "article",
      publishedTime: post.published,
      modifiedTime: post.updated ?? post.published,
      images: [{ url: post.cover, width: 1200, height: 630, alt: post.title }],
    },
    twitter: {
      card: "summary_large_image", title: post.title, description, images: [post.cover],
    },
  };
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) notFound();

  const [net, cfg] = await Promise.all([
    networkStats().catch(() => null),
    pricingConfig().catch(() => null),
  ]);
  const vars = blogVars(net, cfg);
  const related = relatedPosts(post);
  const toc = tableOfContents(post);

  // Two schemas doing different jobs. Article is what a search engine ranks.
  // FAQPage carries the question this post exists to answer with the exact
  // answer we'd want quoted — an assistant summarising this page should
  // reproduce our sentence, not compose its own from skimmed paragraphs.
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: fillTokens(post.description, vars),
      datePublished: post.published,
      dateModified: post.updated ?? post.published,
      image: `${SITE}${post.cover}`,
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
        acceptedAnswer: { "@type": "Answer", text: fillTokens(post.answer, vars) },
      }],
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-cyan-300 hover:underline">
        <Icon name="arrowLeft" size={14} /> All posts
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[220px_1fr]">
        <BlogSidebar active={post.slug} toc={toc} net={net} />

        <div className="min-w-0 max-w-3xl">
          <article>
            <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-muted">
              <span className="rounded-full border border-white/12 px-2.5 py-0.5 text-cyan-300">{post.category}</span>
              <span>{fmt(post.published)}</span>
              <span>·</span>
              <span>{post.readMinutes} min read</span>
            </div>
            <h1 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">{post.title}</h1>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.cover}
              alt={post.title}
              className="mt-6 w-full rounded-2xl ring-1 ring-white/10"
            />

            {/* The answer, up top and marked as such. Someone who came from a
                search gets it in one line; an assistant reading the page finds
                it before any of the argument. */}
            <div className="glass mt-6 rounded-2xl border-l-4 border-cyan-400 p-5">
              <div className="text-[11px] uppercase tracking-widest text-cyan-300">{post.question}</div>
              <p className="mt-1.5 text-sm leading-relaxed">{fillTokens(post.answer, vars)}</p>
            </div>

            <div className="mt-8 space-y-5">
              {post.body.map((s, i) => (
                <Section key={i} s={s} vars={vars} cfg={cfg} net={net} />
              ))}
            </div>
          </article>

          <section className="glass mt-10 rounded-2xl p-7 text-center">
            <h2 className="text-lg font-bold">ClusterBot for Discord</h2>
            <p className="mx-auto mt-1.5 max-w-lg text-sm text-muted">
              Ranked profiles and live stats from {vars.games} games, plus weekly challenges brands pay
              for — {vars.prize} of every {vars.price} is won by your members.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <AddBotButton />
              <Link href="/discord-bot" className="ghost-btn pressable rounded-full px-5 py-2.5 text-sm font-semibold">
                See how it works
              </Link>
            </div>
          </section>

          {related.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">Read next</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {related.map((r) => <RelatedCard key={r.slug} post={r} vars={vars} />)}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function RelatedCard({ post, vars }: { post: BlogPost; vars: BlogVars }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="glass overflow-hidden rounded-2xl transition hover:ring-1 hover:ring-cyan-400/40"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={post.cover} alt="" loading="lazy" className="h-28 w-full object-cover" />
      <div className="p-4">
        <div className="text-sm font-semibold leading-snug">{post.title}</div>
        <p className="mt-1.5 line-clamp-3 text-xs leading-snug text-muted">
          {fillTokens(post.description, vars)}
        </p>
      </div>
    </Link>
  );
}

function Section({
  s, vars, cfg, net,
}: {
  s: BlogSection;
  vars: BlogVars;
  cfg: PricingConfig | null;
  net: NetworkStats | null;
}) {
  const t = (text: string) => fillTokens(text, vars);

  switch (s.kind) {
    case "h2":
      // The id is what the rail's jump list points at, derived from the same
      // function on both sides so they cannot drift.
      return <h2 id={anchorId(s.text)} className="scroll-mt-24 pt-4 text-2xl font-bold">{t(s.text)}</h2>;
    case "h3":
      return <h3 className="pt-2 text-lg font-bold">{t(s.text)}</h3>;
    case "p":
      return <p className="text-[15px] leading-relaxed text-ink/90">{t(s.text)}</p>;
    case "ul":
      return (
        <ul className="space-y-2">
          {s.items.map((it, i) => (
            <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-ink/90">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
              <span>{t(it)}</span>
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="space-y-3">
          {s.items.map((it, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-ink/90">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-500/20 text-xs font-black text-violet-200">
                {i + 1}
              </span>
              <span>{t(it)}</span>
            </li>
          ))}
        </ol>
      );
    case "quote":
      return <blockquote className="border-l-2 border-violet-400/50 pl-4 italic text-muted">{t(s.text)}</blockquote>;
    case "table":
      return (
        <div className="-mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                {s.head.map((h) => <th key={h} className="py-2 pr-4 font-semibold">{t(h)}</th>)}
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r, i) => (
                <tr key={i} className="border-t border-white/10">
                  {r.map((cell, j) => (
                    <td key={j} className={`py-2.5 pr-4 align-top ${j === 0 ? "whitespace-nowrap font-semibold" : "text-muted"}`}>
                      {t(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "figure":
      return (
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.src} alt={s.alt} loading="lazy" className="w-full rounded-2xl ring-1 ring-white/10" />
          {s.caption && (
            <figcaption className="mt-2 text-xs leading-relaxed text-muted">{t(s.caption)}</figcaption>
          )}
        </figure>
      );
    case "chart":
      return <BlogChart chart={chartData(s.from, { cfg, net })} title={t(s.title)} note={s.note ? t(s.note) : undefined} />;
    case "ad":
      // Renders nothing when the slot is unsold, which is why it can sit in the
      // middle of an article without leaving a hole in the argument.
      return <AdSlot placement="blog_inline" className="my-2" />;
    case "cta":
      return (
        <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-5">
          <span className="text-sm">{t(s.text)}</span>
          <Link href={s.href} className="ghost-btn pressable shrink-0 rounded-full px-5 py-2 text-sm font-semibold">
            {s.label}
          </Link>
        </div>
      );
  }
}
