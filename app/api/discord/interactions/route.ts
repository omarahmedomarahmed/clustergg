import { NextRequest, NextResponse, after } from "next/server";
import { verifyInteraction } from "@/lib/discord/verify";
import { canVerify, canAct, appId, publicKeyShape, siteUrl } from "@/lib/discord/config";
import {
  InteractionType, InteractionResponseType, MessageFlags,
  actor, readCommand, isGuildManager, isPublicMessage, ButtonStyle, type Interaction,
} from "@/lib/discord/types";
import { parseId, frame, rows, button, navButton, linkButton, actionId, type Frame } from "@/lib/discord/components";
import { openChoices } from "@/lib/discord/catalog";
import { renderScreen, screenForCommand, loadCtx, linkModal, keyModal, requestModal, aboutModal, contactEmailModal, contactModal } from "@/lib/discord/screens";
import { editOriginal, editWithError, followUp } from "@/lib/discord/reply";
import { cardRef, embedColor } from "@/lib/discord/cards";
import { shareMessage } from "@/lib/discord/share";
import { joinChallengeFor, challengeGate, keyVisibleTo, setChallengeState, entryAccounts } from "@/lib/challenges";
import { submitChallengeRequest } from "@/lib/challenge-requests";
import { linkGameAccountFor } from "@/lib/link-account";
import { PROVIDERS, linkableProvider } from "@/lib/providers/registry";
import { logCommand, upsertGuild, getGuildRow } from "@/lib/discord/guilds";
import { ensurePortal } from "@/lib/server-portal";
import { reportToHq } from "@/lib/discord/hq";
import { dmUser } from "@/lib/discord/rest";
import { castDiscordVote } from "@/lib/identity";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The single entry point for everything the bot does. Discord POSTs here for
// slash commands, button clicks, autocomplete and modal submits.
//
// Two rules shape this whole file:
//  1. Every request must be Ed25519-verified, and an invalid signature MUST be
//     401 — the developer portal refuses to save an endpoint that doesn't.
//  2. Discord kills an interaction that isn't acknowledged within 3 SECONDS.
//     So we ACK immediately and do the database + card work in `after()`,
//     patching the real content in through the interaction webhook.

const json = (body: unknown) => NextResponse.json(body);

// Discord only ever POSTs here. A GET is therefore free to be a self-diagnosis
// page you can open in a browser — which is the fastest way to answer "why does
// Discord say it can't verify my endpoint?" without a terminal.
//
// It deliberately exposes NO secret values: only whether each one is present
// and whether the public key is the right shape.
export function GET(req: NextRequest) {
  const shape = publicKeyShape();
  const expected = `${siteUrl()}/api/discord/interactions`;
  const actual = `${req.nextUrl.origin}${req.nextUrl.pathname}`;

  const problems: string[] = [];
  if (!shape.present) problems.push("DISCORD_PUBLIC_KEY is not set on this deployment. Add it in Vercel → Settings → Environment Variables (Production), then REDEPLOY — env changes don't apply to an existing build.");
  else if (!shape.looksValid) problems.push(`DISCORD_PUBLIC_KEY is set but is ${shape.length} characters and not 64 hex characters. It should be the "Public Key" from the General Information tab — not the Application ID, not the client secret, not the bot token.`);
  if (!canAct()) problems.push("DISCORD_BOT_TOKEN is not set, so the bot cannot create channels, post or pin. Interactions can still verify without it.");
  if (!appId()) problems.push("Neither DISCORD_APP_ID nor DISCORD_CLIENT_ID is set — replies cannot be delivered.");
  if (actual !== expected) problems.push(`This deployment answers on ${actual}, but NEXT_PUBLIC_APP_URL says ${expected}. Give Discord the URL you actually reached this page on, with no trailing slash.`);

  return json({
    ok: problems.length === 0,
    interactionsUrl: actual,
    checks: {
      publicKey: shape.present ? (shape.looksValid ? "ok" : `wrong shape (${shape.length} chars)`) : "missing",
      botToken: canAct() ? "ok" : "missing",
      appId: appId() ? "ok" : "missing",
    },
    problems,
    next: problems.length === 0
      ? "Everything needed to verify is in place. Paste this exact interactionsUrl into Discord → General Information → Interactions Endpoint URL and click Save."
      : "Fix the problems above, redeploy, then reload this page.",
  });
}

export async function POST(req: NextRequest) {
  if (!canVerify()) {
    return NextResponse.json({ error: "discord_not_configured" }, { status: 503 });
  }

  // The signature covers the exact bytes, so the body must be read as text.
  const raw = await req.text();
  const check = verifyInteraction(raw, req.headers.get("x-signature-ed25519"), req.headers.get("x-signature-timestamp"));
  if (!check.ok) return new NextResponse(check.reason, { status: 401 });

  let i: Interaction;
  try { i = JSON.parse(raw) as Interaction; } catch { return new NextResponse("bad json", { status: 400 }); }

  if (i.type === InteractionType.Ping) return json({ type: InteractionResponseType.Pong });

  if (i.type === InteractionType.Autocomplete) return json(await autocomplete(i));

  if (i.type === InteractionType.ApplicationCommand) return command(i);

  if (i.type === InteractionType.MessageComponent) return componentPress(i);

  if (i.type === InteractionType.ModalSubmit) return modalSubmit(i);

  return json({ type: InteractionResponseType.Pong });
}

// ===== Modal submit (the two forms: linking an account, entering a key) =====

type Who = NonNullable<ReturnType<typeof actor>>;

function modalSubmit(i: Interaction) {
  const who = actor(i);
  const [kind, arg] = (i.data?.custom_id ?? "").split("|");
  if (!who || !arg) return json({ type: InteractionResponseType.DeferredUpdateMessage });

  const fields = new Map(
    (i.data?.components ?? []).flatMap((row) => row.components.map((c) => [c.custom_id, c.value] as const)),
  );

  if (kind === "key") return keySubmit(i, who, arg, (fields.get("key") ?? "").trim());
  if (kind === "link") return linkSubmit(i, who, arg, fields);
  if (kind === "req") return requestSubmit(i, who, arg, fields);
  if (kind === "about") return aboutSubmit(i, arg, (fields.get("about") ?? "").trim());
  if (kind === "contactemail") return contactEmailSubmit(i, arg, (fields.get("email") ?? "").trim());
  if (kind === "msg") return contactSubmit(i, who, arg, (fields.get("body") ?? "").trim());
  return json({ type: InteractionResponseType.DeferredUpdateMessage });
}

function linkSubmit(i: Interaction, who: Who, provider: string, fields: Map<string, string>) {
  after(async () => {
    try {
      const ctx = await loadCtx(who.id, who.global_name || who.username, i.guild_id, who.avatar, isGuildManager(i));
      if (!ctx.gamer) {
        await editOriginal(i.token, { content: `Continue with Discord first, then link your game account: ${siteUrl()}/login` });
        return;
      }
      const res = await linkGameAccountFor(
        ctx.gamer.userId, provider,
        fields.get("ign") ?? "", (fields.get("region") ?? "").trim() || undefined,
      );
      if (!res.ok) {
        await editOriginal(i.token, { embeds: [{ color: 0xf59e0b, description: res.error }] });
        return;
      }
      // Re-render the stats screen so they immediately see what they just linked.
      const target = frame("show", `game:${res.game}`);
      const payload = await renderScreen(target, [frame("home")], { ...ctx });
      // Linking proves the account exists. Prize money needs it to be THEIRS,
      // and the proof lives on the website — so say so here rather than letting
      // someone find out at payout time.
      const next = res.proofAvailable
        ? `\nOne more step to compete for prizes: prove it's yours at ${siteUrl()}/profile — takes about a minute.`
        : "";
      await editOriginal(i.token, {
        content: `**${res.name}** linked. Your ${res.game} stats sync from here on.${next}`,
        embeds: payload.embeds ?? [],
        components: payload.components ?? [],
      });
    } catch {
      await editWithError(i.token, `Couldn't link that account. Try again, or link it at ${siteUrl()}/profile.`);
    }
  });

  return json({
    type: InteractionResponseType.DeferredChannelMessageWithSource,
    data: { flags: MessageFlags.Ephemeral },
  });
}

// Entering a server-gated challenge. Everything about it was already visible —
// standings, trophies, countdown, everyone's progress. This is only the door,
// and the key is checked inside joinChallengeFor so web and Discord can't drift.
function keySubmit(i: Interaction, who: Who, challengeId: string, key: string) {
  after(async () => {
    try {
      const ctx = await loadCtx(who.id, who.global_name || who.username, i.guild_id, who.avatar, isGuildManager(i));
      if (!ctx.gamer) {
        await editOriginal(i.token, { content: `Continue with Discord first, then link your game account: ${siteUrl()}/login` });
        return;
      }
      // With more than one account for this game, the key is not enough to
      // enter — WHICH account matters, and picking one for them is how a week
      // of play ends up scoring nothing. So the key is verified here and the
      // choice is offered, carrying the key they just typed in the button.
      // (No new exposure: this reply is ephemeral and they are the person who
      // typed the key.)
      const mine = await entryAccounts(ctx.gamer.userId, challengeId);
      if (mine.length > 1 && !mine.some((a) => a.entered)) {
        const gate = await challengeGate(challengeId);
        const right = !gate.locked
          || (key.trim().toUpperCase() === (gate.accessKey ?? "").trim().toUpperCase());
        if (!right) {
          await editOriginal(i.token, { embeds: [{ color: 0xf59e0b, description: joinFailure("bad_key") }] });
          return;
        }
        const payload = await renderScreen(frame("challenge", challengeId), [frame("home")], ctx);
        await editOriginal(i.token, {
          content: "Key accepted. Which account is entering?",
          embeds: payload.embeds ?? [],
          components: rows(mine.slice(0, 3).map((a) =>
            button(`Join as ${a.inGameName}`.slice(0, 40), actionId("join", [challengeId, a.id, key], [frame("home")]), 3, "🏆"))),
        });
        return;
      }

      const res = await joinChallengeFor(ctx.gamer.userId, challengeId, {
        source: "discord", accessKey: key, guildId: i.guild_id ?? null,
      });
      if (!res.ok) {
        await editOriginal(i.token, { embeds: [{ color: 0xf59e0b, description: joinFailure(res.reason, res.unmet) }] });
        return;
      }
      const payload = await renderScreen(frame("challenge", challengeId), [frame("home")], ctx);
      await editOriginal(i.token, {
        content: res.already
          ? `You were already in **${res.title}** as **${res.account}**.`
          : `Key accepted — you're in **${res.title}** as **${res.account}**. Only activity from now on counts.`,
        embeds: payload.embeds ?? [],
        components: payload.components ?? [],
      });
    } catch {
      await editWithError(i.token, "Couldn't check that key just now. Try again in a moment.");
    }
  });

  return json({
    type: InteractionResponseType.DeferredChannelMessageWithSource,
    data: { flags: MessageFlags.Ephemeral },
  });
}

// A server owner submitting a challenge for their community. This creates a
// REQUEST, not a challenge: it will run under Cluster's name, on our
// leaderboards, with our trophies, so a human approves it first.
function requestSubmit(i: Interaction, who: Who, game: string, fields: Map<string, string>) {
  after(async () => {
    try {
      if (!i.guild_id) {
        await editOriginal(i.token, { content: "Run this inside your server." });
        return;
      }
      const ctx = await loadCtx(who.id, who.global_name || who.username, i.guild_id, who.avatar, isGuildManager(i));
      const res = await submitChallengeRequest({
        guildId: i.guild_id,
        game,
        title: fields.get("title") ?? "",
        description: fields.get("description") ?? "",
        days: Number(fields.get("days") ?? 7),
        prizeValue: Number((fields.get("prize") ?? "").replace(/[^0-9]/g, "")) || 0,
        prizeCurrency: (fields.get("currency") ?? "USD").trim() || "USD",
        requestedByDiscordId: who.id,
        requestedByUserId: ctx.gamer?.userId ?? null,
      });

      if (!res.ok) {
        await editOriginal(i.token, {
          embeds: [{ color: 0xf59e0b, description: requestFailure(res.reason) }],
        });
        return;
      }

      await editOriginal(i.token, {
        embeds: [{
          title: "Request sent",
          description: [
            `**${fields.get("title")}** on **${game}** is with us for review.`,
            "",
            "We check every server challenge before it goes live — it runs under Cluster's name, on our leaderboards, with our trophies.",
            "",
            "When it's approved the bot posts it here with your server's entry key, and your members join in one tap.",
          ].join("\n"),
          color: 0x34d399,
        }],
        components: [],
      });

      // Tell staff there's something waiting, so approval isn't gated on
      // somebody happening to open the admin page — in-app, and in our own
      // Discord where staff actually are.
      void notifyStaffOfRequest(res.id).catch(() => {});
      void reportToHq({
        type: "request",
        guildName: (await guildName(i.guild_id)) ?? i.guild_id,
        title: fields.get("title") ?? "",
        game,
        prize: fields.get("prize") ? `${fields.get("prize")} ${fields.get("currency") ?? "USD"}` : "",
      }).catch(() => {});
    } catch {
      await editWithError(i.token, "Couldn't send that request just now. Try again in a moment.");
    }
  });

  return json({
    type: InteractionResponseType.DeferredChannelMessageWithSource,
    data: { flags: MessageFlags.Ephemeral },
  });
}

function requestFailure(reason: string): string {
  switch (reason) {
    case "no_title": return "Give the challenge a name your members will recognise.";
    case "no_game": return "Pick a game first.";
    case "unknown_game": return "We don't sync stats for that game yet, so we couldn't score the challenge fairly.";
    case "too_many_pending": return "You already have three requests waiting on us. We'll get to them shortly.";
    default: return "Couldn't send that request. Try again in a moment.";
  }
}

async function guildName(guildId?: string): Promise<string | null> {
  if (!guildId) return null;
  try {
    const db = await getDb();
    const [g] = await db.select({ name: schema.discordGuilds.name })
      .from(schema.discordGuilds).where(eq(schema.discordGuilds.guildId, guildId)).limit(1);
    return g?.name || null;
  } catch { return null; }
}

async function notifyStaffOfRequest(requestId: string): Promise<void> {
  const { getRequest } = await import("@/lib/challenge-requests");
  const req = await getRequest(requestId);
  if (!req) return;
  const db = await getDb();
  const staff = await db.select({ id: schema.users.id })
    .from(schema.users).where(eq(schema.users.role, "admin")).limit(20);
  for (const s of staff) {
    try {
      await db.insert(schema.notifications).values({
        id: uid(),
        userId: s.id,
        type: "system",
        title: "A server wants to run a challenge",
        body: `${req.title} on ${req.game}${req.prizeValue ? ` — ${req.prizeValue} ${req.prizeCurrency} prize` : ""}.`,
        href: "/admin/discord/requests",
      }).onConflictDoNothing();
    } catch { /* non-fatal */ }
  }
}

// ===== Autocomplete (must answer synchronously) =====

async function autocomplete(i: Interaction) {
  const { query } = readCommand(i);
  let choices: { name: string; value: string }[] = [];
  try {
    // One box means one list: everything the bot can open, live from the
    // database — destinations, people and game lore. `openChoices` owns the
    // ordering, including the people-and-lore-first rule once there's a query,
    // so this stays a single call rather than two lists stapled together with
    // different ideas about what matters.
    choices = await openChoices(query, { isManager: isGuildManager(i) });
  } catch { choices = []; }
  return { type: InteractionResponseType.AutocompleteResult, data: { choices } };
}

// ===== Slash commands =====

function command(i: Interaction) {
  const { query } = readCommand(i);
  const who = actor(i);
  if (!who) return json({ type: InteractionResponseType.Pong });

  // `share` posts publicly on purpose — that's the point of sharing. Everything
  // else is ephemeral so the bot never floods a channel.
  const isShare = query.trim().toLowerCase() === "share";
  const flags = isShare ? undefined : MessageFlags.Ephemeral;

  const started = Date.now();
  after(async () => {
    let ctx: Awaited<ReturnType<typeof loadCtx>> | null = null;
    try {
      ctx = await loadCtx(who.id, who.global_name || who.username, i.guild_id, who.avatar, isGuildManager(i));
      if (isShare) return void (await share(i.token, ctx));
      const target = await screenForCommand(query);
      const payload = await renderScreen(target, target.screen === "home" ? [] : [frame("home")], ctx);
      await editOriginal(i.token, { ...payload, flags: payload.flags ?? flags });
    } catch {
      await editWithError(i.token, `Cluster couldn't load that just now. Try again, or open ${siteUrl()}.`);
    } finally {
      void logCommand({
        guildId: i.guild_id, discordId: who.id, userId: ctx?.gamer?.userId ?? null,
        command: `cluster ${query.split(":")[0] || "home"}`, arg: query || null,
        latencyMs: Date.now() - started,
      });
    }
  });

  return json({
    type: InteractionResponseType.DeferredChannelMessageWithSource,
    ...(flags ? { data: { flags } } : {}),
  });
}

// ===== Buttons =====

function componentPress(i: Interaction) {
  const who = actor(i);
  const customId = i.data?.custom_id ?? "";

  // A modal MUST be the immediate response to a fresh interaction — it cannot
  // be opened from a deferred edit. So "open-link|<game>" is handled before the
  // normal nav dispatch and answers synchronously.
  if (customId.startsWith("open-link|")) {
    const game = customId.slice("open-link|".length);
    const provider = providerForGame(game);
    // A press we can't answer gets an ANSWER, not silence. `DeferredUpdateMessage`
    // here meant the button visibly did nothing — indistinguishable from a dead
    // bot, and the exact symptom VALORANT produced for months. The screens no
    // longer render such a button; this is the backstop for old messages that
    // still carry one, since a pinned card lives forever.
    if (!provider) {
      return json({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: game
            ? `**${game}** can't be linked yet — its stats API isn't open to us. Run \`/cluster show:link\` to pick a game we can connect, or link it on the site: ${siteUrl()}/profile?tab=accounts`
            : `Run \`/cluster show:link\` to pick a game.`,
          flags: MessageFlags.Ephemeral,
        },
      });
    }
    return json(linkModal(game, provider));
  }
  // Same rule for the entry key on a server-gated challenge. No database work
  // here on purpose — a modal has to be the immediate answer, and the key is
  // verified on submit anyway.
  if (customId.startsWith("open-key|")) {
    const id = customId.slice("open-key|".length);
    if (!id) return json({ type: InteractionResponseType.DeferredUpdateMessage });
    return json(keyModal(id));
  }
  // The community profile's select menus.
  //
  // A select answers with `data.values` rather than a custom_id, so it can't go
  // through the nav grammar — but it must still re-render the screen so the
  // owner sees their answer stick. Manager-gated on the way in: this describes
  // the server to advertisers, and any member could otherwise rewrite it.
  if (customId.startsWith("set|")) {
    const [, field, guildId] = customId.split("|");
    const values = i.data?.values ?? [];
    if (!field || !guildId) return json({ type: InteractionResponseType.DeferredUpdateMessage });
    after(async () => {
      // Checked here rather than inline because the DM case needs a database
      // read: in a DM there is no member and no permissions, so the only proof
      // of authority is being the account we recorded as the server's owner.
      if (!(await maySetup(i, guildId))) return;
      try {
        const { saveCommunity } = await import("@/lib/discord/community");
        await saveCommunity(guildId, { [field]: values });
      } catch { /* the re-render below still shows the truth */ }
      await rerender(i, frame("setup", guildId), [frame("admin", "")]);
    });
    return json({ type: InteractionResponseType.DeferredUpdateMessage });
  }
  // The contact email (B47). Same rule: a modal must be the immediate answer to
  // a fresh interaction, so authority is re-checked on submit where there is
  // time for a database read.
  if (customId.startsWith("open-email|")) {
    const guildId = customId.slice("open-email|".length);
    if (!guildId) return json({ type: InteractionResponseType.DeferredUpdateMessage });
    return json(contactEmailModal(guildId));
  }
  // The one free-text box in that profile. A modal has to be the immediate
  // answer to a fresh interaction, so no database work happens here.
  if (customId.startsWith("open-about|")) {
    const guildId = customId.slice("open-about|".length);
    if (!guildId) return json({ type: InteractionResponseType.DeferredUpdateMessage });
    // Authority is re-checked on submit, where there is time for a database
    // read. Opening the box is harmless; saving what's in it is not.
    return json(aboutModal(guildId));
  }
  // Gifting a trophy (B5.2). Same rule — a modal must be the immediate answer,
  // so nothing is read or charged here. The trophy ids ride in the custom_id
  // because a modal submit arrives with no memory of the message it came from.
  // The gift buttons and the confirm press were here, and are gone with the
  // feature (B72.3). A trophy is redeemable for cash, so handing one to another
  // account is a transfer of value between two people — the money-transmission
  // trigger, the 1099 hole and the under-18 cash-out bypass, all in one button.
  //
  // Old `open-gift|` and gift-confirm custom ids simply fall through to the
  // unknown-interaction path now. A card posted before this deploy still exists
  // in somebody's channel; pressing its button does nothing rather than
  // reaching a handler that no longer has a recipient to resolve.


  // An owner writing to us. A modal has to be the immediate answer to a fresh
  // interaction, so authority is re-checked on submit where there is time.
  if (customId.startsWith("open-msg|")) {
    const guildId = customId.slice("open-msg|".length);
    if (!guildId) return json({ type: InteractionResponseType.DeferredUpdateMessage });
    return json(contactModal(guildId));
  }
  // A server owner filling in their challenge request.
  if (customId.startsWith("open-req|")) {
    const game = customId.slice("open-req|".length);
    if (!game) return json({ type: InteractionResponseType.DeferredUpdateMessage });
    return json(requestModal(game));
  }
  // "Request a challenge" — a plain nav to the game picker, but it can't use the
  // normal nav grammar because it isn't reached from a trail.
  if (customId.startsWith("nav-req|")) {
    return navigate(i, frame("req-game"), [frame("admin", "")]);
  }

  const parsed = parseId(customId);
  if (!who || !parsed) return json({ type: InteractionResponseType.DeferredUpdateMessage });

  // Decided ONCE, here, from the message the button was actually attached to.
  // Reading it inside the deferred work would be reading it after the response
  // has already been chosen, which is the wrong order — the acknowledgement
  // type below has to match what the deferred work is about to do.
  const publicCard = isPublicMessage(i);

  const started = Date.now();
  after(async () => {
    let ctx: Awaited<ReturnType<typeof loadCtx>> | null = null;
    try {
      ctx = await loadCtx(who.id, who.global_name || who.username, i.guild_id, who.avatar, isGuildManager(i));

      if (parsed.kind === "a") return void (await runAction(i, parsed.target, parsed.trail, ctx));

      // "Back" pops the trail: the first trail frame becomes the destination.
      const [target, trail] = parsed.kind === "b"
        ? [parsed.trail[0] ?? frame("home"), parsed.trail.slice(1)]
        : [parsed.target, parsed.trail];

      const payload = await renderScreen(target, trail, ctx);
      const body = {
        content: payload.content ?? "",
        embeds: payload.embeds ?? [],
        components: payload.components ?? [],
      };
      // ===== A PUBLIC CARD IS NEVER EDITED. M5 =====
      //
      // On an ephemeral card, editing the original is the whole point: the card
      // belongs to one person and navigation happens in place.
      //
      // On a PUBLIC announcement it was a bug with an audience. The bot posts a
      // challenge announcement into a server's channel, one member taps a
      // button, and the announcement is REPLACED — for everyone — with that
      // member's private screen. The server was paid to carry that
      // announcement and the next person to scroll past sees a stranger's
      // stats instead.
      //
      // `followUp` sends a NEW message on the same interaction token, so the
      // public card stays exactly as posted and the member gets their own.
      if (publicCard) await followUp(i.token, { ...body, flags: MessageFlags.Ephemeral });
      else await editOriginal(i.token, body);
    } catch {
      await editWithError(i.token, `Cluster couldn't load that just now. Try again, or open ${siteUrl()}.`);
    } finally {
      void logCommand({
        guildId: i.guild_id, discordId: who.id, userId: ctx?.gamer?.userId ?? null,
        command: "button", screen: parsed.target.screen, arg: parsed.target.args[0] ?? null,
        latencyMs: Date.now() - started,
      });
    }
  });

  // The acknowledgement has to agree with what the deferred work will do.
  //
  //   DeferredUpdateMessage (6)         "I am about to edit this message"
  //   DeferredChannelMessageWithSource  "I am about to send a new one"
  //
  // Answering a public press with type 6 and then calling `followUp` leaves the
  // public card showing a loading state it never comes out of. So the type is
  // chosen from the same fact the work is: was this a public card or not.
  return json(publicCard
    ? { type: InteractionResponseType.DeferredChannelMessageWithSource, data: { flags: MessageFlags.Ephemeral } }
    : { type: InteractionResponseType.DeferredUpdateMessage });
}

// Render a screen into the message that was clicked. Used by the few buttons
// that don't carry a nav trail in their custom_id.
// The community description, saved and shown back.
/**
 * An owner writing to us from inside Discord.
 *
 * Gated on the same permission as every other owner action: a server member who
 * can't manage the server can't open a support thread in its name, because
 * staff answering it would be answering the wrong person about somebody else's
 * community.
 */
// `giftSubmit` and `giftConfirm` were here — the search-for-a-gamer modal, the
// confirm-with-a-face step, and the press that spent. All deleted with the
// feature (B72.3).
//
// Worth keeping the reason the confirm step existed, because it was a good
// instinct that no longer has anything to guard: a gift had no refund path, so
// the flow deliberately showed the recipient's actual face before spending.
// Nothing transfers between accounts now, so there is nothing to mis-address.

function contactSubmit(i: Interaction, who: Who, guildId: string, body: string) {
  after(async () => {
    if (!(await maySetup(i, guildId))) {
      await editOriginal(i.token, { content: "Only this server's admins can message us on its behalf." });
      return;
    }
    const { ownerSend } = await import("@/lib/server-messages");
    const res = await ownerSend({ guildId, body, discordUserId: who.id, source: "discord" });
    await editOriginal(i.token, {
      content: res.ok
        ? "Sent. We answer here in your DMs and on your server dashboard — usually the same day."
        : "Couldn't send that. Try again, or write from your dashboard.",
    });
  });
  return json({
    type: InteractionResponseType.DeferredChannelMessageWithSource,
    data: { flags: MessageFlags.Ephemeral },
  });
}

/**
 * The owner's contact email, submitted from Discord (B47).
 *
 * The reply says whether that COMPLETED the profile, because completing it is
 * what switches the revenue share on — and an owner should learn that at the
 * moment it happens, not by noticing a number change weeks later.
 */
function contactEmailSubmit(i: Interaction, guildId: string, email: string) {
  after(async () => {
    if (!(await maySetup(i, guildId))) {
      await editOriginal(i.token, { content: "Only this server's admins can change that." });
      return;
    }
    let note = "Saved.";
    try {
      const { saveContactEmail, getProfile, PROFILE_FIELDS } = await import("@/lib/discord/community");
      const r = await saveContactEmail(guildId, email);
      if (!r.ok) {
        note = r.error ?? "That does not look like an email address.";
      } else {
        const after_ = await getProfile(guildId);
        note = after_.complete
          ? "Saved — your profile is complete, so the weekly server pool can pay you."
          : `Saved. Still needed before the pool can pay you: ${PROFILE_FIELDS.filter((f) => after_.missing.includes(f.key)).map((f) => f.label).join(", ")}.`;
      }
    } catch { note = "Could not save that just now."; }
    await rerender(i, frame("setup", guildId), [frame("admin", "")], { content: note, ephemeral: true });
  });
  return json({
    type: InteractionResponseType.DeferredChannelMessageWithSource,
    data: { flags: MessageFlags.Ephemeral },
  });
}

function aboutSubmit(i: Interaction, guildId: string, about: string) {
  after(async () => {
    if (!(await maySetup(i, guildId))) {
      await editOriginal(i.token, { content: "Only this server's admins can change that." });
      return;
    }
    try {
      const { saveCommunity } = await import("@/lib/discord/community");
      await saveCommunity(guildId, { about });
    } catch { /* fall through to the re-render, which shows what stuck */ }
    await rerender(i, frame("setup", guildId), [frame("admin", "")], {
      content: about ? "Saved — that's what a sponsor will read." : "Cleared.",
      ephemeral: true,
    });
  });
  return json({
    type: InteractionResponseType.DeferredChannelMessageWithSource,
    data: { flags: MessageFlags.Ephemeral },
  });
}

/**
 * May this person describe this server?
 *
 * Two ways to qualify, because the profile is reachable from two places: a
 * manager pressing inside the server itself, or the Discord account recorded as
 * the server's owner pressing in their DM — which is where the install message
 * went, and the only identity a DM interaction carries.
 */
async function maySetup(i: Interaction, guildId: string): Promise<boolean> {
  if (i.guild_id === guildId && isGuildManager(i)) return true;
  const who = actor(i);
  if (!who) return false;
  try {
    const { getGuildRow } = await import("@/lib/discord/guilds");
    const row = await getGuildRow(guildId);
    return !!row?.ownerDiscordId && row.ownerDiscordId === who.id;
  } catch { return false; }
}

/**
 * Draw a screen again into the interaction that is already open.
 *
 * Used by anything that CHANGES state and then wants the same screen back —
 * a select menu, a modal submit. `navigate` can't be reused because it starts
 * its own deferral; by the time these run, the deferral has already happened.
 */
async function rerender(
  i: Interaction,
  target: Frame,
  trail: Frame[],
  opts: { content?: string; ephemeral?: boolean } = {},
) {
  const who = actor(i);
  if (!who) return;
  try {
    const ctx = await loadCtx(who.id, who.global_name || who.username, i.guild_id, who.avatar, isGuildManager(i));
    const payload = await renderScreen(target, trail, ctx);
    await editOriginal(i.token, {
      content: opts.content ?? payload.content ?? "",
      embeds: payload.embeds ?? [],
      components: payload.components ?? [],
    });
  } catch {
    await editWithError(i.token, `Cluster couldn't load that just now. Try again, or open ${siteUrl()}.`);
  }
}

function navigate(i: Interaction, target: Frame, trail: Frame[]) {
  const who = actor(i);
  if (!who) return json({ type: InteractionResponseType.DeferredUpdateMessage });
  // Same rule as the main component handler, and it has to be here too: this is
  // the path the few buttons that carry no nav trail take, and they sit on the
  // same public announcements as everything else.
  const publicCard = isPublicMessage(i);
  after(async () => {
    try {
      const ctx = await loadCtx(who.id, who.global_name || who.username, i.guild_id, who.avatar, isGuildManager(i));
      const payload = await renderScreen(target, trail, ctx);
      const body = {
        content: payload.content ?? "",
        embeds: payload.embeds ?? [],
        components: payload.components ?? [],
      };
      // ===== A PUBLIC CARD IS NEVER EDITED. M5 =====
      //
      // On an ephemeral card, editing the original is the whole point: the card
      // belongs to one person and navigation happens in place.
      //
      // On a PUBLIC announcement it was a bug with an audience. The bot posts a
      // challenge announcement into a server's channel, one member taps a
      // button, and the announcement is REPLACED — for everyone — with that
      // member's private screen. The server was paid to carry that
      // announcement and the next person to scroll past sees a stranger's
      // stats instead.
      //
      // `followUp` sends a NEW message on the same interaction token, so the
      // public card stays exactly as posted and the member gets their own.
      if (publicCard) await followUp(i.token, { ...body, flags: MessageFlags.Ephemeral });
      else await editOriginal(i.token, body);
    } catch {
      await editWithError(i.token, `Cluster couldn't load that just now. Try again, or open ${siteUrl()}.`);
    }
  });
  return json(publicCard
    ? { type: InteractionResponseType.DeferredChannelMessageWithSource, data: { flags: MessageFlags.Ephemeral } }
    : { type: InteractionResponseType.DeferredUpdateMessage });
}

async function runAction(i: Interaction, target: Frame, trail: Frame[], ctx: Awaited<ReturnType<typeof loadCtx>>) {
  // Running a challenge: pause, resume, end. A server owner may do this to a
  // challenge that belongs to THEIR server; the permission check lives in
  // lib/challenges.ts so the web admin and the bot can't disagree about it.
  const state = ({ "ch-pause": "paused", "ch-resume": "active", "ch-end": "completed" } as const)[
    target.screen as "ch-pause" | "ch-resume" | "ch-end"
  ];
  if (state) {
    const res = await setChallengeState(target.args[0] ?? "", state, { staff: false, guildId: i.guild_id ?? "" });
    if (!res.ok) {
      await editOriginal(i.token, {
        embeds: [{
          color: 0xf59e0b,
          description: res.reason === "forbidden"
            ? "Only the server a challenge belongs to can run it."
            : res.reason === "bad_state"
              ? "That challenge has already finished."
              : "Couldn't change that challenge just now.",
        }],
      });
      return;
    }
  }

  if (target.screen === "share") {
    await share(i.token, ctx, true);
    return;
  }

  // Joining a challenge from Discord runs the exact same rules as joining on
  // the site (lib/challenges.ts) — same entry gate, same baseline snapshot,
  // same CP award. Only `joinedFrom` differs, which is the funnel metric.
  if (target.screen === "join" && ctx.gamer) {
    const id = target.args[0] ?? "";
    // Which account, when the card offered a choice. A gamer with a main and a
    // smurf gets one button per account, and this is the half that makes the
    // difference between the buttons matter.
    const accountId = target.args[1] ?? "";
    // Inside the server a gated challenge belongs to, the key is already on the
    // card — so joining there is one tap instead of retyping what you can see.
    // Everywhere else the key modal runs first and hands the verified key back
    // on the button, which is what makes "pick your account" possible on a
    // gated challenge at all.
    const gate = await challengeGate(id);
    const key = (target.args[2] ?? null)
      || (gate.locked && keyVisibleTo(gate, i.guild_id ?? null) ? gate.accessKey : null);
    const res = await joinChallengeFor(ctx.gamer.userId, id, {
      ...(accountId ? { linkedAccountId: accountId } : {}),
      source: "discord", accessKey: key, guildId: i.guild_id ?? null,
    });
    if (!res.ok) {
      await editOriginal(i.token, {
        embeds: [{ color: 0xf59e0b, description: joinFailure(res.reason, res.unmet) }],
      });
      return;
    }
  }

  // The portal key opens a server's whole dashboard, so it is DM'd, never
  // posted. Discord refuses DMs from people who have them closed, and the
  // difference matters to the person waiting for it — so say which happened.
  if (target.screen === "portal-key" && i.guild_id) {
    const portal = await ensurePortal(i.guild_id);
    const sent = portal
      ? await dmUser(ctx.discordId, {
        embeds: [{
          title: "Your Cluster server portal",
          description: [
            `${siteUrl()}/servers/${portal.slug}`,
            "",
            `Portal key: **\`${portal.key}\`**`,
            "",
            "Keep this private — it opens your growth numbers, your challenges, the traffic we send you, and everything your members do with the bot.",
          ].join("\n"),
          color: 0x8b5cf6,
        }],
      }).catch(() => false)
      : false;
    await editOriginal(i.token, {
      embeds: [{
        color: sent ? 0x34d399 : 0xf59e0b,
        description: sent
          ? "Sent — check your DMs."
          : "I couldn't DM you. Turn on direct messages from server members, then try again.",
      }],
    });
    return;
  }

  // ===== Server settings, from the admin card =====
  //
  // Each of these was a column in the database that only we could change, which
  // made "turn the daily post off" a support request. They are gated on
  // Discord's own manager permission — the same gate the admin card itself is
  // behind — because they change what appears in somebody's server.
  const SETTINGS = new Set(["ad-optin", "announce", "repost-guides", "set-channel"]);
  if (SETTINGS.has(target.screen)) {
    if (!i.guild_id || !ctx.isManager) {
      await editOriginal(i.token, {
        embeds: [{ color: 0xf59e0b, description: "Only this server's admins and moderators can change that." }],
      });
      return;
    }
    const on = target.args[0] === "1";
    try {
      if (target.screen === "ad-optin") {
        await upsertGuild(i.guild_id, { adOptIn: on });
      } else if (target.screen === "announce") {
        await upsertGuild(i.guild_id, { announcementsEnabled: on });
      } else if (target.screen === "set-channel") {
        // Wherever they pressed the button. An owner who wants Cluster in a
        // different channel types the command there — no channel picker, no id
        // to copy.
        if (i.channel_id) await upsertGuild(i.guild_id, { channelId: i.channel_id });
      } else if (target.screen === "repost-guides") {
        const { postGuides } = await import("@/lib/discord/onboard");
        const row = await getGuildRow(i.guild_id);
        const channel = row?.channelId ?? i.channel_id ?? null;
        if (channel) void postGuides(channel).catch(() => {});
      }
    } catch { /* the re-render below still shows the real current state */ }
  }

  // Voting from Discord is deliberate: requiring a sign-up before a server can
  // back one of their own would kill the exact moment worth capturing. One vote
  // per Discord identity, enforced in the database.
  if (target.screen === "vote") {
    const slug = target.args[0] ?? "";
    const res = await voteForSlug(slug, ctx.discordId, i.guild_id);
    if (!res.ok) {
      await editOriginal(i.token, {
        embeds: [{ color: 0xf59e0b, description: res.reason === "self" ? "You can't vote for your own profile." : "Couldn't record that vote." }],
      });
      return;
    }
  }

  // Buying a trophy from the marketplace card.
  //
  // The price, the balance and the ownership check all live in
  // `buyTrophy` — nothing here is trusted from the button, because a card
  // posted an hour ago carries an hour-old balance on its face.
  if (target.screen === "buy") {
    if (!ctx.gamer) {
      await editOriginal(i.token, {
        embeds: [{
          color: 0xf59e0b,
          description: `Continue with Discord first and your balance is waiting: ${siteUrl()}/login`,
        }],
      });
      return;
    }
    const { buyTrophy } = await import("@/lib/marketplace");
    const res = await buyTrophy(ctx.gamer.userId, target.args[0] ?? "");
    if (!res.ok) {
      await editOriginal(i.token, { embeds: [{ color: 0xf59e0b, description: res.error }] });
      return;
    }
    // Fall through to the re-render, so the card comes back with the new
    // balance and the tiles they can now afford — but say what happened first,
    // because a picture changing is not an acknowledgement.
    const payload = await renderScreen(frame("market"), trail, ctx);
    await editOriginal(i.token, {
      content: `**${res.trophy}** is yours — ${res.cpSpent.toLocaleString()} CP spent, `
        + `${res.balance.toLocaleString()} left. It's on your profile and it can be redeemed for cash.`,
      embeds: payload.embeds ?? [],
      components: payload.components ?? [],
    });
    return;
  }

  // Re-render whatever screen the action was launched from, so the button
  // state (e.g. "Join" → "You've joined") reflects what just happened.
  const back = trail[0] ?? frame("home");
  const payload = await renderScreen(back, trail.slice(1), ctx);
  await editOriginal(i.token, {
    content: payload.content ?? "",
    embeds: payload.embeds ?? [],
    components: payload.components ?? [],
  });
}

// Resolve a profile slug then record the vote.
async function voteForSlug(slug: string, discordId: string, guildId?: string) {
  const db = await getDb();
  const [u] = await db.select({ id: schema.users.id })
    .from(schema.users).where(eq(schema.users.slug, slug)).limit(1);
  if (!u) return { ok: false as const, reason: "not_found" };
  return castDiscordVote(u.id, discordId, guildId ?? null);
}

function joinFailure(reason: string, unmet?: string[]): string {
  switch (reason) {
    case "requirements":
      // Name the rank they need, not "you don't qualify". A gate a gamer can't
      // read is a gate they'll argue with in the server's chat.
      return unmet?.length
        ? `This challenge is for a skill bracket you're not in yet: **${unmet.join("**, **")}**. Your rank syncs automatically — come back when you climb.`
        : "You don't meet this challenge's entry requirements yet.";
    case "no_account": return "You need a linked account for that game first — run `/cluster show:link`.";
    case "gated": return "This challenge requires quest badges you haven't earned yet.";
    case "locked": return "This one needs an entry key — it was sent to the server running the challenge.";
    case "bad_key": return "That key isn't right. Ask a mod in the server running this challenge for the current one.";
    case "not_active": return "That challenge isn't live anymore.";
    // B94. Said with the reason, because "finish setting up" on its own reads
    // as a nag rather than as the thing standing between them and a prize.
    case "onboarding":
      return "Finish setting up your Cluster account first — it takes a minute at "
        + "**clustergg.com/onboarding**. We need to know your age and your country before you can "
        + "win something we might have to pay you for.";
    default: return "Couldn't join that challenge.";
  }
}

// Which provider backs a game, so `/cluster show:link game:Chess` knows what to
// create. Uses the same registry the website links through.
function providerForGame(game: string): string | null {
  return linkableProvider(game)?.id ?? null;
}

// ===== Share =====

async function share(token: string, ctx: Awaited<ReturnType<typeof loadCtx>>, asFollowUp = false) {
  if (!ctx.gamer) {
    await editOriginal(token, {
      content: `Continue with Discord first — then your profile is ready to share: ${siteUrl()}/login`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const { url, data } = await cardRef("profile", { slug: ctx.gamer.slug });
  const msg = await shareMessage(ctx.gamer.displayName, `${siteUrl()}/u/${ctx.gamer.slug}`);
  const accent = data && "theme" in data ? data.theme.accent : null;
  // A shared card is the one message in this bot that STRANGERS read, so it
  // carries the two things a stranger can do with it — vote for it, and get one
  // of their own — rather than being a picture with nothing to press.
  const payload = {
    content: msg,
    embeds: [{
      color: embedColor(accent),
      image: { url },
      footer: { text: "Votes decide the Best Profile board." },
    }],
    components: rows([
      button("Vote for this profile", actionId("vote", [ctx.gamer.slug], [frame("home")]), ButtonStyle.Success, "⭐"),
      navButton("Get your own card", frame("home"), [], ButtonStyle.Primary, "🚀"),
      linkButton("Open profile", `${siteUrl()}/u/${ctx.gamer.slug}`, "🔗"),
    ]),
  };
  if (asFollowUp) await followUp(token, payload);
  else await editOriginal(token, payload);

  // THE `share_card` EMITTER. B72.3.
  //
  // `share_card` has been priced in the catalogue and named in mission
  // templates since B61, and until now NOTHING FIRED IT — a task nobody could
  // ever complete, sitting in a mission that claimed to total the daily
  // ceiling. The execution review caught that B72.3's mission rebuild was about
  // to lean on it too, which would have recreated the same defect while fixing
  // another. So it is built here, inside the item that needs it.
  //
  // Awarded AFTER the post, because the action being paid for is the card
  // landing in a channel, not a button being pressed. Keyed on the day so the
  // same gamer sharing five times pays once per day up to the catalogue cap —
  // sharing is free to do and free to repeat, and a per-post award would be a
  // loop that pays for itself.
  //
  // Errors are not swallowed silently: `awardQuestAction` logs its own, and a
  // failed award must never fail the share that a gamer just made publicly.
  if (ctx.gamer) {
    const { awardQuestAction } = await import("@/lib/quests");
    const { getDb } = await import("@/lib/db");
    await awardQuestAction(await getDb(), ctx.gamer.userId, "share_card", {
      refType: "share", refId: new Date().toISOString().slice(0, 10),
    });
  }
}
