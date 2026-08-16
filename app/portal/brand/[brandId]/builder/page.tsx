// The builder — §7 steps 4 to 7, as three screens and a checkout.
//
//   1. Big game cards. Pick one or several.
//   2. Per purchase: how many challenges each, single or series, which week.
//   3. Start date, announce date, expected reach, price — **all before paying**.
//
// ===== WHAT A BRAND CANNOT DO IS ENFORCED BEHIND THIS FORM, NOT BY IT =====
//
// No arbitrary date (there is no date picker — you choose a *week*), no daily
// cadence, no custom prize pool, no age-band targeting. Every one of those is
// refused by `quote`, and this page renders the refusal rather than preventing
// it: a rule enforced only by the absence of a control is a rule until
// somebody writes a script.
//
// Every figure on step 3 comes from `quote`. House rule 2.

import { getDb } from "../../../../../lib/db/index.ts";
import { sellableGames, quote, BuilderRefused } from "../../../../../lib/portal/brand.ts";
import {
  CHALLENGE_PRICE_CENTS,
  formatMoney,
  splitOf,
} from "../../../../../lib/money/amounts.ts";
import { earliestSellableWeek, weekStartPlus } from "../../../../../lib/challenges/week.ts";
import { demoNow } from "../../../../../lib/site/clock.ts";
import { Panel, Row, Refusal } from "../../../components.tsx";
import { Button } from "../../../../ui.tsx";
import { checkoutAction } from "../actions.ts";

export const dynamic = "force-dynamic";

const FIELD = "rounded-lg border border-line bg-panel px-3 py-2";

export default async function Builder({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { brandId } = await params;
  const query = await searchParams;
  const now = demoNow(query);
  const db = await getDb();

  const games = sellableGames();
  const picked = (Array.isArray(query.game) ? query.game : query.game ? [query.game] : []).filter(
    Boolean,
  );
  const challengesPerGame = Number(query.challengesPerGame ?? 1);
  const weeks = Number(query.weeks ?? 1);
  const startingWeek = query.startingWeek
    ? new Date(String(query.startingWeek))
    : earliestSellableWeek(now);

  // The four weeks a brand may start in. Weeks, not dates — B5/L6.
  const options = Array.from({ length: 4 }, (_, i) => weekStartPlus(earliestSellableWeek(now), i));

  const step = picked.length === 0 ? 1 : query.priced ? 3 : 2;

  let priced: Awaited<ReturnType<typeof quote>> | null = null;
  let refusal: string | null = typeof query.error === "string" ? query.error : null;
  if (step === 3) {
    try {
      priced = await quote(db, { games: picked, challengesPerGame, startingWeek, weeks }, now);
    } catch (e) {
      if (e instanceof BuilderRefused) refusal = e.message;
      else throw e;
    }
  }

  return (
    <div className="flex flex-col gap-6" data-step={String(step)}>
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Builder</h1>
        <p className="text-sm text-mute">Step {step} of 3</p>
      </div>

      {refusal ? <Refusal testId="builder-error">{refusal}</Refusal> : null}

      {/* ── Step 1 · the game cards ─────────────────────────────────────── */}
      <Panel
        title="1 · Pick your games"
        note="Only games whose API can referee a match. If we cannot score it, we do not sell it"
      >
        <form method="get" className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3" data-testid="game-cards">
            {games.map((g) => (
              <label
                key={g.provider}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-panel px-4 py-4"
              >
                <input
                  type="checkbox"
                  name="game"
                  value={g.provider}
                  defaultChecked={picked.includes(g.provider)}
                />
                <span className="font-medium">{g.game}</span>
              </label>
            ))}
          </div>
          <div>
            <Button type="submit" data-testid="pick-games">
              Continue
            </Button>
          </div>
        </form>
      </Panel>

      {/* ── Step 2 · how many, and which week ───────────────────────────── */}
      {step >= 2 ? (
        <Panel
          title="2 · How many, and which week"
          note="One challenge is a single. More than one week is a series, billed together"
        >
          <form method="get" className="flex flex-col gap-4">
            {picked.map((g) => (
              <input key={g} type="hidden" name="game" value={g} />
            ))}
            <input type="hidden" name="priced" value="1" />

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Challenges per game, per week</span>
              <input
                name="challengesPerGame"
                type="number"
                min={1}
                defaultValue={challengesPerGame}
                className={FIELD}
                data-testid="per-game"
              />
              <span className="text-xs text-mute">
                There is no cap. Buy as many as you want in a week.
              </span>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">How many weeks</span>
              <input
                name="weeks"
                type="number"
                min={1}
                defaultValue={weeks}
                className={FIELD}
                data-testid="weeks"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Starting week</span>
              <select name="startingWeek" className={FIELD} data-testid="starting-week">
                {options.map((w) => (
                  <option key={w.toISOString()} value={w.toISOString()}>
                    Week of {w.toISOString().slice(0, 10)}
                  </option>
                ))}
              </select>
              <span className="text-xs text-mute">
                Weeks, not dates. A challenge always starts at the start of a week —
                the gun fires once, for everybody, and a mid-week start would score
                whoever joined before it on a stale reading.
              </span>
            </label>

            <div>
              <Button type="submit" data-testid="price-it">
                Price it
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}

      {/* ── Step 3 · everything, before paying ──────────────────────────── */}
      {step === 3 && priced ? (
        <Panel
          title="3 · Before you pay"
          note="Start date, announce date, reach and price — all of it, before the button"
        >
          <Row>
            <span>Challenges</span>
            <span className="tabular-nums">{priced.challenges.length}</span>
          </Row>
          <Row>
            <span>Price each</span>
            <span className="tabular-nums">{formatMoney(priced.perChallengeCents)}</span>
          </Row>
          <Row>
            <span>Of which prize pool</span>
            <span className="tabular-nums">
              {formatMoney(splitOf(CHALLENGE_PRICE_CENTS).prize)} each
            </span>
          </Row>
          <Row>
            <span>Total</span>
            <span className="text-lg font-semibold tabular-nums" data-testid="total">
              {formatMoney(priced.totalCents)}
            </span>
          </Row>

          <div className="mt-4 flex flex-col gap-2 text-sm">
            {priced.weeks.map((w) => (
              <div key={w.weekStart.toISOString()} className="flex justify-between text-mute">
                <span>Week of {w.weekStart.toISOString().slice(0, 10)}</span>
                <span>announced from {w.announceFrom.toISOString().slice(0, 10)}</span>
              </div>
            ))}
          </div>

          <p className="mt-4 text-sm" data-testid="reach-estimate">
            Expected reach: {priced.estimatedReach.toLocaleString("en-US")} —{" "}
            <span className="text-mute">
              an <strong>estimate</strong>, being today&apos;s member count of every
              installed server. What you are reported is counted at announcement, and
              the two have different names on purpose.
            </span>
          </p>

          <form action={checkoutAction} className="mt-5">
            <input type="hidden" name="brandId" value={brandId} />
            {picked.map((g) => (
              <input key={g} type="hidden" name="game" value={g} />
            ))}
            <input type="hidden" name="challengesPerGame" value={challengesPerGame} />
            <input type="hidden" name="weeks" value={weeks} />
            <input type="hidden" name="startingWeek" value={startingWeek.toISOString()} />
            <Button type="submit" data-testid="confirm-and-pay">
              Confirm &amp; Pay {formatMoney(priced.totalCents)}
            </Button>
          </form>
        </Panel>
      ) : null}

      <p className="text-xs text-mute">
        There is no custom prize pool: {formatMoney(CHALLENGE_PRICE_CENTS)} buys a fixed
        split — {formatMoney(splitOf(CHALLENGE_PRICE_CENTS).prize)} of it is the prize
        pool, and your Billing page shows where the rest goes. Daily challenges are not
        self-serve — talk to us.
      </p>
    </div>
  );
}
