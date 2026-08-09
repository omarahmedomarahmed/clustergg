/**
 * B91.8 — a half-built thing, kept.
 *
 * A brand builds a campaign, gets interrupted, closes the tab, and comes back
 * to an empty form. That is somebody who had already decided to give us money,
 * lost to a browser tab.
 *
 * The assertions that matter are about ISOLATION. A draft can hold a deal in
 * progress — prices, targeting, which servers — so one brand reading another's
 * is one brand reading the other's strategy. The guard lives in the action, and
 * the test reads the action.
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
const {
  saveDraft, loadDraft, clearDraft, listDrafts, pruneDrafts, MAX_DRAFT_BYTES,
} = await import("../../lib/form-drafts.ts");

const db = await getDb();
const tag = uid().slice(0, 6);
const brandA = `brand-a-${tag}`;
const brandB = `brand-b-${tag}`;

console.log("== it comes back ==");
{
  const payload = { game: "Chess.com", slots: 3, regions: ["mena"] };
  const res = await saveDraft(db, { ownerType: "brand", ownerId: brandA, formKey: "campaign", payload, label: "Chess — 3 weeks" });
  ok("it saved", res.ok, JSON.stringify(res));

  const back = await loadDraft(db, "brand", brandA, "campaign");
  eq("…and it comes back the same", back?.payload, payload);
  eq("…with what to call it", back?.label, "Chess — 3 weeks");
}

console.log("\n== one row per form, not a history ==");
{
  await saveDraft(db, { ownerType: "brand", ownerId: brandA, formKey: "campaign", payload: { slots: 4 } });
  await saveDraft(db, { ownerType: "brand", ownerId: brandA, formKey: "campaign", payload: { slots: 2 } });
  const mine = (await listDrafts(db, "brand", 200)).filter((d) => d.ownerId === brandA);
  eq("still one row", mine.length, 1);
  // This is a resumption point, not version control. Nobody has ever wanted the
  // fourth-from-last version of a form.
  eq("…holding the latest", mine[0].payload, { slots: 2 });
}

console.log("\n== one brand's draft is not another's ==");
{
  await saveDraft(db, { ownerType: "brand", ownerId: brandB, formKey: "campaign", payload: { game: "Valorant", secret: "their strategy" } });
  const a = await loadDraft(db, "brand", brandA, "campaign");
  eq("A still sees only A's", a?.payload, { slots: 2 });

  // A server with the same id as a brand must not collide either — the key is
  // (ownerType, ownerId, formKey), and dropping the type would let a guild id
  // that happens to match a brand id read it.
  await saveDraft(db, { ownerType: "server", ownerId: brandA, formKey: "campaign", payload: { fromAServer: true } });
  eq("…and the type is part of the key", (await loadDraft(db, "brand", brandA, "campaign"))?.payload, { slots: 2 });
  eq("…both ways", (await loadDraft(db, "server", brandA, "campaign"))?.payload, { fromAServer: true });
}

console.log("\n== the guard is in the action, and it is per-owner ==");
{
  // The isolation above is only real if something checks WHO is asking. It is
  // deliberately not in the lib — a library that also does auth is one somebody
  // calls from a place that has none — so the test reads the action.
  const src = readFileSync("app/actions/drafts.ts", "utf8");
  ok("a brand is proved by its portal session",
    /hasPortalSession\("brand", ownerId\)/.test(src));
  ok("a server is proved by its portal session",
    /hasPortalSession\("server", ownerId\)/.test(src));
  // A staff draft belongs to the person. Trusting an ownerId for staff would
  // let anybody who is staff read anybody else's — and worse, let a typo'd id
  // create drafts under somebody else's name.
  ok("a staff draft is keyed to the signed-in staff member, never to a posted id",
    /ownerType === "staff"[\s\S]{0,220}ownerId = user\.id/.test(src));
  ok("…and a posted staff ownerId is refused outright",
    /if \(ownerType === "staff"\) return false;/.test(src));
}

console.log("\n== the bounds ==");
{
  const huge = { blob: "x".repeat(MAX_DRAFT_BYTES + 100) };
  const res = await saveDraft(db, { ownerType: "brand", ownerId: brandA, formKey: "big", payload: huge });
  ok("an enormous draft is refused", !res.ok);
  // …and the refusal says the form still works. Somebody told only "failed to
  // save" assumes the thing they are building is broken.
  ok("…and says the form still submits", !res.ok && /still submit/.test(res.error), !res.ok ? res.error : "");

  const bad = await saveDraft(db, { ownerType: "brand", ownerId: "", formKey: "campaign", payload: {} });
  ok("a draft with no owner is refused", !bad.ok);
}

console.log("\n== abandoned ones are swept ==");
{
  const old = `stale-${tag}`;
  await saveDraft(db, { ownerType: "brand", ownerId: old, formKey: "campaign", payload: { a: 1 } });
  const { schema } = await import("../../lib/db/index.ts");
  const { eq: dEq, and } = await import("drizzle-orm");
  await db.update(schema.formDrafts)
    .set({ updatedAt: new Date(Date.now() - 400 * 86400_000) })
    .where(and(dEq(schema.formDrafts.ownerId, old), dEq(schema.formDrafts.formKey, "campaign")));

  const n = await pruneDrafts(db, 45);
  ok("the stale one was swept", n > 0, String(n));
  eq("…and it is gone", await loadDraft(db, "brand", old, "campaign"), null);
  ok("…while a fresh one survives", !!(await loadDraft(db, "brand", brandA, "campaign")));
}

console.log("\n== finishing throws it away ==");
{
  await clearDraft(db, "brand", brandA, "campaign");
  eq("cleared", await loadDraft(db, "brand", brandA, "campaign"), null);
  // The builder must do this on a successful buy, or it offers to "pick up" a
  // campaign that already exists.
  const src = readFileSync("components/CampaignBuilder.tsx", "utf8");
  ok("the campaign builder discards its draft once the campaign is bought",
    /discardFormDraft\("brand", brandId, "campaign"\)/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
