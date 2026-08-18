// Onboarding — one page, two paths.
//
// ===== THE FORK COMES FIRST, AND ASKS FOR NOTHING (I7) =====
//
// *"Are you a gamer, or a server owner?"* — 12 §2. It is the first full
// screen, it is skippable, and crucially it **stores nothing**, which is what
// lets it precede the age question. Everything after it does store something,
// and I7 is absolute: *the age question comes before any other data is
// stored.* We do not hold data on a child we never asked about.
//
// The two paths differ in one step. Both ask age band and country (I8); the
// gamer path then asks for a linked game account, and the owner path asks for
// the `guilds` scope instead (G1). I10 — `guilds` is requested **here**, never
// at signup.
//
// The screen renders from `unlockState`, which is derived. There is no
// "current step" stored anywhere; the step showing is the first one the
// derivation says is missing, so a gamer who does something out of band —
// links an account from Discord mid-flow — sees the right screen on refresh
// without anything having to be reconciled.
//
// I9 — either path always says they can be the other one too, at any time.

import { redirect } from "next/navigation";
import { currentGamerWithUnlock } from "../../lib/auth/current.ts";
import { AGE_BANDS, AGE_BAND_COPY } from "../../lib/identity/age.ts";
import { offeredCountries } from "../../lib/identity/countries.ts";
import { getDb, schema } from "../../lib/db/index.ts";
import { eq } from "drizzle-orm";
import { Panel, Button, Step, Refusal, Progress } from "../ui.tsx";
import { currentPath } from "../../lib/identity/onboarding.ts";
import { progressOf } from "../../lib/identity/onboarding.ts";
import { deriveUnlock } from "../../lib/identity/unlock.ts";
import { discordConfigured } from "../../lib/auth/discord.ts";
import {
  linkAccountAction,
  setAgeBandAction,
  setCountryAction,
  underThirteenAction,
  choosePathAction,
  requestGuildsScopeAction,
} from "./actions.ts";

// Stage 2 replaces this with `ported/providers/registry.ts`, which knows every
// provider, its metrics and whether it is live. Until it is wired, this is a
// deliberately short list and it is the only place a game name is written
// down.
const GAMES_PLACEHOLDER = [
  { provider: "riot-lol", name: "League of Legends" },
  { provider: "mlbb", name: "Mobile Legends: Bang Bang" },
];

/**
 * Where "add the bot" goes, written once.
 *
 * The install route is both ends of one round trip: no `code` starts it, a
 * `code` captures the installer (G1). `next` brings them back to onboarding so
 * the `guilds` step can find the server that now exists — the alternative,
 * dropping them on a portal for a guild they have not finished onboarding
 * against, is how a half-finished owner path gets abandoned.
 */
const INSTALL_HREF = "/api/auth/discord/install?next=%2Fonboarding%3Fpath%3Downer";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { gamer, unlock: baseUnlock } = await currentGamerWithUnlock();
  if (!gamer || !baseUnlock) redirect("/signup");

  const path = await currentPath();

  const db = await getDb();
  const links = await db
    .select()
    .from(schema.linkedGameAccounts)
    .where(eq(schema.linkedGameAccounts.userId, gamer.id));

  // Whether the `guilds` round trip has happened. Counted from what it
  // produced — the guilds we recorded this Discord identity as owning or
  // administering — rather than from a "they granted it" flag, which would be
  // a second fact that can disagree with the first.
  const guildsSeen = gamer.discordId
    ? (
        await db
          .select({ id: schema.guildAdmins.id })
          .from(schema.guildAdmins)
          .where(eq(schema.guildAdmins.discordId, gamer.discordId))
      ).length
    : 0;

  // The derivation, re-run for the chosen path. `currentGamerWithUnlock`
  // cannot know the path — it is a cookie, not a column — so the page hands it
  // over and asks again rather than second-guessing the answer here.
  const unlock = deriveUnlock({
    ageBand: gamer.ageBand,
    country: gamer.country,
    linkedAccountCount: links.length,
    path: path ?? "gamer",
    // The owner path's step. Granting `guilds` is what tells us they admin
    // anything at all, and we know it happened because ownership was recorded
    // against their Discord identity when they came back from the round trip.
    guildsGranted: guildsSeen > 0,
  });
  const progress = progressOf(unlock);

  const stateOf = (step: "link" | "ageBand" | "country" | "guilds") =>
    unlock.done[step] ? "done" : unlock.next === step ? "now" : "later";

  // ── The fork. First screen, and it stores nothing (I7). ─────────────────
  if (!path) {
    return (
      <main
        data-step="fork"
        className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16"
      >
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Are you a gamer, or a server owner?
          </h1>
          <p className="mt-2 text-sm text-mute">
            Both, if you like — you can switch at any time, and picking one now
            only decides which questions come next.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Panel>
            <h2 className="font-medium">I am a gamer</h2>
            <ul className="mt-3 flex flex-col gap-1 text-sm text-mute">
              <li>· A profile with your trophies on it</li>
              <li>· Link the game accounts you already play</li>
              <li>· Enter challenges and win real money</li>
            </ul>
            <form action={choosePathAction} className="mt-5">
              <input type="hidden" name="path" value="gamer" />
              <Button type="submit" data-testid="path-gamer">
                Carry on as a gamer
              </Button>
            </form>
          </Panel>

          <Panel>
            <h2 className="font-medium">I run a Discord server</h2>
            <ul className="mt-3 flex flex-col gap-1 text-sm text-mute">
              <li>· Free prizes for your members</li>
              <li>· A share of a weekly pool, paid in real money</li>
              <li>· Watch what you are earning while you earn it</li>
            </ul>
            <form action={choosePathAction} className="mt-5">
              <input type="hidden" name="path" value="owner" />
              <Button type="submit" data-testid="path-owner">
                Carry on as a server owner
              </Button>
            </form>
          </Panel>
        </div>

        <p className="text-xs text-mute">
          Nothing is saved on this screen. We ask your age band first, on the
          next one, because we do not hold data on somebody we have not asked
          about yet.
        </p>
      </main>
    );
  }

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
        <h1 className="text-2xl font-semibold tracking-tight">
          {path === "owner" ? "Set up your server" : "Three things"}
        </h1>
        <p className="mt-1 text-sm text-mute">
          {path === "owner"
            ? "Your age band, your country, and the Discord servers you admin. We ask your own age once — it is a different question from what ages your members are."
            : "Your age band, your country, and a game account. That is all — we do not ask for your email until you cash something out."}
        </p>
      </div>

      {/* H3 — a progress bar on every gated thing. H4 — and never on a raw
          member count, which is why this counts steps somebody controls.
          Drawn by the one component in `app/ui.tsx`; a second bar anywhere
          fails `94-progress`. */}
      <Progress progress={progress} />

      {error ? <Refusal>{error}</Refusal> : null}

      {/* ===== THE ORDER IS I7, NOT A LAYOUT CHOICE =====

          Age band is step 1 on both paths because it is the first thing that
          stores anything, and I7 says nothing may be stored before it. Moving
          the link step above it would put a `linked_game_accounts` row on
          somebody we have never asked the age of. `GAMER_STEPS` and
          `OWNER_STEPS` hold the same order, and `stateOf` reads from the
          derivation over those lists — so this markup cannot drift out of
          agreement with the rule without `unlock.next` naming a step that is
          rendered above one that is still `now`. */}
      <Step n={1} title="Age band" state={stateOf("ageBand")}>
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

      <Step n={2} title="Country" state={stateOf("country")}>
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

      {/* ── Step 3, and the only step the two paths disagree about ─────────

          12 §2 / G1 — the server-owner path substitutes the `guilds` scope for
          the linked game account. Which one renders is `path`, and which one
          is *required* is `stepsFor(path)` inside the derivation. They are the
          same decision made in one place: an owner is never blocked on a game
          account and a gamer is never asked about servers. */}
      {path === "owner" ? (
        <Step n={3} title="Your servers" state={stateOf("guilds")}>
          {unlock.done.guilds ? (
            <>
              <p className="text-sm text-mute">
                {guildsSeen === 1
                  ? "One server, found. It is on your portal."
                  : `${guildsSeen} servers, found. They are on your portal.`}{" "}
                We only ever asked Discord what <em>you</em> can do — this is
                not a member list.
              </p>
              {discordConfigured() ? (
                <p className="mt-3 text-sm text-mute">
                  Missing one?{" "}
                  <a className="underline" href={INSTALL_HREF}>
                    Add Cluster to it
                  </a>{" "}
                  — a server that has never had Cluster in it cannot show up
                  until the bot is there.
                </p>
              ) : null}
            </>
          ) : discordConfigured() ? (
            <form action={requestGuildsScopeAction} className="flex flex-col gap-3">
              <p className="text-sm text-mute">
                Discord will ask whether we may see which servers you are in.
                That is the whole grant: which ones you own or administer, so
                we know which portals are yours. We are not asking for it at
                signup, and a gamer never sees this screen at all.
              </p>
              {/* Ownership is recorded against servers we already know, so a
                  server that has never had Cluster in it produces nothing here.
                  Sprint 4 said so and stopped; the way through is the install
                  round trip below, which is the only moment G1's "who installed
                  it" can ever be captured. */}
              <p className="text-sm text-mute">
                A server Cluster has never been added to will not show up here
                yet —{" "}
                <a className="underline" href={INSTALL_HREF}>
                  add the bot to it
                </a>{" "}
                and it appears.
              </p>
              <Button type="submit">Show me my servers</Button>
            </form>
          ) : (
            // House rule 11 — a deployment without Discord credentials shows a
            // sentence, not a button that cannot work and not a crash.
            <p className="text-sm text-mute">
              Discord sign-in is not configured on this deployment yet, so
              there is nothing to connect to. Your age band and country are
              saved — nothing here is lost.
            </p>
          )}
        </Step>
      ) : (
        <Step n={3} title="Link a game account" state={stateOf("link")}>
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
      )}

      {unlock.unlocked ? (
        <Panel>
          <p className="font-medium">You&rsquo;re in.</p>
          <p className="mt-1 text-sm text-mute">
            {path === "owner"
              ? "Nothing else is needed — your servers are on your portal, and a challenge running in one of them starts earning without you doing anything."
              : `${
                  links.length === 1
                    ? `${links[0].inGameName ?? "Your account"} is linked.`
                    : `${links.length} accounts linked.`
                } Nothing else is needed — join a challenge whenever one appears in your server.`}
          </p>
        </Panel>
      ) : null}

      {/* ===== I9: EITHER PATH ALWAYS SAYS THEY CAN BE THE OTHER ONE TOO =====

          Always rendered, done or not. The fork was a preference about which
          questions to ask, and this is what stops it hardening into a role —
          which is why the path is a cookie and not a column. Switching keeps
          the age band and country already given: both paths ask for them (I8),
          so neither answer is thrown away. */}
      <form action={choosePathAction}>
        <input type="hidden" name="path" value={path === "owner" ? "gamer" : "owner"} />
        <button
          type="submit"
          data-testid="switch-path"
          className="text-sm text-mute underline underline-offset-4 hover:text-fg"
        >
          {path === "owner"
            ? "I also play — set up a game account instead"
            : "I also run a Discord server — set that up instead"}
        </button>
      </form>
    </main>
  );
}
