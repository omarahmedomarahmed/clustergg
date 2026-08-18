// `/settings` — the account tab.
//
// G9 — **the age band cannot be changed by the gamer.** Support only. So it is
// shown as a fact with the reason beside it and no control at all, rather than
// as a disabled input: a greyed field invites the question *"why can't I?"*,
// and a sentence answers it.
//
// U6/I1b — a gamer with no email is complete. This page says that, rather than
// nagging for one: the only moment an email is required is redemption, and it
// is verified there.

import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../lib/db/index.ts";
import { currentGamer } from "../../lib/auth/current.ts";
import { unlockState } from "../../lib/identity/unlock.ts";
import { progressOf } from "../../lib/identity/onboarding.ts";
import { AGE_BAND_COPY, type AgeBand } from "../../lib/identity/age.ts";
import { countryName } from "../../lib/identity/countries.ts";
import { Panel, Button, Progress } from "../ui.tsx";
import { signOutAction } from "./actions.ts";

export const dynamic = "force-dynamic";

export default async function Account() {
  const gamer = await currentGamer();
  if (!gamer) {
    return (
      <main className="pt-8">
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-4 text-sm text-mute">
          <Link href="/login" className="underline">
            Sign in
          </Link>{" "}
          to change your settings.
        </p>
      </main>
    );
  }

  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, gamer.id));
  const unlock = await unlockState(db, gamer.id);

  return (
    <main className="pt-8">
      <h1 className="text-2xl font-semibold tracking-tight">Account</h1>

      {!unlock.unlocked ? (
        <Panel className="mt-6">
          <p className="text-sm">
            Onboarding is not finished, so nothing accrues yet.{" "}
            <Link href="/onboarding" className="underline">
              Finish it
            </Link>
            .
          </p>
          <div className="mt-3">
            <Progress progress={progressOf(unlock)} testId="onboarding-progress" />
          </div>
        </Panel>
      ) : null}

      <Panel className="mt-6" title="Who you are">
        <dl className="flex flex-col gap-3 text-sm">
          <div>
            <dt className="text-mute">Display name</dt>
            <dd data-testid="display-name">{user?.displayName}</dd>
          </div>
          <div>
            <dt className="text-mute">Age band</dt>
            <dd data-testid="age-band">
              {user?.ageBand ? AGE_BAND_COPY[user.ageBand as AgeBand].label : "Not set"}
              <p className="mt-1 text-xs text-mute">
                You cannot change this yourself, and that is on purpose — it decides
                whether money can be paid to you. If you have turned 18, contact support
                and they will move you.
              </p>
            </dd>
          </div>
          <div>
            <dt className="text-mute">Country</dt>
            <dd data-testid="country">
              {user?.country ? countryName(user.country) : "Not set"}
            </dd>
          </div>
          <div>
            <dt className="text-mute">Email</dt>
            <dd data-testid="email">
              {user?.email ? (
                <>
                  {user.email}
                  {user.emailVerifiedAt ? " · verified" : " · not verified"}
                </>
              ) : (
                "None — and that is complete. We ask for one when you cash out, and " +
                "verify it then."
              )}
            </dd>
          </div>
          <div>
            <dt className="text-mute">Parent server</dt>
            <dd data-testid="parent-server">
              {user?.parentGuildId
                ? "Set. It is where you first pressed a bot button, and it is permanent — " +
                  "only Cluster support can change it."
                : "None. Everything works without one; it only means no server earns " +
                  "from you."}
            </dd>
          </div>
        </dl>
      </Panel>

      <Panel className="mt-4" title="Sessions">
        <form action={signOutAction}>
          <Button type="submit" data-testid="sign-out">
            Sign out
          </Button>
        </form>
      </Panel>
    </main>
  );
}
