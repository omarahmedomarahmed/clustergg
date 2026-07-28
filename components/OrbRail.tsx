"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

// The floating rail, and the button that makes it go away.
//
// Two orbs pinned over the bottom-right corner of every page is a lot to ask of
// somebody who has already installed the bot and already knows where their
// quests are. They had no way to dismiss it — so it sat over their content on
// every page, forever, and the only recourse was to stop using the site on a
// phone.
//
// Dismissing is remembered per browser and is not permanent: a small handle
// stays in the corner to bring the rail back, because a control that vanishes
// with no way back is a different kind of annoying.

const STORE_KEY = "cluster.orbs.hidden";

export default function OrbRail({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  // Read after mount: reading localStorage during render makes the server paint
  // and the first client paint disagree.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    try { setHidden(window.localStorage.getItem(STORE_KEY) === "1"); } catch { /* private mode */ }
  }, []);

  const set = (v: boolean) => {
    setHidden(v);
    try { window.localStorage.setItem(STORE_KEY, v ? "1" : "0"); } catch { /* private mode */ }
  };

  // Until we know, render the rail — a flash of something is better than a
  // flash of nothing for the majority who never dismiss it.
  if (ready && hidden) {
    return (
      <button
        type="button" onClick={() => set(false)}
        aria-label="Show the quick actions"
        title="Show the quick actions"
        className="fixed right-2 z-40 grid h-7 w-7 place-items-center rounded-full border border-white/15 bg-[#04051a]/80 text-muted backdrop-blur transition-colors hover:text-ink print:hidden bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-4"
      >
        <Icon name="chevronRight" size={13} className="rotate-180" />
      </button>
    );
  }

  return (
    // Above the mobile bottom nav, not on top of it.
    //
    // `bottom-4` put a 72px orb directly over the tab bar on a phone, covering
    // "You" and half of "Ranks" — the two tabs a gamer uses most. The bar is
    // ~64px plus the home-indicator inset, so below `md` the rail is lifted
    // clear of it and drops back down on desktop where no bar exists.
    <div className="fixed right-4 z-40 flex flex-col items-end gap-3 print:hidden bottom-[calc(4.75rem+env(safe-area-inset-bottom))] md:bottom-4">
      <button
        type="button" onClick={() => set(true)}
        aria-label="Hide the quick actions"
        title="Hide"
        className="grid h-6 w-6 place-items-center rounded-full border border-white/15 bg-[#04051a]/85 text-muted backdrop-blur transition-colors hover:text-ink hover:border-white/30"
      >
        <Icon name="x" size={12} />
      </button>
      {children}
    </div>
  );
}
