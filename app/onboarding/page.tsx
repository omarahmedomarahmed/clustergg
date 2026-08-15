// Onboarding — three things, no email.
//
// The screen renders from `unlockState`, which is derived. There is no
// "current step" stored anywhere; the step showing is the first one the
// derivation says is missing, so a gamer who does something out of band —
// links an account from Discord mid-flow — sees the right screen on refresh
// without anything having to be reconciled.

import { redirect } from "next/navigation";
import { currentGamerWithUnlock } from "../../lib/auth/current.ts";
import { AGE_BANDS, AGE_BAND_COPY } from "../../lib/identity/age.ts";
import { offeredCountries } from "../../lib/identity/countries.ts";
import { getDb, schema } from "../../lib/db/index.ts";
import { eq } from "drizzle-orm";
import { Panel, Button, Step, Refusal } from "../ui.tsx";
import {
  linkAccountAction,
  setAgeBandAction,
  setCountryAction,
  underThirteenAction,
} from "./actions.ts";

// Stage 2 replaces this with `ported/providers/registry.ts`, which knows every
// provider, its metrics and whether it is live. Until it is wired, this is a
// deliberately short list and it is the only place a game name is written
// down.
const GAMES_PLACEHOLDER = [
  { provider: "riot-lol", name: "League of Legends" },
  { provider: "mlbb", name: "Mobile Legends: Bang Bang" },
];

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { gamer, unlock } = await currentGamerWithUnlock();
  if (!gamer || !unlock) redirect("/signup");

  const db = await getDb();
  const links = await db
    .select()
    .from(schema.linkedGameAccounts)
    .where(eq(schema.linkedGameAccounts.userId, gamer.id));

  const stateOf = (step: "link" | "ageBand" | "country") =>
    unlock.done[step] ? "done" : unlock.next === step ? "now" : "later";

  return (
    // `data-step` is the derivation, exposed. The browser band waits on it
    // rather than guessing from which form happens to be rendered, and that
    // makes the screenshot record assert something: the step on screen is
    // whatever `unlockState` says is next.
    <main
      data-step={unlock.next ?? "done"}
      className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6 py-16"
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Three things</h1>
        <p className="mt-1 text-sm text-mute">
          Link a game account, tell us your age band, tell us your country.
          That is all — we do not ask for your email until you cash something
          out.
        </p>
      </div>

      {error ? <Refusal>{error}</Refusal> : null}

      <Step n={1} title="Link a game account" state={stateOf("link")}>
        <form action={linkAccountAction} className="flex flex-col gap-3">
          <select
            name="provider"
            defaultValue={GAMES_PLACEHOLDER[0].provider}
            className="rounded-lg border border-line bg-ink px-3 py-2"
          >
            {GAMES_PLACEHOLDER.map((g) => (
              <option key={g.provider} value={g.provider}>
                {g.name}
              </option>
            ))}
          </select>
          <input
            name="inGameName"
            placeholder="Your in-game name"
            className="rounded-lg border border-line bg-ink px-3 py-2"
          />
          <Button type="submit">Link it</Button>
        </form>
      </Step>

      <Step n={2} title="Age band" state={stateOf("ageBand")}>
        <div className="flex flex-col gap-3">
          {AGE_BANDS.map((band) => (
            <form key={band} action={setAgeBandAction}>
              <input type="hidden" name="ageBand" value={band} />
              <button
                type="submit"
                className="w-full rounded-lg border border-line px-4 py-3 text-left transition hover:border-accent"
              >
                <span className="font-medium">{AGE_BAND_COPY[band].label}</span>
                <span className="mt-1 block text-sm text-mute">
                  {AGE_BAND_COPY[band].means}
                </span>
              </button>
            </form>
          ))}
          {/* Under 13 is a link, never a third button of equal weight. */}
          <form action={underThirteenAction}>
            <button
              type="submit"
              className="text-sm text-mute underline underline-offset-4 hover:text-red-300"
            >
              I am under 13 — close my account
            </button>
          </form>
        </div>
      </Step>

      <Step n={3} title="Country" state={stateOf("country")}>
        <form action={setCountryAction} className="flex flex-col gap-3">
          <select
            name="country"
            defaultValue=""
            className="rounded-lg border border-line bg-ink px-3 py-2"
          >
            <option value="" disabled>
              Pick your country
            </option>
            {offeredCountries().map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <Button type="submit">Save</Button>
        </form>
      </Step>

      {unlock.unlocked ? (
        <Panel>
          <p className="font-medium">You&rsquo;re in.</p>
          <p className="mt-1 text-sm text-mute">
            {links.length === 1
              ? `${links[0].inGameName ?? "Your account"} is linked.`
              : `${links.length} accounts linked.`}{" "}
            Nothing else is needed — join a challenge whenever one appears in
            your server.
          </p>
        </Panel>
      ) : null}
    </main>
  );
}
