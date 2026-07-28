"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { saveNavChrome, saveFooterChrome } from "@/app/actions/site-chrome";
import {
  NAV_ITEMS, navShows,
  type NavSettings, type FooterColumn, type Audience,
} from "@/lib/site-chrome";

// Editing the top bar and the footer.
//
// Two audiences, side by side, because the interesting decisions are the ones
// where they differ: a guest needs the two commercial doors and a way in, a
// signed-in gamer needs their quests and their alerts, and a single switch
// serving both is how a nav ends up with eleven things in it.

export default function SiteChromeEditor({ initialNav, initialFooter }: {
  initialNav: NavSettings;
  initialFooter: FooterColumn[];
}) {
  const [nav, setNav] = useState<NavSettings>(initialNav);
  const [cols, setCols] = useState<FooterColumn[]>(initialFooter);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (id: string, who: Audience, on: boolean) =>
    setNav((c) => ({ ...c, [id]: { ...(c[id] ?? {}), [who]: on } }));

  const saveNav = () => start(async () => {
    await saveNavChrome(nav);
    setMsg("Nav saved. Reload any page to see it.");
  });
  const saveFooter = () => start(async () => {
    await saveFooterChrome(cols);
    setMsg("Footer saved. Reload any page to see it.");
  });

  // ===== Footer editing =====
  const patchCol = (i: number, patch: Partial<FooterColumn>) =>
    setCols((c) => c.map((col, j) => (j === i ? { ...col, ...patch } : col)));
  const patchLink = (ci: number, li: number, patch: Partial<{ label: string; href: string }>) =>
    setCols((c) => c.map((col, j) => (j === ci
      ? { ...col, links: col.links.map((l, k) => (k === li ? { ...l, ...patch } : l)) }
      : col)));
  const addLink = (ci: number) =>
    setCols((c) => c.map((col, j) => (j === ci ? { ...col, links: [...col.links, { label: "", href: "/" }] } : col)));
  const dropLink = (ci: number, li: number) =>
    setCols((c) => c.map((col, j) => (j === ci ? { ...col, links: col.links.filter((_, k) => k !== li) } : col)));
  const move = (i: number, dir: -1 | 1) =>
    setCols((c) => {
      const j = i + dir;
      if (j < 0 || j >= c.length) return c;
      const next = [...c];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <div className="space-y-10">
      {/* ===== Nav ===== */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Top bar</h2>
          <button onClick={saveNav} disabled={pending} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {pending ? "Saving…" : "Save the nav"}
          </button>
        </div>

        <div className="glass overflow-x-auto">
          <table className="w-full table-cosmic min-w-[520px]">
            <thead>
              <tr>
                <th>Item</th>
                <th className="w-24 text-center">Guests</th>
                <th className="w-24 text-center">Signed in</th>
              </tr>
            </thead>
            <tbody>
              {NAV_ITEMS.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="font-semibold text-sm">{item.label}</div>
                    <div className="text-[11px] text-muted">{item.note}</div>
                  </td>
                  {(["guest", "user"] as const).map((who) => (
                    <td key={who} className="text-center">
                      {item.audiences.includes(who) ? (
                        <input
                          type="checkbox"
                          checked={navShows(nav, item.id, who)}
                          onChange={(e) => toggle(item.id, who, e.target.checked)}
                          className="h-4 w-4 accent-cyan-500"
                          aria-label={`${item.label} for ${who === "guest" ? "guests" : "signed-in gamers"}`}
                        />
                      ) : (
                        // Not "off" — this item does not exist for that
                        // audience, and a dead checkbox implies it could.
                        <span className="text-[11px] text-muted/50">n/a</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Hiding the profile menu or the alerts does not disable them — the pages still work and the
          mobile drawer still lists what it lists. This is the desktop bar only.
        </p>
      </section>

      {/* ===== Footer ===== */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">Footer</h2>
            <p className="text-[11px] text-muted">
              Columns run left to right after the brand block. A link starting with <code>/</code> stays
              in the app; a full URL opens in a new tab.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCols([...cols, { title: "New column", links: [] }])}
              className="ghost-btn pressable rounded-full px-4 py-2 text-sm"
            >
              + Column
            </button>
            <button onClick={saveFooter} disabled={pending} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {pending ? "Saving…" : "Save the footer"}
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {cols.map((col, ci) => (
            <div key={ci} className="glass rounded-2xl p-4">
              <div className="flex items-center gap-2">
                <input
                  value={col.title}
                  onChange={(e) => patchCol(ci, { title: e.target.value })}
                  placeholder="Column heading"
                  className="input-cosmic flex-1 font-semibold"
                />
                <button onClick={() => move(ci, -1)} title="Move left" className="p-1.5 text-muted hover:text-ink"><Icon name="arrowLeft" size={13} /></button>
                <button onClick={() => move(ci, 1)} title="Move right" className="p-1.5 text-muted hover:text-ink"><Icon name="arrowRight" size={13} /></button>
                <button
                  onClick={() => setCols(cols.filter((_, j) => j !== ci))}
                  title="Remove column"
                  className="p-1.5 text-muted hover:text-rose-300"
                >
                  <Icon name="x" size={14} />
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {col.links.map((l, li) => (
                  <div key={li} className="flex items-center gap-2">
                    <input
                      value={l.label}
                      onChange={(e) => patchLink(ci, li, { label: e.target.value })}
                      placeholder="Label"
                      className="input-cosmic w-2/5 text-sm"
                    />
                    <input
                      value={l.href}
                      onChange={(e) => patchLink(ci, li, { href: e.target.value })}
                      placeholder="/pricing"
                      className="input-cosmic flex-1 font-mono text-xs"
                    />
                    <button onClick={() => dropLink(ci, li)} title="Remove" className="p-1.5 text-muted hover:text-rose-300">
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                ))}
                <button onClick={() => addLink(ci)} className="ghost-btn pressable rounded-full px-3 py-1 text-xs">+ Link</button>
              </div>
            </div>
          ))}
          {cols.length === 0 && (
            <div className="glass rounded-2xl p-6 text-center text-sm text-muted md:col-span-2">
              No columns. The footer will show only the brand block — add one to change that.
            </div>
          )}
        </div>
      </section>

      {msg && <p className="text-sm text-cyan-300">{msg}</p>}
    </div>
  );
}
