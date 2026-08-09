/**
 * B91.4 — what a customer just did, on a desk where somebody sees it.
 *
 * The assertions that matter are about NOISE. An alert stream is only read if
 * it is short: one alert per thing, never one per click, and a way to empty it
 * that puts a name on the clearing.
 */
process.env.DEMO_DB = "1";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { readFileSync } = await import("node:fs");
const { getDb } = await import("../../lib/db/index.ts");
const { uid } = await import("../../lib/utils.ts");
const { raiseAlert, openAlerts, alertCounts, clearAlert, DESKS } = await import("../../lib/staff-alerts.ts");
const { signUpBrand } = await import("../../lib/brand-signup.ts");

const db = await getDb();
const tag = uid().slice(0, 6).toLowerCase();

console.log("== a signup raises one, on the sales desk ==");
{
  const r = await signUpBrand({ company: `Alert Co ${tag}`, email: `alert-${tag}@x.test` });
  ok("the signup worked", r.ok, JSON.stringify(r));

  const sales = await openAlerts(db, "sales");
  const mine = sales.find((a) => a.refId === (r.ok ? r.brandId : ""));
  ok("an alert was raised for it", !!mine, JSON.stringify(sales.slice(0, 2)));
  eq("…on the sales desk", mine?.desk, "sales");
  ok("…naming the company", (mine?.title ?? "").includes(`Alert Co ${tag}`), mine?.title);
  // The alert has to say what state the account is in, or somebody approves a
  // brand they have not looked at because the alert made it sound routine.
  ok("…and saying it is pending until a human looks",
    /PENDING/i.test(mine?.body ?? ""), mine?.body);
  ok("…and linking to the brand", (mine?.href ?? "").includes("/admin/brands"), mine?.href);
}

console.log("\n== one thing, one alert ==");
{
  // A brand clicking into the campaign builder four times is one lead, not
  // four alerts, and a desk that gets four starts skimming.
  const ref = uid();
  for (let i = 0; i < 4; i++) {
    await raiseAlert(db, {
      kind: "brand.campaign_built", desk: "sales",
      title: `Someone built a campaign ${tag}`, refType: "campaign", refId: ref, once: true,
    });
  }
  const rows = (await openAlerts(db, "sales", 200)).filter((a) => a.refId === ref);
  eq("four raises, one row", rows.length, 1);

  // …and `once` is opt-in. Two payments on the same invoice are two events.
  const ref2 = uid();
  await raiseAlert(db, { kind: "server.charge", desk: "ops", title: `Charge A ${tag}`, refId: ref2 });
  await raiseAlert(db, { kind: "server.charge", desk: "ops", title: `Charge B ${tag}`, refId: ref2 });
  eq("without `once`, both are kept",
    (await openAlerts(db, "ops", 200)).filter((a) => a.refId === ref2).length, 2);
}

console.log("\n== clearing puts a name on it ==");
{
  const ref = uid();
  await raiseAlert(db, { kind: "test.clear", desk: "money", title: `Clear me ${tag}`, refId: ref });
  const before = (await openAlerts(db, "money", 200)).find((a) => a.refId === ref);
  ok("it is open", !!before);

  await clearAlert(db, before!.id, "staff-1");
  const after = (await openAlerts(db, "money", 200)).find((a) => a.refId === ref);
  ok("…and cleared it is gone from the list", !after);

  // Anonymous clearing is how two people both ignore something, each assuming
  // the other has it.
  const src = readFileSync("app/actions/alerts.ts", "utf8");
  ok("the action attributes the clear to the person who pressed it",
    /clearAlert\(db, id, access\.user\.id\)/.test(src));
}

console.log("\n== the counts are per desk, for the badge ==");
{
  const counts = await alertCounts(db);
  ok("sales has some", Number(counts.sales ?? 0) > 0, JSON.stringify(counts));
  ok("every desk explains what belongs on it",
    Object.values(DESKS).every((d) => d.blurb.length > 30));
}

console.log("\n== an alert never breaks the thing it is about ==");
{
  // The whole file is wrapped, and it has to stay wrapped: a signup that fails
  // because we could not tell ourselves about it is a customer lost to our own
  // bookkeeping.
  const src = readFileSync("lib/staff-alerts.ts", "utf8");
  const raise = src.slice(src.indexOf("export async function raiseAlert"));
  ok("raising is wrapped in a catch", /catch\s*{/.test(raise.slice(0, 1400)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
