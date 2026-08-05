import Link from "next/link";
import Icon from "@/components/Icon";
import { getContent } from "@/lib/cms";
import { appId, installHref } from "@/lib/discord/config";
import { BOT_LISTS, BOT_LIST_CMS_KEYS, VOTE_COOLDOWN_HOURS, voteLinks } from "@/lib/botlists";
import { ACTION_CATALOG } from "@/lib/quests";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Vote for Cluster · earn Cluster Points",
  description:
    "Vote for the Cluster bot on the Discord bot lists and earn Cluster Points. One vote every twelve hours, on every list.",
};

// Where the "Vote for Cluster" button lands.
//
// One page rather than one button per list, for two reasons. Discord allows
// five buttons a row and the tail is already full, so four vote buttons would
// push navigation off the card. And the set of lists we're live on CHANGES —
// a page reads it at request time, while buttons baked into a card would go
// stale the moment a listing is approved.
//
// Only lists we are actually live on are shown. A page offering four links
// where two are 404s is worse than one offering two: somebody who clicks a dead
// link does not try the next one, they leave.

export default async function VotePage() {
  const id = appId();
  const statuses = await getContent(BOT_LIST_CMS_KEYS).catch(() => ({} as Record<string, string>));
  const links = voteLinks(id ?? "", statuses);
  const reward = ACTION_CATALOG.find((a) => a.key === "botlist_vote");

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="text-center">
        <div className="text-[11px] uppercase tracking-[0.25em] text-cyan-300">Two taps, twice a day</div>
        <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold text-ink">
          Vote for Cluster. Earn Cluster Points.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">
          Discord has no app store — the bot lists are how servers find us, and they rank by votes.
          Voting takes one tap, you can do it every {VOTE_COOLDOWN_HOURS} hours on each list, and every
          vote pays {reward ? <b className="text-ink">{reward.defaultWeight} CP</b> : "Cluster Points"} straight
          onto your profile.
        </p>
      </div>

      {links.length > 0 ? (
        <div className="mt-8 space-y-3">
          {links.map((l) => (
            <a
              key={l.id}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="glass pressable flex items-center justify-between gap-4 rounded-2xl p-5 transition-colors hover:border-cyan-400/40"
            >
              <span>
                <span className="block font-bold text-ink">{l.name}</span>
                <span className="block text-xs text-muted">
                  {BOT_LISTS.find((b) => b.id === l.id)?.site.replace("https://", "")}
                </span>
              </span>
              <span className="cta-btn shrink-0 rounded-full px-5 py-2 text-sm font-semibold">
                Vote
              </span>
            </a>
          ))}
        </div>
      ) : (
        // Honest about the state rather than showing an empty page or fake
        // links. Somebody who arrived here wants to help; tell them the other
        // way to.
        <div className="glass mt-8 rounded-2xl p-6 text-center">
          <Icon name="rocket" size={22} className="mx-auto text-violet-300" />
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Cluster isn&apos;t listed on the bot directories yet — we&apos;re in their review queues. The
            moment a listing goes live it appears here, and voting starts paying.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            The thing that helps most in the meantime is the bot being in more servers.
          </p>
          {installHref() && (
            <a href={installHref()!} className="cta-btn pressable mt-4 inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold">
              <Icon name="rocket" size={15} /> Add Cluster to your server
            </a>
          )}
        </div>
      )}

      <div className="glass mt-6 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-ink">How the points work</h2>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
          <li>
            <b className="text-ink">Sign in with Discord first.</b> The lists tell us who voted by their Discord
            account, so that&apos;s how the points find you. Vote without one and we&apos;ll message you rather
            than quietly keeping it.
          </li>
          <li>
            <b className="text-ink">Every {VOTE_COOLDOWN_HOURS} hours, per list.</b> Each list has its own
            cooldown, so voting on two lists pays twice.
          </li>
          <li>
            <b className="text-ink">The points are ordinary CP.</b> They count towards your level, your quests
            and your position on the boards — the same as everything else you earn.
          </li>
        </ul>
        <Link href="/quests" className="mt-3 inline-block text-xs text-cyan-300 hover:underline">
          What Cluster Points are for →
        </Link>
      </div>
    </div>
  );
}
