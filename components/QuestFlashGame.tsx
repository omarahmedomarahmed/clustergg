"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import CpIcon from "@/components/CpIcon";
import { useTr } from "@/components/LocaleProvider";
import { QUEST_ASTRONAUT } from "@/lib/quest-marker";
import type { QuestGamePayload } from "@/lib/quest-game";
import type { QuestView } from "@/lib/quests";

// ============================================================================
// QuestFlashGame — the "HTML5 FlashPlayer" arcade version of a quest.
//
// This is NOT new content: it turns the quest ITSELF into a playable arcade
// game, reusing the quest's own art (mapArtUrl / cardBgUrl), its astronaut
// figure (QUEST_ASTRONAUT / rocketUrl), its colours, and — most importantly —
// its own scoring actions (quest.rules) as the things the player DOES to make
// progress. Every point you score in the arcade maps to one of the quest's real
// actions and fills the same CP bar toward the next milestone.
//
// It ships several VARIATIONS (kinds) that share one <canvas> engine. A quest
// gets a sensible default variation, but the player can switch variations from
// the toggle inside QuestGame. All variations:
//   • use requestAnimationFrame with a fixed timestep,
//   • are pointer + keyboard controlled (works on phones and desktop),
//   • award "CP" per successful action so it feels like the real quest,
//   • never touch the network (pure client trial — a real hook can persist later).
// ============================================================================

export type FlashKind = "collect" | "dodge" | "tap" | "runner";

export const FLASH_KINDS: { key: FlashKind; label: string; icon: string; blurb: string }[] = [
  { key: "collect", label: "Star Harvest", icon: "star", blurb: "Fly the astronaut and scoop the falling CP tokens." },
  { key: "dodge", label: "Meteor Run", icon: "shield", blurb: "Weave the astronaut through the meteor field — survive to score." },
  { key: "tap", label: "Signal Tap", icon: "zap", blurb: "Tap the quest action orbs the instant they light up." },
  { key: "runner", label: "Trail Dash", icon: "rocket", blurb: "Auto-run the trail and jump the gaps to bank CP." },
];

// Pick a default variation for each quest from its key (stable, no server round-trip).
export function defaultFlashKind(questKey: string): FlashKind {
  const order: FlashKind[] = ["collect", "dodge", "tap", "runner"];
  let h = 0;
  for (let i = 0; i < questKey.length; i++) h = (h * 31 + questKey.charCodeAt(i)) >>> 0;
  return order[h % order.length];
}

type Props = {
  quest: QuestView;
  game: QuestGamePayload;
  rocketUrl?: string;
  kind: FlashKind;
  onKindChange?: (k: FlashKind) => void;
};

// A single scoring "reward" = one of the quest's real actions (label + CP).
type Reward = { label: string; cp: number };

export default function QuestFlashGame({ quest, game, rocketUrl, kind }: Props) {
  const tr = useTr();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // The quest's own actions power the score feed. Fall back to a generic +10 CP
  // when a quest has no scoring rules configured yet.
  const rewards: Reward[] = useMemo(() => {
    const rs = (game.rules ?? []).filter((r) => r.points > 0).map((r) => ({ label: r.label, cp: r.points }));
    return rs.length ? rs : [{ label: "Cluster Point", cp: 10 }];
  }, [game.rules]);

  const [running, setRunning] = useState(false);
  const [over, setOver] = useState(false);
  const [score, setScore] = useState(0);          // CP earned this run
  const [best, setBest] = useState(0);
  const [lastReward, setLastReward] = useState<Reward | null>(null);
  const [lives, setLives] = useState(3);

  // Live values the RAF loop reads without re-subscribing.
  const stateRef = useRef({ running: false, kind });
  useEffect(() => { stateRef.current.kind = kind; }, [kind]);

  // The astronaut sprite (same figure as the map game).
  const spriteUrl = rocketUrl || QUEST_ASTRONAUT.front;

  // ---- best score persists per quest+kind in localStorage (trial only) ----
  const bestKey = `qflash:${quest.key}:${kind}`;
  useEffect(() => {
    try { const b = Number(localStorage.getItem(bestKey)); if (Number.isFinite(b)) setBest(b); } catch { /* ignore */ }
  }, [bestKey]);
  const commitBest = (s: number) => {
    setBest((prev) => {
      if (s <= prev) return prev;
      try { localStorage.setItem(bestKey, String(s)); } catch { /* ignore */ }
      return s;
    });
  };

  // Progress toward the next milestone, blended with this run's arcade score so
  // the arcade feels like it moves the SAME bar as the real quest.
  const to = quest.nextTier;
  const from = quest.currentTierIndex >= 0 ? quest.tiers[quest.currentTierIndex] : null;
  const span = to ? to.thresholdQp - (from?.thresholdQp ?? 0) : 1;
  const basePct = to ? Math.max(0, Math.min(100, ((quest.qp - (from?.thresholdQp ?? 0)) / span) * 100)) : 100;
  const runPct = to ? Math.min(100 - basePct, (score / span) * 100) : 0;

  const award = (r: Reward) => {
    setScore((s) => { const n = s + r.cp; commitBest(n); return n; });
    setLastReward(r);
  };
  const loseLife = () => {
    setLives((l) => {
      const n = l - 1;
      if (n <= 0) { endRun(); }
      return Math.max(0, n);
    });
  };

  const startRun = () => {
    setScore(0); setLives(3); setOver(false); setLastReward(null);
    setRunning(true); stateRef.current.running = true;
  };
  const endRun = () => {
    setRunning(false); stateRef.current.running = false; setOver(true);
  };

  // The full engine lives in a companion effect below (kept in this file but
  // split for readability). It is wired in the next edit.
  useFlashEngine({ canvasRef, wrapRef, kind, spriteUrl, quest, rewards, stateRef, award, loseLife });

  const accentGrad = `linear-gradient(90deg, ${quest.color}, ${quest.accent2})`;

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden rounded-2xl">
      {/* Quest art is the game backdrop */}
      <div aria-hidden className="absolute inset-0"
        style={{ background: quest.mapArtUrl ? `url(${quest.mapArtUrl}) center/cover` : quest.cardBgUrl ? `url(${quest.cardBgUrl}) center/cover` : `linear-gradient(140deg, ${quest.color}33, ${quest.accent2}22), #0a0a1c` }} />
      <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(4,5,26,0.35), rgba(4,5,26,0.72))" }} />

      {/* The play surface */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* ===== HUD ===== */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-2.5">
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 border border-white/10 px-2.5 py-1 text-[13px] font-black" style={{ color: quest.accent2 }}>
            <CpIcon size={14} /> {score.toLocaleString()}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-black/50 border border-white/10 px-2 py-0.5 text-[10px] font-bold text-white/80">
            {tr("Best")} {best.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Icon key={i} name="flame" size={16} style={{ color: i < lives ? "#f43f5e" : "rgba(255,255,255,0.2)" }} />
          ))}
        </div>
      </div>

      {/* Progress into the next milestone (base + this run) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-black/55 border border-white/10">
            <div className="h-full" style={{ width: `${basePct}%`, background: accentGrad, opacity: 0.55 }} />
            <div className="h-full" style={{ width: `${runPct}%`, background: accentGrad }} />
          </div>
          <span className="text-[10px] font-semibold text-white/85 whitespace-nowrap">
            {to ? `${to.name}` : tr("Max tier")}
          </span>
        </div>
      </div>

      {/* Floating "+CP" reward toast keyed to the quest's real action */}
      {lastReward && running && (
        <div key={score} className="pointer-events-none absolute left-1/2 top-1/3 z-30 -translate-x-1/2 animate-[qf-rise_0.9s_ease-out_forwards] text-center">
          <div className="text-lg font-black" style={{ color: quest.accent2 }}>+{lastReward.cp} CP</div>
          <div className="text-[10px] font-semibold text-white/80">{tr(lastReward.label)}</div>
        </div>
      )}

      {/* ===== Start / Game-over overlay ===== */}
      {!running && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/45 backdrop-blur-[2px] p-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={spriteUrl} alt="" className="h-16 w-16 object-contain drop-shadow-[0_0_14px_rgba(34,211,238,0.7)]" />
          <div>
            <div className="text-base font-black text-white">{over ? tr("Run complete!") : tr(FLASH_KINDS.find((f) => f.key === kind)?.label ?? "Arcade")}</div>
            <div className="mt-0.5 text-xs text-white/75 max-w-[280px]">
              {over ? `${tr("You banked")} ${score.toLocaleString()} CP · ${tr("best")} ${best.toLocaleString()}` : tr(FLASH_KINDS.find((f) => f.key === kind)?.blurb ?? "")}
            </div>
          </div>
          <button onClick={startRun}
            className="pressable inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-black text-white"
            style={{ background: accentGrad, boxShadow: `0 10px 26px -10px ${quest.color}` }}>
            <Icon name="play" size={16} /> {over ? tr("Play again") : tr("Play")}
          </button>
          <div className="text-[10px] text-white/55 max-w-[280px]">
            {tr("Every point maps to a real quest action and fills the same milestone bar.")}
          </div>
        </div>
      )}

      <style>{`@keyframes qf-rise { 0% { transform: translate(-50%, 0); opacity: 1 } 100% { transform: translate(-50%, -40px); opacity: 0 } }`}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The engine hook — the actual canvas simulation for every variation.
// One fixed-timestep RAF loop; the active `kind` selects which update/draw runs.
// Pointer (drag / tap) and keyboard (arrows / space) both work.
// ---------------------------------------------------------------------------

type FlashEngineArgs = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  wrapRef: React.RefObject<HTMLDivElement | null>;
  kind: FlashKind;
  spriteUrl: string;
  quest: QuestView;
  rewards: Reward[];
  stateRef: React.MutableRefObject<{ running: boolean; kind: FlashKind }>;
  award: (r: Reward) => void;
  loseLife: () => void;
};

type Entity = { x: number; y: number; vx: number; vy: number; r: number; kind: "cp" | "hazard"; reward?: Reward; hit?: boolean; born: number; ttl?: number };

function useFlashEngine({ canvasRef, wrapRef, kind, spriteUrl, quest, rewards, stateRef, award, loseLife }: FlashEngineArgs) {
  // Keep the newest callbacks/rewards available to the long-lived loop.
  const awardRef = useRef(award); useEffect(() => { awardRef.current = award; }, [award]);
  const loseRef = useRef(loseLife); useEffect(() => { loseRef.current = loseLife; }, [loseLife]);
  const rewardsRef = useRef(rewards); useEffect(() => { rewardsRef.current = rewards; }, [rewards]);
  const pickReward = () => rewardsRef.current[Math.floor(Math.random() * rewardsRef.current.length)];

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Astronaut sprite (falls back to a glowing dot if it can't load).
    const sprite = new Image();
    sprite.crossOrigin = "anonymous";
    let spriteOk = false;
    sprite.onload = () => { spriteOk = true; };
    sprite.src = spriteUrl;

    let W = 1, H = 1, dpr = 1;
    const fit = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(1, wrap.clientWidth); H = Math.max(1, wrap.clientHeight);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(wrap);

    // ---- player + world state ----
    const player = { x: W / 2, y: H * 0.72, vx: 0, vy: 0, r: Math.max(16, Math.min(W, H) * 0.06), onGround: true };
    let entities: Entity[] = [];
    let orbs: { x: number; y: number; r: number; lit: boolean; litAt: number; reward: Reward }[] = [];
    let scroll = 0;               // runner ground scroll
    let gapAt = -1;               // runner: x of next gap
    let spawnT = 0;
    let orbT = 0;
    let last = performance.now();
    let acc = 0;
    const STEP = 1000 / 60;
    let raf = 0;
    let started = false;          // becomes true when a run begins (fresh reset)

    // ---- input ----
    const pointer = { x: W / 2, y: H / 2, down: false };
    const toLocal = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
    };
    const onDown = (e: PointerEvent) => {
      pointer.down = true; toLocal(e);
      const k = stateRef.current.kind;
      if (k === "runner") jump();
      if (k === "tap") tapOrbs();
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => { toLocal(e); };
    const onUp = () => { pointer.down = false; };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    const keys: Record<string, boolean> = {};
    const onKey = (e: KeyboardEvent, v: boolean) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
      keys[e.key] = v;
      if (v && e.key === " " && stateRef.current.kind === "runner") jump();
      if (v && e.key === " " && stateRef.current.kind === "tap") tapOrbs();
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    const jump = () => { if (player.onGround) { player.vy = -Math.max(9, H * 0.018); player.onGround = false; } };
    const tapOrbs = () => {
      for (const o of orbs) {
        if (!o.lit) continue;
        const dx = pointer.x - o.x, dy = pointer.y - o.y;
        if (dx * dx + dy * dy <= (o.r + 8) * (o.r + 8)) { o.lit = false; awardRef.current(o.reward); }
      }
    };

    const reset = () => {
      entities = []; orbs = []; scroll = 0; spawnT = 0; orbT = 0;
      player.x = W / 2; player.y = stateRef.current.kind === "runner" ? H * 0.7 : H * 0.72;
      player.vx = 0; player.vy = 0; player.onGround = true;
      // Pre-place tap orbs in a ring.
      if (stateRef.current.kind === "tap") {
        const n = 5;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          orbs.push({ x: W / 2 + Math.cos(a) * Math.min(W, H) * 0.3, y: H / 2 + Math.sin(a) * Math.min(W, H) * 0.3, r: Math.max(20, Math.min(W, H) * 0.07), lit: false, litAt: 0, reward: pickReward() });
        }
      }
    };

    // ---- per-variation update ----
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

    const updateCollectDodge = (dt: number, hazardMode: boolean) => {
      // Move player toward pointer (or by keys).
      const speed = Math.max(6, W * 0.012);
      if (pointer.down) {
        player.x += clamp(pointer.x - player.x, -speed * dt, speed * dt);
        player.y += clamp(pointer.y - player.y, -speed * dt, speed * dt);
      }
      if (keys.ArrowLeft) player.x -= speed * dt;
      if (keys.ArrowRight) player.x += speed * dt;
      if (keys.ArrowUp) player.y -= speed * dt;
      if (keys.ArrowDown) player.y += speed * dt;
      player.x = clamp(player.x, player.r, W - player.r);
      player.y = clamp(player.y, player.r, H - player.r);

      spawnT -= dt;
      if (spawnT <= 0) {
        spawnT = hazardMode ? 22 + Math.random() * 18 : 30 + Math.random() * 22;
        const x = player.r + Math.random() * (W - player.r * 2);
        const speedY = (hazardMode ? 2.4 : 1.8) + Math.random() * 2 + scroll * 0.0005;
        const isHazard = hazardMode ? Math.random() < 0.78 : Math.random() < 0.28;
        entities.push({
          x, y: -20, vx: 0, vy: speedY, r: Math.max(12, Math.min(W, H) * (isHazard ? 0.05 : 0.045)),
          kind: isHazard ? "hazard" : "cp", reward: isHazard ? undefined : pickReward(), born: performance.now(),
        });
      }
      for (const e of entities) { e.y += e.vy * dt; }
      // Collisions.
      for (const e of entities) {
        if (e.hit) continue;
        const dx = e.x - player.x, dy = e.y - player.y;
        if (dx * dx + dy * dy <= (e.r + player.r * 0.72) * (e.r + player.r * 0.72)) {
          e.hit = true;
          if (e.kind === "cp" && e.reward) awardRef.current(e.reward);
          else if (e.kind === "hazard") loseRef.current();
        }
      }
      entities = entities.filter((e) => !e.hit && e.y < H + 40);
      scroll += dt;
    };

    const updateTap = (dt: number) => {
      orbT -= dt;
      const litCount = orbs.filter((o) => o.lit).length;
      if (orbT <= 0 && litCount < 2) {
        orbT = 40 + Math.random() * 40;
        const dark = orbs.filter((o) => !o.lit);
        if (dark.length) { const o = dark[Math.floor(Math.random() * dark.length)]; o.lit = true; o.litAt = performance.now(); o.reward = pickReward(); }
      }
      // Lit orbs that aren't tapped in time cost a life.
      for (const o of orbs) {
        if (o.lit && performance.now() - o.litAt > 1500) { o.lit = false; loseRef.current(); }
      }
    };

    const updateRunner = (dt: number) => {
      const g = Math.max(0.5, H * 0.0016);
      player.vy += g * dt;
      player.y += player.vy * dt;
      const groundY = H * 0.78;
      // Gaps in the ground.
      scroll += (3 + Math.min(6, scroll * 0.0004)) * dt;
      if (gapAt < 0 && Math.random() < 0.012 * dt) gapAt = W + 40;
      if (gapAt >= 0) { gapAt -= (3 + Math.min(6, scroll * 0.0004)) * dt; if (gapAt < -80) gapAt = -1; }
      const overGap = gapAt >= 0 && Math.abs(player.x - gapAt) < 46;
      if (player.y >= groundY - player.r) {
        if (overGap) {
          // fell in the gap
          if (player.y > H + 40) { loseRef.current(); player.y = groundY - player.r; player.vy = 0; player.onGround = true; gapAt = -1; }
        } else {
          player.y = groundY - player.r; player.vy = 0; player.onGround = true;
        }
      }
      // Floating CP tokens to grab mid-air.
      spawnT -= dt;
      if (spawnT <= 0) {
        spawnT = 40 + Math.random() * 40;
        entities.push({ x: W + 20, y: groundY - player.r - (30 + Math.random() * 90), vx: -(3 + Math.min(6, scroll * 0.0004)), vy: 0, r: Math.max(11, Math.min(W, H) * 0.04), kind: "cp", reward: pickReward(), born: performance.now() });
      }
      for (const e of entities) { e.x += e.vx * dt; }
      for (const e of entities) {
        if (e.hit) continue;
        const dx = e.x - player.x, dy = e.y - player.y;
        if (dx * dx + dy * dy <= (e.r + player.r * 0.7) * (e.r + player.r * 0.7)) { e.hit = true; if (e.reward) awardRef.current(e.reward); }
      }
      entities = entities.filter((e) => !e.hit && e.x > -40);
    };

    // ---- draw helpers ----
    const drawSprite = (x: number, y: number, r: number) => {
      if (spriteOk) ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
      else { ctx.beginPath(); ctx.fillStyle = quest.accent2; ctx.arc(x, y, r * 0.7, 0, Math.PI * 2); ctx.fill(); }
    };
    const token = (x: number, y: number, r: number, color: string, glow = true) => {
      if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 14; }
      ctx.beginPath(); ctx.fillStyle = color; ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const k = stateRef.current.kind;
      if (k === "runner") {
        // ground line with a gap
        const groundY = H * 0.78;
        ctx.strokeStyle = quest.accent2; ctx.globalAlpha = 0.5; ctx.lineWidth = 3;
        ctx.beginPath();
        if (gapAt >= 0) { ctx.moveTo(0, groundY); ctx.lineTo(gapAt - 46, groundY); ctx.moveTo(gapAt + 46, groundY); ctx.lineTo(W, groundY); }
        else { ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); }
        ctx.stroke(); ctx.globalAlpha = 1;
      }
      for (const e of entities) token(e.x, e.y, e.r, e.kind === "hazard" ? "#f43f5e" : quest.color);
      if (k === "tap") {
        for (const o of orbs) {
          ctx.globalAlpha = o.lit ? 1 : 0.32;
          token(o.x, o.y, o.r, o.lit ? quest.accent2 : "#7c7c9a", o.lit);
          ctx.globalAlpha = 1;
        }
      }
      drawSprite(player.x, player.y, player.r);
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const runningNow = stateRef.current.running;
      if (runningNow && !started) { started = true; reset(); }
      if (!runningNow) { started = false; last = now; draw(); return; }
      acc += Math.min(64, now - last); last = now;
      while (acc >= STEP) {
        const dt = 1; // fixed step units
        const k = stateRef.current.kind;
        if (k === "collect") updateCollectDodge(dt, false);
        else if (k === "dodge") updateCollectDodge(dt, true);
        else if (k === "tap") updateTap(dt);
        else if (k === "runner") updateRunner(dt);
        acc -= STEP;
      }
      draw();
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
    // Rebuild the engine only when the sprite or quest identity changes; `kind`
    // is read live from stateRef so switching variations mid-session is instant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spriteUrl, quest.key]);
}
