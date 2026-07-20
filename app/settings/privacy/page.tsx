import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import SettingsNav from "@/components/SettingsNav";
import { getT } from "@/lib/i18n/t-server";
import { updatePrivacy } from "@/app/actions/connections";

export const dynamic = "force-dynamic";

export default async function PrivacySettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { tr } = await getT();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <SettingsNav active="privacy" />
      <h1 className="text-2xl font-bold mb-6">{tr("Privacy")}</h1>
      <form action={updatePrivacy} className="glass p-6 space-y-6 max-w-lg">
        <div>
          <label className="font-semibold">{tr("Profile visibility")}</label>
          <p className="text-xs text-muted mb-2">{tr("Who can see")} clustergg.com/u/{user.slug}</p>
          <select name="profileVisibility" defaultValue={user.profileVisibility} className="input-cosmic">
            <option value="public">{tr("Public — anyone with the link")}</option>
            <option value="followers">{tr("Followers only")}</option>
            <option value="private">{tr("Private — only me")}</option>
          </select>
        </div>
        <div>
          <label className="font-semibold">{tr("Who can message me")}</label>
          <select name="allowMessagesFrom" defaultValue={user.allowMessagesFrom} className="input-cosmic mt-2">
            <option value="everyone">{tr("Everyone")}</option>
            <option value="following">{tr("Only people I follow")}</option>
            <option value="nobody">{tr("Nobody")}</option>
          </select>
        </div>
        <button className="glow-btn rounded-full px-8 py-2.5 font-semibold text-white">{tr("Save")}</button>
      </form>
    </div>
  );
}
