// Capture the feature screenshots from a running demo build.
//
//   npm run build
//   DEMO_DB=1 npx next start -p 3031      # in one terminal
//   node scripts/capture-shots.mjs        # in another
//
// Capture against `next start`, not `next dev`. A dev build paints the Next.js
// dev-tools overlay into the corner of every screenshot, and its on-the-fly
// chunking breaks under a script that navigates thirty pages in ninety seconds —
// the first run of this produced a marketing screenshot that was a red
// "Cannot find module" stack trace, saved under the key for "every line
// itemised". Production output is also what a visitor actually sees, which is
// the only thing worth photographing.
//
// Writes `public/shots/<key>.png` for every registry entry it can reach, and
// prints a summary of what it could not. Nothing is uploaded and nothing touches
// a database: the PNGs are committed to the repo and the seed points
// `feature_shots.imageUrl` at `/shots/<key>.png`, so a fresh install has real
// screenshots of real screens with no Blob store and no capture run.
//
// Why files rather than a Blob upload: a screenshot of the product IS part of
// the product's source. Committing them means the same picture ships to every
// environment, the diff shows when one changed, and an install with no storage
// configured still has evidence behind its claims. An admin replacing one at
// /admin/shots writes a Blob URL over the top, which wins from then on.
//
// A shot that renders without its artwork — a card whose logos live on a CDN
// this machine cannot reach — is still captured on purpose. It is a real
// screenshot of a real screen, and an admin can replace it with one taken
// somewhere with the art loaded. A missing file, by contrast, leaves the page
// with a placeholder and nobody able to tell whether the feature works.

import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { readFileSync } from "node:fs";

const BASE = process.env.CAPTURE_BASE ?? "http://localhost:3031";
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = "public/shots";
// Page captures are JPEG; card renders stay PNG.
//
// At 2x device scale a full-page PNG is ~1MB and twenty-eight of them put 28MB
// of screenshots into the repository. These are UI photographs, not artwork
// with transparency, so JPEG at 82 is visually indistinguishable at display
// size and roughly a tenth of the weight. The bot cards are the exception: they
// are already-optimised PNGs served straight from the render endpoint, so they
// are copied byte-for-byte rather than re-encoded.
const JPEG = { type: "jpeg", quality: 82 };
const ext = (shot) => (shot.capturedFrom.startsWith("/api/card/") ? "png" : "jpg");

// Parsed from the registry rather than duplicated, so a key added there is
// captured here without a second edit.
function registry() {
  const src = readFileSync("lib/shots.ts", "utf8");
  const body = src.slice(src.indexOf("export const SHOT_REGISTRY"), src.indexOf("\n];", src.indexOf("export const SHOT_REGISTRY")));
  return [...body.matchAll(/\{\s*key:\s*"([^"]+)"[^}]*?group:\s*"([^"]+)"[^}]*?capturedFrom:\s*"([^"]+)"(?:[^}]*?as:\s*"([^"]+)")?(?:[^}]*?selector:\s*"([^"]+)")?(?:[^}]*?openText:\s*"([^"]+)")?/g)]
    .map((m) => ({ key: m[1], group: m[2], capturedFrom: m[3], as: m[4] ?? "guest", selector: m[5], openText: m[6] }));
}

const CREDS = {
  gamer: { email: "nova@demo.gg", password: "cluster-demo" },
  admin: { email: "admin@clustergg.com", password: "cluster-admin" },
};

async function signIn(page, who) {
  const c = CREDS[who];
  if (!c) return;
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const btn = page.getByRole("button", { name: /log in with email/i });
  if (!(await btn.count())) return; // already signed in
  await page.fill('input[name="email"]', c.email);
  await page.fill('input[name="password"]', c.password);
  await btn.evaluate((el) => el.click());
  await page.waitForURL(/\/(feed|admin)/, { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  // `node scripts/capture-shots.mjs key1 key2` re-captures just those, so
  // fixing one shot does not mean re-shooting twenty-seven that were fine.
  const only = process.argv.slice(2);
  const shots = registry().filter((s) => !only.length || only.includes(s.key));
  const browser = await chromium.launch({ executablePath: CHROME });
  const done = [];
  const failed = [];

  // One context per role, reused across every shot that needs it — signing in
  // 28 times is most of the runtime of this script.
  const contexts = {};
  const ctxFor = async (who) => {
    if (contexts[who]) return contexts[who];
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
    const page = await ctx.newPage();
    if (who !== "guest") await signIn(page, who);
    contexts[who] = { ctx, page };
    return contexts[who];
  };

  // A portal session belongs to one server or one brand, so each portal URL gets
  // its own context rather than sharing one that already holds somebody else's.
  const portalCtxs = new Map();
  const portalCtx = async (url) => {
    if (portalCtxs.has(url)) return portalCtxs.get(url);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
    const page = await ctx.newPage();
    // The `?key=` in the URL is exchanged for a cookie by /api/portal/unlock and
    // then stripped from the address bar, which is also why the screenshot never
    // shows a key in it.
    await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 45000 });
    portalCtxs.set(url, { ctx, page });
    return portalCtxs.get(url);
  };

  for (const shot of shots) {
    // Server and brand portals unlock with the demo keys the seed writes (see
    // seedDemoPortalKeys). Each gets its own context because a portal session is
    // scoped to one server or one brand, and reusing a session across two would
    // silently screenshot the first one twice.
    try {
      const outExt = ext(shot);
      const { page } = shot.as === "server" || shot.as === "brand"
        ? await portalCtx(shot.capturedFrom)
        : await ctxFor(shot.as);
      // The unlock endpoint redirects and strips the key, so navigating again
      // with the original `?key=` URL restarts that redirect underneath whatever
      // the script is doing — which is what "execution context was destroyed"
      // meant here. Once a portal context is open it is already on the right
      // page; use where it landed.
      const isPortal = shot.as === "server" || shot.as === "brand";
      const url = isPortal ? page.url()
        : (shot.capturedFrom.startsWith("http") ? shot.capturedFrom : BASE + shot.capturedFrom);

      // A card endpoint returns a PNG directly — screenshotting the browser's
      // image viewer would frame it in chrome, so the bytes are taken as-is.
      if (shot.capturedFrom.startsWith("/api/card/")) {
        const res = await page.request.get(url);
        if (!res.ok()) throw new Error(`card returned ${res.status()}`);
        writeFileSync(`${OUT}/${shot.key}.png`, await res.body());
        done.push(shot.key);
        continue;
      }

      if (page.url() !== url) await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
      // The console shell paints a loading screen first, so waiting on the body
      // races it. Wait for a heading, then let art settle.
      await page.waitForSelector("h1, h2", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(2200);
      // Collapsed <details> render as a closed row in a screenshot; open them so
      // the picture shows the thing it is meant to be evidence of.
      await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
      // Dismiss the cookie banner. It is a fixed overlay across the bottom of
      // every page, so leaving it up meant a third of each screenshot was a
      // consent dialog instead of the feature it is meant to be evidence of.
      await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) => /^(accept all|essential only)$/i.test((x.innerText || "").trim()));
        b?.click();
      });
      await page.waitForTimeout(500);

      // A tab or accordion the evidence lives behind. Runs whether or not this
      // shot also crops to a selector: the portal tabs are client-side, so
      // "Earnings" is a button to press rather than a URL to visit.
      if (shot.openText) {
        await page.evaluate((t) => {
          const b = [...document.querySelectorAll("button, [role='tab'], a")]
            .find((x) => (x.innerText || "").trim().toLowerCase().startsWith(t.toLowerCase()));
          b?.click();
        }, shot.openText).catch(() => {});
        await page.waitForTimeout(1400);
      }
      await page.waitForTimeout(200);

      // Some crop targets only exist once a collapsed card is opened — the LoL
      // rank grid lives inside an accordion row. Click through the account rows
      // until the target appears rather than declaring it missing.
      if (shot.selector && !(await page.locator(shot.selector).count())) {
        // Clicked in-page rather than through Playwright, and only buttons that
        // are not links: clicking the wrong one navigates away and destroys the
        // context, which is what happened when this clicked the first twelve
        // buttons on the page indiscriminately.
        const opened = await page.evaluate(async ({ sel, openText }) => {
          // `b.type` is "submit" for ANY button with no type attribute, form or no
          // form — so filtering on it excluded almost every button on the page and
          // the loop clicked nothing. What actually needs avoiding is a control
          // that navigates or posts: a link wrapper, or a real form submit.
          const all = [...document.querySelectorAll("button")]
            .filter((b) => !b.closest("a") && !(b.form && b.type === "submit"));
          // An accordion closes the row it had open, so clicking through in DOM
          // order can leave the target shut again. When the registry names the
          // control, click exactly that one.
          const btns = openText
            ? all.filter((b) => (b.innerText || "").toLowerCase().includes(openText.toLowerCase()))
            : all;
          for (const b of btns.slice(0, 30)) {
            b.click();
            await new Promise((r) => setTimeout(r, 250));
            if (document.querySelector(sel)) return true;
          }
          return false;
        }, { sel: shot.selector, openText: shot.openText }).catch(() => false);
        if (opened) await page.waitForTimeout(900);
      }
      // Refuse to save a picture of a crash.
      //
      // A dev-server chunk error renders a full-page Next.js overlay, and the
      // capture happily wrote it to disk as `server.earnings.ledger.png` — a
      // marketing page would then have shown a red stack trace as the evidence
      // for "every line itemised". A screenshot system that captures error
      // pages and presents them as proof is worse than one that captures
      // nothing, because nothing at least renders a placeholder that says so.
      const broken = await page.evaluate(() => {
        // `nextjs-portal` is on EVERY dev page — it is the dev-tools host, not an
        // error — so its mere presence proves nothing. What matters is whether it
        // is showing a stack trace.
        const portal = document.querySelector("nextjs-portal");
        if (portal && /Runtime Error|Cannot find module|Unhandled/i.test(portal.textContent || "")) return "next dev error overlay";
        const t = document.body.innerText || "";
        if (/Cannot find module|Unhandled Runtime Error|Runtime Error|Application error: a server-side exception/i.test(t)) return "error text on page";
        if (t.trim().length < 40) return "page is blank";
        return null;
      });
      if (broken) throw new Error(`refused — ${broken}`);

      const target = shot.selector ? page.locator(shot.selector).first() : page;
      if (shot.selector && !(await page.locator(shot.selector).count())) throw new Error(`selector ${shot.selector} not on page`);
      await target.screenshot({ path: `${OUT}/${shot.key}.jpg`, ...JPEG, ...(shot.selector ? {} : { fullPage: false }) });
      done.push(shot.key);
    } catch (e) {
      failed.push([shot.key, String(e).split("\n")[0].slice(0, 90)]);
    }
  }

  await browser.close();
  console.log(`\ncaptured ${done.length}/${shots.length}`);
  done.forEach((k) => console.log(`  ok    ${k}`));
  failed.forEach(([k, why]) => console.log(`  skip  ${k}  — ${why}`));
  console.log(`\nwritten to ${OUT}/. Commit them; the seed points feature_shots at /shots/<key>.<ext>.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
