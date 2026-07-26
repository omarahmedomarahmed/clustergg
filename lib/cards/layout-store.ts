import { getContent } from "@/lib/cms";
import { DEFAULT_LAYOUT, LAYOUT_KINDS, layoutKey, parseLayout, type CardLayout } from "@/lib/cards/layout";

// Reading card layouts out of platform settings. Server-only — it touches the
// CMS, which touches the database, which a client component may not.

// Layouts are read on every render, so they're memoised briefly. A staff edit
// clears the memo directly rather than waiting it out.
let memo: { at: number; value: Record<string, CardLayout> } | null = null;
const TTL = 30_000;

export async function allLayouts(): Promise<Record<string, CardLayout>> {
  if (memo && Date.now() - memo.at < TTL) return memo.value;
  const value: Record<string, CardLayout> = {};
  try {
    const c = await getContent(LAYOUT_KINDS.map(layoutKey));
    for (const kind of LAYOUT_KINDS) value[kind] = parseLayout(c[layoutKey(kind)]);
  } catch {
    for (const kind of LAYOUT_KINDS) value[kind] = DEFAULT_LAYOUT;
  }
  memo = { at: Date.now(), value };
  return value;
}

export async function layoutFor(kind: string): Promise<CardLayout> {
  const all = await allLayouts();
  return all[kind] ?? DEFAULT_LAYOUT;
}

export function forgetLayouts(): void {
  memo = null;
}
