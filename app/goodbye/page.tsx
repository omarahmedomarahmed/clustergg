// Where the under-13 path ends.
//
// The account is already gone by the time this renders. What is left is a
// salted fingerprint, which exists only so the same person cannot come back
// and give a different answer — it cannot say who they were.
export default function GoodbyePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Your account is closed
      </h1>
      <p className="text-sm text-mute">
        You told us you are under 13, so we deleted your account. We keep
        nothing that identifies you.
      </p>
      <p className="text-sm text-mute">
        Come back when you turn 13 — there will be plenty to play for.
      </p>
    </main>
  );
}
