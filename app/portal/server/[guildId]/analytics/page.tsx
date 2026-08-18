// The Analytics tab — 12 §7a, complete.
//
// ===== THE TAB EXISTS BEFORE THE GRANT, AND IT IS EMPTY, NOT HIDDEN =====
//
// N2. An owner who cannot see what they are being offered cannot meaningfully
// consent to it, so this page shows what they would get behind an **Allow
// analytics** button rather than appearing out of nowhere once they agree.
//
// N4 — the sentence with a trap in it. The GUILD_MEMBERS intent is app-wide:
// one switch, every guild, no per-guild control. So per-server consent is
// **our** gate, kept in code, and *"we cannot read your member list"* would be
// a promise the architecture cannot keep. The wording is *we do not read this
// unless you ask us to*, and it is held in `ANALYTICS_NOTICES` so this page
// cannot paraphrase it away.

import { getDb } from "../../../../../lib/db/index.ts";
import {
  analyticsView,
  ANALYTICS_NOTICES,
} from "../../../../../lib/analytics/consent.ts";
import { serverPortalAccess } from "../../../../../lib/portal/session.ts";
import { mayEditProfile } from "../../../../../lib/portal/permissions.ts";
import { Panel, Button, Help } from "../../../../ui.tsx";
import { grantAnalyticsAction, refreshAnalyticsAction } from "../actions.ts";

export const dynamic = "force-dynamic";

export default async function AnalyticsTab({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const db = await getDb();
  const view = await analyticsView(db, guildId);
  const access = await serverPortalAccess(guildId);
  const mayGrant = mayEditProfile(access);

  return (
    <div className="flex flex-col gap-6" data-testid="analytics-tab">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Analytics
          <Help title="What this is, and what it is not">
            Your own dashboard of your own server, read only. Nothing here feeds
            your earnings — drop this data entirely and every dollar you have
            ever been paid is identical.
          </Help>
        </h1>
        {/* N4 — in words, on the page. */}
        <p className="mt-1 text-sm text-mute" data-testid="analytics-scope">
          {ANALYTICS_NOTICES.scope}
        </p>
      </div>

      {!view.granted ? (
        // ===== N2 — THE EMPTY STATE, SHOWING WHAT THEY WOULD GET =====
        <Panel>
          <p className="text-sm text-mute" data-testid="analytics-empty">
            Analytics is off for this server. Turn it on and this page shows your
            member count over time, your roles and who holds them, how many of
            your members are linked to Cluster, and how your entrants convert.
          </p>
          <p className="mt-3 text-sm text-mute">{ANALYTICS_NOTICES.readOnly}</p>
          {mayGrant ? (
            <form action={grantAnalyticsAction} className="mt-5">
              <input type="hidden" name="guildId" value={guildId} />
              <Button type="submit" data-testid="allow-analytics">
                Allow analytics
              </Button>
            </form>
          ) : (
            <p className="mt-4 text-sm text-mute">
              Only somebody who administers this server can turn it on.
            </p>
          )}
        </Panel>
      ) : (
        <>
          {/* N3 — the warning, in plain words, above the data. */}
          <Panel>
            <p className="text-sm" data-testid="analytics-warning">
              {ANALYTICS_NOTICES.sensitive}
            </p>
            <p className="mt-2 text-sm text-mute">{ANALYTICS_NOTICES.readOnly}</p>
          </Panel>

          <Panel>
            <h2 className="font-medium">Your server</h2>
            {view.snapshot ? (
              <>
                {/* S1 — never displayed without its date. */}
                <p className="mt-1 text-xs text-mute" data-testid="snapshot-taken-at">
                  Taken {view.takenAt?.toISOString().slice(0, 16).replace("T", " ")} UTC
                </p>
                <div className="mt-3 flex flex-col gap-1 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-mute">Members</span>
                    <span>{view.snapshot.memberCount.toLocaleString("en-US")}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-mute">Linked to Cluster</span>
                    <span>{view.snapshot.linkedCount.toLocaleString("en-US")}</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-mute" data-testid="no-snapshot-yet">
                Nothing read yet. Press Update to take your first snapshot.
              </p>
            )}
          </Panel>

          <Panel>
            <h2 className="font-medium">Update</h2>
            {view.refresh.allowed ? (
              <>
                <p className="mt-1 text-sm text-mute">
                  A fresh reading costs us a call to Discord, which is why it is
                  a button rather than something that happens on its own.
                </p>
                <form action={refreshAnalyticsAction} className="mt-4">
                  <input type="hidden" name="guildId" value={guildId} />
                  <Button type="submit" data-testid="update-analytics">
                    Update
                  </Button>
                </form>
              </>
            ) : (
              // Both held states, each with its reason and its when. N6 — the
              // last snapshot above still reads through either of them.
              <p className="mt-1 text-sm text-mute" data-testid={`held-${view.refresh.code}`}>
                {view.refresh.reason}
              </p>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
