// `/servers` — the server index.
//
// ===== `/servers/[slug]` EXISTED AND THERE WAS NOTHING ABOVE IT =====
//
// `14-EDITABLE` §7, and `04-SURFACES` §1 says what it is: *"every server with
// the bot and a complete profile — games, member range, bio, and a Join button.
// **How a gamer finds one**."*
//
// That last clause is the whole page. A gamer who arrives from the pool, or
// from a friend's profile, or from a search, has no way to get from "Cluster
// exists" to "here is a server I would like to be in" — and a server's own
// page is unreachable unless somebody already knew its slug.
//
// ===== A COMPLETE PROFILE IS THE FILTER =====
//
// A server we cannot describe is a server a gamer cannot choose between, so an
// incomplete one is absent rather than listed with three empty fields. It is
// the same completeness that gates the pool, read from the same function — two
// answers to "is this server ready" is how a server appears in the directory
// and earns nothing.

import Link from "next/link";
import { publicServers } from "../../lib/site/queries.ts";
import { liveCopy } from "../../lib/content/store.ts";
import { getDb } from "../../lib/db/index.ts";
import { pageArtFor } from "../../lib/site/page-art.ts";
import { Nav, Empty, PageArtLayer, Art } from "../components.tsx";

export const dynamic = "force-dynamic";

export default async function ServersPage() {
  const db = await getDb();
  const [servers, copy, art] = await Promise.all([
    publicServers(),
    liveCopy(),
    pageArtFor(db, "servers"),
  ]);

  return (
    <>
      <PageArtLayer art={art} />
      <Nav />
      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Servers</h1>
          <p className="mt-2 max-w-2xl text-mute">
            Every Discord server running Cluster. Join one and what you play
            starts earning for it.
          </p>
        </div>

        {servers.length === 0 ? (
          // D10 — a real empty state with a next action, never a blank panel.
          // On a brand-new deployment this is the first thing somebody sees
          // here, and "nothing yet" with no door is a dead end.
          <Empty>
            No servers have finished their profile yet.{" "}
            <Link href="/signup" className="underline">
              Add Cluster to yours
            </Link>{" "}
            and it will be listed here.
          </Empty>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2" data-testid="server-index">
            {servers.map((s) => (
              <li
                key={s.guildId}
                className="flex flex-col overflow-hidden rounded-xl border border-line"
                data-testid="server-card"
              >
                {/*
                  D23 — a cover that has gone renders the designed placeholder,
                  never a broken-image icon. A server's cover is the most likely
                  image on the platform to disappear: they chose it, they host
                  nothing, and they can delete it.
                */}
                <Art
                  src={s.coverImageUrl}
                  alt={`${s.name}'s cover`}
                  className="h-32 w-full object-cover"
                />
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <Link href={`/servers/${s.slug}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                    <span className="text-xs text-mute tabular-nums">
                      {s.memberCount.toLocaleString()} members
                    </span>
                  </div>
                  {s.community ? <p className="text-sm text-mute">{s.community}</p> : null}
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-xs text-mute">
                    {s.memberAgeRange ? (
                      <span className="rounded-lg border border-line px-2 py-1">
                        {s.memberAgeRange}
                      </span>
                    ) : null}
                    {s.gamesPlayed.slice(0, 3).map((g) => (
                      <span key={g} className="rounded-lg border border-line px-2 py-1">
                        {g}
                      </span>
                    ))}
                  </div>
                  {/* The big Join button, on every card. 04 §1. */}
                  {s.inviteUrl ? (
                    <a
                      href={s.inviteUrl}
                      className="mt-3 rounded-lg bg-accent px-4 py-2 text-center text-sm font-medium text-white"
                      data-testid="server-join"
                    >
                      Join this server
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="max-w-2xl border-t border-line pt-8 font-medium">{copy.discordTerms}</p>
      </main>
    </>
  );
}
