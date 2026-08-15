import Link from "next/link";
import { notFound } from "next/navigation";
import { profileBySlug } from "../../../lib/site/queries.ts";
import { Nav, Money, Empty } from "../../components.tsx";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await profileBySlug(slug);
  if (!found) notFound();
  const { user, holdings, entries } = found;

  return (
    <>
      <Nav />
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">{user.displayName}</h1>

        <section>
          <h2 className="text-xl font-medium">Trophies</h2>
          {holdings.length === 0 ? (
            <Empty>No trophies yet.</Empty>
          ) : (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {holdings.map(({ holding, trophy }) => (
                <li key={holding.id} className="rounded-lg border border-line px-4 py-3 text-sm">
                  <Link href={`/trophies/${trophy.id}`} className="font-medium">
                    {trophy.name}
                  </Link>
                  <p className="mt-1 text-mute">
                    {trophy.valueCents > 0 ? <Money cents={trophy.valueCents} /> : "Collectable"}
                    {holding.redeemedAt ? " · cashed out" : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-xl font-medium">Challenges entered</h2>
          {entries.length === 0 ? (
            <Empty>None yet.</Empty>
          ) : (
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {entries.map(({ participant, challenge }) => (
                <li key={participant.id} className="flex justify-between rounded-lg border border-line px-4 py-3">
                  <Link href={`/challenges/${challenge.id}`}>{challenge.title}</Link>
                  <span className="text-mute">
                    {participant.placement ? `#${participant.placement}` : "in progress"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
