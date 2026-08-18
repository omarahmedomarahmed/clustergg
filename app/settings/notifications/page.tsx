// `/settings/notifications` — what we send, and when.
//
// ===== THIS PAGE HAS NO SWITCHES, AND SAYS SO =====
//
// Every message the platform sends is transactional: a code you asked for, a
// payout moving, a week closing on a server you own. There is no marketing
// list, no digest and no re-engagement campaign — retention is deliberately
// out of scope (00 §11), so there is nothing here to unsubscribe from.
//
// The honest build is therefore a **list of what we send and why**, not four
// toggles wired to a preference column nobody reads. A toggle that does
// nothing is worse than no toggle: it is a promise, and the first person to
// find it does not work.
//
// 12 §6 — the one thing worth stating plainly is the guild-owner DM, because
// it is the message most likely to go missing. A guild owner who blocks DMs
// from server members never receives it and Discord says so quietly, which is
// why a failed DM is a recorded state on the guild registry rather than an
// error swallowed on a background path.

import Link from "next/link";
import { Panel, Help } from "../../ui.tsx";

export const dynamic = "force-dynamic";

const SENT = [
  {
    what: "A verification code",
    when: "When you ask for one, at signup or when you cash out a trophy",
    how: "Email",
  },
  {
    what: "Your payout moving",
    when: "As it goes from requested, to approved, to sent, to paid",
    how: "On the site",
  },
  {
    what: "A trophy landing",
    when: "Friday, when a week closes and placements are final",
    how: "The Discord card in the server you entered from",
  },
  {
    what: "Your rank movement",
    when: "Friday, whether or not you placed",
    how: "The same card",
  },
  {
    what: "Cluster is on your server",
    when: "When somebody adds the bot to a server you own",
    how: "A Discord DM to the guild owner",
  },
  {
    what: "What your server earned",
    when: "Every week close",
    how: "A Discord DM, and email as well once you have signed in at least once",
  },
] as const;

export default function Notifications() {
  return (
    <main className="pt-8">
      <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
      <p className="mt-2 text-sm text-mute">
        Everything below is transactional — something you asked for, or something
        happening to your money. There is no mailing list and no digest, so there is
        nothing here to switch off.
        <Help title="Why there are no toggles">
          <p>
            Because a toggle that does nothing is a promise, and the first person to
            find it does not work is right to stop believing the rest of the page. If we
            ever send something you did not ask for, a switch appears here at the same
            time.
          </p>
        </Help>
      </p>

      <Panel className="mt-6">
        <ul className="flex flex-col gap-4 text-sm">
          {SENT.map((row) => (
            <li key={row.what} data-testid="notification-row" data-what={row.what}>
              <p className="font-medium">{row.what}</p>
              <p className="text-mute">{row.when}</p>
              <p className="text-xs text-mute">{row.how}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="mt-4" title="If a Discord DM never arrives">
        <p className="text-sm text-mute">
          Discord lets people block direct messages from server members, and when that
          happens it declines the message quietly rather than telling us why. We record
          the failure against the server rather than losing it, so Cluster support can
          see that you were never reached — but the fix is at your end, in Discord&apos;s
          own privacy settings.
        </p>
        <p className="mt-3 text-sm">
          <Link href="/settings/connections" className="underline">
            Your connections
          </Link>
        </p>
      </Panel>
    </main>
  );
}
