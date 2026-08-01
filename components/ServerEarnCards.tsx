import Link from "next/link";
import Icon from "@/components/Icon";
import AddBotButton from "@/components/AddBotButton";
import { EARN_STAGES_DEFAULT, type EarnStage } from "@/lib/pricing";

// The other half of the marketplace.
//
// Brands see three cards and pay. Server owners see three cards and get paid.
// Deliberately the same visual language as the brand tiers — same rounded glass
// card, same badge, same ticked list, same rhythm — because the symmetry IS the
// pitch: the money a brand puts in at the top of the page comes out here.
//
// The one thing this must never soften: the threshold is LINKED gamers, not
// members. A 40,000-member server that has linked nobody earns nothing, and an
// owner who discovers that after installing is an owner we've lost.

export default function ServerEarnCards({
  stages = EARN_STAGES_DEFAULT,
  title = "Your community is media. Get paid like it.",
  subtitle = "You bring the audience; Cluster brings the monetization layer. Brands sponsor weekly challenges in the games your members already play, your members win the prize money, and you take a share of the platform fee on every one. Installing is free, and every stage below unlocks on one number: how many of them link a game account.",
  installUrl,
  compact = false,
}: {
  stages?: EarnStage[];
  title?: string;
  subtitle?: string;
  installUrl?: string;
  compact?: boolean;
}) {
  const first = stages[0];
  return (
    <div>
      <div className="text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-xs text-sky-200/90 mb-5">
          <Icon name="satellite" size={12} /> For Discord server owners
        </div>
        <h2 className="text-3xl md:text-4xl font-bold leading-tight">{title}</h2>
        <p className="text-muted mt-3 leading-relaxed">{subtitle}</p>
      </div>

      {/* Step zero — free, and the only thing standing between an owner and
          stage one. Kept visually lighter than the stages so it reads as the
          starting line rather than a fourth tier. */}
      <div className="mt-8 glass rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 border border-sky-400/20">
        <div className="h-11 w-11 rounded-xl bg-sky-500/15 border border-sky-400/30 grid place-items-center shrink-0">
          <Icon name="rocket" size={20} className="text-sky-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold">Free to join. Always.</div>
          <p className="text-sm text-muted mt-1 leading-relaxed">
            Install the bot, run your first challenge, and start linking gamers. There is nothing to pay,
            nothing to configure, and the bot never reads a message in your server.
          </p>
        </div>
        {installUrl ? <AddBotButton label="Install ClusterBot" /> : (
          <Link href="/discord-bot" className="ghost-btn pressable rounded-full px-5 py-2.5 text-sm shrink-0">How it works</Link>
        )}
      </div>

      <div className="mt-5 grid lg:grid-cols-3 gap-5 items-stretch">
        {stages.map((s, i) => (
          <div
            key={s.key}
            className={`glass rounded-3xl p-6 flex flex-col relative overflow-hidden ${
              i === 1 ? "ring-1 ring-sky-400/40 lg:-mt-3 lg:mb-3" : ""
            }`}
          >
            <div className={`absolute inset-x-0 top-0 h-1 ${
              i === 0 ? "bg-sky-500/70" : i === 1 ? "bg-sky-400" : "bg-amber-400"
            }`} />

            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-muted bg-white/5 border border-white/10 rounded-full px-2.5 py-1">
                  Stage {i + 1}
                </div>
                <h3 className="text-2xl font-bold mt-3">{s.name}</h3>
              </div>
              <Icon name={s.icon} size={26} className={i === 2 ? "text-amber-300 shrink-0 mt-1" : "text-sky-300 shrink-0 mt-1"} />
            </div>

            <div className="mt-4">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold grad-text">{s.threshold.toLocaleString()}</span>
                <span className="text-sm text-muted">linked gamers</span>
              </div>
              <div className="text-[11px] text-muted mt-1">not members — gamers who linked a game account</div>
              {/* The pay rate, next to the price of admission. These two
                  numbers together ARE the offer; separating them turns a deal
                  into a slogan. */}
              <div className="mt-3 inline-flex items-baseline gap-1.5 rounded-full border border-emerald-400/35 bg-emerald-500/10 px-3 py-1">
                <span className="text-lg font-bold text-emerald-300 tabular-nums">{s.ownerPct}%</span>
                <span className="text-[11px] text-emerald-100/80">of every sponsored challenge</span>
              </div>
            </div>

            <div className="mt-4 text-sm font-semibold text-ink">{s.headline}</div>
            {!compact && <p className="text-sm text-muted mt-1.5 leading-relaxed">{s.detail}</p>}

            <ul className="mt-4 space-y-2 flex-1">
              {s.perks.map((p) => (
                <li key={p} className="flex items-start gap-2 text-sm">
                  <Icon name="check" size={14} className={`mt-1 shrink-0 ${i === 2 ? "text-amber-300" : "text-sky-300"}`} />
                  <span className="text-muted leading-snug">{p}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/servers"
              className={`pressable mt-5 block rounded-full px-6 py-3 text-center font-semibold text-sm ${
                i === 1 ? "bg-sky-500 text-[#001427]" : "ghost-btn"
              }`}
            >
              {i === 0 ? "See who's earning" : "See the ladder"}
            </Link>
          </div>
        ))}
      </div>

      <p className="mt-5 text-center text-xs text-muted max-w-2xl mx-auto leading-relaxed">
        <Icon name="alert" size={12} className="inline mr-1.5 -mt-0.5 text-amber-300" />
        Size alone doesn&apos;t unlock anything. A server with 50,000 members and no linked accounts earns nothing —
        the {first ? first.threshold.toLocaleString() : "500"} is how we prove to a brand that the audience is real,
        and it is the same number for everyone.
      </p>
    </div>
  );
}
