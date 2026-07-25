import { ImageResponse } from "next/og";
import { loadCardFonts, cardFontFamily } from "@/lib/cards/fonts";
import { toEmbeddable } from "@/lib/cards/img";
import { brandCardArt } from "@/lib/cards/brand";
import type {
  CardData, CardTheme, ProfileCard, GameStatsCard, QuestCard, CpSummaryCard,
  LeaderboardCard, ChallengeCard, PlanetCard, PlanetsCard, GuideCard,
} from "@/lib/cards/types";

// Server-rendered "glorified" PNG cards, shared by the Discord bot and the web
// (they double as OpenGraph images). Built on next/og's ImageResponse — no extra
// dependency, no headless browser. One cosmic frame, one body per card kind.

export const CARD_W = 1200;
export const CARD_H = 630;

const INK = "#f2f3ff";
const MUTED = "#9aa0c3";
const VOID = "#04051a";

const veil = (dim = 62) => `rgba(4,5,26,${Math.max(0, Math.min(100, dim)) / 100})`;

// The shared frame: artwork → veil → accent glows → content → wordmark.
function Frame({ theme, children, corner }: { theme: CardTheme; children: React.ReactNode; corner?: React.ReactNode }) {
  return (
    <div style={{ width: CARD_W, height: CARD_H, display: "flex", position: "relative", background: VOID, color: INK }}>
      {theme.bgUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={theme.bgUrl} alt="" width={CARD_W} height={CARD_H}
          style={{ position: "absolute", inset: 0, width: CARD_W, height: CARD_H, objectFit: "cover" }} />
      ) : null}
      <div style={{ position: "absolute", inset: 0, display: "flex", background: theme.bgUrl ? veil(theme.dim ?? 62) : VOID }} />
      {/* accent glows */}
      <div style={{ position: "absolute", top: -220, left: -160, width: 720, height: 720, borderRadius: 999, display: "flex", background: `${theme.accent}22` }} />
      <div style={{ position: "absolute", bottom: -280, right: -180, width: 760, height: 760, borderRadius: 999, display: "flex", background: `${theme.accent2}1c` }} />
      {/* top accent bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 8, display: "flex", background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2})` }} />
      {/* The astronaut. Drawn BEFORE the content so a dense card (a full
          leaderboard, a long standings list) overlaps it instead of colliding
          with it — it's brand furniture, not a element competing for space. */}
      {theme.astronautUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={theme.astronautUrl} alt="" height={210}
          style={{ position: "absolute", right: 34, bottom: 62, height: 210, objectFit: "contain", opacity: 0.92 }} />
      ) : null}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "48px 56px" }}>
        {children}
      </div>
      {/* The real logo mark, bottom-right. Falls back to the wordmark only when
          no logo is configured, so a card is never unbranded. */}
      <div style={{ position: "absolute", bottom: 26, right: 44, display: "flex", alignItems: "center", gap: 10 }}>
        {theme.markUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={theme.markUrl} alt="" width={42} height={42}
            style={{ width: 42, height: 42, borderRadius: 12, objectFit: "contain" }} />
        ) : (
          <>
            <div style={{ width: 26, height: 26, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`, fontSize: 17, fontWeight: 700, color: "#fff" }}>C</div>
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: 2, color: INK, opacity: 0.85 }}>CLUSTER</div>
          </>
        )}
      </div>
      {corner ? <div style={{ position: "absolute", top: 38, right: 44, display: "flex" }}>{corner}</div> : null}
    </div>
  );
}

function Pill({ children, color = MUTED, bg = "rgba(255,255,255,0.07)" }: { children: React.ReactNode; color?: string; bg?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 16px", borderRadius: 999, background: bg, color, fontSize: 21, fontWeight: 700 }}>
      {children}
    </div>
  );
}

function Avatar({ url, size = 104, ring }: { url?: string | null; size?: number; ring: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size}
      style={{ width: size, height: size, borderRadius: size / 2, objectFit: "cover", border: `4px solid ${ring}` }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: size / 2, display: "flex", alignItems: "center", justifyContent: "center", background: `${ring}33`, border: `4px solid ${ring}`, fontSize: size * 0.42, fontWeight: 700 }}>C</div>
  );
}

function Bar({ pct, accent, accent2, h = 16 }: { pct: number; accent: string; accent2: string; h?: number }) {
  const w = Math.max(2, Math.min(100, pct));
  return (
    <div style={{ display: "flex", width: "100%", height: h, borderRadius: 999, background: "rgba(255,255,255,0.10)", overflow: "hidden" }}>
      <div style={{ display: "flex", width: `${w}%`, height: h, borderRadius: 999, background: `linear-gradient(90deg, ${accent}, ${accent2})` }} />
    </div>
  );
}

function Title({ text, sub, accent, accent2 }: { text: string; sub?: string | null; accent: string; accent2: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.05, color: INK }}>{text}</div>
      {sub ? <div style={{ fontSize: 26, color: MUTED }}>{sub}</div> : null}
      <div style={{ display: "flex", width: 132, height: 6, borderRadius: 999, marginTop: 8, background: `linear-gradient(90deg, ${accent}, ${accent2})` }} />
    </div>
  );
}

const nf = (n: number) => n.toLocaleString("en-US");

// Truncate on a word boundary. A hard slice reads as a bug ("…from the Che"),
// and these strings are admin-written, so they can be any length.
function clamp(s: string | null | undefined, max: number): string | undefined {
  if (!s) return undefined;
  const text = s.trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.\-–—]$/, "")}…`;
}

// ===== Bodies =====

function ProfileBody(d: ProfileCard) {
  const t = d.theme;
  return (
    <Frame theme={t} corner={<Pill color={t.accent2} bg="rgba(0,0,0,0.45)">LV {d.level}</Pill>}>
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <Avatar url={d.avatarUrl} ring={t.accent} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.05 }}>{d.displayName}</div>
          <div style={{ fontSize: 25, color: MUTED }}>{`clustergg.com/u/${d.slug}${d.title ? ` · ${d.title}` : ""}`}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, marginTop: 26 }}>
        <Pill color={t.accent2} bg="rgba(255,255,255,0.08)">{`${nf(d.totalCp)} CP`}</Pill>
        <Pill>{`${nf(d.views)} views`}</Pill>
        <Pill color="#fbbf24" bg="rgba(251,191,36,0.12)">
          <div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: "#fbbf24" }} />
          {`${nf(d.votes)} votes`}
        </Pill>
        {d.award ? <Pill color="#34d399" bg="rgba(52,211,153,0.12)">{d.award}</Pill> : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 30, gap: 12, flex: 1 }}>
        <div style={{ fontSize: 19, letterSpacing: 3, color: MUTED, fontWeight: 700 }}>LINKED ACCOUNTS</div>
        {d.accounts.length === 0 ? (
          <div style={{ fontSize: 26, color: MUTED }}>No games linked yet — link one to unlock quests.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {d.accounts.slice(0, 6).map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderRadius: 18, background: "rgba(0,0,0,0.42)", border: "1px solid rgba(255,255,255,0.10)", width: 340 }}>
                {a.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.logoUrl} alt="" width={44} height={44} style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover" }} />
                ) : <div style={{ width: 44, height: 44, borderRadius: 10, display: "flex", background: `${t.accent}33` }} />}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: 23, fontWeight: 700 }}>{clamp(a.tag, 20)}</div>
                  <div style={{ fontSize: 18, color: MUTED }}>{a.headline || a.game}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Frame>
  );
}

function GameStatsBody(d: GameStatsCard) {
  const t = d.theme;
  const champs = d.champions ?? [];
  const matches = d.matches ?? [];
  const hasRich = champs.length > 0 || matches.length > 0;
  // With champions and match history there's no room for six stat tiles, so the
  // stats compress into a single row and the game content gets the space.
  const statCount = hasRich ? 3 : 6;

  return (
    <Frame theme={t} corner={d.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={d.logoUrl} alt="" width={72} height={72} style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover" }} />
    ) : undefined}>
      {/* Identity first: the in-game name people searched for, and the human behind it. */}
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <Avatar url={d.gameAvatarUrl || d.avatarUrl} size={84} ring={t.accent} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 46, fontWeight: 700, lineHeight: 1.05 }}>{clamp(d.tag, 24)}</div>
          <div style={{ fontSize: 23, color: MUTED }}>
            {`${d.game}${d.region ? ` · ${d.region}` : ""} · ${d.displayName}${d.slug ? ` (clustergg.com/u/${d.slug})` : ""}`}
          </div>
        </div>
      </div>

      {d.live?.champion ? (
        <div style={{ display: "flex", marginTop: 14 }}>
          <Pill color="#34d399" bg="rgba(52,211,153,0.14)">
            <div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: "#34d399" }} />
            {`IN GAME · ${d.live.champion}`}
          </Pill>
        </div>
      ) : null}

      {d.stats.length === 0 && !hasRich ? (
        <div style={{ display: "flex", marginTop: 40, fontSize: 26, color: MUTED }}>
          Stats sync shortly after linking — check back in a few minutes.
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", alignContent: "flex-start", gap: 12, marginTop: 22 }}>
          {d.stats.slice(0, statCount).map((s, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, width: hasRich ? 352 : 336, padding: "14px 20px", borderRadius: 18, background: "rgba(0,0,0,0.48)", border: "1px solid rgba(255,255,255,0.10)" }}>
              <div style={{ fontSize: 17, letterSpacing: 2, color: MUTED, fontWeight: 700 }}>{clamp(s.label.toUpperCase(), 22)}</div>
              <div style={{ fontSize: 34, fontWeight: 700, color: t.accent2 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {champs.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
          <div style={{ fontSize: 17, letterSpacing: 3, color: MUTED, fontWeight: 700 }}>MOST PLAYED</div>
          <div style={{ display: "flex", gap: 12 }}>
            {champs.slice(0, 5).map((c, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 122 }}>
                {c.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.iconUrl} alt="" width={64} height={64} style={{ width: 64, height: 64, borderRadius: 32, objectFit: "cover", border: `3px solid ${t.accent}88` }} />
                ) : (
                  <div style={{ display: "flex", width: 64, height: 64, borderRadius: 32, background: `${t.accent}33`, border: `3px solid ${t.accent}88` }} />
                )}
                <div style={{ fontSize: 17, fontWeight: 700 }}>{clamp(c.name, 12)}</div>
                {c.points ? <div style={{ fontSize: 14, color: MUTED }}>{`${Math.round(c.points / 1000)}k`}</div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {matches.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 18, flex: 1 }}>
          <div style={{ fontSize: 17, letterSpacing: 3, color: MUTED, fontWeight: 700 }}>RECENT MATCHES</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {matches.slice(0, 4).map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 16px", borderRadius: 12, background: m.win ? "rgba(52,211,153,0.14)" : "rgba(239,68,68,0.12)", border: `1px solid ${m.win ? "rgba(52,211,153,0.35)" : "rgba(239,68,68,0.3)"}` }}>
                {m.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.iconUrl} alt="" width={34} height={34} style={{ width: 34, height: 34, borderRadius: 17, objectFit: "cover" }} />
                ) : null}
                <div style={{ fontSize: 20, fontWeight: 700, width: 62, color: m.win ? "#34d399" : "#f87171" }}>{m.win ? "WIN" : "LOSS"}</div>
                <div style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>{clamp(m.champion, 18)}</div>
                <div style={{ fontSize: 20, color: INK }}>{m.kda}</div>
                <div style={{ fontSize: 17, color: MUTED, width: 110 }}>{clamp(m.queue ?? m.when ?? "", 14)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {d.rank ? (
        <div style={{ display: "flex", marginTop: 12 }}>
          <Pill color={t.accent} bg="rgba(255,255,255,0.08)">{`#${d.rank.place} of ${nf(d.rank.total)} · ${d.rank.board}`}</Pill>
        </div>
      ) : null}
    </Frame>
  );
}

function QuestBody(d: QuestCard) {
  const t = d.theme;
  const next = d.nextThreshold ?? 0;
  const pct = next > 0 ? (d.cp / next) * 100 : 100;
  return (
    <Frame theme={t} corner={d.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={d.logoUrl} alt="" width={78} height={78} style={{ width: 78, height: 78, objectFit: "contain" }} />
    ) : undefined}>
      <Title text={d.questName} sub={d.displayName ? `${d.displayName}${d.tagline ? ` · ${d.tagline}` : ""}` : d.tagline} accent={t.accent} accent2={t.accent2} />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginTop: 30 }}>
        <div style={{ fontSize: 74, fontWeight: 700, color: t.accent2, lineHeight: 1 }}>{nf(d.cp)}</div>
        <div style={{ fontSize: 27, color: MUTED, paddingBottom: 10 }}>
          {`CP${next > 0 ? ` / ${nf(next)} → ${d.nextTier ?? ""}` : " · max tier"}`}
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 18 }}><Bar pct={pct} accent={t.accent} accent2={t.accent2} h={18} /></div>
      {/* alignItems keeps the tier chips sized to their content instead of
          stretching to fill the remaining card height. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginTop: 34, flex: 1 }}>
        {d.tiers.slice(0, 5).map((tier, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: 1, padding: "18px 10px", borderRadius: 20, background: tier.earned ? `${t.accent}1f` : "rgba(0,0,0,0.42)", border: `1px solid ${tier.earned ? `${t.accent}88` : "rgba(255,255,255,0.10)"}` }}>
            <div style={{ display: "flex", width: 22, height: 22, borderRadius: 11, background: tier.earned ? t.accent : "transparent", border: `3px solid ${tier.earned ? t.accent : "rgba(255,255,255,0.32)"}` }} />
            <div style={{ fontSize: 21, fontWeight: 700, color: tier.earned ? t.accent : MUTED }}>{tier.name}</div>
            <div style={{ fontSize: 18, color: MUTED }}>{`${nf(tier.threshold)} CP`}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function CpSummaryBody(d: CpSummaryCard) {
  const t = d.theme;
  return (
    <Frame theme={t} corner={<Pill color={t.accent2} bg="rgba(0,0,0,0.45)">LV {d.level}</Pill>}>
      <Title text={`${d.displayName}'s quests`} sub={`${nf(d.totalCp)} total Cluster Points`} accent={t.accent} accent2={t.accent2} />
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 30, flex: 1 }}>
        {d.quests.slice(0, 4).map((q, i) => {
          const pct = q.target > 0 ? (q.cp / q.target) * 100 : 100;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: q.accent }}>{q.name}</div>
                <div style={{ fontSize: 23, color: MUTED }}>{`${nf(q.cp)} / ${nf(q.target)} CP · ${q.tier}`}</div>
              </div>
              <Bar pct={pct} accent={q.accent} accent2={t.accent2} h={14} />
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

function LeaderboardBody(d: LeaderboardCard) {
  const t = d.theme;
  const medal = ["#fbbf24", "#cbd5e1", "#b45309"];
  return (
    <Frame theme={t} corner={d.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={d.logoUrl} alt="" width={72} height={72} style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover" }} />
    ) : undefined}>
      <Title text={d.title} sub={d.subtitle} accent={t.accent} accent2={t.accent2} />
      {d.rows.length === 0 ? (
        <div style={{ display: "flex", marginTop: 40, fontSize: 26, color: MUTED }}>
          No one has posted a score yet — link an account and you top this board.
        </div>
      ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 24, flex: 1 }}>
        {d.rows.slice(0, 8).map((r) => (
          <div key={r.rank} style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 20px", borderRadius: 14, background: r.you ? `${t.accent}26` : "rgba(0,0,0,0.42)", border: `1px solid ${r.you ? `${t.accent}88` : "rgba(255,255,255,0.08)"}` }}>
            <div style={{ fontSize: 27, fontWeight: 700, width: 52, color: medal[r.rank - 1] ?? MUTED }}>{`#${r.rank}`}</div>
            {r.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.avatarUrl} alt="" width={38} height={38} style={{ width: 38, height: 38, borderRadius: 19, objectFit: "cover" }} />
            ) : null}
            <div style={{ fontSize: 27, fontWeight: 700, flex: 1 }}>{`${clamp(r.name, 26)}${r.you ? " · you" : ""}`}</div>
            <div style={{ fontSize: 27, fontWeight: 700, color: t.accent2 }}>{r.value}</div>
          </div>
        ))}
      </div>
      )}
    </Frame>
  );
}

function ChallengeBody(d: ChallengeCard) {
  const t = d.theme;
  const ends = new Date(d.endsAt);
  const days = Math.max(0, Math.ceil((ends.getTime() - Date.now()) / 86400000));
  return (
    <Frame theme={t} corner={d.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={d.logoUrl} alt="" width={72} height={72} style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover" }} />
    ) : undefined}>
      <div style={{ display: "flex", gap: 12 }}>
        <Pill color="#34d399" bg="rgba(52,211,153,0.14)">
          <div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: "#34d399" }} />
          LIVE
        </Pill>
        {d.isPrivate ? (
          <Pill color="#fbbf24" bg="rgba(251,191,36,0.14)">
            <div style={{ display: "flex", width: 12, height: 12, borderRadius: 3, background: "#fbbf24" }} />
            {clamp(d.serverName ? `${d.serverName.toUpperCase()} · KEY TO JOIN` : "KEY TO JOIN", 30)}
          </Pill>
        ) : null}
        <Pill>{d.game}</Pill>
      </div>
      <div style={{ display: "flex", marginTop: 18 }}>
        <Title text={clamp(d.title, 44) ?? ""} sub={clamp(d.description, 92)} accent={t.accent} accent2={t.accent2} />
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 22 }}>
        <Pill color="#fbbf24" bg="rgba(251,191,36,0.12)">{d.ended ? "FINISHED" : `${days}d left`}</Pill>
        <Pill>{`${nf(d.participants)} joined`}</Pill>
        {d.prize ? <Pill color={t.accent2} bg="rgba(255,255,255,0.08)">{clamp(d.prize, 26)}</Pill> : null}
      </div>

      {/* Timeline: the whole window, not just "5d left". People want to know if
          they're early enough to still matter. */}
      {d.startsAt ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 16 }}>
          <Bar pct={windowPct(d.startsAt, d.endsAt)} accent={t.accent} accent2={t.accent2} h={10} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, color: MUTED }}>
            <div style={{ display: "flex" }}>{dayLabel(d.startsAt)}</div>
            <div style={{ display: "flex" }}>{dayLabel(d.endsAt)}</div>
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 22, marginTop: 18, flex: 1 }}>
        {/* Standings */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          <div style={{ fontSize: 16, letterSpacing: 3, color: MUTED, fontWeight: 700 }}>
            {d.ended ? "FINAL STANDINGS" : "STANDINGS"}
          </div>
          {(d.standings ?? []).length === 0 ? (
            <div style={{ display: "flex", fontSize: 21, color: MUTED }}>No one has scored yet — first mover takes the lead.</div>
          ) : (
            (d.standings ?? []).slice(0, 4).map((s) => (
              <div key={s.place} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 14px", borderRadius: 12, background: "rgba(0,0,0,0.42)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize: 20, fontWeight: 700, width: 40, color: ["#fbbf24", "#cbd5e1", "#b45309"][s.place - 1] ?? MUTED }}>{`#${s.place}`}</div>
                <div style={{ fontSize: 21, fontWeight: 700, flex: 1 }}>{clamp(s.name, 20)}</div>
                <div style={{ fontSize: 21, fontWeight: 700, color: t.accent2 }}>{`${nf(s.points)} pts`}</div>
              </div>
            ))
          )}
        </div>

        {/* Trophies — what the podium actually takes home. */}
        {d.trophies.length ? (
          <div style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
            {d.trophies.slice(0, 3).map((tr, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={tr.imageUrl} alt="" width={92} height={92} style={{ width: 92, height: 92, objectFit: "contain" }} />
                <div style={{ fontSize: 18, fontWeight: 700, color: ["#fbbf24", "#cbd5e1", "#b45309"][tr.place - 1] ?? MUTED }}>
                  {`${tr.place === 1 ? "1st" : tr.place === 2 ? "2nd" : "3rd"}${tr.value > 0 ? ` · $${nf(tr.value)}` : ""}`}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Frame>
  );
}

// How far through its window a challenge is.
function windowPct(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 100;
  return Math.max(0, Math.min(100, ((Date.now() - start) / (end - start)) * 100));
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function PlanetBody(d: PlanetCard) {
  const t = d.theme;
  return (
    <Frame theme={t} corner={d.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={d.logoUrl} alt="" width={86} height={86} style={{ width: 86, height: 86, borderRadius: 20, objectFit: "cover" }} />
    ) : undefined}>
      <Title text={`${d.game} Planet`} sub={clamp(d.description, 96)} accent={t.accent} accent2={t.accent2} />
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginTop: 36, flex: 1 }}>
        {[
          { k: "CHALLENGES LIVE", v: nf(d.challenges) },
          { k: "GAMERS RANKED", v: nf(d.ranked) },
          ...(d.serverGamers != null ? [{ k: "FROM THIS SERVER", v: nf(d.serverGamers) }] : []),
        ].map((s, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, padding: "26px 28px", borderRadius: 22, background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.10)" }}>
            <div style={{ fontSize: 19, letterSpacing: 2, color: MUTED, fontWeight: 700 }}>{s.k}</div>
            <div style={{ fontSize: 52, fontWeight: 700, color: t.accent2 }}>{s.v}</div>
          </div>
        ))}
      </div>
      {d.topGamer ? <Pill color="#fbbf24" bg="rgba(251,191,36,0.12)">{`TOP · ${d.topGamer.name} · ${d.topGamer.value}`}</Pill> : null}
    </Frame>
  );
}

function PlanetsBody(d: PlanetsCard) {
  const t = d.theme;
  return (
    <Frame theme={t}>
      <Title text={d.title} sub={d.subtitle} accent={t.accent} accent2={t.accent2} />
      <div style={{ display: "flex", flexWrap: "wrap", alignContent: "flex-start", gap: 14, marginTop: 26, flex: 1 }}>
        {d.games.slice(0, 12).map((g, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, width: 168, height: 132, borderRadius: 20, background: "rgba(0,0,0,0.45)", border: `1px solid ${g.accent ? `${g.accent}66` : "rgba(255,255,255,0.10)"}` }}>
            {g.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={g.logoUrl} alt="" width={56} height={56} style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover" }} />
            ) : (
              <div style={{ display: "flex", width: 56, height: 56, borderRadius: 14, background: `${g.accent ?? t.accent}44` }} />
            )}
            <div style={{ fontSize: 19, fontWeight: 700, color: g.accent ?? INK }}>{clamp(g.name, 15)}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function GuideBody(d: GuideCard) {
  const t = d.theme;
  return (
    <Frame theme={t} corner={d.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={d.logoUrl} alt="" width={76} height={76} style={{ width: 76, height: 76, objectFit: "contain" }} />
    ) : undefined}>
      {d.badge ? <div style={{ display: "flex", marginBottom: 14 }}><Pill color={t.accent} bg={`${t.accent}1f`}>{d.badge}</Pill></div> : null}
      <Title text={d.title} sub={d.subtitle} accent={t.accent} accent2={t.accent2} />
      {/* overflow:hidden keeps a long admin-written guide from ever pushing the
          footer off the card — the steps clip instead of breaking the layout. */}
      {/* Fewer steps means each one can say more. A quest guide listing every
          scoring action needs the room; a four-step guide doesn't. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 13, marginTop: 24, flex: 1, overflow: "hidden" }}>
        {d.steps.slice(0, 4).map((s, i) => {
          const room = d.steps.length <= 3 ? 210 : 116;
          return (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 42, height: 42, borderRadius: 21, background: `${t.accent}2b`, color: t.accent, fontSize: 23, fontWeight: 700 }}>{i + 1}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                <div style={{ fontSize: 26, fontWeight: 700 }}>{clamp(s.title, 46)}</div>
                <div style={{ fontSize: d.steps.length <= 3 ? 19 : 20, color: MUTED, lineHeight: 1.32 }}>{clamp(s.body, room)}</div>
              </div>
            </div>
          );
        })}
      </div>
      {d.footer ? <div style={{ display: "flex", marginTop: 14, fontSize: 21, color: t.accent2, fontWeight: 700 }}>{d.footer}</div> : null}
    </Frame>
  );
}

function body(d: CardData) {
  switch (d.kind) {
    case "profile": return ProfileBody(d);
    case "game-stats": return GameStatsBody(d);
    case "quest": return QuestBody(d);
    case "cp-summary": return CpSummaryBody(d);
    case "leaderboard": return LeaderboardBody(d);
    case "challenge": return ChallengeBody(d);
    case "planet": return PlanetBody(d);
    case "planets": return PlanetsBody(d);
    case "guide": return GuideBody(d);
  }
}

// Resolve every image on a card to inline bytes before drawing.
//
// Satori fetches remote images itself, and one unreachable host — or one
// animated .gif avatar it can't decode — takes down the entire card. Doing it
// up front means a bad image degrades to its placeholder instead, and the
// render itself touches the network zero times.
// The mascot and the logo mark, as inline bytes. Resolved once per render and
// merged onto every card kind here rather than in each data loader, so a card
// kind added later can't forget them.
async function preparedBrand(): Promise<{ astronautUrl: string | null; markUrl: string | null }> {
  try {
    const b = await brandCardArt();
    const [astronautUrl, markUrl] = await Promise.all([
      toEmbeddable(b.astronautUrl, { maxWidth: 420 }),
      toEmbeddable(b.markUrl, { maxWidth: 128 }),
    ]);
    return { astronautUrl, markUrl };
  } catch { return { astronautUrl: null, markUrl: null }; }
}

async function prepareCard(d: CardData): Promise<CardData> {
  const [body, brand] = await Promise.all([prepareBody(d), preparedBrand()]);
  return { ...body, theme: { ...body.theme, ...brand } } as CardData;
}

async function prepareBody(d: CardData): Promise<CardData> {
  const bg = toEmbeddable(d.theme.bgUrl);

  switch (d.kind) {
    case "profile": {
      const [bgUrl, avatarUrl, ...logos] = await Promise.all([
        bg, toEmbeddable(d.avatarUrl), ...d.accounts.map((a) => toEmbeddable(a.logoUrl)),
      ]);
      return {
        ...d, avatarUrl,
        accounts: d.accounts.map((a, i) => ({ ...a, logoUrl: logos[i] })),
        theme: { ...d.theme, bgUrl },
      };
    }
    case "leaderboard": {
      const [bgUrl, logoUrl, ...avatars] = await Promise.all([
        bg, toEmbeddable(d.logoUrl), ...d.rows.map((r) => toEmbeddable(r.avatarUrl)),
      ]);
      return {
        ...d, logoUrl,
        rows: d.rows.map((r, i) => ({ ...r, avatarUrl: avatars[i] })),
        theme: { ...d.theme, bgUrl },
      };
    }
    case "challenge": {
      const [bgUrl, logoUrl, ...trophies] = await Promise.all([
        bg, toEmbeddable(d.logoUrl), ...d.trophies.map((t) => toEmbeddable(t.imageUrl)),
      ]);
      return {
        ...d, logoUrl,
        // A trophy with no usable art is dropped rather than drawn as a gap.
        trophies: d.trophies.map((t, i) => ({ ...t, imageUrl: trophies[i] ?? "" })).filter((t) => t.imageUrl),
        theme: { ...d.theme, bgUrl },
      };
    }
    case "game-stats": {
      const champs = d.champions ?? [];
      const matches = d.matches ?? [];
      const [bgUrl, logoUrl, avatarUrl, gameAvatarUrl, ...rest] = await Promise.all([
        bg, toEmbeddable(d.logoUrl), toEmbeddable(d.avatarUrl), toEmbeddable(d.gameAvatarUrl),
        ...champs.map((c) => toEmbeddable(c.iconUrl)),
        ...matches.map((m) => toEmbeddable(m.iconUrl)),
      ]);
      return {
        ...d, logoUrl, avatarUrl, gameAvatarUrl,
        champions: champs.map((c, i) => ({ ...c, iconUrl: rest[i] })),
        matches: matches.map((m, i) => ({ ...m, iconUrl: rest[champs.length + i] })),
        theme: { ...d.theme, bgUrl },
      };
    }
    case "quest":
    case "planet":
    case "guide": {
      const [bgUrl, logoUrl] = await Promise.all([bg, toEmbeddable(d.logoUrl)]);
      return { ...d, logoUrl, theme: { ...d.theme, bgUrl } };
    }
    case "planets": {
      const [bgUrl, ...logos] = await Promise.all([bg, ...d.games.map((g) => toEmbeddable(g.logoUrl))]);
      return { ...d, games: d.games.map((g, i) => ({ ...g, logoUrl: logos[i] })), theme: { ...d.theme, bgUrl } };
    }
    default:
      return { ...d, theme: { ...d.theme, bgUrl: await bg } };
  }
}

// Render a card to an ImageResponse (streamable PNG response).
export async function renderCard(data: CardData): Promise<ImageResponse> {
  const [fonts, prepared] = await Promise.all([loadCardFonts(), prepareCard(data)]);
  return new ImageResponse(
    <div style={{ display: "flex", width: CARD_W, height: CARD_H, fontFamily: cardFontFamily(fonts) }}>{body(prepared)}</div>,
    { width: CARD_W, height: CARD_H, ...(fonts.length ? { fonts } : {}) },
  );
}

// Render a card to a raw PNG Buffer (for storing in Blob / attaching to Discord).
export async function renderCardBuffer(data: CardData): Promise<Buffer> {
  const res = await renderCard(data);
  return Buffer.from(await res.arrayBuffer());
}
