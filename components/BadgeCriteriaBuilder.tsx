"use client";

import { useMemo, useState } from "react";

export type BuilderMetric = { key: string; label: string };
export type BuilderCriteriaProvider = { id: string; name: string; game: string; metrics: BuilderMetric[] };

type CriteriaType =
  | "account_linked"
  | "accounts_linked_count"
  | "stat_threshold"
  | "follower_count"
  | "community_activity"
  | "expert_tier"
  | "challenge_result";

const TYPES: { key: CriteriaType; label: string; hint: string }[] = [
  { key: "account_linked", label: "Links a game account", hint: "Awarded when the player connects any (or a specific) game." },
  { key: "accounts_linked_count", label: "Links N game accounts", hint: "Awarded once the player has linked at least N accounts." },
  { key: "stat_threshold", label: "Reaches a stat", hint: "Awarded when a specific game stat crosses a value." },
  { key: "follower_count", label: "Reaches N followers", hint: "Awarded at a follower milestone." },
  { key: "community_activity", label: "Community activity", hint: "Awarded for posts made and likes received." },
  { key: "expert_tier", label: "Earns an expert tier", hint: "Awarded on reaching a community expert tier." },
  { key: "challenge_result", label: "Places in a challenge", hint: "Awarded automatically by the challenge finalizer." },
];

// Visual, no-JSON editor for a badge's award rule. Emits the same criteria
// shapes the evaluator in lib/badges.ts understands, via a hidden input.
export default function BadgeCriteriaBuilder({
  providers,
  name = "criteria",
  initial,
}: {
  providers: BuilderCriteriaProvider[];
  name?: string;
  initial?: Record<string, unknown>;
}) {
  const [type, setType] = useState<CriteriaType>((initial?.type as CriteriaType) ?? "account_linked");
  const [provider, setProvider] = useState<string>(String(initial?.provider ?? ""));
  const [min, setMin] = useState<number>(Number(initial?.min ?? 3));
  // stat_threshold uses a provider to source the metric + game, plus the metric key.
  const [statProviderId, setStatProviderId] = useState<string>(providers[0]?.id ?? "");
  const [metric, setMetric] = useState<string>(String(initial?.metric ?? providers[0]?.metrics[0]?.key ?? ""));
  const [statMin, setStatMin] = useState<number>(Number(initial?.min ?? 2000));
  const [postsMin, setPostsMin] = useState<number>(Number(initial?.posts_min ?? 20));
  const [reactionsMin, setReactionsMin] = useState<number>(Number(initial?.reactions_received_min ?? 50));
  const [tier, setTier] = useState<string>(String(initial?.tier ?? "expert"));
  const [placement, setPlacement] = useState<string>(String(initial?.placement ?? "top3"));

  const statProvider = useMemo(
    () => providers.find((p) => p.id === statProviderId),
    [providers, statProviderId],
  );

  const criteria = useMemo<Record<string, unknown>>(() => {
    switch (type) {
      case "account_linked":
        return provider ? { type, provider } : { type };
      case "accounts_linked_count":
        return { type, min };
      case "stat_threshold":
        return { type, metric, game: statProvider?.game, min: statMin };
      case "follower_count":
        return { type, min };
      case "community_activity":
        return { type, posts_min: postsMin, reactions_received_min: reactionsMin };
      case "expert_tier":
        return { type, tier };
      case "challenge_result":
        return { type, placement };
      default:
        return { type };
    }
  }, [type, provider, min, metric, statProvider, statMin, postsMin, reactionsMin, tier, placement]);

  const activeHint = TYPES.find((t) => t.key === type)?.hint;
  const sel = "input-cosmic";
  const num = "input-cosmic w-28";

  return (
    <div className="sm:col-span-2 rounded-xl border border-violet-400/15 p-3 space-y-3">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted mb-2">Award rule</div>
        <select value={type} onChange={(e) => setType(e.target.value as CriteriaType)} className={sel}>
          {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        {activeHint && <p className="text-[11px] text-muted mt-1.5">{activeHint}</p>}
      </div>

      {type === "account_linked" && (
        <label className="block text-xs text-muted">Which game (optional)
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className={`${sel} mt-1`}>
            <option value="">Any game</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      {(type === "accounts_linked_count" || type === "follower_count") && (
        <label className="flex items-center gap-2 text-xs text-muted">
          {type === "follower_count" ? "At least this many followers" : "At least this many linked accounts"}
          <input type="number" min={1} value={min} onChange={(e) => setMin(Number(e.target.value))} className={num} />
        </label>
      )}

      {type === "stat_threshold" && (
        <div className="grid sm:grid-cols-3 gap-2">
          <label className="text-xs text-muted">Game
            <select value={statProviderId} onChange={(e) => { setStatProviderId(e.target.value); const p = providers.find((x) => x.id === e.target.value); setMetric(p?.metrics[0]?.key ?? ""); }} className={`${sel} mt-1`}>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.game}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted">Stat
            <select value={metric} onChange={(e) => setMetric(e.target.value)} className={`${sel} mt-1`}>
              {(statProvider?.metrics ?? []).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted">Reaches
            <input type="number" value={statMin} onChange={(e) => setStatMin(Number(e.target.value))} className={`input-cosmic mt-1 w-full`} />
          </label>
        </div>
      )}

      {type === "community_activity" && (
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs text-muted">Posts made
            <input type="number" min={0} value={postsMin} onChange={(e) => setPostsMin(Number(e.target.value))} className={num} />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted">Likes received
            <input type="number" min={0} value={reactionsMin} onChange={(e) => setReactionsMin(Number(e.target.value))} className={num} />
          </label>
        </div>
      )}

      {type === "expert_tier" && (
        <label className="block text-xs text-muted">Tier
          <select value={tier} onChange={(e) => setTier(e.target.value)} className={`${sel} mt-1`}>
            {["contributor", "helper", "expert"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      )}

      {type === "challenge_result" && (
        <label className="block text-xs text-muted">Placement
          <select value={placement} onChange={(e) => setPlacement(e.target.value)} className={`${sel} mt-1`}>
            <option value="top1">1st place</option>
            <option value="top3">Top 3</option>
          </select>
        </label>
      )}

      <input type="hidden" name={name} value={JSON.stringify(criteria)} />
    </div>
  );
}
