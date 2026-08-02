import { getContent } from "@/lib/cms";
import { BUTTON_COPY_KEY, parseButtonCopy, type ButtonCopy } from "@/lib/discord/buttons";

// Reading the admin's button wording. Server-only — it touches the CMS.
//
// Memoised on `globalThis` rather than in module scope, for the same reason the
// card layouts are: Next can instantiate a module more than once in a process,
// and the server action that saves the copy is in a different bundle from the
// interactions route that renders the buttons. A module-local memo would leave
// staff editing a copy nobody reads from.

type Memo = { at: number; value: ButtonCopy } | null;
const MEMO_KEY = Symbol.for("cluster.discord.buttons");
type Holder = typeof globalThis & { [MEMO_KEY]?: Memo };

// Short: every interaction reads this, and a stale label for half a minute is
// nothing next to a database round trip on every button press.
const TTL = 30_000;

export async function buttonCopy(): Promise<ButtonCopy> {
  const holder = globalThis as Holder;
  const memo = holder[MEMO_KEY];
  if (memo && Date.now() - memo.at < TTL) return memo.value;
  let value: ButtonCopy = {};
  try {
    const c = await getContent([BUTTON_COPY_KEY]);
    value = parseButtonCopy(c[BUTTON_COPY_KEY]);
  } catch {
    // The bot answering with default wording beats the bot not answering.
    value = {};
  }
  holder[MEMO_KEY] = { at: Date.now(), value };
  return value;
}

export function forgetButtonCopy(): void {
  (globalThis as Holder)[MEMO_KEY] = null;
}
