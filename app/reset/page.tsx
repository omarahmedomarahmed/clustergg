// `/reset` — one page, both kinds. I1d.
//
// A gamer and a brand reset the same way because two implementations of "prove
// you still hold this address" is two places for the token comparison to be
// wrong, and the wrong one is the one nobody looks at.
//
// The page **never says whether the address exists.** Both outcomes render the
// same sentence, because a reset form that distinguishes is a form that
// confirms which of our users exist to anybody who asks.

import { isDemoMode } from "../../lib/db/index.ts";
import { MIN_PASSWORD_LENGTH } from "../../lib/identity/credentials.ts";
import { Panel, Button } from "../ui.tsx";

export const dynamic = "force-dynamic";

const FIELD = "rounded-lg border border-line bg-transparent px-3 py-2";

export default async function Reset({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const kind = params.kind === "brand" ? "brand" : "gamer";
  const endpoint = kind === "brand" ? "/api/auth/brand" : "/api/auth/gamer";
  const token = typeof params.token === "string" ? params.token : null;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">
        Reset your {kind === "brand" ? "brand portal" : "Cluster"} password
      </h1>

      {error ? (
        <p
          data-testid="reset-error"
          className="mt-6 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </p>
      ) : null}

      {params.sent ? (
        <p
          data-testid="reset-sent"
          className="mt-6 rounded-lg border border-line bg-panel px-4 py-3 text-sm"
        >
          If that address has an account, a reset link is on its way. It works once,
          and only for an hour.
          {isDemoMode && token ? (
            <>
              {" "}
              <span className="text-mute">
                Demo: the token is <strong className="font-mono">{token}</strong>.
              </span>
            </>
          ) : null}
        </p>
      ) : null}

      {token ? (
        <Panel className="mt-6">
          <form action={endpoint} method="post" className="flex flex-col gap-3">
            <input type="hidden" name="action" value="reset-complete" />
            <input type="hidden" name="token" value={token} />
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">New password</span>
              <input
                name="password"
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                className={FIELD}
                data-testid="new-password"
              />
            </label>
            <Button type="submit" data-testid="reset-complete">
              Set password
            </Button>
          </form>
        </Panel>
      ) : (
        <Panel className="mt-6">
          <form action={endpoint} method="post" className="flex flex-col gap-3">
            <input type="hidden" name="action" value="reset-begin" />
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Email</span>
              <input name="email" type="email" required className={FIELD} data-testid="reset-email" />
            </label>
            <Button type="submit" data-testid="reset-begin">
              Send a reset link
            </Button>
          </form>
        </Panel>
      )}

      <p className="mt-6 text-xs text-mute">
        A password reset needs a verified address, which is why the email door
        verifies yours the moment you sign up. If you came in through Discord you
        have no password to reset — sign in with Discord instead.
      </p>
    </main>
  );
}
