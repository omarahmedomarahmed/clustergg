import Link from "next/link";
import { getDb } from "../../../lib/db/index.ts";
import { poolDivisionFor } from "../../../lib/pool/score.ts";
import { weekFor } from "../../../lib/challenges/week.ts";
import { demoNow } from "../../../lib/site/clock.ts";
import { schema } from "../../../lib/db/index.ts";
import { Panel, Money, Empty } from "../components.tsx";

export const dynamic = "force-dynamic";

export default async function AdminServers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = demoNow(await searchParams);
  const db = await getDb();
  const guilds = await db.select().from(schema.guilds);
  const division = await poolDivisionFor(db, weekFor(now).start, now);
  const shareBy = new Map(division.shares.map((s) => [s.guildId, s]));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Servers</h1>

      <Panel title={`${guilds.length} installed`}>
        {guilds.length === 0 ? (
          <Empty>No server has installed the bot yet.</Empty>
        ) : (
          <div className="flex flex-col">
            {guilds.map((g) => {
              const share = shareBy.get(g.guildId);
              return (
                <div
                  key={g.guildId}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3 last:border-0"
                >
                  <div>
                    <Link href={`/servers/${g.slug}`} className="text-sm hover:underline">
                      {g.name}
                    </Link>
                    <p className="mt-1 text-xs text-mute">
                      {g.memberCount.toLocaleString("en-US")} members
                      {g.removedAt ? " · bot removed" : ""}
                      {!g.community ? " · no community profile — not scored" : ""}
                      {!g.adminRoleId ? " · no admin role mapped" : ""}
                    </p>
                  </div>
                  <span className="flex items-center gap-6 text-sm">
                    <span className="text-xs text-mute">
                      {share ? `${share.entrants.toFixed(1)} entrants` : "no entrants this week"}
                    </span>
                    <Money cents={share?.totalCents ?? 0} />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
