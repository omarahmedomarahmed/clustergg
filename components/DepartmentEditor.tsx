"use client";

import { useActionState, useState } from "react";
import Icon from "@/components/Icon";
import { SYSTEMS } from "@/lib/systems";
import { upsertDepartment, removeDepartment, placeStaff, type DeptState } from "@/app/actions/departments";

// The org chart, as an editor.
//
// Two decisions live here and nowhere else: what a department runs, and who is
// in it. Both are shown as their consequence rather than as a form — a system
// with no department says so in red, and a person with no department is told
// they can currently open nothing, because those are the two states that
// silently break a new hire's first week.

export type DeptRow = {
  id: string;
  name: string;
  purpose: string;
  systems: string[];
  staff: { id: string; displayName: string; email: string | null; role: string }[];
};

export type StaffRow = { id: string; displayName: string; email: string | null; departmentId: string | null };

export default function DepartmentEditor({
  departments, staff,
}: { departments: DeptRow[]; staff: StaffRow[] }) {
  const claimed = new Set(departments.flatMap((d) => d.systems));
  const orphanSystems = SYSTEMS.filter((s) => !claimed.has(s.key));
  const unplaced = staff.filter((s) => !s.departmentId);

  return (
    <div className="space-y-8">
      {(orphanSystems.length > 0 || unplaced.length > 0) && (
        <div className="glass border border-amber-400/30 p-5">
          <h2 className="font-bold flex items-center gap-2">
            <Icon name="alert" size={16} className="text-amber-300" /> Gaps
          </h2>
          {orphanSystems.length > 0 && (
            <p className="mt-2 text-sm text-muted">
              <b className="text-amber-200">{orphanSystems.length} system{orphanSystems.length === 1 ? "" : "s"} nobody runs:</b>{" "}
              {orphanSystems.map((s) => s.name).join(", ")}. Nothing breaks — an admin still sees every page —
              but there is no one whose job it is.
            </p>
          )}
          {unplaced.length > 0 && (
            <p className="mt-2 text-sm text-muted">
              <b className="text-amber-200">{unplaced.length} staff member{unplaced.length === 1 ? "" : "s"} in no department:</b>{" "}
              {unplaced.map((s) => s.displayName).join(", ")}. They can open nothing until you place them.
            </p>
          )}
        </div>
      )}

      {departments.map((d) => <DeptCard key={d.id} dept={d} staff={staff} />)}

      <NewDepartment />
    </div>
  );
}

function DeptCard({ dept, staff }: { dept: DeptRow; staff: StaffRow[] }) {
  const [state, save, saving] = useActionState<DeptState, FormData>(upsertDepartment, null);
  const [place, placeAction, placing] = useActionState<DeptState, FormData>(placeStaff, null);
  const [editing, setEditing] = useState(false);
  const runs = SYSTEMS.filter((s) => dept.systems.includes(s.key));
  const free = staff.filter((s) => s.departmentId !== dept.id);

  return (
    <section className="glass p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{dept.name}</h2>
          {dept.purpose && <p className="mt-0.5 max-w-2xl text-sm text-muted">{dept.purpose}</p>}
        </div>
        <button
          type="button" onClick={() => setEditing((v) => !v)}
          className="ghost-btn rounded-full px-4 py-1.5 text-xs"
        >
          {editing ? "Close" : "Edit"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {runs.length === 0 ? (
          <span className="text-xs text-amber-300">Runs nothing yet — this department can open no pages.</span>
        ) : runs.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100">
            <Icon name={s.icon} size={12} />{s.name}
          </span>
        ))}
      </div>

      {/* Who's in it */}
      <div className="mt-5">
        <div className="text-[11px] uppercase tracking-widest text-muted">Team</div>
        {dept.staff.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Nobody yet.</p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {dept.staff.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                <span className="text-sm">
                  {p.displayName}
                  <span className="ml-2 text-[11px] text-muted">{p.email}</span>
                  {p.role !== "staff" && (
                    <span className="ml-2 text-[10px] uppercase tracking-widest text-amber-300">{p.role}</span>
                  )}
                </span>
                <form action={placeAction}>
                  <input type="hidden" name="userId" value={p.id} />
                  <input type="hidden" name="departmentId" value="" />
                  <button className="text-[11px] text-rose-300 hover:underline">Remove</button>
                </form>
              </div>
            ))}
          </div>
        )}

        {free.length > 0 && (
          <form action={placeAction} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="departmentId" value={dept.id} />
            <select name="userId" className="input-cosmic !py-1.5 text-sm">
              {free.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}{s.departmentId ? " (moving here)" : ""}
                </option>
              ))}
            </select>
            <button disabled={placing} className="ghost-btn rounded-full px-4 py-1.5 text-xs disabled:opacity-60">
              {placing ? "Moving…" : "Add to this department"}
            </button>
          </form>
        )}
        {place?.ok && <p className="mt-2 text-xs text-emerald-300">{place.ok}</p>}
        {place?.error && <p className="mt-2 text-xs text-rose-300">{place.error}</p>}
      </div>

      {editing && (
        <form action={save} className="mt-6 border-t border-white/10 pt-5">
          <input type="hidden" name="departmentId" value={dept.id} />
          <label className="block text-xs text-muted">
            <span className="mb-1 block">Name</span>
            <input name="name" defaultValue={dept.name} required className="input-cosmic w-full max-w-sm" />
          </label>
          <label className="mt-3 block text-xs text-muted">
            <span className="mb-1 block">What this team is responsible for</span>
            <textarea name="purpose" defaultValue={dept.purpose} rows={2} className="input-cosmic w-full resize-y" />
          </label>
          <SystemPicker selected={dept.systems} />
          <div className="mt-4">
            <button disabled={saving} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          {state?.ok && <p className="mt-2 text-xs text-emerald-300">{state.ok}</p>}
          {state?.error && <p className="mt-2 text-xs text-rose-300">{state.error}</p>}
        </form>
      )}

      {/* Delete sits OUTSIDE the edit form on purpose. A form nested inside
          another form is invalid HTML: React submits the outer one instead,
          so the delete button silently saved the department it was meant to
          remove. */}
      {editing && (
        <form action={removeDepartment.bind(null, dept.id)} className="mt-3">
          <button className="text-xs text-rose-300 hover:underline">Delete department</button>
        </form>
      )}
    </section>
  );
}

function NewDepartment() {
  const [state, save, saving] = useActionState<DeptState, FormData>(upsertDepartment, null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button" onClick={() => setOpen(true)}
        className="glow-btn pressable rounded-full px-6 py-2.5 text-sm font-semibold text-white"
      >
        New department
      </button>
    );
  }

  return (
    <form action={save} className="glass p-6">
      <h2 className="font-bold">New department</h2>
      <label className="mt-3 block text-xs text-muted">
        <span className="mb-1 block">Name</span>
        <input name="name" required placeholder="Growth" className="input-cosmic w-full max-w-sm" />
      </label>
      <label className="mt-3 block text-xs text-muted">
        <span className="mb-1 block">What this team is responsible for</span>
        <textarea name="purpose" rows={2} placeholder="Getting the bot into servers and keeping owners happy." className="input-cosmic w-full resize-y" />
      </label>
      <SystemPicker selected={[]} />
      <div className="mt-4 flex items-center gap-3">
        <button disabled={saving} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {saving ? "Creating…" : "Create"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted hover:text-ink">Cancel</button>
      </div>
      {state?.ok && <p className="mt-2 text-xs text-emerald-300">{state.ok}</p>}
      {state?.error && <p className="mt-2 text-xs text-rose-300">{state.error}</p>}
    </form>
  );
}

function SystemPicker({ selected }: { selected: string[] }) {
  return (
    <fieldset className="mt-4">
      <legend className="mb-2 text-xs text-muted">
        What they run. Each system is a whole job — a page belongs to exactly one.
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {SYSTEMS.map((s) => (
          <label key={s.key} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/10 bg-black/25 p-3 hover:border-white/25">
            <input
              type="checkbox" name="systems" value={s.key}
              defaultChecked={selected.includes(s.key)}
              className="mt-0.5 accent-cyan-500"
            />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Icon name={s.icon} size={12} className="text-cyan-300" />{s.name}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted">{s.outcome}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
