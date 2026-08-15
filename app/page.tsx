// Stage 0 placeholder. The real homepage is Stage 7 — live challenges, the
// countdown to Friday, and the live pool. Deliberately states no figure: every
// number on this platform is imported from the module that enforces it, and
// none of those modules exist yet.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">ClusterGG</h1>
      <p className="text-mute">
        An automated weekly gaming competition that runs inside the Discord
        servers gamers already sit in. No bracket, no schedule, no lobby, no
        stream, no staff, no dispute — the game&rsquo;s own API is the referee.
      </p>
      <p className="text-sm text-mute">Stage 0 — foundation.</p>
    </main>
  );
}
