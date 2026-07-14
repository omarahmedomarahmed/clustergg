import Icon from "@/components/Icon";
import type { QuestView } from "@/lib/quests";

// One Quest as a gamified, themed card: emblem + tier badges + progress bar.
// Presentational — pass a QuestView from getUserQuests.
export default function QuestCard({ quest }: { quest: QuestView }) {
  const q = quest;
  const done = q.nextTier === null;
  const prevThreshold = q.currentTierIndex >= 0 ? q.tiers[q.currentTierIndex].thresholdQp : 0;
  const span = q.nextTier ? q.nextTier.thresholdQp - prevThreshold : 1;
  const into = q.nextTier ? q.qp - prevThreshold : 1;
  const pct = done ? 100 : Math.max(4, Math.min(100, Math.round((into / span) * 100)));
  const earnedCount = q.tiers.filter((t) => t.earned).length;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 p-5"
      style={{
        background: q.cardBgUrl
          ? `linear-gradient(180deg, ${q.color}14, rgba(4,5,26,0.72)), url(${q.cardBgUrl}) center/cover`
          : `radial-gradient(120% 120% at 0% 0%, ${q.color}22, transparent 60%), radial-gradient(120% 120% at 100% 100%, ${q.accent2}1a, transparent 60%), rgba(10,10,28,0.6)`,
      }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl shrink-0"
          style={{ background: `${q.color}22`, border: `1px solid ${q.color}55`, boxShadow: `0 0 20px -6px ${q.color}` }}>
          {q.logoUrl
            ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={q.logoUrl} alt="" className="h-8 w-8 object-contain" />
            : <Icon name={q.icon} size={24} style={{ color: q.color }} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg truncate">{q.name}</h3>
            {q.currentTierIndex >= 0 && (
              <span className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5"
                style={{ background: `${q.color}26`, color: q.color }}>{q.tiers[q.currentTierIndex].name}</span>
            )}
          </div>
          <p className="text-xs text-muted truncate">{q.tagline}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-bold" style={{ color: q.accent2 }}>{q.qp.toLocaleString()}</div>
          <div className="text-[10px] text-muted">QP · {earnedCount}/{q.tiers.length}</div>
        </div>
      </div>

      {/* Tier badges */}
      <div className="mt-4 flex items-end justify-between gap-1.5">
        {q.tiers.map((t) => (
          <div key={t.id} className="flex flex-col items-center gap-1 flex-1 min-w-0" title={`${t.name} · ${t.thresholdQp} QP — ${t.description}`}>
            <div className="flex items-center justify-center rounded-full transition-all"
              style={{
                width: 40, height: 40,
                background: t.earned ? `${(t.color || q.color)}2a` : "rgba(255,255,255,0.04)",
                border: `2px solid ${t.earned ? (t.color || q.color) : "rgba(255,255,255,0.12)"}`,
                boxShadow: t.earned ? `0 0 16px -3px ${t.color || q.color}` : "none",
                opacity: t.earned ? 1 : 0.5,
              }}>
              {t.iconUrl
                ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={t.iconUrl} alt="" className="h-7 w-7 object-contain" style={{ filter: t.earned ? "none" : "grayscale(1)" }} />
                : <Icon name={q.icon} size={18} style={{ color: t.earned ? (t.color || q.color) : "#6b7280" }} />}
            </div>
            <span className="text-[9px] font-semibold uppercase tracking-wide truncate w-full text-center" style={{ color: t.earned ? (t.color || q.color) : "#8b8ba7" }}>{t.name}</span>
          </div>
        ))}
      </div>

      {/* Progress */}
      <div className="mt-4">
        <div className="h-2 rounded-full bg-black/40 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${q.color}, ${q.accent2})` }} />
        </div>
        <div className="mt-1.5 text-[11px] text-muted">
          {done ? <span style={{ color: q.color }}>★ Max tier reached — legend status.</span>
            : <>{into.toLocaleString()} / {span.toLocaleString()} to <b style={{ color: q.color }}>{q.nextTier!.name}</b></>}
        </div>
      </div>
    </div>
  );
}
