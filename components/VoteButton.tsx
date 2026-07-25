"use client";

import { useActionState } from "react";
import { voteForProfile } from "@/app/actions/votes";
import Icon from "@/components/Icon";

// The Best Profile vote, on a public profile.
//
// Shows the live count even when you can't vote — the number is the point, and
// hiding it from signed-out visitors removes the reason to sign in.
export default function VoteButton({
  slug, votes, voted, canVote, accent, mine,
}: {
  slug: string; votes: number; voted: boolean; canVote: boolean; accent: string; mine: boolean;
}) {
  const [state, action, pending] = useActionState(voteForProfile, undefined);

  const count = state?.votes ?? votes;
  const isVoted = state?.voted ?? voted;

  if (mine) {
    return (
      <span title="Best Profile votes" className="inline-flex items-center gap-1.5">
        <Icon name="star" size={14} style={{ color: accent }} />
        <b>{count.toLocaleString()}</b> <span className="p-muted">votes</span>
      </span>
    );
  }

  if (!canVote) {
    return (
      <a href="/login" title="Continue with Discord to vote" className="inline-flex items-center gap-1.5 hover:opacity-80">
        <Icon name="star" size={14} style={{ color: accent }} />
        <b>{count.toLocaleString()}</b> <span className="p-muted">votes</span>
      </a>
    );
  }

  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="slug" value={slug} />
      <button
        disabled={pending}
        title={isVoted ? "Remove your vote" : "Vote for this profile"}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition disabled:opacity-50"
        style={{
          background: isVoted ? `${accent}2b` : "rgba(255,255,255,0.06)",
          border: `1px solid ${isVoted ? accent : "rgba(255,255,255,0.14)"}`,
          color: isVoted ? accent : undefined,
        }}
      >
        <Icon name="star" size={13} style={{ color: accent }} />
        {pending ? "…" : count.toLocaleString()} {isVoted ? "voted" : "vote"}
      </button>
      {state?.error && <span className="text-[11px] text-amber-300">{state.error}</span>}
    </form>
  );
}
