"use client";

import { useActionState, useState } from "react";
import { saveSection, moveSection, deleteSection, type DocActionState } from "@/app/actions/dataroom";
import ImageUpload from "@/components/ImageUpload";
import Icon from "@/components/Icon";
import { SECTION_KINDS, type Section, type SectionKind } from "@/lib/dataroom/types";

// Editing one section.
//
// The rule this follows: **no JSON anywhere.** A person editing the pitch deck
// at 2am should never be one missing brace away from breaking the page an
// investor is about to open. Every repeating thing — a bullet, a stage, a logo,
// a gallery image — is a row you add and remove, submitted as repeated form
// fields.
//
// Collapsed by default. A fifteen-section document with every editor open is
// unusable, and the common visit is reordering rather than rewriting.

const KIND = Object.fromEntries(SECTION_KINDS.map((k) => [k.kind, k]));

// The icons an explainer can use. A closed list on purpose: a free-text icon
// name that doesn't exist silently renders as the fallback, and a diagram with
// one wrong glyph looks broken rather than incomplete.
const EXPLAINER_ICONS = [
  "spark", "rocket", "gamepad", "trophy", "users", "chart", "zap", "target",
  "planet", "satellite", "link", "shield", "crown", "medal", "flame", "globe",
  "eye", "send", "grid", "layers", "clock", "check",
];

// Every card kind the renderer can draw, by the name the API route uses.
const SHOWCASE_CARDS = [
  { kind: "profile", label: "Gamer profile card" },
  { kind: "game-stats", label: "A gamer's live game stats" },
  { kind: "planet", label: "Game planet — a game world" },
  { kind: "planets", label: "All games" },
  { kind: "challenge", label: "A live challenge" },
  { kind: "leaderboard", label: "Leaderboard" },
  { kind: "quest", label: "Quest progress" },
  { kind: "cp", label: "Cluster Points summary" },
  { kind: "guide", label: "How-to guide card" },
];

export function SectionEditor({ section, metricOptions }: {
  section: Section;
  metricOptions: { key: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, act, busy] = useActionState<DocActionState, FormData>(saveSection, undefined);
  const [, move] = useActionState<DocActionState, FormData>(moveSection, undefined);
  const [del, delAct, deleting] = useActionState<DocActionState, FormData>(deleteSection, undefined);
  const [confirming, setConfirming] = useState(false);
  const meta = KIND[section.kind];

  return (
    <div className={`rounded-2xl border ${section.isVisible ? "border-white/10" : "border-amber-400/30 bg-amber-500/[0.04]"}`}>
      <div className="flex items-center gap-2 p-3">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex-1 flex items-center gap-3 text-left min-w-0">
          <Icon name={open ? "chevronDown" : "chevronRight"} size={15} className="shrink-0 text-muted" />
          <span className="min-w-0">
            <span className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm truncate">{section.navLabel}</span>
              <span className="rounded-full border border-white/12 px-2 py-0.5 text-[10px] text-muted">{section.kind}</span>
              {meta?.live && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 px-2 py-0.5 text-[10px] text-emerald-300">
                  <span className="h-1 w-1 rounded-full bg-emerald-400" /> live
                </span>
              )}
              {!section.isVisible && <span className="text-[10px] text-amber-300">hidden</span>}
            </span>
            <span className="block text-[11px] text-muted truncate mt-0.5">
              #{section.anchor}{section.title ? ` · ${section.title}` : ""}
            </span>
          </span>
        </button>

        <form action={move} className="flex gap-1 shrink-0">
          <input type="hidden" name="id" value={section.id} />
          <input type="hidden" name="docId" value={section.docId} />
          <button name="dir" value="up" aria-label="Move up" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-white/10 hover:text-ink">
            <Icon name="arrowUp" size={13} />
          </button>
          <button name="dir" value="down" aria-label="Move down" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-white/10 hover:text-ink">
            <Icon name="arrowDown" size={13} />
          </button>
        </form>
      </div>

      {open && (
        <div className="border-t border-white/10 p-4 sm:p-5 space-y-5">
          {meta?.blurb && <p className="text-xs text-muted">{meta.blurb}</p>}

          <form action={act} className="space-y-5">
            <input type="hidden" name="id" value={section.id} />
            <input type="hidden" name="docId" value={section.docId} />
            <input type="hidden" name="kind" value={section.kind} />

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Nav label" hint="What the jump menu calls it.">
                <input name="navLabel" defaultValue={section.navLabel} className="input-cosmic w-full" />
              </Field>
              <Field label="Anchor" hint="The #id in the address. Changing it breaks any link someone saved to this section.">
                <input name="anchor" defaultValue={section.anchor} className="input-cosmic w-full font-mono text-sm" />
              </Field>
            </div>

            <Field label="Title">
              <input name="title" defaultValue={section.title ?? ""} className="input-cosmic w-full" />
            </Field>
            <Field label="Subtitle">
              <textarea name="subtitle" defaultValue={section.subtitle ?? ""} rows={2} className="input-cosmic w-full" />
            </Field>

            {(section.kind === "text" || section.kind === "hero") && (
              <Field label="Body" hint="A blank line starts a new paragraph.">
                <textarea name="body" defaultValue={section.body ?? ""} rows={7} className="input-cosmic w-full leading-relaxed" />
              </Field>
            )}

            <PerKind section={section} metricOptions={metricOptions} />

            <div className="grid sm:grid-cols-[1fr_auto] gap-4 items-start pt-2 border-t border-white/10">
              <Field label="Background art" hint="Full-bleed behind this section.">
                <ImageUpload
                  name="bgUrl"
                  defaultValue={section.bgUrl ?? ""}
                  aspect="16/9"
                  maxDim={1920}
                  scope="content"
                  hint="Wide art. The dim slider below keeps the text readable over it."
                />
              </Field>
              <Field label="Darkness over the art">
                <input type="range" name="dim" min={0} max={100} step={2} defaultValue={section.dim} className="w-40 accent-violet-500" />
                <p className="text-[11px] text-muted mt-1">Higher = darker. Text over bright artwork needs 60+.</p>
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isVisible" defaultChecked={section.isVisible} className="accent-violet-500" />
              Show this section
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button disabled={busy} className="grad-btn pressable rounded-full px-6 py-2.5 font-bold text-sm disabled:opacity-60">
                {busy ? "Saving…" : "Save section"}
              </button>
              {!confirming ? (
                <button type="button" onClick={() => setConfirming(true)} className="text-xs text-muted hover:text-rose-300">
                  Delete section
                </button>
              ) : null}
              {state?.ok && <span className="text-sm text-emerald-300">{state.ok}</span>}
              {state?.error && <span className="text-sm text-amber-300">{state.error}</span>}
            </div>
          </form>

          {confirming && (
            <form action={delAct} className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3">
              <input type="hidden" name="id" value={section.id} />
              <input type="hidden" name="docId" value={section.docId} />
              <span className="text-xs text-rose-200">Remove &ldquo;{section.navLabel}&rdquo; from this document?</span>
              <button disabled={deleting} className="rounded-full bg-rose-500/20 border border-rose-400/50 px-4 py-1.5 text-xs font-semibold text-rose-100">
                {deleting ? "Removing…" : "Yes, remove it"}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="text-xs text-muted hover:text-ink">Cancel</button>
              {del?.error && <span className="text-xs text-amber-300">{del.error}</span>}
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function PerKind({ section, metricOptions }: {
  section: Section;
  metricOptions: { key: string; label: string }[];
}) {
  const d = section.data;

  switch (section.kind as SectionKind) {
    case "hero":
      return (
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Badge" hint="The small pill above the headline.">
            <input name="badge" defaultValue={d.badge ?? ""} className="input-cosmic w-full" />
          </Field>
          <Field label="Button label">
            <input name="ctaLabel" defaultValue={d.ctaLabel ?? ""} className="input-cosmic w-full" />
          </Field>
          <Field label="Button target" hint="An #anchor in this document, or a full URL.">
            <input name="ctaHref" defaultValue={d.ctaHref ?? ""} className="input-cosmic w-full font-mono text-sm" />
          </Field>
        </div>
      );

    case "text":
      return (
        <Rows
          label="Highlight cards"
          hint="Each becomes a numbered card under the text. Leave empty for prose only."
          name="bullet"
          initial={d.bullets ?? []}
          render={(v, i) => <input name="bullet" defaultValue={v} placeholder={`Point ${i + 1}`} className="input-cosmic w-full" />}
          blank=""
        />
      );

    case "milestones":
      return (
        <div className="space-y-4">
          <Field label="Which number climbs the ladder">
            <select name="metric" defaultValue={d.metric ?? "reach"} className="input-cosmic w-full sm:w-72">
              <option value="reach">Monthly active audience (members across all servers)</option>
              <option value="linked">Verified gamers (linked a game account)</option>
              <option value="gamers">Cluster profiles</option>
              <option value="servers">Servers running the bot</option>
            </select>
          </Field>
          <Rows
            label="Targets"
            hint="In any order — they're sorted. The live number decides which one is next."
            name="target"
            initial={(d.targets ?? [1000, 10000, 100000, 1000000]).map(String)}
            render={(v) => <input name="target" type="number" min={1} defaultValue={v} className="input-cosmic w-full sm:w-48" />}
            blank="1000"
          />
        </div>
      );

    case "gtm":
      return (
        <Rows
          label="Stages"
          hint="Mark exactly one as “where we are now”. The summary shows on the card; the detail opens in the modal."
          name="stageName"
          initial={(d.stages ?? []).map((s) => JSON.stringify(s))}
          blank={JSON.stringify({ name: "New stage", status: "next" })}
          render={(raw) => {
            let s: { name?: string; status?: string; summary?: string; detail?: string; bullets?: string[] } = {};
            try { s = JSON.parse(raw); } catch { /* a new blank row */ }
            return (
              <div className="grid gap-2 rounded-xl border border-white/10 p-3">
                <div className="grid sm:grid-cols-[1fr_auto] gap-2">
                  <input name="stageName" defaultValue={s.name ?? ""} placeholder="Stage name" className="input-cosmic w-full" />
                  <select name="stageStatus" defaultValue={s.status ?? "next"} className="input-cosmic">
                    <option value="done">Done</option>
                    <option value="current">Where we are now</option>
                    <option value="next">Next</option>
                  </select>
                </div>
                <input name="stageSummary" defaultValue={s.summary ?? ""} placeholder="One line, shown on the card" className="input-cosmic w-full" />
                <textarea name="stageDetail" defaultValue={s.detail ?? ""} rows={3} placeholder="The argument, shown when someone opens it" className="input-cosmic w-full" />
                <textarea name="stageBullets" defaultValue={(s.bullets ?? []).join("\n")} rows={3} placeholder="One bullet per line" className="input-cosmic w-full font-mono text-xs" />
              </div>
            );
          }}
        />
      );

    case "product":
      return (
        <Field label="Which part of the product" hint="The demo opens on this step. Every other step stays reachable.">
          <select name="focus" defaultValue={d.focus ?? "bot"} className="input-cosmic w-full sm:w-72">
            <option value="bot">The bot, from the beginning</option>
            <option value="profile">A gamer&apos;s profile card</option>
            <option value="challenges">A live challenge</option>
            <option value="leaderboards">A leaderboard</option>
            <option value="quests">Cluster Points &amp; quests</option>
          </select>
        </Field>
      );

    case "explainer":
      return (
        <Rows
          label="Steps"
          name="stepLabel"
          hint="Two or three words each — this section is a diagram, and the length limit is what keeps it one. The note opens in a modal when someone wants the detail."
          initial={(d.steps ?? []).map((x) => JSON.stringify(x))}
          blank={JSON.stringify({ icon: "spark", label: "" })}
          render={(raw) => {
            let x: { icon?: string; label?: string; note?: string } = {};
            try { x = JSON.parse(raw); } catch { /* new row */ }
            return (
              <div className="grid gap-2 rounded-xl border border-white/10 p-3">
                <div className="grid sm:grid-cols-[10rem_1fr] gap-2">
                  <select name="stepIcon" defaultValue={x.icon ?? "spark"} className="input-cosmic w-full">
                    {EXPLAINER_ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
                  </select>
                  <input name="stepLabel" defaultValue={x.label ?? ""} maxLength={22} placeholder="Label (max 22 characters)" className="input-cosmic w-full" />
                </div>
                <textarea name="stepNote" defaultValue={x.note ?? ""} rows={2} placeholder="The detail, behind a click (optional)" className="input-cosmic w-full" />
              </div>
            );
          }}
        />
      );

    case "showcase":
      return (
        <Rows
          label="Cards to show"
          name="cardKind"
          hint="These are the real PNGs the product renders, requested live — never a screenshot, so they can't go stale. Leave empty for the default set of four."
          initial={(d.cards ?? []).map((x) => JSON.stringify(x))}
          blank={JSON.stringify({ kind: "profile" })}
          render={(raw) => {
            let x: { kind?: string; caption?: string } = {};
            try { x = JSON.parse(raw); } catch { /* new row */ }
            return (
              <div className="grid gap-2 rounded-xl border border-white/10 p-3">
                <select name="cardKind" defaultValue={x.kind ?? "profile"} className="input-cosmic w-full sm:w-72">
                  {SHOWCASE_CARDS.map((c) => <option key={c.kind} value={c.kind}>{c.label}</option>)}
                </select>
                <input name="cardCaption" defaultValue={x.caption ?? ""} placeholder="Caption (optional)" className="input-cosmic w-full" />
              </div>
            );
          }}
        />
      );

    case "logos":
      return (
        <Rows
          label="Logos"
          name="logoName"
          hint="A name is enough — the logo image is optional and falls back to an initial."
          initial={(d.logos ?? []).map((l) => JSON.stringify(l))}
          blank={JSON.stringify({ name: "" })}
          render={(raw) => {
            let l: { name?: string; logoUrl?: string | null; url?: string | null; note?: string } = {};
            try { l = JSON.parse(raw); } catch { /* new row */ }
            return (
              <div className="grid gap-2 rounded-xl border border-white/10 p-3">
                <div className="grid sm:grid-cols-2 gap-2">
                  <input name="logoName" defaultValue={l.name ?? ""} placeholder="Name" className="input-cosmic w-full" />
                  <input name="logoNote" defaultValue={l.note ?? ""} placeholder="Note (optional)" className="input-cosmic w-full" />
                </div>
                <input name="logoLink" defaultValue={l.url ?? ""} placeholder="Link (optional)" className="input-cosmic w-full font-mono text-xs" />
                <ImageUpload name="logoUrl" defaultValue={l.logoUrl ?? ""} aspect="1/1" maxDim={256} scope="content" hint="Square logo." />
              </div>
            );
          }}
        />
      );

    case "gallery":
      return (
        <Rows
          label="Images"
          name="imageUrl"
          hint="Each opens full size when clicked."
          initial={(d.images ?? []).map((i) => JSON.stringify(i))}
          blank={JSON.stringify({ url: "" })}
          render={(raw) => {
            let img: { url?: string; caption?: string } = {};
            try { img = JSON.parse(raw); } catch { /* new row */ }
            return (
              <div className="grid gap-2 rounded-xl border border-white/10 p-3">
                <ImageUpload name="imageUrl" defaultValue={img.url ?? ""} aspect="16/9" maxDim={1600} scope="content" hint="Screenshot or art." />
                <input name="imageCaption" defaultValue={img.caption ?? ""} placeholder="Caption (optional)" className="input-cosmic w-full" />
              </div>
            );
          }}
        />
      );

    case "metrics":
      return (
        <Field label="Which metrics" hint="Every one stays live, and each opens its own definition when clicked.">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-72 overflow-y-auto rounded-xl border border-white/10 p-3">
            {metricOptions.map((m) => (
              <label key={m.key} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  name="metricKey"
                  value={m.key}
                  defaultChecked={(d.metricKeys ?? []).includes(m.key)}
                  className="accent-violet-500"
                />
                {m.label}
              </label>
            ))}
          </div>
        </Field>
      );

    case "faq":
      return (
        <Rows
          label="Questions"
          name="faqQ"
          initial={(d.qa ?? []).map((x) => JSON.stringify(x))}
          blank={JSON.stringify({ q: "", a: "" })}
          render={(raw) => {
            let x: { q?: string; a?: string } = {};
            try { x = JSON.parse(raw); } catch { /* new row */ }
            return (
              <div className="grid gap-2 rounded-xl border border-white/10 p-3">
                <input name="faqQ" defaultValue={x.q ?? ""} placeholder="The question, as someone would ask it" className="input-cosmic w-full" />
                <textarea name="faqA" defaultValue={x.a ?? ""} rows={3} placeholder="The answer" className="input-cosmic w-full" />
              </div>
            );
          }}
        />
      );

    case "ad":
      return (
        <Field label="Placement key" hint="Both documents share one slot by default, so a partner sees the same live inventory in either.">
          <input name="placement" defaultValue={d.placement ?? "investor-doc-ad-placement"} className="input-cosmic w-full sm:w-96 font-mono text-sm" />
        </Field>
      );

    case "contact":
      return (
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Extra link label"><input name="linkLabel" defaultValue={d.linkLabel ?? ""} className="input-cosmic w-full" /></Field>
          <Field label="Extra link target"><input name="linkHref" defaultValue={d.linkHref ?? ""} className="input-cosmic w-full font-mono text-sm" /></Field>
        </div>
      );

    // ===== The investor set =====

    case "raise": {
      const ask = d.ask ?? {};
      return (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Raising"><input name="askAmount" type="number" min={0} defaultValue={ask.amount ?? ""} placeholder="250000" className="input-cosmic w-full" /></Field>
            <Field label="Instrument"><input name="askInstrument" defaultValue={ask.instrument ?? ""} placeholder="SAFE" className="input-cosmic w-full" /></Field>
            <Field label="Currency"><input name="askCurrency" defaultValue={ask.currency ?? "USD"} className="input-cosmic w-full" /></Field>
            <Field label="Valuation / cap"><input name="askValuation" type="number" min={0} defaultValue={ask.valuation ?? ""} className="input-cosmic w-full" /></Field>
            <Field label="Equity offered %"><input name="askEquity" type="number" min={0} max={100} step={0.5} defaultValue={ask.equityPct ?? ""} className="input-cosmic w-full" /></Field>
            <Field label="Runway (months)"><input name="askRunway" type="number" min={0} defaultValue={ask.runwayMonths ?? ""} className="input-cosmic w-full" /></Field>
          </div>
          <Rows
            label="Use of funds"
            name="useLabel"
            hint="Percentages of the round. They're drawn as one bar, and the slide says so if they don't add to 100."
            initial={(d.useOfFunds ?? []).map((x) => JSON.stringify(x))}
            blank={JSON.stringify({ label: "", pct: 0 })}
            render={(raw) => {
              let x: { label?: string; pct?: number; note?: string } = {};
              try { x = JSON.parse(raw); } catch { /* new row */ }
              return (
                <div className="grid gap-2 rounded-xl border border-white/10 p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_6rem]">
                    <input name="useLabel" defaultValue={x.label ?? ""} placeholder="Prize pools" className="input-cosmic w-full" />
                    <input name="usePct" type="number" min={0} max={100} defaultValue={x.pct ?? 0} placeholder="%" className="input-cosmic w-full" />
                  </div>
                  <input name="useNote" defaultValue={x.note ?? ""} placeholder="What that money actually does (optional)" className="input-cosmic w-full" />
                </div>
              );
            }}
          />
          <Rows
            label="Cap table, after the round"
            name="capHolder"
            hint="Percentages only — a shape, not a share register."
            initial={(d.capTable ?? []).map((x) => JSON.stringify(x))}
            blank={JSON.stringify({ holder: "", pct: 0 })}
            render={(raw) => {
              let x: { holder?: string; pct?: number; note?: string } = {};
              try { x = JSON.parse(raw); } catch { /* new row */ }
              return (
                <div className="grid gap-2 rounded-xl border border-white/10 p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_6rem]">
                    <input name="capHolder" defaultValue={x.holder ?? ""} placeholder="Founders" className="input-cosmic w-full" />
                    <input name="capPct" type="number" min={0} max={100} defaultValue={x.pct ?? 0} placeholder="%" className="input-cosmic w-full" />
                  </div>
                  <input name="capNote" defaultValue={x.note ?? ""} placeholder="Vesting, class, terms (optional)" className="input-cosmic w-full" />
                </div>
              );
            }}
          />
        </div>
      );
    }

    case "unit":
      return (
        <Rows
          label="Units"
          name="unitLabel"
          hint="One row per unit of sale. The margin and its percentage are calculated — don't type them."
          initial={(d.units ?? []).map((x) => JSON.stringify(x))}
          blank={JSON.stringify({ label: "", revenue: 0, cost: 0 })}
          render={(raw) => {
            let x: { label?: string; revenue?: number; cost?: number; note?: string } = {};
            try { x = JSON.parse(raw); } catch { /* new row */ }
            return (
              <div className="grid gap-2 rounded-xl border border-white/10 p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_7rem_7rem]">
                  <input name="unitLabel" defaultValue={x.label ?? ""} placeholder="One weekly challenge" className="input-cosmic w-full" />
                  <input name="unitRevenue" type="number" min={0} defaultValue={x.revenue ?? 0} placeholder="Revenue" className="input-cosmic w-full" />
                  <input name="unitCost" type="number" min={0} defaultValue={x.cost ?? 0} placeholder="Cost" className="input-cosmic w-full" />
                </div>
                <input name="unitNote" defaultValue={x.note ?? ""} placeholder="What the cost actually is (optional)" className="input-cosmic w-full" />
              </div>
            );
          }}
        />
      );

    case "saas":
      return (
        <Rows
          label="Extra metrics"
          name="saasLabel"
          hint="MRR, ARR, paying brands, ARPA, impressions and clicks are read from the database and always shown. Add anything the database can't answer — pipeline, LOIs, retention."
          initial={(d.saasNotes ?? []).map((x) => JSON.stringify(x))}
          blank={JSON.stringify({ label: "", value: "" })}
          render={(raw) => {
            let x: { label?: string; value?: string; note?: string } = {};
            try { x = JSON.parse(raw); } catch { /* new row */ }
            return (
              <div className="grid gap-2 rounded-xl border border-white/10 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input name="saasLabel" defaultValue={x.label ?? ""} placeholder="Pipeline" className="input-cosmic w-full" />
                  <input name="saasValue" defaultValue={x.value ?? ""} placeholder="$40,000" className="input-cosmic w-full" />
                </div>
                <input name="saasNote" defaultValue={x.note ?? ""} placeholder="How it's counted (optional)" className="input-cosmic w-full" />
              </div>
            );
          }}
        />
      );

    case "market":
      return (
        <Rows
          label="Market figures"
          name="marketLabel"
          hint="Every figure carries where it came from. A number with no source is the one that ends the meeting."
          initial={(d.market ?? []).map((x) => JSON.stringify(x))}
          blank={JSON.stringify({ label: "", value: "" })}
          render={(raw) => {
            let x: { label?: string; value?: string; note?: string; source?: string } = {};
            try { x = JSON.parse(raw); } catch { /* new row */ }
            return (
              <div className="grid gap-2 rounded-xl border border-white/10 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input name="marketLabel" defaultValue={x.label ?? ""} placeholder="Today's sellable inventory" className="input-cosmic w-full" />
                  <input name="marketValue" defaultValue={x.value ?? ""} placeholder="$6,400 / mo" className="input-cosmic w-full" />
                </div>
                <textarea name="marketNote" defaultValue={x.note ?? ""} rows={2} placeholder="The arithmetic behind it" className="input-cosmic w-full" />
                <input name="marketSource" defaultValue={x.source ?? ""} placeholder="Source — a report, a page, or 'bottom-up from our rate card'" className="input-cosmic w-full" />
              </div>
            );
          }}
        />
      );

    default:
      return null;
  }
}

// A repeating list of anything. Rows are added and removed in the browser and
// submitted as repeated fields — the server reads them positionally, so no
// index bookkeeping is needed and nothing is ever hand-written JSON.
function Rows({ label, hint, name, initial, render, blank }: {
  label: string;
  hint?: string;
  name: string;
  initial: string[];
  blank: string;
  render: (value: string, index: number) => React.ReactNode;
}) {
  const [items, setItems] = useState<string[]>(initial.length ? initial : []);
  return (
    <Field label={label} hint={hint}>
      <div className="space-y-2">
        {items.map((v, i) => (
          <div key={`${name}-${i}`} className="flex items-start gap-2">
            <div className="flex-1 min-w-0">{render(v, i)}</div>
            <button
              type="button"
              onClick={() => setItems(items.filter((_, j) => j !== i))}
              aria-label="Remove"
              className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-rose-500/15 hover:text-rose-300"
            >
              <Icon name="x" size={13} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setItems([...items, blank])}
          className="ghost-btn pressable rounded-full px-4 py-1.5 text-xs"
        >
          + Add
        </button>
      </div>
    </Field>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold mb-1.5">{label}</div>
      {hint && <p className="text-[11px] text-muted mb-2 max-w-xl">{hint}</p>}
      {children}
    </div>
  );
}
