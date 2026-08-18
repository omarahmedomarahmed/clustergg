// The guild registry — **the page opened when an owner asks "why am I not
// earning?"**
//
// 12 §8 and 05 §6. Eight sections, all of them assembled by
// `lib/admin/registry.ts` so this page and the bot's admin card render the
// same answer rather than two.
//
// Two things this page says out loud, because both are honest gaps that admin
// would otherwise act on:
//
//   G3 — Refresh pulls **owner and roles only**, never the member list.
//   G5 — Role holders are people we have **seen**. Somebody who holds the role
//        and has never pressed a button is not on this list.

import { notFound } from "next/navigation";
import { getDb } from "../../../../lib/db/index.ts";
import { guildRegistry } from "../../../../lib/admin/registry.ts";
import { weekRecordsForGuild } from "../../../../lib/pool/record.ts";
import { refreshAllowedAt, REFRESH_COOLDOWN_MS } from "../../../../lib/discord/guilds.ts";
import { formatMoney } from "../../../../lib/money/amounts.ts";
import { Panel, Help } from "../../../ui.tsx";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
      <span className="text-mute">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export default async function GuildRegistryPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const db = await getDb();
  const registry = await guildRegistry(db, guildId);
  if (!registry) notFound();

  const weeks = await weekRecordsForGuild(db, guildId);

  return (
    <div className="flex flex-col gap-6" data-testid="guild-registry">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{guildId}</h1>
        <p className="mt-1 text-sm text-mute">
          Everything about this server, in one place — the page to open when an
          owner asks why they are not earning.
        </p>
      </div>

      {/* 1 · Ownership */}
      <Panel>
        <h2 className="font-medium">Ownership</h2>
        <Row label="Guild owner" value={registry.ownership.ownerDiscordId ?? "not known yet"} />
        <Row
          label="Has the owner ever signed in"
          value={
            registry.ownership.hasEverSignedIn
              ? registry.ownership.firstSignInAt?.toISOString().slice(0, 10)
              : "never"
          }
        />
        <Row
          label="Owner DM"
          value={
            registry.ownership.dmState === "sent"
              ? "delivered"
              : registry.ownership.dmState
                ? `${registry.ownership.dmState} — recorded, not swallowed`
                : "not sent yet"
          }
        />
        <Row label="Transfer" value={registry.ownership.transfer.state.replace(/_/g, " ")} />
        <Row
          label="Reassignment"
          value={
            registry.ownership.reassignment.eligible
              ? "open — four weeks with no sign-in"
              : `opens ${registry.ownership.reassignment.at.toISOString().slice(0, 10)}`
          }
        />
      </Panel>

      {/* 2 · Who installed it */}
      <Panel>
        <h2 className="font-medium">
          Who installed it
          <Help title="Who installed the bot">
            Captured at the install redirect or lost forever — Discord&rsquo;s API
            will never tell us afterwards (G1).
          </Help>
        </h2>
        <Row label="Installed" value={registry.install.installedAt.toISOString().slice(0, 10)} />
        <Row label="By" value={registry.install.installedByDiscordId ?? "not captured"} />
        <Row
          label="Were they the owner"
          value={registry.install.installerWasOwner === null ? "unknown" : String(registry.install.installerWasOwner)}
        />
        {registry.install.removedAt ? (
          <Row label="Bot removed" value={registry.install.removedAt.toISOString().slice(0, 10)} />
        ) : null}
      </Panel>

      {/* 3 · Permissions */}
      <Panel>
        <h2 className="font-medium">Permissions</h2>
        <Row label="Mapped role (ID, never a name)" value={registry.permissions.adminRoleId ?? "none mapped"} />
        {registry.permissions.seenHolders.length === 0 ? (
          <p className="mt-2 text-sm text-mute">Nobody seen holding it yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {registry.permissions.seenHolders.map((h) => (
              <li key={h.discordId} className="flex justify-between gap-4">
                <span>{h.discordId}</span>
                <span className="text-mute">
                  {h.source} · seen {h.seenAt.toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {/* G5, in words, on the page — not a footnote. */}
        <p className="mt-3 text-sm text-mute">{registry.permissions.note.replace(/\*\*/g, "")}</p>
      </Panel>

      {/* 4 · Pool eligibility */}
      <Panel>
        <h2 className="font-medium">Pool eligibility</h2>
        <Row label="In this week&rsquo;s pool" value={registry.inThisWeeksPool ? "yes" : "no"} />
        <Row
          label="Linked members (parent)"
          value={`${registry.eligibility?.linkedMembers ?? 0} of 10`}
        />
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {(registry.eligibility?.profile.fields ?? []).map((f) => (
            <li key={f.key} className="flex justify-between gap-4">
              <span className="text-mute">{f.label}</span>
              <span>{f.done ? "✓" : "—"}</span>
            </li>
          ))}
        </ul>
        {registry.eligibility?.reason ? (
          <p className="mt-3 text-sm text-mute">{registry.eligibility.reason}</p>
        ) : null}
      </Panel>

      {/* The week-by-week history strip — 05 §6. Read, never recomputed. */}
      <Panel>
        <h2 className="font-medium">
          Week by week
          <Help title="The weekly record">
            Written once at the close and never recalculated. If a figure here
            disagrees with the payout, that is a defect to raise — never a
            number to quietly recompute.
          </Help>
        </h2>
        {weeks.length === 0 ? (
          <p className="mt-2 text-sm text-mute">No closed weeks yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm" data-testid="week-strip">
            {weeks.map((w) => (
              <li key={w.id} className="flex justify-between gap-4">
                <a
                  className="underline"
                  href={`/admin/weeks/${w.weekStart.toISOString().slice(0, 10)}/${guildId}`}
                >
                  {w.weekStart.toISOString().slice(0, 10)}
                </a>
                <span className="text-mute">
                  {w.eligible
                    ? `#${w.rank} of ${w.serversInPool} · ${formatMoney(w.totalCents)}`
                    : "not in the pool"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* 5 · Money */}
      <Panel>
        <h2 className="font-medium">Money</h2>
        <Row label="Payouts" value={String(registry.money.lifetimePayouts.length)} />
        <Row
          label="Community spend requests waiting"
          value={String(registry.money.pendingSpendRequests.length)}
        />
      </Panel>

      {/* 6 · Refresh — owner and roles only */}
      <Panel>
        <h2 className="font-medium">
          Refresh
          <Help title="What Refresh pulls">
            Owner and roles only. It never lists your members — nothing in the
            weekly cycle reads a member list (12 §7).
          </Help>
        </h2>
        <p className="mt-1 text-sm text-mute">
          Two calls, cooled down for {Math.round(REFRESH_COOLDOWN_MS / 60000)} minutes.
          {refreshAllowedAt(null) ? "" : ""}
        </p>
      </Panel>

      {/* 7 · Analytics */}
      <Panel>
        <h2 className="font-medium">Analytics</h2>
        <Row label="Granted" value={registry.analytics.granted ? "yes" : "no"} />
        <Row
          label="Last snapshot"
          value={
            registry.analytics.takenAt
              ? registry.analytics.takenAt.toISOString().slice(0, 16).replace("T", " ") + " UTC"
              : "none"
          }
        />
        {!registry.analytics.refresh.allowed ? (
          <p className="mt-2 text-sm text-mute">{registry.analytics.refresh.reason}</p>
        ) : null}
      </Panel>

      {/* 8 · Audit */}
      <Panel>
        <h2 className="font-medium">Audit</h2>
        {registry.audit.length === 0 ? (
          <p className="mt-2 text-sm text-mute">Nothing yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {registry.audit.map((a) => (
              <li key={a.id} className="flex justify-between gap-4">
                <span>{a.action}</span>
                <span className="text-mute">{a.at.toISOString().slice(0, 16).replace("T", " ")}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
