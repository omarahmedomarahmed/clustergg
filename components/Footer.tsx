import Link from "next/link";

export default function Footer() {
  return (
    <footer className="relative z-10 mt-20 border-t border-violet-500/15">
      <div className="mx-auto max-w-6xl px-4 py-12 grid gap-8 sm:grid-cols-2 md:grid-cols-4 text-sm">
        <div>
          <div className="flex items-center gap-2 mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/logo.png" alt="" width={28} height={28} className="rounded-full" />
            <span className="font-bold grad-text">CLUSTER</span>
          </div>
          <p className="text-muted leading-relaxed">
            Every game. One identity. Link your accounts, flex your ranks, and climb the galaxy.
          </p>
        </div>
        <div>
          <div className="font-semibold mb-3 text-ink">Platform</div>
          <ul className="space-y-2 text-muted">
            <li><Link href="/leaderboards" className="hover:text-ink">Leaderboards</Link></li>
            <li><Link href="/spaces" className="hover:text-ink">Spaces</Link></li>
            <li><Link href="/search" className="hover:text-ink">Find gamers</Link></li>
            <li><Link href="/signup" className="hover:text-ink">Create your profile</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-3 text-ink">Business</div>
          <ul className="space-y-2 text-muted">
            <li><Link href="/for-brands" className="hover:text-ink">Advertise with us</Link></li>
            <li><Link href="/for-brands#size-guide" className="hover:text-ink">Ad size guide</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-3 text-ink">Legal</div>
          <ul className="space-y-2 text-muted">
            <li><Link href="/legal/privacy" className="hover:text-ink">Privacy Policy</Link></li>
            <li><Link href="/legal/terms" className="hover:text-ink">Terms of Service</Link></li>
            <li><Link href="/legal/cookies" className="hover:text-ink">Cookie Policy</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-violet-500/10 py-5 text-center text-xs text-muted/70">
        © {new Date().getFullYear()} Cluster · clustergg.com · Made among the stars
      </div>
    </footer>
  );
}
