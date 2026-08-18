// Where an account ends. Two ways to arrive, and they are not the same thing.
//
// The under-13 path (04 §1 rule 1) is a **hard delete** — there is no lawful
// reason to keep a row we should never have made, and what survives is a
// salted fingerprint that exists only so the same person cannot come back with
// a different answer. It cannot say who they were.
//
// `?closed=1` is a gamer closing their own account from `/settings/privacy`.
// That is a status change, not a delete, because a trophy they won stays
// accounted for in the prize vault (V14/T6) — the brand really did pay for it.
// Saying so here rather than implying everything vanished is the difference
// between an honest page and a comfortable one.

export const dynamic = "force-dynamic";

export default async function GoodbyePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const closed = (await searchParams).closed === "1";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Your account is closed
      </h1>

      {closed ? (
        <>
          <p className="text-sm text-mute" data-testid="closed-by-request">
            You closed it, and we have stopped using it for anything.
          </p>
          <p className="text-sm text-mute">
            If you were holding a trophy worth money, it stays on our books rather than
            disappearing — a brand paid for it, and our prize vault has to keep saying
            so. It is not claimable now the account is closed.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-mute">
            You told us you are under 13, so we deleted your account. We keep
            nothing that identifies you.
          </p>
          <p className="text-sm text-mute">
            Come back when you turn 13 — there will be plenty to play for.
          </p>
        </>
      )}
    </main>
  );
}
