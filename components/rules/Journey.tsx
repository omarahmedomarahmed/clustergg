"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import type { JourneyStep } from "@/lib/journeys";

// The path, walked one step at a time. B119.
//
// ===== WHY IT IS INTERACTIVE RATHER THAN A LIST OF EIGHT CARDS =====
//
// Eight cards down a page is the same information and a worse read: everything
// competes at once, so the eye picks the shortest paragraph rather than the
// first step. A rail with one open step makes the ORDER the primary fact, which
// is the thing the reader came for.
//
// It also has to survive somebody who wants the whole thing at once — a
// screenshot, a printout, a person who reads faster than they click — so the
// closed steps still carry their title and the whole list is keyboard-reachable
// in order. Nothing is hidden that matters; what is hidden is the detail of
// steps you are not on.
//
// The rail is horizontal on a wide screen and vertical on a phone, because a
// horizontal rail of eight on 375px is either unreadable or a swipe nobody
// discovers.

export default function Journey({ steps, accent = "#a78bfa" }: { steps: JourneyStep[]; accent?: string }) {
  const [open, setOpen] = useState(0);
  const step = steps[open] ?? steps[0];

  return (
    <div>
      {/* ===== The rail ===== */}
      <ol className="flex snap-x gap-1 overflow-x-auto pb-2 sm:grid sm:snap-none sm:overflow-visible"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => {
          const on = i === open;
          const done = i < open;
          return (
            <li key={s.title} className="relative min-w-[104px] shrink-0 snap-start sm:min-w-0">
              {/* The connector, drawn behind the node rather than between two
                  of them — a border between list items leaves a stub hanging
                  off the last one. */}
              {i > 0 && (
                <span
                  aria-hidden
                  className="absolute left-0 top-[18px] h-px w-1/2"
                  style={{ background: done || on ? accent : "rgba(255,255,255,0.14)" }}
                />
              )}
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className="absolute right-0 top-[18px] h-px w-1/2"
                  style={{ background: done ? accent : "rgba(255,255,255,0.14)" }}
                />
              )}
              <button
                type="button"
                onClick={() => setOpen(i)}
                aria-current={on ? "step" : undefined}
                className="relative flex w-full flex-col items-center gap-2 px-1 py-1 text-center"
              >
                <span
                  className="grid h-9 w-9 place-items-center rounded-full border transition-all"
                  style={{
                    borderColor: on || done ? accent : "rgba(255,255,255,0.18)",
                    background: on ? accent : done ? "rgba(255,255,255,0.06)" : "rgba(4,5,26,0.85)",
                    boxShadow: on ? `0 0 22px -6px ${accent}` : undefined,
                  }}
                >
                  <Icon name={s.icon} size={16} className={on ? "text-[#12002e]" : done ? "text-ink" : "text-muted"} />
                </span>
                <span className={`text-[11px] leading-tight ${on ? "font-bold text-ink" : "text-muted"}`}>
                  {s.title}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* ===== The open step ===== */}
      <div className="glass mt-4 rounded-3xl p-6">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em]" style={{ color: accent }}>
          Step {open + 1} of {steps.length}
        </div>
        <h3 className="mt-2 text-xl font-bold">{step.title}</h3>
        <p className="mt-2 max-w-2xl leading-relaxed text-muted">{step.body}</p>

        {/* The helper line is the point of the whole component: one sentence
            per step that stops the step going wrong. It is set apart rather
            than appended, because a caveat inside a paragraph is a caveat
            nobody reads. */}
        {step.helper && (
          <p className="mt-4 flex max-w-2xl items-start gap-2 rounded-2xl border border-white/10 bg-black/25 p-3 text-sm leading-relaxed">
            <Icon name="spark" size={13} className="mt-1 shrink-0" style={{ color: accent }} />
            <span className="text-muted">{step.helper}</span>
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {step.href && (
            <Link href={step.href} className="ghost-btn pressable inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm">
              Go there <Icon name="arrowRight" size={13} />
            </Link>
          )}
          <button
            type="button"
            onClick={() => setOpen((i) => Math.max(0, i - 1))}
            disabled={open === 0}
            className="ghost-btn pressable rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-35"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => setOpen((i) => Math.min(steps.length - 1, i + 1))}
            disabled={open === steps.length - 1}
            className="pressable rounded-full px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-35"
            style={{ background: accent, color: "#12002e" }}
          >
            Next step
          </button>
        </div>
      </div>
    </div>
  );
}
