import { communityChallenges } from "../../lib/site/queries.ts";
import { Nav, Card, Empty } from "../components.tsx";

export const dynamic = "force-dynamic";

// M24/C4 — a community challenge is public on the web, and that is the point:
// their competition advertises their server. M27 — the wording is always "a
// community challenge run by this server". They paid for it, it is theirs, we
// are the engine.
export default async function CommunityPage() {
  const list = await communityChallenges();
  return (
    <>
      <Nav />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Community challenges</h1>
          <p className="mt-2 max-w-2xl text-mute">
            Competitions run by Discord servers for their own members. To enter,
            join the server — that is how you get the key.
          </p>
        </div>
        {list.length === 0 ? (
          <Empty>No community challenges are running right now.</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {list.map((c) => (
              <Card key={c.id} href={`/challenges/${c.id}`}>
                <p className="font-medium">{c.title}</p>
                <p className="mt-1 text-sm text-mute">
                  A community challenge run by this server
                </p>
                <p className="mt-3 text-sm text-mute">{c.game}</p>
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
