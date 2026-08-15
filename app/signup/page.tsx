// Sign up, which is really "arrive from Discord".
//
// There is no password on this platform, for anybody. A gamer is their Discord
// account; a server owner holds a portal key; a brand holds a portal key. So
// this page has one real button, and — only when the process has no database
// of its own — a demo door beside it, because the whole build and test cycle
// runs with nothing configured.

import { redirect } from "next/navigation";
import { isDemoMode } from "../../lib/db/index.ts";
import { currentGamer } from "../../lib/auth/current.ts";
import { Panel, Button } from "../ui.tsx";
import { demoSignInAction } from "./actions.ts";
import { discordConfigured, discordAuthUrl } from "../../lib/auth/discord.ts";

export default async function SignupPage() {
  if (await currentGamer()) redirect("/onboarding");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Join ClusterGG</h1>
      <p className="text-sm text-mute">
        No password, and no email until you cash something out.
      </p>

      <Panel>
        {discordConfigured() ? (
          <a
            href={discordAuthUrl()}
            className="block rounded-lg bg-[#5865F2] px-4 py-3 text-center font-medium text-white"
          >
            Continue with Discord
          </a>
        ) : (
          <p className="text-sm text-mute">
            Discord sign-in is not configured on this deployment yet. It is the
            last step in <code>docs/10-SETUP.md</code>, and it is a dashboard
            click — nothing here needs a terminal.
          </p>
        )}
      </Panel>

      {isDemoMode ? (
        <Panel>
          <p className="text-sm text-mute">
            This deployment has no database of its own, so it is running the
            in-process demo. Sign in as anybody:
          </p>
          <form action={demoSignInAction} className="mt-3 flex gap-2">
            <input
              name="displayName"
              placeholder="Display name"
              className="min-w-0 flex-1 rounded-lg border border-line bg-ink px-3 py-2"
            />
            <Button type="submit">Sign in</Button>
          </form>
        </Panel>
      ) : null}
    </main>
  );
}
