import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import GameLogo from "@/components/GameLogo";
import { slimImg } from "@/lib/img";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/t-server";
import { getProvider } from "@/lib/providers/registry";
import { getContent } from "@/lib/cms";
import Icon from "@/components/Icon";
import AdSlot from "@/components/AdSlot";
import Countdown from "@/components/Countdown";
import LiveChallengeBoard from "@/components/LiveChallengeBoard";
import { joinChallenge } from "@/app/actions/social";
import { getQuestCompletions } from "@/lib/quests";

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
  const { tr, te } = await getT(viewer?.locale);
  // Admin translations for this challenge's text (falls back to the DB value).
  challenge.title = te("challenge", challenge.id, "title", challenge.title);
  challenge.description = te("challenge", challenge.id, "description", challenge.description);
  challenge.prizeDescription = te("challenge", challenge.id, "prizeDescription", challenge.prizeDescription);
  const provider = getProvider(challenge.provider);
  const path = `/planets/${slug}/challenges/${challengeId}`;
  const cms = await getContent(["banner.arena"]);

  // Podium prizes: one or more trophies per place (falls back to the legacy
  // single trophy as the 1st-place prize).
  const prizeCfg = challenge.prizes ?? (challenge.trophyId ? { first: [challenge.trophyId] } : null);
  const prizeIds = [...new Set([...(prizeCfg?.first ?? []), ...(prizeCfg?.second ?? []), ...(prizeCfg?.third ?? [])])];

  const [myParticipation, myAccounts, prizeTrophies, [game]] = await Promise.all([
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
    prizeIds.length
      ? db.select().from(schema.trophies).where(inArray(schema.trophies.id, prizeIds))
      : Promise.resolve([]),
    // The challenge's game — its logo, cover and planet art theme this page.
    db.select({ logoUrl: schema.games.logoUrl, coverUrl: schema.games.coverUrl, planetBgUrl: schema.games.planetBgUrl })
      .from(schema.games).where(eq(schema.games.name, challenge.game)).limit(1),
  ]);
  const trophyById = new Map(prizeTrophies.map((t) => [t.id, t]));

  const joined = myParticipation.length > 0;

  // Quest-badge entry gate: how many completion badges of a quest are required,
  // and whether the viewer already holds enough.
  let gate: { questName: string; logoUrl: string | null; need: number; have: number; ok: boolean } | null = null;
  if (challenge.gateQuestId && challenge.gateMinBadges > 0) {
    const [gq] = await db.select({ name: schema.quests.name, logoUrl: schema.quests.logoUrl })
      .from(schema.quests).where(eq(schema.quests.id, challenge.gateQuestId)).limit(1);
    if (gq) {
      const have = viewer ? await getQuestCompletions(db, viewer.id, challenge.gateQuestId) : 0;
      gate = { questName: gq.name, logoUrl: gq.logoUrl, need: challenge.gateMinBadges, have, ok: have >= challenge.gateMinBadges };
    }
  }

  const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const embed = challenge.heroType === "stream" && challenge.heroUrl ? streamEmbed(challenge.heroUrl) : null;
  // Game-first theming: the game's cover backs the hero when the challenge has
  // none, and the game's planet/cover art backs the WHOLE page (dimmed).
  const coverUrl = challenge.coverUrl ?? slimImg(game?.coverUrl ?? null, 800000) ?? cms["banner.arena"];
  const pageBg = slimImg(game?.planetBgUrl ?? game?.coverUrl ?? null, 800000);

  return (
    <div>
      {/* Game-themed page backdrop — the whole page lives in this game's world */}
      {pageBg && (
        <div aria-hidden className="fixed inset-0 -z-10 bg-cover bg-center"
          style={{ backgroundImage: `linear-gradient(rgba(4,5,26,0.86), rgba(4,5,26,0.95)), url(${pageBg})` }} />
      )}
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
          <Link href={`/planets/${slug}`} className="text-sm text-muted hover:text-cyan-300 inline-flex items-center gap-1.5 mb-3">
            <Icon name="arrowLeft" size={14} /> {tr("Back to planet")}
          </Link>
          <div className="flex items-center gap-2 sm:gap-3 mb-3 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible [scrollbar-width:none]">
            <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] uppercase tracking-widest border ${
              challenge.status === "active" ? "border-emerald-400/50 text-emerald-300 bg-emerald-500/10" : "border-violet-400/40 text-muted bg-black/40"}`}>
              {challenge.status === "active" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
              {challenge.status === "active" ? tr("Live event") : challenge.status}
            </span>
            <span className="shrink-0 whitespace-nowrap text-[11px] uppercase tracking-widest text-muted border border-violet-400/25 rounded-full px-3 py-1 capitalize">{challenge.cadence} {tr("challenge")}</span>
            <span className="shrink-0 whitespace-nowrap text-[11px] uppercase tracking-widest text-muted border border-violet-400/25 rounded-full px-3 py-1">
              {challenge.format === "top1" ? tr("Winner takes all") : challenge.format === "top3" ? tr("Top 3 podium") : tr("Threshold race")}
            </span>
            {challenge.status === "active" && (
              <span className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-200 border border-amber-400/50 bg-amber-500/10 rounded-full px-3 py-1">
                <Icon name="clock" size={12} /> <Countdown endsAt={challenge.endAt.toISOString()} prefix={`${tr("ends in")} `} />
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {game?.logoUrl && (
              <GameLogo logoUrl={slimImg(game.logoUrl, 300000)} name={challenge.game} size={52} rounded="rounded-2xl"
                className="ring-2 ring-white/20 shadow-2xl shrink-0" />
            )}
            <h1 className="text-3xl md:text-5xl font-bold drop-shadow-lg">{challenge.title}</h1>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 mt-8 grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-8">
          <div className="glass p-6 md:p-8">
            <h2 className="font-bold mb-2 flex items-center gap-2">
              <Icon name="shield" size={16} className="text-amber-300" /> {tr("Rules — how to win")}
            </h2>
            <p className="text-muted leading-relaxed">{challenge.description}</p>
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              {[
                { label: tr("Game"), value: challenge.game, icon: "gamepad" },
                { label: tr("Starts"), value: fmtDate(challenge.startAt), icon: "clock" },
                { label: tr("Ends"), value: (
                  <span className="flex flex-col">
                    <span>{fmtDate(challenge.endAt)}</span>
                    {challenge.status === "active" && <span className="text-[10px] font-bold text-amber-300"><Countdown endsAt={challenge.endAt.toISOString()} prefix={`${tr("in")} `} /></span>}
                  </span>
                ), icon: "flame" },
                { label: tr("Scoring"), value: Object.entries(challenge.pointsEngine ?? {}).map(([k, v]) => `+${v}/${k}`).join(" ") || "—", icon: "chart" },
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
                <Link href="/signup" className="glow-btn pressable rounded-full px-8 py-3.5 font-semibold text-white flex sm:inline-flex w-full sm:w-auto items-center justify-center gap-2">
                  <Icon name="rocket" size={16} /> {tr("Sign up to compete")}
                </Link>
              ) : joined ? (
                <div className="text-emerald-300 font-semibold inline-flex items-center gap-2">
                  <Icon name="check" size={18} /> {tr("You're in — go play")} {challenge.game}. {tr("Points sync automatically.")}
                </div>
              ) : myAccounts.length === 0 ? (
                <div className="text-sm text-muted inline-flex items-center gap-2">
                  <Icon name="link" size={15} />
                  {tr("You need a linked")} <b>{provider?.name}</b> {tr("account —")}{" "}
                  <Link href="/profile" className="text-cyan-300 underline">{tr("link it on your profile")}</Link>.
                </div>
              ) : gate && !gate.ok ? (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4 text-sm">
                  <div className="flex items-center gap-2 font-semibold text-amber-200">
                    {gate.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={gate.logoUrl} alt="" className="h-6 w-6 object-contain" /> : <Icon name="lock" size={15} />}
                    {tr("Locked — earn")} {gate.need} <b>{gate.questName}</b> {gate.need > 1 ? tr("badges to enter") : tr("badge to enter")}
                  </div>
                  <p className="text-xs text-muted mt-1">{tr("You have")} {gate.have}/{gate.need}. {tr("Complete the")} <Link href="/quests" className="text-cyan-300 underline">{gate.questName} {tr("quest")}</Link> {gate.need - gate.have} {gate.need - gate.have > 1 ? tr("more times") : tr("more time")} {tr("to unlock this challenge.")}</p>
                </div>
              ) : (
                <form action={joinChallenge.bind(null, challenge.id, myAccounts[0].id, path)}>
                  {gate && (
                    <div className="mb-2 inline-flex items-center gap-1.5 text-xs text-emerald-300 font-semibold">
                      <Icon name="check" size={14} /> {gate.questName} {tr("badges")} {gate.have}/{gate.need} — {tr("you qualify")}
                    </div>
                  )}
                  <button className="glow-btn pressable rounded-full px-8 py-3.5 font-semibold text-white flex sm:inline-flex w-full sm:w-auto items-center justify-center gap-2">
                    <Icon name="rocket" size={16} /> {tr("Join with")} {myAccounts[0].inGameName}
                  </button>
                </form>
              )}
            </div>
          </div>

          <section>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Icon name="chart" size={18} className="text-cyan-300" /> {tr("Live standings & scoring log")}
            </h2>
            <LiveChallengeBoard challengeId={challenge.id} />
          </section>
        </div>

        <aside className="space-y-6">
          {prizeCfg && prizeTrophies.length > 0 && (
            <div className="glass p-6 glow-sweep">
              <div className="text-[10px] uppercase tracking-widest text-amber-300 mb-4 inline-flex items-center gap-1.5">
                <Icon name="trophy" size={12} /> {tr("Prize pool")}
              </div>
              <div className="space-y-6">
                {([["first", tr("1st place"), "#fbbf24"], ["second", tr("2nd place"), "#cbd5e1"], ["third", tr("3rd place"), "#b45309"]] as const).map(([key, label, color]) => {
                  const list = (prizeCfg[key] ?? []).map((id) => trophyById.get(id)).filter((t): t is NonNullable<typeof t> => !!t);
                  if (!list.length) return null;
                  return (
                    <div key={key} className="text-center">
                      <div className="text-[11px] font-black uppercase tracking-widest mb-2" style={{ color }}>{label}</div>
                      <div className={`grid gap-3 ${list.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                        {list.map((t) => (
                          <div key={t.id} className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={t.imageUrl} alt={t.name} className={`mx-auto object-contain float-y ${list.length > 1 ? "h-28" : "h-40"}`} />
                            {/* The trophy's $ value — right on the art */}
                            {Number(t.value) > 0 && (
                              <span className="absolute top-0 right-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[11px] font-black text-white shadow-lg">
                                ${Number(t.value).toLocaleString()}
                              </span>
                            )}
                            <div className="text-xs font-bold mt-1">{t.name}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {challenge.prizeDescription && (
                <p className="text-xs text-muted mt-4 text-center">{challenge.prizeDescription}</p>
              )}
              <p className="text-[10px] text-muted/70 mt-3 text-center">{tr("Winners display these trophies on their profile forever.")}</p>
            </div>
          )}
          <div className="glass p-5 text-sm text-muted space-y-2">
            <div className="font-bold text-ink flex items-center gap-2"><Icon name="satellite" size={15} /> {tr("How scoring works")}</div>
            <p>{tr("Your stats are snapshotted when you join. Only")} <b className="text-ink">{tr("new")}</b> {tr("activity counts.")}</p>
            <p>{tr("Every sync pulls fresh data from the")} {provider?.name} {tr("API and the board updates in real time.")}</p>
            {(challenge.rules?.conditions?.length ?? 0) > 0 && (
              <p>{tr("Qualification:")} {challenge.rules.conditions.map((cd) => `${cd.metric} ${cd.op} ${cd.value}`).join(" AND ")}</p>
            )}
          </div>
          <AdSlot placement="challenge_sidebar" />
        </aside>
      </div>
    </div>
  );
}
