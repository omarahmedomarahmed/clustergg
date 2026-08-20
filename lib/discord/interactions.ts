// The interaction handler, and the three-second rule.
//
// ===== ACKNOWLEDGE IN THREE SECONDS OR THE INTERACTION IS DEAD =====
//
// Discord kills an interaction that is not acknowledged within three seconds,
// and the gamer sees "This interaction failed" — which is not a slow card, it
// is no card. Every screen this platform renders needs a database read, a
// standings computation, or a PNG render, and any of those can take longer
// than three seconds on a cold function.
//
// So the shape is fixed and there is no exception to it:
//
//   1. Verify the signature.
//   2. **Acknowledge immediately** — a deferred response, sent before any work.
//   3. Do the work in `after()`, and edit the original response with the card.
//
// The handler below cannot be written any other way: `respond` returns the
// acknowledgement synchronously and the work is a callback. A handler that
// awaited its work before returning would be a handler that times out under
// load and works perfectly in testing.
//
// House rule 11 applies to every step after the acknowledgement: **a
// decoration may never take a card down.** Once we have acknowledged, the
// gamer is owed a card; anything that throws on the way to producing one is
// fenced, and they get a card that says what went wrong instead of a spinner
// that never resolves.

import { verifyInteraction } from "./verify.ts";
import { InteractionType, InteractionResponseType, type CommandOption } from "./types.ts";
import { commandFrame } from "./commands.ts";
import { parseId, type Frame } from "./components.ts";
import type { Presser } from "./identify.ts";

export type Interaction = {
  id: string;
  token: string;
  type: number;
  application_id: string;
  // `options` is what a slash command carries, and its absence here is part of
  // why the command path read as implemented: the type could not express an
  // invocation, so nothing that read this shape could have handled one.
  data?: { name?: string; custom_id?: string; values?: string[]; options?: CommandOption[] };
  guild_id?: string;
  channel_id?: string;
  member?: { user?: { id: string; username: string }; roles?: string[] };
  user?: { id: string; username: string };
};

export type ScreenResult = {
  content?: string;
  embeds?: unknown[];
  components?: unknown[];
  files?: { name: string; data: Uint8Array }[];
  /** True for anything only the owner and mapped admin roles may see. */
  ephemeral?: boolean;
};

export type ScreenHandler = (ctx: {
  interaction: Interaction;
  frame: Frame;
  trail: Frame[];
  /** The **Discord** id of the presser. Not ours. */
  userId: string | null;
  guildId: string | null;
  /**
   * Who they are on Cluster, resolved before any screen runs.
   *
   * I5 — the first press creates the row, so every screen after it knows who
   * they are without asking. A screen that resolved this itself would be a
   * screen somebody could add without it, and A1's *"the parent is stamped at
   * the first click"* would then hold only for the screens somebody remembered.
   */
  presser: Presser;
}) => Promise<ScreenResult>;

/** The screen registry. A card family per key; Stage 6's layouts live here. */
export const SCREENS = new Map<string, ScreenHandler>();

export function screen(name: string, handler: ScreenHandler): void {
  SCREENS.set(name, handler);
}

export type HandlerDeps = {
  /** Runs the callback after the response has been sent. Next's `after()`. */
  defer: (fn: () => Promise<void>) => void;
  /**
   * Resolve — and on a first press, **create** — the presser's account.
   *
   * Injectable so the band can drive the handler without a database, and
   * defaulted to the real thing so production cannot accidentally run without
   * it. The default is exercised by its own guard: a dep with no real default
   * is a dep that is only ever tested as a stub.
   */
  identify?: (interaction: Interaction) => Promise<Presser>;
  /** Edits the original deferred response with the finished card. */
  edit: (applicationId: string, token: string, result: ScreenResult) => Promise<void>;
  /** Overridable so the test band does not need Ed25519 keys. */
  verify?: (body: string, signature: string, timestamp: string) => Promise<boolean>;
};

export type HandlerResponse = { status: number; body: unknown };

/**
 * Handle one interaction.
 *
 * Returns the response to send **now**. The work happens in `deps.defer`,
 * which is why this function is not `async` all the way down: everything
 * before the return must be cheap, and the type makes that visible.
 */
export async function handleInteraction(
  raw: { body: string; signature: string | null; timestamp: string | null },
  deps: HandlerDeps,
): Promise<HandlerResponse> {
  // ── Signature first. An unverified request is not an interaction.
  const verify =
    deps.verify ??
    ((b: string, sig: string, ts: string) =>
      Promise.resolve(verifyInteraction(b, sig, ts).ok));
  if (!raw.signature || !raw.timestamp) {
    return { status: 401, body: "missing signature" };
  }
  if (!(await verify(raw.body, raw.signature, raw.timestamp))) {
    return { status: 401, body: "bad signature" };
  }

  let interaction: Interaction;
  try {
    interaction = JSON.parse(raw.body) as Interaction;
  } catch {
    return { status: 400, body: "bad json" };
  }

  // Discord's liveness check. Answering it is the whole handshake.
  if (interaction.type === InteractionType.Ping) {
    return { status: 200, body: { type: InteractionResponseType.Pong } };
  }

  const userId = interaction.member?.user?.id ?? interaction.user?.id ?? null;
  const guildId = interaction.guild_id ?? null;

  // ===== TWO WAYS IN, AND ONLY ONE OF THEM EXISTED =====
  //
  // A component press carries the frame in its `custom_id`. A slash command
  // carries a name and its options, and until this branch existed the fallback
  // read `data.name` straight into a screen key — so `/cluster` looked up a
  // screen called "cluster", found nothing, and rendered *"that screen has
  // gone"*. Nothing registered a command, so nobody ever saw it.
  //
  // `commandFrame` is the translation, and it is a real one: the command's own
  // vocabulary is not the screen registry's, and pretending they are the same
  // namespace is what made this look implemented.
  const parsed =
    interaction.data?.custom_id != null ? parseId(interaction.data.custom_id) : null;
  const frame: Frame =
    parsed?.target ??
    (interaction.type === InteractionType.ApplicationCommand
      ? commandFrame(interaction)
      : { screen: "home", args: [] });
  const trail = parsed?.trail ?? [];

  const handler = SCREENS.get(frame.screen);
  const identify =
    deps.identify ??
    (async (i: Interaction) => {
      const { getDb } = await import("../db/index.ts");
      const { identifyPresser } = await import("./identify.ts");
      return identifyPresser(await getDb(), i);
    });

  // ===== THE ACKNOWLEDGEMENT. Everything above this line is cheap. =====
  //
  // `DeferredChannelMessageWithSource` for a command, `DeferredUpdateMessage`
  // for a button — the difference matters to the gamer: one posts a new card
  // and one replaces the card they pressed.
  const deferredType =
    interaction.type === InteractionType.MessageComponent
      ? InteractionResponseType.DeferredUpdateMessage
      : InteractionResponseType.DeferredChannelMessageWithSource;

  deps.defer(async () => {
    // Past the acknowledgement, the gamer is owed a card. Anything that throws
    // between here and one existing must produce a card that says so, because
    // the alternative is a spinner that never resolves and no way to tell a
    // slow card from a dead one.
    let result: ScreenResult;
    try {
      // ===== I5 / A1 — BEFORE THE SCREEN, NOT INSIDE IT =====
      //
      // The account is created and the parent stamped here, once, so every
      // screen inherits it — including screens added later. Trap 18's lesson
      // is the reason it is not in the screens: a rule enforced at each door
      // is a rule that is missing from the door somebody adds next.
      const presser = await identify(interaction);
      result = handler
        ? await handler({ interaction, frame, trail, userId, guildId, presser })
        : {
            content:
              "That screen has gone. Try `/cluster` and start again — nothing " +
              "you have entered is affected.",
            ephemeral: true,
          };
    } catch (e) {
      console.error(`[bot] screen "${frame.screen}" failed`, e);
      result = {
        content:
          "Something went wrong drawing that card. It has been logged, and " +
          "nothing you have entered is affected.",
        ephemeral: true,
      };
    }
    try {
      await deps.edit(interaction.application_id, interaction.token, result);
    } catch (e) {
      console.error(`[bot] could not deliver the card for "${frame.screen}"`, e);
    }
  });

  return { status: 200, body: { type: deferredType } };
}
