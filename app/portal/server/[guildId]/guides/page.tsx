// H2 — a docs and guides section **inside** the portal, not a link to the
// marketing site.
//
// The brand portal has had one since Sprint 10 and the owner portal did not,
// which is the half of 12 §11 that is easy to miss: H1's `i` icons explain one
// figure each, and H2 is the page somebody reads when they do not yet know
// which figure to ask about.
//
// 04 §7 C1 — every number here is imported. A guide is the most likely place
// on the platform to retype one, because prose genuinely reads better with a
// literal in it. That is trap 5, and it is why the pool guide below is built
// from `rulesFor("owner")`: one set of sentences, composed from the modules
// that enforce the figures, rendered in two places.

import Link from "next/link";
import { rulesFor } from "../../../../../lib/content/rules.ts";
import { Panel } from "../../../components.tsx";

export const dynamic = "force-dynamic";

export default async function OwnerGuides({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const rules = rulesFor("owner");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Guides</h1>

      <Panel
        title="How your server earns"
        note="Every figure below is read from the code that enforces it, so none of it can go stale"
      >
        <ul className="flex flex-col gap-4 text-sm">
          {rules.map((rule) => (
            <li key={rule.heading} data-guide={rule.heading}>
              <p className="font-medium">{rule.heading}</p>
              <p className="mt-1 text-mute">{rule.body}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Where to do each of these">
        <ul className="flex flex-col gap-2 text-sm">
          <li>
            <Link href={`/portal/server/${guildId}/settings`} className="underline">
              Describe your community
            </Link>{" "}
            <span className="text-mute">— the six fields that unlock the pool</span>
          </li>
          <li>
            <Link href={`/portal/server/${guildId}/standings`} className="underline">
              Your standing
            </Link>{" "}
            <span className="text-mute">— your three KPIs and what would move them</span>
          </li>
          <li>
            <Link href={`/portal/server/${guildId}/challenges`} className="underline">
              This week&apos;s challenges
            </Link>{" "}
            <span className="text-mute">— and the re-announce buttons</span>
          </li>
          <li>
            <Link href={`/portal/server/${guildId}/community`} className="underline">
              Build a community challenge
            </Link>{" "}
            <span className="text-mute">— your own competition, public on the web</span>
          </li>
          <li>
            <Link href={`/portal/server/${guildId}/messages`} className="underline">
              Ask Cluster
            </Link>{" "}
            <span className="text-mute">— somebody answers, and an unanswered thread
            keeps alerting them until they do</span>
          </li>
        </ul>
      </Panel>
    </div>
  );
}
