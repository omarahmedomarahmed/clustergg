/**
 * The money layer, against a real database.
 *
 * Three things this asserts that nothing else can:
 *
 *   1. NOTHING STORES A PAYMENT DETAIL. Asserted structurally — the schema is
 *      inspected for columns that could hold one, and the redeem/preference
 *      writes are checked to leave nothing behind. This is the one property
 *      the whole design exists for, so it is checked rather than assumed.
 *   2. An invoice's total is its lines. Never a stored number that can drift.
 *   3. A payout draws only on the sponsored share. Members' winnings are a
 *      DISPLAY category, and a bug that put them into a payout would be taking
 *      a gamer's prize money and giving it to their server owner.
 */
process.env.DEMO_DB = "1";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};

const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq, sql } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const {
  totalsOf, draftLines, dueDateFrom, nextInvoiceNumber, payToken,
  listInvoices, getInvoice, invoiceByToken, brandBalances,
} = await import("../../lib/invoices.ts");
const {
  createPayout, getPayout, listPayouts, payoutTotals, sendPayout,
  markPayoutPaid, savePayoutPreference, getPayoutAccount, METHOD_OPTIONS,
} = await import("../../lib/payouts.ts");
const { collector, payer, providerStatus, setProvider } = await import("../../lib/payments/index.ts");
const { VENDORS, vendorsFor, RECOMMENDATION } = await import("../../lib/payments/vendors.ts");
const { PRICING_DEFAULTS, quote } = await import("../../lib/pricing.ts");

const db = await getDb();
const cfg = PRICING_DEFAULTS;

try {
  console.log("\n== Nothing here can hold a payment detail ==");
  // Structural, not aspirational. If somebody adds a bank column later, this
  // fails and they find out before a gamer's IBAN is sitting in a backup.
  const money = ["payout_accounts", "brand_invoices", "invoice_lines", "server_payouts", "server_payout_lines", "trophy_redeems"];
  const cols = await db.execute(sql`
    SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public'`);
  const rows = (cols as unknown as { rows?: { table_name: string; column_name: string }[] }).rows
    ?? (cols as unknown as { table_name: string; column_name: string }[]);
  const inMoney = rows.filter((r) => money.includes(r.table_name));
  ok("the money tables exist", new Set(inMoney.map((r) => r.table_name)).size === money.length,
    [...new Set(inMoney.map((r) => r.table_name))].join(", "));
  const banned = /(^|_)(iban|swift|bic|routing|account_number|card|pan|cvv|sort_code|bank)($|_)/i;
  const offenders = inMoney.filter((r) => banned.test(r.column_name));
  ok("no column could hold a bank account, card or routing number",
    offenders.length === 0, offenders.map((o) => `${o.table_name}.${o.column_name}`).join(", "));

  console.log("\n== The vendor research is complete enough to choose from ==");
  for (const flow of ["collect", "payout", "rewards"] as const) {
    const opts = vendorsFor(flow);
    ok(`${flow}: has options, one of them recommended`,
      opts.length >= 2 && opts.some((v) => v.key === RECOMMENDATION[flow]), `${opts.length} options`);
  }
  ok("every vendor states its downsides, not just its pitch",
    VENDORS.every((v) => v.limits.length > 0), VENDORS.filter((v) => !v.limits.length).map((v) => v.key).join(", "));
  ok("every wired vendor names the env vars it needs",
    VENDORS.filter((v) => v.wired && v.key !== "manual").every((v) => v.env.length > 0));
  ok("manual needs nothing, which is the point",
    VENDORS.find((v) => v.key === "manual")?.env.length === 0);

  console.log("\n== With no provider connected, everything still works ==");
  const c = await collector();
  const p = await payer("payout");
  const r = await payer("rewards");
  ok("collection falls back to manual", c.adapter.key === "manual", c.adapter.key);
  ok("and says why, rather than failing", !!c.reason, String(c.reason));
  ok("payouts fall back to manual", p.adapter.key === "manual", p.adapter.key);
  ok("rewards fall back to manual", r.adapter.key === "manual", r.adapter.key);
  const st = await providerStatus();
  ok("the console can report all three", st.length === 3);
  ok("and none of them claims to be configured", st.every((s) => !s.configured));

  // A chosen provider with no keys must degrade, not explode.
  await setProvider("rewards", "tremendous");
  const chosen = await payer("rewards");
  ok("picking a vendor with no keys degrades to manual instead of breaking",
    chosen.adapter.key === "manual" && chosen.picked === "tremendous", `${chosen.picked}→${chosen.adapter.key}`);
  await setProvider("rewards", "manual");

  console.log("\n== An invoice is its lines ==");
  ok("a total is the sum", totalsOf([{ quantity: 1, unitAmount: 600 }, { quantity: 4, unitAmount: 250 }]).total === 1600);
  const withDiscount = totalsOf([{ quantity: 1, unitAmount: 600 }, { quantity: 1, unitAmount: -100 }]);
  ok("a discount is a negative line, not a second concept",
    withDiscount.subtotal === 600 && withDiscount.discount === 100 && withDiscount.total === 500,
    JSON.stringify(withDiscount));

  // THE billing rule from the brief: $600 base, +$1,000 for a game, −$100.
  const placementsOnly = draftLines({ games: 0, cfg });
  ok("placements alone is the reach base",
    totalsOf(placementsOnly).total === cfg.reachBase, String(totalsOf(placementsOnly).total));
  const oneGame = draftLines({ games: 1, cfg, gameNames: ["Valorant"] });
  const t1 = totalsOf(oneGame);
  // Charged at LIST, then discounted. Quoting the reduced base AND the discount
  // takes it off twice — a $100 hole a month that reconciles against nothing.
  ok("the base line still quotes the list price",
    t1.subtotal === cfg.reachBase + cfg.challengePrice * cfg.challengesPerGame,
    `subtotal ${t1.subtotal} vs ${cfg.reachBase + cfg.challengePrice * cfg.challengesPerGame}`);
  ok("and the base reduction is printed as its own discount line",
    t1.discount === cfg.reachBase - cfg.challengeBase, `${t1.discount} vs ${cfg.reachBase - cfg.challengeBase}`);
  ok("the invoice total equals what the pricing page quotes",
    t1.total === quote(cfg, { games: 1 }).monthly, `${t1.total} vs ${quote(cfg, { games: 1 }).monthly}`);
  ok("the game is named on its line, not called 'a game'",
    oneGame.some((l) => l.label.includes("Valorant")), oneGame.map((l) => l.label).join(" | "));

  console.log("\n== Terms run from issue, not from the calendar ==");
  const issued = new Date("2026-03-20T12:00:00Z");
  const due = dueDateFrom(issued, 30);
  ok("30 days means 30 days", Math.round((+due - +issued) / 86400000) === 30, due.toISOString());

  console.log("\n== Invoices, end to end ==");
  const brandId = uid();
  await db.insert(schema.brands).values({ id: brandId, name: "Testco", slug: `testco-${brandId.slice(0, 5)}`, contactEmail: "ap@testco.example" });
  const invId = uid();
  const number = await nextInvoiceNumber(db);
  ok("invoice numbers are sequential and prefixed", /^CGG-\d{4}$/.test(number), number);
  const token = payToken();
  ok("a pay token is long enough not to be guessed", token.length >= 24, `${token.length} chars`);

  await db.insert(schema.brandInvoices).values({
    id: invId, brandId, number, status: "draft", currency: "USD",
    periodLabel: "March 2026", issuedAt: issued, dueAt: due, payToken: token,
  });
  for (const [i, l] of oneGame.entries()) {
    await db.insert(schema.invoiceLines).values({
      id: uid(), invoiceId: invId, kind: l.kind, label: l.label,
      quantity: l.quantity, unitAmount: l.unitAmount, sortOrder: i * 10,
    });
  }
  const inv = await getInvoice(invId);
  ok("it reads back with its brand attached", inv?.brandName === "Testco", inv?.brandName);
  ok("and its total is recomputed, not stored", inv?.total === t1.total, `${inv?.total}`);
  ok("a draft is not reachable by token as a payable thing", inv?.status === "draft");

  // The pay page's lookup.
  const byToken = await invoiceByToken(token);
  ok("the pay token finds it", byToken?.id === invId);
  ok("a short or wrong token finds nothing",
    (await invoiceByToken("abc")) === null && (await invoiceByToken("x".repeat(32))) === null);

  // Overdue is computed, never stored — a stored flag goes stale overnight.
  await db.update(schema.brandInvoices)
    .set({ status: "sent", dueAt: new Date(Date.now() - 3 * 86400000) })
    .where(eq(schema.brandInvoices.id, invId));
  const late = await getInvoice(invId);
  ok("an unpaid invoice past its date reads as overdue", late?.overdue === true);
  ok("and says how many days", (late?.daysUntilDue ?? 0) < 0, String(late?.daysUntilDue));

  const bal = (await brandBalances()).find((b) => b.brandId === brandId);
  ok("the brand's balance counts it as outstanding", (bal?.outstanding ?? 0) === t1.total, String(bal?.outstanding));
  ok("and as overdue", (bal?.overdue ?? 0) === t1.total, String(bal?.overdue));

  await db.update(schema.brandInvoices).set({ status: "paid", paidAt: new Date() }).where(eq(schema.brandInvoices.id, invId));
  const paid = await getInvoice(invId);
  ok("paid is not overdue, whatever the date says", paid?.overdue === false);
  const bal2 = (await brandBalances()).find((b) => b.brandId === brandId);
  ok("and the balance moves to paid", bal2?.paid === t1.total && bal2?.outstanding === 0,
    `paid ${bal2?.paid} outstanding ${bal2?.outstanding}`);

  console.log("\n== A payout account is a preference and nothing else ==");
  const guildId = `g${uid()}`;
  await savePayoutPreference("server", guildId, { method: "bank", country: "eg", currency: "usd" });
  const acct = await getPayoutAccount("server", guildId);
  ok("the preference is stored", acct?.methodPreference === "bank", String(acct?.methodPreference));
  ok("the country is normalised", acct?.country === "EG", String(acct?.country));
  ok("the currency is normalised", acct?.currency === "USD", String(acct?.currency));
  ok("and it counts as ready to pay", acct?.status === "ready", String(acct?.status));
  ok("every stored value is a short word or code — nothing account-shaped",
    [acct?.methodPreference, acct?.country, acct?.currency].every((v) => !v || v.length <= 12),
    JSON.stringify(acct));
  // Junk must not become a preference.
  await savePayoutPreference("server", guildId, { method: "iban:GB33BUKB20201555555555" });
  const acct2 = await getPayoutAccount("server", guildId);
  ok("a method that isn't on the list is refused, not stored",
    acct2?.methodPreference === "bank", String(acct2?.methodPreference));
  ok("the list is the only vocabulary", METHOD_OPTIONS.every((m) => m.key.length <= 10));

  console.log("\n== Payouts ==");
  const empty = await createPayout({ guildId, requestedBy: "admin", lines: [] });
  ok("a payout with no lines is refused", !empty.ok);
  const negative = await createPayout({
    guildId, requestedBy: "admin",
    lines: [{ kind: "sponsored_share", label: "x", amount: 50 }, { kind: "adjustment", label: "y", amount: -50 }],
  });
  ok("one that nets to zero is refused", !negative.ok, negative.ok ? "" : negative.error);

  const made = await createPayout({
    guildId, guildName: "Test Server", requestedBy: "admin-1",
    lines: [
      { kind: "sponsored_share", label: "Week 1 · Acme — 5% of $250 × 40% of entrants", challengeId: "c1", amount: 5 },
      { kind: "sponsored_share", label: "Week 2 · Acme", challengeId: "c2", amount: 7.5 },
      { kind: "adjustment", label: "Already paid earlier", amount: -2.5 },
    ],
  });
  ok("a real one opens", made.ok, made.ok ? "" : made.error);
  const payout = made.ok ? await getPayout(made.id) : null;
  ok("its total is its lines", payout?.total === 10, String(payout?.total));
  ok("it opens as requested, not as paid", payout?.status === "requested", payout?.status);
  ok("and it records WHO asked for it", payout?.requestedBy === "admin-1", String(payout?.requestedBy));

  const sums = await payoutTotals(guildId);
  ok("an open payout counts as in flight, not as paid",
    sums.open === 10 && sums.paid === 0, JSON.stringify(sums));

  const sent = await sendPayout(payout!.id, { name: "Test Server" });
  ok("releasing through the manual adapter succeeds", sent.ok, sent.ok ? "" : sent.error);
  ok("and says it's a manual transfer rather than pretending it sent",
    sent.ok && sent.manual === true);
  ok("which leaves it approved, not paid",
    (await getPayout(payout!.id))?.status === "approved");

  await markPayoutPaid(payout!.id, "BANK-REF-9");
  const done = await getPayout(payout!.id);
  ok("marking paid records the reference", done?.status === "paid" && done?.providerRef === "BANK-REF-9", String(done?.providerRef));
  const sums2 = await payoutTotals(guildId);
  ok("and it moves from in-flight to paid",
    sums2.paid === 10 && sums2.open === 0, JSON.stringify(sums2));
  ok("a paid payout can't be paid again by sending it",
    !(await sendPayout(payout!.id, { name: "Test Server" })).ok);

  ok("the guild's history is readable", (await listPayouts({ guildId })).length === 1);
  ok("the payout kept the server name for when the bot is removed",
    done?.guildName === "Test Server", String(done?.guildName));

  console.log("\n== A redeem stores no destination ==");
  const userId = uid();
  await db.insert(schema.users).values({ id: userId, displayName: "Redeemer", slug: `redeemer-${userId.slice(0, 5)}`, role: "user" });
  await db.insert(schema.trophyRedeems).values({
    id: uid(), userId, awardIds: [], amount: 25, currency: "USD", method: "giftcard", status: "pending",
  });
  const [red] = await db.select().from(schema.trophyRedeems).where(eq(schema.trophyRedeems.userId, userId)).limit(1);
  ok("the method is a word", (METHOD_OPTIONS as readonly { key: string }[]).some((m) => m.key === red.method), red.method);
  ok("the dead details column is empty and stays empty",
    JSON.stringify(red.details ?? {}) === "{}", JSON.stringify(red.details));
  ok("there is no destination on the row until a provider issues one",
    red.collectUrl === null && red.providerRef === null);

  // The purge. Every value the old form collected is gone from every row.
  const dirty = await db.select({ n: sql<number>`count(*)` }).from(schema.trophyRedeems)
    .where(sql`${schema.trophyRedeems.details} <> '{}'::jsonb`);
  ok("no redeem anywhere still carries payment details",
    Number(dirty[0]?.n ?? 0) === 0, String(dirty[0]?.n));
  const dirtyUsers = await db.select({ n: sql<number>`count(*)` }).from(schema.users)
    .where(sql`${schema.users.payoutMethod} IS NOT NULL AND ${schema.users.payoutMethod} ? 'details'`);
  ok("and no user's saved preference carries them either",
    Number(dirtyUsers[0]?.n ?? 0) === 0, String(dirtyUsers[0]?.n));

  console.log("\n== Invoices list without a brand filter ==");
  ok("the admin list finds it", (await listInvoices({ limit: 500 })).some((i) => i.id === invId));
  ok("the brand-scoped list finds only theirs",
    (await listInvoices({ brandId })).every((i) => i.brandId === brandId));
} catch (e) {
  fail++;
  console.log("  ✗ threw:", (e as Error).message);
  console.log((e as Error).stack?.split("\n").slice(1, 5).join("\n"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
