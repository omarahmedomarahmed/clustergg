import { getContent, CONTENT_DEFAULTS } from "@/lib/cms";
import { saveContent } from "@/app/actions/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Site content" };

const GROUPS: { title: string; note?: string; keys: { key: string; label: string; long?: boolean }[] }[] = [
  {
    title: "Homepage hero",
    keys: [
      { key: "hero.badge", label: "Badge pill text" },
      { key: "hero.title.line1", label: "Headline line 1" },
      { key: "hero.title.line2", label: "Headline line 2 (gradient)" },
      { key: "hero.subtitle", label: "Subtitle", long: true },
      { key: "hero.cta.primary", label: "Primary button" },
      { key: "hero.cta.secondary", label: "Secondary button" },
      { key: "hero.image", label: "Hero background image URL" },
    ],
  },
  {
    title: "Section headings",
    keys: [
      { key: "section.challenges.title", label: "Challenges title" },
      { key: "section.challenges.subtitle", label: "Challenges subtitle", long: true },
      { key: "section.games.title", label: "Games title" },
      { key: "section.games.subtitle", label: "Games subtitle", long: true },
      { key: "section.leaderboards.title", label: "Leaderboards title" },
      { key: "section.leaderboards.subtitle", label: "Leaderboards subtitle", long: true },
      { key: "section.badges.title", label: "Badges title" },
      { key: "section.badges.subtitle", label: "Badges subtitle", long: true },
      { key: "section.partners.title", label: "Partners strip label" },
    ],
  },
  // ===== Commercial =====
  // The numbers sales quotes and the argument the site makes. Grouped together
  // because they move together: a price change without the copy that justifies
  // it is how a pricing page starts contradicting itself.
  {
    title: "Pricing — the numbers",
    note:
      "Everything the pricing page, the home pricing section and the /brands quote calculator run on. "
      + "Amounts are in whole US dollars per month. Leave a field empty to use the built-in default.",
    keys: [
      { key: "pricing.games", label: "Commercialised games (slider max)" },
      { key: "pricing.challengesPerGame", label: "Sponsored challenges per game, per month" },
      // C2. The pool and the three prizes are DERIVED from these — they used to
      // be four dollar fields, which meant raising the price quietly cut the
      // share we promise players. Setting the percentage instead keeps the
      // promise fixed while the price moves.
      { key: "pricing.prizePct", label: "Prize pool — % of what the brand pays (the pool and the three prizes follow)" },
      { key: "pricing.prizeW1", label: "1st place weight (4 : 2 : 1 gives 100 / 50 / 25 at a $175 pool)" },
      { key: "pricing.prizeW2", label: "2nd place weight" },
      { key: "pricing.prizeW3", label: "3rd place weight" },
      { key: "pricing.challengePrice", label: "Charged per sponsored challenge — the package IS this number" },
      // C11: retired to 0. v2 sells one package with placements and the
      // broadcast included. Left editable so a base can be priced back up
      // deliberately — set to 0 the lines are omitted from an invoice rather
      // than printed as "$0", which reads as a fee somebody forgot to fill in.
      { key: "pricing.reachBase", label: "RETIRED (0) — old placements-only monthly base" },
      { key: "pricing.challengeBase", label: "RETIRED (0) — old challenge-tier monthly base" },
      { key: "pricing.ultimateBase", label: "RETIRED (0) — old all-games monthly base" },
      { key: "pricing.streamAddon", label: "RETIRED (0) — the Sunday broadcast comes with the package now" },
      { key: "pricing.yearlyDiscountPct", label: "Annual discount (%)" },
      { key: "pricing.slotCount", label: "Ultimate — video slots included" },
      { key: "pricing.slotSeconds", label: "Ultimate — seconds per video slot" },
      { key: "pricing.impressionsPerMember", label: "Projection: placement views per member per month" },
      { key: "pricing.gameSlugs", label: "Sponsorable games (comma-separated slugs; empty = catalogue order)", long: true },
    ],
  },
  // ===== The plan for the money =====
  //
  // These drive the financial-model document, the use-of-funds slide and every
  // figure quoted next to them. They are here rather than hard-coded because a
  // plan that can only be changed by a deploy is one that goes stale the first
  // time a conversation with an investor changes it — and a deck quoting a
  // number the model no longer computes is worse than no deck.
  {
    title: "The financial model — assumptions",
    note:
      "Every figure in the financial-model document and on the use-of-funds slide is computed from these. "
      + "Nothing here is typed twice, so the deck and the model cannot disagree. Leave a field empty for the built-in default.",
    keys: [
      { key: "finance.raise", label: "Raising (USD)" },
      { key: "finance.equityPct", label: "For this % of the company (post-money)" },
      { key: "finance.months", label: "Months the raise has to last" },
      { key: "finance.targetBrands", label: "Brands given a free first month" },
      { key: "finance.freeChallengesPerBrand", label: "Free challenges each of them gets" },
      { key: "finance.brandsConverting", label: "Of those, how many stay and pay" },
      { key: "finance.revenuePerBrand", label: "What a paying brand pays per month" },
      { key: "finance.targetServers", label: "Discord servers onboarded" },
      { key: "finance.welcomeChallengeCost", label: "Welcome challenge funded per server" },
      { key: "finance.membersPerServer", label: "Members in a typical server" },
      { key: "finance.linkedPerServer", label: "Of those, how many link a game account" },
      { key: "finance.games", label: "Games we run challenges on" },
      { key: "finance.challengesPerGamePerMonth", label: "Challenges per game per month" },
      { key: "finance.techBudget", label: "Infrastructure, APIs & partnerships (whole period)" },
      { key: "finance.hires", label: "People" },
      { key: "finance.hireMonthlyCost", label: "Cost of each person, per month" },
      // `finance.sponsorsUseHouseInventory` was here. C8: the commercial model
      // answers it — half of what a brand pays IS the prize pool — so a
      // checkbox that could contradict the model is one somebody would tick.
    ],
  },
  {
    title: "Card rendering — the cost ceilings",
    note:
      "B77. Every card the bot draws is a render, and every render is billed. These are the ceilings; "
      + "past them we serve the last good card rather than failing, because a stale card is a card and a "
      + "missing one is a broken Discord message. 4,000/day is roughly 200 active gamers — raise it "
      + "deliberately, with the graph in front of you, not because something looked slow.",
    keys: [
      { key: "cards.dailyRenderCeiling", label: "Renders per day, network-wide (0 stops drawing entirely)" },
      { key: "cards.dailyPreviewCeiling", label: "Profile-editor previews per day — their own line, so one gamer fiddling with colours cannot eat the network's allowance" },
      { key: "cards.storeCap", label: "Stored cards kept before least-recently-used eviction" },
    ],
  },
  {
    title: "Pricing — the copy",
    note: "Feature lists are one bullet per line. The FAQ is one 'Question | Answer' per line.",
    keys: [
      { key: "pricing.eyebrow", label: "Section eyebrow" },
      { key: "pricing.title", label: "Pricing headline" },
      { key: "pricing.subtitle", label: "Pricing subtitle", long: true },
      { key: "pricing.tier.reach.name", label: "Tier 1 name" },
      { key: "pricing.tier.reach.tagline", label: "Tier 1 tagline" },
      { key: "pricing.tier.reach.features", label: "Tier 1 features (one per line)", long: true },
      { key: "pricing.tier.challenge.name", label: "Tier 2 name" },
      { key: "pricing.tier.challenge.tagline", label: "Tier 2 tagline" },
      { key: "pricing.tier.challenge.features", label: "Tier 2 features (one per line)", long: true },
      { key: "pricing.tier.ultimate.name", label: "Tier 3 name" },
      { key: "pricing.tier.ultimate.tagline", label: "Tier 3 tagline" },
      { key: "pricing.tier.ultimate.features", label: "Tier 3 features (one per line)", long: true },
      { key: "pricing.addon.name", label: "Add-on name" },
      { key: "pricing.addon.tagline", label: "Add-on tagline" },
      { key: "pricing.addon.features", label: "Add-on features (one per line)", long: true },
      { key: "pricing.faq", label: "FAQ — 'Question | Answer' per line", long: true },
      { key: "pricing.note", label: "Small print under the plans", long: true },
      { key: "pricing.cta.primary", label: "Primary button" },
      { key: "pricing.cta.secondary", label: "Secondary button" },
      { key: "pricing.contact.email", label: "Sales email" },
    ],
  },
  {
    title: "The brand story",
    note:
      "The argument the home page and the pricing page both make, in the order they make it. "
      + "Card lists are 'Heading | body text', one per line.",
    keys: [
      { key: "brand.hero.badge", label: "Hero badge" },
      { key: "brand.hero.title", label: "Hero line 1" },
      { key: "brand.hero.title2", label: "Hero line 2 (gradient)" },
      { key: "brand.hero.subtitle", label: "Hero subtitle", long: true },
      { key: "brand.hero.cta.primary", label: "Hero primary button" },
      { key: "brand.hero.cta.secondary", label: "Hero secondary button" },
      { key: "brand.problem.title", label: "Problem — headline" },
      { key: "brand.problem.subtitle", label: "Problem — subtitle", long: true },
      { key: "brand.problem.items", label: "Problem — cards ('Heading | body' per line)", long: true },
      { key: "brand.insight.title", label: "Insight — headline" },
      { key: "brand.insight.body", label: "Insight — body (blank line between paragraphs)", long: true },
      { key: "brand.insight.stat", label: "Insight — big number 1" },
      { key: "brand.insight.statLabel", label: "Insight — label 1" },
      { key: "brand.insight.stat2", label: "Insight — big number 2" },
      { key: "brand.insight.stat2Label", label: "Insight — label 2" },
      { key: "brand.solution.title", label: "Solution — headline" },
      { key: "brand.solution.subtitle", label: "Solution — subtitle", long: true },
      { key: "brand.solution.items", label: "Solution — cards ('Heading | body' per line)", long: true },
      { key: "brand.loop.title", label: "Loyalty loop — headline" },
      { key: "brand.loop.subtitle", label: "Loyalty loop — subtitle", long: true },
      { key: "brand.loop.items", label: "Loyalty loop — steps ('Heading | body' per line)", long: true },
      { key: "brand.prize.title", label: "Prize pool — headline" },
      { key: "brand.prize.body", label: "Prize pool — body", long: true },
    ],
  },
  {
    title: "Server owners & the Discord bot",
    keys: [
      { key: "discord.badge", label: "Home section badge" },
      { key: "discord.title", label: "Home section title" },
      { key: "discord.subtitle", label: "Home section subtitle", long: true },
      { key: "discord.cta.primary", label: "Primary button" },
      { key: "discord.cta.secondary", label: "Secondary button" },
      { key: "discord.hero.title", label: "/discord-bot hero title" },
      { key: "discord.hero.subtitle", label: "/discord-bot hero subtitle", long: true },
      { key: "discord.unlock.threshold", label: "Linked gamers required to unlock monetization" },
    ],
  },
  {
    title: "Home hero banner",
    note: "The collapsed galaxy strip at the top of the home page.",
    keys: [
      { key: "hero.banner.label", label: "Banner label" },
      { key: "hero.banner.note", label: "Banner note", long: true },
    ],
  },
  {
    title: "Call to action & footer",
    keys: [
      { key: "section.cta.title", label: "CTA title" },
      { key: "section.cta.subtitle", label: "CTA subtitle", long: true },
      { key: "section.cta.button", label: "CTA button" },
      { key: "footer.tagline", label: "Footer tagline", long: true },
      { key: "footer.brands.title", label: "Footer — brands column heading" },
      { key: "footer.servers.title", label: "Footer — server owners column heading" },
    ],
  },
  {
    title: "Sharing",
    note: "Used by the profile share button on the site AND by /cluster show:share in Discord. {name} and {url} are replaced automatically.",
    keys: [
      { key: "share.profile.message", label: "Profile share message", long: true },
    ],
  },
  {
    title: "Background imagery",
    note: "Any hosted image URL. These back the challenges section, games pages and default profile banners.",
    keys: [
      { key: "banner.arena", label: "Challenges arena banner URL" },
      { key: "banner.games", label: "Games banner URL" },
      { key: "banner.profileDefault", label: "Default profile banner URL" },
    ],
  },
];

export default async function AdminContentPage() {
  const allKeys = GROUPS.flatMap((g) => g.keys.map((k) => k.key));
  const values = await getContent(allKeys);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Site content</h1>
      <p className="text-sm text-muted mb-6">
        Every headline, button label and background image on the public site — stored in the
        database, applied instantly. Empty field = built-in default.
      </p>

      <form action={saveContent} className="space-y-6">
        {GROUPS.map((group) => (
          <section key={group.title} className="glass p-6">
            <h2 className="font-bold mb-1">{group.title}</h2>
            {group.note && <p className="text-xs text-muted mb-4">{group.note}</p>}
            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              {group.keys.map(({ key, label, long }) => (
                <div key={key} className={long ? "sm:col-span-2" : ""}>
                  <label className="text-xs text-muted block mb-1">
                    {label} <code className="text-[10px] text-cyan-300/70">{key}</code>
                  </label>
                  {long ? (
                    <textarea name={`content:${key}`} rows={2} defaultValue={values[key]} className="input-cosmic" />
                  ) : (
                    <input name={`content:${key}`} defaultValue={values[key]} className="input-cosmic" />
                  )}
                  {CONTENT_DEFAULTS[key] && values[key] !== CONTENT_DEFAULTS[key] && (
                    <div className="text-[10px] text-amber-300/70 mt-1">Customized (default: {CONTENT_DEFAULTS[key].slice(0, 60)}…)</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
        <button className="glow-btn pressable rounded-full px-8 py-2.5 font-semibold text-white">
          Publish changes
        </button>
      </form>
    </div>
  );
}
