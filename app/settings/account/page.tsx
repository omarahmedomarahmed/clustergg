import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import SettingsNav from "@/components/SettingsNav";
import { deleteAccount } from "@/app/actions/connections";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  async function handleDelete() {
    "use server";
    await deleteAccount();
    redirect("/");
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <SettingsNav active="account" />
      <h1 className="text-2xl font-bold mb-6">Account</h1>
      <div className="glass p-6 space-y-4 mb-6">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted">Email</div>
          <div className="mt-1">{user.email ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted">Member since</div>
          <div className="mt-1">{user.createdAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted">Role</div>
          <div className="mt-1 capitalize">{user.role}</div>
        </div>
      </div>
      <div className="glass p-6 !border-rose-400/30">
        <h2 className="font-bold text-rose-300">Danger zone</h2>
        <p className="text-sm text-muted mt-1 mb-4">
          Deleting your account removes your profile, linked accounts, posts and messages. This cannot be undone.
        </p>
        <form action={handleDelete}>
          <button className="rounded-full border border-rose-400/50 px-6 py-2 text-sm text-rose-300 hover:bg-rose-500/10">
            Delete my account
          </button>
        </form>
      </div>
    </div>
  );
}
