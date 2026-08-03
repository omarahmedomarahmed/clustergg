"use client";

import { useActionState, useState } from "react";
import Icon from "@/components/Icon";
import { startAccountProof, confirmAccountProof, type VerifyState } from "@/app/actions/verify-account";
import { isProof } from "@/lib/account-ownership";

// Proving a game account is yours, on the profile.
//
// The tick used to appear the moment the provider's API answered, which only
// proved the account exists. This is the thing that earns it — and it is worth
// making pleasant, because a gamer who can't be bothered stays unverified and
// unverified accounts can't be paid.

export type VerifyInfo = {
  accountId: string;
  gameName: string;
  verified: boolean;
  method: string;
  /** How this game proves ownership, and whether it can at all. */
  proofKind: string;
  proofLabel: string;
  proofHow: string;
  /** A challenge already issued and still open. */
  pendingIconId?: number | null;
  disputed?: boolean;
};

const METHOD_LABEL: Record<string, string> = {
  icon: "Verified by profile icon",
  openid: "Verified through Steam",
  oauth: "Verified through the game's own sign-in",
  vc: "Verified by in-game code",
  admin: "Verified by Cluster staff",
  exists: "Account exists — ownership not proven",
  claimed: "Claimed, not proven",
};

function iconUrl(id: number) {
  return `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon/${id}.png`;
}

export default function VerifyAccount({ info }: { info: VerifyInfo }) {
  const [startState, start, starting] = useActionState<VerifyState, FormData>(startAccountProof, undefined);
  const [confirmState, confirm, confirming] = useActionState<VerifyState, FormData>(confirmAccountProof, undefined);
  const [open, setOpen] = useState(false);

  const challengeIcon = startState?.challenge?.iconId ?? info.pendingIconId ?? null;
  // `verified` alone is not enough. A row can carry verified=true with a method
  // that proves nothing — that is exactly the state the old code left behind —
  // and rendering a green tick beside the words "Claimed, not proven" is the
  // same lie in a nicer font. Proof is the flag AND a method that means it.
  const done = (info.verified && isProof(info.method)) || confirmState?.ok;

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
        <Icon name="check" size={11} /> {METHOD_LABEL[info.method] ?? "Verified"}
      </span>
    );
  }

  // Nothing to offer: saying "unverified" without a way to fix it is a dead end,
  // so the reason is stated instead.
  if (info.proofKind === "none") {
    return (
      <span className="text-[11px] text-muted" title={info.proofHow}>
        {info.gameName} has no ownership check
      </span>
    );
  }

  if (info.proofKind === "steam-openid") {
    return (
      <a href="/api/auth/steam?intent=link&next=/profile"
        className="inline-flex items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/20">
        <Icon name="shield" size={11} /> Verify with Steam
      </a>
    );
  }
  if (info.proofKind === "epic-oauth") {
    return (
      <a href="/api/auth/epic?intent=link&next=/profile"
        className="inline-flex items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/20">
        <Icon name="shield" size={11} /> Verify with Epic
      </a>
    );
  }

  // Riot: the icon challenge.
  return (
    <div className="w-full">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/20">
          <Icon name="shield" size={11} /> Prove this is yours
        </button>
      ) : (
        <div className="mt-2 rounded-xl border border-cyan-400/25 bg-cyan-500/[0.05] p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-cyan-200">
            <Icon name="shield" size={13} /> {info.proofLabel}
          </div>

          {challengeIcon == null ? (
            <>
              <p className="mb-2 text-[11px] text-muted">{info.proofHow}</p>
              <form action={start}>
                <input type="hidden" name="accountId" value={info.accountId} />
                <button disabled={starting}
                  className="rounded-full bg-cyan-500/20 px-3 py-1 text-[11px] font-semibold text-cyan-100 disabled:opacity-50">
                  {starting ? "Picking an icon…" : "Start the check"}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={iconUrl(challengeIcon)} alt={`Profile icon ${challengeIcon}`} width={56} height={56}
                  className="h-14 w-14 shrink-0 rounded-lg border border-white/15" />
                <ol className="space-y-0.5 text-[11px] text-muted">
                  <li>1. Open League and set your profile icon to this one.</li>
                  <li>2. Come back and press Verify.</li>
                  <li>3. Change it back to whatever you like afterwards.</li>
                </ol>
              </div>
              <form action={confirm} className="mt-2 flex items-center gap-2">
                <input type="hidden" name="accountId" value={info.accountId} />
                <button disabled={confirming}
                  className="rounded-full bg-emerald-500/20 px-3 py-1 text-[11px] font-semibold text-emerald-100 disabled:opacity-50">
                  {confirming ? "Checking with Riot…" : "Verify"}
                </button>
                <span className="text-[10px] text-muted">Riot caches this for a minute or two.</span>
              </form>
            </>
          )}

          {(startState?.error || confirmState?.error) && (
            <p className="mt-2 text-[11px] text-rose-300">{startState?.error || confirmState?.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
