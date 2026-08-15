// `/login/brand` and `/login/server` — docs/04-SURFACES.md §7 step 2.
//
// Access is by portal key, never a password (§6). That is not a shortcut: a
// password needs a reset flow, a reset flow needs an email, and an email is the
// thing this platform does not ask for. So there is no "forgot password" here —
// there is "ask us to reissue it", which is what actually happens.

import { notFound } from "next/navigation";
import { Panel, Button } from "../../ui.tsx";

export const dynamic = "force-dynamic";

const COPY = {
  brand: {
    title: "Brand portal",
    idLabel: "Portal ID",
    blurb:
      "Your portal ID and key were emailed to you when you signed up. The key " +
      "is shown once and we cannot show it again — if it is lost, ask us and " +
      "we will issue a new one.",
  },
  server: {
    title: "Server portal",
    idLabel: "Discord server ID",
    blurb:
      "Your key was sent to you in Discord. Anyone holding your server's admin " +
      "role can get it from the bot. If Cluster was removed from your server " +
      "the portal still works — only re-announcing needs the bot back.",
  },
} as const;

export default async function PortalLogin({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ id?: string; error?: string; next?: string }>;
}) {
  const { kind } = await params;
  if (kind !== "brand" && kind !== "server") notFound();
  const { id = "", error, next = "" } = await searchParams;
  const copy = COPY[kind];

  return (
    <main className="mx-auto max-w-lg px-6 py-20">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="mb-6 text-sm text-mute">{copy.blurb}</p>

      {error ? (
        <div
          data-testid="login-error"
          className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </div>
      ) : null}

      <Panel>
        <form action="/api/portal/unlock" method="post" className="flex flex-col gap-4">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="next" value={next} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">{copy.idLabel}</span>
            <input
              name="id"
              defaultValue={id}
              required
              className="rounded-lg border border-line bg-transparent px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Key</span>
            <input
              name="key"
              type="password"
              required
              autoComplete="off"
              className="rounded-lg border border-line bg-transparent px-3 py-2 font-mono"
            />
          </label>
          <Button type="submit" data-testid="unlock">
            Open portal
          </Button>
        </form>
      </Panel>

      <p className="mt-4 text-xs text-mute">
        Three wrong keys locks this portal for fifteen minutes. That is deliberate —
        a key is the only thing between somebody and your numbers.
      </p>
    </main>
  );
}
