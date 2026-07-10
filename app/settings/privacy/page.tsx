import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import SettingsNav from "@/components/SettingsNav";
import { updatePrivacy } from "@/app/actions/connections";

export const dynamic = "force-dynamic";

export default async function PrivacySettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <SettingsNav active="privacy" />
      <h1 className="text-2xl font-bold mb-6">Privacy</h1>
      <form action={updatePrivacy} className="glass p-6 space-y-6 max-w-lg">
        <div>
          <label className="font-semibold">Profile visibility</label>
          <p className="text-xs text-muted mb-2">Who can see clustergg.com/u/{user.slug}</p>
          <select name="profileVisibility" defaultValue={user.profileVisibility} className="input-cosmic">
            <option value="public">Public — anyone with the link</option>
            <option value="followers">Followers only</option>
            <option value="private">Private — only me</option>
          </select>
        </div>
        <div>
          <label className="font-semibold">Who can message me</label>
          <select name="allowMessagesFrom" defaultValue={user.allowMessagesFrom} className="input-cosmic mt-2">
            <option value="everyone">Everyone</option>
            <option value="following">Only people I follow</option>
            <option value="nobody">Nobody</option>
          </select>
        </div>
        <button className="glow-btn rounded-full px-8 py-2.5 font-semibold text-white">Save</button>
      </form>
    </div>
  );
}
