import Link from "next/link";
import OAuthButtons from "@/components/OAuthButtons";
import LoginForm from "@/components/LoginForm";
import Icon from "@/components/Icon";
import { getT } from "@/lib/i18n/t-server";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const { tr } = await getT();
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:py-20">
      <div className="glass p-6 sm:p-8">
        <h1 className="text-2xl font-bold">{tr("Welcome back,")} <span className="grad-text">{tr("star traveler")}</span></h1>
        <p className="text-sm text-muted mt-1">{tr("Sign in with Discord — your universal gamer identity.")}</p>

        <div className="mt-6">
          <OAuthButtons next={next || "/feed"} />
        </div>

        {error && <p className="mt-3 text-sm text-rose-300">{tr("Sign-in failed")} ({error}). {tr("Try again or use email.")}</p>}

        <div className="my-6 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-white/10" /> {tr("or email")} <span className="h-px flex-1 bg-white/10" />
        </div>

        <LoginForm />

        <p className="mt-5 text-sm text-muted text-center">
          {tr("New here?")} <Link href="/signup" className="text-cyan-300 hover:underline">{tr("Join the Cluster")}</Link>
        </p>
      </div>

      {/* The other two people who sign in here.
          A brand's media buyer and a server owner don't have gamer accounts and
          never will — their credential is a portal key. Before this, the only
          way in was a URL somebody had to send them, so "how do I log in" was
          a support email instead of a link. */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link
          href="/login/brand"
          className="glass group rounded-2xl p-4 transition hover:ring-1 hover:ring-violet-400/40"
        >
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-violet-300">
            <Icon name="grid" size={12} /> Brands
          </span>
          <span className="mt-1.5 block font-bold">Campaign portal</span>
          <span className="mt-0.5 block text-xs leading-snug text-muted">
            Campaigns, creatives and delivery numbers.
          </span>
          <span className="mt-2 inline-flex items-center gap-1 text-xs brand-text">
            Sign in <Icon name="arrowRight" size={11} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        <Link
          href="/login/server"
          className="glass group rounded-2xl p-4 transition hover:ring-1 hover:ring-sky-400/40"
        >
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-sky-300">
            <Icon name="discord" size={12} /> Server owners
          </span>
          <span className="mt-1.5 block font-bold">Server portal</span>
          <span className="mt-0.5 block text-xs leading-snug text-muted">
            Your members, your challenges, what they&apos;re winning.
          </span>
          <span className="mt-2 inline-flex items-center gap-1 text-xs text-sky-300">
            Sign in <Icon name="arrowRight" size={11} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </div>
    </div>
  );
}
