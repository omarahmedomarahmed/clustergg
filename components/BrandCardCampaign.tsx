"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { downscale } from "@/lib/downscale";
import {
  portalLaunchCardCreative, portalRemoveCardCreative, portalSetCardCampaignRunning,
} from "@/app/actions/brand-portal";

// The card campaign panel — the first and biggest thing in the brand portal.
//
// Every other placement is a rectangle on a web page. This one is the product:
// the creative is drawn INTO the cards ClusterBot renders inside Discord
// servers, where no ad network can reach. So it doesn't sit in a list of
// placements — it leads, it explains itself with a real mock of the card, and
// the upload button is the launch button. One image and the brand is live.

export type CardCreativeView = {
  campaignCreativeId: string;
  fileUrl: string;
  /** The button under this creative, and where it goes. Per creative. */
  ctaLabel: string | null;
  clickUrl: string | null;
  impressions: number;
  clicks: number;
};

export default function BrandCardCampaign({
  brandId, keyStr, brandName, creatives, live, status, impressions, clicks, reach,
}: {
  brandId: string;
  keyStr: string;
  brandName: string;
  creatives: CardCreativeView[];
  live: boolean;
  status: string | null;
  impressions: number;
  clicks: number;
  /** Servers and gamers the bot currently reaches, for the "what this buys" line. */
  reach: { servers: number; gamers: number };
}) {
  const [clickUrl, setClickUrl] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const hero = creatives[0]?.fileUrl ?? null;

  // Exactly what Discord will render, composed the same way the bot composes
  // it. A brand should never have to publish something to find out how it reads
  // in somebody else's server.
  const buttonPreview = `Sponsored: ${brandName} — ${ctaLabel.trim() || "your tagline here"}`.slice(0, 80);
  const ready = /^https?:\/\/\S+$/i.test(clickUrl.trim()) && ctaLabel.trim().length > 0;

  const upload = async (file: File) => {
    if (!ready) {
      setMsg("Add the button text and the link first — a card without them can't be clicked.");
      return;
    }
    setBusy(true); setMsg(null);
    try {
      // 1280 wide: twice the 640 the box is drawn at, so it stays sharp on a
      // 2x card without shipping a 4MB original into the renderer.
      const dataUrl = await downscale(file, 1280, 0.88);
      const res = await fetch("/api/brands/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, key: keyStr, dataUrl }),
      });
      const json = await res.json();
      if (!json?.url) { setMsg(json?.error ?? "Upload failed"); setBusy(false); return; }
      start(async () => {
        const fd = new FormData();
        fd.set("fileUrl", json.url);
        fd.set("clickUrl", clickUrl);
        fd.set("ctaLabel", ctaLabel);
        const r = await portalLaunchCardCreative(brandId, keyStr, fd);
        setMsg(r?.error ?? (creatives.length ? "Added to the rotation." : "You're live. The next card the bot draws can carry it."));
      });
    } catch (e) {
      // Say WHY. "Upload failed" on a brand's own creative, with no reason, is
      // a support ticket; "the browser couldn't read that file" is an answer.
      setMsg(`Upload failed — ${(e as Error)?.message || "the browser couldn't read that file"}`);
    }
    setBusy(false);
  };

  const remove = (id: string) => start(async () => {
    const r = await portalRemoveCardCreative(brandId, keyStr, id);
    setMsg(r?.error ?? "Removed from the rotation.");
  });

  const setRunning = (running: boolean) => start(async () => {
    const r = await portalSetCardCampaignRunning(brandId, keyStr, running);
    setMsg(r?.error ?? (running ? "Running again." : "Paused. Nothing is being served."));
  });

  const working = busy || pending;
  const n = (v: number) => v.toLocaleString();

  return (
    <section className="rounded-2xl border border-violet-400/25 bg-violet-500/[0.06] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.2em] text-violet-300">The Discord placement</div>
          <h2 className="mt-1 text-xl sm:text-2xl font-bold">Your creative on every card the bot draws</h2>
          <p className="mt-1.5 max-w-xl text-sm text-muted">
            Cluster renders a card whenever a gamer opens their profile, a leaderboard, a challenge or a
            planet inside Discord. Your creative sits in that card
            {reach.servers > 0 && <> — across <b className="text-ink">{n(reach.servers)}</b> servers and <b className="text-ink">{n(reach.gamers)}</b> gamers</>}.
            Upload one image and it starts serving.
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${
          live ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300" : "border-white/15 text-muted"
        }`}>
          {live ? "● Live" : status ? `○ ${status}` : "○ Not running"}
        </span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
        {/* A real mock of the card, so what they're buying is not a description. */}
        <div>
          <div className="relative overflow-hidden rounded-xl border border-white/12 bg-[#04051a]" style={{ aspectRatio: "1200 / 630" }}>
            <div className="absolute inset-x-0 top-0 h-[1.3%] bg-sky-500" />
            <div className="absolute left-[4.7%] top-[10%] right-[34%] space-y-2">
              <div className="h-4 w-2/3 rounded bg-white/25" />
              <div className="h-2.5 w-1/2 rounded bg-white/12" />
              <div className="h-2 w-5/6 rounded bg-white/8" />
              <div className="mt-4 h-7 rounded-lg bg-white/[0.07]" />
              <div className="h-7 rounded-lg bg-white/[0.07]" />
              <div className="h-7 rounded-lg bg-white/[0.07]" />
            </div>
            {/* The sponsor box, at the geometry the renderer actually uses. */}
            <div className="absolute overflow-hidden rounded-md border border-white/25"
              style={{ left: "73.1%", top: "5.1%", width: "24.7%" }}>
              <div className="relative bg-black/50" style={{ aspectRatio: "640 / 200" }}>
                {hero ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={hero} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-0 grid place-items-center bg-violet-500/25 text-[8px] font-bold text-violet-100">YOUR CREATIVE</div>
                )}
              </div>
              <div className="flex items-center justify-between bg-[#04051a]/90 px-1 py-[1px] text-[6px] tracking-widest text-muted">
                <span>SPONSORED</span><span className="font-bold text-ink truncate max-w-[60%]">{brandName.toUpperCase()}</span>
              </div>
            </div>
            <div className="absolute bottom-[6%] right-[3%] h-[16%] aspect-square rounded-xl bg-white/10" />
          </div>
          <p className="mt-2 text-[11px] text-muted">
            The box sits top-right on every card kind. Position is set per card by the Cluster team —
            the creative is always 640×200.
          </p>
        </div>

        {/* Upload = launch, and the button is part of the creative. */}
        <div className="space-y-3">
          {/* The two fields come FIRST, before the upload, because they are not
              optional: a Discord image cannot be clicked, so the button under
              the card is the only click this placement has. */}
          <div className="space-y-2 rounded-xl border border-white/12 bg-black/25 p-3">
            <div className="text-[10px] uppercase tracking-widest text-muted">The button under your card</div>
            <input
              value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value.slice(0, 48))}
              placeholder="Your tagline — e.g. 20% off for gamers"
              className="w-full rounded-lg border border-white/12 bg-black/30 px-2.5 py-2 text-xs outline-none focus:border-violet-400/50"
            />
            <input
              value={clickUrl} onChange={(e) => setClickUrl(e.target.value)}
              placeholder="https://your-landing-page.com"
              className="w-full rounded-lg border border-white/12 bg-black/30 px-2.5 py-2 text-xs outline-none focus:border-violet-400/50"
            />
            {/* Rendered like the real thing: Discord's blurple link button. */}
            <div className="rounded-md bg-[#5865F2] px-3 py-2 text-center text-[11px] font-semibold text-white truncate">
              {buttonPreview}
            </div>
            <p className="text-[10px] leading-snug text-muted">
              Every card carries this. &ldquo;Sponsored:&rdquo; and your name are always shown — the rest is yours.
              We count every press against this exact creative and tell you which server it came from.
            </p>
          </div>

          <label className={`flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed py-5 text-center text-sm font-semibold transition ${
            ready
              ? "border-violet-400/40 bg-violet-500/[0.06] cursor-pointer hover:border-violet-300/70"
              : "border-white/12 bg-black/20 cursor-not-allowed text-muted"
          } ${working ? "pointer-events-none opacity-60" : ""}`}>
            <Icon name="plus" size={16} />
            {busy ? "Uploading…" : pending ? "Saving…" : !ready ? "Add the button text and link first" : creatives.length ? "Add another creative" : "Upload your creative — go live"}
            <span className="text-[10px] font-normal text-muted">PNG or JPG · 640×200</span>
            <input type="file" accept="image/*" className="hidden" disabled={!ready}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <Stat label="Impressions" value={n(impressions)} />
            <Stat label="Clicks" value={n(clicks)} />
          </div>

          {creatives.length > 0 && (
            <button
              type="button" onClick={() => setRunning(!live)} disabled={working}
              className="w-full rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-muted transition hover:text-ink hover:border-white/30 disabled:opacity-60"
            >
              {live ? "Pause this campaign" : "Start serving again"}
            </button>
          )}
          {msg && <div className="text-[11px] text-violet-200">{msg}</div>}
        </div>
      </div>

      {creatives.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-[11px] uppercase tracking-widest text-muted">
            In rotation · {creatives.length}
            {creatives.length > 1 && <span className="normal-case tracking-normal"> — cards alternate between them</span>}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {creatives.map((c) => (
              <div key={c.campaignCreativeId} className="overflow-hidden rounded-xl border border-white/10 bg-black/25">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.fileUrl} alt="" className="w-full object-cover" style={{ aspectRatio: "640 / 200" }} />
                {/* Each creative has its OWN button and destination — a brand
                    running three creatives is running three messages. */}
                <div className="border-t border-white/8 px-2 py-1.5">
                  <div className="truncate rounded bg-[#5865F2] px-2 py-1 text-[10px] font-semibold text-white">
                    {`Sponsored: ${brandName} — ${c.ctaLabel || "no tagline"}`}
                  </div>
                  {c.clickUrl && <div className="mt-1 truncate text-[10px] text-muted">→ {c.clickUrl}</div>}
                </div>
                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px]">
                  <span className="text-muted">{n(c.impressions)} impressions · {n(c.clicks)} clicks</span>
                  <button
                    type="button" onClick={() => remove(c.campaignCreativeId)} disabled={working}
                    title="Take out of rotation"
                    className="shrink-0 text-muted transition hover:text-rose-300 disabled:opacity-50"
                  >
                    <Icon name="x" size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className="text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}
