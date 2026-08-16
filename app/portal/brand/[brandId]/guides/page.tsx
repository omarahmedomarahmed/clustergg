// H2 — the guides live **inside** the portal.
//
// 04 §7 C1: every figure is imported from the module that enforces it. A guide
// that retypes a price is a rate we are held to by whoever read it (C2), and
// this page is the most likely place on the platform for that to happen —
// prose reads better with a literal in it, which is exactly trap 5.

import { Panel } from "../../../../ui.tsx";
import { CHALLENGE_PRICE_CENTS, formatMoney, splitOf } from "../../../../../lib/money/amounts.ts";

export const dynamic = "force-dynamic";

export default function BrandGuideIndex() {
  const split = splitOf(CHALLENGE_PRICE_CENTS);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">How a week works</h1>
      <Panel>
        <p className="text-sm text-mute">
          A challenge is one game, one week, one sponsor, one prize pool. It runs
          Monday 00:00 UTC to Friday 00:00 UTC inside the Discord servers your
          audience already sits in. There is no bracket, no schedule, no lobby
          and no dispute — the game&rsquo;s own API is the referee.
        </p>
        <ul className="mt-4 flex flex-col gap-2 text-sm text-mute">
          <li>· One challenge costs {formatMoney(CHALLENGE_PRICE_CENTS)}, billed on its own.</li>
          <li>· {formatMoney(split.prize)} of that becomes the prize your trophies are worth.</li>
          <li>· Start is always the start of a week. There is no date picker, for anyone.</li>
          <li>· Nothing announces itself — a Cluster admin sets it up and presses Announce.</li>
        </ul>
      </Panel>
    </div>
  );
}
