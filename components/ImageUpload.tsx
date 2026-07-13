"use client";

import { useRef, useState } from "react";
import Icon from "@/components/Icon";
import { downscale } from "@/lib/downscale";

/**
 * Real image upload used everywhere in place of a raw URL text box.
 *
 * The picked file is downscaled in the browser (canvas) and stored as a
 * compressed data URL inside a hidden <input name={name}>, so it drops into any
 * existing server-action form unchanged — the action still just reads
 * formData.get(name). No external blob storage required.
 *
 * A "paste a link instead" escape hatch remains for anyone who wants to point at
 * an already-hosted image.
 */
export default function ImageUpload({
  name,
  defaultValue = "",
  value: controlledValue,
  onChange,
  label,
  aspect = "16/9",
  rounded = "rounded-xl",
  maxDim = 1280,
  quality = 0.85,
  hint,
}: {
  /** Form mode: renders a hidden input so a server action reads formData.get(name). */
  name?: string;
  defaultValue?: string | null;
  /** Controlled mode: pass value + onChange to drive React state (e.g. ProfileBuilder). */
  value?: string;
  onChange?: (v: string) => void;
  label?: string;
  aspect?: string;
  rounded?: string;
  maxDim?: number;
  quality?: number;
  hint?: string;
}) {
  const controlled = onChange !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? "");
  const value = controlled ? (controlledValue ?? "") : internal;
  const setValue = (v: string) => { if (controlled) onChange!(v); else setInternal(v); };
  const [busy, setBusy] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await downscale(file, maxDim, quality);
      setValue(dataUrl);
    } catch {
      setError("Couldn't read that image. Try another file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {label && <div className="text-xs uppercase tracking-widest text-muted mb-1.5">{label}</div>}
      {name && <input type="hidden" name={name} value={value} />}

      <div className="flex items-start gap-3">
        <div
          className={`relative shrink-0 overflow-hidden border border-violet-400/25 bg-black/40 ${rounded}`}
          style={{ width: 96, aspectRatio: aspect }}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted">
              <Icon name="monitor" size={20} />
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-cyan-300">
              Optimizing…
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="glow-btn pressable rounded-full px-3.5 py-1.5 text-xs font-semibold text-white inline-flex items-center gap-1.5"
            >
              <Icon name="arrowUp" size={12} /> {value ? "Replace" : "Upload image"}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => { setValue(""); if (fileRef.current) fileRef.current.value = ""; }}
                className="ghost-btn pressable rounded-full px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5"
              >
                <Icon name="x" size={12} /> Remove
              </button>
            )}
            <button
              type="button"
              onClick={() => setUrlMode((m) => !m)}
              className="text-xs text-muted hover:text-ink underline underline-offset-2 px-1"
            >
              {urlMode ? "hide link" : "or paste a link"}
            </button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); }}
          />

          {urlMode && (
            <input
              type="url"
              placeholder="https://…/image.png"
              defaultValue={value.startsWith("data:") ? "" : value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-2 w-full rounded-lg border border-violet-400/25 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan-400/50"
            />
          )}

          {hint && <div className="mt-1.5 text-[11px] text-muted leading-snug">{hint}</div>}
          {error && <div className="mt-1.5 text-[11px] text-rose-300">{error}</div>}
        </div>
      </div>
    </div>
  );
}

