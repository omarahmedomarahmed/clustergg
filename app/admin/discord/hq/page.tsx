import { requireAdmin } from "@/lib/auth";
import { hqStatus, planHqSetup } from "@/lib/discord/hq";
import { HqServerForm, HqBuildButton, HqPlanTable } from "@/components/HqSetup";
import { AdminHeader, AdminSection, AdminSettings } from "@/components/AdminPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · HQ server" };

// Our own Discord server.
//
// The bot builds it: categories, text and voice channels, pinned starters with
// working buttons. This page exists because that creates real channels in a
// real server — the least reversible thing the bot does — so the plan is shown
// in full first and nothing happens until someone presses build.
export default async function HqPage() {
  await requireAdmin();
  const [status, plan] = await Promise.all([hqStatus(), planHqSetup()]);

  return (
    <div className="max-w-3xl">
      <AdminHeader
        title="HQ — our own server"
        subtitle="Point the bot at our Discord and it builds the whole thing: channels, categories, voice rooms and pinned starters. It runs once; changing the id runs it once on the new server."
        back={{ href: "/admin/discord", label: "Discord bot" }}
        stats={[
          { label: "Server id", value: status.guildId ? "set" : "not set", tone: status.guildId ? undefined : "warn" },
          { label: "Built", value: status.setupDone ? "yes" : "no", tone: status.setupDone ? undefined : "warn" },
          { label: "To create", value: plan.toCreate, tone: plan.toCreate ? "accent" : undefined },
        ]}
      />

      <AdminSection title="Which server is ours">
        <HqServerForm guildId={status.guildId} />
      </AdminSection>

      <AdminSection
        title="The plan"
        hint={plan.preview
          ? "The full blueprint. We couldn't read the server yet, so nothing below is marked as already existing."
          : "Exactly what the bot will create. Anything already there is left alone — it never renames, moves or deletes."}
        tone={plan.toCreate > 0 ? "warn" : undefined}
      >
        {plan.preview && plan.reason && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 mb-4">
            {plan.reason}
          </div>
        )}
        <HqPlanTable rows={plan.rows} preview={plan.preview} />
        <div className="mt-5">
          <HqBuildButton toCreate={plan.toCreate} alreadySetUp={plan.alreadySetUp} blocked={plan.preview} />
        </div>
      </AdminSection>

      <AdminSettings title="How this behaves">
        <div className="glass p-5 text-sm text-muted space-y-2">
          <p>
            <b className="text-ink">It runs once.</b> After a successful build we record which server was
            built. Loading this page again shows nothing left to create, and the button is disabled unless
            you deliberately re-run it.
          </p>
          <p>
            <b className="text-ink">Re-running is safe.</b> Every channel is created only if a channel of
            that name and type isn&apos;t already there, so a second pass fills gaps rather than duplicating.
            Names are compared the way Discord stores them (lowercase, dashes) — otherwise
            <code className="text-cyan-300"> Bug Reports</code> and
            <code className="text-cyan-300"> bug-reports</code> would look like different channels.
          </p>
          <p>
            <b className="text-ink">Moving HQ.</b> Change the id and build again; it runs once on the new
            server. The old one is left exactly as it is — we never delete anything.
          </p>
          <p>
            <b className="text-ink">Reports come here.</b> Installs, challenge requests and revenue unlocks
            from every server are posted into <code className="text-cyan-300">#server-reports</code> if it
            exists, otherwise <code className="text-cyan-300">#announcements</code>.
          </p>
        </div>
      </AdminSettings>
    </div>
  );
}
