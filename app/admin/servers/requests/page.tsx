// `/admin/servers/requests` — community challenge requests. 05 §6.
//
// ===== WHAT THIS PAGE IS *NOT* FOR =====
//
// P1 — *"only the Discord guild owner touches money."* An administrator
// requests a community challenge and **the guild owner approves the spend.**
// Not us. So there is no approve button on this page, and adding one would put
// Cluster admin in the middle of somebody else's money decision.
//
// What this page is for is the question an operator actually has on a
// Saturday: *is anybody stuck?* A request that has sat pending for days is a
// guild owner who has never signed in, or one who does not know they are being
// waited on — and 12 §6's *"the owner who never appears"* is a real state with
// a four-week clock on it.

import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../../../lib/db/index.ts";
import { formatMoney, COMMUNITY_TIERS, type CommunityTier } from "../../../../lib/money/amounts.ts";
import { Panel, Row, Empty, Light } from "../../components.tsx";

export const dynamic = "force-dynamic";

export default async function Requests() {
  const db = await getDb();
  const requests = await db
    .select()
    .from(schema.spendRequests)
    .orderBy(desc(schema.spendRequests.createdAt))
    .limit(200);

  const guilds = await db.select().from(schema.guilds);
  const nameOf = new Map(guilds.map((g) => [g.guildId, g.name]));
  const ownerSignedIn = new Map(guilds.map((g) => [g.guildId, g.ownerFirstSignInAt !== null]));

  const pending = requests.filter((r) => r.state === "pending");
  const now = Date.now();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Community requests</h1>
        <p className="mt-1 text-sm text-mute">
          {pending.length} waiting on a guild owner.
        </p>
      </div>

      <Panel
        title="Waiting on an owner"
        note="Only the guild owner can approve a spend — not an administrator, and not us"
        help={
          <p>
            There is no approve button here on purpose. The money is the
            server&apos;s, and P1 puts one person in charge of it. What we can do is
            notice when somebody is stuck: an owner who has <strong>never signed
            in</strong> cannot approve anything, and after four weeks Cluster admin may
            reassign — manually, and the claimant must hold ADMINISTRATOR at that
            moment.
          </p>
        }
      >
        {pending.length === 0 ? (
          <Empty>Nothing waiting.</Empty>
        ) : (
          pending.map((r) => {
            const days = Math.floor((now - r.createdAt.getTime()) / (24 * 60 * 60 * 1000));
            const payload = (r.payload ?? {}) as Record<string, string>;
            const tier = Number(r.tier) as CommunityTier;
            return (
              <Row key={r.id} href={`/admin/servers/${r.guildId}`}>
                <div>
                  <p>{nameOf.get(r.guildId) ?? r.guildId}</p>
                  <p className="text-xs text-mute">
                    {payload.title ?? "A community challenge"} · tier {r.tier} ·{" "}
                    {COMMUNITY_TIERS[tier]
                      ? formatMoney(COMMUNITY_TIERS[tier].prizeCents)
                      : "—"}
                  </p>
                </div>
                <span className="flex items-center gap-3 text-sm">
                  <span className="text-mute" data-testid="request-age">
                    {days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"}`}
                  </span>
                  {/* The thing an operator actually needs to know: can the
                      person it is waiting on even reach the button? */}
                  <span className="flex items-center gap-1.5 text-xs">
                    <Light ok={ownerSignedIn.get(r.guildId) === true} />
                    {ownerSignedIn.get(r.guildId) ? "owner has signed in" : "owner never signed in"}
                  </span>
                </span>
              </Row>
            );
          })
        )}
      </Panel>

      <Panel title="Settled" note="Approved, paid or rejected">
        {requests.filter((r) => r.state !== "pending").length === 0 ? (
          <Empty>Nothing yet.</Empty>
        ) : (
          requests
            .filter((r) => r.state !== "pending")
            .slice(0, 40)
            .map((r) => (
              <Row key={r.id}>
                <span>{nameOf.get(r.guildId) ?? r.guildId}</span>
                <span className="text-sm text-mute">{r.state}</span>
              </Row>
            ))
        )}
      </Panel>

      <p className="text-xs text-mute">
        A server&apos;s own page has the rest:{" "}
        <Link href="/admin/servers" className="underline">
          every server
        </Link>
        .
      </p>
    </div>
  );
}
