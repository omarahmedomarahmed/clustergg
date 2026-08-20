// `/admin/content` — the copy editor. `05` §8 and `14-EDITABLE` §2.
//
// ===== THIS PAGE USED TO TELL YOU ABOUT COPY =====
//
// `14-EDITABLE`'s opening paragraph is about this page and three like it:
// *"`05-ADMIN` §8 names four pages in four table rows and never says any of
// them edits anything. A session read 'Bot card layouts' and built a page that
// tells you about bot card layouts. That was a fair reading of what was
// written."* Trap 24: **"a human can" is not the last line of a sprint table,
// it is the definition of done.**
//
// So: a human can search every key, read its default beside its current value,
// edit it, preview it in place, revert it, and see who changed it and when.
//
// ===== C4 / E5 — THE TWO HALVES, MARKED APART =====
//
// `COPY` can hold no figure at all. `SAYS` sentences take one and never carry
// one. An operator needs to see which strings are safe to edit and which are
// computed, because editing the wrong one is how a price ends up with two
// answers — and the second one goes stale the day the first moves.
//
// `SAYS` is deliberately **not editable here**. Its sentences are generated
// from the modules that enforce their figures, and an editor over them would be
// a text box that can only make them wrong.

import { COPY, SAYS } from "../../../lib/content/copy.ts";
import { CHALLENGE_PRICE_CENTS, splitOf } from "../../../lib/money/amounts.ts";
import { getDb } from "../../../lib/db/index.ts";
import { currentOverrides, historyOf } from "../../../lib/content/store.ts";
import { Panel, Row } from "../components.tsx";
import { saveCopyAction, clearCopyAction, revertCopyAction } from "./actions.ts";

export const dynamic = "force-dynamic";

export default async function Content({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const str = (k: string) => (typeof query[k] === "string" ? (query[k] as string) : null);
  const split = splitOf(CHALLENGE_PRICE_CENTS);

  const db = await getDb();
  const live = await currentOverrides(db, "copy");

  // Search is a filter over the keys and their words, not a query: there are
  // tens of keys, and a round trip to filter tens of rows is a round trip an
  // operator waits for while typing.
  const search = (str("q") ?? "").trim().toLowerCase();
  const keys = Object.keys(COPY).filter(
    (k) =>
      !search ||
      k.toLowerCase().includes(search) ||
      String(COPY[k as keyof typeof COPY]).toLowerCase().includes(search) ||
      String(live.get(k)?.value ?? "").toLowerCase().includes(search),
  );

  // The history of the key being worked on, so "one click away" is one click
  // away rather than a second page.
  const focus = str("focus");
  const history = focus ? await historyOf(db, "copy", focus) : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
        <p className="mt-1 text-sm text-mute">
          Every editable string. An edit is live on save — there is no deploy in
          this loop.
        </p>
      </div>

      {str("error") ? (
        <p
          className="rounded-lg border border-line bg-ink px-4 py-3 text-sm"
          data-testid="copy-refusal"
        >
          {str("error")}
        </p>
      ) : null}
      {str("saved") ? (
        <p className="rounded-lg border border-line bg-ink px-4 py-3 text-sm text-mute" data-testid="copy-saved">
          “{str("saved")}” is live.
        </p>
      ) : null}
      {str("cleared") ? (
        <p className="rounded-lg border border-line bg-ink px-4 py-3 text-sm text-mute" data-testid="copy-cleared">
          “{str("cleared")}” is back to the default the code ships.
        </p>
      ) : null}

      <Panel title="Search" note="By key, by the default's words, or by what it says now">
        <Row>
          <form method="get" className="flex items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Find a key</span>
              <input
                name="q"
                defaultValue={search}
                data-testid="copy-search"
                className="w-72 rounded-md border border-line bg-ink px-3 py-1.5 text-sm outline-none focus:border-white/30"
              />
            </label>
            <button
              type="submit"
              className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-white/5"
            >
              Search
            </button>
          </form>
        </Row>
      </Panel>

      <Panel
        title={`COPY — ${keys.length} key${keys.length === 1 ? "" : "s"}`}
        note="These can hold no figure at all. A save that states one is refused, and says what to write instead"
        help={
          <p>
            A default that stated a price would be a second copy of that price, and
            the day it moved there would be two answers. The same rule applies to
            what you type here: a currency amount, a percentage or a threshold is
            refused at save. Use a placeholder and add the sentence to{" "}
            <code>SAYS</code>, which takes its figure from the module that enforces
            it.
          </p>
        }
      >
        {keys.length === 0 ? (
          <Row>
            <p className="text-sm text-mute">Nothing matches “{search}”.</p>
          </Row>
        ) : null}
        {keys.map((key) => {
          const def = String(COPY[key as keyof typeof COPY]);
          const override = live.get(key);
          const overridden = override !== undefined && override.value !== null;
          const current = overridden ? String(override.value) : def;

          return (
            <div key={key} className="border-b border-line py-4 last:border-0">
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-mono text-xs text-mute">{key}</span>
                {/*
                  E6 — a key with no override reads as its default, **and says
                  so**. Without the label an operator cannot tell a default they
                  are happy with from an override that happens to match.
                */}
                <span className="text-xs text-mute" data-testid={`copy-state-${key}`}>
                  {overridden
                    ? `edited by ${override.editedBy} on ${override.editedAt
                        .toISOString()
                        .slice(0, 10)}`
                    : "no override — reading the default"}
                </span>
              </div>

              {/* The preview: what this key says right now, in place. */}
              <p className="mt-2 text-sm" data-testid={`copy-current-${key}`}>
                {current}
              </p>

              {overridden ? (
                <p className="mt-1 text-xs text-mute" data-testid={`copy-default-${key}`}>
                  Default: {def}
                </p>
              ) : null}

              <form action={saveCopyAction} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="key" value={key} />
                <textarea
                  name="value"
                  rows={2}
                  defaultValue={current}
                  data-testid={`copy-input-${key}`}
                  className="w-full rounded-md border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-white/30"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-white/5"
                    data-testid={`copy-save-${key}`}
                  >
                    Save
                  </button>
                </div>
              </form>

              {overridden ? (
                <form action={clearCopyAction} className="mt-2">
                  <input type="hidden" name="key" value={key} />
                  <button
                    type="submit"
                    className="text-xs text-mute underline hover:text-white"
                    data-testid={`copy-clear-${key}`}
                  >
                    Remove the override and read the default again
                  </button>
                </form>
              ) : null}

              <form method="get" className="mt-2">
                <input type="hidden" name="focus" value={key} />
                {search ? <input type="hidden" name="q" value={search} /> : null}
                <button
                  type="submit"
                  className="text-xs text-mute underline hover:text-white"
                  data-testid={`copy-history-${key}`}
                >
                  History
                </button>
              </form>
            </div>
          );
        })}
      </Panel>

      {/*
        E4 — *"the previous value is one click away, because the fastest fix for
        bad copy is the copy from before it."* A revert is a new row rather than
        a resurrection: the history has to say somebody went back, and when.
      */}
      {focus ? (
        <Panel
          title={`History — ${focus}`}
          note="Every edit, newest first. Nothing here was ever overwritten"
        >
          {history.length === 0 ? (
            <Row>
              <p className="text-sm text-mute">This key has never been edited.</p>
            </Row>
          ) : (
            history.map((h) => (
              <Row key={h.id}>
                <div className="flex w-full items-start justify-between gap-4">
                  <div>
                    <p className="text-sm" data-testid="copy-history-value">
                      {h.value === null ? (
                        <em className="text-mute">removed — read the default</em>
                      ) : (
                        h.value
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-mute">
                      {h.editedBy} · {h.editedAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                    </p>
                  </div>
                  <form action={revertCopyAction}>
                    <input type="hidden" name="key" value={focus} />
                    {h.value !== null ? <input type="hidden" name="to" value={h.value} /> : null}
                    <button
                      type="submit"
                      className="rounded-md border border-line px-2 py-1 text-xs hover:bg-white/5"
                      data-testid="copy-revert"
                    >
                      Revert to this
                    </button>
                  </form>
                </div>
              </Row>
            ))
          )}
        </Panel>
      ) : null}

      <Panel
        title="SAYS — sentences that need a figure"
        note="They take one. They never carry one, and they are not editable here"
        help={
          <p>
            These are generated from the modules that enforce their figures and
            rendered here with today&apos;s real values. Change the split in settings
            and this changes with it — there is no second copy to update, which is
            exactly why there is no text box beside them.
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
