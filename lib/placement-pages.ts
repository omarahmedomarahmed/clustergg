// Best-effort representative page for a placement key, so analytics rows and
// creative lists can link to a page where the ad actually shows. Client-safe
// (no server imports) so both the admin dashboard and the brand portal share it.
export function pageForPlacement(key: string): string {
  if (key.startsWith("feed")) return "/feed";
  if (key.startsWith("planet") || key.startsWith("games")) return "/planets";
  if (key.startsWith("leaderboard")) return "/leaderboards";
  if (key.startsWith("quests")) return "/quests";
  if (key.startsWith("messages")) return "/messages";
  if (key.startsWith("loading")) return "/";
  if (key.startsWith("landing") || key === "top_banner") return "/";
  return "/";
}
