"use client";

import { useTransition } from "react";
import { toggleSpaceMembership } from "@/app/actions/social";

export default function JoinSpaceButton({
  spaceId, isMember, path,
}: { spaceId: string; isMember: boolean; path: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => toggleSpaceMembership(spaceId, path))}
      className={`rounded-full px-6 py-2 text-sm font-semibold ${isMember ? "ghost-btn" : "glow-btn text-white"} ${pending ? "opacity-60" : ""}`}
    >
      {isMember ? "Joined ✓" : "Join space"}
    </button>
  );
}
