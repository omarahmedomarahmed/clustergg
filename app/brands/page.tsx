// `/brands` — the commercial funnel's front door.
//
// ===== IT DID NOT EXIST, AND BOTH DOCUMENTS BEGIN HERE =====
//
// `04-SURFACES` §3 step 1 and `06-JOURNEYS` §3 step 1 both start a brand at
// `/brands`. There was no such page, and no other way to create a brand
// either — `signUpBrand`'s only caller was the demo seeder. So the whole thing
// a brand is meant to do began at a URL that 404'd.
//
// `14-EDITABLE` §7 says why nothing caught it: **the reachability guards cannot
// see a page nothing links to, because nothing links to it.** `94-reachability`
// walks what the code points at; a page in the specification and in no code at
// all is pointed at by nobody. The page-route guard added this sprint is what
// closes that, and it named exactly this and `/servers`.
//
// ===== EVERY FIGURE ON THIS PAGE IS IMPORTED =====
//
// House rule 2, on the page most likely to break it: this is the page whose
// whole job is telling somebody what it costs. Not one number below is typed —
// they come from `SAYS` and from `lib/money/amounts.ts`, which is what makes
// them right on the day the price moves.

import Link from "next/link";
import { SAYS } from "../../lib/content/copy.ts";
import { liveCopy } from "../../lib/content/store.ts";
import {
  CHALLENGE_PRICE_CENTS,
  formatMoney,
  splitOf,
  MIN_AUDIENCE_GROUP,
} from "../../lib/money/amounts.ts";
import { getDb } from "../../lib/db/index.ts";
import { pageArtFor } from "../../lib/site/page-art.ts";
import { installedGuilds } from "../../lib/discord/guilds.ts";
import { Nav, PageArtLayer } from "../components.tsx";
import { brandSignUpAction } from "./actions.ts";

export const dynamic = "force-dynamic";

const FIELD =
  "w-full rounded-md border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-white/30";

export default async function BrandsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const str = (k: string) => (typeof query[k] === "string" ? (query[k] as string) : null);

  const db = await getDb();
  const copy = await liveCopy();
  const art = await pageArtFor(db, "brands");
  const split = splitOf(CHALLENGE_PRICE_CENTS);

  // Counted, never modelled — `04-SURFACES` §3's own rule about reach. What a
  // brand is shown before they sign up is how many servers are actually
  // installed, and it is labelled as servers rather than as an audience.
  const servers = await installedGuilds(db).catch(() => []);
  const members = servers.reduce((sum, g) => sum + (g.memberCount ?? 0), 0);

  return (
    <>
      <PageArtLayer art={art} />
      <Nav />
      <main className="mx-auto flex max-w-4xl flex-col gap-12 px-6 py-12">
        <section className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold tracking-tight">
            Put your brand inside the games people already play
          </h1>
          <p className="max-w-2xl text-mute">{copy.tagline}</p>
          <p className="max-w-2xl text-mute">{copy.noMachinery}</p>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-line p-5">
            <p className="text-2xl font-semibold tabular-nums">{servers.length}</p>
            <p className="mt-1 text-sm text-mute">
              Discord servers with Cluster installed
            </p>
          </div>
          <div className="rounded-xl border border-line p-5">
            <p className="text-2xl font-semibold tabular-nums">{members.toLocaleString()}</p>
            <p className="mt-1 text-sm text-mute">
              Members across them. Reach is <strong>counted</strong> at
              announcement, never estimated
            </p>
          </div>
          <div className="rounded-xl border border-line p-5">
            <p className="text-2xl font-semibold tabular-nums">
              {formatMoney(CHALLENGE_PRICE_CENTS)}
            </p>
            <p className="mt-1 text-sm text-mute">One challenge, one game, one week</p>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-medium">What you buy</h2>
          <p className="text-mute">{SAYS.unitPrice()}</p>
          <p className="text-mute">
            {SAYS.prizeShare(CHALLENGE_PRICE_CENTS, split.prize)} Your trophies carry
            your name, and the gamers who win them keep them.
          </p>
          <p className="text-mute">{copy.poolIsPublic}</p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-medium">What you get back</h2>
          <ul className="flex flex-col gap-2 text-mute">
            <li>
              <strong className="text-white">Entrants, per challenge.</strong> The same
              gamer in week 1 and week 2 is two entrants, and we say so.
            </li>
            <li>
              <strong className="text-white">Reach, counted.</strong> Every member of
              every server a challenge was actually announced to — not a model, and
              never a &ldquo;unique audience&rdquo; figure.
            </li>
            <li>
              <strong className="text-white">Your trophies,</strong> with how many
              gamers hold each.
            </li>
            <li>
              No audience group smaller than {MIN_AUDIENCE_GROUP} is ever reported, so
              nothing in a report can identify one person.
            </li>
          </ul>
        </section>

        <section id="signup" className="flex flex-col gap-4">
          <h2 className="text-xl font-medium">Sign up</h2>

          {str("error") ? (
            <p
              className="rounded-lg border border-line bg-ink px-4 py-3 text-sm"
              data-testid="brand-signup-error"
            >
              {str("error")}
            </p>
          ) : null}

          {str("sent") ? (
            <div
              className="rounded-lg border border-line bg-ink px-4 py-3 text-sm"
              data-testid="brand-signup-sent"
            >
              <p>
                Your dashboard is ready. We have emailed{" "}
                <strong>{str("sent")}</strong> a key that works exactly once.
              </p>
              <p className="mt-2 text-mute">
                Open <Link href="/login/brand" className="underline">the brand sign-in</Link>{" "}
                and redeem it — that is where you set the password you will use from
                then on.
              </p>
            </div>
          ) : (
            <form
              action={brandSignUpAction}
              className="flex max-w-md flex-col gap-3"
              data-testid="brand-signup"
            >
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-mute">Brand name</span>
                <input
                  name="name"
                  required
                  defaultValue={str("name") ?? ""}
                  className={FIELD}
                  data-testid="brand-signup-name"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-mute">Where we should send your key</span>
                <input
                  name="contactEmail"
                  type="email"
                  required
                  className={FIELD}
                  data-testid="brand-signup-email"
                />
              </label>
              <button
                type="submit"
                className="rounded-md border border-line px-4 py-2 text-sm hover:bg-white/5"
                data-testid="brand-signup-submit"
              >
                Create the dashboard
              </button>
              <p className="text-xs text-mute">
                We send one key, to that address, once. Nothing is charged until you
                build a week and press Confirm &amp; Pay.
              </p>
            </form>
          )}
        </section>

        <section className="flex flex-col gap-2 border-t border-line pt-8">
          <p className="max-w-2xl font-medium">{copy.discordTerms}</p>
          <p className="text-sm text-mute">
            Already have a dashboard?{" "}
            <Link href="/login/brand" className="underline">
              Sign in
            </Link>
            .
          </p>
        </section>
      </main>
    </>
  );
}
