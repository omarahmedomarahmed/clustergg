export const metadata = { title: "Cookie Policy" };

// What we store, in full. B104.
//
// Rewritten when the banner was: it used to describe a consent choice the
// product did not act on. A policy that describes a control nobody implemented
// is a policy that is wrong in the most damaging possible direction.

export default function CookiesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose-cosmic">
      <h1 className="text-3xl font-bold">Cookie Policy</h1>
      <p>Last updated: August 2026.</p>

      <h2>What we set</h2>
      <ul>
        <li>
          <b>cluster_session</b> — an httpOnly cookie that keeps you signed in. 30 days. Without it
          there is no way to be logged in, so it is not optional.
        </li>
        <li>
          <b>cluster_portal</b> — the same thing for a server owner or a brand who opened their
          portal with a key. Also httpOnly, also not optional.
        </li>
        <li>
          <b>cluster-cookie-notice</b> — remembers that you have seen the notice at the bottom of
          the page, so it is not shown twice. Stored in localStorage, and it holds one word.
        </li>
      </ul>

      <h2>What we count, and why</h2>
      <p>
        A brand pays a <b>fixed price for a sponsored challenge</b> — not for views, and not per
        thousand of anything. Nobody&apos;s browsing generates a bill.
      </p>
      <p>
        What we count is <b>delivery</b>: whether the challenge the brand paid for actually reached
        the servers it was supposed to. One row per card shown, per viewer, per window. It is
        evidence that we did what we sold, and it is the number we show the brand in their report.
      </p>
      <p>What the row holds:</p>
      <ul>
        <li>A <b>salted hash</b> of your IP address. Not the address — a one-way hash of it.</li>
        <li>A <b>salted hash</b> of your session cookie, so two views by the same browser are not
          counted twice. Not the cookie, and not a piece of it.</li>
        <li>Which card, which page, mobile or desktop, and the country and city your request
          arrived with — which come from the edge, not from you.</li>
      </ul>
      <p>
        Those rows are <b>deleted after 90 days</b>, automatically, by a job that runs every day.
        What survives is the total in the brand&apos;s report. The bill was settled when they bought
        the challenge and does not depend on any of it.
      </p>

      <h2>What we do not do</h2>
      <p>
        No third-party tracking cookies. No cross-site advertising identifiers. No fingerprinting.
        Nothing that follows you to another website. Nothing sold, and nothing shared with an ad
        network — there is no ad network, only brands who bought a challenge here.
      </p>

      <h2>Why there is no accept/reject button</h2>
      <p>
        There used to be one, and it did nothing — pressing &quot;essential only&quot; changed no
        behaviour at all. We would rather tell you plainly what we store than offer a switch that
        is not connected to anything.
      </p>
      <p>
        The measurement above is first-party, it earns nobody any money, it holds hashes rather than
        identifiers, and it expires. If that position needs to change — because of where our
        gamers are, or because a regulator says so — the notice will change with it and this page
        will say when.
      </p>

      <h2>Managing it</h2>
      <p>
        Clearing the session cookie signs you out. Clearing site data brings the notice back. A
        browser set to block cookies can still read every public page here; it just cannot sign in,
        because signing in is a cookie.
      </p>
    </div>
  );
}
