/**
 * Navigation helpers for every browser suite. One file, because the mistake
 * they exist to prevent was made in twelve.
 *
 * ===== WHY `networkidle` IS BANNED HERE =====
 *
 * `waitUntil: "networkidle"` waits for 500ms with no more than two in-flight
 * requests. This app never reaches that on a real page:
 *
 *   - Next prefetches every `<Link>` in the viewport, and the nav and footer put
 *     a dozen of them on every page. Scrolling or hovering starts more.
 *   - The two Vercel analytics scripts load on their own schedule.
 *   - The starfield and card art stream in.
 *
 * So the wait runs the full 30s and then THROWS — on a page that rendered in
 * under a second. An uncaught `goto` rejection kills the suite, and a killed
 * suite reports zero assertions rather than a failure, which reads as "nothing
 * to see here" in a summary.
 *
 * That was six suites failing at once for one reason, and it hid at least one
 * genuinely stale assertion underneath it.
 *
 * ===== WHAT TO WAIT FOR INSTEAD =====
 *
 * The DOM the assertions actually read. `open()` covers the general case: the
 * document is parsed and the app's loading screen has gone. When a suite needs
 * something more specific — a shelf tile, a table row — it should wait for that
 * instead, and `settle()` is here for the cases where a click, not a `goto`,
 * started the navigation.
 */

/** The app's own loading screen, from app/loading.tsx. */
const LOADING = /Traversing the cluster|Aligning the constellations/i;

/**
 * Wait for the page to be readable — parsed, and past the loading screen.
 *
 * Never throws. A page that is still loading after the timeout is a real
 * failure, but it belongs to whichever assertion reads the body next, with that
 * assertion's own message. A throw here would take the suite down and tell
 * nobody which check was in flight.
 */
export async function settle(page, timeout = 20000) {
  await page.waitForFunction(
    (re) => !new RegExp(re, "i").test(document.body.innerText),
    LOADING.source,
    { timeout },
  ).catch(() => {});
}

/** `goto` + `settle`. The replacement for every `waitUntil: "networkidle"`. */
export async function open(page, url, timeout = 30000) {
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout });
  await settle(page);
  return res;
}

/**
 * Wait for a navigation that a CLICK started, and that lands somewhere else.
 *
 * Reading `page.url()` straight after a click reports the old path whenever the
 * page streams: the shell has already flushed, so a `redirect()` in the new
 * route cannot be answered with a 307 and Next finishes the navigation in the
 * browser instead.
 */
export async function landed(page, fromPath, timeout = 15000) {
  await page.waitForFunction(
    (from) => location.pathname !== from,
    fromPath,
    { timeout },
  ).catch(() => {});
  await settle(page);
}

/** Sign in and wait to be somewhere that is not the login page. */
export async function login(page, base, email, password) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.locator('input[name="password"]').press("Enter");
  await page.waitForFunction(() => !location.pathname.startsWith("/login"), null, { timeout: 20000 });
  await settle(page);
}
