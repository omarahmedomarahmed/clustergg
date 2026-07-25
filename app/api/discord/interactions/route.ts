import { NextRequest, NextResponse, after } from "next/server";
import { verifyInteraction } from "@/lib/discord/verify";
import { canVerify, canAct, appId, publicKeyShape, siteUrl } from "@/lib/discord/config";
import {
  InteractionType, InteractionResponseType, MessageFlags,
  actor, readCommand, type Interaction,
} from "@/lib/discord/types";
import { parseId, frame, type Frame } from "@/lib/discord/components";
import { gameChoices, questChoices, guideChoices, showChoices } from "@/lib/discord/catalog";
import { renderScreen, screenForCommand, loadCtx, linkModal, keyModal } from "@/lib/discord/screens";
import { editOriginal, editWithError, followUp } from "@/lib/discord/reply";
import { cardRef } from "@/lib/discord/cards";
import { shareMessage } from "@/lib/discord/share";
import { joinChallengeFor, challengeGate, keyVisibleTo } from "@/lib/challenges";
import { linkGameAccountFor } from "@/lib/link-account";
import { PROVIDERS } from "@/lib/providers/registry";
import { logCommand } from "@/lib/discord/guilds";
import { castDiscordVote } from "@/lib/identity";
import { inGameNameChoices } from "@/lib/gamer-lookup";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

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
  return json({ type: InteractionResponseType.DeferredUpdateMessage });
}

function linkSubmit(i: Interaction, who: Who, provider: string, fields: Map<string, string>) {
  after(async () => {
    try {
      const ctx = await loadCtx(who.id, who.global_name || who.username, i.guild_id);
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
      await editOriginal(i.token, {
        content: `**${res.name}** linked. Your ${res.game} stats sync from here on.`,
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
      const ctx = await loadCtx(who.id, who.global_name || who.username, i.guild_id);
      if (!ctx.gamer) {
        await editOriginal(i.token, { content: `Continue with Discord first, then link your game account: ${siteUrl()}/login` });
        return;
      }
      const res = await joinChallengeFor(ctx.gamer.userId, challengeId, { source: "discord", accessKey: key });
      if (!res.ok) {
        await editOriginal(i.token, { embeds: [{ color: 0xf59e0b, description: joinFailure(res.reason) }] });
        return;
      }
      const payload = await renderScreen(frame("challenge", challengeId), [frame("home")], ctx);
      await editOriginal(i.token, {
        content: res.already
          ? `You were already in **${res.title}**.`
          : `Key accepted — you're in **${res.title}**. Only activity from now on counts.`,
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

// ===== Autocomplete (must answer synchronously) =====

async function autocomplete(i: Interaction) {
  const { sub, opts, focused } = readCommand(i);
  const q = focused ? (opts[focused] ?? "") : "";
  let choices: { name: string; value: string }[] = [];
  try {
    if (focused === "game") choices = await gameChoices(q);
    else if (focused === "name") choices = await questChoices(q);
    else if (focused === "topic") choices = await guideChoices(q);
    else if (focused === "gamer") {
      // Suggest real in-game names for whichever game they picked, so
      // `/cluster show valorant …` completes to people who actually exist.
      const what = opts.what ?? "";
      const game = what.startsWith("game:") ? what.slice(5) : what;
      choices = game && !/^(profile|cp|discord)$/i.test(game) ? await inGameNameChoices(game, q) : [];
    }
    else if (focused === "what") choices = await showChoices(q);
    else if (sub === "show") choices = await showChoices(q);
  } catch { choices = []; }
  return { type: InteractionResponseType.AutocompleteResult, data: { choices } };
}

// ===== Slash commands =====

function command(i: Interaction) {
  const { sub, opts } = readCommand(i);
  const who = actor(i);
  if (!who) return json({ type: InteractionResponseType.Pong });

  // `share` posts publicly on purpose — that's the point of sharing. Everything
  // else is ephemeral so the bot never floods a channel.
  const isShare = sub === "share";
  const flags = isShare ? undefined : MessageFlags.Ephemeral;

  const started = Date.now();
  after(async () => {
    let ctx: Awaited<ReturnType<typeof loadCtx>> | null = null;
    try {
      ctx = await loadCtx(who.id, who.global_name || who.username, i.guild_id);
      if (isShare) return void (await share(i.token, ctx));
      const target = screenForCommand(sub, opts);
      const payload = await renderScreen(target, target.screen === "home" ? [] : [frame("home")], ctx);
      await editOriginal(i.token, { ...payload, flags: payload.flags ?? flags });
    } catch {
      await editWithError(i.token, `Cluster couldn't load that just now. Try again, or open ${siteUrl()}.`);
    } finally {
      void logCommand({
        guildId: i.guild_id, discordId: who.id, userId: ctx?.gamer?.userId ?? null,
        command: `cluster ${sub}`, arg: Object.values(opts)[0] ?? null,
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
    if (!provider) return json({ type: InteractionResponseType.DeferredUpdateMessage });
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

  const parsed = parseId(customId);
  if (!who || !parsed) return json({ type: InteractionResponseType.DeferredUpdateMessage });

  const started = Date.now();
  after(async () => {
    let ctx: Awaited<ReturnType<typeof loadCtx>> | null = null;
    try {
      ctx = await loadCtx(who.id, who.global_name || who.username, i.guild_id);

      if (parsed.kind === "a") return void (await runAction(i, parsed.target, parsed.trail, ctx));

      // "Back" pops the trail: the first trail frame becomes the destination.
      const [target, trail] = parsed.kind === "b"
        ? [parsed.trail[0] ?? frame("home"), parsed.trail.slice(1)]
        : [parsed.target, parsed.trail];

      const payload = await renderScreen(target, trail, ctx);
      await editOriginal(i.token, {
        content: payload.content ?? "",
        embeds: payload.embeds ?? [],
        components: payload.components ?? [],
      });
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

  // Acknowledge by editing the SAME message — this is what makes navigation
  // feel in-place instead of spawning a new message per click.
  return json({ type: InteractionResponseType.DeferredUpdateMessage });
}

async function runAction(i: Interaction, target: Frame, trail: Frame[], ctx: Awaited<ReturnType<typeof loadCtx>>) {
  if (target.screen === "share") {
    await share(i.token, ctx, true);
    return;
  }

  // Joining a challenge from Discord runs the exact same rules as joining on
  // the site (lib/challenges.ts) — same entry gate, same baseline snapshot,
  // same CP award. Only `joinedFrom` differs, which is the funnel metric.
  if (target.screen === "join" && ctx.gamer) {
    const id = target.args[0] ?? "";
    // Inside the server a gated challenge belongs to, the key is already on the
    // card — so joining there is one tap instead of retyping what you can see.
    // Everywhere else this button isn't rendered; the key modal is.
    const gate = await challengeGate(id);
    const key = gate.locked && keyVisibleTo(gate, i.guild_id ?? null) ? gate.accessKey : null;
    const res = await joinChallengeFor(ctx.gamer.userId, id, { source: "discord", accessKey: key });
    if (!res.ok) {
      await editOriginal(i.token, {
        embeds: [{ color: 0xf59e0b, description: joinFailure(res.reason) }],
      });
      return;
    }
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

function joinFailure(reason: string): string {
  switch (reason) {
    case "no_account": return "You need a linked account for that game first — run `/cluster link`.";
    case "gated": return "This challenge requires quest badges you haven't earned yet.";
    case "locked": return "This one needs an entry key — it was sent to the server running the challenge.";
    case "bad_key": return "That key isn't right. Ask a mod in the server running this challenge for the current one.";
    case "not_active": return "That challenge isn't live anymore.";
    default: return "Couldn't join that challenge.";
  }
}

// Which provider backs a game, so `/cluster link game:Chess` knows what to
// create. Uses the same registry the website links through.
function providerForGame(game: string): string | null {
  // Identity-only providers (Discord, Epic) have no stats to sync, so they
  // aren't linkable as a game account.
  const p = PROVIDERS.find((x) => x.game.toLowerCase() === game.toLowerCase() && !x.identityOnly);
  return p?.id ?? null;
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
  const { url } = await cardRef("profile", { slug: ctx.gamer.slug });
  const msg = await shareMessage(ctx.gamer.displayName, `${siteUrl()}/u/${ctx.gamer.slug}`);
  const payload = {
    content: msg,
    embeds: [{ color: 0x8b5cf6, image: { url } }],
    components: [],
  };
  if (asFollowUp) await followUp(token, payload);
  else await editOriginal(token, payload);
}
