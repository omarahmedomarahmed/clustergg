import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import { AUDIENCES, rulesByTopic, type Audience } from "@/lib/rules";

export const dynamic = "force-static";

const WHO: Audience[] = ["gamer", "owner", "brand"];

export async function generateMetadata({ params }: { params: Promise<{ who: string }> }) {
  const { who } = await params;
  const a = AUDIENCES[who as Audience];
  return a ? { title: `${a.label} — every rule, and why` } : {};
}

// Every rule, to the person it binds. B90.10.
//
// Three pages, one per audience, and each rule carries its reason on the same
// line. A rule with no reason reads as an obstacle and gets worked around; a
// rule whose reason is about US reads as an obstacle we benefit from.
//
// Every number here is imported from the code that enforces it — see the note
// at the top of lib/rules.ts. The guide cannot quote a stale figure, because
// there is no second copy of the figure to go stale.
export default async function RulesPage({ params }: { params: Promise<{ who: string }> }) {
  const { who } = await params;
  if (!WHO.includes(who as Audience)) notFound();
  const audience = who as Audience;
  const a = AUDIENCES[audience];
  const groups = rulesByTopic(audience);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <div className="flex flex-wrap gap-2">
        {WHO.map((w) => (
          <Link
            key={w}
            href={`/rules/${w}`}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
              w === audience
                ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-200"
                : "border-white/12 text-muted hover:border-white/25"
            }`}
          >
            {AUDIENCES[w].label}
          </Link>
        ))}
      </div>

      <h1 className="mt-6 text-3xl font-bold sm:text-4xl">{a.label}</h1>
      <p className="mt-3 max-w-2xl text-muted">{a.lede}</p>

      <div className="mt-10 space-y-10">
        {groups.map((g) => (
          <section key={g.topic}>
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">{g.topic}</h2>
            <div className="mt-3 space-y-3">
              {g.rules.map((r) => (
                <div key={r.rule} className="glass p-5">
                  <p className="font-semibold leading-snug">{r.rule}</p>
                  {/* The reason, always, and never in smaller type than the
                      rule it explains — a reason people have to squint at is
                      one they will not read. */}
                  <p className="mt-2 flex items-start gap-2 text-sm leading-relaxed text-muted">
                    <Icon name="spark" size={13} className="mt-1 shrink-0 text-violet-300" />
                    <span>{r.why}</span>
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-12 text-xs leading-relaxed text-muted">
        Every figure on this page is read from the code that enforces it, so it cannot quote a number
        we no longer use. If something here disagrees with what the product did to you, the page is
        wrong and we want to hear about it.
      </p>
    </div>
  );
}
