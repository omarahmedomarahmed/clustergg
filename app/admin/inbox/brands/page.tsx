// The brand inbox. **MS2 — two surfaces, never merged.**
//
// A brand thread never appears in the other one. They are different
// conversations with different people about different money, and one list of
// both is a list somebody replies to from the wrong context.
//
// H6/H7 — refresh in place, and an unanswered thread keeps alerting until
// somebody replies. The alert is derived from who spoke last, so opening this
// page does not clear it.

import { getDb } from "../../../../lib/db/index.ts";
import { inbox } from "../../../../lib/messages/threads.ts";
import { Panel } from "../../../ui.tsx";

export const dynamic = "force-dynamic";

export default async function BrandInbox() {
  const rows = await inbox(await getDb(), "brand");
  const waiting = rows.filter((r) => r.awaitingReply);

  return (
    <div className="flex flex-col gap-6">
      <meta httpEquiv="refresh" content="30" />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Brand inbox</h1>
        <p className="mt-1 text-sm text-mute">
          {waiting.length === 0
            ? "Nothing waiting on us."
            : `${waiting.length} waiting on a reply. Reading one does not answer it.`}
        </p>
      </div>

      <Panel>
        {rows.length === 0 ? (
          <p className="text-sm text-mute">No conversations yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.threadId} className="flex items-baseline justify-between gap-4 text-sm">
                <span>{r.name}</span>
                <span className="text-mute">
                  {r.awaitingReply
                    ? `waiting ${r.waitingHours ?? 0}h`
                    : "answered"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
