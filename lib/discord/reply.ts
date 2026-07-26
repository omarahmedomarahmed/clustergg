import { DISCORD_API, appId } from "@/lib/discord/config";

// Follow-up replies use the INTERACTION TOKEN, not the bot token — that's how
// Discord lets us answer within 3 seconds and then fill in the real content
// afterwards. The token is valid for 15 minutes.

function base(token: string): string | null {
  const id = appId();
  return id ? `${DISCORD_API}/webhooks/${id}/${token}` : null;
}

// A rejected payload is invisible from the outside: Discord 400s, the deferred
// message stays "thinking…" forever, and nothing anywhere says why. That is
// exactly how a single invalid button emoji took every command down on every
// server until a person reported it.
//
// So a failure is always logged with Discord's own explanation, which names the
// offending field. Never the payload itself — it carries entry keys.
async function send(url: string, method: "PATCH" | "POST", payload: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[discord] ${method} ${res.status} — Discord rejected the message: ${detail.slice(0, 600)}`);
    }
    return res.ok;
  } catch (err) {
    console.error(`[discord] ${method} failed to reach Discord:`, (err as Error)?.message);
    return false;
  }
}

// Replace the deferred "thinking…" message with the real screen.
//
// If Discord rejects it we fall back to a stripped version — text only, no
// embeds, no components — because the only thing worse than a card without its
// buttons is a spinner that never resolves.
export async function editOriginal(token: string, payload: Record<string, unknown>): Promise<boolean> {
  const url = base(token);
  if (!url) return false;
  const target = `${url}/messages/@original`;
  if (await send(target, "PATCH", payload)) return true;

  return send(target, "PATCH", {
    content: typeof payload.content === "string" && payload.content
      ? payload.content
      : "Cluster couldn't draw that card just now — everything works on the site.",
    embeds: [],
    components: [],
    ...(payload.flags ? { flags: payload.flags } : {}),
  });
}

// Post an extra message on the same interaction (used for public shares).
export async function followUp(token: string, payload: Record<string, unknown>): Promise<boolean> {
  const url = base(token);
  if (!url) return false;
  return send(url, "POST", payload);
}

// Anything that goes wrong after the ACK still has to say something useful —
// a silent "thinking…" forever is the worst possible failure mode.
export async function editWithError(token: string, message: string): Promise<void> {
  await editOriginal(token, {
    embeds: [{ title: "Something went wrong", description: message, color: 0xef4444 }],
    components: [],
  });
}
