"use client";

import { useActionState } from "react";
import { savePlanetArt, type ActionState } from "@/app/actions/admin";
import ImageUpload from "@/components/ImageUpload";

// Per-planet globe art: the planet skin (the globe itself) + the space
// background shown behind it. Its own form + save so uploads reliably persist.
export default function PlanetArtForm({
  gameId, planetImageUrl, planetBgUrl,
}: { gameId: string; planetImageUrl: string | null; planetBgUrl: string | null }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    savePlanetArt.bind(null, gameId), undefined,
  );
  return (
    <form action={formAction} className="grid sm:grid-cols-2 gap-4">
      <ImageUpload name="planetImageUrl" defaultValue={planetImageUrl ?? ""} label="Planet skin (the globe)" aspect="1/1" rounded="rounded-full" maxDim={1024} scope="game" hint="Square planet render. When set, the planet page shows the interactive globe hero." />
      <ImageUpload name="planetBgUrl" defaultValue={planetBgUrl ?? ""} label="Globe space background" aspect="16/9" maxDim={1600} scope="game" hint="Wide themed space art shown behind the globe." />
      <div className="sm:col-span-2 flex items-center gap-3">
        <button disabled={pending} className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">
          {pending ? "Saving…" : "Save globe art"}
        </button>
        {state?.ok && <span className="text-xs text-emerald-300">✓ {state.message}</span>}
        {state?.error && <span className="text-xs text-rose-300">{state.error}</span>}
      </div>
    </form>
  );
}
