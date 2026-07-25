import { ButtonStyle, ComponentType } from "@/lib/discord/types";

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
  return pack("n", [target, ...trail]);
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
};

export function button(label: string, customId: string, style: number = ButtonStyle.Secondary, emoji?: string): Button {
  return { type: ComponentType.Button, style, label: label.slice(0, 80), custom_id: customId, ...(emoji ? { emoji: { name: emoji } } : {}) };
}

export function linkButton(label: string, url: string, emoji?: string): Button {
  return { type: ComponentType.Button, style: ButtonStyle.Link, label: label.slice(0, 80), url, ...(emoji ? { emoji: { name: emoji } } : {}) };
}

export function navButton(label: string, target: Frame, trail: Frame[], style: number = ButtonStyle.Secondary, emoji?: string): Button {
  return button(label, navId(target, trail), style, emoji);
}

export function backButton(trail: Frame[]): Button | null {
  if (!trail.length) return null;
  const to = trail[0];
  const label = to.screen === "home" ? "Home" : "Back";
  return button(label, backId(trail), ButtonStyle.Secondary, "◀");
}

// Discord allows 5 buttons per row and 5 rows per message.
export function rows(buttons: (Button | null)[]): { type: 1; components: Button[] }[] {
  const list = buttons.filter((b): b is Button => !!b).slice(0, 25);
  const out: { type: 1; components: Button[] }[] = [];
  for (let i = 0; i < list.length; i += 5) out.push({ type: ComponentType.ActionRow, components: list.slice(i, i + 5) });
  return out;
}
