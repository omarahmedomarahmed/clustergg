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
import {
  arbitrateTransferAction,
  confirmTransferAction,
  reassignOwnerAction,
  setAgeBandAction,
  setParentGuildAction,
  warnBeforeReassignmentAction,
} from "./actions.ts";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
      <span className="text-mute">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

const FIELD =
  "rounded-md border border-line bg-ink px-3 py-1.5 text-sm outline-none focus:border-white/30";
const BTN = "rounded-md border border-line px-3 py-1.5 text-sm hover:bg-white/5";

export default async function GuildRegistryPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const query = await searchParams;
  const str = (k: string) => (typeof query[k] === "string" ? (query[k] as string) : null);
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

      {str("error") ? (
        <p className="rounded-lg border border-line bg-ink px-4 py-3 text-sm" data-testid="registry-error">
          {str("error")}
        </p>
      ) : null}
      {str("notice") ? (
        <p className="rounded-lg border border-line bg-ink px-4 py-3 text-sm text-mute" data-testid="registry-notice">
          {str("notice")}
        </p>
      ) : null}

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
        {/*
          L10 — *"a failed DM is a recorded state the guild registry shows,
          with when it was tried."* The word alone answers what; the date
          answers whether it is a thing to chase or history. A `failed` here
          also refuses reassignment, which is why it is spelled out rather than
          shown as a colour.
        */}
        <Row
          label="Owner DM"
          value={
            (registry.ownership.dmState === "sent"
              ? "delivered"
              : registry.ownership.dmState
                ? `${registry.ownership.dmState} — recorded, not swallowed`
                : "never tried") +
            (registry.ownership.lastDmAt
              ? ` · last tried ${registry.ownership.lastDmAt.toISOString().slice(0, 16).replace("T", " ")} UTC`
              : "")
          }
        />
        {registry.ownership.dms.length > 0 ? (
          <Row
            label="DMs attempted"
            value={registry.ownership.dms
              .slice(0, 4)
              .map(
                (d) =>
                  `${d.kind.replace(/_/g, " ")}: ${d.status}${d.error ? ` (${d.error})` : ""}`,
              )
              .join(" · ")}
          />
        ) : null}
      </Panel>

      {/*
        ===== THE PAGE WAS READ-ONLY AND THE RULES WERE NOT =====

        Every control below calls a function that was written, guarded, and had
        no caller anywhere — `94-export-reach` found all five. The 14-day
        confirmation, the arbitration, the four-week reassignment, the age-band
        correction and A8's parent correction were rules with no way to perform
        them.

        The order is deliberate: warn, then reassign. `reassignOwner` refuses
        until the warning has actually been delivered, so the button above the
        one that takes somebody's earnings is the one that tells them first.
      */}
      <Panel>
        <h2 className="font-medium">Ownership actions</h2>
        <Help title="Why the warning comes first">
          <p>
            Reassigning somebody who was never told is indistinguishable from taking
            their money, so a reassignment is refused until Discord has accepted the
            warning DM. Queued is not delivered — the Owner DM row above says which.
          </p>
        </Help>

        <form action={warnBeforeReassignmentAction} className="mt-3">
          <input type="hidden" name="guildId" value={guildId} />
          <button type="submit" className={BTN} data-testid="warn-owner">
            Send the reassignment warning
          </button>
        </form>

        <form action={reassignOwnerAction} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="guildId" value={guildId} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">New owner Discord ID</span>
            <input name="newOwnerDiscordId" required className={FIELD} data-testid="reassign-to" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Why</span>
            <input name="reason" className={FIELD} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="holdsAdmin" data-testid="holds-admin" />
            <span className="text-mute">I have checked they hold ADMINISTRATOR right now</span>
          </label>
          <button type="submit" className={BTN} data-testid="reassign-owner">
            Reassign
          </button>
        </form>

        <form action={confirmTransferAction} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="guildId" value={guildId} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Confirmed by (outgoing owner&apos;s Discord ID)</span>
            <input name="byDiscordId" required className={FIELD} data-testid="confirm-by" />
          </label>
          <button type="submit" className={BTN} data-testid="confirm-transfer">
            Confirm the transfer
          </button>
        </form>

        <form action={arbitrateTransferAction} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="guildId" value={guildId} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Award ownership to (Discord ID)</span>
            <input name="newOwnerDiscordId" required className={FIELD} data-testid="arbitrate-to" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Why</span>
            <input name="reason" className={FIELD} />
          </label>
          <button type="submit" className={BTN} data-testid="arbitrate-transfer">
            Arbitrate a timed-out transfer
          </button>
        </form>
      </Panel>

      {/* A gamer-level correction, run from the server that raised it */}
      <Panel>
        <h2 className="font-medium">Corrections</h2>
        <Help title="Both of these are logged with both sides">
          <p>
            An age band is set once and only support can move it (G9). A parent
            server is stamped at a gamer&apos;s first bot click and a gamer can never
            change their own (A8) — this is the only thing that moves one, and it
            cannot move a closed week&apos;s money.
          </p>
        </Help>

        <form action={setAgeBandAction} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="guildId" value={guildId} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Gamer ID</span>
            <input name="userId" required className={FIELD} data-testid="ageband-user" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Band</span>
            <select name="ageBand" className={FIELD} data-testid="ageband-value">
              <option value="adult">adult</option>
              <option value="teen">teen</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Why</span>
            <input name="reason" className={FIELD} />
          </label>
          <button type="submit" className={BTN} data-testid="set-ageband">
            Set the age band
          </button>
        </form>

        <form action={setParentGuildAction} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="guildId" value={guildId} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Gamer ID</span>
            <input name="userId" required className={FIELD} data-testid="parent-user" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Parent guild ID (blank for none)</span>
            <input name="parentGuildId" className={FIELD} data-testid="parent-guild" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Why</span>
            <input name="reason" className={FIELD} />
          </label>
          <button type="submit" className={BTN} data-testid="set-parent">
            Correct the parent server
          </button>
        </form>
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
