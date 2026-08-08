import Link from "next/link";
import Icon from "@/components/Icon";
import { pairs, money, prizeSharePct, marginPerChallenge, type PricingConfig } from "@/lib/pricing";
import { cardBgStyle, type CardBgMap } from "@/lib/card-bg";
import LoopRing from "@/components/viz/LoopRing";

// The commercial argument, in sections.
//
// One module rather than four page-local blocks, because the home page and the
// pricing page have to tell the same story in the same words — a brand who reads
// the pitch on one and a different pitch on the other believes neither. Every
// string comes from the CMS and every band takes admin-set background art.

type Copy = Record<string, string>;

function Band({
  children, bg, bgKey, className = "", id,
}: { children: React.ReactNode; bg?: CardBgMap; bgKey?: string; className?: string; id?: string }) {
  const art = bgKey ? cardBgStyle(bg, bgKey) : undefined;
  return (
    <section id={id} className={`relative ${className}`} style={art ? { background: art } : undefined}>
      {/* Fade the band into the page above and below, so admin art never lands
          as a hard rectangle in the middle of the scroll. */}
      {art && <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-[#04051a] via-transparent to-[#04051a]" />}
      <div className="relative mx-auto max-w-6xl px-4">{children}</div>
    </section>
  );
}

function SectionHead({ eyebrow, title, subtitle, icon }: { eyebrow?: string; title: string; subtitle?: string; icon?: string }) {
  return (
    <div className="max-w-3xl">
      {eyebrow && (
        <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-xs text-cyan-200/90 mb-5">
          {icon && <Icon name={icon} size={12} />} {eyebrow}
        </div>
      )}
      <h2 className="text-3xl md:text-5xl font-bold leading-[1.1] tracking-tight">{title}</h2>
      {subtitle && <p className="text-muted mt-4 text-lg leading-relaxed">{subtitle}</p>}
    </div>
  );
}

// ===== 1. The problem: three ways to overpay =====

export function ProblemSection({ c, bg }: { c: Copy; bg?: CardBgMap }) {
  const items = pairs(c["brand.problem.items"]);
  const icons = ["trophy", "monitor", "lock"];
  return (
    <Band bg={bg} bgKey="sec_problem" className="py-20">
      <SectionHead eyebrow="The problem" icon="alert" title={c["brand.problem.title"]} subtitle={c["brand.problem.subtitle"]} />
      <div className="mt-10 grid md:grid-cols-3 gap-5">
        {items.map((it, i) => (
          <div key={it.title} className="glass rounded-2xl p-6 card-lift">
            <div className="h-11 w-11 rounded-xl bg-rose-500/10 border border-rose-400/25 grid place-items-center">
              <Icon name={icons[i] ?? "alert"} size={20} className="text-rose-300" />
            </div>
            <div className="font-bold mt-4 text-lg leading-snug">{it.title}</div>
            <p className="text-sm text-muted mt-2 leading-relaxed">{it.note}</p>
          </div>
        ))}
      </div>
    </Band>
  );
}

// ===== 2. The insight: the door with no handle =====
//
// The most important 400 words on the site. Given the most space, the biggest
// type, and a two-number scoreboard that states the whole thesis without prose.

export function InsightSection({ c, bg }: { c: Copy; bg?: CardBgMap }) {
  const body = (c["brand.insight.body"] || "").split("\n").map((p) => p.trim()).filter(Boolean);
  return (
    <Band bg={bg} bgKey="sec_insight" className="py-24 border-y border-violet-500/15">
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <SectionHead eyebrow="Why it's so expensive" icon="target" title={c["brand.insight.title"]} />
          <div className="mt-6 space-y-4">
            {body.map((p, i) => (
              <p key={i} className={`leading-relaxed ${i === body.length - 1 ? "text-ink font-medium" : "text-muted"}`}>{p}</p>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="glass rounded-3xl p-8 text-center">
            <div className="text-6xl font-bold brand-text leading-none">{c["brand.insight.stat"]}</div>
            <div className="text-xs uppercase tracking-widest text-muted mt-4 leading-relaxed">{c["brand.insight.statLabel"]}</div>
          </div>
          <div className="glass rounded-3xl p-8 text-center border border-rose-400/25">
            <div className="text-6xl font-bold leading-none text-rose-300">{c["brand.insight.stat2"]}</div>
            <div className="text-xs uppercase tracking-widest text-muted mt-4 leading-relaxed">{c["brand.insight.stat2Label"]}</div>
          </div>
          <div className="col-span-2 glass rounded-3xl p-6 flex items-center gap-4">
            <Icon name="spark" size={22} className="text-cyan-300 shrink-0" />
            <p className="text-sm text-muted leading-relaxed">
              They pick up their phone between two matches and might see you on TikTok.
              They were on Discord before that, and they&apos;re back on Discord after.
              Discord is home.
            </p>
          </div>
        </div>
      </div>
    </Band>
  );
}

// ===== 3. The solution =====

export function SolutionSection({ c, bg }: { c: Copy; bg?: CardBgMap }) {
  const items = pairs(c["brand.solution.items"]);
  const icons = ["satellite", "shield", "flame", "trophy"];
  return (
    <Band bg={bg} bgKey="sec_solution" className="py-20">
      <SectionHead eyebrow="The solution" icon="rocket" title={c["brand.solution.title"]} subtitle={c["brand.solution.subtitle"]} />
      <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((it, i) => (
          <div key={it.title} className="glass rounded-2xl p-5 card-lift">
            <Icon name={icons[i] ?? "spark"} size={22} className="text-cyan-300" />
            <div className="font-bold mt-3 leading-snug">{it.title}</div>
            <p className="text-sm text-muted mt-2 leading-relaxed">{it.note}</p>
          </div>
        ))}
      </div>
    </Band>
  );
}

// ===== 4. The loyalty loop =====

export function LoopSection({ c, bg }: { c: Copy; bg?: CardBgMap }) {
  // Drawn as a ring, not as numbered boxes with an arrow between them.
  //
  // The old layout was four cards in a row with a chevron in the gaps, which
  // reads as a four-step process that ends — the opposite of the claim being
  // made. A closed loop with the last node feeding the first says "this runs
  // again next week" without a caption, and it is the layout that was asked
  // for everywhere it appeared.
  const items = pairs(c["brand.loop.items"]).map((p, i) => ({ key: `l${i}`, title: p.title, body: p.note }));
  return (
    <Band bg={bg} bgKey="sec_loop" className="py-20">
      <LoopRing
        title={c["brand.loop.title"]}
        subtitle={c["brand.loop.subtitle"]}
        nodes={items}
      />
    </Band>
  );
}

// ===== 5. The prize economics =====
//
// The trust section. A brand's first unspoken question about a sponsored
// competition is "who actually pays the winner, and what if they don't" — so the
// numbers are stated plainly, and they're read from the same config the pricing
// page prices from, so they cannot drift apart.

export function PrizeSection({ c, cfg, bg }: { c: Copy; cfg: PricingConfig; bg?: CardBgMap }) {
  const perMonth = cfg.games * cfg.challengesPerGame;
  const total = perMonth * cfg.prizePool;
  const share = prizeSharePct(cfg);
  const keep = marginPerChallenge(cfg);
  return (
    <Band bg={bg} bgKey="sec_pricing" className="py-16">
      <div className="glass rounded-3xl p-8 md:p-10">
        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-xs text-amber-200 bg-amber-500/10 border border-amber-400/30 rounded-full px-3 py-1.5">
              <Icon name="trophy" size={12} /> Where your money goes
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mt-4 leading-tight">{c["brand.prize.title"]}</h2>
            <p className="text-muted mt-3 leading-relaxed">{c["brand.prize.body"]}</p>

            {/* The split, as a bar. A sentence claiming a share goes to players
                is a claim; a bar drawn at that share is the argument — and it is
                drawn from `prizeSharePct`, so it cannot disagree with the price. */}
            <div className="mt-7">
              <div className="flex items-baseline justify-between text-xs mb-2">
                <span className="text-muted">One sponsored challenge</span>
                <span className="font-bold">{money(cfg.challengePrice, cfg.currency)}</span>
              </div>
              <div className="h-10 rounded-xl overflow-hidden flex border border-white/10">
                <div
                  className="bg-gradient-to-r from-amber-500 to-amber-400 grid place-items-center text-[#1a1200] text-xs font-bold"
                  style={{ width: `${share}%` }}
                >
                  {money(cfg.prizePool, cfg.currency)} to players
                </div>
                <div className="flex-1 bg-white/10 grid place-items-center text-xs text-muted font-semibold">
                  {money(keep, cfg.currency)}
                </div>
              </div>
              <div className="flex justify-between text-[11px] text-muted mt-2">
                <span><b className="text-amber-300">{share}%</b> prize money, paid as branded trophies</span>
                <span>{100 - share}% runs the platform</span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Podium place={1} amount={cfg.prize1} currency={cfg.currency} />
              <Podium place={2} amount={cfg.prize2} currency={cfg.currency} />
              <Podium place={3} amount={cfg.prize3} currency={cfg.currency} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Fact value={money(cfg.challengePrice, cfg.currency)} label="per sponsored weekly challenge" />
            <Fact value={String(cfg.challengesPerGame)} label="challenges per game, every month" />
            <Fact value={String(perMonth)} label="challenges a month across the network" />
            <Fact value={money(total, cfg.currency)} label="won by gamers every month" gold />
          </div>
        </div>
      </div>
    </Band>
  );
}

function Podium({ place, amount, currency }: { place: number; amount: number; currency: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-black/30 border border-white/10 px-4 py-2.5">
      <span className={`rank-chip rank-chip-${place} !h-7 !min-w-7 text-xs`}>{place}</span>
      <span className="font-bold text-lg">{money(amount, currency)}</span>
    </div>
  );
}

function Fact({ value, label, gold = false }: { value: string; label: string; gold?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${gold ? "bg-amber-500/10 border-amber-400/30" : "bg-black/25 border-white/10"}`}>
      <div className={`text-2xl font-bold leading-none ${gold ? "text-amber-300" : "brand-text"}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-muted mt-2 leading-snug">{label}</div>
    </div>
  );
}

// ===== 6. The brand hero — used at the top of /pricing =====

export function BrandHero({ c, stats }: { c: Copy; stats?: { label: string; value: string }[] }) {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-14 pb-10">
      <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-xs text-cyan-200/90 mb-6">
        <span className="inline-block h-2 w-2 rounded-full bg-cyan-300 animate-pulse" />
        {c["brand.hero.badge"]}
      </div>
      <h1 className="text-4xl md:text-6xl font-bold leading-[1.05] tracking-tight max-w-4xl">
        {c["brand.hero.title"]}<br />
        <span className="brand-text">{c["brand.hero.title2"]}</span>
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-muted leading-relaxed">{c["brand.hero.subtitle"]}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="#plans" className="brand-btn pressable rounded-full px-7 py-3 font-semibold text-white">
          {c["brand.hero.cta.primary"]} <Icon name="arrowDown" size={15} className="ml-1" />
        </Link>
        <Link href="/dataroom/company-profile" className="ghost-btn pressable rounded-full px-6 py-3">
          {c["brand.hero.cta.secondary"]}
        </Link>
      </div>
      {stats && stats.length > 0 && (
        <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="glass rounded-2xl px-4 py-4">
              <div className="text-2xl font-bold brand-text leading-none">{s.value}</div>
              <div className="text-[11px] uppercase tracking-wider text-muted mt-2">{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
