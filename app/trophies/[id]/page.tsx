import Link from "next/link";
import { notFound } from "next/navigation";
import { trophyDetail } from "../../../lib/site/queries.ts";
import { Nav, Money, Empty } from "../../components.tsx";

export const dynamic = "force-dynamic";

export default async function TrophyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await trophyDetail(id);
  if (!detail) notFound();
  const { trophy, current, past } = detail;

  return (
    <>
      <Nav />
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{trophy.name}</h1>
          <p className="mt-2 text-lg">
            {trophy.valueCents > 0 ? (
              <Money cents={trophy.valueCents} />
            ) : (
              "A collectable — worth nothing, and yours forever."
            )}
          </p>
          {trophy.challengeId ? (
            <p className="mt-2 text-sm text-mute">
              From{" "}
              <Link href={`/challenges/${trophy.challengeId}`} className="underline underline-offset-4">
                this challenge
              </Link>
              .
            </p>
          ) : null}
        </div>

        <section>
          <h2 className="text-xl font-medium">Held by</h2>
          {current.length === 0 ? (
            <Empty>Nobody holds this one yet.</Empty>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2 text-sm">
              {current.map(({ user }) => (
                <li key={user.id}>
                  <Link href={`/u/${user.slug}`} className="rounded-lg border border-line px-3 py-2 hover:border-accent">
                    {user.displayName}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {past.length > 0 ? (
          <section>
            <h2 className="text-xl font-medium">Cashed out by</h2>
            <ul className="mt-2 flex flex-wrap gap-2 text-sm text-mute">
              {past.map(({ user }) => (
                <li key={user.id} className="rounded-lg border border-line px-3 py-2">
                  {user.displayName}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </>
  );
}
