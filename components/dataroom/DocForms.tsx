"use client";

import { useActionState, useState } from "react";
import { saveDoc, deleteDoc, reseedDocSections, addSection, savePerson, deletePerson, movePerson, type DocActionState } from "@/app/actions/dataroom";
import ImageUpload from "@/components/ImageUpload";
import Icon from "@/components/Icon";
import { SECTION_KINDS, type Doc, type Person } from "@/lib/dataroom/types";

export function DocSettings({ doc }: { doc?: Doc }) {
  const [state, act, busy] = useActionState<DocActionState, FormData>(saveDoc, undefined);
  return (
    <form action={act} className="space-y-5">
      {doc && <input type="hidden" name="id" value={doc.id} />}

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Title"><input name="title" defaultValue={doc?.title ?? ""} required className="input-cosmic w-full" /></Field>
        <Field label="Web address" hint="This is the link you share. Changing it breaks any link already sent.">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted shrink-0">/dataroom/</span>
            <input name="slug" defaultValue={doc?.slug ?? ""} placeholder="pitch-deck" className="input-cosmic w-full font-mono text-sm" />
          </div>
        </Field>
      </div>

      <Field label="Subtitle"><input name="subtitle" defaultValue={doc?.subtitle ?? ""} className="input-cosmic w-full" /></Field>
      <Field label="Summary" hint="Shown on the data room card and used as the link preview.">
        <textarea name="summary" defaultValue={doc?.summary ?? ""} rows={3} className="input-cosmic w-full" />
      </Field>

      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Audience">
          <select name="kind" defaultValue={doc?.kind ?? "deck"} className="input-cosmic w-full">
            <option value="deck">Investors</option>
            <option value="profile">Brands &amp; publishers</option>
          </select>
        </Field>
        <Field label="Primary colour">
          <input type="color" name="accent" defaultValue={doc?.accent ?? "#8b5cf6"} className="h-10 w-full cursor-pointer rounded-lg border border-white/15 bg-transparent p-1" />
        </Field>
        <Field label="Secondary colour">
          <input type="color" name="accent2" defaultValue={doc?.accent2 ?? "#22d3ee"} className="h-10 w-full cursor-pointer rounded-lg border border-white/15 bg-transparent p-1" />
        </Field>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Contact email"><input name="contactEmail" type="email" defaultValue={doc?.contactEmail ?? ""} className="input-cosmic w-full" /></Field>
        <Field label="Access key" hint="Leave empty for anyone with the link — which is usually right, because a link you have to negotiate doesn't get forwarded.">
          <input name="accessKey" defaultValue={doc?.accessKey ?? ""} className="input-cosmic w-full font-mono text-sm" />
        </Field>
      </div>

      <Field label="Contact note" hint="Shown above the contact button.">
        <textarea name="contactNote" defaultValue={doc?.contactNote ?? ""} rows={2} className="input-cosmic w-full" />
      </Field>

      <Field label="Cover art" hint="Shown behind this document's card in the data room.">
        <ImageUpload name="coverUrl" defaultValue={doc?.coverUrl ?? ""} aspect="16/9" maxDim={1400} scope="content" />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPublished" defaultChecked={doc?.isPublished ?? true} className="accent-violet-500" />
        Published — unpublished documents 404 even with the link
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy} className="glow-btn pressable rounded-full px-6 py-2.5 font-bold text-sm disabled:opacity-60">
          {busy ? "Saving…" : doc ? "Save document" : "Create document"}
        </button>
        {state?.ok && <span className="text-sm text-emerald-300">{state.ok}</span>}
        {state?.error && <span className="text-sm text-amber-300">{state.error}</span>}
      </div>
    </form>
  );
}

export function AddSection({ docId }: { docId: string }) {
  const [state, act, busy] = useActionState<DocActionState, FormData>(addSection, undefined);
  const [kind, setKind] = useState("text");
  const meta = SECTION_KINDS.find((k) => k.kind === kind);

  return (
    <form action={act} className="space-y-3">
      <input type="hidden" name="docId" value={docId} />
      <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
        <Field label="Add a section">
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className="input-cosmic w-full">
            {SECTION_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>{k.label}{k.live ? " · live data" : ""}</option>
            ))}
          </select>
        </Field>
        <button disabled={busy} className="ghost-btn pressable rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-60">
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
      {meta && <p className="text-xs text-muted">{meta.blurb}</p>}
      {state?.ok && <p className="text-sm text-emerald-300">{state.ok}</p>}
      {state?.error && <p className="text-sm text-amber-300">{state.error}</p>}
    </form>
  );
}

export function DeleteDoc({ doc }: { doc: Doc }) {
  const [state, act, busy] = useActionState<DocActionState, FormData>(deleteDoc, undefined);
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} className="text-xs text-muted hover:text-rose-300">
        Delete this document
      </button>
    );
  }
  return (
    <form action={act} className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 space-y-2">
      <input type="hidden" name="id" value={doc.id} />
      <p className="text-xs text-rose-200">
        This removes the document and every section in it. Anyone holding the link gets a 404 with no
        explanation. Type <b>{doc.slug}</b> to confirm.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input name="confirm" placeholder={doc.slug} className="input-cosmic w-48 font-mono text-sm" />
        <button disabled={busy} className="rounded-full bg-rose-500/20 border border-rose-400/50 px-4 py-1.5 text-xs font-semibold text-rose-100">
          {busy ? "Deleting…" : "Delete"}
        </button>
        <button type="button" onClick={() => setArmed(false)} className="text-xs text-muted hover:text-ink">Cancel</button>
      </div>
      {state?.error && <p className="text-xs text-amber-300">{state.error}</p>}
    </form>
  );
}

// Pull the shipped deck back in.
//
// Seeding runs once, so a document seeded months ago never sees a redesign.
// This is the way to take one — and it is destructive, so it is armed and
// confirmed exactly like deleting is.
export function ReseedDoc({ doc }: { doc: Doc }) {
  const [state, act, busy] = useActionState<DocActionState, FormData>(reseedDocSections, undefined);
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} className="text-xs text-muted hover:text-cyan-300">
        Restore the shipped sections
      </button>
    );
  }
  return (
    <form action={act} className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-4 space-y-2">
      <input type="hidden" name="id" value={doc.id} />
      <p className="text-xs text-cyan-100">
        Replaces every section in this document with the version we ship — the visual one, with the
        graphic explainers and the live product cards. <b>Your own sections and text are deleted</b>,
        and the title, subtitle and summary are rewritten to the shipped ones, because a restored deck
        under an old cover line is half a deck. Colours, access key and contact details are untouched.
        Type <b>{doc.slug}</b> to confirm.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input name="confirm" placeholder={doc.slug} className="input-cosmic w-48 font-mono text-sm" />
        <button disabled={busy} className="rounded-full bg-cyan-500/20 border border-cyan-400/50 px-4 py-1.5 text-xs font-semibold text-cyan-100">
          {busy ? "Restoring…" : "Restore"}
        </button>
        <button type="button" onClick={() => setArmed(false)} className="text-xs text-muted hover:text-ink">Cancel</button>
      </div>
      {state?.ok && <p className="text-xs text-emerald-300">{state.ok}</p>}
      {state?.error && <p className="text-xs text-amber-300">{state.error}</p>}
    </form>
  );
}

// ===== Team =====

export function PersonEditor({ person, docs }: { person?: Person; docs: Doc[] }) {
  const [open, setOpen] = useState(!person);
  const [state, act, busy] = useActionState<DocActionState, FormData>(savePerson, undefined);
  const [, move] = useActionState<DocActionState, FormData>(movePerson, undefined);
  const [del, delAct] = useActionState<DocActionState, FormData>(deletePerson, undefined);
  const [logos, setLogos] = useState<{ name: string; logoUrl?: string | null }[]>(
    person?.logos.length ? person.logos : [{ name: "" }],
  );

  return (
    <div className="rounded-2xl border border-white/10">
      {person && (
        <div className="flex items-center gap-2 p-3">
          <button type="button" onClick={() => setOpen((v) => !v)} className="flex-1 flex items-center gap-3 text-left min-w-0">
            <Icon name={open ? "chevronDown" : "chevronRight"} size={15} className="shrink-0 text-muted" />
            {person.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={person.avatarUrl} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0" />
            ) : (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-500/20 text-sm font-black">
                {person.name.slice(0, 1)}
              </span>
            )}
            <span className="min-w-0">
              <span className="block font-semibold text-sm truncate">{person.name}</span>
              <span className="block text-[11px] text-muted truncate">
                {person.role}{person.docId ? " · one document only" : " · every document"}
              </span>
            </span>
          </button>
          <form action={move} className="flex gap-1 shrink-0">
            <input type="hidden" name="id" value={person.id} />
            <button name="dir" value="up" aria-label="Move up" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-white/10 hover:text-ink"><Icon name="arrowUp" size={13} /></button>
            <button name="dir" value="down" aria-label="Move down" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-white/10 hover:text-ink"><Icon name="arrowDown" size={13} /></button>
          </form>
        </div>
      )}

      {open && (
        <div className={person ? "border-t border-white/10 p-4 sm:p-5" : "p-4 sm:p-5"}>
          <form action={act} className="space-y-4">
            {person && <input type="hidden" name="id" value={person.id} />}

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Name"><input name="name" defaultValue={person?.name ?? ""} required className="input-cosmic w-full" /></Field>
              <Field label="Role"><input name="role" defaultValue={person?.role ?? ""} className="input-cosmic w-full" /></Field>
            </div>

            <Field label="Bio" hint="Shown in the modal. Two or three sentences on what they've built and why they're right for this beats a list of titles.">
              <textarea name="bio" defaultValue={person?.bio ?? ""} rows={5} className="input-cosmic w-full leading-relaxed" />
            </Field>

            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Email"><input name="email" type="email" defaultValue={person?.email ?? ""} className="input-cosmic w-full" /></Field>
              <Field label="LinkedIn"><input name="linkedin" defaultValue={person?.linkedin ?? ""} className="input-cosmic w-full text-sm" /></Field>
              <Field label="X"><input name="x" defaultValue={person?.x ?? ""} className="input-cosmic w-full text-sm" /></Field>
            </div>

            <Field label="Photo">
              <ImageUpload name="avatarUrl" defaultValue={person?.avatarUrl ?? ""} aspect="1/1" maxDim={512} scope="content" />
            </Field>

            <Field label="Where they've worked" hint="Shown as logos on the card and named in the modal. A name alone works — it falls back to an initial.">
              <div className="space-y-2">
                {logos.map((l, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-xl border border-white/10 p-3">
                    <div className="flex-1 grid sm:grid-cols-2 gap-2">
                      <input name="logoName" defaultValue={l.name} placeholder="Company" className="input-cosmic w-full" />
                      <input name="logoLink" defaultValue="" placeholder="Link (optional)" className="input-cosmic w-full text-sm" />
                      <div className="sm:col-span-2">
                        <ImageUpload name="logoUrl" defaultValue={l.logoUrl ?? ""} aspect="1/1" maxDim={200} scope="content" hint="Square logo (optional)." />
                      </div>
                    </div>
                    <button type="button" onClick={() => setLogos(logos.filter((_, j) => j !== i))}
                      aria-label="Remove" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-rose-500/15 hover:text-rose-300">
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setLogos([...logos, { name: "" }])} className="ghost-btn pressable rounded-full px-4 py-1.5 text-xs">
                  + Add a company
                </button>
              </div>
            </Field>

            <Field label="Show on" hint="Most people belong on every document — two copies of the same founder drift.">
              <select name="docId" defaultValue={person?.docId ?? ""} className="input-cosmic w-full sm:w-72">
                <option value="">Every document</option>
                {docs.map((d) => <option key={d.id} value={d.id}>{d.title} only</option>)}
              </select>
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isVisible" defaultChecked={person?.isVisible ?? true} className="accent-violet-500" />
              Show this person
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button disabled={busy} className="glow-btn pressable rounded-full px-6 py-2.5 font-bold text-sm disabled:opacity-60">
                {busy ? "Saving…" : person ? "Save" : "Add person"}
              </button>
              {state?.ok && <span className="text-sm text-emerald-300">{state.ok}</span>}
              {state?.error && <span className="text-sm text-amber-300">{state.error}</span>}
            </div>
          </form>

          {person && (
            <form action={delAct} className="mt-4 pt-4 border-t border-white/10">
              <input type="hidden" name="id" value={person.id} />
              <button className="text-xs text-muted hover:text-rose-300">Remove {person.name}</button>
              {del?.error && <span className="text-xs text-amber-300 ml-2">{del.error}</span>}
            </form>
          )}
        </div>
      )}
    </div>
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
