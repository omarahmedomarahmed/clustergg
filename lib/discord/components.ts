import { ButtonStyle, ComponentType } from "./types.ts";
import { installUrl } from "./config.ts";

// Discord gives every button a `custom_id` of at most 100 characters and gives
// us no server-side session to go with it. So the WHOLE navigation state —
// where you are and how you got there — is encoded in the custom_id itself.
// That is what makes "Back" work with zero storage: the button carries its own
// history, and pressing it edits the message in place.
//
//   n|planet~Valorant|home              → go to planet Valorant, Back → home
//   b|home                              → go back to home
//   a|join~<challengeId>|planet~Valorant→ do an action, then re-render
//
// Frames are `screen~arg~arg`. The first frame is where the button takes you;
// the rest are the trail behind it.

export const MAX_CUSTOM_ID = 100;

export type Frame = { screen: string; args: string[] };

export function frame(screen: string, ...args: (string | number | null | undefined)[]): Frame {
  return { screen, args: args.filter((a) => a != null && a !== "").map(String) };
}

function encodeFrame(f: Frame): string {
  // `~` and `|` are our separators, so they can never appear inside an arg.
  return [f.screen, ...f.args].map((s) => s.replace(/[|~]/g, "-")).join("~");
}

function decodeFrame(s: string): Frame {
  const [screen, ...args] = s.split("~");
  return { screen, args };
}

// Build a custom_id, dropping the OLDEST trail entries first if we'd overflow.
// Losing deep history is harmless; an unusable button is not.
function pack(kind: "n" | "b" | "a", frames: Frame[]): string {
  const parts = frames.map(encodeFrame);
  let id = [kind, ...parts].join("|");
  while (id.length > MAX_CUSTOM_ID && parts.length > 1) {
    parts.pop();
    id = [kind, ...parts].join("|");
  }
  return id.slice(0, MAX_CUSTOM_ID);
}

export function navId(target: Frame, trail: Frame[] = []): string {
  // DON'T PUSH THE SCREEN YOU ARE ALREADY ON. B4.
  //
  // `More` on the More card produced `n|more|more`, and Home on Home produced
  // `n|unlock|home|home`. Pressing Back then returned you to the screen you were
  // already looking at — the most-pressed control on every card, doing nothing
  // visible. Repeat it and the trail grows a frame per press until `pack()`
  // truncates the real history away.
  const deduped = trail.length && sameFrame(trail[0], target) ? trail.slice(1) : trail;
  return pack("n", [target, ...deduped]);
}

/** Two frames are the same destination if the screen and every arg match. */
function sameFrame(a: Frame, b: Frame): boolean {
  return a.screen === b.screen && a.args.length === b.args.length
    && a.args.every((x, i) => x === b.args[i]);
}

export function backId(trail: Frame[]): string {
  return pack("b", trail.length ? trail : [frame("home")]);
}

export function actionId(action: string, args: string[], trail: Frame[] = []): string {
  return pack("a", [frame(action, ...args), ...trail]);
}

export type ParsedId = { kind: "n" | "b" | "a"; target: Frame; trail: Frame[] };

export function parseId(customId: string): ParsedId | null {
  const [kind, ...rest] = customId.split("|");
  if (kind !== "n" && kind !== "b" && kind !== "a") return null;
  if (!rest.length) return null;
  return { kind, target: decodeFrame(rest[0]), trail: rest.slice(1).map(decodeFrame) };
}

// ===== Button builders =====

export type Button = {
  type: 2; style: number; label: string;
  custom_id?: string; url?: string; emoji?: { name: string }; disabled?: boolean;
  /**
   * What this button is FOR, which decides which row it lands in (B27).
   *
   *   choice — what this card is about: pick a game, a challenge, a trophy
   *   action — what you can do next: join, link, redeem, buy, share
   *   nav    — where you can go: Home, Back, More, and links out to the web
   *
   * Row order is fixed and `rows()` enforces it, so Back is in the same place on
   * every card in the product. Before this, position was whatever order a screen
   * happened to list its buttons in, and it differed screen to screen — which
   * means muscle memory never forms and every card has to be re-read.
   *
   * Not sent to Discord; stripped before the payload goes out.
   */
  group?: ButtonGroup;
};

export type ButtonGroup = "choice" | "action" | "nav";
const GROUP_RANK: Record<ButtonGroup, number> = { choice: 0, action: 1, nav: 2 };

// Discord validates a button's unicode emoji and rejects the WHOLE message with
// a 400 if it isn't a real one — every button in it, not just the bad one. That
// makes a single wrong character on a shared button an outage: `⋯` (U+22EF,
// MIDLINE HORIZONTAL ELLIPSIS) is a mathematical operator, not an emoji, and it
// silently froze every command on every server.
//
// So an emoji that isn't one is dropped here rather than sent. A button missing
// its icon is a cosmetic loss; a rejected payload is a dead bot.
const EMOJI = /^[\p{Extended_Pictographic}\p{Emoji_Component}‍️]+$/u;

function emojiOf(emoji?: string): { emoji: { name: string } } | Record<string, never> {
  if (!emoji) return {};
  if (!EMOJI.test(emoji)) {
    console.warn(`[discord] dropped non-emoji button icon ${JSON.stringify(emoji)} — Discord would reject the whole message`);
    return {};
  }
  return { emoji: { name: emoji } };
}

export function button(label: string, customId: string, style: number = ButtonStyle.Secondary, emoji?: string, group: ButtonGroup = "action"): Button {
  return { type: ComponentType.Button, style, label: label.slice(0, 80), custom_id: customId, group, ...emojiOf(emoji) };
}

// A link always leaves Discord, which makes it navigation whatever it says.
export function linkButton(label: string, url: string, emoji?: string, group: ButtonGroup = "nav"): Button {
  return { type: ComponentType.Button, style: ButtonStyle.Link, label: label.slice(0, 80), url, group, ...emojiOf(emoji) };
}

// Navigating to another screen of this card is a CHOICE by default — picking a
// game, a challenge, a trophy. The screens that use it for Home/Back/More pass
// "nav" explicitly.
export function navButton(label: string, target: Frame, trail: Frame[], style: number = ButtonStyle.Secondary, emoji?: string, group: ButtonGroup = "choice"): Button {
  return button(label, navId(target, trail), style, emoji, group);
}

export function backButton(trail: Frame[]): Button | null {
  if (!trail.length) return null;
  const to = trail[0];
  const label = to.screen === "home" ? "Home" : "Back";
  return button(label, backId(trail), ButtonStyle.Secondary, "◀", "nav");
}

// Discord allows 5 buttons per row and 5 rows per message.
//
// Duplicates are dropped here rather than at every call site. Screens append a
// standard tail (connect a game · my profile · more · back) on top of their own
// buttons, and a screen that already offers one of those would otherwise show
// it twice — two buttons doing the same thing is the fastest way to make a card
// look untrustworthy. Deduping centrally means a screen can add whatever it
// needs without knowing what the tail will contribute.
/**
 * The button that grows the network.
 *
 * Discord has no app store and no search worth the name. A bot spreads because
 * somebody sees it working in one server and wants it in theirs — and the
 * moment they want it is the moment they are looking at a card, not the moment
 * they next visit a website. So the way to add it is ON the card, every card,
 * with no step in between.
 *
 * Null when the app isn't configured, which is the same graceful degradation
 * every other Discord helper does: no credentials, no button, everything else
 * unchanged.
 */
export function addToServerButton(): Button | null {
  const url = installUrl();
  return url ? linkButton("Add ClusterGG to your server", url, "➕") : null;
}

export function rows(buttons: (Button | null)[]): { type: 1; components: Button[] }[] {
  // Appended here rather than at thirty call sites, because "every card" has to
  // mean every card — including the ones added next month. Every message the
  // bot sends, interactive or proactive, builds its components through this
  // function, so this is the one place that can promise it.
  const all = [...buttons, addToServerButton()];

  // Dedupe. Identity is where the button GOES, not what it says: two labels for
  // the same destination are still one destination. Screens append a standard
  // tail on top of their own buttons, and a screen that already offers one of
  // those would otherwise show it twice — two buttons doing the same thing is
  // the fastest way to make a card look untrustworthy.
  const seen = new Set<string>();
  const kept: Button[] = [];
  for (const b of all) {
    if (!b) continue;
    const key = b.custom_id ?? b.url ?? b.label;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(b);
  }

  // ROW ORDER IS MEANING, NOT CALL ORDER (B27).
  //
  //   row 1  what this card is about   — pick a game, a challenge, a trophy
  //   row 2  what you can do next      — join, link, redeem, buy, share
  //   row 3  where you can go          — Home, Back, More, and the links out
  //
  // Sorted here rather than asked of every screen, because a rule each of
  // twenty-one screens has to remember is a rule that holds on about fifteen of
  // them. A stable sort, so the order a screen lists its own choices in is
  // preserved inside each group — the grouping decides the row, the screen
  // still decides what comes first within it.
  const ordered = kept
    .map((b, i) => ({ b, i, rank: GROUP_RANK[b.group ?? "action"] }))
    .sort((x, y) => (x.rank - y.rank) || (x.i - y.i))
    .map((x) => x.b);

  // Discord's ceiling is 5 per row and 5 rows — 25 buttons.
  //
  // Truncating from the end would drop NAVIGATION, because navigation sorts
  // last: a gamer with twenty linked accounts would get a card with no Home, no
  // Back and no way out of it. So navigation is reserved first and the middle
  // groups give up their overflow instead. Losing the eleventh choice is a
  // smaller loss than losing the way back, every time.
  const MAX = 25;
  const nav = ordered.filter((b) => (b.group ?? "action") === "nav");
  const rest = ordered.filter((b) => (b.group ?? "action") !== "nav");
  const navKept = nav.slice(0, MAX);
  const restKept = rest.slice(0, Math.max(0, MAX - navKept.length));
  // Re-sorted so the reserved navigation still lands last on the card rather
  // than at the front of it.
  const list = [...ordered].filter((b) => restKept.includes(b) || navKept.includes(b));

  // `group` is ours, not Discord's — it would be rejected as an unknown field.
  const clean = ({ group: _g, ...b }: Button) => b as Button;
  const pack = (bs: Button[]) => {
    const rs: { type: 1; components: Button[] }[] = [];
    for (let i = 0; i < bs.length; i += 5) rs.push({ type: ComponentType.ActionRow, components: bs.slice(i, i + 5).map(clean) });
    return rs;
  };

  // Each group STARTS a row, so a card reads top to bottom as
  // "what this is about / what you can do / where you can go" — and Back is in
  // the same place every time, which is the point.
  const byGroup = (["choice", "action", "nav"] as ButtonGroup[])
    .map((g) => list.filter((b) => (b.group ?? "action") === g))
    .filter((bs) => bs.length);
  const grouped = byGroup.flatMap(pack);

  // Discord allows five rows. A card with a lot of choices — twenty linked
  // accounts, twelve planets — can exceed that once each group is given its own
  // row, and a message Discord rejects is worse than one whose rows are packed
  // tight. So the grouped layout is the intent and continuous packing is the
  // fallback; the ORDER is identical either way, only the row breaks differ.
  return grouped.length <= 5 ? grouped : pack(list);
}

/**
 * The admin's wording, applied to a finished set of rows.
 *
 * Done here — once, on the way out — rather than at forty call sites, and by
 * matching a button's DEFAULT LABEL rather than by threading a tag through
 * every screen. That keeps the screens readable and has a useful property: a
 * button whose label is generated from live data (a game's name, a gamer's
 * name) never matches, so it is never accidentally reworded by an edit meant
 * for a different button.
 *
 * A hidden button is removed, and a row emptied by that is removed too — an
 * empty action row is a 400 from Discord, which takes the whole message with it.
 */
export function withButtonCopy(
  components: unknown[] | undefined,
  copy: Record<string, { label?: string; emoji?: string; hidden?: boolean }>,
): unknown[] | undefined {
  if (!components || !Object.keys(copy).length) return components;
  const out: unknown[] = [];
  for (const row of components) {
    const r = row as { type?: number; components?: unknown[] };
    if (r?.type !== ComponentType.ActionRow || !Array.isArray(r.components)) { out.push(row); continue; }
    const kept: unknown[] = [];
    for (const c of r.components) {
      const b = c as Button;
      // Only buttons carry editable copy; a select menu in a row is passed
      // through untouched.
      if (b?.type !== ComponentType.Button || typeof b.label !== "string") { kept.push(c); continue; }
      const edit = copy[b.label];
      if (!edit) { kept.push(c); continue; }
      if (edit.hidden) continue;
      kept.push({
        ...b,
        ...(edit.label ? { label: edit.label.slice(0, 80) } : {}),
        // An emoji is re-validated on the way through: this string came from a
        // text box, and Discord rejects the entire message over one bad one.
        ...(edit.emoji ? emojiOf(edit.emoji) : {}),
      });
    }
    if (kept.length) out.push({ ...r, components: kept });
  }
  return out;
}

// ===== Select menus =====
//
// A button per option stops working the moment there are more than twenty-five
// of them, and "which games does your community play" is a list that grows every
// time we connect another game. A select menu is the right primitive: one row,
// any number of options, and multi-select without inventing a toggle protocol
// out of buttons that each rewrite the message.
//
// The `custom_id` grammar is the same as everything else — the handler reads
// `i.data.values` for what was picked.

export type SelectOption = { label: string; value: string; description?: string; default?: boolean };

export type Select = {
  type: 3;
  custom_id: string;
  placeholder?: string;
  min_values: number;
  max_values: number;
  options: SelectOption[];
};

export function select(customId: string, options: SelectOption[], opts: {
  placeholder?: string;
  /** 0 lets an owner clear their answer, which is a real thing to want. */
  min?: number;
  max?: number;
} = {}): Select | null {
  // Discord rejects a select with no options — and rejects the WHOLE message
  // with it. An empty catalogue must drop the menu, not the screen.
  const list = options.slice(0, 25);
  if (!list.length) return null;
  return {
    type: ComponentType.StringSelect,
    custom_id: customId.slice(0, MAX_CUSTOM_ID),
    ...(opts.placeholder ? { placeholder: opts.placeholder.slice(0, 150) } : {}),
    min_values: Math.max(0, opts.min ?? 0),
    max_values: Math.max(1, Math.min(list.length, opts.max ?? 1)),
    options: list.map((o) => ({
      label: o.label.slice(0, 100),
      value: o.value.slice(0, 100),
      ...(o.description ? { description: o.description.slice(0, 100) } : {}),
      ...(o.default ? { default: true } : {}),
    })),
  };
}

/** A select occupies a whole action row — it can never share one with a button. */
export function selectRow(s: Select | null): { type: 1; components: Select[] } | null {
  return s ? { type: ComponentType.ActionRow, components: [s] } : null;
}
