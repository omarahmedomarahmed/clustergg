export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose-cosmic">
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <p>Last updated: July 2026.</p>

      <h2>The deal</h2>
      <p>
        Cluster gives you a unified gamer profile built from accounts you link. It&apos;s free.
        Don&apos;t abuse it, don&apos;t impersonate others, don&apos;t link accounts that aren&apos;t yours.
      </p>

      <h2>Your content</h2>
      <p>
        You own what you post. You grant Cluster a license to display it on the platform.
        We may remove content that breaks these terms or applicable law.
      </p>

      <h2>Challenges</h2>
      <p>
        Challenge scoring is automated from provider APIs. Admins may disqualify participants
        for manipulation (win-trading, smurfing, account sharing). Prize fulfilment is handled
        per-challenge; placement decisions are final.
      </p>

      <h2>Game providers</h2>
      <p>
        Linking an account means Cluster fetches data those providers expose. You are
        responsible for complying with each provider&apos;s terms. Providers flagged as
        &quot;legal review&quot; (e.g. PSN) are intentionally not integrated.
      </p>

      <h2>Liability</h2>
      <p>
        The service is provided &quot;as is&quot;. To the maximum extent permitted by law, Cluster is
        not liable for indirect damages, lost ranks, or bruised egos on the leaderboard.
      </p>
    </div>
  );
}
