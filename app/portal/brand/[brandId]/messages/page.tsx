// Messages — the brand's half of H5.
//
// H6 — **refresh in place.** A brand refreshes for admin's replies; admin
// refreshes for theirs. Done with a meta refresh rather than a client bundle:
// it works with no JavaScript, it is visible in the screenshot record, and a
// support page that needs hydration is a support page missing on the render
// that failed.

import { getDb } from "../../../../../lib/db/index.ts";
import { conversation, threadFor, isAwaitingReply } from "../../../../../lib/messages/threads.ts";
import { schema } from "../../../../../lib/db/index.ts";
import { eq } from "drizzle-orm";
import { Panel, Button, Help } from "../../../../ui.tsx";
import { sendBrandMessageAction } from "../actions.ts";

export const dynamic = "force-dynamic";

export default async function BrandMessages({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const db = await getDb();
  const threadId = await threadFor(db, { side: "brand", brandId });
  const messages = await conversation(db, threadId);
  const [thread] = await db
    .select()
    .from(schema.messageThreads)
    .where(eq(schema.messageThreads.id, threadId));

  return (
    <div className="flex flex-col gap-6">
      {/* H6 — refresh in place, on all four surfaces. */}
      <meta httpEquiv="refresh" content="30" />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Messages
          <Help title="Messages">
            Talk to Cluster about anything — a challenge that needs setting up, a
            report that looks wrong, an invoice. This page refreshes itself, so a
            reply appears without you doing anything.
          </Help>
        </h1>
        <p className="mt-1 text-sm text-mute">
          {isAwaitingReply(thread ?? { lastAuthorKind: null })
            ? "Waiting on Cluster. Nobody has to chase this — an unanswered message keeps alerting them until somebody replies."
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

      <form action={sendBrandMessageAction} className="flex flex-col gap-3">
        <input type="hidden" name="brandId" value={brandId} />
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
