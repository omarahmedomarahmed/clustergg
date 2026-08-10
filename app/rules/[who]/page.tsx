import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import { AUDIENCES, rulesByTopic, type Audience } from "@/lib/rules";
import { JOURNEYS } from "@/lib/journeys";
import Journey from "@/components/rules/Journey";
import MoneyFlow from "@/components/rules/MoneyFlow";
import Lifecycle from "@/components/rules/Lifecycle";

export const dynamic = "force-static";

const WHO: Audience[] = ["gamer", "owner", "brand"];

export async function generateMetadata({ params }: { params: Promise<{ who: string }> }) {
  const { who } = await params;
  const a = AUDIENCES[who as Audience];
  return a ? { title: `${a.label} — how it works, and every rule` } : {};
}

/**
 * Per-audience colour. Not decoration: three pages that look identical are three
 * pages somebody thinks they have already read, and the switcher at the top is
 * the one control that has to be noticed.
 */
const ACCENT: Record<Audience, string> = {
  gamer: "#22d3ee",
  owner: "#34d399",
  brand: "#a78bfa",
};

/** Which share of the split this reader should care about first. */
const HIGHLIGHT: Record<Audience, "prize" | "server" | "cluster"> = {
  gamer: "prize",
  owner: "server",
  brand: "prize",
};

// The guide, to the person it binds. B90.10, rebuilt visually in B119.
//
// ===== WHAT WAS WRONG WITH THE VERSION BEFORE THIS =====
//
// It was a correct page nobody read: three columns of rule cards, twenty-seven
// of them across the three audiences, each with its reason attached. Every word
// of it was true and imported from the code that enforces it — and it answered
// a question people ask second.
//
// The question they ask first is "what actually happens, and in what order",
// and a rule list can only answer that if you already know the sequence well
// enough to sort it yourself. Somebody who has just installed the bot does not.
//
// So the path comes first, drawn and walkable, with one helper sentence per
// step — the sentence that stops that step going wrong. Then the two diagrams
// that explain the machine underneath: where the money splits, and what a
// challenge does week by week. The rules stay, in full, underneath all of it,
// for the reader who came for the fine print.
//
// ===== EVERY FIGURE IS STILL IMPORTED =====
//
// The journey pulls from `stepsFor`, the wallet floor, the vault split, the
// private-challenge margin and the stage machine; the rules pull from the same
// places they always did. There is no second copy of any number on this page to
// go stale, which is what makes it safe to state them this plainly.
export default async function RulesPage({ params }: { params: Promise<{ who: string }> }) {
  const { who } = await params;
  if (!WHO.includes(who as Audience)) notFound();
  const audience = who as Audience;
  const a = AUDIENCES[audience];
  const groups = rulesByTopic(audience);
  const accent = ACCENT[audience];

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:py-16">
      <div className="flex flex-wrap gap-2">
        {WHO.map((w) => (
          <Link
            key={w}
            href={`/rules/${w}`}
            className="rounded-full border px-4 py-1.5 text-xs font-semibold transition"
            style={w === audience
              ? { borderColor: `${ACCENT[w]}80`, background: `${ACCENT[w]}1a`, color: ACCENT[w] }
              : { borderColor: "rgba(255,255,255,0.12)" }}
          >
            {AUDIENCES[w].label}
          </Link>
        ))}
      </div>

      <h1 className="mt-6 text-3xl font-bold sm:text-4xl">{a.label}</h1>
      <p className="mt-3 max-w-2xl text-muted">{a.lede}</p>

      {/* ===== 1. The path ===== */}
      <section className="mt-10">
        <h2 className="text-[11px] uppercase tracking-[0.2em]" style={{ color: accent }}>
          What happens, in order
        </h2>
        <div className="mt-3">
          <Journey steps={JOURNEYS[audience]} accent={accent} />
        </div>
      </section>

      {/* ===== 2. The machine underneath ===== */}
      <section className="mt-12 space-y-4">
        <h2 className="text-[11px] uppercase tracking-[0.2em]" style={{ color: accent }}>
          How the money and the week work
        </h2>
        <MoneyFlow highlight={HIGHLIGHT[audience]} />
        <Lifecycle />
      </section>

      {/* ===== 3. The rules, in full ===== */}
      <section className="mt-12">
        <h2 className="text-[11px] uppercase tracking-[0.2em]" style={{ color: accent }}>
          Every rule, and why it exists
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Nothing below is new — it is the same product, written as the promises it makes. Each rule
          carries its reason on the same line, because a rule with no reason reads as an obstacle and
          gets worked around.
        </p>

        <div className="mt-6 space-y-8">
          {groups.map((g) => (
            <div key={g.topic}>
              <h3 className="text-sm font-bold text-ink">{g.topic}</h3>
              <div className="mt-3 space-y-3">
                {g.rules.map((r) => (
                  <div key={r.rule} className="glass p-5">
                    <p className="font-semibold leading-snug">{r.rule}</p>
                    {/* The reason, always, and never in smaller type than the
                        rule it explains — a reason people have to squint at is
                        one they will not read. */}
                    <p className="mt-2 flex items-start gap-2 text-sm leading-relaxed text-muted">
                      <Icon name="spark" size={13} className="mt-1 shrink-0" style={{ color: accent }} />
                      <span>{r.why}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-12 text-xs leading-relaxed text-muted">
        Every figure on this page is read from the code that enforces it, so it cannot quote a number
        we no longer use. If something here disagrees with what the product did to you, the page is
        wrong and we want to hear about it.
      </p>
    </div>
  );
}
