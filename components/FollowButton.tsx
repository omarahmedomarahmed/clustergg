"use client";

import { useTransition } from "react";
import { toggleFollow } from "@/app/actions/social";

export default function FollowButton({
  targetUserId, isFollowing, path,
}: { targetUserId: string; isFollowing: boolean; path: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => toggleFollow(targetUserId, path))}
      className={`rounded-full px-5 py-2 text-sm font-semibold transition-opacity ${pending ? "opacity-60" : ""} ${
        isFollowing ? "ghost-btn" : "glow-btn text-white"
      }`}
    >
      {isFollowing ? "Following ✓" : "Follow"}
    </button>
  );
}
