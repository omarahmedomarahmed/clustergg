import Link from "next/link";

export const metadata = { title: "For Brands — Advertise on Cluster" };

const SIZES = [
  { key: "landing_hero_banner", loc: "Landing page, below hero", desktop: "970×250", mobile: "320×100", type: "image / video" },
  { key: "profile_top_banner", loc: "Top of every gamer profile", desktop: "728×90", mobile: "320×50", type: "image / video" },
  { key: "profile_sidebar", loc: "Profile page right rail", desktop: "300×250", mobile: "hidden", type: "image / video" },
  { key: "leaderboard_inline", loc: "Every 10 leaderboard rows", desktop: "728×90", mobile: "300×50", type: "image" },
  { key: "feed_inline", loc: "Every 6 posts in a Space feed", desktop: "728×90", mobile: "320×100", type: "image / video" },
  { key: "challenge_sidebar", loc: "Challenge detail rail", desktop: "300×600", mobile: "hidden", type: "image / video" },
  { key: "messages_footer", loc: "Above the message composer", desktop: "320×50", mobile: "320×50", type: "image" },
  { key: "interstitial_video", loc: "Between page transitions", desktop: "640×360", mobile: "320×180", type: "video · max 5s" },
];

export default function ForBrandsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-bold">
          Put your brand <span className="grad-text">in orbit</span>
        </h1>
        <p className="text-muted mt-5 text-lg leading-relaxed">
          Cluster reaches verified, engaged gamers at the exact moment they&apos;re flexing ranks,
          fighting for challenge podiums, and talking hardware. Every impression is measured —
          geo, device, viewability and click-through, privacy-first.
        </p>
        <a href="mailto:brands@clustergg.com" className="glow-btn mt-8 inline-block rounded-full px-8 py-3 font-semibold text-white">
          Talk to ad sales
        </a>
      </div>

      <div className="mt-16 grid sm:grid-cols-3 gap-5">
        {[
          { t: "Verified audiences", d: "Every stat on Cluster comes from real game APIs — you're reaching actual players, not bots." },
          { t: "Native placements", d: "Eight placement slots woven into profiles, leaderboards, feeds and challenges. Rotation, weighting and scheduling built in." },
          { t: "Full-funnel analytics", d: "Impressions, viewed duration, CTR, unique reach — filterable by date, placement, device and geo." },
        ].map((f) => (
          <div key={f.t} className="glass glass-hover p-6">
            <h3 className="font-bold">{f.t}</h3>
            <p className="text-sm text-muted mt-2 leading-relaxed">{f.d}</p>
          </div>
        ))}
      </div>

      <section id="size-guide" className="mt-20">
        <h2 className="text-2xl font-bold mb-2">Creative size guide</h2>
        <p className="text-muted text-sm mb-6">
          Supply creatives at exact pixel dimensions. Video creatives are hard-capped at
          <b className="text-ink"> 5 seconds</b> — longer files are rejected at upload and playback auto-advances at 5s.
        </p>
        <div className="glass overflow-x-auto">
          <table className="w-full table-cosmic min-w-[640px]">
            <thead>
              <tr><th>Placement</th><th>Location</th><th>Desktop</th><th>Mobile</th><th>Type</th></tr>
            </thead>
            <tbody>
              {SIZES.map((s) => (
                <tr key={s.key}>
                  <td className="font-mono text-xs text-cyan-300">{s.key}</td>
                  <td className="text-sm">{s.loc}</td>
                  <td className="text-sm">{s.desktop}</td>
                  <td className="text-sm text-muted">{s.mobile}</td>
                  <td className="text-sm text-muted">{s.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted mt-4">
          All creatives pass a review queue before going live. See our{" "}
          <Link href="/legal/privacy" className="underline">privacy policy</Link> for how ad
          measurement data is collected (hashed IPs, 90-day aggregation window).
        </p>
      </section>
    </div>
  );
}
