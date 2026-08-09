import Link from "next/link";

export const metadata = { title: "Your account is gone · Cluster" };

// Where an under-13 confirmation lands. B95.
//
// It is a real page rather than a redirect to the homepage, because a homepage
// full of prize money is the worst possible place to send somebody who has just
// been told they are too young for it — and because a deletion with no
// acknowledgement reads as a bug.
//
// The tone is the whole design. Nobody has done anything wrong: they answered a
// question honestly, and the honest answer had a consequence that is the law's
// and not ours. So it says what happened, says it is not a punishment, and says
// what to do in two years.

export default function GoodbyePage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="text-3xl font-black">Your account has been deleted.</h1>

      <p className="mt-5 text-sm leading-relaxed text-muted">
        You told us you are under 13, and we deleted everything straight away — the account, the
        points, the linked games, all of it. That is not a punishment and you have not done anything
        wrong. Thank you for answering honestly; most people would not have.
      </p>

      <p className="mt-4 text-sm leading-relaxed text-muted">
        Cluster pays real prize money, and the rules about running something like this for anybody
        under 13 are strict enough that the only honest option is not to. Nothing here is worth
        breaking that over.
      </p>

      <div className="glass mt-8 p-5 text-left text-sm leading-relaxed">
        <div className="font-bold">Come back on your 13th birthday.</div>
        <p className="mt-1 text-muted">
          You will need to make a new account — there is nothing left of this one to restore, which
          is the point of deleting it. Everything on Cluster is free to join.
        </p>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-muted">
        If you tapped that by mistake, or if you are over 13 and this happened anyway, write to{" "}
        <a href="mailto:support@clustergg.com" className="text-cyan-300 hover:underline">support@clustergg.com</a>{" "}
        and a person will read it.
      </p>

      <Link href="/" className="ghost-btn pressable mt-8 inline-block rounded-full px-6 py-2.5 text-sm">
        Back to the homepage
      </Link>
    </div>
  );
}
