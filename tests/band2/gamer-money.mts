// Band 2 — 09's gamer flow from the trophy onwards. Shots 14 and 16 to 21.
//
// ===== WHY THESE HAD NEVER BEEN PHOTOGRAPHED =====
//
// `stage1-onboarding.mts` walks signup to the end of onboarding, and the
// portals pass walks the owner and brand surfaces. Between them they cover
// most of 09's list — but every shot from *"trophy awarded"* onwards needs a
// gamer who **holds** something, and the demo seeder set up last week's
// challenge, announced it, and then never entered anybody or closed it.
//
// So there were no placements, no trophies and no week record, and shots 14
// and 16–21 were not "not yet written". They were not photographable: the
// states did not exist anywhere in the product's demo. The seeder now plays
// last week and closes it, which is what this pass rests on.
//
// ===== EVERY REFUSAL IS A SHOT =====
//
// 09: *"Failures and refusals are captured too. A record of only the happy
// path proves nothing."* Three of the eight shots here are refusals, and they
// are the reason the seeder gives last week a three-place podium: with one
// place the only money-trophy lands on whoever scored highest, and if that is
// an adult then *"redeem: blocked under 18"* has nothing to photograph.
//
// The pass **asks** the demo who holds what rather than naming anybody. A
// hard-coded winner is a fixture that stops matching the day the metrics move,
// and it fails as "the page did not render" rather than as "nobody won".

import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { chromiumPath } from "./browser.mts";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = path.join(process.cwd(), "screenshots", "gamer-money");

let n = 0;
async function shot(page: Page, what: string) {
  n++;
  const file = path.join(OUT, `${String(n).padStart(2, "0")}-${what}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ${path.relative(process.cwd(), file)}`);
}

type Holder = {
  holdingId: string;
  userId: string;
  slug: string;
  displayName: string;
  ageBand: string | null;
  country: string | null;
  email: string | null;
  valueCents: number;
  place: number | null;
  trophyName: string;
};

/**
 * Navigate, and say what came back when it is not a page.
 *
 * A bare `goto` followed by `waitForSelector("h1")` reports a 404 as *"timed
 * out waiting for h1"*, which reads as a slow render and sent me looking at
 * the wrong thing twice. The status is the fact worth having.
 */
async function gotoOk(page: Page, url: string) {
  const response = await page.goto(url);
  const status = response?.status() ?? 0;
  if (status !== 200) throw new Error(`${url} answered ${status}, so there is nothing to photograph.`);
}

/** A fresh, signed-out browser context. Each gamer gets their own. */
async function freshPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
  return context.newPage();
}

/**
 * Sign in as a seeded gamer.
 *
 * Through the demo route rather than the login form, because these gamers have
 * no password — they were made the way real ones are, by a Discord press or a
 * link. Signing one up instead would photograph a fixture rather than the
 * platform.
 */
async function signInAs(page: Page, userId: string) {
  const response = await page.request.post(`${BASE}/api/demo/session`, {
    data: { userId },
  });
  if (!response.ok()) {
    throw new Error(`Could not sign in as ${userId}: ${response.status()} ${await response.text()}`);
  }
  // The cookie was set on the request context; carry it onto the page's own
  // context so a navigation is signed in too.
  await page.context().addCookies(await page.request.storageState().then((s) => s.cookies));
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });

  // ── Reseed, so the run is repeatable. Trap 14: a band-2 pass must survive
  //    being run twice back to back, and a redemption walked to `paid` is not
  //    walkable a second time (R2).
  const seeded = await fetch(`${BASE}/api/demo/seed`, { method: "POST" });
  if (!seeded.ok) throw new Error(`Seeding failed: ${seeded.status} ${await seeded.text()}`);

  const holders = (await (await fetch(`${BASE}/api/demo/holders`)).json()) as {
    holders: Holder[];
  };
  // Sorted, because the route returns them in whatever order the database
  // hands back and an unsorted pick is a different gamer every run — which
  // makes a failure look like a flake instead of a fact about one profile.
  const bySlug = (a: Holder, b: Holder) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  const money = holders.holders.filter((h) => h.valueCents > 0).sort(bySlug);
  const collectables = holders.holders.filter((h) => h.valueCents === 0).sort(bySlug);

  const teen = money.find((h) => h.ageBand === "teen");
  const adult = money.find((h) => h.ageBand === "adult");
  const collector = collectables[0];

  // Said as a sentence rather than left to a null dereference three awaits
  // later. If the seeder's week stops producing one of these, the reason this
  // pass cannot run is a fact about the demo, not a broken selector.
  if (!teen) throw new Error("No 13–17 gamer holds a money-trophy — shot 17 cannot be taken.");
  if (!adult) throw new Error("No 18+ gamer holds a money-trophy — shots 18–20 cannot be taken.");
  if (!collector) throw new Error("Nobody holds a $0 collectable — shot 21 cannot be taken.");

  console.log(`  podium: ${money.map((h) => `${h.displayName} (${h.ageBand}, ${h.valueCents}c)`).join(", ")}`);

  const browser = await chromium.launch({ executablePath: chromiumPath() });

  try {
    // ── 14 · the trophy, awarded. Podium and $0 collectable, both real. ────
    const anyone = await freshPage(browser);
    await gotoOk(anyone, `${BASE}/u/${adult.slug}`);
    await anyone.waitForSelector("h1");
    await shot(anyone, "public-profile-with-podium-trophy");

    await gotoOk(anyone, `${BASE}/u/${collector.slug}`);
    await anyone.waitForSelector("h1");
    await shot(anyone, "public-profile-with-zero-value-collectable");

    // ── 16 · the gamer's own profile. ─────────────────────────────────────
    const winner = await freshPage(browser);
    await signInAs(winner, adult.userId);
    await gotoOk(winner, `${BASE}/profile`);
    await winner.waitForSelector("h1");
    await shot(winner, "own-profile-signed-in");

    // ── 17 · redeem, blocked under 18. ────────────────────────────────────
    //
    // P5's gamer-side twin, and the one refusal on this page that is about the
    // person rather than the trophy. The card is still rendered with its
    // Redeem button: T2 says the **action** enforces this, so hiding the
    // button would move the guard somewhere it is not.
    const minor = await freshPage(browser);
    await signInAs(minor, teen.userId);
    await gotoOk(minor, `${BASE}/redeem`);
    await minor.waitForSelector('[data-testid="redeemable"]');
    await shot(minor, "redeem-refused-under-18");

    // ── 21 · redeem refused on a $0 trophy. ───────────────────────────────
    //
    // Taken before the happy path on purpose. A collectable is worth nothing
    // and is *still a trophy*, and the refusal has to say which of those two
    // facts is doing the refusing — 09 asks for this shot separately from the
    // age one because they read almost identically and mean different things.
    const keeper = await freshPage(browser);
    await signInAs(keeper, collector.userId);
    await gotoOk(keeper, `${BASE}/redeem`);
    await keeper.waitForSelector('[data-testid="redeemable"]');
    await shot(keeper, "redeem-refused-zero-value-trophy");

    // ── 18 · email verification: sent, then verified. ─────────────────────
    //
    // R1 requires a **verified** email, and the seeded gamers have none —
    // which is correct: a gamer who linked Discord never gave us one. So this
    // is the flow rather than a fixture, and the demo shows the code on screen
    // because there is no inbox.
    await gotoOk(winner, `${BASE}/redeem`);
    await winner.waitForSelector('[data-testid="redeem-email"]');
    await shot(winner, "redeem-email-not-yet-verified");

    await winner.fill('[data-testid="redeem-email"]', `winner+${adult.slug}@example.test`);
    await winner.click('[data-testid="send-code"]');
    await winner.waitForSelector('[data-testid="demo-code"]');
    await shot(winner, "redeem-verification-code-sent");

    const shown = (await winner.innerText('[data-testid="demo-code"]')).match(/code is\s+(\d+)/);
    if (!shown) throw new Error("The demo verification code was not on the page.");
    await winner.fill('[data-testid="verify-code"]', shown[1]);
    await winner.click('[data-testid="verify-submit"]');
    await winner.waitForSelector('[data-testid="redeem-verified"]');
    await shot(winner, "redeem-email-verified");

    // ── 19 · method chosen, submitted. ────────────────────────────────────
    await winner.waitForSelector('[data-testid="redeemable"][data-eligible="1"]');
    await shot(winner, "redeem-now-eligible");

    const card = winner.locator('[data-testid="redeemable"][data-eligible="1"]').first();
    await card.locator('[data-testid="redeem-method"]').selectOption({ index: 0 });
    // House rule 5 — a **preference word** and an opaque provider handle.
    // Nothing account-shaped is typed here, and the field is labelled so that
    // the screenshot itself is the evidence of that.
    await card.locator('[data-testid="redeem-handle"]').fill("acct_demo_9f2c");
    await shot(winner, "redeem-method-and-handle-chosen");

    await card.locator('[data-testid="redeem-submit"]').click();
    await winner.waitForSelector('[data-testid="in-flight"]');
    await shot(winner, "redeem-requested-and-in-flight");

    // ── 20 · approved, sent, paid — from the admin side. ───────────────────
    //
    // A1 — a job never releases money. Every one of these three states is a
    // person pressing a button, which is why they are three shots and not one.
    const admin = await freshPage(browser);
    await gotoOk(admin, `${BASE}/admin/redeems`);
    await admin.waitForSelector("h1");
    await shot(admin, "admin-redeem-queue-awaiting-approval");

    for (const step of ["approve", "send", "paid"] as const) {
      const button = admin.locator(`[data-testid="redeem-${step}"]`).first();
      if ((await button.count()) === 0) {
        throw new Error(
          `No "${step}" button in the redeem queue. The queue is the record that a ` +
            `person moved this money, so a missing step is the shot 09 asks for.`,
        );
      }
      await button.click();
      // The button for the *next* step is the DOM state that says the action
      // landed. Waiting on a URL would return instantly — the action redirects
      // back to the page it was already on.
      const after = { approve: "send", send: "paid", paid: null }[step];
      if (after) {
        await admin.waitForSelector(`[data-testid="redeem-${after}"]`);
      } else {
        await admin.waitForSelector("text=settled");
      }
      await shot(admin, `admin-redeem-${step}`);
    }

    // And the gamer's own view of the money having landed.
    await gotoOk(winner, `${BASE}/redeem`);
    await winner.waitForSelector("h1");
    await shot(winner, "redeem-gamer-view-after-payout");
  } finally {
    await browser.close();
  }

  console.log(`\n${n} screenshots in ${path.relative(process.cwd(), OUT)}`);
}

await main();
