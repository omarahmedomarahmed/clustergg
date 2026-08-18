// `/settings/privacy` — what we hold, and closing the account.
//
// ===== THE DELETE BUTTON IS WHERE R3 BECAME REAL =====
//
// V17 — *"deletion is refused outright while a redemption is in flight."*
// Until this sprint nothing on the platform deleted an account, so the rule
// had no code, and the suite carried a test named after it that asserted only
// that `redemptionsInFlight` counts what it says it counts.
//
// The refusal is in `deleteAccount`, inside the transaction that locks the
// row. This page shows the person their in-flight payouts **before** they
// press anything, so the refusal is an explanation and not a surprise — but
// the button stays live either way, because a rule enforced by a hidden button
// is a rule until somebody posts to the endpoint.

import Link from "next/link";
import { getDb } from "../../../lib/db/index.ts";
import { currentGamer } from "../../../lib/auth/current.ts";
import { redemptionsInFlight } from "../../../lib/trophies/redemption.ts";
import { formatMoney } from "../../../lib/money/amounts.ts";
import { legalSections } from "../../../lib/content/legal.ts";
import { Panel, Button, Refusal, Help } from "../../ui.tsx";
import { deleteAccountAction } from "../actions.ts";

export const dynamic = "force-dynamic";

export default async function Privacy({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const error = typeof query.error === "string" ? query.error : null;

  const gamer = await currentGamer();
  if (!gamer) {
    return (
      <main className="pt-8">
        <h1 className="text-2xl font-semibold tracking-tight">Privacy</h1>
        <p className="mt-4 text-sm text-mute">
          <Link href="/login" className="underline">
            Sign in
          </Link>{" "}
          to see what we hold about you.{" "}
          <Link href="/legal/privacy" className="underline">
            The privacy policy
          </Link>{" "}
          is public.
        </p>
      </main>
    );
  }

  const db = await getDb();
  const inFlight = await redemptionsInFlight(db, gamer.id);

  return (
    <main className="pt-8">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy</h1>

      {error ? (
        <div className="mt-6">
          <Refusal testId="privacy-error">{error}</Refusal>
        </div>
      ) : null}

      <Panel className="mt-6" title="What we hold about you">
        <ul className="flex flex-col gap-3 text-sm text-mute">
          {legalSections("privacy")
            .slice(0, 3)
            .map((s) => (
              <li key={s.heading}>
                <span className="text-white">{s.heading}.</span> {s.body}
              </li>
            ))}
        </ul>
        <p className="mt-4 text-sm">
          <Link href="/legal/privacy" className="underline">
            The whole policy
          </Link>
        </p>
      </Panel>

      <Panel className="mt-4" title="Close your account">
        <p className="text-sm text-mute">
          We mark the account closed and stop using it for anything.
          <Help title="What happens to a trophy you won">
            <p>
              A trophy worth money stays on our books after you go, because a brand
              really did pay for it and our prize vault has to keep saying so. It is not
              claimable once the account is closed, and Cluster admin eventually moves
              it to our own balance with a logged reason. Nothing about that gets you
              paid, so cash out first if you can.
            </p>
          </Help>
        </p>

        {inFlight.length > 0 ? (
          <div
            data-testid="in-flight-warning"
            className="mt-4 rounded-lg border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm text-amber-200"
          >
            <p className="font-medium">
              You have {inFlight.length} payout{inFlight.length === 1 ? "" : "s"} on the
              way.
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {inFlight.map((r) => (
                <li key={r.id}>
                  {formatMoney(r.amountCents)} · {r.status}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs">
              We will refuse to close the account until these land. Money already handed
              to a payment provider cannot be paid to a record that no longer exists.
            </p>
          </div>
        ) : null}

        <form action={deleteAccountAction} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">
              Type <strong>delete</strong> to confirm
            </span>
            <input
              name="confirm"
              className="rounded-lg border border-line bg-transparent px-3 py-2"
              data-testid="delete-confirm"
            />
          </label>
          <Button type="submit" data-testid="delete-account">
            Close my account
          </Button>
        </form>
      </Panel>
    </main>
  );
}
