import { getContent } from "@/lib/cms";
import { DEFAULT_LAYOUT, LAYOUT_KINDS, layoutKey, parseLayout, type CardLayout } from "@/lib/cards/layout";

// Reading card layouts out of platform settings. Server-only — it touches the
// CMS, which touches the database, which a client component may not.

// Layouts are read on every render, so they're memoised briefly. A staff edit
// clears the memo directly rather than waiting it out.
//
// The memo lives on `globalThis`, not in this module's scope, for the same
// reason the portal secret does: Next can instantiate the same module more than
// once in one server process, and the server action that saves a layout is in a
// different bundle from the route handler that renders the card. A module-local
// memo means `forgetLayouts()` clears a copy nobody is reading from, and staff
// save a layout and watch the old one keep rendering.
type Memo = { at: number; value: Record<string, CardLayout> } | null;
const MEMO_KEY = Symbol.for("cluster.cards.layouts");
type Holder = typeof globalThis & { [MEMO_KEY]?: Memo };

const TTL = 30_000;

export async function allLayouts(): Promise<Record<string, CardLayout>> {
  const holder = globalThis as Holder;
  const memo = holder[MEMO_KEY];
  if (memo && Date.now() - memo.at < TTL) return memo.value;
  const value: Record<string, CardLayout> = {};
  try {
    const c = await getContent(LAYOUT_KINDS.map(layoutKey));
    for (const kind of LAYOUT_KINDS) value[kind] = parseLayout(c[layoutKey(kind)]);
  } catch {
    for (const kind of LAYOUT_KINDS) value[kind] = DEFAULT_LAYOUT;
  }
  holder[MEMO_KEY] = { at: Date.now(), value };
  return value;
}

export async function layoutFor(kind: string): Promise<CardLayout> {
  const all = await allLayouts();
  return all[kind] ?? DEFAULT_LAYOUT;
}

export function forgetLayouts(): void {
  (globalThis as Holder)[MEMO_KEY] = null;
}
