"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import BrandGlyph from "@/components/BrandGlyph";

// "How the bot works", shown rather than described.
//
// Every frame here is a real Discord message: the same PNG card the bot
// actually attaches, fetched live from our own renderer, under a mock of
// Discord's chrome, with the real button rows beneath it. Nothing is a
// screenshot that can go stale — change a card's art in admin and this section
// changes with it.
//
// It's interactive because that IS the product: pressing a button edits the
// message in place instead of posting a new one, and the only way to make that
// land is to let someone press one.

export type BotStep = {
  id: string;
  /** What a person types or taps to get here. */
  trigger: string;
  title: string;
  body: string;
  /** Live card URL from /api/card/*. */
  card: string;
  /** The buttons Discord would show under it. `to` advances the demo. */
  buttons: { label: string; emoji?: string; style?: "primary" | "success" | "secondary" | "link"; to?: string }[];
};

const STYLE: Record<string, string> = {
  primary: "bg-[#5865f2] text-white hover:bg-[#4752c4]",
  success: "bg-[#248046] text-white hover:bg-[#1a6334]",
  secondary: "bg-[#4e5058] text-white hover:bg-[#6d6f78]",
  link: "bg-[#4e5058] text-white hover:bg-[#6d6f78]",
};

export default function BotShowcase({ steps, heading, blurb, installUrl, bare }: {
  steps: BotStep[];
  heading?: string;
  blurb?: string;
  /** Passed in rather than read here — this runs in the browser and the
   *  install URL is built from server-only config. Omit to hide the CTA. */
  installUrl?: string | null;
  /** Drop the section chrome and render only the demo, for embedding inside a
   *  section that already has its own heading. */
  bare?: boolean;
}) {
  const [id, setId] = useState(steps[0]?.id ?? "");
  const step = steps.find((s) => s.id === id) ?? steps[0];
  if (!step) return null;

  const demo = (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
          {/* The Discord frame. */}
          <div className="rounded-2xl border border-white/10 bg-[#313338] overflow-hidden shadow-2xl">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-black/30 bg-[#2b2d31]">
              <span className="text-[#949ba4] font-bold">#</span>
              <span className="text-sm font-semibold text-white">clustergg</span>
              <span className="ml-auto text-[11px] text-[#949ba4] font-mono">{step.trigger}</span>
            </div>

            <div className="p-4">
              <div className="flex gap-3">
                <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 grid place-items-center font-black text-white">
                  C
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-white text-sm">ClusterBot</span>
                    <span className="rounded bg-[#5865f2] px-1 py-px text-[9px] font-bold text-white uppercase">App</span>
                  </div>

                  {/* The embed: coloured spine, title, and the card as its image. */}
                  <div className="rounded-md border-l-4 border-cyan-400 bg-[#2b2d31] p-3 max-w-xl">
                    <div className="font-semibold text-white text-sm">{step.title}</div>
                    <p className="text-[13px] text-[#dbdee1] mt-0.5 leading-snug">{step.body}</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={step.card}
                      alt=""
                      loading="lazy"
                      className="mt-2.5 w-full rounded-md border border-black/40 bg-black/40"
                      style={{ aspectRatio: "1200 / 630" }}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 mt-2 max-w-xl">
                    {step.buttons.map((b, i) => {
                      const cls = `inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[13px] font-medium transition ${STYLE[b.style ?? "secondary"]}`;
                      if (!b.to) {
                        return (
                          <span key={i} className={`${cls} opacity-70 cursor-default`}>
                            {b.emoji} {b.label}
                            {b.style === "link" && <Icon name="link" size={11} />}
                          </span>
                        );
                      }
                      return (
                        <button key={i} type="button" onClick={() => setId(b.to!)} className={cls}>
                          {b.emoji} {b.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* The step list, doubling as navigation. */}
          <div className="space-y-2">
            {steps.map((s, i) => {
              const on = s.id === step.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setId(s.id)}
                  className={`w-full text-left rounded-xl border px-4 py-3 transition ${
                    on ? "border-cyan-400/60 bg-cyan-500/10" : "border-white/10 hover:border-white/25 hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black ${
                      on ? "bg-cyan-400 text-[#04051a]" : "bg-white/10 text-muted"
                    }`}>
                      {i + 1}
                    </span>
                    <span className={`text-sm font-semibold ${on ? "" : "text-muted"}`}>{s.title}</span>
                  </div>
                  <code className="block text-[11px] text-cyan-300/80 mt-1.5 ml-8.5 truncate">{s.trigger}</code>
                </button>
              );
            })}

            {installUrl && (
              <div className="pt-3 space-y-2">
                <a
                  href={installUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="pressable flex w-full items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white"
                  style={{ background: "#5865f2", boxShadow: "0 8px 22px -10px #5865f2" }}
                >
                  <BrandGlyph provider="discord" size={18} /> Add to your server
                </a>
                <Link href="/discord-bot" className="ghost-btn pressable rounded-full w-full justify-center flex px-5 py-2.5 text-sm font-semibold">
                  Everything the bot does
                </Link>
              </div>
            )}
          </div>
    </div>
  );

  if (bare) return demo;

  return (
    <section className="relative py-16 sm:py-20 overflow-hidden">
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-violet-600/10 via-transparent to-cyan-500/10" />
      <div className="relative mx-auto max-w-6xl px-4">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/40 bg-violet-500/10 px-4 py-1.5 text-xs uppercase tracking-widest text-violet-200">
            <BrandGlyph provider="discord" size={14} /> Inside Discord
          </span>
          <h2 className="text-3xl sm:text-4xl font-black mt-4 leading-tight">
            {heading ?? "This is what your members see."}
          </h2>
          <p className="text-muted mt-3">
            {blurb ?? "Real cards from the live bot, not mockups. Press a button — it works the same way it does in your server."}
          </p>
        </div>
        {demo}
      </div>
    </section>
  );
}
