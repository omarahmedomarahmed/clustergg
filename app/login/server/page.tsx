import Link from "next/link";
import Icon from "@/components/Icon";
import PortalLogin from "@/components/PortalLogin";
import { MAX_FAILURES } from "@/lib/portal-auth";
import { installUrl } from "@/lib/discord/config";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Server owner sign-in — Cluster",
  description: "Open your server's Cluster portal with the key the bot sent you when it was installed.",
};

// The server owner's front door.
//
// Owners get their key by DM at install time, and a DM scrolls away. Naming
// the server and pasting the key is a route back in that doesn't require
// finding a months-old message.
export default async function ServerLoginPage({
  searchParams,
}: { searchParams: Promise<{ slug?: string; name?: string }> }) {
  const { slug = "", name = "" } = await searchParams;
  const install = installUrl();
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:py-20">
      <div className="glass p-6 sm:p-8">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-200">
          <Icon name="discord" size={12} /> For server owners
        </div>
        <h1 className="text-2xl font-bold">Open your server portal</h1>
        <p className="mt-1.5 text-sm text-muted">
          Your members&apos; progress, your challenges and what your community is winning. The bot DM&apos;d
          you the key when it was installed.
        </p>

        <div className="mt-6">
          <PortalLogin kind="server" initialSlug={slug} initialName={name} />
        </div>

        <p className="mt-5 text-[11px] leading-relaxed text-muted">
          {MAX_FAILURES} wrong keys locks this server&apos;s portal for a while and reports the attempt to our
          team. Lost the key? Run <code className="rounded bg-white/[0.06] px-1">/cluster server</code> in
          your own server and the bot will send it again.
        </p>

        <div className="mt-6 border-t border-white/8 pt-5 text-sm text-muted">
          {install ? (
            <>Bot not installed yet? <a href={install} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">Add ClusterBot</a></>
          ) : (
            <>New here? <Link href="/discord-bot" className="text-sky-300 hover:underline">What the bot does</Link></>
          )}
        </div>
        <div className="mt-2 text-sm text-muted">
          Advertising with us instead? <Link href="/login/brand" className="brand-text hover:underline">Brand sign-in</Link>
        </div>
      </div>
    </div>
  );
}
