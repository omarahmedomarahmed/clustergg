import Link from "next/link";
import OAuthButtons from "@/components/OAuthButtons";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:py-20">
      <div className="glass p-6 sm:p-8">
        <h1 className="text-2xl font-bold">Welcome back, <span className="grad-text">star traveler</span></h1>
        <p className="text-sm text-muted mt-1">Sign in with Discord — your universal gamer identity.</p>

        <div className="mt-6">
          <OAuthButtons next={next || "/feed"} />
        </div>

        {error && <p className="mt-3 text-sm text-rose-300">Sign-in failed ({error}). Try again or use email.</p>}

        <div className="my-6 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-white/10" /> or email <span className="h-px flex-1 bg-white/10" />
        </div>

        <LoginForm />

        <p className="mt-5 text-sm text-muted text-center">
          New here? <Link href="/signup" className="text-cyan-300 hover:underline">Join the Cluster</Link>
        </p>
      </div>
    </div>
  );
}
