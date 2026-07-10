"use client";

import { useActionState } from "react";
import { updateProfile } from "@/app/actions/connections";

export default function ProfileEditForm({
  defaults,
}: { defaults: { displayName: string; slug: string; bio: string; country: string } }) {
  const [state, action, pending] = useActionState(updateProfile, undefined);
  return (
    <form action={action} className="glass p-6 space-y-4">
      <div>
        <label className="text-sm text-muted">Display name</label>
        <input name="displayName" defaultValue={defaults.displayName} required className="input-cosmic mt-1" />
      </div>
      <div>
        <label className="text-sm text-muted">Profile URL — clustergg.com/u/…</label>
        <input name="slug" defaultValue={defaults.slug} className="input-cosmic mt-1" />
      </div>
      <div>
        <label className="text-sm text-muted">Bio</label>
        <textarea name="bio" defaultValue={defaults.bio} rows={3} maxLength={400} className="input-cosmic mt-1" placeholder="Tell the galaxy who you are…" />
      </div>
      <div>
        <label className="text-sm text-muted">Country (2-letter code, e.g. US)</label>
        <input name="country" defaultValue={defaults.country} maxLength={2} className="input-cosmic mt-1 uppercase" />
      </div>
      {state?.error && <p className="text-sm text-rose-300">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-300">Profile updated ✦</p>}
      <button disabled={pending} className="glow-btn rounded-full px-8 py-2.5 font-semibold text-white">
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
