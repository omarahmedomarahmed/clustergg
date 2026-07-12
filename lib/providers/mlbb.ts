// Mobile Legends client — talks to OUR self-hosted copy of the community
// api-mobilelegends wrapper (https://github.com/ridwaanhall/api-mobilelegends),
// configured via MLBB_API_BASE. Tokens live only on our own Vercel instance.
//
// Two-step account linking (no password ever touches Cluster):
//   1) sendVerificationCode(roleId, zoneId) → Moonton mails a code in-game
//   2) login(roleId, zoneId, vc) → returns an access token we store encrypted
// Stats are then pulled with that token. When it expires, the account is flagged
// for reconnect but all previously synced stats stay in the database.

const UA = { "User-Agent": "ClusterGG/1.0 (clustergg.com)" };

function base(): string | null {
  let b = process.env.MLBB_API_BASE?.trim().replace(/\/+$/, "");
  if (!b) return null;
  // Tolerate a bare host (no scheme) — fetch() needs an absolute URL.
  if (!/^https?:\/\//i.test(b)) b = `https://${b}`;
  return b;
}

export function isMlbbConfigured(): boolean {
  return !!base();
}

async function call<T = any>(
  path: string,
  init: RequestInit & { token?: string } = {},
  timeoutMs = 12000
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const b = base();
  if (!b) return { ok: false, status: 0, error: "MLBB_API_BASE not configured" };
  try {
    const headers: Record<string, string> = { ...UA, Accept: "application/json", ...(init.headers as Record<string, string> ?? {}) };
    if (init.token) headers.Authorization = `Bearer ${init.token}`;
    if (init.body) headers["Content-Type"] = "application/json";
    const res = await fetch(`${b}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    const text = await res.text();
    let json: any = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    if (!res.ok) {
      const msg = json?.detail || json?.message || json?.error || `HTTP ${res.status}`;
      return { ok: false, status: res.status, error: String(msg).slice(0, 200) };
    }
    return { ok: true, data: json as T };
  } catch (e) {
    return { ok: false, status: 0, error: String(e).slice(0, 200) };
  }
}

export async function sendVerificationCode(roleId: string, zoneId: string) {
  return call("/user/auth/send-vc", {
    method: "POST",
    body: JSON.stringify({ role_id: roleId, zone_id: zoneId }),
  });
}

export type MlbbLogin = { token: string; name?: string };

// Digs a bearer token out of whatever envelope the wrapper returns.
function extractToken(data: any): string | undefined {
  return data?.access_token ?? data?.token ?? data?.data?.access_token ?? data?.data?.token ?? data?.jwt;
}

export async function login(roleId: string, zoneId: string, vc: string):
  Promise<{ ok: true; login: MlbbLogin } | { ok: false; error: string }> {
  const r = await call<any>("/user/auth/login", {
    method: "POST",
    body: JSON.stringify({ role_id: roleId, zone_id: zoneId, vc }),
  });
  if (!r.ok) return { ok: false, error: r.error };
  const token = extractToken(r.data);
  if (!token) return { ok: false, error: "Login succeeded but no token was returned" };
  const name = r.data?.data?.name ?? r.data?.name ?? r.data?.data?.nickname;
  return { ok: true, login: { token, name } };
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};

// Deep-scan a nested object for the first numeric value under any of the given keys.
function findNum(obj: any, keys: string[]): number | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of Object.keys(obj)) {
    if (keys.includes(k.toLowerCase())) {
      const v = num(obj[k]);
      if (v != null) return v;
    }
  }
  for (const k of Object.keys(obj)) {
    if (obj[k] && typeof obj[k] === "object") {
      const v = findNum(obj[k], keys);
      if (v != null) return v;
    }
  }
  return undefined;
}

function findStr(obj: any, keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of Object.keys(obj)) {
    if (keys.includes(k.toLowerCase()) && typeof obj[k] === "string" && obj[k]) return obj[k];
  }
  for (const k of Object.keys(obj)) {
    if (obj[k] && typeof obj[k] === "object") {
      const v = findStr(obj[k], keys);
      if (v) return v;
    }
  }
  return undefined;
}

export type MlbbStats = {
  name?: string;
  rankLabel?: string;
  metrics: Record<string, number>;
  raw: { info?: unknown; stats?: unknown };
};

// Returns parsed stats, or a sentinel telling the caller the token expired so
// the account can be flagged WITHOUT touching already-stored progress.
export async function fetchMlbbStats(token: string):
  Promise<{ ok: true; stats: MlbbStats } | { ok: false; error: string; authExpired: boolean }> {
  const [info, stats] = await Promise.all([
    call<any>("/user/info", { token }),
    call<any>("/user/stats", { token }),
  ]);

  const authExpired = (!info.ok && (info.status === 401 || info.status === 403)) ||
    (!stats.ok && (stats.status === 401 || stats.status === 403));
  if (!info.ok && !stats.ok) {
    return { ok: false, error: info.error, authExpired };
  }

  const infoData = info.ok ? info.data : {};
  const statsData = stats.ok ? stats.data : {};
  const both = { info: infoData, stats: statsData };

  const wins = findNum(statsData, ["wins", "win", "total_wins"]) ?? findNum(infoData, ["wins", "win"]);
  const matches = findNum(statsData, ["matches", "match", "total_matches", "games"]);
  let winRate = findNum(statsData, ["win_rate", "winrate", "win_ratio"]);
  if (winRate != null && winRate <= 1) winRate = Math.round(winRate * 1000) / 10;
  if (winRate == null && wins != null && matches && matches > 0) winRate = Math.round((wins / matches) * 1000) / 10;

  const metrics: Record<string, number> = {};
  const put = (k: string, v: number | undefined) => { if (v != null) metrics[k] = v; };
  put("level", findNum(infoData, ["level", "account_level"]));
  put("wins", wins);
  put("matches", matches);
  put("win_rate", winRate);
  put("mvp", findNum(statsData, ["mvp", "mvp_count", "mvp_times"]));

  return {
    ok: true,
    stats: {
      name: findStr(infoData, ["name", "nickname", "username"]),
      rankLabel: findStr(infoData, ["rank", "rank_name", "tier"]),
      metrics,
      raw: both,
    },
  };
}
