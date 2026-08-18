// `/setup` — the first admin, and the only way to make one. 10-SETUP §2.
//
// The five rows of that section's table are the five things this page does,
// and `setupState` decides which. The page renders the decision; it does not
// make one — `createFirstAdmin` re-checks everything, because a rendered form
// is a suggestion and the action is the rule.

import { redirect } from "next/navigation";
import { getDb } from "../../lib/db/index.ts";
import { setupState } from "../../lib/admin/setup.ts";
import { createFirstAdminAction } from "./actions.ts";

export const dynamic = "force-dynamic";

const FIELD =
  "w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm";

export default async function Setup({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const db = await getDb();
  const state = await setupState(db);

  if (state.kind !== "form") {
    // No form, and no hint about the token either way — the two messages are
    // the only thing this page says, exactly as specified.
    return (
      <main className="mx-auto max-w-md px-6 py-24">
        <h1 className="text-2xl font-semibold tracking-tight">Setup</h1>
        <p className="mt-3 text-sm text-mute" data-testid="setup-state">
          {state.message}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">Create the first admin</h1>
      <p className="mt-2 text-sm text-mute">
        This page works once. Delete <code>SETUP_TOKEN</code> from the environment
        afterwards and redeploy.
      </p>

      {typeof query.error === "string" ? (
        <p
          className="mt-6 rounded-lg border border-line px-3 py-2 text-sm"
          data-testid="setup-error"
        >
          {query.error}
        </p>
      ) : null}

      <form action={createFirstAdminAction} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-mute">Setup token</span>
          <input name="token" type="password" required className={FIELD} data-testid="setup-token" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-mute">Email</span>
          <input name="email" type="email" required className={FIELD} data-testid="setup-email" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-mute">Password</span>
          <input
            name="password"
            type="password"
            required
            className={FIELD}
            data-testid="setup-password"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-mute">Confirm password</span>
          <input
            name="confirm"
            type="password"
            required
            className={FIELD}
            data-testid="setup-confirm"
          />
        </label>
        <button
          type="submit"
          className="mt-2 rounded-lg border border-line px-4 py-2 text-sm"
          data-testid="setup-submit"
        >
          Create admin account
        </button>
      </form>
    </main>
  );
}
