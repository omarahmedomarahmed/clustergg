// `/login` — the same two doors, for somebody who already has an account.
//
// The one thing this page does that `/signup` does not is carry `next`
// through, because a portal redirect lands here: an owner who signed up by
// email and has not linked Discord is sent here with `need=discord`, and the
// page has to say *why* rather than just showing a form (S1).

import Link from "next/link";
import { discordConfigured } from "../../lib/auth/discord.ts";
import { isSafePath } from "../../lib/auth/oauth-state.ts";
import { Panel, Button } from "../ui.tsx";

export const dynamic = "force-dynamic";

const FIELD = "rounded-lg border border-line bg-transparent px-3 py-2";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawNext = typeof params.next === "string" ? params.next : "";
  const next = isSafePath(rawNext) ? rawNext : "";
  const error = typeof params.error === "string" ? params.error : null;
  const routed = typeof params.routed === "string" ? params.routed : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>

      {params.need === "discord" ? (
        <p
          data-testid="need-discord"
          className="mt-6 rounded-lg border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm text-amber-200"
        >
          That server portal opens for a linked Discord identity that Discord says
          admins the server. If you signed up with an email, sign in and link
          Discord — the portal is already there waiting, with everything your
          admins have done in it.
        </p>
      ) : null}

      {routed ? (
        // ===== A ROUTE, NOT A REFUSAL (I1c1) =====
        // Rendered in the ordinary colour, not the error colour. Nothing went
        // wrong: they have an account and this says how to reach it.
        <p
          data-testid="routed"
          className="mt-6 rounded-lg border border-line bg-panel px-4 py-3 text-sm"
        >
          {routed}
        </p>
      ) : null}

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
          <h2 className="font-medium">Continue with Discord</h2>
          <p className="mt-2 text-sm text-mute">
            The same account you have always had. This is also what opens a server
            portal.
          </p>
          <div className="mt-5">
            {discordConfigured() ? (
              <Link
                href={`/api/auth/discord?kind=signin${next ? `&next=${encodeURIComponent(next)}` : ""}`}
                className="inline-block rounded-lg bg-accent px-4 py-2 font-medium text-white hover:opacity-90"
                data-testid="discord-login"
              >
                Continue with Discord
              </Link>
            ) : (
              <p className="text-sm text-mute">
                Discord sign-in is not configured on this deployment.
              </p>
            )}
          </div>
        </Panel>

        <Panel>
          <h2 className="font-medium">Email and password</h2>
          <form action="/api/auth/gamer" method="post" className="mt-5 flex flex-col gap-3">
            <input type="hidden" name="action" value="signin" />
            <input type="hidden" name="next" value={next} />
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Email</span>
              <input name="email" type="email" required className={FIELD} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Password</span>
              <input name="password" type="password" required className={FIELD} />
            </label>
            <Button type="submit" data-testid="email-login">
              Sign in
            </Button>
          </form>
          <p className="mt-3 text-xs text-mute">
            <Link href="/reset?kind=gamer" className="underline">
              Forgot your password?
            </Link>
          </p>
        </Panel>
      </div>

      <p className="mt-8 text-sm text-mute">
        New here?{" "}
        <Link href="/signup" className="underline">
          Join Cluster
        </Link>
      </p>
    </main>
  );
}
