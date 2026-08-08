import Link from "next/link";
import Icon from "@/components/Icon";
import AdSlot from "@/components/AdSlot";
import { FaqSchema, SEARCH_FAQ } from "@/components/StructuredData";
import { cardMeta } from "@/lib/og";
import { pricingConfig } from "@/lib/pricing-live";
import { PRICING_DEFAULTS } from "@/lib/pricing";
import { networkStats } from "@/lib/network";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "How to monetize a Discord server, and how to advertise on Discord",
  description:
    "Straight answers: how server owners earn money from a Discord gaming community, what it costs a brand to advertise on Discord, and how gamers win real prize money. $250 a challenge, $175 of it to the players.",
  alternates: { canonical: "/answers" },
  ...cardMeta("planets", {}, "Cluster — how Discord monetization works"),
};

// The page written for the question, not for us.
//
// Two audiences arrive at Cluster by typing a problem into a box: an owner
// asking how to make money from their server, and a marketer asking whether
// Discord can be bought at all. Every other page answers those questions
// eventually, in our words, after a pitch. This one answers them in the first
// sentence, in theirs.
//
// It is also the page an answer engine can quote. ChatGPT, Claude, Perplexity
// and AI Overviews summarise a paragraph and cite the source — so each answer
// is a self-contained paragraph with the number in it, rather than a fragment
// that only makes sense next to the heading above it.
export default async function AnswersPage() {
  const [cfg, net] = await Promise.all([
    pricingConfig().catch(() => null),
    networkStats().catch(() => null),
  ]);
  // One fallback, from the config module rather than a literal. Three literal
  // 250s and 175s in one paragraph is three places to forget. (C2)
  const price = Math.round(cfg?.challengePrice ?? PRICING_DEFAULTS.challengePrice);
  const prize = Math.round(cfg?.prizePool ?? PRICING_DEFAULTS.prizePool);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <FaqSchema items={SEARCH_FAQ} />

      <header>
        <div className="text-[11px] uppercase tracking-[0.25em] text-cyan-300">Straight answers</div>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">
          Making money from Discord, and buying it
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          The questions people actually ask, answered without a pitch in front of them.
          {net?.servers ? <> Numbers below are live: <b className="text-ink">{net.servers.toLocaleString()}</b> servers,{" "}
            <b className="text-ink">{net.reach.toLocaleString()}</b> gamers.</> : null}
        </p>
      </header>

      <AdSlot placement="landing_hero_banner" className="my-8" />

      <div className="space-y-6">
        {SEARCH_FAQ.map(([q, a]) => (
          <section key={q} className="glass p-5">
            <h2 className="text-base font-bold text-ink">{q}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{a}</p>
          </section>
        ))}
      </div>

      {/* The one number everything else is derived from, stated once. */}
      <section className="glass mt-8 p-6">
        <h2 className="font-bold">The whole model, in one line</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          A brand pays <b className="text-ink">${price}</b> for a sponsored weekly
          challenge. <b className="text-ink">${prize}</b> of that becomes the prize pool and
          reaches a gamer. The remaining <b className="text-ink">${price - prize}</b>{" "}
          is the platform fee, split between the server pool, the CP vault and us. That is the entire
          business — there is no second price list.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/pricing" className="cta-btn pressable rounded-full px-5 py-2 text-sm font-semibold">
            See the rate card
          </Link>
          <Link href="/discord-bot" className="ghost-btn pressable rounded-full px-5 py-2 text-sm font-semibold">
            Add the bot to your server
          </Link>
          <Link href="/blog" className="ghost-btn pressable inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm">
            <Icon name="type" size={14} /> Longer reads
          </Link>
        </div>
      </section>
    </div>
  );
}
