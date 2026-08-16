// Messages — the server owner's half of H5.
//
// The same page as the brand's, deliberately not shared as a component: MS2
// keeps the two conversations apart at every level, and one component reading
// a `side` prop is one prop away from a brand thread rendering here.

import { getDb, schema } from "../../../../../lib/db/index.ts";
import { conversation, threadFor, isAwaitingReply } from "../../../../../lib/messages/threads.ts";
import { eq } from "drizzle-orm";
import { Panel, Button, Help } from "../../../../ui.tsx";
import { sendServerMessageAction } from "../actions.ts";

export const dynamic = "force-dynamic";

export default async function ServerMessages({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const db = await getDb();
  const threadId = await threadFor(db, { side: "server", guildId });
  const messages = await conversation(db, threadId);
  const [thread] = await db
    .select()
    .from(schema.messageThreads)
    .where(eq(schema.messageThreads.id, threadId));

  return (
    <div className="flex flex-col gap-6">
      <meta httpEquiv="refresh" content="30" />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Messages
          <Help title="Messages">
            Talk to Cluster — about your pool position, a payout, a community
            challenge, anything. This page refreshes itself, so a reply appears
            without you doing anything.
          </Help>
        </h1>
        <p className="mt-1 text-sm text-mute">
          {isAwaitingReply(thread ?? { lastAuthorKind: null })
            ? "Waiting on Cluster. An unanswered message keeps alerting them until somebody replies — you do not have to chase it."
            : "Up to date."}
        </p>
      </div>

      <Panel>
        {messages.length === 0 ? (
          <p className="text-sm text-mute">Nothing yet. Ask us anything.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {messages.map((m) => (
              <li key={m.id} className="text-sm">
                <p className="text-xs uppercase tracking-wide text-mute">
                  {m.authorKind === "cluster" ? "Cluster" : "You"} ·{" "}
                  {m.sentAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                </p>
                <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <form action={sendServerMessageAction} className="flex flex-col gap-3">
        <input type="hidden" name="guildId" value={guildId} />
        <textarea
          name="body"
          rows={4}
          placeholder="Write to Cluster"
          className="rounded-lg border border-line bg-ink px-3 py-2 text-sm"
        />
        <Button type="submit">Send</Button>
      </form>
    </div>
  );
}
