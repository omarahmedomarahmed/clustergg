// A generic "game world" catalogue: the champions / heroes / agents / weapons a
// game is built from, with art + lore. One shape fits every game so the planet
// directory renders identically; games we have no catalogue for return [] and
// the UI hides the section. All sources are free/public and cached in-process.

export type EntityKind = "champion" | "hero" | "agent" | "weapon" | "outfit" | "legend" | "map";
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
  return !!game && ["League of Legends", "VALORANT", "Dota 2", "Fortnite", "Apex Legends", "PUBG"].includes(game);
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

// ---------- Static catalogues (Apex Legends, PUBG) ----------
// No clean free art/data CDN exists for these, so the roster + lore + stats are
// curated in-code (never calls out, so it's instant and never rate-limited).
// Entities with no `image` render a gradient/initials tile client-side.
const HF = "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082";
type StaticEntity = {
  id: string; name: string; role: string; tags?: string[]; image?: string; splash?: string;
  lore?: string; abilities?: EntityAbility[]; meta?: { label: string; value: string }[];
};
const ab = (name: string, desc: string): EntityAbility => ({ name, icon: null, desc });
function toLite(s: StaticEntity, kind: EntityKind): EntityLite {
  return { id: s.id, kind, name: s.name, image: s.image ?? "", role: s.role || null, tags: s.tags ?? (s.role ? [s.role] : []) };
}
function toDetail(s: StaticEntity, kind: EntityKind): EntityDetail {
  return {
    id: s.id, kind, name: s.name, image: s.image ?? "", splash: s.splash ?? s.image ?? null,
    role: s.role || null, tags: s.tags ?? (s.role ? [s.role] : []), lore: s.lore ?? null,
    abilities: s.abilities ?? [], skins: [], meta: s.meta ?? [],
  };
}

// Apex Legends — full roster with class, real name, homeworld + P/T/U kit.
const APEX_LEGENDS: StaticEntity[] = [
  { id: "wraith", name: "Wraith", role: "Skirmisher", lore: "An Interdimensional Skirmisher who hears voices from the Void warning her of danger. Renee Blasey woke in an IMC detention facility with no memory of her past.", meta: [{ label: "Class", value: "Skirmisher" }, { label: "Real name", value: "Renee Blasey" }, { label: "Homeworld", value: "Typhon" }], abilities: [ab("Passive · Voices from the Void", "A voice warns you when danger approaches."), ab("Tactical · Into the Void", "Reposition quickly through the safety of void space, avoiding all damage."), ab("Ultimate · Dimensional Rift", "Link two locations with portals for 60 seconds.")] },
  { id: "bangalore", name: "Bangalore", role: "Assault", lore: "A professional soldier, Anita Williams was stranded in the Outlands and joined the Apex Games to earn her way home to her family.", meta: [{ label: "Class", value: "Assault" }, { label: "Real name", value: "Anita Williams" }, { label: "Homeworld", value: "Gridiron" }], abilities: [ab("Passive · Double Time", "Taking fire while sprinting makes you move faster for a brief time."), ab("Tactical · Smoke Launcher", "Fire a high-velocity smoke canister that bursts into a smoke wall on impact."), ab("Ultimate · Rolling Thunder", "Call in an artillery strike that slowly creeps across the landscape.")] },
  { id: "bloodhound", name: "Bloodhound", role: "Recon", lore: "A mysterious Technological Tracker who follows the Old Ways and hunts as the Allfather's blessing guides them.", meta: [{ label: "Class", value: "Recon" }, { label: "Homeworld", value: "Talos" }], abilities: [ab("Passive · Tracker", "Foes leave behind clues for you to track."), ab("Tactical · Eye of the Allfather", "Briefly reveal enemies, traps and clues through structures in front of you."), ab("Ultimate · Beast of the Hunt", "Heighten your senses, see cold tracks and move faster.")] },
  { id: "gibraltar", name: "Gibraltar", role: "Support", lore: "A shielded fortress and search-and-rescue hero, Makoa Gibraltar protects those who need it most.", meta: [{ label: "Class", value: "Support" }, { label: "Real name", value: "Makoa Gibraltar" }, { label: "Homeworld", value: "Solace" }], abilities: [ab("Passive · Gun Shield", "Aiming down sights deploys a gun shield that blocks incoming fire."), ab("Tactical · Dome of Protection", "Throw down a dome-shield that blocks attacks for 12 seconds."), ab("Ultimate · Defensive Bombardment", "Call in a concentrated mortar strike on a marked position.")] },
  { id: "lifeline", name: "Lifeline", role: "Support", lore: "Combat medic Ajay Che uses her drone D.O.C. to keep the squad alive and calls in care packages under fire.", meta: [{ label: "Class", value: "Support" }, { label: "Real name", value: "Ajay Che" }, { label: "Homeworld", value: "Solace" }], abilities: [ab("Passive · Combat Revive", "D.O.C. revives knocked teammates so you can keep fighting."), ab("Tactical · D.O.C. Heal Drone", "Deploy a drone that heals nearby teammates over time."), ab("Ultimate · Care Package", "Call in a drop pod full of defensive gear.")] },
  { id: "pathfinder", name: "Pathfinder", role: "Skirmisher", lore: "A forward scout MRVN who joined the Games to find the creator who built him.", meta: [{ label: "Class", value: "Skirmisher" }, { label: "Real name", value: "MRVN" }], abilities: [ab("Passive · Insider Knowledge", "Scan a survey beacon to reveal the ring's next location and reduce your tactical cooldown."), ab("Tactical · Grappling Hook", "Grapple to reach out-of-the-way places quickly."), ab("Ultimate · Zipline Gun", "Create a zipline for everyone to use.")] },
  { id: "caustic", name: "Caustic", role: "Controller", lore: "The toxic trapper Alexander Nox tests his Nox gas on his opponents in the Games.", meta: [{ label: "Class", value: "Controller" }, { label: "Real name", value: "Alexander Nox" }, { label: "Homeworld", value: "Gaea" }], abilities: [ab("Passive · Nox Vision", "You see enemies through your gas."), ab("Tactical · Nox Gas Trap", "Place canisters that release deadly Nox gas when shot or triggered."), ab("Ultimate · Nox Gas Grenade", "Blanket a large area in Nox gas.")] },
  { id: "mirage", name: "Mirage", role: "Skirmisher", lore: "The holographic trickster Elliott Witt bamboozles enemies with an army of decoys.", meta: [{ label: "Class", value: "Skirmisher" }, { label: "Real name", value: "Elliott Witt" }, { label: "Homeworld", value: "Solace" }], abilities: [ab("Passive · Now You See Me…", "Automatically cloak when using a Respawn Beacon and while reviving."), ab("Tactical · Psyche Out", "Send out a holographic decoy to confuse enemies."), ab("Ultimate · Life of the Party", "Deploy a team of controllable decoys.")] },
  { id: "octane", name: "Octane", role: "Skirmisher", lore: "Adrenaline junkie Octavio Silva blew off his own legs for a highlight reel and now runs faster than anyone.", meta: [{ label: "Class", value: "Skirmisher" }, { label: "Real name", value: "Octavio Silva" }, { label: "Homeworld", value: "Psamathe" }], abilities: [ab("Passive · Swift Mend", "Automatically restore health over time."), ab("Tactical · Stim", "Move 30% faster for six seconds. Costs health to use."), ab("Ultimate · Launch Pad", "Deploy a jump pad that flings teammates through the air.")] },
  { id: "wattson", name: "Wattson", role: "Controller", lore: "Natalie Paquette, daughter of the Games' lead electrical engineer, fortifies positions with electric fences.", meta: [{ label: "Class", value: "Controller" }, { label: "Real name", value: "Natalie Paquette" }, { label: "Homeworld", value: "Solace" }], abilities: [ab("Passive · Spark of Genius", "Ult Accelerants fully charge your ultimate; nearby pylons regen shields."), ab("Tactical · Perimeter Security", "Connect nodes into electrified fences that damage and slow enemies."), ab("Ultimate · Interception Pylon", "Build a pylon that destroys incoming ordnance and repairs shields.")] },
  { id: "crypto", name: "Crypto", role: "Recon", lore: "Surveillance expert Tae Joon Park watches the battlefield through his aerial drone while hiding from those who framed him.", meta: [{ label: "Class", value: "Recon" }, { label: "Real name", value: "Tae Joon Park" }, { label: "Homeworld", value: "Gaea" }], abilities: [ab("Passive · Neurolink", "You and your team see what the drone detects within 30m."), ab("Tactical · Surveillance Drone", "Pilot an aerial camera drone."), ab("Ultimate · Drone EMP", "Charge an EMP that damages shields, slows enemies and disables traps.")] },
  { id: "revenant", name: "Revenant", role: "Skirmisher", lore: "A murderous simulacrum reborn in a synthetic nightmare body, hunting those who made him.", meta: [{ label: "Class", value: "Skirmisher" }, { label: "Real name", value: "Kaleb Cross" }], abilities: [ab("Passive · Assassin's Instinct", "See nearby low-health enemies highlighted; climb higher and faster."), ab("Tactical · Shadow Pounce", "Unleash a powerful pounce forward. Hold to charge farther."), ab("Ultimate · Forged Shadows", "Deploy a hardlight shroud that blocks damage and refreshes on knocks.")] },
  { id: "loba", name: "Loba", role: "Support", lore: "High-society thief Loba Andrade steals the Outlands' finest loot to hunt down Revenant.", meta: [{ label: "Class", value: "Support" }, { label: "Real name", value: "Loba Andrade" }], abilities: [ab("Passive · Eye for Quality", "See nearby epic and legendary loot through walls."), ab("Tactical · Burglar's Best Friend", "Teleport with a jump-drive bracelet to reach loot and high ground."), ab("Ultimate · Black Market Boutique", "Deploy a device that lets your squad grab nearby loot.")] },
  { id: "rampart", name: "Rampart", role: "Controller", lore: "Modding genius Ramya Parekh builds amped cover and mows enemies down with her minigun Sheila.", meta: [{ label: "Class", value: "Controller" }, { label: "Real name", value: "Ramya Parekh" }], abilities: [ab("Passive · Modded Loader", "Bigger magazines and faster reloads with LMGs and the minigun."), ab("Tactical · Amped Cover", "Build a wall that blocks incoming shots and amps outgoing ones."), ab("Ultimate · Emplaced Minigun “Sheila”", "Place a mounted minigun anyone can use.")] },
  { id: "horizon", name: "Horizon", role: "Skirmisher", lore: "Astrophysicist Dr. Mary Somers manipulates gravity after being betrayed and lost in a black hole.", meta: [{ label: "Class", value: "Skirmisher" }, { label: "Real name", value: "Mary Somers" }, { label: "Homeworld", value: "Psamathe" }], abilities: [ab("Passive · Spacewalk", "Increase air control and reduce fall impact with your spacesuit."), ab("Tactical · Gravity Lift", "Reverse gravity to lift players up, then boost them out the top."), ab("Ultimate · Black Hole", "Deploy N.E.W.T. to spawn a micro black hole that pulls enemies in.")] },
  { id: "fuse", name: "Fuse", role: "Assault", lore: "Explosives-loving mercenary Walter Fitzroy from the lawless moon of Salvo lives to make things go boom.", meta: [{ label: "Class", value: "Assault" }, { label: "Real name", value: "Walter Fitzroy" }, { label: "Homeworld", value: "Salvo" }], abilities: [ab("Passive · Grenadier", "Stack more grenades per slot and throw them farther and faster."), ab("Tactical · Knuckle Cluster", "Launch a cluster bomb that expels airburst explosives."), ab("Ultimate · The Motherlode", "Bombard a target area with an encircling wall of flame.")] },
  { id: "valkyrie", name: "Valkyrie", role: "Skirmisher", lore: "Kairi Imahara, daughter of Titan pilot Viper, took to the skies with a jetpack built from her father's Titan.", meta: [{ label: "Class", value: "Skirmisher" }, { label: "Real name", value: "Kairi Imahara" }, { label: "Homeworld", value: "Angelia" }], abilities: [ab("Passive · VTOL Jets", "Press jump while airborne to engage your jetpack."), ab("Tactical · Missile Swarm", "Fire a swarm of mini-rockets that damage and disorient."), ab("Ultimate · Skyward Dive", "Launch into the air and skydive; teammates can join.")] },
  { id: "seer", name: "Seer", role: "Recon", lore: "Ambush artist Obi Edolasim uses micro-drones to hunt his prey and prove the doubters wrong.", meta: [{ label: "Class", value: "Recon" }, { label: "Homeworld", value: "Boreas" }], abilities: [ab("Passive · Heart Seeker", "Sense the heartbeats of nearby enemies while aiming down sights."), ab("Tactical · Focus of Attention", "Summon micro-drones to interrupt, reveal and briefly damage."), ab("Ultimate · Exhibit", "Create a sphere of micro-drones that reveals moving enemies inside.")] },
  { id: "ash", name: "Ash", role: "Assault", lore: "A simulacrum built from the mind of the late Dr. Ashleigh Reid, cold and precise, opening rifts across the arena.", meta: [{ label: "Class", value: "Assault" }, { label: "Real name", value: "Dr. Ashleigh Reid" }], abilities: [ab("Passive · Marked for Death", "Your map shows recent death boxes; interrogate survivors to reveal foes."), ab("Tactical · Arc Snare", "Throw a spinning snare that damages and tethers nearby enemies."), ab("Ultimate · Phase Breach", "Tear open a one-way portal to a targeted location.")] },
  { id: "mad-maggie", name: "Mad Maggie", role: "Assault", lore: "Salvo warlord Margaret Kōhere, Fuse's old friend turned rival, plays fast and aggressive.", meta: [{ label: "Class", value: "Assault" }, { label: "Real name", value: "Margaret Kōhere" }, { label: "Homeworld", value: "Salvo" }], abilities: [ab("Passive · Warlord's Ire", "Briefly highlight enemies you damage; move faster holding a shotgun."), ab("Tactical · Riot Drill", "Fire a drill that burns enemies behind cover."), ab("Ultimate · Wrecking Ball", "Release a ball that drops speed pads and detonates near enemies.")] },
  { id: "newcastle", name: "Newcastle", role: "Support", lore: "The heroic bodyguard Jackson Williams — Bangalore's long-lost brother — shields the fallen behind mobile walls.", meta: [{ label: "Class", value: "Support" }, { label: "Real name", value: "Jackson Williams" }, { label: "Homeworld", value: "Solace" }], abilities: [ab("Passive · Retrieve the Wounded", "Drag downed allies as you revive, protected by your shield."), ab("Tactical · Mobile Shield", "Throw a drone that projects a moving energy shield."), ab("Ultimate · Castle Wall", "Leap to an ally or area and slam down a fortified wall.")] },
  { id: "vantage", name: "Vantage", role: "Recon", lore: "Survivalist sniper Xiomara Contreras grew up alone on the frozen world of Págos with her bat companion Echo.", meta: [{ label: "Class", value: "Recon" }, { label: "Real name", value: "Xiomara Contreras" }, { label: "Homeworld", value: "Págos" }], abilities: [ab("Passive · Spotter's Lens", "Aim to survey distant enemies and get bullet-drop and jump info."), ab("Tactical · Echo Relocation", "Position Echo, then launch yourself to his location."), ab("Ultimate · Sniper's Mark", "Fire a custom sniper that marks targets for bonus damage.")] },
  { id: "catalyst", name: "Catalyst", role: "Controller", lore: "Ferrofluid defender Tressa Smith fortifies ground and blinds attackers with a dark veil.", meta: [{ label: "Class", value: "Controller" }, { label: "Real name", value: "Tressa Smith" }, { label: "Homeworld", value: "Boreas" }], abilities: [ab("Passive · Barricade", "Reinforce doors so they're stronger and locked to enemies."), ab("Tactical · Piercing Spikes", "Throw ferrofluid that forms damaging, slowing spikes."), ab("Ultimate · Dark Veil", "Raise a wall of ferrofluid that blocks vision and impairs enemies who pass.")] },
  { id: "ballistic", name: "Ballistic", role: "Assault", lore: "August Brinkman, a legend from the original Thunderdome era, returns carrying a third slung weapon.", meta: [{ label: "Class", value: "Assault" }, { label: "Real name", value: "August Brinkman" }, { label: "Homeworld", value: "Gridiron" }], abilities: [ab("Passive · Sling", "Carry a third weapon in a sling slot, unaffected by attachments."), ab("Tactical · Whistler", "Fire a projectile that overheats an enemy's gun, hurting them if they keep firing."), ab("Ultimate · Tempest", "Boost your team's move and reload speed and gold your sling weapon.")] },
  { id: "conduit", name: "Conduit", role: "Support", lore: "Rowenna Divjak channels radiant energy to shield her allies from across the battlefield.", meta: [{ label: "Class", value: "Support" }, { label: "Real name", value: "Rowenna Divjak" }, { label: "Homeworld", value: "Solace" }], abilities: [ab("Passive · Savior's Speed", "Gain a speed boost when moving toward distant teammates."), ab("Tactical · Radiant Transfer", "Send shield-regenerating drones to a targeted ally."), ab("Ultimate · Energy Barricade", "Deploy a wall of shield-jamming towers that damage enemies.")] },
  { id: "alter", name: "Alter", role: "Skirmisher", lore: "A being pulled from the Void who bends space to slip through walls and drag loot from other dimensions.", meta: [{ label: "Class", value: "Skirmisher" }, { label: "Homeworld", value: "Boreas" }], abilities: [ab("Passive · Gift from the Rift", "See and grab loot from a random death box through the Void."), ab("Tactical · Void Passage", "Create a two-way passage through a surface."), ab("Ultimate · Void Nexus", "Deploy a portal your team can teleport back to from anywhere.")] },
];

// PUBG maps — with generated aerial splash art for the four flagship battlegrounds.
const PUBG_MAPS: StaticEntity[] = [
  { id: "erangel", name: "Erangel", role: "8×8 km", tags: ["Classic"], image: `${HF}/hf_20260720_030759_1a51629d-2149-4075-bba6-7079e5267163.png`, lore: "The original battleground: an abandoned Eastern-European island of ruined towns, a military base and long-range fields. Where PUBG began.", meta: [{ label: "Size", value: "8×8 km" }, { label: "Terrain", value: "Temperate island" }, { label: "Players", value: "Up to 100" }, { label: "Released", value: "2017" }] },
  { id: "miramar", name: "Miramar", role: "8×8 km", tags: ["Desert"], image: `${HF}/hf_20260720_030805_2dfcfa1d-a4fa-48bd-9dd8-d2f45d9449e4.png`, lore: "A harsh Mexican desert of red-rock canyons, adobe towns and a hilltop city — long sightlines reward the patient sniper.", meta: [{ label: "Size", value: "8×8 km" }, { label: "Terrain", value: "Arid desert" }, { label: "Players", value: "Up to 100" }, { label: "Released", value: "2018" }] },
  { id: "sanhok", name: "Sanhok", role: "4×4 km", tags: ["Jungle"], image: `${HF}/hf_20260720_030813_c227b52b-cd28-441a-aa25-b16631019105.png`, lore: "A dense tropical jungle island packed into 4×4 km for fast, aggressive matches full of ruins, rivers and close-quarter firefights.", meta: [{ label: "Size", value: "4×4 km" }, { label: "Terrain", value: "Tropical jungle" }, { label: "Players", value: "Up to 100" }, { label: "Released", value: "2018" }] },
  { id: "vikendi", name: "Vikendi", role: "6×6 km", tags: ["Snow"], image: `${HF}/hf_20260720_030818_e84869ef-4d23-4633-88b3-6502d81f9ee0.png`, lore: "A snowbound Nordic island where footprints in the fresh snow give away every rotation. Features a frozen lake and an abandoned cosmodrome.", meta: [{ label: "Size", value: "6×6 km" }, { label: "Terrain", value: "Snow / winter" }, { label: "Players", value: "Up to 100" }, { label: "Released", value: "2018" }] },
  { id: "taego", name: "Taego", role: "8×8 km", tags: ["Classic"], lore: "A Korean battleground with the Comeback BR mechanic and unique loot — rolling farmland, a racetrack and a submerged palace.", meta: [{ label: "Size", value: "8×8 km" }, { label: "Terrain", value: "Korean countryside" }, { label: "Released", value: "2021" }] },
  { id: "deston", name: "Deston", role: "8×8 km", tags: ["Modern"], lore: "A flooded near-future city map introducing ascender ropes and blue-chip detectors, from swampland to a towering skyscraper district.", meta: [{ label: "Size", value: "8×8 km" }, { label: "Terrain", value: "Flooded metropolis" }, { label: "Released", value: "2022" }] },
  { id: "rondo", name: "Rondo", role: "8×8 km", tags: ["Modern"], lore: "The newest 8×8 battleground blending a neon-lit city, misty mountains and classic countryside — home of the vintage vehicle set.", meta: [{ label: "Size", value: "8×8 km" }, { label: "Terrain", value: "Mixed / city" }, { label: "Released", value: "2023" }] },
  { id: "karakin", name: "Karakin", role: "2×2 km", tags: ["Small"], lore: "A tiny, brutal North-African island where sticky bombs blow holes through walls and the Black Zone levels buildings.", meta: [{ label: "Size", value: "2×2 km" }, { label: "Terrain", value: "Rocky desert" }, { label: "Released", value: "2020" }] },
];

// PUBG weapons — the working arsenal grouped by category, with ammo + type.
const wpn = (id: string, name: string, cat: string, ammo: string, note = ""): StaticEntity => ({
  id, name, role: cat, tags: [cat], lore: note || undefined,
  meta: [{ label: "Category", value: cat }, { label: "Ammo", value: ammo }],
});
const PUBG_WEAPONS: StaticEntity[] = [
  // Assault Rifles
  wpn("m416", "M416", "Assault Rifle", "5.56mm", "The all-rounder AR — highly customisable and easy to control."),
  wpn("akm", "AKM", "Assault Rifle", "7.62mm", "Hard-hitting but heavy recoil; rewards trigger discipline."),
  wpn("scar-l", "SCAR-L", "Assault Rifle", "5.56mm", "A stable, forgiving rifle for mid-range fights."),
  wpn("m16a4", "M16A4", "Assault Rifle", "5.56mm", "Burst-fire AR with a punishing tap-fire ceiling."),
  wpn("beryl-m762", "Beryl M762", "Assault Rifle", "7.62mm", "The highest DPS AR — vicious recoil to tame."),
  wpn("g36c", "G36C", "Assault Rifle", "5.56mm", "Vikendi-exclusive alternative to the M416."),
  wpn("qbz95", "QBZ95", "Assault Rifle", "5.56mm", "Sanhok's bullpup AR — controllable and mobile."),
  wpn("groza", "Groza", "Assault Rifle", "7.62mm", "Care-package AR: high damage and fast fire rate."),
  wpn("aug", "AUG A3", "Assault Rifle", "5.56mm", "Crate bullpup with excellent stability."),
  wpn("mk47", "Mk47 Mutant", "Assault Rifle", "7.62mm", "Burst/semi hybrid rifle with big damage."),
  wpn("ace32", "ACE32", "Assault Rifle", "7.62mm", "Modern 7.62 AR with balanced handling."),
  wpn("famas", "FAMAS", "Assault Rifle", "5.56mm", "Rondo-exclusive high-fire-rate burst rifle."),
  // SMGs
  wpn("ump45", "UMP45", "SMG", ".45 ACP", "Reliable close-to-mid SMG; forgiving recoil."),
  wpn("vector", "Vector", "SMG", ".45 ACP", "Blistering fire rate — extended mag mandatory."),
  wpn("uzi", "Micro UZI", "SMG", "9mm", "Fastest-firing SMG for point-blank sprays."),
  wpn("mp5k", "MP5K", "SMG", "9mm", "Vikendi SMG with superb control."),
  wpn("bizon", "PP-19 Bizon", "SMG", "9mm", "Huge 53-round mag, no attachments needed."),
  wpn("p90", "P90", "SMG", "5.7mm", "Crate SMG with a 50-round mag and laser accuracy."),
  wpn("thompson", "Tommy Gun", "SMG", ".45 ACP", "Classic 100-round drum SMG (no attachments)."),
  // Sniper Rifles
  wpn("kar98k", "Kar98k", "Sniper Rifle", "7.62mm", "Bolt-action staple — a headshot downs level-2 helmets."),
  wpn("m24", "M24", "Sniper Rifle", "7.62mm", "Faster, flatter bolt-action than the Kar98k."),
  wpn("awm", "AWM", "Sniper Rifle", ".300 Magnum", "Care-package king: one-shots any helmet."),
  wpn("win94", "Win94", "Sniper Rifle", ".45 ACP", "Lever-action rifle with a fixed 2.7x scope."),
  wpn("mosin", "Mosin-Nagant", "Sniper Rifle", "7.62mm", "Kar98k-equivalent bolt-action found in the wild."),
  wpn("lynx", "Lynx AMR", "Sniper Rifle", ".50 cal", "Rondo crate anti-materiel rifle with devastating damage."),
  // DMRs
  wpn("mini14", "Mini 14", "DMR", "5.56mm", "Flat, fast-firing marksman rifle for suppression."),
  wpn("sks", "SKS", "DMR", "7.62mm", "High-damage DMR with heavier recoil."),
  wpn("slr", "SLR", "DMR", "7.62mm", "The DMR sledgehammer — huge per-shot damage."),
  wpn("mk14", "Mk14 EBR", "DMR", "7.62mm", "Crate DMR with a full-auto mode."),
  wpn("qbu", "QBU", "DMR", "5.56mm", "Sanhok DMR with a built-in bipod for prone accuracy."),
  wpn("vss", "VSS", "DMR", "9mm", "Integrally-suppressed DMR with a fixed scope."),
  wpn("dragunov", "Dragunov", "DMR", "7.62mm", "Crate DMR with strong damage and a bipod."),
  // LMGs
  wpn("m249", "M249", "LMG", "5.56mm", "Care-package LMG with a 150-round belt."),
  wpn("dp28", "DP-28", "LMG", "7.62mm", "Pan-fed LMG with a big 47-round mag."),
  wpn("mg3", "MG3", "LMG", "7.62mm", "Crate LMG firing up to ~991 RPM."),
  // Shotguns
  wpn("s686", "S686", "Shotgun", "12 Gauge", "Double-barrel — two fast, brutal point-blank shots."),
  wpn("s1897", "S1897", "Shotgun", "12 Gauge", "Pump-action with a tight spread."),
  wpn("s12k", "S12K", "Shotgun", "12 Gauge", "Semi-auto shotgun that takes AR attachments."),
  wpn("dbs", "DBS", "Shotgun", "12 Gauge", "Crate double-barrel pump with a 14-round tube."),
  wpn("o12", "O12", "Shotgun", "12 Gauge", "Rondo's punchy semi-auto slug shotgun."),
  // Pistols
  wpn("p92", "P92", "Pistol", "9mm", "Starter sidearm with a 15-round mag."),
  wpn("p1911", "P1911", "Pistol", ".45 ACP", "Hard-hitting classic sidearm."),
  wpn("p18c", "P18C", "Pistol", "9mm", "Full-auto machine pistol backup."),
  wpn("r45", "R45", "Pistol", ".45 ACP", "Miramar revolver with a fast, hard punch."),
  wpn("deagle", "Deagle", "Pistol", ".45 ACP", "The Desert Eagle — the hardest-hitting handgun."),
  wpn("skorpion", "Skorpion", "Pistol", "9mm", "Full-auto machine pistol that takes SMG mags."),
  // Other
  wpn("crossbow", "Crossbow", "Other", "Bolt", "Silent one-shot bolt weapon with heavy drop."),
  wpn("panzerfaust", "Panzerfaust", "Other", "Rocket", "Single-use rocket launcher for vehicles and cover."),
];

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
    if (game === "Apex Legends") {
      return [...APEX_LEGENDS].sort((a, b) => a.name.localeCompare(b.name)).map((s) => toLite(s, "legend"));
    }
    if (game === "PUBG") {
      return [
        ...PUBG_MAPS.map((s) => toLite(s, "map")),
        ...[...PUBG_WEAPONS].sort((a, b) => a.name.localeCompare(b.name)).map((s) => toLite(s, "weapon")),
      ];
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
    if (game === "Apex Legends") {
      const s = APEX_LEGENDS.find((x) => x.id === id); if (!s) return null;
      return toDetail(s, "legend");
    }
    if (game === "PUBG") {
      const s = (kind === "map" ? PUBG_MAPS : PUBG_WEAPONS).find((x) => x.id === id)
        ?? PUBG_MAPS.find((x) => x.id === id) ?? PUBG_WEAPONS.find((x) => x.id === id);
      if (!s) return null;
      return toDetail(s, kind === "map" ? "map" : "weapon");
    }
  } catch { /* fall through */ }
  return null;
}

// Strip Riot/Valorant inline markup from ability/lore descriptions.
function strip(s: string | null | undefined): string {
  return (s ?? "").replace(/<[^>]+>/g, "").replace(/\{\{[^}]+\}\}/g, "").replace(/\s+/g, " ").trim();
}
