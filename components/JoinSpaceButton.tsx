"use client";

import { useTransition } from "react";
import { toggleSpaceMembership } from "@/app/actions/social";
import Icon from "@/components/Icon";

export default function JoinSpaceButton({
  spaceId, isMember, path,
}: { spaceId: string; isMember: boolean; path: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => toggleSpaceMembership(spaceId, path))}
      className={`pressable rounded-full px-6 py-2 text-sm font-semibold inline-flex items-center gap-1.5 ${isMember ? "ghost-btn" : "glow-btn text-white"} ${pending ? "opacity-60" : ""}`}
    >
      {isMember ? <><Icon name="check" size={14} /> Joined</> : "Join space"}
    </button>
  );
}
