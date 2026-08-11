import { randomBytes } from "crypto";

export function uid(): string {
  return randomBytes(12).toString("base64url");
}

// ===== A NAME THAT IS NOT LATIN IS STILL A NAME. S1/S2 =====
//
// This was:
//
//     const base = input.toLowerCase().replace(/[^a-z0-9]+/g, "-")…
//     return base || "gamer";
//
// Two faults, and the second hid the first.
//
// It stripped everything outside `a-z0-9`, so any name written in Arabic,
// Japanese, Korean, Chinese, Cyrillic, Greek, Hebrew or Thai reduced to an
// empty string — and then the fallback made it `"gamer"`. Observed live: a
// Discord user called 日本語ゲーマー got the profile `/u/gamer`, and the next
// non-Latin name got `/u/gamer-mp7d`. A server named in Arabic got the portal
// `/servers/gamer`. The FIRST such person permanently occupies the bare slug,
// and for a Discord gaming audience that is not an edge case.
//
// The fallback was also wrong everywhere it was not a gamer. `ensurePortal`
// read `slugify(name) || \`server-\${id}\``, which looks like a per-domain
// default and is dead code: `slugify` never returned empty, so the `||` never
// fired and a SERVER was labelled "gamer".
//
// So: transliterate first — a Japanese server should get a readable slug, not
// an opaque id — and only then fall back, per domain, to something that says
// what it is.
//
// Unicode NFKD splits accented Latin into a base letter plus a combining mark,
// which is what turns "Café" into "cafe" rather than "caf". It does nothing for
// scripts that have no Latin decomposition, which is what the table below is
// for: enough of the common gaming scripts to produce a name a person
// recognises. It is deliberately not a complete transliteration library — this
// makes a URL, not a translation, and being able to read your own handle back
// is the whole requirement.
const TRANSLITERATE: [RegExp, string][] = [
  // Cyrillic. Longest sequences first, or "щ" becomes "sh" + leftovers.
  [/щ/g, "shch"], [/ш/g, "sh"], [/ч/g, "ch"], [/ц/g, "ts"], [/ю/g, "yu"], [/я/g, "ya"],
  [/ж/g, "zh"], [/х/g, "kh"], [/а/g, "a"], [/б/g, "b"], [/в/g, "v"], [/г/g, "g"],
  [/д/g, "d"], [/е/g, "e"], [/ё/g, "e"], [/з/g, "z"], [/и/g, "i"], [/й/g, "i"],
  [/к/g, "k"], [/л/g, "l"], [/м/g, "m"], [/н/g, "n"], [/о/g, "o"], [/п/g, "p"],
  [/р/g, "r"], [/с/g, "s"], [/т/g, "t"], [/у/g, "u"], [/ф/g, "f"], [/ы/g, "y"],
  [/э/g, "e"], [/ъ/g, ""], [/ь/g, ""],
  // Greek.
  [/θ/g, "th"], [/χ/g, "ch"], [/ψ/g, "ps"], [/ω/g, "o"], [/α/g, "a"], [/β/g, "v"],
  [/γ/g, "g"], [/δ/g, "d"], [/ε/g, "e"], [/ζ/g, "z"], [/η/g, "i"], [/ι/g, "i"],
  [/κ/g, "k"], [/λ/g, "l"], [/μ/g, "m"], [/ν/g, "n"], [/ξ/g, "x"], [/ο/g, "o"],
  [/π/g, "p"], [/ρ/g, "r"], [/[σς]/g, "s"], [/τ/g, "t"], [/υ/g, "y"], [/φ/g, "f"],
  // Arabic.
  [/ا|أ|إ|آ/g, "a"], [/ب/g, "b"], [/ت/g, "t"], [/ث/g, "th"], [/ج/g, "j"], [/ح/g, "h"],
  [/خ/g, "kh"], [/د/g, "d"], [/ذ/g, "dh"], [/ر/g, "r"], [/ز/g, "z"], [/س/g, "s"],
  [/ش/g, "sh"], [/ص/g, "s"], [/ض/g, "d"], [/ط/g, "t"], [/ظ/g, "z"], [/ع/g, "a"],
  [/غ/g, "gh"], [/ف/g, "f"], [/ق/g, "q"], [/ك/g, "k"], [/ل/g, "l"], [/م/g, "m"],
  [/ن/g, "n"], [/ه|ة/g, "h"], [/و/g, "w"], [/ي|ى/g, "y"],
  // Hebrew.
  [/א/g, "a"], [/ב/g, "b"], [/ג/g, "g"], [/ד/g, "d"], [/ה/g, "h"], [/ו/g, "v"],
  [/ז/g, "z"], [/ח/g, "ch"], [/ט/g, "t"], [/י/g, "y"], [/[כך]/g, "k"], [/ל/g, "l"],
  [/[מם]/g, "m"], [/[נן]/g, "n"], [/ס/g, "s"], [/ע/g, "a"], [/[פף]/g, "p"],
  [/[צץ]/g, "ts"], [/ק/g, "q"], [/ר/g, "r"], [/ש/g, "sh"], [/ת/g, "t"],
];

/** As much of a name as survives being turned into URL characters. */
export function transliterate(input: string): string {
  let s = input.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  for (const [re, to] of TRANSLITERATE) s = s.replace(re, to);
  return s;
}

/**
 * A URL-safe slug, or the empty string when a name yields nothing at all.
 *
 * EMPTY IS A REAL ANSWER. Han, Kana, Hangul, Thai and emoji have no useful
 * Latin transliteration here, so `slugify` says so rather than inventing a word
 * — and every call site then chooses a fallback that describes what the thing
 * IS. A server called 日本語サーバー becomes `server-4f2a`, which is opaque but
 * honest, where "gamer" was neither.
 */
export function slugify(input: string): string {
  return transliterate(input).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32)
    .replace(/-+$/, "");
}

/**
 * `slugify` with a domain-appropriate fallback, for the places that need one.
 *
 * The fallback is a REQUIRED argument. Every previous default was a global
 * "gamer", which is how a Discord server came to be published at
 * `/servers/gamer`, and a default that is right for one caller is silently
 * wrong for the next.
 */
export function slugifyOr(input: string, fallback: string): string {
  return slugify(input) || slugify(fallback) || "x";
}

export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Number.isInteger(n)) return n.toLocaleString("en-US");
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
