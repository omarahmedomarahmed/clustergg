/**
 * B119 — the three guides, driven.
 *
 * ===== WHY THIS CANNOT BE A DB SUITE =====
 *
 * `tests/db/rules.mts` already checks the DATA: that every journey has enough
 * steps, that every helper line exists, that every link points at a route that
 * exists, that the money bar's shares equal the vault split. All of that is
 * static analysis and all of it passes against a component that renders nothing.
 *
 * What it cannot see is whether the guide WORKS. The journey is a rail with one
 * open step and two buttons that move it; the money bar is four buttons that
 * expand a note. Every one of those is a click, and a click is the thing that
 * breaks silently: a `useState` initialised past the end of the array, a button
 * that is disabled on the wrong index, a panel that opens behind the header.
 *
 * The specific failure worth naming: a step-through where "Next" does nothing
 * looks IDENTICAL in a screenshot to one that works. The reader just sees step
 * one and assumes that is the whole guide.
 *
 * So this drives it: walk every step of all three journeys, and assert the text
 * actually changed each time.
 *
 *   scripts/with-server.sh 3031 node tests/ui/rules-guide.mjs
 */
import { chromium } from "playwright-core";
import { open } from "./_nav.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3031";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  for (const who of ["gamer", "owner", "brand"]) {
    console.log(`\n== /rules/${who} ==`);
    await open(page, `${BASE}/rules/${who}`);

    const body = await page.locator("body").innerText();
    ok(`${who}: the page renders`, body.length > 400, `${body.length} chars`);

    // All three audiences reachable from every one of them. Somebody who lands
    // on the wrong guide has to be one click from the right one.
    for (const other of ["gamer", "owner", "brand"]) {
      ok(`${who}: links to /rules/${other}`,
        (await page.locator(`a[href="/rules/${other}"]`).count()) > 0);
    }

    // ===== The journey, walked end to end =====
    const counter = page.getByText(/^Step \d+ of \d+$/);
    ok(`${who}: the journey shows which step you are on`, (await counter.count()) > 0);
    const label = (await counter.first().innerText()).trim();
    const total = Number(label.split(" of ")[1]);
    ok(`${who}: …and it is a real count`, Number.isFinite(total) && total >= 5, label);

    const next = page.getByRole("button", { name: "Next step" });
    const back = page.getByRole("button", { name: "Back" });

    // On step one, Back must be dead and Next must not be. Getting this
    // backwards is the classic off-by-one and it strands the reader.
    ok(`${who}: Back is disabled on the first step`, await back.isDisabled());
    ok(`${who}: …and Next is not`, !(await next.isDisabled()));

    const seen = [];
    for (let i = 0; i < total; i++) {
      const heading = (await page.locator("section h3").first().innerText()).trim();
      seen.push(heading);
      if (i < total - 1) {
        await next.click();
        // The counter is the cheapest proof the state actually moved. Waiting
        // on it rather than sleeping means a component that renders slowly
        // still passes and one that never advances still fails.
        await page.waitForFunction(
          (n) => document.body.innerText.includes(`Step ${n} of`),
          i + 2,
          { timeout: 5000 },
        ).catch(() => {});
      }
    }

    ok(`${who}: every step opened`, seen.length === total, `${seen.length} of ${total}`);
    // THE ASSERTION THIS FILE EXISTS FOR. A rail where Next does nothing shows
    // the same heading `total` times and looks perfectly healthy otherwise.
    ok(`${who}: …and each one showed different content`,
      new Set(seen).size === total,
      `${new Set(seen).size} distinct of ${total}: ${seen.join(" | ")}`);

    ok(`${who}: Next is disabled on the last step`, await next.isDisabled());
    ok(`${who}: …and Back is not`, !(await back.isDisabled()));

    // ===== The money bar =====
    const flow = page.getByText("Where a brand's money goes");
    ok(`${who}: the split is drawn`, (await flow.count()) > 0);

    // Four shares, and their widths must be proportional to the percentages
    // rather than equal — an equal-width bar is the shape of a hardcoded
    // layout, and the whole argument is that the players' half LOOKS like half.
    const widths = await page.evaluate(() => {
      const h = [...document.querySelectorAll("h3")].find((el) => /money goes/i.test(el.textContent || ""));
      const bar = h?.parentElement?.querySelector("div.flex.h-12");
      return bar ? [...bar.children].map((c) => Math.round(c.getBoundingClientRect().width)) : [];
    });
    ok(`${who}: the bar has four shares`, widths.length === 4, JSON.stringify(widths));
    if (widths.length === 4) {
      const biggest = Math.max(...widths);
      const rest = widths.reduce((a, b) => a + b, 0) - biggest;
      ok(`${who}: …and the prize half is drawn as half`,
        Math.abs(biggest - rest) / (biggest + rest) < 0.08,
        JSON.stringify(widths));
    }

    // Tapping a share opens its note. This is the one interaction on the
    // diagram and it is invisible to any static check.
    const before = (await page.locator("body").innerText()).length;
    const share = page.getByRole("button", { name: /Points vault/ }).first();
    if (await share.count()) {
      await share.click();
      await page.waitForTimeout(150);
      const after = (await page.locator("body").innerText()).length;
      ok(`${who}: tapping a share explains it`, after > before, `${before} → ${after}`);
    } else {
      ok(`${who}: tapping a share explains it`, false, "no share button found");
    }

    // ===== The lifecycle, and the fine print underneath =====
    ok(`${who}: the challenge lifecycle is shown`,
      /What a challenge does, week by week/.test(body));
    ok(`${who}: …with both gates named`,
      /Announced/.test(body) && /Live/.test(body));

    // The diagrams are an ADDITION to the rules, never a replacement. A guide
    // that lost the fine print in a redesign is a guide that lost the promises.
    ok(`${who}: every rule is still on the page`,
      /Every rule, and why it exists/.test(body));
    ok(`${who}: …and the reasons came with them`,
      (await page.locator("div.glass p.font-semibold").count()) >= 5);
  }

  console.log("\n== the guides are reachable from the product ==");
  {
    // A guide nobody can find is a guide that does not exist. The footer
    // carries all three on every page.
    await open(page, `${BASE}/`);
    for (const who of ["gamer", "owner", "brand"]) {
      ok(`the homepage footer links /rules/${who}`,
        (await page.locator(`a[href="/rules/${who}"]`).count()) > 0);
    }
  }
} finally {
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
