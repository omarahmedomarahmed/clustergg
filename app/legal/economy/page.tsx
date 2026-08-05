import Link from "next/link";
import { MIN_REDEEM_AGE, BLOCKED_COUNTRIES, US_REPORT_THRESHOLD } from "@/lib/eligibility";
import { DEFAULT_CP_PER_DOLLAR } from "@/lib/marketplace";
import { DEFAULT_DAILY_CP_CEILING } from "@/lib/quests";

export const metadata = {
  title: "Economy terms · Cluster",
  description:
    "What a Cluster Point is, what a trophy is, how redemption works, who can be paid, and what happens if we change the rate.",
};

/**
 * The economy, written down (B37).
 *
 * Separate from the site terms on purpose. The site terms are about using a
 * website; this is about **money**, and the person reading it is usually reading
 * it because they are about to be paid or have just been refused. Burying that
 * in clause 14 of a general agreement is how you get a support ticket that is
 * really a complaint.
 *
 * Every number on this page is imported from the code that enforces it. A terms
 * page that states a rate the product does not use is worse than no page — it is
 * a promise we are already breaking.
 *
 * ⚠ **Not legal advice, and not reviewed by counsel.** This is the product's
 * position written plainly so a lawyer has something concrete to correct.
 */
export default function EconomyTermsPage() {
  const blocked = Object.values(BLOCKED_COUNTRIES).sort();

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose-cosmic">
      <h1 className="text-3xl font-bold">Economy terms</h1>
      <p>Last updated: August 2026. These sit alongside our <Link href="/legal/terms">Terms of Service</Link> and cover
        one thing only: Cluster Points, trophies, and money.</p>

      <h2>What a Cluster Point is</h2>
      <p>
        A Cluster Point (CP) is a score inside Cluster. It is <b>not property, not currency, and not transferable
        outside the platform</b>. You cannot sell points, buy points, or move them to another account. They have no
        cash value in themselves — the only route from points to money is buying a trophy and redeeming that trophy,
        described below.
      </p>
      <p>
        Points are earned free, by playing. Every action that pays states its daily limit before you do it, and there
        is a hard ceiling of <b>{DEFAULT_DAILY_CP_CEILING.toLocaleString()} CP per day</b> across everything.
      </p>

      <h2>What a trophy is</h2>
      <p>
        A trophy is an item on your profile. Some carry a stated cash value. A trophy you <b>won</b> in a challenge and
        a trophy you <b>bought</b> with points behave identically — including when you redeem one.
      </p>
      <p>
        The current rate is <b>{DEFAULT_CP_PER_DOLLAR.toLocaleString()} CP = $1</b> of trophy value.
      </p>

      <h2>Redemption</h2>
      <p>
        Redeeming converts trophies you hold into a payment. You choose where the money lands on our payout partner&apos;s
        own page — <b>we never see or store your bank, card, or wallet details</b>. We hold a payment
        <i> preference</i> (a word like &ldquo;bank transfer&rdquo;) and an opaque reference from the provider, and
        nothing else.
      </p>
      <p>
        Redemption requests are reviewed before they are paid. We may refuse or reverse a request where a trophy was
        obtained through manipulation, and we will say which.
      </p>

      <h2>Who can be paid</h2>
      <ul>
        <li>
          <b>You must be at least {MIN_REDEEM_AGE}.</b> Playing has no age gate; being paid does, because a payment is
          a contract. Under {MIN_REDEEM_AGE} you keep earning points and holding trophies — they do not expire — and
          you can redeem them when you reach {MIN_REDEEM_AGE}.
        </li>
        <li>
          <b>We need the country you live in</b>, because it decides which payout methods exist for you.
        </li>
        <li>
          <b>Some countries we cannot pay into at all</b> — currently {blocked.join(", ")}. Our payout partner will not
          process payments there. We refuse these <i>before</i> you commit trophies to a request, so nothing of yours
          gets stuck in one that cannot complete. You keep the trophies.
        </li>
      </ul>

      <h2>Tax</h2>
      <p>
        When we redeem a trophy we are paying you. <b>What you owe on that is between you and your tax authority</b> —
        we do not withhold and we do not advise. We keep a per-recipient annual total and will provide yours on
        request. In the United States, payments of{" "}
        <b>${US_REPORT_THRESHOLD.toLocaleString()} or more in a calendar year</b> are the point at which information
        reporting typically begins; if that applies to you we may need your tax details before paying further.
      </p>

      <h2>If we change the rate</h2>
      <p>
        We may change what a Cluster Point is worth. If we do, and it would reduce what an existing balance can buy,
        <b> we will adjust existing balances so their value is unchanged</b>, and record it in your points history so
        you can see it happened. We will not quietly devalue points you have already earned.
      </p>

      <h2>Manipulation</h2>
      <p>
        We may suspend an account and void its points and trophies where they were obtained by manipulation — multiple
        accounts held by one person, fake or automated activity, win-trading, account sharing, or manufactured server
        membership. Where the manipulation is a server&apos;s rather than a gamer&apos;s, the server&apos;s revenue
        share is what stops, and gamers who played honestly keep everything they won.
      </p>
      <p>
        We hold a server&apos;s first payout for a period after it reaches a paying tier, so that growth can be looked
        at before money leaves. Payments already sent cannot be recalled, which is why the delay exists.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We will post material changes here with a new date. Continuing to use Cluster after that is acceptance.
      </p>

      <p className="text-sm opacity-70">
        Questions about any of this: <a href="mailto:support@clustergg.com">support@clustergg.com</a>.
      </p>
    </div>
  );
}
