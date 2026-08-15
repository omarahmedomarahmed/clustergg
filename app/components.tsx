// Shared page furniture. Every figure it renders is passed in from the module
// that enforces it — nothing here knows a price, a share or a threshold.

import Link from "next/link";
import { formatMoney } from "../lib/money/amounts.ts";

export function Nav() {
  return (
    <nav className="border-b border-line">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4 text-sm">
        <Link href="/" className="font-semibold tracking-tight">ClusterGG</Link>
        <Link href="/challenges" className="text-mute hover:text-white">Challenges</Link>
        <Link href="/pool" className="text-mute hover:text-white">Pool</Link>
        <Link href="/trophies" className="text-mute hover:text-white">Trophies</Link>
        <Link href="/community" className="text-mute hover:text-white">Community</Link>
      </div>
    </nav>
  );
}

export function Money({ cents }: { cents: number }) {
  return <span>{formatMoney(cents)}</span>;
}

export function Card({ children, href }: { children: React.ReactNode; href?: string }) {
  const inner = (
    <div className="rounded-xl border border-line bg-panel p-5 transition hover:border-accent">
      {children}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-sm text-mute">{children}</p>;
}
