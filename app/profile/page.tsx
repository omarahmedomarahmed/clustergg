import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ProfileBuilder from "@/components/ProfileBuilder";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customize profile" };

export default async function OwnProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Customize your <span className="grad-text">profile</span></h1>
          <p className="text-sm text-muted mt-1">This is your identity. Make it yours — themes, colors, layout, cursor and more. Changes save to clustergg.com/u/{user.slug}.</p>
        </div>
        <Link href={`/u/${user.slug}`} className="ghost-btn pressable rounded-full px-4 py-1.5 text-sm inline-flex items-center gap-2">
          <Icon name="eye" size={14} /> View live profile
        </Link>
      </div>
      <ProfileBuilder
        slug={user.slug}
        displayName={user.displayName}
        initialTheme={user.theme}
        initialTitle={user.title ?? ""}
        initialBio={user.bio ?? ""}
        initialAvatar={user.avatarUrl ?? ""}
        initialBanner={user.bannerUrl ?? ""}
      />
    </div>
  );
}
