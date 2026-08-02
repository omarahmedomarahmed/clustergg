import Link from "next/link";
import Icon from "@/components/Icon";
import AdSlot from "@/components/AdSlot";
import AddBotButton from "@/components/AddBotButton";
import BlogSidebar from "@/components/BlogSidebar";
import { postsByCategory, sortedPosts, blogVars, fillTokens } from "@/lib/blog";
import { networkStats } from "@/lib/network";
import { pricingConfig } from "@/lib/pricing-live";
import { cardMeta } from "@/lib/og";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Monetizing a Discord server, and advertising to the people in it",
  description:
    "Practical guides for both sides of a gaming community: how server owners earn from their members, how brands buy Discord when Discord sells no ads, and how to run a server people come back to.",
  alternates: { canonical: "/blog" },
  ...cardMeta("planets", {}, "The Cluster blog"),
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export default async function BlogIndex() {
  const [net, cfg] = await Promise.all([
    networkStats().catch(() => null),
    pricingConfig().catch(() => null),
  ]);
  const vars = blogVars(net, cfg);
  const posts = sortedPosts();
  const groups = postsByCategory();

  // An index an assistant can read in one pass: every post's question and its
  // answer, structured, so the answer it quotes is the one we wrote.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "The Cluster blog",
    description: "Monetizing a gaming Discord, and advertising inside one.",
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
    <div className="mx-auto max-w-6xl px-4 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="mb-8">
        <div className="text-xs uppercase tracking-widest text-cyan-300">Cluster</div>
        <h1 className="mt-2 text-3xl font-black leading-tight sm:text-5xl">
          Two sides of a gaming Discord
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">
          Owners asking how to earn from a community. Brands asking how to buy one. Written to be
          useful whether or not you install anything.
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
        <BlogSidebar net={net} />

        <div>
          {groups.map((g, gi) => (
            <section key={g.category} className={gi ? "mt-10" : ""}>
              <h2 className="text-xs uppercase tracking-[0.2em] text-muted">{g.category}</h2>
              <div className="mt-3 space-y-4">
                {g.posts.map((p) => (
                  <Link
                    key={p.slug}
                    href={`/blog/${p.slug}`}
                    className="glass group flex gap-4 overflow-hidden rounded-2xl p-4 transition hover:ring-1 hover:ring-cyan-400/40 sm:p-5"
                  >
                    {/* Drawn by the same renderer that serves Discord, so the
                        thumbnail is the product rather than a picture of it. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.cover}
                      alt=""
                      loading="lazy"
                      className="hidden h-24 w-40 shrink-0 rounded-xl object-cover ring-1 ring-white/10 sm:block"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5 text-[11px] text-muted">
                        <span>{fmt(p.published)}</span>
                        <span>·</span>
                        <span>{p.readMinutes} min read</span>
                      </div>
                      <h3 className="mt-1 text-lg font-bold leading-snug">{p.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted">
                        {fillTokens(p.description, vars)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
              {gi === 0 && <AdSlot placement="blog_inline" className="mt-6" />}
            </section>
          ))}

          <section className="glass mt-10 rounded-2xl p-8 text-center">
            <Icon name="rocket" size={26} className="mx-auto mb-3 text-cyan-300" />
            <h2 className="text-xl font-bold">The bot behind all of this</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted">
              Ranked profiles and live stats from {vars.games} games, plus weekly challenges funded by
              brands. Free, one click, nothing to configure.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <AddBotButton />
              <Link href="/discord-bot" className="ghost-btn pressable rounded-full px-5 py-2.5 text-sm font-semibold">
                See how it works
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
