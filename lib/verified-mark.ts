// The check mark beside a name. B96.
//
// ===== A MARK, NOT A LABEL =====
//
// Every gamer who finishes onboarding has told us two things: that they can read
// an inbox we sent a code to, and roughly how old they are. Both are worth
// showing — the first is what makes a leaderboard mean anything, and the second
// is what tells a stranger in a Discord server who they are talking to.
//
// What we do NOT do is write it out. "18+" beside somebody's name on a public
// profile is an age disclosure attached to a gaming handle, and it is a worse
// idea the younger the person is: a badge reading "13–17" on a public card is a
// flag for exactly the people you would least like reading it.
//
// So it is a CHECK MARK, and the colour carries the rest:
//
//   gold      confirmed, 18 or over
//   cyan      confirmed, and under 18
//
// Somebody who knows the scheme can read it. Somebody who does not sees a
// verified gamer, which is true and is the more important half. And the tooltip
// says "Confirmed account", never a number.
//
// ===== IT IS HIDEABLE, AND THAT IS DELIBERATE =====
//
// Any mark that distinguishes minors from adults is information a minor may not
// want on their profile, and the right answer to "should this be visible" is
// theirs and not ours. `users.show_age_mark` defaults to true and one switch in
// settings turns it off everywhere at once — profile, cards, pills, the lot.
//
// Turning it off does not turn off the RULES. What somebody may redeem is
// decided by their band, always, and never by whether a tick is drawn.

export type MarkTone = "gold" | "cyan";

export type VerifiedMark = {
  tone: MarkTone;
  /** What a hover says. Never an age, never a range. */
  title: string;
  /** Hex, so a canvas card and a DOM node draw the same colour. */
  color: string;
};

const MARKS: Record<MarkTone, VerifiedMark> = {
  gold: { tone: "gold", title: "Confirmed account", color: "#fbbf24" },
  cyan: { tone: "cyan", title: "Confirmed account", color: "#22d3ee" },
};

/**
 * Should this account show a mark, and which one?
 *
 * Returns null for anybody who has not finished onboarding, and for anybody who
 * has switched it off. Null means "draw nothing" — never a grey placeholder,
 * because a placeholder is itself a disclosure ("this one has something to
 * hide") and would defeat the switch entirely.
 */
export function markFor(u: {
  ageBand?: string | null;
  unlockedAt?: Date | string | null;
  showAgeMark?: boolean | null;
}): VerifiedMark | null {
  if (!u.unlockedAt) return null;
  if (u.showAgeMark === false) return null;
  if (u.ageBand === "adult") return MARKS.gold;
  if (u.ageBand === "teen") return MARKS.cyan;
  // Every other stored band (B72.4's `under16`) earns nothing and redeems
  // nothing, so there is no confirmed status to show.
  return null;
}
