export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose-cosmic">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p>Last updated: July 2026 · Applies to clustergg.com (&quot;Cluster&quot;).</p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Account data:</b> email, display name, profile details you provide.</li>
        <li><b>Linked game accounts:</b> public identifiers and public stats fetched from game provider APIs (Chess.com, Lichess, OpenDota, Steam, Riot Games, etc.). We only pull data those APIs expose publicly or that you authorize via OAuth.</li>
        <li><b>Community content:</b> posts, comments, reactions and messages you create.</li>
        <li><b>Ad measurement:</b> when an ad renders we record placement, page path, device type, coarse geo (from edge headers), viewed duration, and a <b>salted hash</b> of your IP address. Raw IP addresses are never stored.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>Render your public profile and leaderboards.</li>
        <li>Score challenges from provider API data.</li>
        <li>Measure ad delivery for our brand partners (aggregate reporting only).</li>
        <li>Send transactional email you opt into.</li>
      </ul>

      <h2>Retention & deletion</h2>
      <p>
        Raw ad impression rows are aggregated and purged after 90 days. Deleting your account
        removes your profile, linked accounts, content and messages. Game providers retain
        their own data under their own policies — unlinking an account stops all syncing.
      </p>

      <h2>Your rights (GDPR / CCPA)</h2>
      <p>
        You may request access, correction, export or erasure of your data at any time via
        privacy@clustergg.com. We do not sell personal data.
      </p>

      <h2>Third-party APIs</h2>
      <p>
        Stats are fetched from official or public game APIs. Cluster is not endorsed by or
        affiliated with Riot Games, Valve, Epic Games, Supercell, Chess.com, or any other
        provider. Their trademarks belong to them.
      </p>
    </div>
  );
}
