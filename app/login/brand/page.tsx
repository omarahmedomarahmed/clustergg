// `/login/brand` — the brand's door. Separate route, separate table (I2, B4).
//
// Two forms on one page, because a brand arrives here twice and the second
// time is the common one:
//
//   **Once**, with an emailed invite, which they exchange for a password (B1).
//   **Every time after**, with that email and password.
//
// There is no Discord here and there never will be — a brand is not a gamer
// (I4). And there is no portal key: what used to be a long-lived credential is
// now a one-time invite, dead the moment it is redeemed.

import Link from "next/link";
import { MIN_PASSWORD_LENGTH } from "../../../lib/identity/credentials.ts";
import { Panel, Button } from "../../ui.tsx";

export const dynamic = "force-dynamic";

const FIELD = "rounded-lg border border-line bg-transparent px-3 py-2";

export default async function BrandLogin({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Brand portal</h1>
      <p className="mt-2 max-w-xl text-sm text-mute">
        Your own challenges, your own trophies, and delivery numbers that are
        counted rather than modelled.
      </p>

      {error ? (
        <p
          data-testid="login-error"
          className="mt-6 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </p>
      ) : null}

      {params.reset ? (
        <p data-testid="reset-done" className="mt-6 text-sm text-green-400">
          Password changed. Sign in with the new one.
        </p>
      ) : null}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Panel>
          <h2 className="font-medium">Sign in</h2>
          <form action="/api/auth/brand" method="post" className="mt-5 flex flex-col gap-3">
            <input type="hidden" name="action" value="signin" />
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Email</span>
              <input name="email" type="email" required className={FIELD} data-testid="brand-email" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Password</span>
              <input
                name="password"
                type="password"
                required
                className={FIELD}
                data-testid="brand-password"
              />
            </label>
            <Button type="submit" data-testid="brand-signin">
              Sign in
            </Button>
          </form>
          <p className="mt-3 text-xs text-mute">
            <Link href="/reset?kind=brand" className="underline">
              Forgot your password?
            </Link>
          </p>
        </Panel>

        <Panel>
          <h2 className="font-medium">First time? Redeem your invite</h2>
          <p className="mt-2 text-sm text-mute">
            The key we emailed works <strong>once</strong>. Redeeming it sets the
            password you will use from then on.
          </p>
          <form action="/api/auth/brand" method="post" className="mt-5 flex flex-col gap-3">
            <input type="hidden" name="action" value="redeem" />
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Email</span>
              <input name="email" type="email" required className={FIELD} data-testid="invite-email" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Invite key</span>
              <input
                name="key"
                required
                autoComplete="off"
                className={`${FIELD} font-mono`}
                data-testid="invite-key"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Choose a password</span>
              <input
                name="password"
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                className={FIELD}
                data-testid="invite-password"
              />
              <span className="text-xs text-mute">
                At least {MIN_PASSWORD_LENGTH} characters.
              </span>
            </label>
            <Button type="submit" data-testid="invite-redeem">
              Redeem and set password
            </Button>
          </form>
        </Panel>
      </div>

      <p className="mt-8 text-sm text-mute">
        Looking for a gamer account?{" "}
        <Link href="/login" className="underline">
          Sign in here
        </Link>{" "}
        — brands and gamers are separate, on purpose.
      </p>
    </main>
  );
}
