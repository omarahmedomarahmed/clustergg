// Settings — contact, payout preference, admin role mapping, and the community
// profile that decides whether this server is scored at all.
//
// S5 — **the admin role is stored as an ID, never a name.** The field says so,
// and `setOwnerContact` refuses anything that is not one: a renamed role must
// not silently revoke somebody's access, and it would if we keyed on the thing
// people rename.
//
// House rule 5 — the payout section takes a *word* and a *reference*, and the
// form says in as many words that we do not want an account number. The check
// is in `setPayoutPreference`, not here: a rule enforced only by a form is a
// rule until somebody posts to the endpoint directly.

import { getDb } from "../../../../../lib/db/index.ts";
import { guildForPortal } from "../../../../../lib/portal/session.ts";
import { PAYOUT_PREFERENCES } from "../../../../../lib/portal/owner.ts";
import { Panel, Refusal } from "../../../components.tsx";
import { Button } from "../../../../ui.tsx";
import { saveSettingsAction, describeCommunityAction } from "../actions.ts";

export const dynamic = "force-dynamic";

const FIELD = "rounded-lg border border-line bg-transparent px-3 py-2";

export default async function OwnerSettings({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const query = await searchParams;
  await getDb();
  const guild = await guildForPortal(guildId);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      {typeof query.error === "string" ? (
        <Refusal testId="settings-error">{query.error}</Refusal>
      ) : null}
      {query.saved ? (
        <p data-testid="settings-saved" className="text-sm text-green-400">
          Saved.
        </p>
      ) : null}

      <Panel
        title="Your community"
        note="This is what gets your server into the weekly pool. Without it you are not scored — which is not the same as scoring zero"
      >
        <form action={describeCommunityAction} className="flex flex-col gap-3">
          <input type="hidden" name="guildId" value={guildId} />
          <textarea
            name="community"
            rows={4}
            defaultValue={guild.community ?? ""}
            placeholder="Who plays here, what they play, and what the server is for."
            className={FIELD}
            data-testid="community-profile"
          />
          <div>
            <Button type="submit">Save community profile</Button>
          </div>
        </form>
      </Panel>

      <Panel title="Contact and access">
        <form action={saveSettingsAction} className="flex flex-col gap-4">
          <input type="hidden" name="guildId" value={guildId} />

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Contact name</span>
            <input name="contactName" defaultValue={guild.contactName ?? ""} className={FIELD} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Contact email</span>
            <input
              name="contactEmail"
              type="email"
              defaultValue={guild.contactEmail ?? ""}
              className={FIELD}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Admin role ID</span>
            <input
              name="adminRoleId"
              defaultValue={guild.adminRoleId ?? ""}
              className={`${FIELD} font-mono`}
              data-testid="admin-role-id"
            />
            <span className="text-xs text-mute">
              The role <strong>ID</strong>, not its name — Developer Mode on, right-click
              the role, Copy ID. Anyone holding this role signs in with Discord and gets the
              bot&apos;s admin cards. We key on the ID so renaming the role does not
              silently lock everybody out.
            </span>
          </label>

          <fieldset className="flex flex-col gap-3 rounded-xl border border-line px-4 py-4">
            <legend className="px-1 text-sm text-mute">How you want to be paid</legend>

            <select
              name="payoutPreference"
              defaultValue={guild.payoutPreference ?? ""}
              className="rounded-lg border border-line bg-panel px-3 py-2"
              data-testid="payout-preference"
            >
              <option value="">Not set</option>
              {PAYOUT_PREFERENCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Provider reference</span>
              <input
                name="payoutHandle"
                defaultValue={guild.payoutHandle ?? ""}
                className={`${FIELD} font-mono`}
                data-testid="payout-handle"
              />
            </label>

            <p className="text-xs text-mute">
              <strong>Never put an account number here.</strong> We do not store one —
              not an IBAN, not a card, not a last four. This field is the opaque
              reference your payment provider gave you, and a form that accepted more
              would be storing a credential we have no business holding.
            </p>
          </fieldset>

          <div>
            <Button type="submit" data-testid="save-settings">
              Save
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
