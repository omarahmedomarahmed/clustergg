// `/admin/trophies/new` — create one trophy. 05 §4.
//
// ===== THE VALUE FIELD IS THE ONE THAT MATTERS =====
//
// V5/T7 — **a trophy's value can never be edited.** A $100 trophy is a $100
// trophy forever, on every profile that holds it. So this form is the only
// moment the number is decided, and the page says so where somebody is typing
// it rather than in a help article they will not read.
//
// 05 §4 rule 1 — **milestone trophies are always $0.** Enforced in
// `createTrophy`, which refuses a non-zero value on a collectable: a milestone
// worth money would put money into the vault against a trophy the redeem
// action refuses, and the invariant could never be green again.

import Link from "next/link";
import { getDb, schema } from "../../../../lib/db/index.ts";
import { MILESTONES } from "../../../../lib/trophies/milestones.ts";
import { Panel, Refusal } from "../../components.tsx";
import { Button } from "../../../ui.tsx";
import { createTrophyStandaloneAction } from "../../actions.ts";

export const dynamic = "force-dynamic";

const FIELD = "rounded-lg border border-line bg-transparent px-3 py-2 text-sm";

export default async function NewTrophy({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const db = await getDb();
  const brands = await db.select().from(schema.brands);
  const challenges = await db.select().from(schema.challenges);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create a trophy</h1>
        <p className="mt-1 text-sm text-mute">
          <Link href="/admin/trophies" className="underline">
            Back to every trophy
          </Link>
        </p>
      </div>

      {typeof query.error === "string" ? (
        <Refusal testId="trophy-error">{query.error}</Refusal>
      ) : null}

      <Panel
        title="The trophy"
        note="Value is set once and never changes. Name, image and brand can be edited forever"
        help={
          <p>
            An edit to a name or an image <strong>propagates to every holder
            everywhere</strong>. The value does not, because it cannot: the prize vault
            holds exactly the sum of every unredeemed money-trophy, so changing one
            after it was awarded would make the platform&apos;s core promise false by
            the amount of the change.
          </p>
        }
      >
        <form action={createTrophyStandaloneAction} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Name</span>
            <input name="name" required className={FIELD} data-testid="trophy-name" />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Type</span>
            <select name="type" defaultValue="podium" className={FIELD} data-testid="trophy-type">
              <option value="podium">Sponsored podium — worth money</option>
              <option value="participation">Sponsored participation — a collectable</option>
              <option value="milestone">Milestone — a collectable, ours</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Value ($)</span>
            <input
              name="valueDollars"
              type="number"
              step="0.01"
              min="0"
              defaultValue="0"
              className={FIELD}
              data-testid="trophy-value"
            />
            <span className="text-xs text-mute">
              <strong>Set once, never editable.</strong> Participation and milestone
              trophies must be $0 — a collectable worth money is refused, not corrected.
            </span>
          </label>

          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Brand</span>
              <select name="brandId" className={FIELD} data-testid="trophy-brand">
                <option value="">Generic — no brand</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Challenge, and place</span>
              <select name="challengeId" className={FIELD} data-testid="trophy-challenge">
                <option value="">Not attached to one</option>
                {challenges.slice(0, 100).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Place</span>
              <input name="place" type="number" min="1" className={FIELD} data-testid="trophy-place" />
            </label>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">If milestone — which kind</span>
              <select name="milestoneKind" className={FIELD} data-testid="milestone-kind">
                <option value="">Not a milestone</option>
                {Object.entries(MILESTONES).map(([kind, def]) => (
                  <option key={kind} value={kind}>
                    {def.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">…and which game</span>
              <input name="milestoneGame" className={FIELD} data-testid="milestone-game" />
            </label>
          </div>

          <div>
            <Button type="submit" data-testid="create-trophy">
              Create
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
