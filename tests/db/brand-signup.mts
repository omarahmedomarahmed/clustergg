/**
 * B90.1 — a brand signing itself up.
 *
 * The assertions that matter are the ones about what a stranger's row can DO.
 * A public write that lands in the same table as a paying customer's is only
 * safe if the difference is enforced somewhere, and here that somewhere is one
 * column: `status`. So the test reads the delivery query's own filter rather
 * than trusting a comment about it.
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
const { getDb, schema } = await import("../../lib/db/index.ts");
const { uid } = await import("../../lib/utils.ts");
const { signUpBrand, isFreeMail } = await import("../../lib/brand-signup.ts");
const { eq: dEq } = await import("drizzle-orm");

const db = await getDb();
// Lowercased: emails are stored lowercased, so a mixed-case tag makes every
// lookup in this file miss its own row.
const tag = uid().slice(0, 6).toLowerCase();

console.log("== a signup lands, and lands pending ==");
{
  const r = await signUpBrand({ company: `Nova Drinks ${tag}`, email: `hi-${tag}@novadrinks.test` });
  ok("it succeeds", r.ok, JSON.stringify(r));
  if (!r.ok) throw new Error("nothing to test");

  const [row] = await db.select().from(schema.brands).where(dEq(schema.brands.id, r.brandId));
  eq("the brand is PENDING, not active", row.status, "pending");
  ok("…and it has a key", (row.accessKey ?? "").length >= 8, String(row.accessKey));
  ok("…and a slug that is a URL, not a name", /^[a-z0-9-]+$/.test(row.slug ?? ""), String(row.slug));
  eq("…and the contact email is stored lowercased", row.contactEmail, `hi-${tag}@novadrinks.test`);

  // The whole security posture, asserted against the code that enforces it
  // rather than against a comment. If somebody relaxes this filter, a stranger's
  // form submission starts serving impressions.
  const ads = readFileSync("lib/ads.ts", "utf8");
  ok("delivery serves ACTIVE brands only",
    /eq\(schema\.brands\.status,\s*"active"\)/.test(ads));
}

console.log("\n== two brands never share a portal URL ==");
{
  // The slug IS the portal URL. Two brands sharing one means the second one's
  // key opens the first one's portal — the worst outcome this file can have.
  const name = `Same Name ${tag}`;
  const a = await signUpBrand({ company: name, email: `a-${tag}@one.test` });
  const b = await signUpBrand({ company: name, email: `b-${tag}@two.test` });
  ok("both signups succeed", a.ok && b.ok, JSON.stringify([a, b]));
  if (a.ok && b.ok) {
    ok("…and the slugs differ", a.slug !== b.slug, `${a.slug} / ${b.slug}`);
    ok("…and so do the keys", a.key !== b.key);
  }
}

console.log("\n== one account per inbox ==");
{
  const email = `dupe-${tag}@studio.test`;
  const first = await signUpBrand({ company: `Studio ${tag}`, email });
  const second = await signUpBrand({ company: `Studio ${tag} Again`, email });
  ok("the first one works", first.ok);
  ok("the second is refused", !second.ok);
  // A refusal that says "taken" and stops is a dead end for somebody who simply
  // lost their key.
  ok("…and it says what to do instead",
    !second.ok && /resend|partners@/i.test(second.message), !second.ok ? second.message : "");
  const rows = await db.select({ id: schema.brands.id }).from(schema.brands)
    .where(dEq(schema.brands.contactEmail, email));
  eq("…and only one row exists", rows.length, 1);
}

console.log("\n== nonsense is refused, and says why ==");
{
  for (const [label, input] of [
    ["no company", { company: "  ", email: `x-${tag}@y.test` }],
    ["no email", { company: "Real Co", email: "" }],
    ["not an email", { company: "Real Co", email: "nope" }],
  ] as const) {
    const r = await signUpBrand(input);
    ok(`${label} is refused`, !r.ok);
    ok(`…and ${label} is explained`, !r.ok && r.message.length > 10, !r.ok ? r.message : "");
  }
}

console.log("\n== a free-mail address is a flag, not a rejection ==");
{
  // A real four-person games studio runs on Gmail. Refusing it turns away the
  // exact customer this flow exists for, and the check it looks like it is
  // doing — proving somebody works where they say — it does not do.
  const r = await signUpBrand({ company: `Indie ${tag}`, email: `indie-${tag}@gmail.com` });
  ok("gmail signs up fine", r.ok, JSON.stringify(r));
  ok("…and is flagged for the human who reviews it", isFreeMail(`indie-${tag}@gmail.com`));
  ok("…while a company domain is not", !isFreeMail("someone@novadrinks.test"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
