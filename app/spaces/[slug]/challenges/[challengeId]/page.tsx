import { redirect } from "next/navigation";

// Challenges now live under the game's planet.
export default async function SpaceChallengeRedirect({
  params,
}: { params: Promise<{ slug: string; challengeId: string }> }) {
  const { slug, challengeId } = await params;
  redirect(`/planets/${slug}/challenges/${challengeId}`);
}
