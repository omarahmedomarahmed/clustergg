// Terms, privacy and cookies. 04 §1 `/legal/*`.
//
// ===== WHAT A LEGAL PAGE MAY AND MAY NOT SAY HERE =====
//
// Same rule as `rules.ts`, and it matters more: a legal page is the one
// document somebody will hold us to word for word. So every figure is
// imported, and — the part that is easy to get wrong — **nothing here claims a
// capability the architecture cannot keep.**
//
// The worked example is the member list. It is tempting to write *"we cannot
// read your member list"*, which reads better and is false: the GUILD_MEMBERS
// intent is app-wide, one switch for every guild, so per-server consent is
// **our** gate and not Discord's. The sentence is *"we do not read this unless
// you ask us to"* (12 §7a). A promise the architecture cannot keep is worse
// than no promise, because it is the one somebody quotes back.
//
// The other half is house rule 5: we never store a payment detail, and this is
// where a person reads that we do not. It is true structurally — `02-structural`
// fails the build if a column appears that could hold one.

import { TROPHY_HOLD_YEARS } from "../money/amounts.ts";
import { DEFAULT_SANCTIONED } from "../identity/countries.ts";

export const LEGAL_PAGES = ["terms", "privacy", "cookies"] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];

export const LEGAL_TITLE: Record<LegalPage, string> = {
  terms: "Terms",
  privacy: "Privacy",
  cookies: "Cookies",
};

export function isLegalPage(slug: string): slug is LegalPage {
  return (LEGAL_PAGES as readonly string[]).includes(slug);
}

export type Section = { heading: string; body: string };

function terms(): Section[] {
  return [
    {
      heading: "What Cluster is",
      body:
        "Cluster runs automated gaming competitions inside Discord servers. We organise " +
        "nothing: there is no bracket, no schedule, no lobby, no stream and no referee. " +
        "The game's own API is what decides a score, and we read it.",
    },
    {
      heading: "Who may take part",
      body:
        "You must be 13 or over. If you tell us you are under 13 we delete the account " +
        "immediately and keep a one-way fingerprint of the answer, so the same person " +
        "cannot sign up again with a different one. That fingerprint is not readable as " +
        "an email address or a Discord ID and exists only to answer that one question.",
    },
    {
      heading: "Trophies and money",
      body:
        `A trophy is either worth money or it is a collectable, and which one it is ` +
        `never changes. We hold every trophy for ${TROPHY_HOLD_YEARS} years from the ` +
        `day it is awarded. If you are 13 to 17 you keep and hold trophies and cannot ` +
        `cash them out until you are 18 — the money is already set aside against your ` +
        `name and is waiting.`,
    },
    {
      heading: "Cashing out",
      body:
        "You must be 18 or over, have verified an email address, and be in a country we " +
        "are able to pay. A trophy that was never worth money cannot be cashed out. If " +
        "we cannot pay you, we say why rather than failing quietly.",
    },
    {
      heading: "One game account, one account",
      body:
        "A game account belongs to one Cluster account. Somebody who proves ownership " +
        "takes it from somebody who only claimed it, because otherwise claiming would " +
        "be a way to lock other people out.",
    },
    {
      heading: "Two accounts for one person",
      body:
        "You may end up with two accounts — one you made with Discord and one with an " +
        "email — and that is permanent and fine. They never merge, there is no support " +
        "path that combines them, and each passes every check on its own. They cannot " +
        "share a game account, which is what stops one person scoring twice.",
    },
    {
      heading: "If something goes wrong with a week",
      body:
        "If a game's API is unavailable we push the challenge to the next week with the " +
        "same entrants and every score reset, rather than deciding a week on data we " +
        "could not read. Nobody who has already been paid is asked for anything back.",
    },
    {
      heading: "Where we cannot operate",
      body:
        `We cannot offer payouts everywhere. Sanctioned countries are not offered in ` +
        `the country picker at all rather than being accepted and refused later, and ` +
        `there are currently ${DEFAULT_SANCTIONED.length} of them.`,
    },
  ];
}

function privacy(): Section[] {
  return [
    {
      heading: "What we hold about you",
      body:
        "A display name, an age band, a country, and whichever of a Discord ID or an " +
        "email address you signed up with. Your linked game accounts, and the stat " +
        "readings we take from the publisher's API while you are in a challenge. That " +
        "is the whole of it.",
    },
    {
      heading: "Your age",
      body:
        "We ask for an age band — 13 to 17, or 18 and over — and never a date of birth. " +
        "It is asked before anything else is stored, because we should not be holding " +
        "data about a child we have not asked about. You cannot change it yourself; " +
        "support can.",
    },
    {
      heading: "We never store a payment detail",
      body:
        "Not an IBAN, not a card number, not a last four, not a routing number. What we " +
        "store is a word for how you want to be paid and an opaque reference your " +
        "payment provider gave us. The database has nowhere to put anything else, and " +
        "our build fails if a column appears that could.",
    },
    {
      heading: "Discord member lists",
      body:
        "We do not read your server's member list unless its owner asks us to. Server " +
        "analytics is opt-in, per server, and every reading is stamped with the date and " +
        "time it was taken. Nothing in the weekly cycle reads one — not eligibility, not " +
        "a score, not the pool, not a payout — so no server can change what it earns by " +
        "pressing refresh.",
    },
    {
      heading: "What we never measure",
      body:
        "Nothing you do inside Discord. Not your messages, not your commands, not " +
        "whether you opened a card. Everything we score happened on our own platform or " +
        "inside the game.",
    },
    {
      heading: "Deleting your account",
      body:
        "You can, and we do. The one exception is while a payout is in flight: money " +
        "already handed to a payment provider cannot be sent to a record that no longer " +
        "exists, so we ask you to wait for it to land. A trophy you held stays accounted " +
        "for in our books after you go, because the money behind it was real.",
    },
  ];
}

function cookies(): Section[] {
  return [
    {
      heading: "What we set",
      body:
        "A session cookie that says which account you are signed in to, and a small " +
        "preference cookie remembering whether you started onboarding as a gamer or as a " +
        "server owner. Nothing else.",
    },
    {
      heading: "What we do not set",
      body:
        "No advertising cookie, no cross-site tracker, no third-party analytics tag. We " +
        "do not buy entrants with advertising — the public pool is how communities find " +
        "us — so there is nothing here to retarget you with.",
    },
    {
      heading: "The onboarding preference",
      body:
        "It is a cookie rather than a field on your account on purpose: you can be a " +
        "gamer and a server owner at the same time, and a stored answer would be a " +
        "claim that goes stale the moment you change your mind.",
    },
  ];
}

export function legalSections(page: LegalPage): Section[] {
  if (page === "terms") return terms();
  if (page === "privacy") return privacy();
  return cookies();
}
