// Reading source the way a guard has to read it.
//
// House rule 4 — shared helpers live in one module, never re-declared per
// suite. `withoutComments` was written for `94-reachability` and is needed
// verbatim by `97-copy-rule`; two copies would drift, and the copy that drifts
// is the one holding the exemption.

/**
 * Source with comments removed.
 *
 * ===== WHY A GUARD MUST STRIP THEM =====
 *
 * `94-reachability` learned this the hard way: a file explaining *why* a rule
 * was deleted contains the deleted rule's own words, so a guard that scans raw
 * source flags the explanation. Exempting whole files instead made a page
 * exempt from the rule it was breaking, and a break putting *"Sign in with
 * your portal key"* into a heading sailed through.
 *
 * So comments go and strings stay. A comment may explain that a rule was
 * deleted; rendered copy may not state it.
 */
export function withoutComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

/** Every `.ts`/`.tsx` file under `dir`, recursively. */
export async function walkSource(dir: string): Promise<string[]> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkSource(full)));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}
