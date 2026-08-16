// Reach and entrants — counted, never modelled.
//
// 00 §8 and 04 §3. The double counting is **deliberate** and the guide has to
// say so, because a brand who discovers it themselves reads it as inflation.

import { Panel } from "../../../../../ui.tsx";
import { MIN_AUDIENCE_GROUP } from "../../../../../../lib/money/amounts.ts";

export const dynamic = "force-dynamic";

export default function ReachGuide() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Reach and entrants</h1>
      <Panel>
        <ul className="flex flex-col gap-3 text-sm text-mute">
          <li>
            <span className="text-white">Reach</span> — every member of every
            server your challenge was announced to, counted at the moment it was
            announced.
          </li>
          <li>
            <span className="text-white">Entrants</span> — gamers who joined
            that challenge.
          </li>
          <li>
            <span className="text-white">Double counting is deliberate.</span>{" "}
            The same ten members across two challenges is two times ten reach.
            The same gamer entering week one and week two is two entrants. We
            never sum them into a &ldquo;unique audience&rdquo; figure, because
            that figure would be modelled and everything here is counted.
          </li>
          <li>
            We never describe a group smaller than {MIN_AUDIENCE_GROUP} people. A
            count of three is three people somebody could name.
          </li>
        </ul>
      </Panel>
    </div>
  );
}
