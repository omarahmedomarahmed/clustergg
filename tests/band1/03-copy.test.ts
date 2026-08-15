// The copy guard.
//
// docs/09-TEST-PLAN.md, band 1: *"No page retypes a price, share, threshold or
// floor. No claim that an account is 'verified' unless proof exists. No
// audience group under 25."*
//
// This is the guard for the failure that produced the whole v3 branch: a
// document was found quoting an owner's withdrawal floor at **twice its real
// value**. It was not lying — it was a copy of a number that had moved, and
// nothing connected the two.
//
// So: walk the tree, and fail if a rendered surface contains a figure that
// belongs to a module. Walking rather than listing, because a guard with a
// hand-maintained file list only guards the files somebody remembered.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ok, eq } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import {
  CHALLENGE_PRICE_CENTS,
  DEFAULT_SPLIT_BPS,
  COMMUNITY_TIERS,
  MIN_AUDIENCE_GROUP,
  TROPHY_HOLD_YEARS,
  formatMoney,
} from "../../lib/money/amounts.ts";

const repoRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

/** Directories that render something a human reads. */
const SURFACES = ["app", "components", "lib/content"];

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.(ts|tsx|md)$/.test(entry.name)) out.push(full);
  }
  return out;
}

async function surfaceFiles(): Promise<{ file: string; src: string }[]> {
  const files: { file: string; src: string }[] = [];
  for (const dir of SURFACES) {
    for (const full of await walk(path.join(repoRoot, dir))) {
      files.push({
        file: path.relative(repoRoot, full),
        src: await fs.readFile(full, "utf8"),
      });
    }
  }
  return files;
}

test("the walk reaches the surfaces it is meant to guard", async () => {
  const files = await surfaceFiles();
  ok(files.length > 5, "several rendered files were found");
  ok(
    files.some((f) => f.file.endsWith("app/page.tsx")),
    "including the homepage, which is the one that matters most",
  );
  ok(
    files.some((f) => f.file.endsWith("lib/content/copy.ts")),
    "and the content store",
  );
});

test("no page retypes a price, a share or a threshold", async () => {
  // The figures the product decides. Each is searched for in the forms a
  // human would type it in — "$350", "350", "50%" — rather than as one string,
  // because the whole failure mode is somebody typing it differently.
  const figures: { what: string; patterns: RegExp[] }[] = [
    {
      what: `the challenge price (${formatMoney(CHALLENGE_PRICE_CENTS)})`,
      patterns: [/\$\s?350\b/, /\b350 dollars\b/i],
    },
    {
      what: `the prize share (${DEFAULT_SPLIT_BPS.prize / 100}%)`,
      patterns: [/\b50\s?%\s*(of|to|goes|share)/i, /\bhalf of (the )?income\b/i],
    },
    {
      what: `the server share (${DEFAULT_SPLIT_BPS.server / 100}%)`,
      patterns: [/\b25\s?%\s*(of|to|goes|share)/i],
    },
    {
      what: `community tier prices (${formatMoney(COMMUNITY_TIERS[1].prizeCents)} / ${formatMoney(COMMUNITY_TIERS[2].prizeCents)})`,
      patterns: [/\$\s?5\b(?!\d)/, /\$\s?10\.50\b/],
    },
    {
      what: `the trophy hold (${TROPHY_HOLD_YEARS} years)`,
      patterns: [/\bfive years\b/i, /\b5 years\b/i],
    },
  ];

  const offenders: string[] = [];
  for (const { file, src } of await surfaceFiles()) {
    // Comments explain the rules and must be able to name them. It is the
    // rendered text that may not.
    const rendered = src
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    for (const figure of figures) {
      if (figure.patterns.some((p) => p.test(rendered))) {
        offenders.push(`${file} states ${figure.what} instead of importing it`);
      }
    }
  }

  eq(
    offenders,
    [],
    "every figure on every page is imported from the module that enforces it — " +
      "a document quoting a floor at twice its real value is what this prevents",
  );
});

test("nothing claims an account is verified without proof", async () => {
  // C5. `verified: true` with method `exists` means the account is real, not
  // that this person owns it — so no rendered surface may say "verified" of an
  // account without checking `isProven`.
  const offenders: string[] = [];
  for (const { file, src } of await surfaceFiles()) {
    const rendered = src
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    if (/verified account|account is verified|✓ verified/i.test(rendered)) {
      if (!/isProven/.test(src)) {
        offenders.push(file);
      }
    }
  }
  eq(offenders, [], "a surface calling an account verified must have checked proof");
});

test("no audience group smaller than the floor is described", async () => {
  // C6 — a count of three is three people somebody can name. The guard is that
  // the floor is imported rather than typed, and that it exists at all.
  ok(MIN_AUDIENCE_GROUP >= 25, "the floor is at least 25");

  const offenders: string[] = [];
  for (const { file, src } of await surfaceFiles()) {
    const rendered = src
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    // A hard-coded small-group threshold in a rendered surface.
    if (/\bat least (\d+) (people|members|gamers)\b/i.test(rendered)) {
      const n = Number(/\bat least (\d+)/i.exec(rendered)?.[1] ?? 0);
      if (n < MIN_AUDIENCE_GROUP) offenders.push(`${file}: at least ${n}`);
    }
  }
  eq(offenders, [], "no surface promises a group smaller than the floor");
});

test("the content defaults state no number the product decides", async () => {
  // C4 — a default must never state a number the product decides; it asks for
  // it. `COPY` is the defaults; `SAYS` is the sentences that take a figure.
  const src = await fs.readFile(path.join(repoRoot, "lib", "content", "copy.ts"), "utf8");
  const copyBlock = src.slice(src.indexOf("export const COPY"), src.indexOf("export const SAYS"));
  const rendered = copyBlock
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");

  const numbers = rendered.match(/\$\s?\d|\b\d+\s?%/g) ?? [];
  eq(numbers, [], "not one figure appears in a default — a default that cannot hold a number cannot go stale");
  ok(/SAYS/.test(src), "and the sentences that need one take it as a parameter");
});
