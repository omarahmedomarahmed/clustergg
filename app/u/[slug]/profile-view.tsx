// A gamer's public page, rendered with their theme.
//
// ===== D17 — SCOPED, AND EVERY BOUNDARY IS VISIBLE HERE =====
//
// The theme reaches the DOM in exactly one place: the `style` on the root
// element below, whose every key is a `--p-` variable. Nothing sets a variable
// on `:root`, nothing writes a `<style>` tag, and nothing interpolates a
// gamer's string into CSS anywhere except through `themeToVars`,
// `bgLayerStyle`, `coverStyle` and `sectionArtStyle` — all of which take values
// `resolveTheme` has already bounded.
//
// The reason it matters is not tidiness. A gamer's page is a page a stranger
// visits, and a variable that escaped the scope would repaint Cluster's own
// chrome: the nav, the money colour, the podium.
//
// ===== D18 — THE BACKGROUND IS A SEPARATE FIXED LAYER =====
//
// Never `background-attachment: fixed`. v1 measured this: on a long,
// heavily-customized profile it forces a full-viewport repaint on every scroll
// frame, which is the "slow scrolling" gamers reported. A `position: fixed`
// element behind the content looks identical and the compositor handles it.
//
// ===== D21 — THE SECTIONS ARE V3'S =====
//
// Linked accounts, trophy case, challenges entered, standings, rank history.
// Quests, Cluster Points and badges do not exist, and the port's own section
// list named four surfaces that do not.

import Link from "next/link";
import {
  avatarClip,
  bgLayerStyle,
  coverStyle,
  sectionArtStyle,
  themeToVars,
  SECTIONS,
  type ProfileTheme,
} from "../../../lib/profile/theme.ts";

export type ProfileSections = {
  accounts: { provider: string; handle: string }[];
  trophies: { id: string; name: string; valueCents: number; redeemed: boolean }[];
  challenges: { id: string; title: string; placement: number | null }[];
  standings: { title: string; placement: number | null; points: number }[];
  rank: { week: string; from: number | null; to: number | null }[];
};

/**
 * One card. `data-style` carries the gamer's choice; the CSS decides what it
 * means, so a style this deploy does not know how to draw is a plain card
 * rather than a broken one.
 */
function Card({
  theme,
  sectionKey,
  title,
  children,
}: {
  theme: ProfileTheme;
  sectionKey: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="p-card"
      data-style={theme.cardStyle}
      data-section={sectionKey}
      style={sectionArtStyle(theme, sectionKey)}
    >
      <h2 className="text-lg font-medium">{title}</h2>
      <div className="mt-3 text-sm">{children}</div>
    </section>
  );
}

function Nothing({ children }: { children: React.ReactNode }) {
  // D10 — a real empty state with a next action, never a bare dash.
  return <p className="p-muted">{children}</p>;
}

export function ProfileView({
  theme,
  displayName,
  slug,
  data,
}: {
  theme: ProfileTheme;
  displayName: string;
  slug: string;
  data: ProfileSections;
}) {
  const labels = new Map(SECTIONS.map((s) => [s.key as string, s.label]));

  const body: Record<string, React.ReactNode> = {
    accounts:
      data.accounts.length === 0 ? (
        <Nothing>No game accounts linked yet.</Nothing>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {data.accounts.map((a) => (
            <li key={`${a.provider}:${a.handle}`} className="rounded-lg border border-white/10 px-3 py-1.5">
              <span className="p-muted">{a.provider}</span> {a.handle}
            </li>
          ))}
        </ul>
      ),
    trophies:
      data.trophies.length === 0 ? (
        <Nothing>No trophies yet — every challenge gives one for turning up.</Nothing>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {data.trophies.map((t) => (
            <li key={t.id} className="rounded-lg border border-white/10 px-3 py-2">
              <Link href={`/trophies/${t.id}`} className="font-medium">
                {t.name}
              </Link>
              <p className="p-muted mt-0.5">
                {t.valueCents > 0 ? `$${(t.valueCents / 100).toFixed(2)}` : "Collectable"}
                {t.redeemed ? " · cashed out" : ""}
              </p>
            </li>
          ))}
        </ul>
      ),
    challenges:
      data.challenges.length === 0 ? (
        <Nothing>None yet.</Nothing>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.challenges.map((c) => (
            <li key={c.id} className="flex justify-between rounded-lg border border-white/10 px-3 py-2">
              <Link href={`/challenges/${c.id}`}>{c.title}</Link>
              <span className="p-muted">{c.placement ? `#${c.placement}` : "in progress"}</span>
            </li>
          ))}
        </ul>
      ),
    standings:
      data.standings.length === 0 ? (
        <Nothing>Nothing scored yet.</Nothing>
      ) : (
        <ul className="flex flex-col gap-1">
          {data.standings.map((s, i) => (
            <li key={i} className="flex justify-between">
              <span>{s.title}</span>
              {/*
                13-DESIGN §1 — the podium's colours mean the podium and nothing
                else, so they are the platform's on every profile whatever the
                gamer chose. That is why they are not `--p-` variables.
              */}
              <span
                className={
                  s.placement === 1
                    ? "p-gold"
                    : s.placement === 2
                      ? "p-silver"
                      : s.placement === 3
                        ? "p-bronze"
                        : "p-muted"
                }
              >
                {s.placement ? `#${s.placement}` : "—"} · {s.points} pts
              </span>
            </li>
          ))}
        </ul>
      ),
    rank:
      data.rank.length === 0 ? (
        <Nothing>No weeks closed yet.</Nothing>
      ) : (
        <ul className="flex flex-col gap-1">
          {data.rank.map((r, i) => (
            <li key={i} className="flex justify-between">
              <span className="p-muted">{r.week}</span>
              <span>
                {r.from ?? "—"} → {r.to ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      ),
  };

  return (
    <div className="profile-root relative min-h-screen" style={themeToVars(theme) as React.CSSProperties}>
      {/* D18 — its own fixed layer, behind everything, never a click. */}
      {theme.bgImage ? (
        <div
          aria-hidden
          data-testid="profile-bg"
          className="pointer-events-none fixed inset-0 -z-10"
          style={bgLayerStyle(theme) as React.CSSProperties}
        />
      ) : null}

      <div
        data-testid="profile-cover"
        style={{ height: theme.coverHeight, ...(coverStyle(theme) as React.CSSProperties) }}
      />

      <main className="mx-auto -mt-16 flex max-w-3xl flex-col gap-6 px-6 pb-16">
        <div className="flex items-end gap-4">
          <div
            data-testid="profile-avatar"
            className="border-2 border-white/20 bg-black/40"
            style={{
              width: theme.avatarSize,
              height: theme.avatarSize,
              borderRadius:
                theme.avatarShape === "circle"
                  ? "999px"
                  : theme.avatarShape === "rounded"
                    ? "18%"
                    : 0,
              clipPath: avatarClip(theme.avatarShape),
            }}
          />
          <div className="pb-2">
            <h1 className="text-3xl font-semibold tracking-tight">{displayName}</h1>
            <p className="p-muted text-sm">/u/{slug}</p>
          </div>
        </div>

        {/*
          E18/D16 — the ORDER is the gamer's and the CONTENT is not. A section
          they hid is absent; a section this deploy added that their saved order
          predates is appended by `resolveTheme` rather than lost.
        */}
        {theme.order
          .filter((key) => theme.sections[key] !== false && key in body)
          .map((key) => (
            <Card key={key} theme={theme} sectionKey={key} title={labels.get(key) ?? key}>
              {body[key]}
            </Card>
          ))}
      </main>
    </div>
  );
}
