// Shared page furniture. Every figure it renders is passed in from the module
// that enforces it — nothing here knows a price, a share or a threshold.

import Link from "next/link";
import { formatMoney } from "../lib/money/amounts.ts";

/**
 * The site nav, in whichever of 12 §10's four states applies.
 *
 * The state and the switcher are decided in `lib/site/nav.ts`, not here: they
 * are the one place a **brand must never appear** (I4), and a rule enforced in
 * a component is a rule that has to be re-enforced in the next component.
 *
 * House rule 11 — a decoration may never take a card down, and the same
 * applies to a page. Everything below reads from a resolved object; if the
 * context cannot be resolved the guest nav renders, which is the honest
 * fallback rather than a blank header.
 */
export async function Nav() {
  const { navContext } = await import("../lib/site/context.ts");
  const { navStateFor, switcherFor, backToDashboardHref, showsSiteNav } = await import(
    "../lib/site/nav.ts"
  );
  const facts = await navContext();
  const state = navStateFor(facts);

  // A brand on their own dashboard has no site nav at all (12 §10). This
  // component is not rendered there, and the check is here as well because a
  // page added later would otherwise inherit one silently.
  if (!showsSiteNav(state)) return null;

  const switcher = switcherFor(facts);
  const backHref = backToDashboardHref(facts);

  return (
    <nav className="border-b border-line" data-nav={state}>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-6 px-6 py-4 text-sm">
        <Link href="/" className="font-semibold tracking-tight">ClusterGG</Link>
        <Link href="/challenges" className="text-mute hover:text-white">Challenges</Link>
        <Link href="/pool" className="text-mute hover:text-white">Pool</Link>
        <Link href="/trophies" className="text-mute hover:text-white">Trophies</Link>
        <Link href="/community" className="text-mute hover:text-white">Community</Link>

        {switcher.length > 0 ? (
          <details className="relative ml-auto" data-testid="context-switcher">
            <summary className="cursor-pointer list-none text-mute hover:text-white">
              {switcher[0].label} ▾
            </summary>
            <div className="absolute right-0 z-10 mt-2 flex min-w-56 flex-col gap-1 rounded-lg border border-line bg-panel p-2">
              {switcher.map((entry) => (
                <Link
                  key={`${entry.kind}:${entry.href}`}
                  href={entry.href}
                  className="rounded-md px-2 py-1.5 text-mute hover:bg-line/40 hover:text-white"
                >
                  {entry.label}
                </Link>
              ))}
            </div>
          </details>
        ) : null}

        {backHref ? (
          <Link href={backHref} className="ml-auto text-mute hover:text-white" data-testid="back-to-dashboard">
            Back to dashboard
          </Link>
        ) : null}
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

/**
 * The page's background art, on its own fixed layer.
 *
 * ===== D18 — A SEPARATE LAYER, NEVER `background-attachment: fixed` =====
 *
 * v1 found that `background-attachment: fixed` makes long customized pages
 * scroll badly — the compositor re-rasterises the whole background on every
 * frame. A fixed-position element behind the content gets the same effect and
 * scrolls at sixty frames.
 *
 * ===== E14/E15 — THE OVERLAY IS PART OF THE SETTING, AND THE WHOLE THING IS
 * A DECORATION =====
 *
 * `aria-hidden` and `pointer-events: none`: this can never take a click, never
 * reach a screen reader, and — because it sits behind everything with its own
 * stacking context — can never cover the page if the image 404s. A background
 * that fails to load leaves a dark panel and a readable page, which is house
 * rule 11 applied to visuals.
 *
 * Renders nothing at all when there is no art, which is E13: every page must
 * look finished with none, so "none" is the absence of an element rather than
 * an empty one.
 */
export function PageArtLayer({
  art,
}: {
  art: { imageUrl: string | null; overlay: number; focal: "top" | "center" | "bottom" };
}) {
  if (!art.imageUrl) return null;
  return (
    <div
      aria-hidden
      data-testid="page-art"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={art.imageUrl}
        alt=""
        className="h-full w-full object-cover"
        style={{ objectPosition: art.focal }}
      />
      <div
        data-testid="page-art-overlay"
        className="absolute inset-0"
        style={{ background: `rgba(4, 5, 26, ${art.overlay / 100})` }}
      />
    </div>
  );
}
