import { redirect } from "next/navigation";

// Legacy deep link → game leaderboard with the stat pre-selected.
export default async function LegacyMetricRedirect({
  params,
}: { params: Promise<{ game: string; metric: string }> }) {
  const { game, metric } = await params;
  redirect(`/leaderboards/${game}?stat=${metric}`);
}
