import { redirect } from "next/navigation";

// Spaces are now "Planets" — same slug.
export default async function SpaceRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/planets/${slug}`);
}
