import { NextResponse } from "next/server";
import { appId } from "@/lib/discord/config";
import { listGlobalCommands } from "@/lib/discord/rest";
import { ALL_COMMANDS } from "@/lib/discord/commands";
import { OptionType } from "@/lib/discord/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The command JSON a bot list can actually import.
//
// Top.gg (and Discord Bot List, and BotList.me) all say "paste your command
// JSON", and what they mean is the array Discord's own API returns from
//
//   GET /applications/{application.id}/commands
//
// Not the array we PUT to that endpoint. The two are different shapes: our
// registration payload carries `name`, `description` and `options` and nothing
// else, while Discord's response adds `id`, `application_id`, `type`,
// `version`, `default_member_permissions`, `nsfw`, `integration_types` and
// `contexts`. Paste the payload into a list that is expecting the response and
// you get "we were unable to parse your discord application command JSON",
// which is exactly what happened.
//
// So this endpoint returns the RESPONSE shape. When the bot token is
// configured it proxies Discord directly, so what a list imports is literally
// what Discord has registered. When it isn't — before credentials exist, or in
// a preview deploy — it builds the same shape from the definitions in
// lib/discord/commands.ts, so the JSON is always valid and always importable.
//
// Public on purpose: a slash command is public by definition (anyone in a
// server can see it by typing `/`), and a JSON file you need a secret to fetch
// is a JSON file you cannot paste into a bot list.

/** A placeholder snowflake — 19 digits, stable per name, so ids never collide. */
function fakeSnowflake(seed: string): string {
  let h = 0n;
  for (const ch of seed) h = (h * 31n + BigInt(ch.codePointAt(0) ?? 0)) % 10n ** 18n;
  return String(10n ** 18n + h);
}

type Registered = Record<string, unknown>;

/**
 * Our registration payload, in the shape Discord answers with.
 *
 * Every field a list's parser is likely to require is present and correctly
 * typed — ids as STRINGS (a 19-digit number is past `Number.MAX_SAFE_INTEGER`
 * and a parser that reads it as a number gets a different id back), `type: 1`
 * for CHAT_INPUT, and `options[].type` as the numeric enum rather than a name.
 */
function synthesize(applicationId: string): Registered[] {
  return ALL_COMMANDS.map((c) => ({
    id: fakeSnowflake(c.name),
    application_id: applicationId,
    version: fakeSnowflake(`${c.name}:v`),
    // 1 = CHAT_INPUT. Absent in our payload because Discord defaults it; a
    // list's parser has no such default.
    type: 1,
    name: c.name,
    // Discord always answers with these two, empty when unlocalised. A parser
    // expecting an object and finding `undefined` is one more way to fail.
    name_localizations: null,
    description: c.description,
    description_localizations: null,
    options: (c.options ?? []).map((o) => ({
      type: o.type ?? OptionType.String,
      name: o.name,
      name_localizations: null,
      description: o.description,
      description_localizations: null,
      required: Boolean(o.required),
      autocomplete: Boolean(o.autocomplete),
    })),
    default_member_permissions: null,
    dm_permission: true,
    // The modern pair that replaced `dm_permission`. Both are sent: lists have
    // parsers of different vintages and neither field hurts the other.
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    nsfw: false,
  }));
}

export async function GET() {
  const id = appId();

  // Live first: what a list imports should be what Discord actually has.
  if (id) {
    const res = await listGlobalCommands();
    if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
      return NextResponse.json(res.data, {
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }
  }

  return NextResponse.json(synthesize(id || fakeSnowflake("clustergg")), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
