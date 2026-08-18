// `/admin/users/[id]` — one gamer. **Admin only. No staff department, ever.**
//
// ===== HOUSE RULE 7, AND WHY THIS PAGE IS THE REASON FOR IT =====
//
// A9/ST2 — *"`/admin/users` and `/admin/linked-accounts` are admin-only. No
// staff department reaches the gamer directory, ever."* Whatever a title says.
//
// This page is where that rule earns its keep, because it is the one screen on
// the platform that puts a real person's age band, country, game accounts and
// money in one place. `ROUTE_ACCESS` classifies it `ADMIN_ONLY` by kind rather
// than by a department list — a list is a thing a well-meaning edit widens, and
// `91-admin-access` fails the band if it ever becomes one.
//
// ===== THE TWO SUPPORT-ONLY ACTIONS ARE NOT ON THIS PAGE YET =====
//
// 05 §7 names them: changing an age band (a 13–17 gamer who turns 18 must
// contact support, G9/G10) and reinstating a swept trophy (V12). Both already
// exist as guarded functions and both are reached from the guild registry,
// where the audit trail for them lives. Adding second buttons here would be a
// second door onto a logged action, and trap 21's lesson is that the number of
// doors is the question.

import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "../../../../lib/db/index.ts";
import { unlockState } from "../../../../lib/identity/unlock.ts";
import { progressOf } from "../../../../lib/identity/onboarding.ts";
import { isProven } from "../../../../lib/identity/accounts.ts";
import { AGE_BAND_COPY, type AgeBand } from "../../../../lib/identity/age.ts";
import { countryName } from "../../../../lib/identity/countries.ts";
import { formatMoney } from "../../../../lib/money/amounts.ts";
import { Panel, Row, Empty, Money, Light } from "../../components.tsx";

export const dynamic = "force-dynamic";

export default async function OneUser({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!user) notFound();

  const unlock = await unlockState(db, id);
  const progress = progressOf(unlock);

  const accounts = await db
    .select()
    .from(schema.linkedGameAccounts)
    .where(eq(schema.linkedGameAccounts.userId, id));

  const holdings = await db
    .select({ holding: schema.userTrophies, trophy: schema.trophies })
    .from(schema.userTrophies)
    .innerJoin(schema.trophies, eq(schema.userTrophies.trophyId, schema.trophies.id))
    .where(eq(schema.userTrophies.userId, id));

  const entries = await db
    .select({ participant: schema.challengeParticipants, challenge: schema.challenges })
    .from(schema.challengeParticipants)
    .innerJoin(
      schema.challenges,
      eq(schema.challengeParticipants.challengeId, schema.challenges.id),
    )
    .where(eq(schema.challengeParticipants.userId, id))
    .orderBy(desc(schema.challengeParticipants.joinedAt));

  const redemptions = await db
    .select()
    .from(schema.redemptions)
    .where(eq(schema.redemptions.userId, id))
    .orderBy(desc(schema.redemptions.requestedAt));

  const liability = holdings
    .filter((h) => !h.holding.redeemedAt && h.trophy.valueCents > 0)
    .reduce((sum, h) => sum + h.trophy.valueCents, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{user.displayName}</h1>
        <p className="mt-1 text-sm text-mute">
          <Link href="/admin/users" className="underline">
            The directory
          </Link>{" "}
          · {user.status}
          {user.slug ? (
            <>
              {" "}
              ·{" "}
              <Link href={`/u/${user.slug}`} className="underline">
                their public profile
              </Link>
            </>
          ) : null}
        </p>
      </div>

      <Panel
        title="Who they are"
        note="Age band and country are compliance fields. They appear on no other surface"
        help={
          <p>
            A gamer <strong>cannot change their own age band</strong> — support can, and
            it is logged with both sides. A 13–17 gamer who turns 18 has to ask, and
            that friction is the point: the field decides whether money can be paid to
            them.
          </p>
        }
      >
        <Row>
          <span>Age band</span>
          <span className="text-sm text-mute" data-testid="user-age-band">
            {user.ageBand ? AGE_BAND_COPY[user.ageBand as AgeBand].label : "not set"}
          </span>
        </Row>
        <Row>
          <span>Country</span>
          <span className="text-sm text-mute">
            {user.country ? countryName(user.country) : "not set"}
          </span>
        </Row>
        <Row>
          <span>Email</span>
          <span className="text-sm text-mute" data-testid="user-email">
            {user.email
              ? `${user.email}${user.emailVerifiedAt ? " · verified" : " · unverified"}`
              : "none — complete until they redeem"}
          </span>
        </Row>
        <Row>
          <span>Discord</span>
          <span className="text-sm text-mute">{user.discordId ?? "not linked"}</span>
        </Row>
        <Row>
          <span>Parent server</span>
          <span className="text-sm text-mute" data-testid="user-parent">
            {user.parentGuildId ? (
              <Link href={`/admin/servers/${user.parentGuildId}`} className="underline">
                {user.parentGuildId}
              </Link>
            ) : (
              "none — nothing is blocked; no server earns from them"
            )}
          </span>
        </Row>
        <Row>
          <span>Onboarding</span>
          <span className="flex items-center gap-2 text-sm text-mute">
            <Light ok={unlock.unlocked} />
            {progress.label}
            {unlock.missing.length ? ` · missing ${unlock.missing.join(", ")}` : ""}
          </span>
        </Row>
      </Panel>

      <Panel
        title="Game accounts"
        note="One game account belongs to one gamer, forever"
        help={
          <p>
            <strong>Proven</strong> means ownership was actually established — a profile
            icon, an OAuth round trip. <strong>Linked</strong> means the account exists,
            which is a different claim. A game whose API cannot prove ownership carries
            no badge and no warning: it is not the gamer&apos;s fault the publisher has
            no endpoint.
          </p>
        }
      >
        {accounts.length === 0 ? (
          <Empty>None linked.</Empty>
        ) : (
          accounts.map((a) => (
            <Row key={a.id}>
              <div>
                <p>{a.inGameName ?? a.providerAccountId}</p>
                <p className="text-xs text-mute">{a.provider}</p>
              </div>
              <span className="text-sm text-mute" data-testid="account-proof">
                {isProven(a.verifiedMethod) ? "ownership proven" : "linked"} · {a.syncStatus}
              </span>
            </Row>
          ))
        )}
      </Panel>

      <Panel
        title="Trophies"
        note="What the prize vault owes this one gamer"
        action={<Money cents={liability} />}
      >
        {holdings.length === 0 ? (
          <Empty>None.</Empty>
        ) : (
          holdings.map(({ holding, trophy }) => (
            <Row key={holding.id} href={`/trophies/${trophy.id}`}>
              <span>{trophy.name}</span>
              <span className="text-sm text-mute">
                {trophy.valueCents > 0 ? formatMoney(trophy.valueCents) : "collectable"}
                {holding.redeemedAt ? " · cashed out" : ""}
                {holding.sweptAt ? " · swept" : ""}
              </span>
            </Row>
          ))
        )}
      </Panel>

      <Panel title="Challenges" note="Every entry, newest first">
        {entries.length === 0 ? (
          <Empty>None.</Empty>
        ) : (
          entries.slice(0, 30).map(({ participant, challenge }) => (
            <Row key={participant.id} href={`/admin/challenges/${challenge.id}`}>
              <span>{challenge.title}</span>
              <span className="text-sm text-mute">
                {participant.placement ? `#${participant.placement}` : "in progress"}
              </span>
            </Row>
          ))
        )}
      </Panel>

      <Panel title="Redemptions" note="Every request, and where it got to">
        {redemptions.length === 0 ? (
          <Empty>None.</Empty>
        ) : (
          redemptions.map((r) => (
            <Row key={r.id}>
              <span>{formatMoney(r.amountCents)}</span>
              <span className="text-sm text-mute">
                {r.status} · {r.method}
              </span>
            </Row>
          ))
        )}
        <p className="mt-3 text-xs text-mute">
          We hold a method <strong>word</strong> and an opaque provider handle. Not an
          IBAN, not a card, not a last four — the schema has nowhere to put one.
        </p>
      </Panel>
    </div>
  );
}
