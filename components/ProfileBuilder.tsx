"use client";

import { useMemo, useState, useTransition } from "react";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import ImageUpload from "@/components/ImageUpload";
import { saveProfileTheme } from "@/app/actions/connections";
import {
  ProfileTheme, resolveTheme, themeToVars, bgStyle, TEMPLATES, FONTS, CURSORS, SECTIONS, BG_PRESETS,
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
const AVATAR_SHAPES = ["circle", "rounded", "square"] as const;
const CURSOR_KEYS = ["default", "spark", "ring", "arrow", "gamepad", "crosshair"];

function Swatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-muted">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 rounded cursor-pointer bg-transparent border border-violet-400/30" />
        <input value={value} onChange={(e) => onChange(e.target.value)} className="input-cosmic !w-24 !py-1 text-xs font-mono" />
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
  const [tab, setTab] = useState<"theme" | "colors" | "layout" | "cursor" | "identity">("theme");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const set = <K extends keyof ProfileTheme>(k: K, v: ProfileTheme[K]) => { setTheme((t) => ({ ...t, [k]: v })); setSaved(false); };
  const applyTemplate = (key: string) => {
    const tmpl = TEMPLATES.find((t) => t.key === key);
    if (tmpl) { setTheme((t) => ({ ...resolveTheme({ ...t, ...tmpl.theme, template: key }) })); setSaved(false); }
  };
  const toggleSection = (key: string) => { setTheme((t) => ({ ...t, sections: { ...t.sections, [key]: !t.sections[key] } })); setSaved(false); };
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
    await saveProfileTheme(theme as unknown as Record<string, unknown>, { title, bio, avatarUrl, bannerUrl });
    setSaved(true);
  });

  const vars = useMemo(() => themeToVars(theme) as React.CSSProperties, [theme]);
  const previewCursor = theme.cursor?.startsWith("http") ? `url("${theme.cursor}") 4 4, auto` : CURSORS[theme.cursor] || "auto";

  const tabs = [
    { k: "theme", label: "Templates", icon: "grid" },
    { k: "colors", label: "Colors", icon: "spark" },
    { k: "layout", label: "Layout", icon: "edit" },
    { k: "cursor", label: "Cursor", icon: "target" },
    { k: "identity", label: "Identity", icon: "user" },
  ] as const;

  // Real content per section, styled with the live theme so the preview is
  // exactly what visitors see. Falls back to a gentle hint when empty.
  const pd = previewData;
  const empty = (msg: string) => <div className="text-xs" style={{ color: theme.muted }}>{msg}</div>;
  const chip = (label: string, i: number) => (
    <span key={i} className="text-xs rounded-full px-2.5 py-1" style={{ background: `color-mix(in srgb, ${theme.accent} 16%, transparent)`, color: theme.text, border: `1px solid color-mix(in srgb, ${theme.accent} 35%, transparent)` }}>{label}</span>
  );
  const renderSection = (key: string): React.ReactNode => {
    if (!pd) return empty("Your real content shows here.");
    switch (key) {
      case "accounts":
        return pd.accounts.length
          ? <div className="grid grid-cols-2 gap-2">{pd.accounts.map((a, i) => (
              <div key={i} className="rounded-lg px-2.5 py-2 text-xs" style={{ background: `color-mix(in srgb, ${theme.accent} 10%, transparent)`, color: theme.text }}>
                <div className="font-semibold truncate">{a.name}</div>
                <div style={{ color: theme.muted }}>{a.provider}</div>
              </div>))}</div>
          : empty("No accounts linked yet — connect a game above.");
      case "standings":
        return pd.standingsCount ? empty(`Ranked across ${pd.standingsCount} game account${pd.standingsCount > 1 ? "s" : ""}.`) : empty("Link a game to appear on leaderboards.");
      case "trophies":
        return pd.trophies.length ? <div className="flex flex-wrap gap-1.5">{pd.trophies.map((t, i) => chip(t.title, i))}</div> : empty("Win a challenge to earn a trophy.");
      case "badges":
        return pd.badges.length ? <div className="flex flex-wrap gap-1.5">{pd.badges.map((b, i) => chip(b.name, i))}</div> : empty("No badges yet.");
      case "challenges":
        return pd.challenges.length ? <div className="flex flex-wrap gap-1.5">{pd.challenges.map((c, i) => chip(c.title, i))}</div> : empty("Not competing in any challenges right now.");
      case "activity":
        return pd.postsCount ? empty(`${pd.postsCount} post${pd.postsCount > 1 ? "s" : ""} across your planets.`) : empty("No posts yet.");
      case "spaces":
        return pd.spaces.length ? <div className="flex flex-wrap gap-1.5">{pd.spaces.map((s, i) => chip(s.name, i))}</div> : empty("Join a planet to show it here.");
      default:
        return null;
    }
  };

  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-6">
      {/* ===== Controls ===== */}
      <div className="glass p-5 h-fit lg:sticky lg:top-20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold flex items-center gap-2"><Icon name="edit" size={18} className="text-cyan-300" /> Profile Builder</h2>
          <button onClick={save} disabled={pending} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-semibold text-white">
            {pending ? "Saving…" : saved ? "Saved ✓" : "Save"}
          </button>
        </div>

        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
          {tabs.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)} className={`stat-tab ${tab === t.k ? "stat-tab-active" : ""}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "theme" && (
          <div className="grid grid-cols-2 gap-2.5">
            {TEMPLATES.map((t) => {
              const rt = resolveTheme({ ...t.theme, template: t.key });
              return (
                <button key={t.key} onClick={() => applyTemplate(t.key)}
                  className={`rounded-xl p-3 text-left border transition-all ${theme.template === t.key ? "border-cyan-400/70 scale-[1.02]" : "border-violet-400/20 hover:border-violet-400/50"}`}
                  style={{ background: rt.bg }}>
                  <div className="flex gap-1 mb-2">
                    <span className="h-4 w-4 rounded-full" style={{ background: rt.accent }} />
                    <span className="h-4 w-4 rounded-full" style={{ background: rt.accent2 }} />
                    <span className="h-4 w-4 rounded-full" style={{ background: rt.panel, border: "1px solid rgba(255,255,255,.2)" }} />
                  </div>
                  <div className="text-xs font-semibold" style={{ color: rt.text }}>{t.name}</div>
                </button>
              );
            })}
          </div>
        )}

        {tab === "colors" && (
          <div className="space-y-3">
            <Swatch label="Page background" value={theme.bg} onChange={(v) => set("bg", v)} />
            <Swatch label="Card background" value={theme.panel} onChange={(v) => set("panel", v)} />
            <Swatch label="Accent" value={theme.accent} onChange={(v) => set("accent", v)} />
            <Swatch label="Accent 2 (gradients)" value={theme.accent2} onChange={(v) => set("accent2", v)} />
            <Swatch label="Text" value={theme.text} onChange={(v) => set("text", v)} />
            <Swatch label="Muted text" value={theme.muted} onChange={(v) => set("muted", v)} />
            <div>
              <label className="text-xs text-muted block mb-1.5">Background image</label>
              <div className="grid grid-cols-4 gap-1.5 mb-2">
                <button onClick={() => set("bgImage", null)} className={`h-10 rounded-lg border text-[9px] ${!theme.bgImage ? "border-cyan-400/70" : "border-violet-400/20"}`} style={{ background: theme.bg }}>None</button>
                {BG_PRESETS.map((b) => (
                  <button key={b.url} onClick={() => set("bgImage", b.url)} title={b.name}
                    className={`h-10 rounded-lg border bg-cover bg-center ${theme.bgImage === b.url ? "border-cyan-400/70" : "border-violet-400/20"}`}
                    style={{ backgroundImage: `url("${b.url}")` }} />
                ))}
              </div>
              <ImageUpload value={theme.bgImage ?? ""} onChange={(v) => set("bgImage", v || null)} aspect="16/9" maxDim={1920} hint="Upload your own background image." />
            </div>
            <label className="text-xs text-muted flex items-center justify-between">Background blur
              <input type="range" min={0} max={20} value={theme.bgBlur} onChange={(e) => set("bgBlur", Number(e.target.value))} className="accent-violet-500 w-32" />
            </label>
            <label className="text-xs text-muted flex items-center justify-between">Background darken (overlay)
              <input type="range" min={0} max={90} value={theme.bgOverlay} onChange={(e) => set("bgOverlay", Number(e.target.value))} className="accent-violet-500 w-32" />
            </label>
          </div>
        )}

        {tab === "layout" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted block mb-1.5">Card style</label>
              <div className="flex flex-wrap gap-1.5">
                {CARD_STYLES.map((s) => <button key={s} onClick={() => set("cardStyle", s)} className={`stat-tab capitalize ${theme.cardStyle === s ? "stat-tab-active" : ""}`}>{s}</button>)}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1.5">Button style</label>
              <div className="flex flex-wrap gap-1.5">
                {BUTTON_STYLES.map((s) => <button key={s} onClick={() => set("buttonStyle", s)} className={`stat-tab capitalize ${theme.buttonStyle === s ? "stat-tab-active" : ""}`}>{s}</button>)}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1.5">Font</label>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(FONTS).map((f) => <button key={f} onClick={() => set("font", f)} className={`stat-tab capitalize ${theme.font === f ? "stat-tab-active" : ""}`}>{f}</button>)}
              </div>
            </div>
            <label className="text-xs text-muted flex items-center justify-between">Corner radius
              <input type="range" min={0} max={28} value={theme.radius} onChange={(e) => set("radius", Number(e.target.value))} className="accent-violet-500 w-32" />
            </label>
            <div>
              <label className="text-xs text-muted block mb-1.5">Avatar shape</label>
              <div className="flex gap-1.5">
                {AVATAR_SHAPES.map((s) => <button key={s} onClick={() => set("avatarShape", s)} className={`stat-tab capitalize ${theme.avatarShape === s ? "stat-tab-active" : ""}`}>{s}</button>)}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted block mb-2">Sections — show, hide & reorder</label>
              <div className="space-y-1.5">
                {theme.order.map((key, i) => {
                  const sec = SECTIONS.find((s) => s.key === key);
                  if (!sec) return null;
                  const on = theme.sections[key];
                  return (
                    <div key={key} className="flex items-center gap-2 rounded-lg border border-violet-400/15 px-2.5 py-1.5">
                      <button onClick={() => toggleSection(key)} className={`text-xs ${on ? "text-emerald-300" : "text-muted"}`}>
                        <Icon name={on ? "eye" : "x"} size={14} />
                      </button>
                      <span className={`text-xs flex-1 ${on ? "" : "text-muted line-through"}`}>{sec.label}</span>
                      <button onClick={() => moveSection(key, -1)} disabled={i === 0} className="text-muted hover:text-ink disabled:opacity-30"><Icon name="arrowUp" size={13} /></button>
                      <button onClick={() => moveSection(key, 1)} disabled={i === theme.order.length - 1} className="text-muted hover:text-ink disabled:opacity-30"><Icon name="arrowDown" size={13} /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {tab === "cursor" && (
          <div className="space-y-4">
            <p className="text-xs text-muted">Anyone who opens your profile sees this cursor.</p>
            <div className="grid grid-cols-3 gap-2">
              {CURSOR_KEYS.map((c) => (
                <button key={c} onClick={() => set("cursor", c)}
                  className={`rounded-lg border p-4 text-center capitalize text-xs ${theme.cursor === c ? "border-cyan-400/70 bg-cyan-400/10" : "border-violet-400/20"}`}
                  style={{ cursor: c === "default" ? "auto" : (CURSORS[c] || "auto") }}>
                  {c}
                </button>
              ))}
            </div>
            <div>
              <label className="text-xs text-muted">Custom cursor image URL (32×32 PNG works best)</label>
              <input value={theme.cursor.startsWith("http") ? theme.cursor : ""} onChange={(e) => set("cursor", e.target.value || "default")} placeholder="https://…" className="input-cosmic mt-1 text-xs" />
            </div>
          </div>
        )}

        {tab === "identity" && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted">Flex title (under your name)</label>
              <input value={title} onChange={(e) => { setTitle(e.target.value); setSaved(false); }} maxLength={60} placeholder="e.g. Blitz Grandmaster" className="input-cosmic mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted">Bio</label>
              <textarea value={bio} onChange={(e) => { setBio(e.target.value); setSaved(false); }} rows={3} maxLength={400} className="input-cosmic mt-1" />
            </div>
            <ImageUpload label="Avatar / profile image" value={avatarUrl} onChange={(v) => { setAvatarUrl(v); setSaved(false); }} aspect="1/1" rounded="rounded-full" maxDim={512} hint="Square image works best." />
            <ImageUpload label="Cover / banner image" value={bannerUrl} onChange={(v) => { setBannerUrl(v); setSaved(false); }} aspect="16/9" maxDim={1600} hint="Wide image shown behind your name." />
          </div>
        )}
      </div>

      {/* ===== Live preview ===== */}
      <div>
        <div className="text-xs text-muted mb-2 flex items-center gap-2"><Icon name="eye" size={13} /> Live preview — this is exactly what visitors see at clustergg.com/u/{slug}</div>
        <div className="rounded-2xl overflow-hidden border border-violet-400/20">
          <div
            className="profile-root p-5"
            style={{
              ...vars,
              cursor: previewCursor,
              ...bgStyle(theme),
            }}
          >
            {/* Cover */}
            <div className="h-28 rounded-xl mb-[-2.5rem] bg-cover bg-center" style={{ backgroundImage: bannerUrl ? `url("${bannerUrl}")` : `linear-gradient(92deg, ${theme.accent}, ${theme.accent2})` }} />
            <div className="px-2">
              <div className="relative flex items-end gap-3">
                <div className={`p-avatar-${theme.avatarShape} overflow-hidden border-2`} style={{ borderColor: theme.accent, width: 72, height: 72 }}>
                  <Avatar name={displayName} src={avatarUrl || null} size={72} className="!rounded-none" />
                </div>
                <div className="pb-1">
                  <div className="text-xl font-bold" style={{ color: theme.text }}>{displayName}</div>
                  {title && <div className="text-sm p-grad font-semibold" style={{ "--p-accent": theme.accent, "--p-accent2": theme.accent2 } as React.CSSProperties}>{title}</div>}
                </div>
              </div>
              {bio && <p className="text-sm mt-3" style={{ color: theme.muted }}>{bio}</p>}

              <div className="flex gap-2 mt-3">
                <button className={`p-btn p-btn-${theme.buttonStyle}`}>Follow</button>
                <button className={`p-btn p-btn-${theme.buttonStyle === "neon" ? "glass" : "outline"}`}>Message</button>
              </div>

              {/* Section previews in chosen order — real content, live-themed */}
              <div className="mt-5 space-y-3">
                {theme.order.filter((k) => theme.sections[k]).map((key) => {
                  const sec = SECTIONS.find((s) => s.key === key)!;
                  return (
                    <div key={key} className={`p-card p-card-${theme.cardStyle}`}>
                      <div className="text-sm font-semibold flex items-center gap-2 mb-2" style={{ color: theme.text }}>
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
