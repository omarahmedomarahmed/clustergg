import { DISCORD_API, appId } from "@/lib/discord/config";

// Follow-up replies use the INTERACTION TOKEN, not the bot token — that's how
// Discord lets us answer within 3 seconds and then fill in the real content
// afterwards. The token is valid for 15 minutes.

function base(token: string): string | null {
  const id = appId();
  return id ? `${DISCORD_API}/webhooks/${id}/${token}` : null;
}

// Replace the deferred "thinking…" message with the real screen.
export async function editOriginal(token: string, payload: Record<string, unknown>): Promise<boolean> {
  const url = base(token);
  if (!url) return false;
  try {
    const res = await fetch(`${url}/messages/@original`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Post an extra message on the same interaction (used for public shares).
export async function followUp(token: string, payload: Record<string, unknown>): Promise<boolean> {
  const url = base(token);
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Anything that goes wrong after the ACK still has to say something useful —
// a silent "thinking…" forever is the worst possible failure mode.
export async function editWithError(token: string, message: string): Promise<void> {
  await editOriginal(token, {
    embeds: [{ title: "Something went wrong", description: message, color: 0xef4444 }],
    components: [],
  });
}
