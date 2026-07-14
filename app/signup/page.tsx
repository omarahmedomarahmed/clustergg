import Link from "next/link";
import OAuthButtons from "@/components/OAuthButtons";
import SignupForm from "@/components/SignupForm";

export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:py-20">
      <div className="glass p-6 sm:p-8">
        <h1 className="text-2xl font-bold">Claim your <span className="grad-text">cosmic profile</span></h1>
        <p className="text-sm text-muted mt-1">
          Sign up with Discord and your avatar + handle come with you. One profile for every game.
        </p>

        <div className="mt-6">
          <OAuthButtons next={next || "/onboarding"} />
        </div>

        {error && <p className="mt-3 text-sm text-rose-300">Sign-up failed ({error}). Try again or use email.</p>}

        <div className="my-6 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-white/10" /> or email <span className="h-px flex-1 bg-white/10" />
        </div>

        <SignupForm />

        <p className="mt-4 text-sm text-muted text-center">
          Already aboard? <Link href="/login" className="text-cyan-300 hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  );
}
