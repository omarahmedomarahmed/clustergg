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

  const guildIds = [...new Set(requests.map((r) => r.guildId))];
  const db = await getDb();
  const [guilds, requesters] = await Promise.all([
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
  ]);

  const stats = await Promise.all(guildIds.map((g) => guildStats(g)));
  const byGuild = new Map(guilds.map((g) => [g.guildId, g]));
  const linkedByGuild = new Map(stats.filter((s) => !!s).map((s) => [s!.guildId, s!.linked]));
  const byUser = new Map(requesters.map((u) => [u.id, u.displayName]));

  const pending = requests.filter((r) => r.status === "pending");
  const reviewed = requests.filter((r) => r.status !== "pending");

  return (
    <div className="max-w-4xl">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <h1 className="text-2xl font-bold">Challenge requests</h1>
        <Link href="/admin/discord" className="text-sm text-cyan-300 hover:underline">← Discord bot</Link>
      </div>
      <p className="text-muted text-sm mb-8">
        A server owner builds a challenge for their community in Discord and submits it here. Approving
        creates the challenge, mints the entry key, and posts it into their server with the key attached —
        so approval is the only step between a request and their members competing.
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
                req={serialize(r, byUser)}
                server={serverOf(r.guildId, byGuild, linkedByGuild)}
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
                req={serialize(r, byUser)}
                server={serverOf(r.guildId, byGuild, linkedByGuild)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

type Req = Awaited<ReturnType<typeof listRequests>>[number];

function serialize(r: Req, byUser: Map<string, string>) {
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
