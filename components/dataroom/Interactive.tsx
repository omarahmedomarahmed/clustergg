"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import LoopRing from "@/components/viz/LoopRing";
import { useDetail } from "@/components/dataroom/DetailModal";
import type { MilestoneLadder } from "@/lib/dataroom/types-client";
import type { Person, SectionData } from "@/lib/dataroom/types";

const nf = (n: number) => n.toLocaleString();
// 1,000,000 → 1M. A ladder of full numbers is unreadable at a glance and the
// whole point of the ladder is the glance.
const short = (n: number) =>
  n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1_000 ? `${n / 1_000}K` : String(n);

// ===== Milestones =====
//
// The ladder, with the real number against it. Progress is measured through the
// CURRENT rung rather than the whole ladder — 340 out of 1,000,000 is a
// rounding error that reads as zero, while 34% of the way to the first target
// is both true and motivating.
export function Milestones({ ladder, label, accent, accent2 }: {
  ladder: MilestoneLadder; label: string; accent: string; accent2: string;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <div className="text-5xl sm:text-7xl font-black tabular-nums" style={{ color: accent2 }}>
            {nf(ladder.current)}
          </div>
          <div className="text-xs uppercase tracking-widest text-muted mt-1">{label} today</div>
        </div>
        {ladder.next !== null && (
          <div className="pb-1.5">
            <div className="text-lg font-bold">{nf(ladder.toNext)} to go</div>
            <div className="text-xs text-muted">until {short(ladder.next)}</div>
          </div>
        )}
      </div>

      {/* The rung we're on. */}
      {ladder.next !== null && (
        <div className="mt-5">
          <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{ width: `${ladder.pctToNext}%`, background: `linear-gradient(90deg, ${accent}, ${accent2})` }}
            />
          </div>
          <div className="text-[11px] text-muted mt-1.5">{ladder.pctToNext}% of the way to {short(ladder.next)}</div>
        </div>
      )}

      {/* The whole ladder, including the rungs above — the interesting question
          for a reader is what the next two look like, not just this one. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-8">
        {ladder.targets.map((t) => (
          <div
            key={t.value}
            className={`relative overflow-hidden rounded-2xl border p-5 transition ${
              t.reached
                ? "border-emerald-400/40 bg-emerald-500/10"
                : t.isNext
                  ? "bg-white/[0.04]"
                  : "border-white/10 bg-white/[0.02]"
            }`}
            style={t.isNext ? { borderColor: accent } : undefined}
          >
            {/* Fill behind the number: the target's own progress bar. */}
            <div
              aria-hidden
              className="absolute inset-y-0 left-0 opacity-15 transition-[width] duration-700"
              style={{ width: `${t.pct}%`, background: t.reached ? "#34d399" : accent }}
            />
            <div className="relative">
              <div className="text-3xl font-black tabular-nums">{short(t.value)}</div>
              <div className="text-[11px] uppercase tracking-widest text-muted mt-1">{label}</div>
              <div className="mt-2.5 text-xs font-semibold">
                {t.reached ? (
                  <span className="text-emerald-300 inline-flex items-center gap-1"><Icon name="check" size={12} /> Reached</span>
                ) : t.isNext ? (
                  <span style={{ color: accent }}>{t.pct}% there</span>
                ) : (
                  <span className="text-muted">{t.pct}%</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== Go to market =====
//
// Clickable stages with the current one marked. The summary is on the card and
// the argument is in the modal, so the section reads in five seconds and
// rewards anyone who wants the detail.
export function GtmStages({ stages, accent, accent2 }: {
  stages: NonNullable<SectionData["stages"]>; accent: string; accent2: string;
}) {
  const openDetail = useDetail();
  const [hover, setHover] = useState<number | null>(null);
  if (!stages.length) return null;

  const tone = (s?: string) =>
    s === "done" ? "#34d399" : s === "current" ? accent2 : "rgba(255,255,255,0.28)";

  return (
    <div>
      {/* The track. Horizontal on desktop where there's room for a timeline,
          vertical on a phone where there isn't. */}
      <div className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stages.map((s, i) => {
          const c = tone(s.status);
          return (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => openDetail({
                title: s.name,
                subtitle: s.status === "done" ? "Done" : s.status === "current" ? "Where we are now" : "Next",
                body: s.detail ?? s.summary ?? null,
                bullets: s.bullets,
                accent: c,
              })}
              className={`group relative text-left rounded-2xl border p-5 transition ${
                s.status === "current" ? "bg-white/[0.05]" : "bg-white/[0.02] hover:bg-white/[0.05]"
              }`}
              style={{ borderColor: s.status === "current" ? c : hover === i ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.10)" }}
            >
              <div className="flex items-center gap-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black" style={{ background: `${c}2b`, color: c }}>
                  {s.status === "done" ? <Icon name="check" size={12} /> : i + 1}
                </span>
                <span className="text-[10px] uppercase tracking-widest" style={{ color: c }}>
                  {s.status === "done" ? "Done" : s.status === "current" ? "Now" : "Next"}
                </span>
              </div>
              <div className="font-bold mt-2.5">{s.name}</div>
              {s.summary && <p className="text-xs text-muted mt-1.5 leading-snug">{s.summary}</p>}
              <span className="inline-flex items-center gap-1 text-[11px] mt-3 opacity-70 group-hover:opacity-100" style={{ color: c }}>
                Read more <Icon name="arrowRight" size={11} />
              </span>

              {/* Where we are, said twice — the border alone is easy to miss. */}
              {s.status === "current" && (
                <span
                  className="absolute -top-2 left-5 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-[#04051a]"
                  style={{ background: c }}
                >
                  You are here
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ===== Team =====
export function TeamGrid({ people, accent }: { people: Person[]; accent: string }) {
  const openDetail = useDetail();
  if (!people.length) return null;

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {people.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => openDetail({
            title: p.name,
            subtitle: p.role,
            imageUrl: p.avatarUrl,
            body: p.bio,
            logos: p.logos,
            accent,
            // Contact belongs in the modal, not on the card: a reader opens a
            // person because they want to reach them.
            links: [
              ...(p.email ? [{ label: "Email", href: `mailto:${p.email}`, primary: true }] : []),
              ...(p.linkedin ? [{ label: "LinkedIn", href: p.linkedin }] : []),
              ...(p.x ? [{ label: "X", href: p.x }] : []),
            ],
          })}
          className="group glass rounded-2xl p-5 text-left transition hover:ring-1"
          style={{ ["--tw-ring-color" as string]: accent }}
        >
          {p.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.avatarUrl} alt="" className="h-20 w-20 rounded-2xl object-cover" />
          ) : (
            <div className="grid h-20 w-20 place-items-center rounded-2xl text-2xl font-black" style={{ background: `${accent}26`, color: accent }}>
              {p.name.slice(0, 1)}
            </div>
          )}
          <div className="font-bold mt-3">{p.name}</div>
          <div className="text-xs" style={{ color: accent }}>{p.role}</div>

          {p.logos.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              {p.logos.slice(0, 4).map((l, i) =>
                l.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={l.logoUrl} alt={l.name} title={l.name} className="h-5 w-5 rounded object-contain opacity-70" />
                ) : (
                  <span key={i} title={l.name} className="rounded border border-white/12 px-1.5 py-0.5 text-[9px] text-muted">
                    {l.name}
                  </span>
                ),
              )}
            </div>
          )}

          <span className="inline-flex items-center gap-1 text-[11px] mt-3 text-muted group-hover:text-ink">
            Bio &amp; contact <Icon name="arrowRight" size={11} />
          </span>
        </button>
      ))}
    </div>
  );
}

// ===== Gallery =====
export function Gallery({ images, accent }: {
  images: NonNullable<SectionData["images"]>; accent: string;
}) {
  const openDetail = useDetail();
  if (!images.length) return null;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {images.map((img, i) => (
        <button
          key={i}
          type="button"
          onClick={() => openDetail({ title: img.caption || "Screenshot", imageUrl: img.url, accent })}
          className="group relative overflow-hidden rounded-2xl border border-white/10 hover:border-white/25 transition"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.url} alt={img.caption ?? ""} loading="lazy" className="w-full aspect-video object-cover transition group-hover:scale-[1.03]" />
          {img.caption && (
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 text-left text-xs font-medium">
              {img.caption}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ===== Metric tiles =====
//
// Each opens its own definition, because a number in a deck that a reader can't
// interrogate is a number they'll discount.
export function MetricTiles({ metrics, accent }: {
  metrics: { key: string; label: string; value: number; definition: string }[];
  accent: string;
}) {
  const openDetail = useDetail();
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {metrics.map((m) => (
        <button
          key={m.key}
          type="button"
          onClick={() => openDetail({ title: m.label, subtitle: nf(m.value), body: m.definition, accent })}
          className="glass rounded-2xl p-5 text-left transition hover:ring-1"
          style={{ ["--tw-ring-color" as string]: accent }}
        >
          <div className="text-2xl sm:text-3xl font-black tabular-nums" style={{ color: accent }}>{nf(m.value)}</div>
          <div className="text-xs font-semibold mt-1">{m.label}</div>
          <div className="text-[10px] text-muted mt-1.5 inline-flex items-center gap-1">
            What this counts <Icon name="arrowRight" size={10} />
          </div>
        </button>
      ))}
    </div>
  );
}

// ===== Graphic explainer =====
//
// A mechanic, drawn instead of described.
//
// This used to be numbered boxes in a row with a gradient line running behind
// them — the layout every deck in the category uses, which is exactly why it
// carries no information: a reader's eye reports "process diagram" and moves
// on. It is also the layout that was asked to be removed everywhere.
//
// What replaced it: each beat is a full-width band with the consequence stated
// as the headline and a large ghosted numeral behind it. It reads as an
// argument that accumulates rather than a flowchart, it holds real sentences,
// and it works at 390px without becoming six tiny circles. A mechanic that
// repeats renders as a ring instead, because that is what "it repeats" looks
// like.
export function Explainer({ steps, loop, accent, accent2 }: {
  steps: NonNullable<SectionData["steps"]>; loop?: boolean; accent: string; accent2: string;
}) {
  const openDetail = useDetail();
  if (!steps.length) return null;

  if (loop) {
    return (
      <LoopRing
        accent={accent}
        nodes={steps.map((s, i) => ({ key: `s${i}`, title: s.label, body: s.note ?? "" }))}
      />
    );
  }

  return (
    <div className="space-y-3">
      {steps.map((s, i) => {
        const c = i % 2 ? accent2 : accent;
        const body = s.note ?? null;
        return (
          <button
            key={i}
            type="button"
            disabled={!body}
            onClick={() => body && openDetail({ title: s.label, subtitle: `Step ${i + 1}`, body, accent: c })}
            className="group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-left transition enabled:hover:border-white/25 sm:gap-6 sm:p-5 disabled:cursor-default"
          >
            {/* The numeral is scenery, not a step counter: it sits behind the
                content at low contrast so the eye lands on the sentence. */}
            <span
              aria-hidden
              className="pointer-events-none absolute -right-2 top-1/2 -translate-y-1/2 text-[86px] font-black leading-none opacity-[0.07] sm:text-[110px]"
              style={{ color: c }}
            >
              {i + 1}
            </span>
            <span
              className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border-2 sm:h-16 sm:w-16"
              style={{ borderColor: c, background: `${c}1f` }}
            >
              <Icon name={s.icon} size={26} style={{ color: c }} />
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="block text-base font-bold sm:text-lg">{s.label}</span>
              {body && <span className="mt-1 block text-sm leading-snug text-muted line-clamp-2">{body}</span>}
            </span>
            {body && (
              <span className="relative hidden shrink-0 items-center gap-1 text-[11px] text-muted transition group-hover:text-ink sm:inline-flex">
                Detail <Icon name="arrowRight" size={11} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ===== Product showcase =====
//
// The real cards the product renders, at full size, requested live. A deck full
// of screenshots goes stale the week after it's written and quietly starts
// lying; these are drawn by the same renderer that serves Discord, so what an
// investor sees is what a member sees this morning.
export function CardShowcase({ cards, accent }: {
  cards: { kind: string; caption?: string; url: string }[]; accent: string;
}) {
  const openDetail = useDetail();
  if (!cards.length) return null;
  return (
    <div className={`grid gap-4 ${cards.length === 1 ? "" : "md:grid-cols-2"}`}>
      {cards.map((c, i) => (
        <button
          key={i}
          type="button"
          onClick={() => openDetail({ title: c.caption || c.kind, imageUrl: c.url, accent })}
          className="group text-left"
        >
          <div
            className="overflow-hidden rounded-2xl border transition group-hover:-translate-y-0.5"
            style={{ borderColor: `${accent}33`, boxShadow: `0 24px 60px -40px ${accent}` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.url} alt={c.caption ?? ""} loading="lazy" className="w-full" style={{ aspectRatio: "1200 / 630" }} />
          </div>
          {c.caption && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted group-hover:text-ink">
              <span className="h-1 w-1 rounded-full" style={{ background: accent }} />
              {c.caption}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
