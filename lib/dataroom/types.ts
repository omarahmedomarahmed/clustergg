// The section vocabulary.
//
// A data room document is an ordered list of sections, each of a `kind` that
// picks its renderer. Anything a renderer needs beyond title/body lives in
// `data` as jsonb — so adding a section type never needs a migration, and an
// admin adding a fifth logo to a logo wall doesn't either.
//
// Kept free of server imports so the admin builder (a client component) can
// import the same definitions the renderer uses.

export type SectionKind =
  | "hero"        // the opening slide
  | "text"        // a written argument
  | "traction"    // live platform numbers
  | "milestones"  // the MAU ladder, with where we actually are
  | "gtm"         // go-to-market, stage by stage, clickable
  | "product"     // the live bot demo, or one named part of the product
  | "explainer"   // a wordless flow diagram: icons, one-word labels, arrows
  | "showcase"    // the real rendered product cards, at size, in a grid
  | "servers"     // the real servers running the bot
  | "logos"       // a logo wall
  | "gallery"     // an image gallery
  | "team"        // people, each opening a modal
  | "metrics"     // a chosen set of tracked metrics
  | "tiers"       // the server revenue ladder
  | "faq"         // questions with answers
  | "ad"          // the investor-doc ad placement, live
  | "contact";    // how to reach us

export const SECTION_KINDS: { kind: SectionKind; label: string; blurb: string; live?: boolean }[] = [
  { kind: "hero", label: "Hero", blurb: "The opening slide: one line on what the company is, over full-bleed art." },
  { kind: "text", label: "Written section", blurb: "A heading, a paragraph or two, and optional bullet points." },
  { kind: "traction", label: "Live traction", blurb: "Servers, reach, linked accounts, interactions — read fresh on every load.", live: true },
  { kind: "milestones", label: "Milestone ladder", blurb: "Targets with the real current number against them. Grows as you grow.", live: true },
  { kind: "gtm", label: "Go-to-market", blurb: "Stages you can click through, with the current one marked." },
  { kind: "product", label: "Live product", blurb: "The real bot, playable in the page. Optionally scoped to one part of it.", live: true },
  { kind: "explainer", label: "Graphic explainer", blurb: "A flow diagram — icons and one-word labels, no paragraphs. For explaining a mechanic visually.", },
  { kind: "showcase", label: "Product showcase", blurb: "The actual cards the product renders, at full size, live. Nothing here is a mockup.", live: true },
  { kind: "servers", label: "Connected servers", blurb: "The actual communities running the bot, with their member counts.", live: true },
  { kind: "logos", label: "Logo wall", blurb: "Partners, investors, integrations — a row of logos with names." },
  { kind: "gallery", label: "Image gallery", blurb: "Screenshots or art, in a grid, each opening full size." },
  { kind: "team", label: "Team", blurb: "People, each opening a modal with their bio, past companies and contact." },
  { kind: "metrics", label: "Chosen metrics", blurb: "Pick from everything the platform tracks; the numbers stay live.", live: true },
  { kind: "tiers", label: "Server revenue ladder", blurb: "The tier ladder servers climb, straight from the product." },
  { kind: "faq", label: "FAQ", blurb: "Questions with answers, collapsed until asked." },
  { kind: "ad", label: "Ad placement", blurb: "The live investor-doc ad slot — shows a partner exactly what they'd buy.", live: true },
  { kind: "contact", label: "Contact", blurb: "Email, a note, and a button." },
];

// The shapes each renderer reads out of `data`. Every field is optional: a
// half-configured section renders what it has rather than breaking the page.
export type SectionData = {
  // hero
  badge?: string;
  ctaLabel?: string;
  ctaHref?: string;

  // text
  bullets?: string[];

  // milestones — targets in order; the live number decides which is current.
  targets?: number[];
  metric?: "reach" | "linked" | "gamers" | "servers";

  // gtm
  stages?: {
    name: string;
    status?: "done" | "current" | "next";
    summary?: string;
    detail?: string;
    bullets?: string[];
  }[];

  // product — which part of the product to show
  focus?: "bot" | "profile" | "challenges" | "leaderboards" | "quests" | "portal";

  // explainer — a wordless flow. Labels are short by contract, not by
  // convention: the whole point of this section is that it cannot become prose.
  steps?: { icon: string; label: string; note?: string }[];
  /** Draw the flow as a loop rather than a line — for mechanics that repeat. */
  loop?: boolean;

  // showcase — which rendered cards to show. These are the real PNGs the
  // product draws, requested live, so a deck can never show a stale mockup.
  cards?: { kind: string; caption?: string }[];

  // logos
  logos?: { name: string; logoUrl?: string | null; url?: string | null; note?: string }[];

  // gallery
  images?: { url: string; caption?: string }[];

  // metrics — keys from lib/admin-metrics
  metricKeys?: string[];

  // faq
  qa?: { q: string; a: string }[];

  // ad
  placement?: string;

  // any renderer: an optional link out
  linkLabel?: string;
  linkHref?: string;
};

export type Section = {
  id: string;
  docId: string;
  kind: SectionKind;
  anchor: string;
  navLabel: string;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  bgUrl: string | null;
  dim: number;
  data: SectionData;
  sortOrder: number;
  isVisible: boolean;
};

export type Person = {
  id: string;
  docId: string | null;
  name: string;
  role: string;
  bio: string | null;
  avatarUrl: string | null;
  email: string | null;
  linkedin: string | null;
  x: string | null;
  logos: { name: string; logoUrl?: string | null; url?: string | null }[];
  sortOrder: number;
  isVisible: boolean;
};

export type Doc = {
  id: string;
  slug: string;
  kind: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  coverUrl: string | null;
  accent: string;
  accent2: string;
  accessKey: string | null;
  isPublished: boolean;
  contactEmail: string | null;
  contactNote: string | null;
  sortOrder: number;
};

// The one ad placement both documents share, so a partner reading either sees
// the same live slot they'd be buying.
export const INVESTOR_AD_PLACEMENT = "investor-doc-ad-placement";
