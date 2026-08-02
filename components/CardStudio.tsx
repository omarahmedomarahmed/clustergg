"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import CardLayoutEditor, { type EditorArt } from "@/components/CardLayoutEditor";
import type { LibraryGroup } from "@/lib/cards/asset-library";
import type { CardLayout } from "@/lib/cards/layout";
import type { CardPart } from "@/lib/cards/layout-guide";
import type { CardSample } from "@/lib/cards/preview";

// The card studio.
//
// This page used to stack every card's editor and every card's 1200x630 preview
// down one column — twelve canvases and twelve PNGs loading at once, and no way
// to work on one card without scrolling past the eleven you didn't want. You
// cannot design a card you can't see next to its own controls.
//
// So: a picker, then one card. The picker also carries the thing that was
// missing entirely — the command that produces each card, so an admin editing
// the world card knows it comes from `/cluster show <champion>` without going to
// Discord to find out.

export type StudioCard = {
  kind: string;
  name: string;
  summary: string;
  command: string;
  group: string;
  bgKey: string;
  brief: string;
  regions: { key: string; label: string; note: string; kind: string; x: number; y: number; w: number; h: number }[];
  /** The content sections of this card, offered as per-section controls. */
  parts: CardPart[];
  layout: CardLayout;
  art: EditorArt;
  previewUrl: string;
  /** Real cards of this kind to tune the layout against. */
  samples: CardSample[];
};

const GROUPS: { key: string; label: string; icon: string }[] = [
  { key: "gamer", label: "The gamer", icon: "user" },
  { key: "game", label: "Game worlds", icon: "planet" },
  { key: "competition", label: "Competition", icon: "trophy" },
  { key: "help", label: "Help & search", icon: "spark" },
];

export default function CardStudio({ cards, library }: { cards: StudioCard[]; library: LibraryGroup[] }) {
  const [kind, setKind] = useState(cards[0]?.kind ?? "");
  const card = useMemo(() => cards.find((c) => c.kind === kind) ?? cards[0], [cards, kind]);
  if (!card) return null;

  return (
    <div className="grid lg:grid-cols-[220px_1fr] gap-6 items-start">
      {/* ===== The picker ===== */}
      <nav className="glass rounded-2xl p-3 lg:sticky lg:top-24">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted px-2 pb-2">
          {cards.length} card kinds
        </div>
        {GROUPS.map((g) => {
          const inGroup = cards.filter((c) => c.group === g.key);
          if (!inGroup.length) return null;
          return (
            <div key={g.key} className="mb-3 last:mb-0">
              <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wider text-muted/70">
                <Icon name={g.icon} size={11} /> {g.label}
              </div>
              {inGroup.map((c) => (
                <button
                  key={c.kind} type="button" onClick={() => setKind(c.kind)}
                  className={`w-full text-left rounded-lg px-2.5 py-2 text-sm transition-colors ${
                    c.kind === card.kind ? "bg-violet-500/25 text-ink font-semibold" : "text-muted hover:bg-white/5 hover:text-ink"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          );
        })}
      </nav>

      {/* ===== The one card ===== */}
      <div className="min-w-0">
        <div className="glass rounded-2xl p-5 mb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h2 className="text-xl font-bold">{card.name}</h2>
              <p className="text-sm text-muted mt-1 max-w-2xl leading-relaxed">{card.summary}</p>
            </div>
            <div className="shrink-0">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Produced by</div>
              <code className="text-xs bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-cyan-300 select-all block">
                {card.command}
              </code>
            </div>
          </div>
        </div>

        {/* Remounted per card: the editor holds the layout in state, so without
            a key it would keep showing the previous card's positions. */}
        <CardLayoutEditor
          key={card.kind}
          kind={card.kind}
          name={card.name}
          initial={card.layout}
          art={card.art}
          parts={card.parts}
          previewUrl={card.previewUrl}
          samples={card.samples}
          regions={card.regions}
          library={library}
        />

        <div className="mt-5 grid md:grid-cols-2 gap-4">
          <div className="glass rounded-2xl p-4">
            <div className="text-[11px] uppercase tracking-widest text-muted mb-2">What this card draws</div>
            <div className="space-y-1.5">
              {card.regions.filter((r) => r.kind === "text").map((r) => (
                <div key={r.key} className="text-xs flex gap-2">
                  <span className="shrink-0 mt-0.5 w-2.5 h-2.5 rounded-sm bg-cyan-400/70" />
                  <span><b className="text-ink">{r.label}</b><span className="text-muted"> — {r.note}</span></span>
                </div>
              ))}
            </div>
          </div>
          <div className="glass rounded-2xl p-4">
            <div className="text-[11px] uppercase tracking-widest text-muted mb-2">Brief for an artist or an image prompt</div>
            <p className="text-xs bg-black/40 border border-white/10 rounded-lg p-3 select-all leading-relaxed">{card.brief}</p>
            <p className="text-[11px] text-muted mt-2">
              Background art lives in{" "}
              <Link href="/admin/cards" className="text-cyan-300 hover:underline">Card backgrounds</Link>
              {" "}→ <code className="text-cyan-300">{card.bgKey}</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
