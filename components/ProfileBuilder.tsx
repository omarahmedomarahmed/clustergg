"use client";

import { useMemo, useState, useTransition } from "react";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import ImageUpload from "@/components/ImageUpload";
import { useTr } from "@/components/LocaleProvider";
import { saveProfileTheme } from "@/app/actions/connections";
import {
  ProfileTheme, resolveTheme, themeToVars, bgStyle, coverStyle, cursorValue,
  TEMPLATES, FONTS, CURSOR_KEYS, SECTIONS, BG_PRESETS, AVATAR_SHAPES, avatarClip, sectionArtStyle,
} from "@/lib/theme";

export type PreviewData = {
  accounts: { name: string; provider: string }[];
  trophies: { title: string; game: string }[];
  badges: { name: string }[];
  challenges: { title: string; game: string }[];
  spaces: { name: string }[];
  postsCount: number;
  standingsCount: number;
};

type Props = {
  slug: string;
  displayName: string;
  initialTheme: unknown;
  initialTitle: string;
  initialBio: string;
  initialAvatar: string;
  initialBanner: string;
  previewData?: PreviewData;
};

const CARD_STYLES = ["glass", "solid", "outline", "flat"] as const;
const BUTTON_STYLES = ["neon", "solid", "outline", "glass", "pill"] as const;

function Swatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-muted">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 rounded cursor-pointer bg-transparent border border-violet-400/30" />
        <input value={value} onChange={(e) => onChange(e.target.value)} className="input-cosmic !w-20 !py-1 text-xs font-mono" />
      </span>
    </label>
  );
}

function Slider({ label, value, min, max, step = 1, onChange, suffix }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <label className="text-xs text-muted flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-violet-500 w-32" />
        <span className="w-10 text-right text-ink/80">{value}{suffix}</span>
      </span>
    </label>
  );
}

export default function ProfileBuilder({
  slug, displayName, initialTheme, initialTitle, initialBio, initialAvatar, initialBanner, previewData,
}: Props) {
  const [theme, setTheme] = useState<ProfileTheme>(() => resolveTheme(initialTheme));
  const [title, setTitle] = useState(initialTitle);
  const [bio, setBio] = useState(initialBio);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatar);
  const [bannerUrl, setBannerUrl] = useState(initialBanner);
  const [tab, setTab] = useState<"identity" | "theme" | "style">("identity");
  const [artOpen, setArtOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false); // mobile: is the editor bottom-sheet expanded
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const tr = useTr();

  const set = <K extends keyof ProfileTheme>(k: K, v: ProfileTheme[K]) => { setTheme((t) => ({ ...t, [k]: v })); setSaved(false); };
  const applyTemplate = (key: string) => {
    const tmpl = TEMPLATES.find((t) => t.key === key);
    if (tmpl) { setTheme((t) => ({ ...resolveTheme({ ...t, ...tmpl.theme, template: key }) })); setSaved(false); }
  };
  const toggleSection = (key: string) => { setTheme((t) => ({ ...t, sections: { ...t.sections, [key]: !t.sections[key] } })); setSaved(false); };
  const setSectionArt = (key: string, url: string) => {
    setTheme((t) => { const art = { ...t.sectionArt }; if (url) art[key] = url; else delete art[key]; return { ...t, sectionArt: art }; });
    setSaved(false);
  };
  const moveSection = (key: string, dir: -1 | 1) => {
    setTheme((t) => {
      const arr = [...t.order];
      const i = arr.indexOf(key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return t;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...t, order: arr };
    });
    setSaved(false);
  };

  const save = () => start(async () => {
    setSaveError(null);
    try {
      await saveProfileTheme(theme as unknown as Record<string, unknown>, { title, bio, avatarUrl, bannerUrl });
      setSaved(true);
    } catch {
      setSaveError(tr("Couldn't save — an image may be too large. Try a smaller one."));
    }
  });

  const vars = useMemo(() => themeToVars(theme) as React.CSSProperties, [theme]);
  const previewCursor = cursorValue(theme.cursor, theme.cursorColor);

  const tabs = [
    { k: "identity", label: "Identity", icon: "user" },
    { k: "theme", label: "Theme", icon: "spark" },
    { k: "style", label: "Style", icon: "edit" },
  ] as const;

  // Avatar shape → style (border-radius for basic, clip-path for fancy).
  const shapeStyle = (size: number): React.CSSProperties => {
    const clip = avatarClip(theme.avatarShape);
    const radius = theme.avatarShape === "circle" ? "9999px" : theme.avatarShape === "rounded" ? "22%" : theme.avatarShape === "square" ? "10%" : "0";
    return { width: size, height: size, borderRadius: clip ? 0 : radius, clipPath: clip, WebkitClipPath: clip };
  };

  // Real content per section, styled with the live theme.
  const pd = previewData;
  const empty = (msg: string) => <div className="text-xs" style={{ color: theme.muted }}>{msg}</div>;
  const chip = (label: string, i: number) => (
    <span key={i} className="text-xs rounded-full px-2.5 py-1" style={{ background: `color-mix(in srgb, ${theme.accent} 16%, transparent)`, color: theme.text, border: `1px solid color-mix(in srgb, ${theme.accent} 35%, transparent)` }}>{label}</span>
  );
  const renderSection = (key: string): React.ReactNode => {
    if (!pd) return empty(tr("Your real content shows here."));
    switch (key) {
      case "accounts":
        return pd.accounts.length
          ? <div className="grid grid-cols-2 gap-2">{pd.accounts.map((a, i) => (
              <div key={i} className="rounded-lg px-2.5 py-2 text-xs" style={{ background: `color-mix(in srgb, ${theme.accent} 10%, transparent)`, color: theme.text }}>
                <div className="font-semibold truncate">{a.name}</div>
                <div style={{ color: theme.muted }}>{a.provider}</div>
              </div>))}</div>
          : empty(tr("No accounts linked yet — connect a game."));
      case "standings":
        return pd.standingsCount ? empty(`${tr("Ranked across")} ${pd.standingsCount} ${tr(pd.standingsCount > 1 ? "game accounts." : "game account.")}`) : empty(tr("Link a game to appear on leaderboards."));
      case "trophies":
        return pd.trophies.length ? <div className="flex flex-wrap gap-1.5">{pd.trophies.map((t, i) => chip(t.title, i))}</div> : empty(tr("Win a challenge to earn a trophy."));
      case "badges":
        return pd.badges.length ? <div className="flex flex-wrap gap-1.5">{pd.badges.map((b, i) => chip(b.name, i))}</div> : empty(tr("No badges yet."));
      case "challenges":
        return pd.challenges.length ? <div className="flex flex-wrap gap-1.5">{pd.challenges.map((c, i) => chip(c.title, i))}</div> : empty(tr("Not competing in any challenges right now."));
      case "activity":
        return pd.postsCount ? empty(`${pd.postsCount} ${tr(pd.postsCount > 1 ? "posts across your planets." : "post across your planets.")}`) : empty(tr("No posts yet."));
      case "spaces":
        return pd.spaces.length ? <div className="flex flex-wrap gap-1.5">{pd.spaces.map((s, i) => chip(s.name, i))}</div> : empty(tr("Join a planet to show it here."));
      default: return null;
    }
  };

  const pill = (active: boolean) => `stat-tab ${active ? "stat-tab-active" : ""}`;

  return (
    <div className="flex flex-col-reverse lg:grid lg:grid-cols-[minmax(340px,380px)_1fr] lg:gap-6 lg:items-start">
      {/* ===== Editor — a slide-up bottom sheet on mobile, a sticky rail on desktop ===== */}
      <div className={`glass overflow-y-auto lg:sticky lg:top-16 lg:inset-x-auto lg:bottom-auto lg:z-auto lg:max-h-[calc(100vh-5rem)] lg:rounded-2xl lg:p-5 lg:pb-5 fixed inset-x-0 bottom-16 z-40 rounded-t-3xl border-t border-white/15 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.7)] transition-[max-height] duration-300 lg:shadow-none lg:border-t-0 lg:rounded-b-2xl ${sheet ? "max-h-[74vh] p-4 pb-6" : "max-h-[124px] p-4"}`}>
        {/* Mobile sheet handle + Save + expand toggle */}
        <div className="lg:hidden flex items-center gap-2 mb-3">
          <button onClick={() => setSheet((v) => !v)} className="flex-1 flex flex-col items-center py-0.5" aria-label={sheet ? "Collapse editor" : "Expand editor"}>
            <span className="h-1.5 w-11 rounded-full bg-white/30 mb-1.5" />
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-cyan-200">
              <Icon name={sheet ? "chevronDown" : "edit"} size={13} /> {sheet ? tr("Done") : tr("Customize")}
            </span>
          </button>
          <button onClick={save} disabled={pending} className="glow-btn pressable rounded-full px-5 py-2 text-xs font-bold text-white disabled:opacity-60 shrink-0">
            {pending ? tr("Saving…") : saved ? tr("Saved ✓") : tr("Save")}
          </button>
        </div>

        {/* Controls — hidden on mobile until the sheet is expanded */}
        <div className={`${sheet ? "" : "hidden"} lg:block`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {tabs.map((t) => (
              <button key={t.k} onClick={() => setTab(t.k)}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border transition-colors ${tab === t.k ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-200" : "border-violet-400/25 text-muted hover:text-ink"}`}>
                <Icon name={t.icon} size={14} /> {tr(t.label)}
              </button>
            ))}
          </div>
        </div>

        {/* ---------- IDENTITY ---------- */}
        {tab === "identity" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted">{tr("Flex title (under your name)")}</label>
              <input value={title} onChange={(e) => { setTitle(e.target.value); setSaved(false); }} maxLength={60} placeholder={tr("e.g. Blitz Grandmaster")} className="input-cosmic mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted">{tr("Bio")}</label>
              <textarea value={bio} onChange={(e) => { setBio(e.target.value); setSaved(false); }} rows={3} maxLength={400} className="input-cosmic mt-1" />
            </div>

            <ImageUpload label={tr("Avatar / profile image")} value={avatarUrl} onChange={(v) => { setAvatarUrl(v); setSaved(false); }} aspect="1/1" rounded="rounded-full" maxDim={480} quality={0.82} scope="profile" />
            <div>
              <label className="text-xs text-muted block mb-1.5">{tr("Avatar shape")}</label>
              <div className="flex flex-wrap gap-1.5">
                {AVATAR_SHAPES.map((s) => <button key={s} onClick={() => set("avatarShape", s)} className={`${pill(theme.avatarShape === s)} capitalize`}>{s}</button>)}
              </div>
            </div>
            <Slider label={tr("Avatar size")} value={theme.avatarSize} min={80} max={200} onChange={(v) => set("avatarSize", v)} suffix="px" />

            <div className="border-t border-violet-400/15 pt-4">
              <ImageUpload label={tr("Cover / banner image")} value={bannerUrl} onChange={(v) => { setBannerUrl(v); setSaved(false); }} aspect="16/9" maxDim={1280} quality={0.78} scope="profile" />
              <div className="mt-2 space-y-2">
                <Slider label={tr("Cover height")} value={theme.coverHeight} min={120} max={360} onChange={(v) => set("coverHeight", v)} suffix="px" />
                <Slider label={tr("Cover darken")} value={theme.coverOverlay} min={0} max={90} onChange={(v) => set("coverOverlay", v)} suffix="%" />
              </div>
            </div>

            <div className="border-t border-violet-400/15 pt-4">
              <label className="text-xs text-muted block mb-1.5">{tr("Page background image")}</label>
              <div className="grid grid-cols-5 gap-1.5 mb-2">
                <button onClick={() => set("bgImage", null)} className={`h-9 rounded-lg border text-[9px] ${!theme.bgImage ? "border-cyan-400/70" : "border-violet-400/20"}`} style={{ background: theme.bg }}>{tr("None")}</button>
                {BG_PRESETS.map((b) => (
                  <button key={b.url} onClick={() => set("bgImage", b.url)} title={b.name}
                    className={`h-9 rounded-lg border bg-cover bg-center ${theme.bgImage === b.url ? "border-cyan-400/70" : "border-violet-400/20"}`}
                    style={{ backgroundImage: `url("${b.url}")` }} />
                ))}
              </div>
              <ImageUpload value={theme.bgImage ?? ""} onChange={(v) => set("bgImage", v || null)} aspect="16/9" maxDim={1280} quality={0.72} scope="profile" />
              <div className="mt-2 space-y-2">
                <Slider label={tr("Background blur")} value={theme.bgBlur} min={0} max={20} onChange={(v) => set("bgBlur", v)} suffix="px" />
                <Slider label={tr("Background darken")} value={theme.bgOverlay} min={0} max={90} onChange={(v) => set("bgOverlay", v)} suffix="%" />
              </div>
            </div>
          </div>
        )}

        {/* ---------- THEME ---------- */}
        {tab === "theme" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted block mb-2">{tr("Templates")}</label>
              <div className="grid grid-cols-2 gap-2">
                {TEMPLATES.map((t) => {
                  const rt = resolveTheme({ ...t.theme, template: t.key });
                  return (
                    <button key={t.key} onClick={() => applyTemplate(t.key)}
                      className={`rounded-xl p-2.5 text-left border transition-all ${theme.template === t.key ? "border-cyan-400/70 scale-[1.02]" : "border-violet-400/20 hover:border-violet-400/50"}`}
                      style={{ background: rt.bg }}>
                      <div className="flex gap-1 mb-1.5">
                        <span className="h-3.5 w-3.5 rounded-full" style={{ background: rt.accent }} />
                        <span className="h-3.5 w-3.5 rounded-full" style={{ background: rt.accent2 }} />
                        <span className="h-3.5 w-3.5 rounded-full" style={{ background: rt.panel, border: "1px solid rgba(255,255,255,.2)" }} />
                      </div>
                      <div className="text-[11px] font-semibold" style={{ color: rt.text }}>{t.name}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="border-t border-violet-400/15 pt-4 space-y-3">
              <div className="text-xs uppercase tracking-widest text-muted">{tr("Recolor everything")}</div>
              <Swatch label={tr("Page background")} value={theme.bg} onChange={(v) => set("bg", v)} />
              <Swatch label={tr("Card background")} value={theme.panel} onChange={(v) => set("panel", v)} />
              <Swatch label={tr("Accent")} value={theme.accent} onChange={(v) => set("accent", v)} />
              <Swatch label={tr("Accent 2 (gradients)")} value={theme.accent2} onChange={(v) => set("accent2", v)} />
              <Swatch label={tr("Text")} value={theme.text} onChange={(v) => set("text", v)} />
              <Swatch label={tr("Muted text")} value={theme.muted} onChange={(v) => set("muted", v)} />
            </div>
          </div>
        )}

        {/* ---------- STYLE ---------- */}
        {tab === "style" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted block mb-1.5">{tr("Card style")}</label>
              <div className="flex flex-wrap gap-1.5">
                {CARD_STYLES.map((s) => <button key={s} onClick={() => set("cardStyle", s)} className={`${pill(theme.cardStyle === s)} capitalize`}>{s}</button>)}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1.5">{tr("Button style")}</label>
              <div className="flex flex-wrap gap-1.5">
                {BUTTON_STYLES.map((s) => <button key={s} onClick={() => set("buttonStyle", s)} className={`${pill(theme.buttonStyle === s)} capitalize`}>{s}</button>)}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1.5">{tr("Font")}</label>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(FONTS).map((f) => <button key={f} onClick={() => set("font", f)} className={`${pill(theme.font === f)} capitalize`}>{f}</button>)}
              </div>
            </div>
            <Slider label={tr("Corner radius")} value={theme.radius} min={0} max={28} onChange={(v) => set("radius", v)} suffix="px" />

            <div className="border-t border-violet-400/15 pt-4">
              <label className="text-xs text-muted block mb-2">{tr("Sections — show, hide, reorder & set card art")}</label>
              <div className="space-y-1.5">
                {theme.order.map((key, i) => {
                  const sec = SECTIONS.find((s) => s.key === key);
                  if (!sec) return null;
                  const on = theme.sections[key];
                  const hasArt = !!theme.sectionArt[key];
                  const open = artOpen === key;
                  return (
                    <div key={key} className="rounded-lg border border-violet-400/15">
                      <div className="flex items-center gap-2 px-2.5 py-1.5">
                        <button onClick={() => toggleSection(key)} className={`text-xs ${on ? "text-emerald-300" : "text-muted"}`}><Icon name={on ? "eye" : "x"} size={14} /></button>
                        <span className={`text-xs flex-1 ${on ? "" : "text-muted line-through"}`}>{tr(sec.label)}</span>
                        <button onClick={() => setArtOpen(open ? null : key)} title={tr("Card background art")}
                          className={`text-xs ${hasArt ? "text-cyan-300" : "text-muted hover:text-ink"}`}><Icon name="spark" size={13} /></button>
                        <button onClick={() => moveSection(key, -1)} disabled={i === 0} className="text-muted hover:text-ink disabled:opacity-30"><Icon name="arrowUp" size={13} /></button>
                        <button onClick={() => moveSection(key, 1)} disabled={i === theme.order.length - 1} className="text-muted hover:text-ink disabled:opacity-30"><Icon name="arrowDown" size={13} /></button>
                      </div>
                      {open && (
                        <div className="px-2.5 pb-2.5 pt-1 border-t border-violet-400/10">
                          <div className="text-[10px] text-muted mb-1.5">{tr("Background art for the")} “{tr(sec.label)}” {tr("card")}</div>
                          <ImageUpload value={theme.sectionArt[key] ?? ""} onChange={(v) => setSectionArt(key, v)} aspect="16/9" maxDim={1200} quality={0.74} scope="profile" />
                          {hasArt && <button onClick={() => setSectionArt(key, "")} className="mt-1.5 text-[11px] text-rose-300 hover:underline">{tr("Remove art")}</button>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-violet-400/15 pt-4">
              <label className="text-xs text-muted block mb-2">{tr("Custom cursor")} <span className="text-muted/70">{tr("(everyone sees it on your profile)")}</span></label>
              <div className="grid grid-cols-4 gap-1.5 mb-2">
                {CURSOR_KEYS.map((c) => (
                  <button key={c} onClick={() => set("cursor", c)}
                    className={`rounded-lg border py-2.5 text-center capitalize text-[11px] ${theme.cursor === c ? "border-cyan-400/70 bg-cyan-400/10" : "border-violet-400/20"}`}
                    style={{ cursor: cursorValue(c, theme.cursorColor) }}>{c}</button>
                ))}
              </div>
              <Swatch label={tr("Cursor color")} value={theme.cursorColor} onChange={(v) => set("cursorColor", v)} />
              <input value={theme.cursor.startsWith("http") ? theme.cursor : ""} onChange={(e) => set("cursor", e.target.value || "default")} placeholder={tr("or paste a custom 32×32 PNG URL")} className="input-cosmic mt-2 text-xs" />
            </div>
          </div>
        )}
        </div>{/* /controls */}
      </div>

      {/* ===== Live preview (right / top-on-mobile) — extra bottom room for the sheet ===== */}
      <div className="lg:sticky lg:top-16 pb-52 lg:pb-0">
        <div className="hidden lg:flex items-center justify-between mb-2">
          <div className="text-xs text-muted flex items-center gap-2"><Icon name="eye" size={13} /> {tr("Live preview —")} clustergg.com/u/{slug}</div>
          <div className="flex items-center gap-3">
            {saveError && <span className="text-xs text-rose-300">{saveError}</span>}
            <button onClick={save} disabled={pending} className="glow-btn pressable rounded-full px-6 py-2 text-sm font-semibold text-white">
              {pending ? tr("Saving…") : saved ? tr("Saved ✓") : tr("Save changes")}
            </button>
          </div>
        </div>
        {/* Mobile preview caption + any save error */}
        <div className="lg:hidden flex items-center justify-between mb-2 text-xs text-muted">
          <span className="flex items-center gap-1.5"><Icon name="eye" size={13} /> {tr("Live preview —")} @{slug}</span>
          {saveError && <span className="text-rose-300">{saveError}</span>}
        </div>
        <div className="rounded-2xl overflow-hidden border border-violet-400/20">
          <div className="profile-root" style={{ ...vars, cursor: previewCursor !== "auto" ? previewCursor : undefined, ...bgStyle(theme) }}>
            {/* Cover */}
            <div className="bg-cover bg-center" style={{ ...coverStyle(theme, bannerUrl || null), height: Math.round(theme.coverHeight * 0.62) }} />
            <div className="px-5 pb-5" style={{ marginTop: -Math.round(theme.avatarSize * 0.4) }}>
              <div className="flex items-end gap-3">
                <div className="overflow-hidden border-2 shrink-0" style={{ ...shapeStyle(Math.round(theme.avatarSize * 0.62)), borderColor: theme.accent }}>
                  <Avatar name={displayName} src={avatarUrl || null} size={Math.round(theme.avatarSize * 0.62)} className="!rounded-none" />
                </div>
                <div className="pb-1 min-w-0">
                  <div className="text-xl font-bold truncate" style={{ color: theme.text }}>{displayName}</div>
                  {title && <div className="text-sm p-grad font-semibold" style={{ "--p-accent": theme.accent, "--p-accent2": theme.accent2 } as React.CSSProperties}>{title}</div>}
                </div>
              </div>
              {bio && <p className="text-sm mt-3" style={{ color: theme.muted }}>{bio}</p>}
              <div className="flex gap-2 mt-3">
                <button className={`p-btn p-btn-${theme.buttonStyle}`}>Follow</button>
                <button className={`p-btn p-btn-${theme.buttonStyle === "neon" ? "glass" : "outline"}`}>Message</button>
              </div>
              <div className="mt-5 space-y-3">
                {theme.order.filter((k) => theme.sections[k]).map((key) => {
                  const sec = SECTIONS.find((s) => s.key === key)!;
                  const art = theme.sectionArt[key];
                  return (
                    <div key={key} className={`p-card p-card-${theme.cardStyle}`} style={art ? sectionArtStyle(theme, key) : undefined}>
                      <div className="text-sm font-semibold flex items-center gap-2 mb-2" style={{ color: art ? "#fff" : theme.text }}>
                        <span className="h-2 w-2 rounded-full" style={{ background: theme.accent }} /> {sec.label}
                      </div>
                      {renderSection(key)}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
