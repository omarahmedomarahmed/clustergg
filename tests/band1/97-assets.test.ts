// `public/`, and what happens when an asset is not there. `13-DESIGN` §6.
//
// ===== `public/` DID NOT EXIST AT ALL =====
//
// Not "was sparse" — the directory was absent. So every `<img>` on the platform
// pointed at something that could only come from Blob, there was no favicon,
// and D23's *"a missing asset renders a designed placeholder"* had nothing to
// render.
//
// Sprint 17 brings the logo, the OG image, the game art and the trophy art.
// What this sprint owes is the part those depend on: somewhere to put them, and
// a fence that means a missing one is a designed stand-in rather than a
// browser's broken-image glyph.

import { ok, eq, no } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { assetUrl, isPlaceholder, PLACEHOLDER } from "../../lib/site/assets.ts";

test("public/ exists, and holds the two assets this sprint owes", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const repoRoot = path.join(import.meta.dirname, "..", "..");

  const files = await fs.readdir(path.join(repoRoot, "public"));
  ok(files.includes("favicon.svg"), "a favicon — the one asset every page asks for");
  ok(files.includes("placeholder.svg"), "and the placeholder D23 requires");

  // ===== A PLACEHOLDER THAT IS NOT DESIGNED IS A BROKEN IMAGE WITH EXTRA
  // STEPS =====
  //
  // D23 bans two things and they fail differently: a broken-image glyph says
  // the platform is broken, and an empty box says nothing at all — so whoever
  // is looking cannot tell a missing asset from a design with a gap in it. The
  // stand-in has to say which, in words.
  const svg = await fs.readFile(path.join(repoRoot, "public/placeholder.svg"), "utf8");
  ok(/<text/.test(svg), "the placeholder says something in words");
  ok(/on its way/i.test(svg), "and what it says is that the art has not arrived");
  ok(/role="img"/.test(svg) && /aria-label/.test(svg), "and it is labelled for a screen reader");

  // The favicon is wired, not merely present.
  const layout = await fs.readFile(path.join(repoRoot, "app/layout.tsx"), "utf8");
  ok(/favicon\.svg/.test(layout), "and the layout actually points at the favicon");
});

test("a missing asset resolves to the placeholder, and a real one does not", async () => {
  eq(assetUrl(null), PLACEHOLDER, "nothing is the placeholder");
  eq(assetUrl(""), PLACEHOLDER, "and so is a blank string");
  eq(assetUrl("   "), PLACEHOLDER, "and whitespace, which is what an empty form posts");

  // D22 — never a hotlink. A provider's CDN breaks when they reorganise it, and
  // until then it is somebody else's bandwidth paying for our pages.
  eq(
    assetUrl("https://ddragon.leagueoflegends.com/cdn/img/champion/Ahri.png"),
    PLACEHOLDER,
    "a hotlink to a provider's CDN is not an asset this platform serves",
  );
  ok(isPlaceholder("http://example.test/a.png"), "and neither is any other host");

  // ===== THE NEGATIVE HALF =====
  //
  // A resolver that returned the placeholder for everything would pass every
  // assertion above and make the whole site a wall of stand-ins.
  eq(assetUrl("/placeholder.svg"), "/placeholder.svg", "our own public path is served");
  eq(assetUrl("/uploads/abc.png"), "/uploads/abc.png", "and an upload path is served");
  eq(
    assetUrl("https://abc123.public.blob.vercel-storage.com/card.png"),
    "https://abc123.public.blob.vercel-storage.com/card.png",
    "and Blob, which is ours in the sense that matters — we put the bytes there",
  );
  no(isPlaceholder("/uploads/abc.png"), "so a real asset does not read as missing");
});

test("the fenced image has both halves, and neither is the other's", async () => {
  // Two fences, because an image fails in two places and at two times:
  // `assetUrl` catches a source we will not serve **before** the request, and
  // `onError` catches one that 404s **after** it. Only the browser knows the
  // second, which is why this one component is a client module.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { withoutComments } = await import("../helpers/source.ts");
  const repoRoot = path.join(import.meta.dirname, "..", "..");

  const art = withoutComments(await fs.readFile(path.join(repoRoot, "app/art.tsx"), "utf8"));
  ok(/^"use client"/m.test(art), "it is a client module, because onError cannot be a server's");
  ok(/assetUrl\(/.test(art), "the server-side half resolves the source");
  ok(/onError/.test(art), "and the runtime half catches what only the browser can see");
  ok(
    /img\.src\.endsWith\(PLACEHOLDER\)/.test(art),
    "and it stops at the placeholder rather than looping when that 404s too",
  );
});
