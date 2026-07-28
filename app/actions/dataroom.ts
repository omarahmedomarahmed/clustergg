"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { reseedDoc } from "@/lib/dataroom";
import type { SectionData, SectionKind } from "@/lib/dataroom/types";

// Editing a data room document.
//
// Everything an admin can change lives here, and the shape of it is uniform:
// one action per thing, each taking a FormData, each revalidating the document
// it touched. No JSON textareas — a person editing a pitch deck at 2am should
// never be one missing brace away from breaking the page an investor opens.

export type DocActionState = { ok?: string; error?: string } | undefined;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string, fallback = 0) => {
  const n = Number(fd.get(k));
  return Number.isFinite(n) ? n : fallback;
};
// Multi-value fields come in as repeated inputs, which is what the builder
// renders — one row per item, add and remove without touching a text blob.
const list = (fd: FormData, k: string) => fd.getAll(k).map(String).map((s) => s.trim()).filter(Boolean);

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

// Cache invalidation must never be able to lose an edit.
//
// `revalidatePath` throws when there's no request context around it, and an
// admin who typed a paragraph and got an error would reasonably assume it
// wasn't saved — when it was. The write already happened; the worst case of a
// failed revalidate is a page that updates a moment later.
function refresh(...paths: string[]) {
  for (const p of paths) {
    try { revalidatePath(p); } catch { /* the write stands regardless */ }
  }
}

async function touch(docId: string) {
  const db = await getDb();
  const [doc] = await db.select({ slug: schema.dataroomDocs.slug })
    .from(schema.dataroomDocs).where(eq(schema.dataroomDocs.id, docId)).limit(1);
  await db.update(schema.dataroomDocs).set({ updatedAt: new Date() })
    .where(eq(schema.dataroomDocs.id, docId));
  refresh("/dataroom", "/admin/dataroom", `/admin/dataroom/${docId}`,
    ...(doc?.slug ? [`/dataroom/${doc.slug}`] : []));
}

// ===== Documents =====

export async function saveDoc(_prev: DocActionState, fd: FormData): Promise<DocActionState> {
  await requireAdmin();
  const db = await getDb();
  const id = str(fd, "id");
  const title = str(fd, "title");
  if (!title) return { error: "A document needs a title." };

  const slug = slugify(str(fd, "slug") || title);
  if (!slug) return { error: "That title doesn't produce a usable web address — add some letters or numbers." };

  const values = {
    slug,
    kind: str(fd, "kind") || "deck",
    title,
    subtitle: str(fd, "subtitle") || null,
    summary: str(fd, "summary") || null,
    coverUrl: str(fd, "coverUrl") || null,
    accent: str(fd, "accent") || "#8b5cf6",
    accent2: str(fd, "accent2") || "#22d3ee",
    // Empty means open. A key you have to remember to clear is a document
    // people can't open when you forget.
    accessKey: str(fd, "accessKey") || null,
    isPublished: fd.get("isPublished") === "on",
    contactEmail: str(fd, "contactEmail") || null,
    contactNote: str(fd, "contactNote") || null,
    updatedAt: new Date(),
  };

  // The slug is the shared link. Two documents fighting over one would break
  // whichever was sent first, so this is checked rather than left to the index.
  const clash = await db.select({ id: schema.dataroomDocs.id })
    .from(schema.dataroomDocs).where(eq(schema.dataroomDocs.slug, slug)).limit(1);
  if (clash[0] && clash[0].id !== id) {
    return { error: `Another document already lives at /dataroom/${slug}. Pick a different web address.` };
  }

  if (id) {
    await db.update(schema.dataroomDocs).set(values).where(eq(schema.dataroomDocs.id, id));
    await touch(id);
    return { ok: "Saved." };
  }

  const newId = uid();
  const [{ max } = { max: 0 }] = await db
    .select({ max: sql<number>`coalesce(max(${schema.dataroomDocs.sortOrder}), 0)` })
    .from(schema.dataroomDocs);
  await db.insert(schema.dataroomDocs).values({ id: newId, ...values, sortOrder: Number(max) + 1 });
  await touch(newId);
  return { ok: `Created. It's live at /dataroom/${slug}.` };
}

export async function deleteDoc(_prev: DocActionState, fd: FormData): Promise<DocActionState> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return { error: "No document." };
  // Typing the slug to confirm: this takes a shared link out of service, and
  // anyone holding that link gets a 404 with no explanation.
  const db = await getDb();
  const [doc] = await db.select().from(schema.dataroomDocs).where(eq(schema.dataroomDocs.id, id)).limit(1);
  if (!doc) return { error: "No such document." };
  if (str(fd, "confirm") !== doc.slug) {
    return { error: `Type "${doc.slug}" to confirm — anyone holding the link will get a 404.` };
  }
  await db.delete(schema.dataroomSections).where(eq(schema.dataroomSections.docId, id));
  await db.delete(schema.dataroomDocs).where(eq(schema.dataroomDocs.id, id));
  refresh("/admin/dataroom", "/dataroom");
  return { ok: `Deleted ${doc.title}.` };
}

// Pull the shipped sections back in over this document's own.
//
// Destructive and irreversible, so it's gated the same way deleting a document
// is: type the slug. It exists because seeding is once-only — an admin whose
// deck was seeded months ago would otherwise never see a redesign, and the
// alternative (re-applying on deploy) silently overwrites their edits.
export async function reseedDocSections(_prev: DocActionState, fd: FormData): Promise<DocActionState> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return { error: "No document." };
  const db = await getDb();
  const [doc] = await db.select().from(schema.dataroomDocs).where(eq(schema.dataroomDocs.id, id)).limit(1);
  if (!doc) return { error: "No such document." };
  if (str(fd, "confirm") !== doc.slug) {
    return { error: `Type "${doc.slug}" to confirm — every section in this document is replaced.` };
  }
  const res = await reseedDoc(doc.slug);
  if (!res.ok) return { error: "This document has no shipped version to restore." };
  await touch(doc.id);
  refresh("/admin/dataroom", `/admin/dataroom/${doc.slug}`, `/dataroom/${doc.slug}`);
  return { ok: `Restored ${res.sections} shipped sections. Your own text is gone.` };
}

// ===== Sections =====

export async function addSection(_prev: DocActionState, fd: FormData): Promise<DocActionState> {
  await requireAdmin();
  const db = await getDb();
  const docId = str(fd, "docId");
  const kind = (str(fd, "kind") || "text") as SectionKind;
  if (!docId) return { error: "No document." };

  const [{ max } = { max: 0 }] = await db
    .select({ max: sql<number>`coalesce(max(${schema.dataroomSections.sortOrder}), 0)` })
    .from(schema.dataroomSections).where(eq(schema.dataroomSections.docId, docId));

  // A new section needs an anchor that doesn't collide, because the anchor is
  // what the nav jumps to and a duplicate silently sends you to the wrong one.
  const existing = await db.select({ anchor: schema.dataroomSections.anchor })
    .from(schema.dataroomSections).where(eq(schema.dataroomSections.docId, docId));
  const taken = new Set(existing.map((e) => e.anchor));
  let anchor: string = kind;
  let n = 2;
  while (taken.has(anchor)) anchor = `${kind}-${n++}`;

  await db.insert(schema.dataroomSections).values({
    id: uid(), docId, kind, anchor,
    navLabel: str(fd, "navLabel") || kind.charAt(0).toUpperCase() + kind.slice(1),
    sortOrder: Number(max) + 1,
    data: defaultDataFor(kind) as Record<string, unknown>,
  });
  await touch(docId);
  return { ok: "Section added — it's at the bottom of the document." };
}

// Sensible starting content, so a new section renders something instead of an
// empty band the admin has to guess at.
function defaultDataFor(kind: SectionKind): SectionData {
  switch (kind) {
    case "milestones": return { targets: [1_000, 10_000, 100_000, 1_000_000], metric: "reach" };
    case "ad": return { placement: "investor-doc-ad-placement" };
    case "product": return { focus: "bot" };
    case "gtm": return { stages: [{ name: "Stage one", status: "current", summary: "What's happening now." }] };
    case "metrics": return { metricKeys: ["guilds", "guildMembers", "linkedAccounts", "games"] };
    case "faq": return { qa: [{ q: "A question people ask", a: "The answer." }] };
    case "explainer": return {
      steps: [
        { icon: "gamepad", label: "They play" },
        { icon: "link", label: "We read it" },
        { icon: "trophy", label: "They compete" },
        { icon: "users", label: "Server grows" },
      ],
      loop: true,
    };
    case "showcase": return {};
    default: return {};
  }
}

export async function saveSection(_prev: DocActionState, fd: FormData): Promise<DocActionState> {
  await requireAdmin();
  const db = await getDb();
  const id = str(fd, "id");
  const docId = str(fd, "docId");
  if (!id || !docId) return { error: "No section." };

  const anchor = slugify(str(fd, "anchor")) || "section";
  const clash = await db.select({ id: schema.dataroomSections.id })
    .from(schema.dataroomSections)
    .where(and(eq(schema.dataroomSections.docId, docId), eq(schema.dataroomSections.anchor, anchor)));
  if (clash.some((c) => c.id !== id)) {
    return { error: `Another section in this document already uses "#${anchor}".` };
  }

  const kind = str(fd, "kind") as SectionKind;
  const data = readSectionData(kind, fd);

  await db.update(schema.dataroomSections).set({
    anchor,
    navLabel: str(fd, "navLabel") || anchor,
    title: str(fd, "title") || null,
    subtitle: str(fd, "subtitle") || null,
    body: String(fd.get("body") ?? "").trim() || null,
    bgUrl: str(fd, "bgUrl") || null,
    dim: Math.max(0, Math.min(100, num(fd, "dim", 62))),
    isVisible: fd.get("isVisible") === "on",
    data: data as Record<string, unknown>,
  }).where(eq(schema.dataroomSections.id, id));

  await touch(docId);
  return { ok: "Saved." };
}

// Per-kind fields, read from real inputs rather than a JSON blob.
function readSectionData(kind: SectionKind, fd: FormData): SectionData {
  const d: SectionData = {};

  // Available on every kind.
  const badge = str(fd, "badge"); if (badge) d.badge = badge;
  const ctaLabel = str(fd, "ctaLabel"); if (ctaLabel) d.ctaLabel = ctaLabel;
  const ctaHref = str(fd, "ctaHref"); if (ctaHref) d.ctaHref = ctaHref;
  const linkLabel = str(fd, "linkLabel"); if (linkLabel) d.linkLabel = linkLabel;
  const linkHref = str(fd, "linkHref"); if (linkHref) d.linkHref = linkHref;

  switch (kind) {
    case "text": {
      const b = list(fd, "bullet"); if (b.length) d.bullets = b;
      break;
    }
    case "milestones": {
      const targets = list(fd, "target").map(Number).filter((n) => Number.isFinite(n) && n > 0);
      d.targets = targets.length ? targets : [1_000, 10_000, 100_000, 1_000_000];
      d.metric = (str(fd, "metric") || "reach") as SectionData["metric"];
      break;
    }
    case "gtm": {
      const names = fd.getAll("stageName").map(String);
      d.stages = names.map((name, i) => ({
        name: name.trim(),
        status: (String(fd.getAll("stageStatus")[i] ?? "next") as "done" | "current" | "next"),
        summary: String(fd.getAll("stageSummary")[i] ?? "").trim() || undefined,
        detail: String(fd.getAll("stageDetail")[i] ?? "").trim() || undefined,
        bullets: String(fd.getAll("stageBullets")[i] ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
      })).filter((s) => s.name);
      break;
    }
    case "product":
      d.focus = (str(fd, "focus") || "bot") as SectionData["focus"];
      break;
    case "explainer": {
      const labels = fd.getAll("stepLabel").map(String);
      d.steps = labels.map((label, i) => ({
        // Capped at the point of entry, not just in the input: a diagram whose
        // labels grow into sentences stops being a diagram.
        label: label.trim().slice(0, 22),
        icon: String(fd.getAll("stepIcon")[i] ?? "spark").trim() || "spark",
        note: String(fd.getAll("stepNote")[i] ?? "").trim() || undefined,
      })).filter((x) => x.label);
      d.loop = fd.get("loop") === "on";
      break;
    }
    case "showcase": {
      const kinds = fd.getAll("cardKind").map(String);
      d.cards = kinds.map((kind, i) => ({
        kind: kind.trim(),
        caption: String(fd.getAll("cardCaption")[i] ?? "").trim() || undefined,
      })).filter((c) => c.kind);
      break;
    }
    case "logos": {
      const names = fd.getAll("logoName").map(String);
      d.logos = names.map((name, i) => ({
        name: name.trim(),
        logoUrl: String(fd.getAll("logoUrl")[i] ?? "").trim() || null,
        url: String(fd.getAll("logoLink")[i] ?? "").trim() || null,
        note: String(fd.getAll("logoNote")[i] ?? "").trim() || undefined,
      })).filter((l) => l.name);
      break;
    }
    case "gallery": {
      const urls = fd.getAll("imageUrl").map(String);
      d.images = urls.map((url, i) => ({
        url: url.trim(),
        caption: String(fd.getAll("imageCaption")[i] ?? "").trim() || undefined,
      })).filter((i) => i.url);
      break;
    }
    case "metrics":
      d.metricKeys = list(fd, "metricKey");
      break;
    case "faq": {
      const qs = fd.getAll("faqQ").map(String);
      d.qa = qs.map((q, i) => ({ q: q.trim(), a: String(fd.getAll("faqA")[i] ?? "").trim() }))
        .filter((x) => x.q && x.a);
      break;
    }
    case "ad":
      d.placement = str(fd, "placement") || "investor-doc-ad-placement";
      break;

    // ===== The investor set =====
    case "raise": {
      const num = (k: string) => {
        const n = Number(str(fd, k).replace(/[^0-9.]/g, ""));
        return Number.isFinite(n) && n > 0 ? n : undefined;
      };
      d.ask = {
        amount: num("askAmount"),
        instrument: str(fd, "askInstrument") || undefined,
        valuation: num("askValuation"),
        equityPct: num("askEquity"),
        runwayMonths: num("askRunway"),
        currency: str(fd, "askCurrency") || "USD",
      };
      const useLabels = fd.getAll("useLabel").map(String);
      d.useOfFunds = useLabels.map((label, i) => ({
        label: label.trim(),
        pct: Number(fd.getAll("usePct")[i] ?? 0) || 0,
        note: String(fd.getAll("useNote")[i] ?? "").trim() || undefined,
      })).filter((x) => x.label);
      const holders = fd.getAll("capHolder").map(String);
      d.capTable = holders.map((holder, i) => ({
        holder: holder.trim(),
        pct: Number(fd.getAll("capPct")[i] ?? 0) || 0,
        note: String(fd.getAll("capNote")[i] ?? "").trim() || undefined,
      })).filter((x) => x.holder);
      break;
    }
    case "unit": {
      const labels = fd.getAll("unitLabel").map(String);
      d.units = labels.map((label, i) => ({
        label: label.trim(),
        revenue: Number(fd.getAll("unitRevenue")[i] ?? 0) || 0,
        cost: Number(fd.getAll("unitCost")[i] ?? 0) || 0,
        note: String(fd.getAll("unitNote")[i] ?? "").trim() || undefined,
      })).filter((x) => x.label);
      break;
    }
    case "saas": {
      const labels = fd.getAll("saasLabel").map(String);
      d.saasNotes = labels.map((label, i) => ({
        label: label.trim(),
        value: String(fd.getAll("saasValue")[i] ?? "").trim(),
        note: String(fd.getAll("saasNote")[i] ?? "").trim() || undefined,
      })).filter((x) => x.label && x.value);
      break;
    }
    case "market": {
      const labels = fd.getAll("marketLabel").map(String);
      d.market = labels.map((label, i) => ({
        label: label.trim(),
        value: String(fd.getAll("marketValue")[i] ?? "").trim(),
        note: String(fd.getAll("marketNote")[i] ?? "").trim() || undefined,
        source: String(fd.getAll("marketSource")[i] ?? "").trim() || undefined,
      })).filter((x) => x.label && x.value);
      break;
    }
  }
  return d;
}

export async function moveSection(_prev: DocActionState, fd: FormData): Promise<DocActionState> {
  await requireAdmin();
  const db = await getDb();
  const id = str(fd, "id");
  const docId = str(fd, "docId");
  const dir = str(fd, "dir") === "up" ? -1 : 1;
  if (!id || !docId) return { error: "No section." };

  const rows = await db.select().from(schema.dataroomSections)
    .where(eq(schema.dataroomSections.docId, docId))
    .orderBy(asc(schema.dataroomSections.sortOrder));
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return { error: "No such section." };
  const j = i + dir;
  if (j < 0 || j >= rows.length) return { ok: "Already at the end." };

  // Rewrite the whole order rather than swapping two values: seeded rows can
  // share a sortOrder, and swapping two equal numbers moves nothing.
  const reordered = [...rows];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
  for (const [k, r] of reordered.entries()) {
    await db.update(schema.dataroomSections).set({ sortOrder: k })
      .where(eq(schema.dataroomSections.id, r.id));
  }
  await touch(docId);
  return { ok: "Moved." };
}

export async function deleteSection(_prev: DocActionState, fd: FormData): Promise<DocActionState> {
  await requireAdmin();
  const db = await getDb();
  const id = str(fd, "id");
  const docId = str(fd, "docId");
  if (!id || !docId) return { error: "No section." };
  await db.delete(schema.dataroomSections).where(eq(schema.dataroomSections.id, id));
  await touch(docId);
  return { ok: "Section removed." };
}

// ===== People =====

export async function savePerson(_prev: DocActionState, fd: FormData): Promise<DocActionState> {
  await requireAdmin();
  const db = await getDb();
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!name) return { error: "A person needs a name." };

  const logoNames = fd.getAll("logoName").map(String);
  const logos = logoNames.map((n, i) => ({
    name: n.trim(),
    logoUrl: String(fd.getAll("logoUrl")[i] ?? "").trim() || null,
    url: String(fd.getAll("logoLink")[i] ?? "").trim() || null,
  })).filter((l) => l.name);

  const values = {
    // Blank means every document, which is the common case — the same founders
    // appear in both, and two copies drift.
    docId: str(fd, "docId") || null,
    name,
    role: str(fd, "role") || "Team",
    bio: String(fd.get("bio") ?? "").trim() || null,
    avatarUrl: str(fd, "avatarUrl") || null,
    email: str(fd, "email") || null,
    linkedin: str(fd, "linkedin") || null,
    x: str(fd, "x") || null,
    logos,
    isVisible: fd.get("isVisible") === "on",
  };

  if (id) {
    await db.update(schema.dataroomPeople).set(values).where(eq(schema.dataroomPeople.id, id));
  } else {
    const [{ max } = { max: 0 }] = await db
      .select({ max: sql<number>`coalesce(max(${schema.dataroomPeople.sortOrder}), 0)` })
      .from(schema.dataroomPeople);
    await db.insert(schema.dataroomPeople).values({ id: uid(), ...values, sortOrder: Number(max) + 1 });
  }

  refresh("/admin/dataroom/team", "/dataroom");
  return { ok: "Saved." };
}

export async function deletePerson(_prev: DocActionState, fd: FormData): Promise<DocActionState> {
  await requireAdmin();
  const db = await getDb();
  const id = str(fd, "id");
  if (!id) return { error: "No person." };
  await db.delete(schema.dataroomPeople).where(eq(schema.dataroomPeople.id, id));
  refresh("/admin/dataroom/team", "/dataroom");
  return { ok: "Removed." };
}

export async function movePerson(_prev: DocActionState, fd: FormData): Promise<DocActionState> {
  await requireAdmin();
  const db = await getDb();
  const id = str(fd, "id");
  const dir = str(fd, "dir") === "up" ? -1 : 1;
  const rows = await db.select().from(schema.dataroomPeople).orderBy(asc(schema.dataroomPeople.sortOrder));
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return { error: "No such person." };
  const j = i + dir;
  if (j < 0 || j >= rows.length) return { ok: "Already at the end." };
  const reordered = [...rows];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
  for (const [k, r] of reordered.entries()) {
    await db.update(schema.dataroomPeople).set({ sortOrder: k }).where(eq(schema.dataroomPeople.id, r.id));
  }
  refresh("/admin/dataroom/team", "/dataroom");
  return { ok: "Moved." };
}
