// `/admin/content` — every editable copy key, with its default. 05 §8.
//
// ===== C4 IS THE RULE THIS PAGE EXISTS TO MAKE VISIBLE =====
//
// *"A default must never state a number the product decides — it asks for
// it."* So the store has two halves and this page shows both: `COPY`, which
// carries no figure at all, and `SAYS`, whose sentences take one.
//
// The reason is the failure that produced this whole branch: a document quoting
// an owner's withdrawal floor at twice its real value. It was not lying — it
// was a copy of a number that had moved. **A default that cannot hold a number
// cannot go stale**, and an operator editing copy needs to be able to see which
// strings are safe to edit and which are computed.

import { COPY, SAYS } from "../../../lib/content/copy.ts";
import { CHALLENGE_PRICE_CENTS, splitOf } from "../../../lib/money/amounts.ts";
import { Panel, Row } from "../components.tsx";

export const dynamic = "force-dynamic";

export default function Content() {
  const split = splitOf(CHALLENGE_PRICE_CENTS);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
        <p className="mt-1 text-sm text-mute">
          Every editable string, with the default the code ships.
        </p>
      </div>

      <Panel
        title="Defaults"
        note="Not one of these contains a figure, and that is enforced by the band"
        help={
          <p>
            A default that stated a price would be a second copy of that price, and the
            day it moved there would be two answers. So the defaults carry words only —{" "}
            <code>03-copy</code> fails the build if a <code>$</code> or a{" "}
            <code>%</code> appears in one.
          </p>
        }
      >
        <dl className="flex flex-col" data-testid="copy-defaults">
          {Object.entries(COPY).map(([key, value]) => (
            <div key={key} className="border-b border-line py-3 last:border-0">
              <dt className="font-mono text-xs text-mute">{key}</dt>
              <dd className="mt-1 text-sm">{value}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel
        title="Sentences that need a figure"
        note="They take one. They never carry one"
        help={
          <p>
            These are rendered here with today&apos;s real values, read from the module
            that enforces them. Change the split in settings and this page changes with
            it — there is no second copy to update.
          </p>
        }
      >
        <div className="flex flex-col" data-testid="copy-says">
          <Row>
            <span className="font-mono text-xs text-mute">unitPrice</span>
            <span className="text-sm">{SAYS.unitPrice()}</span>
          </Row>
          <Row>
            <span className="font-mono text-xs text-mute">kpis</span>
            <span className="text-sm">{SAYS.kpis()}</span>
          </Row>
          <Row>
            <span className="font-mono text-xs text-mute">prizeShare</span>
            <span className="text-sm">
              {SAYS.prizeShare(CHALLENGE_PRICE_CENTS, split.prize)}
            </span>
          </Row>
        </div>
      </Panel>
    </div>
  );
}
