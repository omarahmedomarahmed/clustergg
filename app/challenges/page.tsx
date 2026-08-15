import { liveChallenges, nextWeekChallenges, endedChallenges } from "../../lib/site/queries.ts";
import { Nav, Card, Money, Empty } from "../components.tsx";
import { demoNow } from "../../lib/site/clock.ts";

export const dynamic = "force-dynamic";

export default async function ChallengesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = demoNow(await searchParams);
  const [live, next, past] = await Promise.all([
    liveChallenges(now),
    nextWeekChallenges(now),
    endedChallenges(24),
  ]);

  const section = (title: string, list: typeof live, empty: string) => (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-medium">{title}</h2>
      {list.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((c) => (
            <Card key={c.id} href={`/challenges/${c.id}`}>
              <p className="font-medium">{c.title}</p>
              <p className="mt-1 text-sm text-mute">{c.game}</p>
              <p className="mt-3 text-sm">Prize pool <Money cents={c.prizePoolCents} /></p>
            </Card>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <>
      <Nav />
      <main className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Challenges</h1>
        {section("This week", live, "Nothing is live right now.")}
        {section("Next week", next, "Next week's challenges are announced during the weekend.")}
        {section("Past", past, "Nothing has closed yet.")}
      </main>
    </>
  );
}
