// `/settings/connections` — the two doors, and the game accounts.
//
// Built here rather than in sprint 11 because the ownership-proof route and
// the Discord link flow both return to it, and a redirect target that does not
// exist is the bug `94-reachability` was written for.
//
// I1c/U4b — the link button never merges. If that Discord is already on
// another account the answer is a route to it, and both accounts stay.

import Link from "next/link";
import { getDb } from "../../../lib/db/index.ts";
import { currentGamer } from "../../../lib/auth/current.ts";
import { accountsFor } from "../../../lib/identity/accounts.ts";
import { discordConfigured } from "../../../lib/auth/discord.ts";
import { Panel, Button } from "../../ui.tsx";

export const dynamic = "force-dynamic";

export default async function Connections({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const gamer = await currentGamer();
  if (!gamer) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Connections</h1>
        <p className="mt-4 text-sm text-mute">
          <Link href="/login" className="underline">
            Sign in
          </Link>{" "}
          to see your connections.
        </p>
      </main>
    );
  }

  const db = await getDb();
  const accounts = await accountsFor(db, gamer.id);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Connections</h1>

      {typeof params.routed === "string" ? (
        // The route, not a refusal. Ordinary colour, because nothing is wrong.
        <p
          data-testid="routed"
          className="mt-6 rounded-lg border border-line bg-panel px-4 py-3 text-sm"
        >
          {params.routed}
        </p>
      ) : null}
      {typeof params.note === "string" ? (
        <p data-testid="note" className="mt-6 rounded-lg border border-line bg-panel px-4 py-3 text-sm">
          {params.note}
        </p>
      ) : null}
      {params.linked ? (
        <p data-testid="linked" className="mt-6 text-sm text-green-400">
          Linked.
        </p>
      ) : null}

      <Panel className="mt-6">
        <h2 className="font-medium">Discord</h2>
        <p className="mt-2 text-sm text-mute">
          {gamer.discordId
            ? "Linked. This is also what opens a server portal, if you admin one."
            : "Not linked. Linking it lets a server earn from you, and opens a portal if you admin one."}
        </p>
        {!gamer.discordId && discordConfigured() ? (
          <p className="mt-4">
            <Link
              href="/api/auth/discord?kind=link&next=/settings/connections"
              className="inline-block rounded-lg bg-accent px-4 py-2 font-medium text-white hover:opacity-90"
              data-testid="link-discord"
            >
              Link Discord
            </Link>
          </p>
        ) : null}
      </Panel>

      <Panel className="mt-4">
        <h2 className="font-medium">Game accounts</h2>
        {accounts.length === 0 ? (
          <p className="mt-2 text-sm text-mute">None linked yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between border-b border-line pb-2 last:border-0">
                <span>
                  {a.inGameName ?? a.providerAccountId}
                  <span className="ml-2 text-xs text-mute">{a.provider}</span>
                </span>
                {/* C5 — never the word "verified" unless ownership was proven.
                    `exists` means the account exists, which is a different claim. */}
                <span className="text-xs text-mute">
                  {["icon", "oauth", "openid", "admin"].includes(a.verifiedMethod)
                    ? "ownership proven"
                    : "linked"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </main>
  );
}
