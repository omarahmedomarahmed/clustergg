import Icon from "@/components/Icon";
import { CAPABILITIES, COMPETITORS, type Verdict } from "@/lib/positioning";

// What a brand is actually choosing between.
//
// Every brand evaluating us has three other options on the table, and pretending
// otherwise reads as either naivety or evasion. Naming them — and marking the
// rows where a competitor genuinely wins or partly wins — is what makes the
// rows where we win believable.
//
// Two renderings of one dataset: a matrix on a wide screen, and a stack of
// per-capability cards on a phone, because a 4-column table at 390px is a table
// nobody reads.

const MARK: Record<Verdict, { icon: "check" | "x" | "minus"; className: string; label: string }> = {
  yes: { icon: "check", className: "text-emerald-300", label: "Yes" },
  part: { icon: "minus", className: "text-amber-300", label: "Partly" },
  no: { icon: "x", className: "text-white/25", label: "No" },
};

function Mark({ v, ours }: { v: Verdict; ours?: boolean }) {
  const m = MARK[v];
  return (
    <span
      title={m.label}
      className={`grid h-7 w-7 place-items-center rounded-full ${
        v === "yes" && ours ? "bg-violet-500/20 ring-1 ring-violet-400/40" : ""
      } ${m.className}`}
    >
      <Icon name={m.icon} size={15} />
      <span className="sr-only">{m.label}</span>
    </span>
  );
}

export default function CompareMatrix({ title, subtitle }: { title?: string; subtitle?: string }) {
  return (
    <div>
      {(title || subtitle) && (
        <div className="mx-auto mb-8 max-w-2xl text-center">
          {title && <h2 className="text-3xl md:text-4xl font-bold">{title}</h2>}
          {subtitle && <p className="mt-3 leading-relaxed text-muted">{subtitle}</p>}
        </div>
      )}

      {/* Wide: the matrix. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="w-[38%] p-3 text-left align-bottom" />
              {COMPETITORS.map((c) => (
                <th
                  key={c.key}
                  className={`p-3 text-center align-bottom ${
                    c.ours ? "rounded-t-2xl border border-b-0 border-violet-400/30 bg-violet-500/[0.07]" : ""
                  }`}
                >
                  <div className={`font-bold ${c.ours ? "brand-text" : ""}`}>{c.name}</div>
                  <div className="mt-1 text-[11px] font-normal leading-snug text-muted">{c.note}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAPABILITIES.map((row, i) => (
              <tr key={row.label}>
                <td className={`p-3 align-top ${i > 0 ? "border-t border-white/5" : ""}`}>
                  <div className="font-semibold">{row.label}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-muted">{row.why}</div>
                </td>
                {COMPETITORS.map((c) => (
                  <td
                    key={c.key}
                    className={`p-3 text-center align-top ${i > 0 ? "border-t border-white/5" : ""} ${
                      c.ours ? "border-x border-violet-400/30 bg-violet-500/[0.07]" : ""
                    } ${c.ours && i === CAPABILITIES.length - 1 ? "rounded-b-2xl border-b" : ""}`}
                  >
                    <div className="flex justify-center"><Mark v={row.by[c.key] ?? "no"} ours={c.ours} /></div>
                    {row.caveat?.[c.key] && (
                      <div className="mt-1 text-[10px] leading-snug text-muted">{row.caveat[c.key]}</div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Narrow: one card per capability. */}
      <div className="space-y-3 md:hidden">
        {CAPABILITIES.map((row) => (
          <div key={row.label} className="glass rounded-2xl p-4">
            <div className="font-semibold">{row.label}</div>
            <div className="mt-0.5 text-[11px] leading-snug text-muted">{row.why}</div>
            <div className="mt-3 space-y-1.5">
              {COMPETITORS.map((c) => (
                <div key={c.key} className={`flex items-center gap-2 rounded-lg px-2 py-1 ${c.ours ? "bg-violet-500/10" : ""}`}>
                  <Mark v={row.by[c.key] ?? "no"} ours={c.ours} />
                  <span className={`text-xs ${c.ours ? "font-semibold brand-text" : "text-muted"}`}>{c.name}</span>
                  {row.caveat?.[c.key] && <span className="ml-auto text-[10px] leading-snug text-muted">{row.caveat[c.key]}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
