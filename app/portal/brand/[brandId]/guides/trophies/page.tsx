// What a trophy is — the thing a brand actually bought.

import { Panel } from "../../../../../ui.tsx";
import { TROPHY_HOLD_YEARS } from "../../../../../../lib/money/amounts.ts";

export const dynamic = "force-dynamic";

export default function TrophyGuide() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">What a trophy is</h1>
      <Panel>
        <ul className="flex flex-col gap-3 text-sm text-mute">
          <li>
            A <span className="text-white">podium trophy</span> carries your
            brand and a real cash value, backed by money already sitting in the
            prize vault. Its value can never be edited — a trophy is worth what
            it was worth the day it was won, forever.
          </li>
          <li>
            A <span className="text-white">participation trophy</span> is worth
            nothing and goes to every entrant who did not place. It is a
            collectable with your name on it, held on their profile.
          </li>
          <li>
            Trophies are held for {TROPHY_HOLD_YEARS} years. A thirteen-year-old
            who wins one still has it at eighteen, when they can cash it in.
          </li>
          <li>Its name, image and brand stay editable, and an edit reaches every holder everywhere.</li>
        </ul>
      </Panel>
    </div>
  );
}
