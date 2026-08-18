// Members — linked members, entrants, activation rate.
//
// ===== THIS IS NOT THE GAMER DIRECTORY =====
//
// House rule 7 keeps every staff department out of `/admin/users`, and an
// owner is further out than any of them. What an owner sees here is the public
// profile of somebody who joined *their* server and entered something: the
// display name and the profile link a stranger could reach anyway. No age
// band, no country, no email, no linked account handles.

import Link from "next/link";
import { getDb } from "../../../../../lib/db/index.ts";
import { ownerMembers, ownerOverview } from "../../../../../lib/portal/owner.ts";
import { demoNow } from "../../../../../lib/site/clock.ts";
import { Panel, Figure, Row, Empty } from "../../../components.tsx";

export const dynamic = "force-dynamic";

export default async function OwnerMembers({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const now = demoNow(await searchParams);
  const db = await getDb();
  const [members, overview] = await Promise.all([
    ownerMembers(db, guildId),
    ownerOverview(db, guildId, now),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Members</h1>

      <section className="grid gap-3 sm:grid-cols-3">
        <Figure
          label="Linked members"
          value={String(members.length)}
          help={
            <p>
              Gamers whose <strong>first bot click</strong> was in your server, and who
              have linked a game account. Not your Discord member count — we do not
              read your member list for this, and a bigger server is not
              automatically a better one.
            </p>
          }
          testId="linked-members"
        />
        <Figure
          label="Entrants this week"
          value={overview?.kpis ? overview.kpis.entrants.toFixed(1) : "0"}
          note="A gamer in two servers counts a half to each"
        />
        <Figure
          label="Activation"
          value={overview?.kpis ? `${(overview.kpis.activation * 100).toFixed(0)}%` : "—"}
          note="Entrants who actually scored"
        />
      </section>

      <Panel
        title="Who is linked"
        note="Public profiles only. We do not show you anybody's age, country or game handles — not to you, and not to our own staff"
        help={
          <p>
            You are seeing exactly what any visitor sees on a public profile. Age
            band and country are compliance fields, they decide whether somebody can
            be paid, and no portal shows them to anybody.
          </p>
        }
      >
        {members.length === 0 ? (
          <Empty>Nobody in this server has linked a game account yet.</Empty>
        ) : (
          members.map((m) => (
            <Row key={m.userId}>
              <Link href={`/u/${m.slug}`} className="hover:underline">
                {m.displayName}
              </Link>
              <span className="text-xs text-mute">public profile</span>
            </Row>
          ))
        )}
      </Panel>
    </div>
  );
}
