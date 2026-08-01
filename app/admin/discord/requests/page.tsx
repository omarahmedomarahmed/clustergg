import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { listRequests } from "@/lib/challenge-requests";
import { RequestCard } from "@/components/ChallengeRequestReview";
import { guildStats } from "@/lib/discord/guilds";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Challenge requests" };

// Servers asking us to run a challenge for their community.
//
// This is the approval gate on the growth loop. A server owner builds the
// challenge in Discord; nothing goes live until someone here approves it,
// because it runs under Cluster's name, on our leaderboards, with our trophies.
export default async function ChallengeRequestsPage() {
  await requireAdmin();
  const requests = await listRequests();

  // A brand's paid slot arrives with no guild — it was bought for the whole
  // network — so the guild lookups have to skip the empty id rather than query
  // for it and come back with nothing.
  const guildIds = [...new Set(requests.map((r) => r.guildId).filter((g) => !!g))];
  const brandIds = [...new Set(requests.map((r) => r.brandId).filter((b): b is string => !!b))];
  const campaignIds = [...new Set(requests.map((r) => r.campaignId).filter((c): c is string => !!c))];
  const db = await getDb();
  const [guilds, requesters, brandRows, campaignRows] = await Promise.all([
    guildIds.length
      ? db.select({ guildId: schema.discordGuilds.guildId, name: schema.discordGuilds.name, iconUrl: schema.discordGuilds.iconUrl })
        .from(schema.discordGuilds).where(inArray(schema.discordGuilds.guildId, guildIds))
      : Promise.resolve([]),
    (async () => {
      const ids = requests.map((r) => r.requestedByUserId).filter((x): x is string => !!x);
      if (!ids.length) return [] as { id: string; displayName: string }[];
      return db.select({ id: schema.users.id, displayName: schema.users.displayName })
        .from(schema.users).where(inArray(schema.users.id, ids));
    })(),
    brandIds.length
      ? db.select({ id: schema.brands.id, name: schema.brands.name, logoUrl: schema.brands.logoUrl })
        .from(schema.brands).where(inArray(schema.brands.id, brandIds))
      : Promise.resolve([]),
    campaignIds.length
      ? db.select({ id: schema.sponsoredCampaigns.id, slots: schema.sponsoredCampaigns.slots, total: schema.sponsoredCampaigns.total })
        .from(schema.sponsoredCampaigns).where(inArray(schema.sponsoredCampaigns.id, campaignIds))
      : Promise.resolve([]),
  ]);

  const stats = await Promise.all(guildIds.map((g) => guildStats(g)));
  const byGuild = new Map(guilds.map((g) => [g.guildId, g]));
  const linkedByGuild = new Map(stats.filter((s) => !!s).map((s) => [s!.guildId, s!.linked]));
  const byUser = new Map(requesters.map((u) => [u.id, u.displayName]));
  const byBrand = new Map(brandRows.map((b) => [b.id, b]));
  const byCampaign = new Map(campaignRows.map((c) => [c.id, c]));

  const pending = requests.filter((r) => r.status === "pending");
  const reviewed = requests.filter((r) => r.status !== "pending");

  return (
    <div className="max-w-4xl">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <h1 className="text-2xl font-bold">Challenge requests</h1>
        <Link href="/admin/discord" className="text-sm text-cyan-300 hover:underline">← Discord bot</Link>
      </div>
      <p className="text-muted text-sm mb-8">
        Two things land here. A <b className="text-ink">server owner</b> builds a challenge for their own
        community: approving mints the entry key and posts it into their server, private to them. A{" "}
        <b className="text-ink">brand</b> has already paid for a month of four — approving one launches it
        publicly across the network, and the next week opens when it ends. Either way, approval is the only
        step between the request and people competing.
      </p>

      {pending.length === 0 && reviewed.length === 0 ? (
        <div className="glass p-6 text-sm text-muted">
          Nothing yet. Server admins reach this with <code className="text-cyan-300">/cluster admin</code> → Request a challenge.
        </div>
      ) : null}

      {pending.length > 0 && (
        <section className="mb-10">
          <h2 className="font-bold mb-3">
            Waiting on us <span className="text-amber-300">({pending.length})</span>
          </h2>
          <div className="space-y-4">
            {pending.map((r) => (
              <RequestCard
                key={r.id}
                req={serialize(r, byUser, byCampaign)}
                server={serverOf(r.guildId, byGuild, linkedByGuild)}
                brand={brandOf(r, byBrand, byCampaign)}
              />
            ))}
          </div>
        </section>
      )}

      {reviewed.length > 0 && (
        <section>
          <h2 className="font-bold mb-3">Reviewed</h2>
          <div className="space-y-4">
            {reviewed.map((r) => (
              <RequestCard
                key={r.id}
                req={serialize(r, byUser, byCampaign)}
                server={serverOf(r.guildId, byGuild, linkedByGuild)}
                brand={brandOf(r, byBrand, byCampaign)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

type Req = Awaited<ReturnType<typeof listRequests>>[number];

type Campaign = { id: string; slots: number; total: number };

function serialize(r: Req, byUser: Map<string, string>, byCampaign: Map<string, Campaign>) {
  return {
    id: r.id,
    title: r.title,
    game: r.game,
    description: r.description,
    days: r.days,
    prizeValue: r.prizeValue,
    prizeCurrency: r.prizeCurrency,
    status: r.status,
    challengeId: r.challengeId,
    createdAt: r.createdAt.toISOString(),
    requestedBy: (r.requestedByUserId && byUser.get(r.requestedByUserId)) ?? null,
    slotIndex: r.slotIndex,
    slots: (r.campaignId ? byCampaign.get(r.campaignId)?.slots : null) ?? null,
  };
}

// The brand behind a paid slot, or null when a server owner asked.
//
// Staff read these two the same way at a glance and then act on them
// completely differently — one is already paid for and goes out to the
// network, the other is a favour for one community — so the card needs to
// know which it is before it renders anything.
function brandOf(
  r: Req,
  byBrand: Map<string, { name: string; logoUrl: string | null }>,
  byCampaign: Map<string, Campaign>,
) {
  if (!r.brandId) return null;
  const b = byBrand.get(r.brandId);
  if (!b) return null;
  return {
    name: b.name,
    logoUrl: b.logoUrl,
    total: (r.campaignId ? byCampaign.get(r.campaignId)?.total : null) ?? 0,
  };
}

function serverOf(
  guildId: string,
  byGuild: Map<string, { name: string; iconUrl: string | null }>,
  linked: Map<string, number>,
) {
  const g = byGuild.get(guildId);
  if (!g) return null;
  return { name: g.name || guildId, iconUrl: g.iconUrl, linked: linked.get(guildId) ?? 0 };
}
