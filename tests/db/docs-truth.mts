// The documents describe the product that exists. B112.
//
// ===== WHY THIS SUITE EXISTS =====
//
// Twice, a wrong statement about the product was written into copy and into the
// plan, by the same mechanism both times:
//
//   1. "Brands are billed on impressions." They are billed a fixed price per
//      challenge. It reached the COOKIE POLICY — legal copy — before the owner
//      caught it.
//   2. "Following, messaging and gifting stay." Gifting was deleted in B72.3
//      for money-transmission reasons. It reached the dev log and a pushed
//      commit message.
//
// Neither was a typo. **The code was right both times.** Both came from reading
// a document written before the change and repeating it as fact. The old plan
// folder was full of documents like that; it has been deleted, which removes
// the commonest source of the error without removing the error itself — a live
// doc goes stale the same way, just more quietly.
//
// `tests/db/marketing-truth.mts` guards the public pages. `dataroom-truth.mts`
// guards the deck. Nothing guarded the documents an engineer — or a model —
// actually reads before writing either of them. This is that.
//
//   DEMO_DB=1 npx tsx tests/db/docs-truth.mts

process.env.DEMO_DB = "1";

import { readFileSync, existsSync, readdirSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

const at = (p: string) => new URL(`../../${p}`, import.meta.url);
const read = (p: string) => readFileSync(at(p), "utf8");

const { RETIRED, LIVE_DOCS, RETIRED_QUOTE, NOT_A_MENTION } = await import("../../lib/retired.ts");

/** A mention is excused only by its OWN line, or by an explicit quote marker above it. */
const excused = (lines: string[], i: number, cleared: string[]) => {
  const line = lines[i].toLowerCase();
  if (cleared.some((c) => line.includes(c.toLowerCase()))) return true;
  // The marker may sit on the line or immediately above it, so a quoted block
  // does not need the comment inside every line of the quote.
  return [lines[i], lines[i - 1] ?? "", lines[i - 2] ?? ""].some((l) => l.includes(RETIRED_QUOTE));
};

console.log("== every retired feature is still retired in the code ==");
{
  // The registry is only worth trusting if its claims are checkable. An entry
  // whose evidence file stopped saying what the entry claims is an entry that
  // has drifted — which would make this whole suite guard a fiction.
  for (const r of RETIRED) {
    ok(`${r.what}: the evidence file exists`, existsSync(at(r.evidence)), r.evidence);
    ok(`…and still says so`, read(r.evidence).includes(r.evidenceSays),
      `${r.evidence} no longer contains "${r.evidenceSays}"`);
    ok(`…and the entry says WHY`, r.why.length > 40,
      "an entry with no reason is an entry somebody reverses");
  }
  ok("there is more than one entry", RETIRED.length >= 4, String(RETIRED.length));
}

console.log("\n== no live document claims a retired feature exists ==");
{
  for (const doc of LIVE_DOCS) {
    if (!existsSync(at(doc))) { ok(`${doc} exists`, false); continue; }
    const lines = read(doc).split("\n");
    const bad: string[] = [];

    for (const r of RETIRED) {
      const re = new RegExp(r.pattern, "i");
      lines.forEach((line, i) => {
        const stripped = line.replace(NOT_A_MENTION, " ");
        if (!re.test(stripped)) return;
        if (excused(lines, i, r.cleared)) return;
        bad.push(`${doc}:${i + 1} [${r.what}] ${line.trim().slice(0, 80)}`);
      });
    }
    ok(`${doc} never mentions a retired feature without saying it is gone`,
      bad.length === 0, bad.slice(0, 3).join(" | "));
  }
}

console.log("\n== no page offers a retired feature to a customer ==");
{
  // B118. The documents were guarded; the PRODUCT was not.
  //
  // `/marketplace` was still telling gamers a trophy could be "a gift to
  // another gamer", in the page description Google indexes and in the header
  // copy on the page itself. Gifting was deleted in B72.3 for
  // money-transmission reasons. Nothing checked, because this suite only ever
  // read `docs/`.
  //
  // A stale document misleads whoever reads it. A stale PAGE offers a customer
  // something we will not do, which is the worse of the two, so the same rule
  // now runs over every rendered surface.
  //
  // Comments are stripped first, and that is the whole reason this is
  // survivable: `lib/discord/screens.ts` and `app/actions/social.ts` carry long
  // notes naming what went and why, and those notes are what stop somebody
  // rebuilding it. Failing the suite for explaining a deletion would delete the
  // explanation.
  const { readdirSync: rd, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const root = new URL("../../", import.meta.url).pathname;

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of rd(join(root, dir))) {
      if (e.startsWith(".") || e === "node_modules") continue;
      const rel = join(dir, e);
      if (statSync(join(root, rel)).isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(e)) files.push(rel);
    }
  };
  for (const d of ["app", "components"]) walk(d);

  // Comments blanked, NEWLINES KEPT. Collapsing a block comment to one space
  // shifts every line number after it, and a failure that points at the wrong
  // line is a failure somebody spends ten minutes disbelieving.
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  const stripCode = (src: string) =>
    src.replace(/\{\/\*[\s\S]*?\*\/\}/g, blank)
       .replace(/\/\*[\s\S]*?\*\//g, blank)
       .replace(/^\s*\/\/.*$/gm, blank);

  const bad: string[] = [];
  for (const f of files) {
    const raw = read(f).split("\n");
    const code = stripCode(read(f)).split("\n");
    for (const r of RETIRED) {
      const re = new RegExp(r.pattern, "i");
      code.forEach((line, i) => {
        if (!re.test(line.replace(NOT_A_MENTION, " "))) return;
        // The MENTION is looked for in the stripped line; the CLEARING is
        // looked for in the raw one, at the same index. That keeps the
        // same-line rule that `CLEAR_SAME_LINE` exists to enforce while
        // letting a trailing `/* retired */` do the clearing — which is the
        // only way to annotate a line of JSX without inventing a prop.
        if (r.cleared.some((c) => raw[i].toLowerCase().includes(c.toLowerCase()))) return;
        bad.push(`${f}:${i + 1} [${r.what}] ${line.trim().slice(0, 70)}`);
      });
    }
  }
  ok("no rendered surface offers a retired feature", bad.length === 0,
    bad.slice(0, 5).join(" | "));
}

console.log("\n== there is no history folder to mistake for the product ==");
{
  // `docs/legacy/` held thirteen documents describing the platform before the
  // pivots, each behind a warning banner. Banners are a weaker guard than
  // deletion: they rely on somebody reading before quoting, and the gifting
  // error came from exactly that not happening.
  //
  // The folder is gone. A fresh session opening this repo now finds only what
  // is true, which is the entire point — there is nothing left to misread.
  ok("the legacy folder is deleted, not merely banner-ed",
    !existsSync(at("docs/legacy")),
    "a stale document behind a warning is still a stale document somebody will quote");

  // The ONE thing in there worth keeping was the delivery definition, because
  // the commitment in it is still ours. It moved rather than died.
  ok("…but the delivery definition survived the purge", existsSync(at("docs/DELIVERY.md")));
  const delivery = read("docs/DELIVERY.md");
  ok("…and it no longer carries a legacy banner", !delivery.includes("LEGACY-BANNER"));
  ok("…and still refuses to multiply a post by an audience estimate",
    /do not multiply a public post/i.test(delivery),
    "that refusal is why a brand can believe the number");

  // Nothing may point at the folder that no longer exists.
  const dead: string[] = [];
  for (const f of ["README.md", "docs/SOURCE_OF_TRUTH.md", "docs/ARCHITECTURE.md", "docs/OPERATIONS.md"]) {
    if (read(f).includes("docs/legacy")) dead.push(f);
  }
  ok("…and nothing still points at it", dead.length === 0, dead.join(", "));
}

console.log("\n== the two known-wrong claims, by name ==");
{
  // Belt and braces. The generic rule above should catch these; these assert
  // the specific sentences that actually shipped can never come back.
  // Same paragraph window as the generic rule. A flagged QUOTE of a dated
  // document is allowed — B111's entry quotes B68's brief on purpose, with the
  // correction directly beneath it — and an unflagged assertion is not.
  const SHIPPED_WRONG = [
    {
      label: "brands pay per impression",
      re: /brands?\s+(?:are\s+)?(?:pay|billed|charged)[^.\n]{0,40}(?:per\s+impression|impressions|CPM)/i,
      why: "the invoice line is quantity: challenges × unitAmount: challengePrice",
    },
    {
      label: "gifting listed as a live feature",
      re: /(?:following|messaging)[^.\n]{0,30}\bgifting\b/i,
      why: "gifting was deleted in B72.3 — this is the exact sentence that shipped",
    },
  ];
  const CLEARS = /delet|retired|removed|gone|no longer|⚠|out of date|superseded|B72\.3|B104\.1|B111\.1|True when written/i;

  for (const doc of LIVE_DOCS.filter((d) => existsSync(at(d)))) {
    const lines = read(doc).split("\n");
    for (const s of SHIPPED_WRONG) {
      const bad: string[] = [];
      lines.forEach((line, i) => {
        if (!s.re.test(line)) return;
        const own = CLEARS.test(line);
        const quoted = [line, lines[i - 1] ?? "", lines[i - 2] ?? ""].some((l) => l.includes(RETIRED_QUOTE));
        if (!own && !quoted) bad.push(`${doc}:${i + 1}: ${line.trim().slice(0, 80)}`);
      });
      ok(`${doc}: ${s.label} — never unflagged`, bad.length === 0, `${bad.join(" | ")} — ${s.why}`);
    }
  }
}

console.log("\n== the pricing in the docs is not a second rate card ==");
{
  // B110 found the investor deck quoting $250 when the price was $350. The same
  // numbers had been copied into PAYMENTS.md.
  const { PRICING_DEFAULTS, money, perGame } = await import("../../lib/pricing.ts");
  const cfg = PRICING_DEFAULTS;
  const live = [cfg.challengePrice, cfg.prizePool, perGame(cfg)];
  for (const doc of ["docs/PAYMENTS.md", "docs/MODEL.md"]) {
    if (!existsSync(at(doc))) continue;
    const src = read(doc);
    for (const n of live) {
      ok(`${doc} does not restate ${money(n, cfg.currency)}`,
        !src.includes(money(n, cfg.currency)),
        "right today, wrong the day the price moves — point at lib/pricing.ts instead");
    }
    ok(`${doc} points at the source instead`,
      !/\$\d[\d,]*\s*(?:\/|per)\s*month/i.test(src) || /lib\/pricing\.ts/.test(src),
      "a document that quotes a rate is a rate we are held to by whoever read it");
  }
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
