import { redirect } from "next/navigation";

// The leaderboards hub is now folded into Planets.
export default function LeaderboardsRedirect() {
  redirect("/planets");
}
