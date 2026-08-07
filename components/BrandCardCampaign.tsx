"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { downscale } from "@/lib/downscale";
import {
  portalLaunchCardCreative, portalRemoveCardCreative, portalSetCardCampaignRunning, portalEditCreative,
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
  /** `pending_review` until an admin approves it. Nothing serves before then. */
  reviewStatus: string;
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
  // Uploaded, not yet approved. The brand is owed this on the screen: without
  // it they see art in the rotation list, nothing being served, and no reason.
  const inReview = !live && creatives.some((c) => c.reviewStatus === "pending_review");
  const rejected = creatives.filter((c) => c.reviewStatus === "rejected");

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
        // NOT "you're live" any more. A self-serve upload waits for review
        // (`app/actions/brand-portal.ts`), and telling a brand they are live
        // when nothing is serving is the small version of the same lie the
        // fabricated ROAS was.
        setMsg(r?.error ?? "Uploaded — in review. We check every creative before it serves; usually within a working day, and you'll see it flip to Live here.");
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
            Upload one image; it serves as soon as we've reviewed it.
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${
          live ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300" : "border-white/15 text-muted"
        }`}>
          {live ? "● Live" : inReview ? "○ In review" : status ? `○ ${status}` : "○ Not running"}
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

      {(inReview || rejected.length > 0) && (
        <div className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
          rejected.length
            ? "border-rose-400/30 bg-rose-500/10 text-rose-100"
            : "border-amber-400/30 bg-amber-500/10 text-amber-100"
        }`}>
          {rejected.length > 0 ? (
            <>
              <b>{rejected.length === 1 ? "A creative was" : `${rejected.length} creatives were`} not approved.</b>{" "}
              Replace the art or the destination and upload again — message us on the Messages tab if you want the reason.
            </>
          ) : (
            <>
              <b>In review.</b> Every creative is checked by a human before it renders inside somebody&apos;s
              Discord server — usually within a working day. Nothing is served, and nothing is billed, until it clears.
            </>
          )}
        </div>
      )}

      {creatives.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-[11px] uppercase tracking-widest text-muted">
            In rotation · {creatives.length}
            {creatives.length > 1 && <span className="normal-case tracking-normal"> — cards alternate between them</span>}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {creatives.map((c) => (
              <CreativeTile
                key={c.campaignCreativeId} c={c} brandId={brandId} keyStr={keyStr} brandName={brandName}
                busy={working} onRemove={() => remove(c.campaignCreativeId)} onMessage={setMsg}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * One creative, editable where it sits.
 *
 * Every creative has its own button and its own destination — a brand running
 * three creatives is running three messages, and the one they most need to
 * change is usually the one that has been running longest. Editing happens in
 * place so its impressions and clicks stay attached to it: the point is to fix
 * an ad, not to restart its reporting.
 *
 * This is also the only way to repair a creative uploaded before the card
 * placement required a button. Those render on Discord with nothing to click,
 * and the tile says so rather than leaving a brand to notice.
 */
function CreativeTile({ c, brandId, keyStr, brandName, busy, onRemove, onMessage }: {
  c: CardCreativeView;
  brandId: string; keyStr: string; brandName: string;
  busy: boolean;
  onRemove: () => void;
  onMessage: (m: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(c.ctaLabel ?? "");
  const [url, setUrl] = useState(c.clickUrl ?? "");
  const [working, setWorking] = useState(false);
  const [pending, start] = useTransition();
  const incomplete = !c.ctaLabel || !c.clickUrl;

  const save = (fileUrl?: string) => start(async () => {
    const fd = new FormData();
    fd.set("campaignCreativeId", c.campaignCreativeId);
    fd.set("ctaLabel", label);
    fd.set("clickUrl", url);
    if (fileUrl) fd.set("fileUrl", fileUrl);
    const r = await portalEditCreative(brandId, keyStr, fd);
    onMessage(r?.error ?? "Saved. The next card the bot draws uses it.");
    if (!r?.error) setOpen(false);
  });

  const replaceImage = async (file: File) => {
    setWorking(true);
    onMessage(null);
    try {
      const dataUrl = await downscale(file, 1280, 0.88);
      const res = await fetch("/api/brands/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, key: keyStr, dataUrl }),
      });
      const json = await res.json();
      if (!json?.url) { onMessage(json?.error ?? "Upload failed"); setWorking(false); return; }
      save(json.url);
    } catch (e) {
      onMessage(`Upload failed — ${(e as Error)?.message || "the browser couldn't read that file"}`);
    }
    setWorking(false);
  };

  const disabled = busy || working || pending;

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/25">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={c.fileUrl} alt="" className="w-full object-cover" style={{ aspectRatio: "640 / 200" }} />
      <div className="border-t border-white/8 px-2 py-1.5">
        <div className={`truncate rounded px-2 py-1 text-[10px] font-semibold ${c.ctaLabel ? "bg-[#5865F2] text-white" : "border border-amber-400/40 bg-amber-500/10 text-amber-200"}`}>
          {c.ctaLabel ? `Sponsored: ${brandName} — ${c.ctaLabel}` : "No button — this creative can't be clicked"}
        </div>
        {c.clickUrl && <div className="mt-1 truncate text-[10px] text-muted">→ {c.clickUrl}</div>}
      </div>
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px]">
        <span className="text-muted">{c.impressions.toLocaleString()} impressions · {c.clicks.toLocaleString()} clicks</span>
        <span className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setOpen((v) => !v)} disabled={disabled}
            title="Edit this creative" className={`transition disabled:opacity-50 ${incomplete ? "text-amber-300 hover:text-amber-200" : "text-muted hover:text-cyan-300"}`}>
            <Icon name="edit" size={13} />
          </button>
          <button type="button" onClick={onRemove} disabled={disabled}
            title="Take out of rotation" className="text-muted transition hover:text-rose-300 disabled:opacity-50">
            <Icon name="x" size={13} />
          </button>
        </span>
      </div>

      {open && (
        <div className="space-y-2 border-t border-white/10 bg-black/30 p-2.5">
          {incomplete && (
            <p className="text-[10px] leading-snug text-amber-200">
              This one went up before a button was required, so it shows on Discord with nothing to click.
              Add the two lines below and it starts earning clicks — its impressions stay.
            </p>
          )}
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={48}
            placeholder="Button text — e.g. 40% off this week"
            className="input-cosmic w-full !py-1 text-xs" />
          <input value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-site.com/offer"
            className="input-cosmic w-full !py-1 text-xs" />
          <div className="truncate rounded bg-[#5865F2] px-2 py-1 text-[10px] font-semibold text-white">
            {`Sponsored: ${brandName} — ${label.trim() || "your tagline here"}`.slice(0, 80)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => save()} disabled={disabled}
              className="cta-btn pressable rounded-full px-4 py-1 text-[11px] font-semibold disabled:opacity-60">
              {pending ? "Saving…" : "Save"}
            </button>
            <label className={`ghost-btn pressable cursor-pointer rounded-full px-3 py-1 text-[11px] ${disabled ? "opacity-60" : ""}`}>
              {working ? "Uploading…" : "Replace image"}
              <input type="file" accept="image/*" className="hidden" disabled={disabled}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void replaceImage(f); e.currentTarget.value = ""; }} />
            </label>
            <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-muted hover:text-ink">Cancel</button>
          </div>
        </div>
      )}
    </div>
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
