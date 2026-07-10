import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ProfileEditForm from "@/components/ProfileEditForm";

export const dynamic = "force-dynamic";

export default async function OwnProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Edit profile</h1>
        <Link href={`/u/${user.slug}`} className="ghost-btn rounded-full px-4 py-1.5 text-sm">
          View public profile →
        </Link>
      </div>
      <ProfileEditForm
        defaults={{
          displayName: user.displayName,
          slug: user.slug,
          bio: user.bio ?? "",
          country: user.country ?? "",
        }}
      />
    </div>
  );
}
