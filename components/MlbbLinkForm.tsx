"use client";

import { useActionState, useState } from "react";
import { mlbbSendCode, mlbbConfirmLink } from "@/app/actions/connections";
import Icon from "@/components/Icon";

// Two-step Mobile Legends link: (1) request an in-game verification code,
// (2) confirm with the code. No password is ever entered — Moonton delivers
// the code to the player's in-game mailbox.
export default function MlbbLinkForm({ live }: { live: boolean }) {
  const [roleId, setRoleId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [sendState, sendAction, sending] = useActionState(mlbbSendCode, undefined);
  const [linkState, linkAction, linking] = useActionState(mlbbConfirmLink, undefined);

  const codeSent = sendState?.sent && !sendState.error;

  if (!live) {
    return (
      <p className="text-sm text-muted">
        Mobile Legends activates once the platform admin sets{" "}
        <code className="text-cyan-300">MLBB_API_BASE</code> to your self-hosted API instance.
        The integration is already wired.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-rose-300/90 border border-rose-400/30 rounded-lg p-2.5 bg-rose-500/5">
        Unofficial community integration. You&apos;ll receive a verification code in your
        Mobile Legends in-game mail — no password is ever shared. Your synced stats stay on
        your profile even if the connection later needs refreshing.
      </p>

      {/* Step 1 */}
      <form action={sendAction} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-muted mb-1">Player ID</label>
            <input
              name="roleId" required inputMode="numeric" value={roleId}
              onChange={(e) => setRoleId(e.target.value.replace(/\D/g, ""))}
              placeholder="12345678" className="input-cosmic"
            />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Server / Zone ID</label>
            <input
              name="zoneId" required inputMode="numeric" value={zoneId}
              onChange={(e) => setZoneId(e.target.value.replace(/\D/g, ""))}
              placeholder="1234" className="input-cosmic"
            />
          </div>
        </div>
        <p className="text-[11px] text-muted">
          Open Mobile Legends → tap your avatar → your ID shows as{" "}
          <span className="text-cyan-300">12345678 (1234)</span> — first number is the Player ID, the one in brackets is the Server.
        </p>
        {sendState?.error && <p className="text-sm text-rose-300">{sendState.error}</p>}
        <button disabled={sending} className="ghost-btn pressable rounded-full px-6 py-2 text-sm inline-flex items-center gap-2">
          <Icon name="send" size={14} /> {sending ? "Sending code…" : codeSent ? "Resend code" : "Send verification code"}
        </button>
      </form>

      {/* Step 2 */}
      {codeSent && (
        <form action={linkAction} className="space-y-3 border-t border-violet-400/15 pt-4">
          <input type="hidden" name="roleId" value={roleId} />
          <input type="hidden" name="zoneId" value={zoneId} />
          <div className="text-sm text-emerald-300 inline-flex items-center gap-2">
            <Icon name="check" size={15} /> Code sent! Check your in-game mailbox.
          </div>
          <label className="block text-sm text-muted">Verification code</label>
          <input
            name="vc" required inputMode="numeric" placeholder="6-digit code"
            className="input-cosmic tracking-[0.4em] text-center font-mono"
          />
          {linkState?.error && <p className="text-sm text-rose-300">{linkState.error}</p>}
          {linkState?.ok && <p className="text-sm text-emerald-300">Linked! Your Mobile Legends stats are now syncing.</p>}
          <button disabled={linking} className="glow-btn pressable rounded-full px-6 py-2 text-sm font-semibold text-white inline-flex items-center gap-2">
            <Icon name="link" size={14} /> {linking ? "Verifying…" : "Confirm & link"}
          </button>
        </form>
      )}
    </div>
  );
}
