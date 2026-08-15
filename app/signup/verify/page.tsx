// `/signup/verify` — the email door's second screen.
//
// I7a. The address is verified **here, at signup**, because it is the
// credential and a password reset is impossible without it. This is also the
// only time it is ever asked: redemption reads the same `emailVerifiedAt`, so
// a gamer who came through this door can be paid without `/redeem` asking for
// an address at all.

import { isDemoMode } from "../../../lib/db/index.ts";
import { Panel, Button } from "../../ui.tsx";

export const dynamic = "force-dynamic";

export default async function VerifyEmail({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const code = typeof params.code === "string" ? params.code : null;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
      <p className="mt-2 text-sm text-mute">
        We sent a six-digit code. Entering it proves the address is yours, which is
        what lets you reset your password later — and it is the same check we need
        before paying you, so we will not ask again.
      </p>

      {error ? (
        <p
          data-testid="verify-error"
          className="mt-6 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </p>
      ) : null}

      {isDemoMode && code ? (
        // Demo only, and fenced on the absence of a database. The screenshot
        // record has to walk this flow and there is no inbox to walk it with.
        <p
          data-testid="demo-code"
          className="mt-6 rounded-lg border border-line bg-panel px-4 py-3 text-sm"
        >
          Demo: your code is <strong className="font-mono">{code}</strong>. On a real
          deployment this arrives by email and never appears on screen.
        </p>
      ) : null}

      <Panel className="mt-6">
        <form action="/api/auth/gamer" method="post" className="flex flex-col gap-3">
          <input type="hidden" name="action" value="verify" />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Six-digit code</span>
            <input
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              defaultValue={isDemoMode && code ? code : ""}
              className="rounded-lg border border-line bg-transparent px-3 py-2 font-mono tracking-widest"
              data-testid="verify-code"
            />
          </label>
          <Button type="submit" data-testid="verify-submit">
            Verify
          </Button>
        </form>
      </Panel>
    </main>
  );
}
