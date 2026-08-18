// The Games family — game list · one game · link account · prove ownership.
//
// ===== THIS IS WHERE `riot-verify` FINALLY HAS A DOOR =====
//
// `lib/providers/riot-verify.ts` and `lib/providers/riot-methods.ts` have sat
// on `NOT_YET_RENDERED` since Sprint 10a, excused with a sprint name: *"reached
// from the bot's prove-ownership card, which is Sprint 12's."* This is that
// card, and the allowance expires with it.
//
// ===== G4 AND G5 ARE ONE RULE READ TWO WAYS =====
//
//   G4 — proof is **required** where the game's API supports it.
//   G5 — where it cannot, entry is allowed with an unproven account, and there
//        is **no badge, no warning, no second class.**
//
// So this family never labels an account "unproven". A gamer on a game with no
// ownership endpoint has done nothing wrong and must not be shown a state that
// implies they have. The only place proof is mentioned is on a game that
// actually supports it, where it is an instruction rather than a judgement.
//
// C5, from the copy rules, is the other half: never claim an account is
// *verified* unless ownership was actually proven. `verified: true` with method
// `exists` means the account is real, which is a different sentence.

import { ButtonStyle } from "../types.ts";
import { frame, navButton, linkButton, button, actionId } from "../components.ts";
import { siteUrl } from "../config.ts";
import { screen } from "../interactions.ts";
import { cardReply } from "./card.ts";
import { homeTail } from "./home.ts";

/** Whether this provider can actually prove an account belongs to somebody. */
function provesOwnership(providerId: string): boolean {
  // Riot is the one we hold a method for — the profile-icon challenge in
  // `riot-verify.ts`, which rides on two of the personal key's approved 39.
  return providerId.startsWith("riot-");
}

screen("games", async ({ trail }) => {
  const { gamesWithChallenges } = await import("../../site/queries.ts");
  const games = await gamesWithChallenges();
  const live = games.filter((g) => g.live);

  return cardReply(
    {
      title: "Games",
      subtitle:
        live.length === 0
          ? "No game is playable on this deployment yet."
          : "Only games whose API can referee a match. If we cannot score it, we do not run it.",
      rows: live.slice(0, 8).map((g) => ({
        label: `${g.provider.glyph} ${g.provider.name}`,
        value: `${g.challenges} challenge${g.challenges === 1 ? "" : "s"}`,
      })),
      footer: "ClusterGG",
    },
    {
      buttons: [
        ...live
          .slice(0, 5)
          .map((g) => navButton(g.provider.name.slice(0, 40), frame("game", g.provider.id), trail)),
        ...homeTail(trail),
      ],
    },
  );
});

screen("game", async ({ frame: f, trail }) => {
  const slug = f.args[0];
  const { gameBySlug } = await import("../../site/queries.ts");
  const found = slug ? await gameBySlug(slug) : null;

  if (!found) {
    return cardReply(
      { title: "We do not run challenges on that game" },
      { textOnly: true, buttons: [...homeTail(trail)] },
    );
  }

  const { provider, live, challenges } = found;
  const joinable = challenges.filter((c) => c.state === "announced" || c.state === "live");

  return cardReply(
    {
      title: `${provider.glyph} ${provider.name}`,
      subtitle: live
        ? undefined
        : "Not live — we cannot read this game's stats yet, so it cannot be scored or sold.",
      rows: [
        {
          label: "What scores",
          value:
            provider.capabilities
              .filter((c) => c.scoreable)
              .map((c) => c.label)
              .join(", ") || "Nothing yet",
        },
        { label: "Open challenges", value: String(joinable.length) },
      ],
      footer: "Wins and matches, counted. No win rate, no percentages, no ratios",
    },
    {
      buttons: [
        live
          ? button(
              "Link my account",
              actionId("link", [provider.id], trail),
              ButtonStyle.Primary,
              "🔗",
            )
          : null,
        ...joinable.slice(0, 3).map((c) => navButton(c.title.slice(0, 40), frame("challenge", c.id), trail)),
        ...homeTail(trail),
      ],
    },
  );
});

/**
 * Link a game account.
 *
 * The modal that takes an in-game name is Discord's, and a modal cannot be
 * opened from a deferred response — so the card sends them to the web form and
 * comes back. That is honest about what the transport allows rather than a
 * dead button that opens nothing.
 */
screen("link", async ({ frame: f, trail, presser }) => {
  const providerId = f.args[0];
  const { getProvider } = await import("../../providers/registry.ts");
  const provider = providerId ? getProvider(providerId) : null;

  if (!provider) {
    return cardReply(
      { title: "We do not run challenges on that game" },
      { textOnly: true, ephemeral: true, buttons: [...homeTail(trail)] },
    );
  }

  const { getDb } = await import("../../db/index.ts");
  const { accountsFor } = await import("../../identity/accounts.ts");
  const { isProven } = await import("../../identity/accounts.ts");
  const existing = presser.userId
    ? (await accountsFor(await getDb(), presser.userId)).filter((a) => a.provider === provider.id)
    : [];

  const proven = existing.some((a) => isProven(a.verifiedMethod));

  return cardReply(
    {
      title: `Link your ${provider.name} account`,
      subtitle: existing.length
        ? // C5 — "linked" for an account that merely resolves, and the word
          // "proven" only where ownership was actually established.
          `${existing[0].inGameName ?? existing[0].providerAccountId} · ${proven ? "ownership proven" : "linked"}`
        : provider.identifierLabel,
      rows: [
        { label: "What we read", value: "Wins and matches, from the publisher's own API" },
        { label: "What we never read", value: "Your messages, your friends, anything in Discord" },
      ],
      footer: provider.identifierHint ?? "ClusterGG",
    },
    {
      textOnly: true,
      ephemeral: true,
      buttons: [
        linkButton("Link it on the web", `${siteUrl()}/settings/connections`, "🔗"),
        // G4 — offered only where the API supports proof. On a game that
        // cannot prove ownership there is no button, no badge and no warning:
        // it is not the gamer's fault the publisher has no endpoint (G5/O3).
        existing.length && provesOwnership(provider.id) && !proven
          ? button("Prove it is mine", actionId("prove", [provider.id], trail), ButtonStyle.Primary, "🪪")
          : null,
        ...homeTail(trail),
      ],
    },
  );
});

/**
 * Prove ownership — the profile-icon challenge.
 *
 * `newIconChallenge` picks a starter icon everybody owns, so the challenge is
 * always completable. `iconImageUrl` is what lets the card **show** the icon
 * rather than name a number, which is the difference between an instruction
 * somebody can follow and one they have to go and look up.
 */
screen("prove", async ({ frame: f, trail, presser }) => {
  const providerId = f.args[0] ?? "riot-lol";
  const { getProvider } = await import("../../providers/registry.ts");
  const provider = getProvider(providerId);

  if (!provider || !provesOwnership(providerId)) {
    // G5, said as a fact about us rather than about them.
    return cardReply(
      {
        title: "Nothing to prove here",
        subtitle:
          "This game's API has no way for us to check an account belongs to you, so we do not ask. " +
          "You are not second class for it and nothing about your entry changes.",
      },
      { textOnly: true, ephemeral: true, buttons: [...homeTail(trail)] },
    );
  }

  const { getDb } = await import("../../db/index.ts");
  const { accountsFor, isProven } = await import("../../identity/accounts.ts");
  const accounts = presser.userId
    ? (await accountsFor(await getDb(), presser.userId)).filter((a) => a.provider === providerId)
    : [];
  const account = accounts[0];

  if (!account) {
    return cardReply(
      { title: "Link the account first", subtitle: "There is nothing to prove yet." },
      {
        textOnly: true,
        ephemeral: true,
        buttons: [
          button("Link my account", actionId("link", [providerId], trail), ButtonStyle.Primary, "🔗"),
          ...homeTail(trail),
        ],
      },
    );
  }

  if (isProven(account.verifiedMethod)) {
    return cardReply(
      { title: "Already proven", subtitle: `${account.inGameName ?? account.providerAccountId} is yours.` },
      { textOnly: true, ephemeral: true, buttons: [...homeTail(trail)] },
    );
  }

  const { newIconChallenge, iconImageUrl, PROOF_WINDOW_MIN } = await import(
    "../../providers/riot-verify.ts"
  );
  const challenge = newIconChallenge();

  return cardReply(
    {
      title: "Prove it is yours",
      subtitle: `Set your ${provider.name} profile icon to the one below, then press Verify.`,
      // The icon art itself, which is the whole reason this is a card and not
      // a sentence. Artwork is fenced by `cardReply`, so a Data Dragon outage
      // costs the picture and not the instruction.
      imageUrl: iconImageUrl(challenge.iconId),
      rows: [
        { label: "Icon", value: `#${challenge.iconId}` },
        { label: "You have", value: `${PROOF_WINDOW_MIN} minutes` },
      ],
      footer:
        "Only somebody signed into that account can change its icon — that is what makes this proof",
    },
    {
      ephemeral: true,
      buttons: [
        button(
          "Verify",
          actionId("verify", [providerId, String(challenge.iconId)], trail),
          ButtonStyle.Primary,
          "✅",
        ),
        ...homeTail(trail),
      ],
    },
  );
});

screen("verify", async ({ frame: f, trail, presser }) => {
  const [providerId, iconId] = f.args;
  const { getDb } = await import("../../db/index.ts");
  const { accountsFor } = await import("../../identity/accounts.ts");
  const accounts = presser.userId
    ? (await accountsFor(await getDb(), presser.userId)).filter((a) => a.provider === providerId)
    : [];
  const account = accounts[0];

  if (!account || !iconId) {
    return cardReply(
      { title: "Nothing to verify" },
      { textOnly: true, ephemeral: true, buttons: [...homeTail(trail)] },
    );
  }

  const { checkIconProof } = await import("../../providers/riot-verify.ts");
  const result = await checkIconProof(account.providerAccountId, Number(iconId));

  if (result.ok) {
    // ===== THE PROOF GOES BACK THROUGH `linkAccount`, NOT ROUND IT =====
    //
    // There is deliberately no `markProven`. L2 — *"a gamer who proves
    // ownership takes the account from one who only claimed it"* — lives in
    // `linkAccount`, and a second function that set `verifiedMethod` directly
    // would be a way to become proven without ever passing L1's uniqueness or
    // L2's transfer. One door.
    const { linkAccount } = await import("../../identity/accounts.ts");
    await linkAccount(await getDb(), {
      userId: presser.userId!,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      inGameName: account.inGameName,
      region: account.region,
      verifiedMethod: "icon",
    });
    return cardReply(
      { title: "Proven", subtitle: "That account is yours. You can change your icon back." },
      { textOnly: true, ephemeral: true, buttons: [...homeTail(trail)] },
    );
  }

  // 06 §1 shot 7 — *"we still see the old icon"*. The refusal names what we
  // saw, because "verification failed" tells somebody nothing they can act on.
  return cardReply(
    { title: "Not yet", subtitle: result.error },
    {
      ephemeral: true,
      textOnly: true,
      buttons: [
        button("Try again", actionId("verify", [providerId, iconId], trail), ButtonStyle.Primary, "🔁"),
        ...homeTail(trail),
      ],
    },
  );
});
