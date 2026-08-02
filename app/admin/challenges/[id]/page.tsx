import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { setParticipantStatus } from "@/app/actions/admin";
import { PROVIDERS, isProviderLive } from "@/lib/providers/registry";
import ChallengeBuilder, { type ChallengeEdit } from "@/components/ChallengeBuilder";
import Avatar from "@/components/Avatar";
import Icon from "@/components/Icon";
import Link from "next/link";
import { timeAgo } from "@/lib/utils";
import { seriesPlan } from "@/lib/challenge-series";
import { deliveryTotals } from "@/lib/challenge-delivery";
import { builderContext } from "@/lib/challenge-builder-data";

export const dynamic = "force-dynamic";

export default async function AdminChallengeLive({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const [challenge] = await db.select().from(schema.challenges).where(eq(schema.challenges.id, id)).limit(1);
  if (!challenge) notFound();

  const [participants, events, spaces, quests, ctx] = await Promise.all([
    db.select({ p: schema.challengeParticipants, u: schema.users, a: schema.linkedGameAccounts })
      .from(schema.challengeParticipants)
      .innerJoin(schema.users, eq(schema.challengeParticipants.userId, schema.users.id))
      .innerJoin(schema.linkedGameAccounts, eq(schema.challengeParticipants.linkedAccountId, schema.linkedGameAccounts.id))
      .where(eq(schema.challengeParticipants.challengeId, id))
      .orderBy(desc(schema.challengeParticipants.currentPoints)),
    db.select().from(schema.challengeEvents)
      .where(eq(schema.challengeEvents.challengeId, id))
      .orderBy(desc(schema.challengeEvents.createdAt)).limit(30),
    db.select().from(schema.spaces),
    db.select({ id: schema.quests.id, name: schema.quests.name, logoUrl: schema.quests.logoUrl }).from(schema.quests).orderBy(schema.quests.sortOrder),
    // Trophies, servers, brands, the rate card and the network's reach — the
    // same set the create page loads, from one place so the two can't drift.
    builderContext(),
  ]);

  const builderProviders = PROVIDERS
    .filter((p) => !p.identityOnly && p.capabilities.length > 0)
    .map((p) => ({ id: p.id, name: p.name, game: p.game, live: isProviderLive(p), authType: p.authType, docsUrl: p.docsUrl, capabilities: p.capabilities.map((c) => ({ key: c.key, label: c.label, unit: c.unit, higherIsBetter: c.higherIsBetter })) }));

  const editData: ChallengeEdit = {
    id: challenge.id, spaceId: challenge.spaceId, provider: challenge.provider, game: challenge.game,
    title: challenge.title, description: challenge.description ?? "", format: challenge.format,
    cadence: challenge.cadence, heroType: challenge.heroType ?? "image", heroUrl: challenge.heroUrl,
    pointsEngine: (challenge.pointsEngine ?? {}) as Record<string, number>,
    conditions: ((challenge.rules as { conditions?: { metric: string; op: string; value: number }[] })?.conditions) ?? [],
    thresholdTarget: challenge.thresholdTarget, startAt: challenge.startAt.toISOString(), endAt: challenge.endAt.toISOString(),
    coverUrl: challenge.coverUrl, coverAdjust: (challenge.coverAdjust ?? { zoom: 1, x: 50, y: 50 }) as { zoom: number; x: number; y: number },
    trophyId: challenge.trophyId, status: challenge.status, prizeDescription: challenge.prizeDescription,
    prizes: challenge.prizes ?? null,
    gateQuestId: challenge.gateQuestId, gateMinBadges: challenge.gateMinBadges ?? 0,
    visibility: challenge.visibility ?? "public", guildId: challenge.guildId, guildIds: challenge.guildIds ?? [],
    accessKey: challenge.accessKey, announceHype: challenge.announceHype ?? false,
    sponsorBrandId: challenge.sponsorBrandId,
    sponsorCampaignId: challenge.sponsorCampaignId,
    sponsorPrice: Number(challenge.sponsorPrice ?? 0),
    runsPlanned: challenge.runsPlanned ?? 1, runIndex: challenge.runIndex ?? 1,
  };

  // Every run of this series, so an admin editing week 3 can see week 1 and 2
  // beside it. A repeating challenge is only comprehensible as a series.
  const plan = challenge.seriesId ? await seriesPlan(challenge.seriesId) : null;
  const reach = await deliveryTotals(id);

  return (
    <div className="space-y-6">
      <div className="glass p-6">
        <div className="text-xs uppercase tracking-widest text-cyan-300">{challenge.status} · {challenge.format}</div>
        <h1 className="text-2xl font-bold mt-1">{challenge.title}</h1>
        <p className="text-sm text-muted mt-1">
          {challenge.game} via {challenge.provider} · ends {timeAgo(challenge.endAt)} · scoring:{" "}
          {Object.entries((challenge.pointsEngine ?? {}) as Record<string, number>)
            .filter(([, v]) => v)
            .map(([k, v]) => `${v}× ${k.replace(/_/g, " ")}`)
            .join(", ") || "participation only"}
        </p>

        {/* What this run actually reached.
            Counted from the delivery ledger, not recomputed from today's server
            sizes — this is the number a brand is billed against, and it has to
            mean the same thing next year. Zero here with a live challenge means
            the announcement never landed, which is worth seeing immediately
            rather than discovering in a campaign report. */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat value={reach.servers.toLocaleString()} label="servers reached" />
          <Stat value={reach.members.toLocaleString()} label="gamers reached" />
          <Stat value={reach.linked.toLocaleString()} label="could enter" />
          <Stat value={participants.length.toLocaleString()} label="entered" gold />
        </div>
        {challenge.status === "active" && reach.servers === 0 && (
          <p className="mt-2 text-xs text-amber-300">
            This run has not landed in any server yet. Announce it from Admin → Discord, or check the
            bot can post in their channels — until it lands, its brand reach is zero.
          </p>
        )}

        {/* The series this run belongs to.
            A weekly challenge is four separate records, and an admin editing
            week 3 needs week 1 and 2 one click away — with what each delivered,
            because each is its own unit of revenue. */}
        {plan && (plan.runs.length > 1 || plan.upcoming.length > 0) && (
          <div className="mt-5 pt-5 border-t border-violet-500/15">
            <div className="text-xs uppercase tracking-widest text-muted">
              {plan.baseTitle} · {plan.runsPlanned > 0 ? `${plan.runsPlanned} ` : ""}{plan.cadence} run{plan.runsPlanned === 1 ? "" : "s"}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {plan.runs.map((r) => (
                <Link
                  key={r.id} href={`/admin/challenges/${r.id}`}
                  className={`rounded-xl border px-3 py-2 text-xs ${
                    r.id === id
                      ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-100"
                      : "border-white/10 bg-black/25 text-muted hover:border-white/25"
                  }`}
                >
                  <b className="block font-semibold">{r.title}</b>
                  <span>{r.status} · {r.entrants} entered</span>
                </Link>
              ))}
              {plan.upcoming.map((u) => (
                <div key={u.index} className="rounded-xl border border-dashed border-white/15 px-3 py-2 text-xs text-muted">
                  <b className="block font-semibold">{u.title}</b>
                  <span>opens when the one before it ends</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lifecycle. A challenge ends on its end date — the daily job closes
            anything overdue — but staff need to be able to end one on the spot,
            and to reopen one closed by mistake. */}
        <div className="mt-5 pt-5 border-t border-violet-500/15 flex flex-wrap gap-3 items-center">
          {challenge.status === "completed" ? (
            <>
              <span className="text-sm text-emerald-300 font-bold">
                Ended · placements frozen and trophies awarded
              </span>
              <form action={async () => {
                "use server";
                const { reopenChallenge } = await import("@/app/actions/admin");
                await reopenChallenge(id, new Date(Date.now() + 7 * 86400000).toISOString());
              }}>
                <button className="ghost-btn pressable rounded-full px-5 py-2 text-sm">
                  Reopen for 7 more days
                </button>
              </form>
            </>
          ) : (
            <>
              <form action={async () => {
                "use server";
                const { endChallengeNow } = await import("@/app/actions/admin");
                await endChallengeNow(id);
              }}>
                <button className="glow-btn pressable rounded-full px-5 py-2 text-sm font-bold">
                  End now &amp; award trophies
                </button>
              </form>
              <span className="text-xs text-muted">
                Freezes the current standings as final placements, marks it completed, and gives the
                podium their trophies. Everyone who took part is notified where they finished.
              </span>
            </>
          )}
        </div>
      </div>

      <details className="glass p-6 group">
        <summary className="cursor-pointer font-bold flex items-center gap-2 list-none">
          <Icon name="edit" size={16} className="text-cyan-300" /> Edit challenge
          <span className="ml-auto text-xs text-muted group-open:hidden">Open editor</span>
        </summary>
        <div className="mt-5 border-t border-violet-500/15 pt-5">
          <ChallengeBuilder
            challenge={editData}
            providers={builderProviders}
            spaces={spaces.map((s) => ({ id: s.id, name: s.name, game: s.game }))}
            trophies={ctx.trophies}
            quests={quests}
            guilds={ctx.guilds}
            brands={ctx.brands}
            pricing={ctx.pricing}
            reach={ctx.reach}
          />
        </div>
      </details>

      <section>
        <h2 className="font-bold mb-3">Participants ({participants.length})</h2>
        <div className="glass overflow-x-auto">
          <table className="w-full table-cosmic min-w-[560px]">
            <thead><tr><th>#</th><th>Gamer</th><th>Account</th><th>Points</th><th>Status</th><th>Override</th></tr></thead>
            <tbody>
              {participants.map(({ p, u, a }, i) => (
                <tr key={p.id} className={p.status === "disqualified" ? "opacity-50" : ""}>
                  <td className="font-bold">{i + 1}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <Avatar name={u.displayName} src={u.avatarUrl} size={26} />
                      <span className="text-sm font-semibold">{u.displayName}</span>
                    </span>
                  </td>
                  <td className="text-sm text-muted">{a.inGameName}</td>
                  <td className="font-bold text-cyan-200">{p.currentPoints}</td>
                  <td className="text-xs">{p.status}</td>
                  <td>
                    {p.status === "disqualified" ? (
                      <form action={setParticipantStatus.bind(null, p.id, "active", id)}>
                        <button className="text-xs ghost-btn rounded-full px-3 py-1">Reinstate</button>
                      </form>
                    ) : (
                      <form action={setParticipantStatus.bind(null, p.id, "disqualified", id)}>
                        <button className="text-xs rounded-full px-3 py-1 border border-rose-400/40 text-rose-300">Disqualify</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-bold mb-3">Event ledger (latest 30)</h2>
        <div className="glass p-4 space-y-1.5 text-xs font-mono max-h-72 overflow-y-auto">
          {events.length === 0 && <p className="text-muted">No scoring events yet.</p>}
          {events.map((e) => (
            <div key={e.id} className="flex gap-3">
              <span className="text-muted shrink-0">{timeAgo(e.createdAt)}</span>
              <span className="text-cyan-300 shrink-0">{e.eventType} {e.pointsAwarded >= 0 ? "+" : ""}{e.pointsAwarded}</span>
              <span className="text-muted truncate">{JSON.stringify(e.rawPayload)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// One counted number. Deliberately flat and unstyled beyond the value/label
// split: these are the figures a brand is billed against, and dressing them up
// is how a dashboard starts implying more precision than it has.
function Stat({ value, label, gold = false }: { value: string; label: string; gold?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${gold ? "border-amber-400/30 bg-amber-500/10" : "border-white/10 bg-black/25"}`}>
      <div className={`text-xl font-bold leading-none ${gold ? "text-amber-300" : "brand-text"}`}>{value}</div>
      <div className="mt-1.5 text-[10px] uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}
