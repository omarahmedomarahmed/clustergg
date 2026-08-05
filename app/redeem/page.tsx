import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getTrophyCase, getMyRedeems } from "@/lib/trophies";
import RedeemStepper from "@/components/RedeemStepper";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Cash out · ClusterGG",
  description: "Turn the trophies you have won into real money.",
};

// Cashing out, as a route rather than a popup (B6).
//
// It was a two-step panel inside the trophy case — fine for one $5 trophy, poor
// for the moment somebody cashes out $400. A popup cannot be linked to, cannot
// be refreshed, cannot be shared with support, and loses everything if a phone
// rotates and remounts the tree.
//
// So every step is in the URL. `?step=` says where you are and `?t=` says what
// you picked, which makes the whole flow deep-linkable and refresh-survivable
// for free — no session storage, no state machine to get out of sync with the
// address bar, and the back button works because it is just navigation.
export default async function RedeemPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; t?: string; done?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/redeem");

  const db = await getDb();
  const sp = await searchParams;
  const [awards, redeems, me] = await Promise.all([
    getTrophyCase(db, user.id),
    getMyRedeems(db, user.id),
    db.select({
      payoutMethod: schema.users.payoutMethod,
      payoutChanges: schema.users.payoutChanges,
      country: schema.users.country,
      birthDate: schema.users.birthDate,
    }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1).then((r) => r[0]),
  ]);

  const held = awards.filter((a) => a.status === "held");
  const total = Math.round(held.reduce((s, a) => s + a.value, 0) * 100) / 100;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black">
            <Icon name="trophy" size={22} className="text-amber-300" /> Cash out
          </h1>
          <p className="mt-1 text-sm text-muted">
            Trophies you have won or bought, turned into real money. Four steps, and you can leave
            at any point — this page remembers where you were.
          </p>
        </div>
        <Link href="/wallet" className="ghost-btn shrink-0 rounded-full px-4 py-2 text-xs">
          Back to wallet
        </Link>
      </div>

      <RedeemStepper
        step={sp.step ?? ""}
        picked={(sp.t ?? "").split(",").filter(Boolean)}
        held={held}
        heldTotal={total}
        redeems={redeems}
        savedMethod={(me?.payoutMethod as { currency: string; method: string } | null) ?? null}
        changesUsed={Number(me?.payoutChanges ?? 0)}
        knownCountry={me?.country ?? null}
        knowsAge={!!me?.birthDate}
      />
    </div>
  );
}
