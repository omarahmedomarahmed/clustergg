import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getProvider } from "@/lib/providers/registry";
import AdSlot from "@/components/AdSlot";
import LiveChallengeBoard from "@/components/LiveChallengeBoard";
import { joinChallenge } from "@/app/actions/social";

export const dynamic = "force-dynamic";

export default async function ChallengePage({
  params,
}: { params: Promise<{ slug: string; challengeId: string }> }) {
  const { slug, challengeId } = await params;
  const db = await getDb();
  const [challenge] = await db.select().from(schema.challenges)
    .where(eq(schema.challenges.id, challengeId)).limit(1);
  if (!challenge) notFound();

  const viewer = await getCurrentUser();
  const provider = getProvider(challenge.provider);
  const path = `/spaces/${slug}/challenges/${challengeId}`;

  const [myParticipation, myAccounts] = await Promise.all([
    viewer
      ? db.select().from(schema.challengeParticipants).where(and(
          eq(schema.challengeParticipants.challengeId, challenge.id),
          eq(schema.challengeParticipants.userId, viewer.id))).limit(1)
      : Promise.resolve([]),
    viewer
      ? db.select().from(schema.linkedGameAccounts).where(and(
          eq(schema.linkedGameAccounts.userId, viewer.id),
          eq(schema.linkedGameAccounts.provider, challenge.provider)))
      : Promise.resolve([]),
  ]);

  const joined = myParticipation.length > 0;
  const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href={`/spaces/${slug}`} className="text-sm text-muted hover:text-cyan-300">← Back to space</Link>

      <div className="mt-3 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-6">
          <div className="glass p-6 md:p-8 relative overflow-hidden">
            <div className="shimmer absolute inset-0 pointer-events-none" />
            <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2">
              {challenge.status === "active" ? "⚡ Live challenge" : challenge.status}
              {" · "}{challenge.format === "top1" ? "Winner takes all" : challenge.format === "top3" ? "Top 3 podium" : "Threshold race"}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold">{challenge.title}</h1>
            <p className="text-muted mt-3 leading-relaxed">{challenge.description}</p>
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="rounded-lg border border-violet-400/15 p-3">
                <div className="text-[10px] uppercase text-muted">Game</div>
                <div className="font-bold text-sm mt-1">{provider?.glyph} {challenge.game}</div>
              </div>
              <div className="rounded-lg border border-violet-400/15 p-3">
                <div className="text-[10px] uppercase text-muted">Starts</div>
                <div className="font-bold text-sm mt-1">{fmtDate(challenge.startAt)}</div>
              </div>
              <div className="rounded-lg border border-violet-400/15 p-3">
                <div className="text-[10px] uppercase text-muted">Ends</div>
                <div className="font-bold text-sm mt-1">{fmtDate(challenge.endAt)}</div>
              </div>
              <div className="rounded-lg border border-violet-400/15 p-3">
                <div className="text-[10px] uppercase text-muted">Scoring</div>
                <div className="font-bold text-sm mt-1">
                  {Object.entries(challenge.pointsEngine ?? {}).map(([k, v]) => `+${v}/${k}`).join(" ") || "—"}
                </div>
              </div>
            </div>
            {challenge.prizeDescription && (
              <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-sm">
                🏆 <b>Prize:</b> {challenge.prizeDescription}
              </div>
            )}

            <div className="mt-6">
              {!viewer ? (
                <Link href="/signup" className="glow-btn rounded-full px-8 py-3 font-semibold text-white">
                  Sign up to compete
                </Link>
              ) : joined ? (
                <div className="text-emerald-300 font-semibold">You&apos;re in — go play {challenge.game}! Points sync automatically. ✦</div>
              ) : myAccounts.length === 0 ? (
                <div className="text-sm text-muted">
                  You need a linked <b>{provider?.name}</b> account to join —{" "}
                  <Link href="/settings/connections" className="text-cyan-300 underline">link it here</Link>.
                </div>
              ) : (
                <form action={joinChallenge.bind(null, challenge.id, myAccounts[0].id, path)}>
                  <button className="glow-btn rounded-full px-8 py-3 font-semibold text-white">
                    Join with {myAccounts[0].inGameName} →
                  </button>
                </form>
              )}
            </div>
          </div>

          <section>
            <h2 className="text-lg font-bold mb-3">Live standings</h2>
            <LiveChallengeBoard challengeId={challenge.id} />
          </section>
        </div>

        <aside className="space-y-6">
          <div className="glass p-5 text-sm text-muted space-y-2">
            <div className="font-bold text-ink">How scoring works</div>
            <p>Your stats are snapshotted when you join. Only <b className="text-ink">new</b> activity counts.</p>
            <p>Every sync pulls fresh data from the {provider?.name} API and recalculates the board.</p>
            {(challenge.rules?.conditions?.length ?? 0) > 0 && (
              <p>
                Qualification: {challenge.rules.conditions.map((c) => `${c.metric} ${c.op} ${c.value}`).join(" AND ")}
              </p>
            )}
          </div>
          <AdSlot placement="challenge_sidebar" />
        </aside>
      </div>
    </div>
  );
}
