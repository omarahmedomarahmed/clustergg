export const metadata = { title: "Cookie Policy" };

export default function CookiesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose-cosmic">
      <h1 className="text-3xl font-bold">Cookie Policy</h1>
      <p>Last updated: July 2026.</p>

      <h2>Cookies we set</h2>
      <ul>
        <li><b>cluster_session</b> — httpOnly session cookie that keeps you signed in (essential, 30 days).</li>
        <li><b>cluster-consent</b> — remembers your cookie-banner choice (localStorage, not a cookie in the strict sense).</li>
      </ul>

      <h2>What we don&apos;t do</h2>
      <p>
        No third-party tracking cookies, no cross-site advertising identifiers, no fingerprinting.
        Ad measurement uses a salted hash of your IP that cannot be reversed to identify you,
        plus coarse geo from edge request headers.
      </p>

      <h2>Managing cookies</h2>
      <p>
        Clearing the session cookie signs you out. You can re-open the consent choice by
        clearing site data in your browser.
      </p>
    </div>
  );
}
