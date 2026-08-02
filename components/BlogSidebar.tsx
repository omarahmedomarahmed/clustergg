import Link from "next/link";
import Icon from "@/components/Icon";
import AdSlot from "@/components/AdSlot";
import AddBotButton from "@/components/AddBotButton";
import { postsByCategory, type BlogPost } from "@/lib/blog";
import type { NetworkStats } from "@/lib/network";

// The blog's left rail.
//
// It does three jobs, in this order of importance to the person reading:
//
//  1. Say where you are and what else is here. The posts are grouped by who
//     they're for — an owner asking how to earn and a brand asking how to buy
//     are different people and should not have to read past each other.
//  2. On a post, jump to a section. Built from the h2s, so it can't drift out
//     of sync with the article the way a hand-written list would.
//  3. Carry the numbers and the ad slot. The network figures are the reason to
//     believe anything in the post above them.
//
// Sticky from `lg` up; on a phone it becomes an ordinary block ABOVE the
// article, minus the table of contents — a jump list you have to scroll past
// to reach the thing it links to is worse than no jump list.

export default function BlogSidebar({
  active, toc, net,
}: {
  active?: string;
  toc?: { id: string; text: string }[];
  net: NetworkStats | null;
}) {
  const groups = postsByCategory();

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <nav className="space-y-6">
        {toc && toc.length > 1 && (
          <div className="hidden lg:block">
            <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300">On this page</div>
            <ul className="mt-2 space-y-1.5 border-l border-white/10 pl-3">
              {toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="block text-xs leading-snug text-muted transition hover:text-ink">
                    {t.text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {groups.map((g) => (
          <div key={g.category}>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted">{g.category}</div>
            <ul className="mt-2 space-y-1.5">
              {g.posts.map((p) => <RailLink key={p.slug} post={p} active={active === p.slug} />)}
            </ul>
          </div>
        ))}

        {net && (
          <div className="glass rounded-2xl p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted">The network, live</div>
            <dl className="mt-2.5 space-y-1.5">
              <Stat label="Servers" value={net.servers} />
              <Stat label="Members reached" value={net.reach} />
              <Stat label="Linked gamers" value={net.linked} />
              <Stat label="Games synced" value={net.games} />
            </dl>
          </div>
        )}

        <AdSlot placement="blog_sidebar" />

        <div className="glass rounded-2xl p-4">
          <Icon name="rocket" size={18} className="text-cyan-300" />
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Free bot, one click, nothing to configure. Brands fund the prizes; your server takes a share.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <AddBotButton />
            <Link href="/pricing" className="ghost-btn pressable rounded-full px-4 py-2 text-center text-xs font-semibold">
              Advertise to gamers
            </Link>
          </div>
        </div>
      </nav>
    </aside>
  );
}

function RailLink({ post, active }: { post: BlogPost; active: boolean }) {
  return (
    <li>
      <Link
        href={`/blog/${post.slug}`}
        aria-current={active ? "page" : undefined}
        className={`block rounded-lg px-2 py-1.5 text-xs leading-snug transition ${
          active ? "bg-violet-500/15 font-semibold text-ink ring-1 ring-violet-400/30" : "text-muted hover:bg-white/5 hover:text-ink"
        }`}
      >
        {post.title}
      </Link>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="text-xs font-black tabular-nums text-ink">{value.toLocaleString()}</dd>
    </div>
  );
}
