// `/redeem` — 18+ only: verify an email, choose a method, request a payout.
//
// 04 §1, cycle phase **Close**. 06 §1's redemption table is the flow, in order.
//
// ===== FOUR CONDITIONS, AND EVERY ONE OF THEM IS SHOWN AS ITS OWN ANSWER ====
//
// R1: 18+ · a verified email · an allowed country · **and a trophy the vault
// accounts for.** The first three are policy; the fourth is structural (V1),
// and it is what makes a duplicate award and a double payout the same kind of
// error — one that cannot reach a payment provider, because the money it would
// draw on is not in the ledger.
//
// ===== THE $0 BUTTON IS DELIBERATE (T1/T2) =====
//
// A collectable gets a Redeem button like everything else, and pressing it
// produces the refusal from `checkEligibility` — *"enforced at the redeem
// action, not merely hidden in the UI."* Hiding it would leave the rule
// enforced by a template, and the record in 09 Band 2 shot 21 exists to
// photograph the refusal itself.
//
// The greying and the refusal come from the **same function**, so the button
// state can never be kinder or crueller than the answer.
//
// House rule 5 — the form takes a preference **word** and an opaque provider
// handle. It says, in words, not to type an account number, and the schema has
// nowhere to put one if somebody does.

import Link from "next/link";
import { currentGamer } from "../../lib/auth/current.ts";
import { myRedeemables } from "../../lib/site/queries.ts";
import { eq } from "drizzle-orm";
import { getDb, isDemoMode, schema } from "../../lib/db/index.ts";
import { REDEEM_METHODS } from "../../lib/trophies/redemption.ts";
import { countryName } from "../../lib/identity/countries.ts";
import { formatMoney, TROPHY_HOLD_YEARS } from "../../lib/money/amounts.ts";
import { Nav, Money, Empty } from "../components.tsx";
import { Panel, Button, Refusal, Help } from "../ui.tsx";
import {
  requestRedemptionAction,
  beginVerificationAction,
  confirmVerificationAction,
} from "./actions.ts";

export const dynamic = "force-dynamic";

const FIELD = "rounded-lg border border-line bg-transparent px-3 py-2";

export default async function Redeem({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const str = (k: string) => (typeof query[k] === "string" ? (query[k] as string) : null);

  const gamer = await currentGamer();
  if (!gamer) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-2xl px-6 py-16">
          <h1 className="text-2xl font-semibold tracking-tight">Cash out a trophy</h1>
          <p className="mt-4 text-sm text-mute">
            <Link href="/login?next=/redeem" className="underline">
              Sign in
            </Link>{" "}
            to see what you can cash out.
          </p>
        </main>
      </>
    );
  }

  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, gamer.id));
  const { rows, inFlight } = await myRedeemables(gamer.id);
  const verified = !!user?.emailVerifiedAt;

  return (
    <>
      <Nav />
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Cash out a trophy</h1>
          <p className="mt-2 text-sm text-mute">
            We hold every trophy for {TROPHY_HOLD_YEARS} years, so nothing here expires
            on you.
            <Help title={`Why ${TROPHY_HOLD_YEARS} years`}>
              <p>
                Because somebody who wins at 13 must still have their trophy at 18, when
                they can cash it out. The money is already sitting in the prize vault
                with their name against it — it is not a promise, it is a balance.
              </p>
            </Help>
          </p>
        </div>

        {str("error") ? (
          <Refusal testId="redeem-error">{str("error")}</Refusal>
        ) : null}
        {str("requested") ? (
          <p data-testid="redeem-requested" className="text-sm text-green-400">
            Requested. Cluster reviews it, sends it, and marks it paid — you will see
            each step here.
          </p>
        ) : null}
        {str("verified") ? (
          <p data-testid="redeem-verified" className="text-sm text-green-400">
            Email verified. We will not ask again.
          </p>
        ) : null}

        {/* ===== THE EMAIL, ASKED ONCE, EVER (G2/G3/I7a) =====

            A Discord gamer is asked here and nowhere else. An email gamer is
            never asked at all, because signup verified the same column. Which
            is why this whole block is absent for them rather than being shown
            pre-filled: asking twice is how two answers get stored. */}
        {!verified ? (
          <Panel title="First, an email">
            <p className="text-sm text-mute">
              This is the only time we ask. We need somewhere to send the confirmation,
              and a verified address is what a payout is checked against.
            </p>

            {str("sent") ? (
              <>
                {/*
                  L4 — a failed send is a state a human can see. Telling
                  somebody "sent" when it was not is how they sit waiting on an
                  inbox for a code that is never coming, which is exactly what
                  the platform did for a whole sprint.
                */}
                {str("warn") ? (
                  <p
                    data-testid="verify-not-sent"
                    className="mt-4 rounded-lg border border-line bg-ink px-4 py-3 text-sm text-mute"
                  >
                    {str("warn")}
                  </p>
                ) : null}
                {isDemoMode && str("code") ? (
                  <p
                    data-testid="demo-code"
                    className="mt-4 rounded-lg border border-line bg-ink px-4 py-3 text-sm"
                  >
                    Demo: your code is{" "}
                    <strong className="font-mono">{str("code")}</strong>. On a real
                    deployment this arrives by email and never appears on screen.
                  </p>
                ) : null}
                <form action={confirmVerificationAction} className="mt-4 flex flex-col gap-3">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-mute">Six-digit code</span>
                    <input
                      name="code"
                      required
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      defaultValue={isDemoMode ? (str("code") ?? "") : ""}
                      className={`${FIELD} font-mono tracking-widest`}
                      data-testid="verify-code"
                    />
                  </label>
                  <div>
                    <Button type="submit" data-testid="verify-submit">
                      Verify
                    </Button>
                  </div>
                </form>
              </>
            ) : (
              <form action={beginVerificationAction} className="mt-4 flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-mute">Email address</span>
                  <input
                    name="email"
                    type="email"
                    required
                    className={FIELD}
                    data-testid="redeem-email"
                  />
                </label>
                <div>
                  <Button type="submit" data-testid="send-code">
                    Send me a code
                  </Button>
                </div>
              </form>
            )}
          </Panel>
        ) : null}

        {inFlight.length > 0 ? (
          <Panel title="In flight">
            <ul className="flex flex-col gap-2 text-sm" data-testid="in-flight">
              {inFlight.map((r) => (
                <li key={r.id} className="flex justify-between rounded-lg border border-line px-4 py-3">
                  <span>{formatMoney(r.amountCents)}</span>
                  <span className="text-mute">{r.status}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-mute">
              While one of these is in flight your account cannot be deleted — money
              already handed to a provider cannot be paid to a record that no longer
              exists.
            </p>
          </Panel>
        ) : null}

        <section>
          <h2 className="text-xl font-medium">Your trophies</h2>
          {rows.length === 0 ? (
            <Empty>Nothing yet. Win something and it lands here.</Empty>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {rows.map(({ holding, trophy, eligibility, pending }) => (
                <li
                  key={holding.id}
                  data-testid="redeemable"
                  data-value={trophy.valueCents}
                  data-eligible={eligibility.ok ? "1" : "0"}
                  data-refusal={eligibility.ok ? "" : eligibility.code}
                  className="rounded-xl border border-line bg-panel px-5 py-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link href={`/trophies/${trophy.id}`} className="font-medium">
                      {trophy.name}
                    </Link>
                    <span className="text-sm text-mute">
                      {trophy.valueCents > 0 ? (
                        <Money cents={trophy.valueCents} />
                      ) : (
                        "Collectable"
                      )}
                    </span>
                  </div>

                  {/* The refusal, in the module's own words. Shown before the
                      button rather than instead of it: T2 says the action
                      enforces this, so the action must stay reachable. */}
                  {!eligibility.ok ? (
                    <p
                      className="mt-2 text-sm text-mute"
                      data-testid={`refusal-${eligibility.code}`}
                    >
                      {eligibility.reason}
                    </p>
                  ) : null}

                  {pending ? (
                    <p className="mt-2 text-sm text-mute">
                      Already requested · {pending.status}
                    </p>
                  ) : (
                    <form
                      action={requestRedemptionAction}
                      className="mt-3 flex flex-wrap items-end gap-3"
                    >
                      <input type="hidden" name="userTrophyId" value={holding.id} />

                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-mute">How you want it</span>
                        <select
                          name="method"
                          defaultValue={REDEEM_METHODS[0]}
                          className="rounded-lg border border-line bg-panel px-3 py-2"
                          data-testid="redeem-method"
                        >
                          {REDEEM_METHODS.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-mute">Provider reference</span>
                        <input
                          name="providerHandle"
                          className={`${FIELD} font-mono`}
                          data-testid="redeem-handle"
                        />
                      </label>

                      <Button type="submit" data-testid="redeem-submit">
                        Redeem
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs text-mute">
          <strong>Never type an account number anywhere on this page.</strong> We do not
          store one — not an IBAN, not a card, not a last four. The reference field is
          the opaque handle your payment provider gave you, and a form that accepted
          more would be holding a credential we have no business holding.
          {user?.country ? (
            <>
              {" "}
              We pay out to <strong>{countryName(user.country)}</strong>, which is the
              country on your account.
            </>
          ) : null}
        </p>
      </main>
    </>
  );
}
