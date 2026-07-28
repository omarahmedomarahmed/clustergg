"use client";

import { useActionState, useState } from "react";
import { resetPortalKey, dmPortalKey, setGuildFlags, forceUnlock, type BotActionState } from "@/app/actions/discord";
import Icon from "@/components/Icon";

// Staff control over one server's portal and delivery.
//
// A server owner's portal key opens their whole dashboard, so when one leaks
// there has to be a way to replace it that doesn't involve a database console.
// Everything here is a real action with a real consequence, so each says what
// it will do before you press it.

export function PortalAdmin({ guildId, slug, hasKey }: {
  guildId: string; slug: string | null; hasKey: boolean;
}) {
  const [reset, resetAction, resetting] = useActionState<BotActionState, FormData>(resetPortalKey, undefined);
  const [dm, dmAction, dming] = useActionState<BotActionState, FormData>(dmPortalKey, undefined);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-4">
      <div className="text-sm">
        <div className="text-muted text-xs mb-1">Portal</div>
        {slug ? (
          <a href={`/servers/${slug}`} target="_blank" rel="noreferrer" className="text-cyan-300 hover:underline break-all">
            /servers/{slug}
          </a>
        ) : (
          <span className="text-muted">Not created yet — it&apos;s built the first time anyone needs it.</span>
        )}
        <div className="text-[11px] text-muted mt-1">
          {hasKey
            ? "A key exists. We never display it — the owner holds it, and rotating is the only way to change it."
            : "No key yet. Rotating creates one."}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <form action={dmAction}>
          <input type="hidden" name="guildId" value={guildId} />
          <button disabled={dming} className="ghost-btn pressable rounded-full px-4 py-2 text-sm disabled:opacity-60">
            {dming ? "Sending…" : "DM the owner their key"}
          </button>
        </form>

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-full border border-amber-400/40 text-amber-200 px-4 py-2 text-sm hover:bg-amber-500/10"
          >
            Reset portal key…
          </button>
        ) : (
          <form action={resetAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="guildId" value={guildId} />
            <span className="text-xs text-amber-200 max-w-xs">
              The current key stops working immediately and the owner is locked out until you send them the new one.
            </span>
            <button disabled={resetting} className="rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-100 px-4 py-2 text-sm font-semibold disabled:opacity-60">
              {resetting ? "Rotating…" : "Yes, rotate it"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="text-xs text-muted hover:text-ink">
              Cancel
            </button>
          </form>
        )}
      </div>

      {/* The new key is shown once, here, and nowhere else. */}
      {reset?.ok && (
        <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 font-mono break-all select-all">
          {reset.ok}
        </p>
      )}
      {reset?.error && <p className="text-sm text-amber-300">{reset.error}</p>}
      {dm?.ok && <p className="text-sm text-emerald-300">{dm.ok}</p>}
      {dm?.error && <p className="text-sm text-amber-300">{dm.error}</p>}
    </div>
  );
}

export function DeliveryAdmin({ guildId, announcements, ads, unlocked, linked, threshold }: {
  guildId: string; announcements: boolean; ads: boolean; unlocked: boolean;
  linked: number; threshold: number;
}) {
  const [flags, flagsAction, savingFlags] = useActionState<BotActionState, FormData>(setGuildFlags, undefined);
  const [unlock, unlockAction, unlocking] = useActionState<BotActionState, FormData>(forceUnlock, undefined);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <form action={flagsAction} className="space-y-3">
        <input type="hidden" name="guildId" value={guildId} />
        <div className="text-xs uppercase tracking-widest text-muted">What we send this server</div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="announcements" defaultChecked={announcements} className="accent-violet-500 mt-0.5" />
          <span>
            Announcements
            <span className="block text-[11px] text-muted">Challenge launches, joins and quest tiers into their #clustergg.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="ads" defaultChecked={ads} className="accent-violet-500 mt-0.5" />
          <span>
            Ad delivery
            <span className="block text-[11px] text-muted">Only reaches servers that have crossed the unlock threshold.</span>
          </span>
        </label>
        <button disabled={savingFlags} className="ghost-btn pressable rounded-full px-5 py-2 text-sm disabled:opacity-60">
          {savingFlags ? "Saving…" : "Save"}
        </button>
        {flags?.ok && <p className="text-sm text-emerald-300">{flags.ok}</p>}
        {flags?.error && <p className="text-sm text-amber-300">{flags.error}</p>}
      </form>

      <form action={unlockAction} className="space-y-3">
        <input type="hidden" name="guildId" value={guildId} />
        <div className="text-xs uppercase tracking-widest text-muted">Revenue share</div>
        <p className="text-[11px] text-muted">
          {unlocked
            ? "Unlocked. This server earns a share of the ad revenue its community generates."
            : `${linked.toLocaleString()} of ${threshold.toLocaleString()} members have linked a game. It unlocks automatically at ${threshold.toLocaleString()}.`}
        </p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="unlock" defaultChecked={unlocked} className="accent-emerald-500 mt-0.5" />
          <span>
            Unlocked
            <span className="block text-[11px] text-muted">
              Override for a partnership, a migration, or a miscount. It records a real unlock, so every downstream check behaves the same as an earned one.
            </span>
          </span>
        </label>
        <button disabled={unlocking} className="ghost-btn pressable rounded-full px-5 py-2 text-sm disabled:opacity-60">
          {unlocking ? "Saving…" : "Apply"}
        </button>
        {unlock?.ok && <p className="text-sm text-emerald-300 flex items-center gap-1.5"><Icon name="check" size={13} /> {unlock.ok}</p>}
        {unlock?.error && <p className="text-sm text-amber-300">{unlock.error}</p>}
      </form>
    </div>
  );
}
