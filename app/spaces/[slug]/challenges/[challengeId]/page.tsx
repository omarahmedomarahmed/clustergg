import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getProvider } from "@/lib/providers/registry";
import { getContent } from "@/lib/cms";
import Icon from "@/components/Icon";
import AdSlot from "@/components/AdSlot";
import LiveChallengeBoard from "@/components/LiveChallengeBoard";
import { joinChallenge } from "@/app/actions/social";

export const dynamic = "force-dynamic";

function streamEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") || u.hostname === "youtu.be") {
      const id = u.hostname === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      if (u.pathname.startsWith("/embed/")) return url;
    }
    if (u.hostname.includes("twitch.tv")) {
      const channel = u.pathname.split("/").filter(Boolean)[0];
      if (channel) return `https://player.twitch.tv/?channel=${channel}&parent=clustergg.com&parent=clustergg.vercel.app&muted=true`;
    }
  } catch { /* fall through */ }
  return null;
}

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
  const cms = await getContent(["banner.arena"]);

  const [myParticipation, myAccounts, trophy] = await Promise.all([
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
    challenge.trophyId
      ? db.select().from(schema.trophies).where(eq(schema.trophies.id, challenge.trophyId)).limit(1)
      : Promise.resolve([]),
  ]);

  const joined = myParticipation.length > 0;
  const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const embed = challenge.heroType === "stream" && challenge.heroUrl ? streamEmbed(challenge.heroUrl) : null;
  const coverUrl = challenge.coverUrl ?? cms["banner.arena"];

  return (
    <div>
      {/* ===== Glorified hero ===== */}
      <section className="relative">
        {challenge.heroType === "video" && challenge.heroUrl ? (
          <div className="relative h-[340px] md:h-[440px] overflow-hidden">
            <video src={challenge.heroUrl} className="absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline />
            <div className="absolute inset-0 bg-gradient-to-b from-[#04051a]/40 via-[#04051a]/40 to-[#04051a]" />
          </div>
        ) : embed ? (
          <div className="relative">
            <div className="mx-auto max-w-5xl px-4 pt-8">
              <div className="aspect-video overflow-hidden rounded-2xl border border-violet-400/30 shadow-2xl">
                <iframe src={embed} className="h-full w-full" allowFullScreen allow="autoplay; fullscreen" />
              </div>
            </div>
          </div>
        ) : (
          <div className="relative h-[300px] md:h-[380px] overflow-hidden">
            <div
              className="absolute inset-0 bg-cover"
              style={{
                backgroundImage: `url(${coverUrl})`,
                backgroundPosition: `${challenge.coverAdjust.x}% ${challenge.coverAdjust.y}%`,
                transform: `scale(${challenge.coverAdjust.zoom})`,
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#04051a]/30 via-[#04051a]/40 to-[#04051a]" />
          </div>
        )}

        <div className={`mx-auto max-w-5xl px-4 ${embed ? "pt-8" : "-mt-32 relative"}`}>
          <Link href={`/spaces/${slug}`} className="text-sm text-muted hover:text-cyan-300 inline-flex items-center gap-1.5 mb-3">
            <Icon name="arrowLeft" size={14} /> Back to space
          </Link>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] uppercase tracking-widest border ${
              challenge.status === "active" ? "border-emerald-400/50 text-emerald-300 bg-emerald-500/10" : "border-violet-400/40 text-muted bg-black/40"}`}>
              {challenge.status === "active" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
              {challenge.status === "active" ? "Live event" : challenge.status}
            </span>
            <span className="text-[11px] uppercase tracking-widest text-muted border border-violet-400/25 rounded-full px-3 py-1 capitalize">{challenge.cadence} challenge</span>
            <span className="text-[11px] uppercase tracking-widest text-muted border border-violet-400/25 rounded-full px-3 py-1">
              {challenge.format === "top1" ? "Winner takes all" : challenge.format === "top3" ? "Top 3 podium" : "Threshold race"}
            </span>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold drop-shadow-lg">{challenge.title}</h1>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 mt-8 grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-8">
          <div className="glass p-6 md:p-8">
            <p className="text-muted leading-relaxed">{challenge.description}</p>
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              {[
                { label: "Game", value: challenge.game, icon: "gamepad" },
                { label: "Starts", value: fmtDate(challenge.startAt), icon: "clock" },
                { label: "Ends", value: fmtDate(challenge.endAt), icon: "flame" },
                { label: "Scoring", value: Object.entries(challenge.pointsEngine ?? {}).map(([k, v]) => `+${v}/${k}`).join(" ") || "—", icon: "chart" },
              ].map((cell) => (
                <div key={cell.label} className="rounded-lg border border-violet-400/15 p-3">
                  <Icon name={cell.icon} size={14} className="text-violet-300 mb-1" />
                  <div className="text-[10px] uppercase text-muted">{cell.label}</div>
                  <div className="font-bold text-sm mt-1">{cell.value}</div>
                </div>
              ))}
            </div>

            <div className="mt-6">
              {!viewer ? (
                <Link href="/signup" className="glow-btn pressable rounded-full px-8 py-3 font-semibold text-white inline-flex items-center gap-2">
                  <Icon name="rocket" size={16} /> Sign up to compete
                </Link>
              ) : joined ? (
                <div className="text-emerald-300 font-semibold inline-flex items-center gap-2">
                  <Icon name="check" size={18} /> You&apos;re in — go play {challenge.game}. Points sync automatically.
                </div>
              ) : myAccounts.length === 0 ? (
                <div className="text-sm text-muted inline-flex items-center gap-2">
                  <Icon name="link" size={15} />
                  You need a linked <b>{provider?.name}</b> account —{" "}
                  <Link href="/settings/connections" className="text-cyan-300 underline">link it here</Link>.
                </div>
              ) : (
                <form action={joinChallenge.bind(null, challenge.id, myAccounts[0].id, path)}>
                  <button className="glow-btn pressable rounded-full px-8 py-3 font-semibold text-white inline-flex items-center gap-2">
                    <Icon name="rocket" size={16} /> Join with {myAccounts[0].inGameName}
                  </button>
                </form>
              )}
            </div>
          </div>

          <section>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Icon name="chart" size={18} className="text-cyan-300" /> Live standings & scoring log
            </h2>
            <LiveChallengeBoard challengeId={challenge.id} />
          </section>
        </div>

        <aside className="space-y-6">
          {trophy[0] && (
            <div className="glass p-6 text-center glow-sweep">
              <div className="text-[10px] uppercase tracking-widest text-amber-300 mb-3 inline-flex items-center gap-1.5">
                <Icon name="trophy" size={12} /> Prize pool
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={trophy[0].imageUrl} alt={trophy[0].name} className="mx-auto h-44 object-contain float-y" />
              <div className="font-bold mt-3">{trophy[0].name}</div>
              {challenge.prizeDescription && (
                <p className="text-xs text-muted mt-1.5">{challenge.prizeDescription}</p>
              )}
              <p className="text-[10px] text-muted/70 mt-3">Winners display this trophy on their profile forever.</p>
            </div>
          )}
          <div className="glass p-5 text-sm text-muted space-y-2">
            <div className="font-bold text-ink flex items-center gap-2"><Icon name="satellite" size={15} /> How scoring works</div>
            <p>Your stats are snapshotted when you join. Only <b className="text-ink">new</b> activity counts.</p>
            <p>Every sync pulls fresh data from the {provider?.name} API and the board updates in real time.</p>
            {(challenge.rules?.conditions?.length ?? 0) > 0 && (
              <p>Qualification: {challenge.rules.conditions.map((cd) => `${cd.metric} ${cd.op} ${cd.value}`).join(" AND ")}</p>
            )}
          </div>
          <AdSlot placement="challenge_sidebar" />
        </aside>
      </div>
    </div>
  );
}
