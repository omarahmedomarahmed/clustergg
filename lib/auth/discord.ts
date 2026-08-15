// Discord OAuth configuration.
//
// Not a server action, so a page can ask these questions without awaiting a
// round trip. The credentials arrive at the very end of the build, through
// docs/10-SETUP.md, which is entirely dashboard clicks.

/** Whether this deployment has been given Discord's credentials yet. */
export function discordConfigured(): boolean {
  return Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
}

export function discordAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID ?? "",
    redirect_uri: `${process.env.APP_URL ?? ""}/api/auth/discord/callback`,
    response_type: "code",
    scope: "identify",
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}
