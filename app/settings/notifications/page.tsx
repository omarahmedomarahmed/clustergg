import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import SettingsNav from "@/components/SettingsNav";
import { updateNotificationPrefs } from "@/app/actions/connections";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <SettingsNav active="notifications" />
      <h1 className="text-2xl font-bold mb-6">Notifications</h1>
      <form action={updateNotificationPrefs} className="glass p-6 space-y-6 max-w-lg">
        <label className="flex items-center gap-3">
          <input
            type="checkbox" name="emailNotifications" defaultChecked={user.emailNotifications}
            className="h-4 w-4 accent-violet-500"
          />
          <span>
            <span className="font-semibold block">Email digests</span>
            <span className="text-xs text-muted">Challenge results, badge awards and moderation notices.</span>
          </span>
        </label>
        <p className="text-xs text-muted">
          In-app notifications for follows, badges and challenges are always on — they&apos;re how the galaxy talks to you.
        </p>
        <button className="glow-btn rounded-full px-8 py-2.5 font-semibold text-white">Save</button>
      </form>
    </div>
  );
}
