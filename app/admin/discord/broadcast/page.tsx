import { requireAdmin } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { desc, eq } from "drizzle-orm";
import { sendableCreatives, MIN_HOURS_BETWEEN_ADS } from "@/lib/discord/ads";
import { listGuilds } from "@/lib/discord/guilds";
import { AdBroadcast, TextBroadcast } from "@/components/AdBroadcast";
import { ChallengeReminder, WeekBroadcast } from "@/components/ChallengeReminder";
import { AdminHeader, AdminSection, AdminSettings, EmptyState } from "@/components/AdminPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Broadcast & ads" };

// Sending things into Discord by hand.
//
// Entries first: the ad you can click and send, then what has already gone out.
// The rules that govern automatic sending sit at the bottom, where they're
// reference rather than the thing you came here to do.
export default async function BroadcastPage() {
  await requireAdmin();
  const db = await getDb();

  const [creatives, guilds, rawGuilds, recent, live] = await Promise.all([
    sendableCreatives(),
    listGuilds(),
    db.select({
      guildId: schema.discordGuilds.guildId,
      name: schema.discordGuilds.name,
      adOptIn: schema.discordGuilds.adOptIn,
      adUnlockedAt: schema.discordGuilds.adUnlockedAt,
    }).from(schema.discordGuilds).where(eq(schema.discordGuilds.status, "active")),
    db.select({
      id: schema.discordAdPosts.id,
      guildId: schema.discordAdPosts.guildId,
      status: schema.discordAdPosts.status,
      createdAt: schema.discordAdPosts.createdAt,
    }).from(schema.discordAdPosts).orderBy(desc(schema.discordAdPosts.createdAt)).limit(25),
    db.select({
      id: schema.challenges.id,
      title: schema.challenges.title,
      game: schema.challenges.game,
      endAt: schema.challenges.endAt,
      visibility: schema.challenges.visibility,
    }).from(schema.challenges).where(eq(schema.challenges.status, "active"))
      .orderBy(schema.challenges.endAt),
  ]);

  // Rounded up, and matching what the post itself will say — a list that reads
  // "0 days left" next to a message that says "11 hours left" is two sources of
  // truth for the same number.
  const challenges = live.map((c) => ({
    id: c.id, title: c.title, game: c.game,
    daysLeft: Math.max(0, Math.ceil((c.endAt.getTime() - Date.now()) / 86400000)),
    isPrivate: c.visibility === "private",
  }));

  const nameByGuild = new Map(rawGuilds.map((g) => [g.guildId, g.name || g.guildId]));
  const servers = rawGuilds.map((g) => ({
    guildId: g.guildId,
    name: g.name || g.guildId,
    unlocked: !!g.adUnlockedAt,
    adOptIn: g.adOptIn,
  }));
  const eligible = servers.filter((s) => s.unlocked && s.adOptIn).length;

  return (
    <div className="max-w-4xl">
      <AdminHeader
        title="Broadcast & ads"
        subtitle="Send an ad or a message into Discord servers on demand, rather than waiting for the daily job."
        stats={[
          { label: "Servers with the bot", value: guilds.length },
          { label: "Ad-eligible", value: eligible, tone: "accent" },
          { label: "Creatives ready", value: creatives.length },
          { label: "Posts logged", value: recent.length },
        ]}
      />

      <AdminSection
        title="Send an ad"
        hint="Pick the creative by looking at it. Impressions land in the same ad analytics brands already read, tagged with the server they came from."
      >
        <AdBroadcast creatives={creatives} servers={servers} />
      </AdminSection>

      <AdminSection
        title="Recently posted"
        hint="Every ad the bot has delivered, newest first."
      >
        {recent.length === 0 ? (
          <EmptyState
            title="Nothing sent yet"
            hint="Ads appear here once the daily job runs or you send one above."
          />
        ) : (
          <div className="space-y-1.5">
            {recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 border-t border-white/5 pt-1.5 text-sm">
                <span className="truncate">{nameByGuild.get(r.guildId) ?? r.guildId}</span>
                <span className="shrink-0 flex items-center gap-3">
                  <span className={r.status === "posted" ? "text-emerald-300 text-xs" : "text-amber-300 text-xs"}>
                    {r.status}
                  </span>
                  <span className="text-[11px] text-muted">{r.createdAt.toLocaleString()}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </AdminSection>

      <AdminSection
        title="Remind a challenge"
        hint="The daily job posts a countdown for everything running. This sends one now — one challenge or all of them, everywhere or to chosen servers."
      >
        <ChallengeReminder challenges={challenges} servers={servers} />
      </AdminSection>

      <AdminSection
        title="Post the Profile of the Week standings"
        hint="The same weekly card the daily job posts, sent again on demand."
      >
        <WeekBroadcast servers={servers} />
      </AdminSection>

      <AdminSection
        title="Message every server"
        hint="Plain text, markdown and emoji. Not an ad — announcements, notices, anything staff needs to say."
      >
        <TextBroadcast servers={servers} />
      </AdminSection>

      <AdminSettings title="How automatic sending behaves">
        <div className="glass p-5 text-sm text-muted space-y-2">
          <p>
            <b className="text-ink">Who receives ads.</b> Only servers that have crossed the linked-gamer
            threshold <em>and</em> opted in. Everyone else is skipped, including by the button above.
          </p>
          <p>
            <b className="text-ink">How often.</b> At most one ad per server every {MIN_HOURS_BETWEEN_ADS} hours.
            This is what keeps the bot from reading as spam, which is the fastest way to get it removed from
            every server it&apos;s in. The manual send can override it, deliberately.
          </p>
          <p>
            <b className="text-ink">Challenge reminders.</b> One post per running challenge per day, skipping
            anything launched in the last day — it was already announced, and two posts about the same
            challenge in one day is the noise this exists to avoid. A private challenge is only ever
            reminded inside the servers that own it.
          </p>
          <p>
            <b className="text-ink">Personal news.</b> &ldquo;Someone joined a challenge&rdquo;, &ldquo;someone linked an
            account&rdquo; and quest milestones go only to the servers that gamer is actually in. Fanning those
            out to every server is how a bot gets muted.
          </p>
          <p>
            <b className="text-ink">Where the money shows up.</b> Discord impressions are written to the
            existing ad tables with the server id attached, so they appear in the brand dashboards rather
            than a parallel system nobody reconciles.
          </p>
        </div>
      </AdminSettings>
    </div>
  );
}
