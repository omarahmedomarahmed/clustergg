import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { setParticipantStatus } from "@/app/actions/admin";
import { PROVIDERS, isProviderLive } from "@/lib/providers/registry";
import ChallengeBuilder, { type ChallengeEdit } from "@/components/ChallengeBuilder";
import Avatar from "@/components/Avatar";
import Icon from "@/components/Icon";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminChallengeLive({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const [challenge] = await db.select().from(schema.challenges).where(eq(schema.challenges.id, id)).limit(1);
  if (!challenge) notFound();

  const [participants, events, spaces, trophies, quests] = await Promise.all([
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
    db.select().from(schema.trophies),
    db.select({ id: schema.quests.id, name: schema.quests.name, logoUrl: schema.quests.logoUrl }).from(schema.quests).orderBy(schema.quests.sortOrder),
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
  };

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
            trophies={trophies.map((t) => ({ id: t.id, name: t.name, tier: t.tier, imageUrl: t.imageUrl }))}
            quests={quests}
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
