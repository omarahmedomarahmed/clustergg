// A generic "game world" catalogue: the champions / heroes / agents / weapons a
// game is built from, with art + lore. One shape fits every game so the planet
// directory renders identically; games we have no catalogue for return [] and
// the UI hides the section. All sources are free/public and cached in-process.

export type EntityKind = "champion" | "hero" | "agent" | "weapon" | "outfit";
export type EntityLite = { id: string; kind: EntityKind; name: string; image: string; role: string | null; tags: string[] };
export type EntityAbility = { name: string; icon: string | null; desc: string };
export type EntitySkin = { name: string; image: string };
export type EntityDetail = EntityLite & { splash: string | null; lore: string | null; abilities: EntityAbility[]; skins: EntitySkin[]; meta: { label: string; value: string }[] };

type Cache<T> = { v: T; exp: number } | null;
async function pj<T = any>(url: string, ms = 8000): Promise<T> {
  const r = await fetch(url, { headers: { "User-Agent": "ClusterGG/1.0 (clustergg.com)" }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}
const TTL = 12 * 3600_000;

// Which games have a catalogue (used to decide whether to show the section).
export function gameHasDirectory(game: string | null | undefined): boolean {
  return !!game && ["League of Legends", "VALORANT", "Dota 2", "Fortnite"].includes(game);
}

// ---------- League of Legends (Data Dragon) ----------
let lolCache: Cache<{ version: string; champs: Record<string, any> }> = null;
async function lolData() {
  if (lolCache && lolCache.exp > Date.now()) return lolCache.v;
  const versions = await pj<string[]>("https://ddragon.leagueoflegends.com/api/versions.json");
  const version = versions[0] ?? "14.1.1";
  const full = await pj<any>(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/championFull.json`);
  const v = { version, champs: full.data ?? {} };
  lolCache = { v, exp: Date.now() + TTL };
  return v;
}
const lolIcon = (v: string, id: string) => `https://ddragon.leagueoflegends.com/cdn/${v}/img/champion/${id}.png`;
const lolSplash = (id: string) => `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${id}_0.jpg`;

// ---------- VALORANT (valorant-api.com — free, no key) ----------
let valAgentsCache: Cache<any[]> = null;
let valWeaponsCache: Cache<any[]> = null;
async function valAgents() {
  if (valAgentsCache && valAgentsCache.exp > Date.now()) return valAgentsCache.v;
  const r = await pj<any>("https://valorant-api.com/v1/agents?isPlayableCharacter=true");
  const v = (r.data ?? []).filter((a: any) => a.isPlayableCharacter);
  valAgentsCache = { v, exp: Date.now() + TTL };
  return v;
}
async function valWeapons() {
  if (valWeaponsCache && valWeaponsCache.exp > Date.now()) return valWeaponsCache.v;
  const r = await pj<any>("https://valorant-api.com/v1/weapons");
  const v = r.data ?? [];
  valWeaponsCache = { v, exp: Date.now() + TTL };
  return v;
}

// ---------- Fortnite (fortnite-api.com — free cosmetics catalogue) ----------
let fnCache: Cache<any[]> = null;
async function fnOutfits() {
  if (fnCache && fnCache.exp > Date.now()) return fnCache.v;
  const r = await pj<any>("https://fortnite-api.com/v2/cosmetics/br", 10000);
  const v = (r.data ?? []).filter((c: any) => c?.type?.value === "outfit" && (c.images?.icon || c.images?.smallIcon));
  fnCache = { v, exp: Date.now() + TTL };
  return v;
}

// ---------- Dota 2 (OpenDota) ----------
let dotaCache: Cache<any[]> = null;
async function dotaHeroes() {
  if (dotaCache && dotaCache.exp > Date.now()) return dotaCache.v;
  const v = await pj<any[]>("https://api.opendota.com/api/heroes");
  dotaCache = { v, exp: Date.now() + TTL };
  return v;
}
const dotaImg = (name: string) => `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${name.replace("npc_dota_hero_", "")}.png`;
const dotaVert = (name: string) => `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${name.replace("npc_dota_hero_", "")}_vert.jpg`;

// ---------- Public API ----------
export async function getEntityList(game: string): Promise<EntityLite[]> {
  try {
    if (game === "League of Legends") {
      const { version, champs } = await lolData();
      return Object.values<any>(champs).map((c): EntityLite => ({ id: c.id, kind: "champion", name: c.name, image: lolIcon(version, c.id), role: (c.tags ?? [])[0] ?? null, tags: c.tags ?? [] }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    if (game === "VALORANT") {
      const [agents, weapons] = await Promise.all([valAgents(), valWeapons()]);
      const a: EntityLite[] = agents.map((x: any) => ({ id: x.uuid, kind: "agent", name: x.displayName, image: x.displayIcon || x.killfeedPortrait, role: x.role?.displayName ?? null, tags: x.role?.displayName ? [x.role.displayName] : [] }));
      const w: EntityLite[] = weapons.map((x: any) => ({ id: x.uuid, kind: "weapon", name: x.displayName, image: x.displayIcon, role: x.shopData?.categoryText ?? x.category?.split("::").pop() ?? null, tags: [] }));
      return [...a.sort((x, y) => x.name.localeCompare(y.name)), ...w.filter((x) => x.image).sort((x, y) => x.name.localeCompare(y.name))];
    }
    if (game === "Dota 2") {
      const heroes = await dotaHeroes();
      return heroes.map((h: any): EntityLite => ({ id: String(h.id), kind: "hero", name: h.localized_name, image: dotaImg(h.name), role: h.primary_attr === "str" ? "Strength" : h.primary_attr === "agi" ? "Agility" : h.primary_attr === "int" ? "Intelligence" : "Universal", tags: h.roles ?? [] }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    if (game === "Fortnite") {
      const outfits = await fnOutfits();
      return outfits.map((c: any): EntityLite => ({ id: c.id, kind: "outfit", name: c.name, image: c.images.icon || c.images.smallIcon, role: c.rarity?.displayValue ?? null, tags: c.rarity?.displayValue ? [c.rarity.displayValue] : [] }))
        .sort((a: EntityLite, b: EntityLite) => a.name.localeCompare(b.name));
    }
  } catch { /* fall through */ }
  return [];
}

export async function getEntityDetail(game: string, kind: string, id: string): Promise<EntityDetail | null> {
  try {
    if (game === "League of Legends") {
      const { version, champs } = await lolData();
      const c = champs[id]; if (!c) return null;
      return {
        id: c.id, kind: "champion", name: c.name, image: lolIcon(version, c.id), splash: lolSplash(c.id),
        role: (c.tags ?? [])[0] ?? null, tags: c.tags ?? [], lore: c.lore || c.blurb || null,
        abilities: [
          ...(c.passive ? [{ name: c.passive.name, icon: `https://ddragon.leagueoflegends.com/cdn/${version}/img/passive/${c.passive.image?.full}`, desc: strip(c.passive.description) }] : []),
          ...((c.spells ?? []).map((s: any) => ({ name: s.name, icon: `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${s.image?.full}`, desc: strip(s.description) }))),
        ],
        skins: (c.skins ?? []).filter((s: any) => s.num !== 0 || (c.skins ?? []).length === 1).map((s: any) => ({ name: s.name === "default" ? c.name : s.name, image: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${c.id}_${s.num}.jpg` })),
        meta: [{ label: "Title", value: c.title ?? "" }, { label: "Difficulty", value: `${c.info?.difficulty ?? "?"}/10` }, { label: "Roles", value: (c.tags ?? []).join(", ") }],
      };
    }
    if (game === "VALORANT" && kind === "agent") {
      const a = (await valAgents()).find((x: any) => x.uuid === id); if (!a) return null;
      return {
        id: a.uuid, kind: "agent", name: a.displayName, image: a.displayIcon, splash: a.fullPortrait || a.background || null,
        role: a.role?.displayName ?? null, tags: a.role?.displayName ? [a.role.displayName] : [], lore: a.description || null,
        abilities: (a.abilities ?? []).filter((ab: any) => ab.displayName).map((ab: any) => ({ name: `${ab.slot ? ab.slot + ": " : ""}${ab.displayName}`, icon: ab.displayIcon ?? null, desc: strip(ab.description) })),
        skins: [],
        meta: [{ label: "Role", value: a.role?.displayName ?? "" }],
      };
    }
    if (game === "VALORANT" && kind === "weapon") {
      const w = (await valWeapons()).find((x: any) => x.uuid === id); if (!w) return null;
      const stats = w.weaponStats;
      return {
        id: w.uuid, kind: "weapon", name: w.displayName, image: w.displayIcon, splash: w.displayIcon,
        role: w.shopData?.categoryText ?? null, tags: [], lore: null, abilities: [],
        skins: (w.skins ?? []).map((s: any) => ({ name: s.displayName, image: s.displayIcon || s.chromas?.[0]?.fullRender || s.chromas?.[0]?.displayIcon || s.levels?.[0]?.displayIcon })).filter((s: any) => s.image).slice(0, 40),
        meta: [
          { label: "Cost", value: w.shopData?.cost != null ? `${w.shopData.cost} creds` : "—" },
          { label: "Fire rate", value: stats?.fireRate != null ? `${stats.fireRate}/s` : "—" },
          { label: "Magazine", value: stats?.magazineSize != null ? String(stats.magazineSize) : "—" },
          { label: "Category", value: w.shopData?.categoryText ?? "" },
        ],
      };
    }
    if (game === "Dota 2") {
      const h = (await dotaHeroes()).find((x: any) => String(x.id) === id); if (!h) return null;
      const attr = h.primary_attr === "str" ? "Strength" : h.primary_attr === "agi" ? "Agility" : h.primary_attr === "int" ? "Intelligence" : "Universal";
      return {
        id: String(h.id), kind: "hero", name: h.localized_name, image: dotaImg(h.name), splash: dotaVert(h.name),
        role: attr, tags: h.roles ?? [], lore: null, abilities: [], skins: [],
        meta: [{ label: "Primary attribute", value: attr }, { label: "Attack", value: h.attack_type ?? "" }, { label: "Roles", value: (h.roles ?? []).join(", ") }],
      };
    }
    if (game === "Fortnite") {
      const c = (await fnOutfits()).find((x: any) => x.id === id); if (!c) return null;
      // Each style variant becomes a selectable "skin".
      const variantSkins: EntitySkin[] = (c.variants ?? []).flatMap((v: any) => (v.options ?? []).map((o: any) => ({ name: o.name || v.type || "Style", image: o.image })).filter((s: EntitySkin) => s.image)).slice(0, 40);
      return {
        id: c.id, kind: "outfit", name: c.name, image: c.images.icon || c.images.smallIcon, splash: c.images.featured || c.images.icon,
        role: c.rarity?.displayValue ?? null, tags: c.rarity?.displayValue ? [c.rarity.displayValue] : [],
        lore: [c.description, c.introduction?.text].filter(Boolean).join("\n\n") || null, abilities: [], skins: variantSkins,
        meta: [
          { label: "Rarity", value: c.rarity?.displayValue ?? "" },
          { label: "Set", value: c.set?.value ?? "" },
          { label: "Introduced", value: c.introduction?.text ?? "" },
          { label: "Released", value: c.added ? new Date(c.added).toLocaleDateString() : "" },
        ],
      };
    }
  } catch { /* fall through */ }
  return null;
}

// Strip Riot/Valorant inline markup from ability/lore descriptions.
function strip(s: string | null | undefined): string {
  return (s ?? "").replace(/<[^>]+>/g, "").replace(/\{\{[^}]+\}\}/g, "").replace(/\s+/g, " ").trim();
}
