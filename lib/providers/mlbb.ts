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

// All wrapper user endpoints live under the absolute prefix /api/user (from the
// FastAPI router: APIRouter(prefix="/api/user")). We normalize MLBB_API_BASE to
// the domain ROOT — stripping any trailing /api the user may (or may not) have
// added — then build the exact /api/user/... path ourselves. This makes the
// integration work whether the env var is "https://host" or "https://host/api".
function base(): string | null {
  let b = process.env.MLBB_API_BASE?.trim();
  if (!b) return null;
  if (!/^https?:\/\//i.test(b)) b = `https://${b}`;     // tolerate a bare host
  b = b.replace(/\/+$/, "");                             // drop trailing slashes
  b = b.replace(/\/api(\/v\d+)?$/i, "");                 // drop a trailing /api or /api/v2
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
      return { ok: false, status: res.status, error: readableError(json, res.status) };
    }
    return { ok: true, data: json as T };
  } catch (e) {
    return { ok: false, status: 0, error: String(e).slice(0, 200) };
  }
}

// FastAPI's error `detail` may be a string OR an array of {loc,msg,type}. Turn
// either into a human-readable line so the UI never shows "[object Object]".
function readableError(json: any, status: number): string {
  const d = json?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    const parts = d.map((e) => (typeof e === "string" ? e : e?.msg || JSON.stringify(e))).filter(Boolean);
    if (parts.length) return parts.join("; ").slice(0, 220);
  }
  const m = json?.message || json?.error || json?.raw;
  if (typeof m === "string" && m) return m.slice(0, 220);
  if (status >= 500) return `Your MLBB API instance returned ${status} — it likely needs RONE_DEV_ACCESS_KEY set (see notes).`;
  return `HTTP ${status}`;
}

// Params are sent BOTH as query string and JSON body so the call works whether
// the wrapper defines them as query params or a request body.
export async function sendVerificationCode(roleId: string, zoneId: string) {
  const qs = `?role_id=${encodeURIComponent(roleId)}&zone_id=${encodeURIComponent(zoneId)}`;
  return call(`/api/user/auth/send-vc${qs}`, {
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
  const qs = `?role_id=${encodeURIComponent(roleId)}&zone_id=${encodeURIComponent(zoneId)}&vc=${encodeURIComponent(vc)}`;
  const r = await call<any>(`/api/user/auth/login${qs}`, {
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
    call<any>("/api/user/info", { token }),
    call<any>("/api/user/stats", { token }),
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
