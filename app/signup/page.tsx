// `/signup` — two doors, side by side, neither one second class.
//
// I1. Discord sign-in **or** email + password, and either reaches every gamer
// surface. The page shows them as equals rather than one big button and a
// small "or…" link, because the small link is how you tell somebody their door
// is the awkward one.
//
// I10 — **`guilds` is not requested here.** Signup stays frictionless; the
// server-owner path asks for it during onboarding, where somebody has already
// said that is what they are.
//
// I7a — the email door verifies the address on the next screen, because it is
// the credential. The Discord door asks for no email at all (G2).

import Link from "next/link";
import { discordConfigured } from "../../lib/auth/discord.ts";
import { MIN_PASSWORD_LENGTH } from "../../lib/identity/credentials.ts";
import { Panel, Button } from "../ui.tsx";

export const dynamic = "force-dynamic";

const FIELD = "rounded-lg border border-line bg-transparent px-3 py-2";

export default async function SignUp({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const unconfigured = params.discord === "unconfigured";

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Join Cluster</h1>
      <p className="mt-2 max-w-xl text-sm text-mute">
        Two ways in, and they reach exactly the same platform. Use whichever you
        prefer — you can add the other one later, from settings.
      </p>

      {error ? (
        <p
          data-testid="signup-error"
          className="mt-6 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {/* ── Door one ─────────────────────────────────────────────────── */}
        <Panel>
          <h2 className="font-medium">Continue with Discord</h2>
          <p className="mt-2 text-sm text-mute">
            No email, ever — not until you want to be paid. If a Cluster server
            brought you here, this is also how that server gets credit for you.
          </p>
          <div className="mt-5">
            {discordConfigured() ? (
              <Link
                href="/api/auth/discord?kind=signin&next=/onboarding"
                className="inline-block rounded-lg bg-accent px-4 py-2 font-medium text-white hover:opacity-90"
                data-testid="discord-signup"
              >
                Continue with Discord
              </Link>
            ) : (
              // House rule 11 applied to a door rather than a card: a
              // deployment without Discord credentials is a working platform
              // with one door shut, not a broken page.
              <p data-testid="discord-unavailable" className="text-sm text-mute">
                Discord sign-in is not configured on this deployment yet. The email
                door below works and reaches everything.
              </p>
            )}
          </div>
          {unconfigured ? (
            <p className="mt-3 text-xs text-amber-300">
              Discord sign-in is not set up here yet.
            </p>
          ) : null}
        </Panel>

        {/* ── Door two ─────────────────────────────────────────────────── */}
        <Panel>
          <h2 className="font-medium">Sign up with an email</h2>
          <p className="mt-2 text-sm text-mute">
            We verify it on the next screen, because it is your password reset.
            You will not be asked for it again — not even when you get paid.
          </p>
          <form action="/api/auth/gamer" method="post" className="mt-5 flex flex-col gap-3">
            <input type="hidden" name="action" value="signup" />
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Display name</span>
              <input name="displayName" required className={FIELD} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Email</span>
              <input name="email" type="email" required className={FIELD} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Password</span>
              <input
                name="password"
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                className={FIELD}
              />
              <span className="text-xs text-mute">
                At least {MIN_PASSWORD_LENGTH} characters. Length is the part that
                matters — a long ordinary phrase beats a short clever one.
              </span>
            </label>
            <Button type="submit" data-testid="email-signup">
              Create account
            </Button>
          </form>
        </Panel>
      </div>

      <p className="mt-8 text-sm text-mute">
        Already here?{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>
        . A brand?{" "}
        <Link href="/login/brand" className="underline">
          Brand portal
        </Link>
        .
      </p>
    </main>
  );
}
