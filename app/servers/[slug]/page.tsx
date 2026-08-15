import Link from "next/link";
import { notFound } from "next/navigation";
import { serverBySlug } from "../../../lib/site/queries.ts";
import { Nav, Card, Empty } from "../../components.tsx";

export const dynamic = "force-dynamic";

export default async function ServerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await serverBySlug(slug);
  if (!found) notFound();
  const { guild, community } = found;

  return (
    <>
      <Nav />
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{guild.name}</h1>
          {guild.community ? (
            <p className="mt-2 max-w-2xl text-mute">{guild.community}</p>
          ) : null}
        </div>

        {/* The big Join button — this page exists to fill their server. */}
        <a
          href={`https://discord.com/servers/${guild.guildId}`}
          className="rounded-xl bg-accent px-6 py-4 text-center text-lg font-medium text-white"
        >
          Join this server
        </a>

        <section>
          <h2 className="text-xl font-medium">Their community challenges</h2>
          {community.length === 0 ? (
            <Empty>This server has not run one yet.</Empty>
          ) : (
            <div className="mt-2 grid gap-3">
              {community.map((c) => (
                <Card key={c.id} href={`/challenges/${c.id}`}>
                  <p className="font-medium">{c.title}</p>
                  <p className="mt-1 text-sm text-mute">
                    A community challenge run by this server
                  </p>
                </Card>
              ))}
            </div>
          )}
        </section>

        <Link href="/pool" className="text-sm text-mute underline underline-offset-4">
          See what every server is earning this week
        </Link>
      </main>
    </>
  );
}
