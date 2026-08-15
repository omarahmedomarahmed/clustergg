// The owner portal shell. **The gate is here**, so no page can forget it.
//
// S7 — every page in this portal also exists as an admin bot card. That is why
// each page below renders an object from `lib/portal/owner.ts` and computes
// nothing of its own: the card renders the same object, and two surfaces that
// each do their own arithmetic are two surfaces that can tell an owner
// different numbers about their own money.

import Link from "next/link";
import { requirePortal, guildForPortal } from "../../../../lib/portal/session.ts";

export const dynamic = "force-dynamic";

const NAV = [
  { path: "", label: "Overview" },
  { path: "/challenges", label: "This week" },
  { path: "/standings", label: "Standings" },
  { path: "/members", label: "Members" },
  { path: "/community", label: "Community challenges" },
  { path: "/wallet", label: "Wallet" },
  { path: "/settings", label: "Settings" },
];

export default async function OwnerPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const guild = await guildForPortal(guildId);
  await requirePortal("server", guildId);

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span className="font-semibold tracking-tight">{guild.name}</span>
            <span className="text-xs text-mute">server portal</span>
          </div>
          <nav className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.path}
                href={`/portal/server/${guildId}${n.path}`}
                className="text-mute hover:text-white"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {guild.removedAt ? (
        // S9 — the portal survives the bot's removal, and says what to do
        // rather than what happened. Earnings, standings and history are all
        // ours; only re-announcing needs the bot back.
        <div
          data-testid="bot-removed"
          className="border-b border-amber-900 bg-amber-950/40 px-6 py-3 text-center text-sm text-amber-300"
        >
          Cluster is not in this server right now. Everything here still works —
          tell your admin to reinstall Cluster and announcing resumes.
        </div>
      ) : null}

      <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
    </div>
  );
}
