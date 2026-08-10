import Link from "next/link";
import { getDb } from "@/lib/db";
import { livePool } from "@/lib/pool-live";
import { BRACKETS, PARTICIPATION_SHARE, SCORE_WEIGHTS } from "@/lib/server-score";
import { installHref } from "@/lib/discord/config";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "This week's server pool · Cluster",
  description:
    "Every dollar in this week's server pool, who is competing for it, and what each server would be paid if the week ended now. Updated live.",
};

// The pool, in the open. B99.
//
// ===== THE ARGUMENT THIS PAGE MAKES =====
//
// A server owner's income is decided on a Monday by terms nobody outside the
// code had ever seen. That is an allowance, not a deal. This page turns it into
// a deal: here is the money, here is the table, here is what you would be paid
// if the week ended right now, and here is exactly what moves it.
//
// Public rather than owner-only, and that is the point. An owner can read the
// whole thing before installing anything, and the only reason to hide it would
// be that it does not survive being looked at.
//
// ===== NOTHING ON IT IS COMPUTED HERE =====
//
// Every number comes from `livePool`, which calls the same `standingFor` that
// writes Monday's cheques. A page that did its own arithmetic would drift from
// the payment, and the first time it drifted an owner would be right to say we
// made it up.

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TERM_LABEL: Record<string, { name: string; what: string }> = {
  exclusiveEntrants: {
    name: "Entrants you brought",
    what: "Someone who entered a sponsored challenge from your server. Shared between servers when they are in several, so nobody is counted twice.",
  },
  newlyQualified: {
    name: "New members who linked a game",
    what: "Members who linked a game account this week. It is the growth half of the score, and it is why a small server can out-earn a big quiet one.",
  },
  conversion: {
    name: "How many of yours turned up",
    what: "Entrants over your linked members. A server whose members link and then never play sees this fall — that is the term telling you so.",
  },
};

export default async function PoolPage() {
  const db = await getDb();
  const live = await livePool(db);
  const { standing } = live;
  const paidTo = new Map(standing.payouts.map((p) => [p.guildId, p.amount] as const));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      {/* ===== The money, first ===== */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.14] via-transparent to-cyan-500/[0.10] p-6 sm:p-8">
        <div className="text-[10px] uppercase tracking-widest text-emerald-200/80">
          The server pool · week of {live.week}
        </div>
        <div className="mt-1 text-5xl font-black tabular-nums text-emerald-200 sm:text-6xl">
          {money(live.pool)}
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          {live.allocated
            ? <>Released for the servers running challenges this week, and divided between them on Monday.
                {live.daysLeft > 0 && <> <b className="text-ink">{live.daysLeft} day{live.daysLeft === 1 ? "" : "s"} left</b> — every number below still moves.</>}</>
            : <>Nothing has been released for this week yet. It is topped up as brands pay for the challenges
                running now, and what is not released stays in the vault rather than disappearing.</>}
        </p>

        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-white/12 bg-black/25 px-3 py-1.5">
            <b className="tabular-nums">{standing.servers.length}</b> server{standing.servers.length === 1 ? "" : "s"} competing
          </span>
          <span className="rounded-full border border-white/12 bg-black/25 px-3 py-1.5">
            <b className="tabular-nums">{PARTICIPATION_SHARE}%</b> paid flat to everyone who took part
          </span>
          <span className="rounded-full border border-white/12 bg-black/25 px-3 py-1.5">
            {/* Said out loud rather than hidden. An owner who can see a reserve
                exists has a reason to believe the pool is still here in
                January — and it is not a figure anybody is owed. */}
            <b className="tabular-nums">{money(live.reserve)}</b> held in reserve for quiet weeks
          </span>
        </div>
      </div>

      {/* ===== The table ===== */}
      <section className="glass mt-6 p-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-bold">Where it stands right now</h2>
          <span className="text-[11px] text-muted">
            If the week ended this second. It does not — this is the method, not a promise.
          </span>
        </div>

        {standing.servers.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted">{standing.reason}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-muted">
                <tr className="border-b border-white/10">
                  <th className="px-5 py-3 text-left font-semibold">Server</th>
                  <th className="px-3 py-3 text-left font-semibold">Bracket</th>
                  <th className="px-3 py-3 text-right font-semibold">Entrants</th>
                  <th className="px-3 py-3 text-right font-semibold">New linked</th>
                  <th className="px-3 py-3 text-right font-semibold">Score</th>
                  <th className="px-5 py-3 text-right font-semibold">Share so far</th>
                </tr>
              </thead>
              <tbody>
                {standing.servers.map((s) => (
                  <tr key={s.guildId} className="border-b border-white/[0.06] last:border-0">
                    <td className="px-5 py-3 font-semibold">{s.name}</td>
                    <td className="px-3 py-3 text-xs capitalize text-muted">{s.tier}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{s.exclusiveEntrants.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{s.newlyQualified}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{s.final}</td>
                    <td className="px-5 py-3 text-right font-bold tabular-nums text-emerald-300">
                      {money(paidTo.get(s.guildId) ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Every number that did not make it into the table, said rather than
            quietly dropped. A total that does not add up is the fastest way to
            lose somebody's trust in the rest of it. */}
        {/* M2. A "held under the payout floor" line was here, and it told owners
            the money "is in next week's pool". It was not. It went into a
            variable with no consumer and ceased to exist. There is no floor on
            a distribution now — every cent lands in a wallet — so there is
            nothing to explain away. */}
        {standing.skippedForProfile > 0 && (
          <div className="border-t border-white/10 px-5 py-3 text-[11px] leading-relaxed text-muted">
            <div>
                {standing.skippedForProfile} server{standing.skippedForProfile === 1 ? "" : "s"} carried an
                entrant but {standing.skippedForProfile === 1 ? "has" : "have"} not finished a server profile,
                so {standing.skippedForProfile === 1 ? "it is" : "they are"} not in the run. A brand buys a
              described community, not a number.
            </div>
          </div>
        )}
      </section>

      {/* ===== What moves it ===== */}
      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        {Object.keys(SCORE_WEIGHTS).map((k) => {
          const label = TERM_LABEL[k];
          const weight = standing.terms[k];
          if (!label) return null;
          return (
            <div key={k} className="glass p-5">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-sm font-bold">{label.name}</div>
                <div className="shrink-0 text-xs font-black tabular-nums text-cyan-300">
                  {weight ? `${weight}%` : "—"}
                </div>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{label.what}</p>
              {!weight && (
                // A term with no data anywhere in the week is DROPPED and its
                // weight redistributed, rather than scored as zero for
                // everybody — which would look earned and be handed out flat.
                <p className="mt-2 text-[11px] leading-relaxed text-amber-200/80">
                  Nothing to score on this week, so its weight went to the others.
                </p>
              )}
            </div>
          );
        })}
      </section>

      {/* ===== The brackets ===== */}
      <section className="glass mt-6 p-5">
        <h2 className="text-sm font-bold">You compete with servers your own size</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          A bracket decides who you are ranked against and what slice of the pool that group divides.
          It is not a rate — nobody earns a percentage for being big.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {BRACKETS.map((b) => (
            <span key={b.key} className="rounded-full border border-white/12 bg-black/25 px-3 py-1.5">
              <b className="capitalize">{b.key}</b> · {b.share}% of the pool
            </span>
          ))}
        </div>
      </section>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <a href={installHref() ?? "/servers"} className="glow-btn pressable rounded-full px-6 py-2.5 text-sm font-semibold text-white">
          Add the bot to your server
        </a>
        <Link href="/rules/owner" className="ghost-btn pressable rounded-full px-6 py-2.5 text-sm">
          How the pool works, step by step
        </Link>
      </div>
    </div>
  );
}
