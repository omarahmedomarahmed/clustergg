"use client";

import { useActionState } from "react";
import { voteForProfile } from "@/app/actions/votes";
import Icon from "@/components/Icon";

// The Best Profile vote, on a public profile.
//
// Two shapes, because it does two jobs. As a `chip` it's a stat beside
// followers and views — the number is the brag, and it shows to everyone
// including signed-out visitors, because hiding it removes the reason to sign
// in. As a `button` it sits next to Follow with the same weight, because
// voting is the thing we actually want a visitor to do.
export default function VoteButton({
  slug, votes, voted, canVote, accent, mine, variant = "chip", buttonStyle = "glass",
}: {
  slug: string; votes: number; voted: boolean; canVote: boolean; accent: string; mine: boolean;
  variant?: "chip" | "button";
  buttonStyle?: string;
}) {
  const [state, action, pending] = useActionState(voteForProfile, undefined);

  const count = state?.votes ?? votes;
  const isVoted = state?.voted ?? voted;

  if (variant === "button") {
    // Your own profile gets no vote button — you can't vote for yourself, and a
    // permanently disabled button is worse than no button.
    if (mine) return null;
    if (!canVote) {
      return (
        <a href="/login" className={`p-btn p-btn-${buttonStyle}`} title="Sign in to vote">
          <Icon name="star" size={14} /> Vote for best profile
        </a>
      );
    }
    return (
      <form action={action}>
        <input type="hidden" name="slug" value={slug} />
        <button
          disabled={pending}
          className={`p-btn p-btn-${isVoted ? "outline" : buttonStyle} disabled:opacity-60`}
          title={isVoted ? "Remove your vote" : "Vote for this profile"}
          style={isVoted ? { borderColor: accent, color: accent } : undefined}
        >
          <Icon name="star" size={14} style={isVoted ? { color: accent } : undefined} />
          {pending ? "…" : isVoted ? `Voted · ${count.toLocaleString()}` : "Vote for best profile"}
        </button>
      </form>
    );
  }

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
