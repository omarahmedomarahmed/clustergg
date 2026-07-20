"use client";

import { useTransition } from "react";
import { toggleFollow } from "@/app/actions/social";
import { useTr } from "@/components/LocaleProvider";
import Icon from "@/components/Icon";

export default function FollowButton({
  targetUserId, isFollowing, path,
}: { targetUserId: string; isFollowing: boolean; path: string }) {
  const [pending, startTransition] = useTransition();
  const tr = useTr();
  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => toggleFollow(targetUserId, path))}
      className={`pressable rounded-full px-5 py-2 text-sm font-semibold transition-opacity inline-flex items-center gap-1.5 ${pending ? "opacity-60" : ""} ${
        isFollowing ? "ghost-btn" : "glow-btn text-white"
      }`}
    >
      {isFollowing ? <><Icon name="check" size={14} /> {tr("Following")}</> : tr("Follow")}
    </button>
  );
}
