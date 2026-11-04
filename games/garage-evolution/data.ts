// Every number of the game's balance in one place: Basic Launch data changes this file, not the code.
// The anchor (game.yaml balance.anchor) is income a minute: a car's work and payout, the tools' strength and the robots'
// rate all convert into it. Inputs (set by hand) say so; everything else is derived from them.

/** input: the target session in minutes (game.yaml money.session.minutes) */
export const SESSION_MIN = 15;

// --- Layers and the work types

export type LayerKind = 'mud' | 'dust' | 'soot' | 'rust' | 'paint' | 'polish';
/** Top to bottom: what covers what */
// Top first. The paint (primer patches, a respray) lies on the body under everything and is sprayed last of all: after the
// cleaning, the bodywork, the wheels, the parts and the engine (the owner, 2026-10-16)
export const LAYER_ORDER: readonly LayerKind[] = ['mud', 'dust', 'soot', 'rust', 'polish', 'paint'];
export type Cat = 'wash' | 'grind' | 'paint' | 'polish' | 'wrench';
export const CATS: readonly Cat[] = ['wash', 'grind', 'paint', 'polish', 'wrench'];
/** Which tool works which layer */
export const LAYER_CAT: Record<LayerKind, Cat> = { mud: 'wash', dust: 'wash', soot: 'wash', rust: 'grind', paint: 'paint', polish: 'polish' };

/** The 8 work types and the garage level that opens each (new work types arrive with the garage) */
export const WORK_TYPES = ['mud', 'rust', 'polish', 'parts', 'dust', 'engine', 'paint', 'soot'] as const;
export type WorkType = (typeof WORK_TYPES)[number];
export const WORK_OPENS: Record<WorkType, number> = { mud: 1, rust: 1, polish: 1, parts: 1, dust: 2, engine: 2, paint: 3, soot: 3 };

/**
 * A layer's look and amount on a fresh car: coverage (share of the body's cells, min–max) and thickness (work per cell at
 * garage tier 1). Thickness is what makes a stronger tool matter: a pass removes `strength`, a thick layer needs several.
 */
export const LAYERS: Record<LayerKind, { cover: [number, number]; tau: number; chance: number }> = {
  mud: { cover: [0.55, 0.92], tau: 1, chance: 0.85 },
  dust: { cover: [0.7, 0.98], tau: 0.7, chance: 0.35 },
  soot: { cover: [0.3, 0.7], tau: 1.3, chance: 0.2 },
  rust: { cover: [0.06, 0.3], tau: 1.4, chance: 0.75 },
  paint: { cover: [0.1, 0.3], tau: 1, chance: 0.55 },
  polish: { cover: [0.2, 0.5], tau: 0.6, chance: 0.9 },
};

/** The grid every layer lives on (cells over the vehicle's box) */
export const GRID = { w: 96, h: 40 };

// --- Garage levels: the tiers (a new room, new work, new vehicles)

export interface GarageLevel {
  id: string;
  /** Price to build it (level 1 is free) */
  price: number;
  /** Work per cell multiplier for its vehicles: thicker mud, heavier rust */
  hard: number;
  /** Robots allowed per type */
  slots: number;
  /** Needs a prestige first (the space hangar) */
  prestige?: number;
}

export const GARAGES: readonly GarageLevel[] = [
  { id: 'shed', price: 0, hard: 1, slots: 1 },
  { id: 'workshop', price: 700, hard: 2.4, slots: 1 },
  { id: 'station', price: 6000, hard: 5.8, slots: 3 },
  { id: 'luxury', price: 200000, hard: 16, slots: 4 },
  { id: 'plant', price: 2800000, hard: 42, slots: 5 },
  { id: 'hangar', price: 45000000, hard: 110, slots: 6, prestige: 1 },
];

// --- The network (1.4, the owner's table: «больше земных гаражей», «возвращение в старые гаражи», «пассивный доход»):
// garages in cities on a world map, each of a tier (its room, its work, its robots' slots), with its own vehicles, its
// own tools and robots. Opened in order, each dearer than the last; all share the money; a garage's robots keep
// earning while the player is in another.

export interface Site {
  id: string;
  /** The garage level it is (GARAGES[tier - 1]: the room, the hardness, the robot slots, the work it opens) */
  tier: number;
  /** Price to open it (the first is free) */
  price: number;
  /** Its own vehicles (the models' ids); older tiers' cars still come now and then */
  pool: readonly string[];
  /** Where it is: longitude and latitude on the Earth map, or the body it sits on in space */
  lon: number;
  lat: number;
  space?: 'moon' | 'orbit' | 'mars' | 'venus' | 'mercury' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';
  /** The room's look within its tier: 0 the tier's own, 1 its second style, 2 its third */
  look: number;
  /** Its cars pay this much more (a tier's second garage serves richer clients) */
  mult?: number;
  /** Needs a prestige first */
  prestige?: number;
}

// Every vehicle on the Earth is one of the owner's pictures (2026-10-19: «Удали все машинки кроме тех которые я тебе
// отправил»); the spacecraft are drawn, in garages of their own. Each tier has three garages (the owner's table:
// «от маленькой автомастерской до премиального сервиса суперкаров и футуристических ремонтных центров»), each its own
// room style (look), its own clients (pool) and pay (mult)
export const SITES: readonly Site[] = [
  { id: 'shed', tier: 1, price: 0, lon: -83.0, lat: 42.3, look: 0, pool: ['glide', 'wayfarer', 'rocket', 'chancellor', 'salaryman', 'aero', 'gamin', 'bubble'] },
  { id: 'corner', tier: 1, price: 200, lon: -46.6, lat: -23.5, look: 1, mult: 1.8, pool: ['highlands', 'ironbrick', 'missile', 'redline', 'exec', 'swedebrick', 'longroof', 'hornet', 'serpent'] },
  { id: 'tuning', tier: 2, price: 900, lon: 139.7, lat: 35.7, look: 0, pool: ['stallion', 'rival', 'bigwing', 'zenith', 'sixcoupe', 'twincam', 'thunderfour', 'sakura', 'dusk', 'boxer', 'tangerine', 'ember'] },
  { id: 'rally', tier: 2, price: 3000, lon: 24.9, lat: 60.2, look: 1, mult: 1.8, pool: ['rallynine', 'fourfold', 'dune', 'cinq', 'squadra', 'gremlin', 'voltage', 'yellowrally'] },
  { id: 'station', tier: 3, price: 8000, lon: 72.9, lat: 19.1, look: 0, pool: ['sledge', 'palace', 'capsule', 'atlas', 'shootingstar', 'ridgeback', 'skyscraper', 'greyestate'] },
  { id: 'muscle', tier: 3, price: 40000, lon: -118.2, lat: 34.1, look: 1, mult: 1.8, pool: ['hellhound', 'manta', 'fang', 'wanderer', 'brawler', 'vandal', 'midship', 'blueline'] },
  { id: 'gt', tier: 3, price: 150000, lon: 145.0, lat: -37.8, look: 2, mult: 2.6, pool: ['emerald', 'pounce', 'monarch', 'viaggio', 'lumen', 'bellaotto', 'feather', 'turini', 'gecko', 'verdant', 'touringgt', 'violetwide'] },
  { id: 'luxury', tier: 4, price: 6e6, lon: 7.4, lat: 43.7, look: 0, pool: ['longnose', 'wedge', 'rosso', 'blade', 'carboncrown', 'autobahn', 'carbonsix', 'tempest', 'typhoon', 'foresttrack'] },
  { id: 'racing', tier: 4, price: 80e6, lon: 0.2, lat: 48.0, look: 1, mult: 1.8, pool: ['trackwing', 'forty', 'anniversary', 'centreseat', 'heritage', 'homolog', 'vten', 'orangetrack', 'silveropen', 'whiteracer', 'saber', 'bigcat', 'inferno', 'propeller', 'kabuki', 'kaminari', 'wisp', 'papaya'] },
  { id: 'prestige', tier: 4, price: 200e6, lon: 121.5, lat: 31.2, look: 2, mult: 2.6, pool: ['sovereign', 'apparition', 'swiftarrow', 'mulberry', 'prowler', 'senator', 'zeppelin', 'origami', 'hanok', 'ringleader', 'diamond', 'highwing'] },
  { id: 'plant', tier: 5, price: 1.5e9, lon: 115.9, lat: -31.9, look: 0, pool: ['fieldking', 'longhorn', 'rhino', 'snowcat'] },
  { id: 'hyper', tier: 5, price: 20e9, lon: 55.3, lat: 25.2, look: 1, mult: 1.8, pool: ['ghost', 'horseshoe', 'ibrido', 'mach', 'neon', 'scissor', 'screamer', 'storm', 'fjord', 'vento', 'zephyrus', 'viola', 'brezza'] },
  { id: 'future', tier: 5, price: 60e9, lon: 103.8, lat: 1.35, look: 2, mult: 2.6, pool: ['halo', 'prism', 'dart', 'talon', 'raven', 'orchid', 'amethyst', 'orca', 'pebble', 'static'] },
  // Space (the owner's table, 2026-10-16): only spacecraft; each garage further out is dearer and its clients pay more
  { id: 'hangar', tier: 6, price: 300e9, lon: 0, lat: 0, space: 'moon', look: 0, prestige: 1, pool: ['selene', 'moth', 'drift', 'unknown'] },
  { id: 'dock', tier: 6, price: 600e9, lon: 0, lat: 0, space: 'orbit', look: 1, mult: 1.5, prestige: 1, pool: ['orbiter', 'drake', 'tug'] },
  { id: 'mars', tier: 6, price: 1.2e12, lon: 0, lat: 0, space: 'mars', look: 0, mult: 2.2, prestige: 1, pool: ['tallship', 'kestrel', 'packmule'] },
  { id: 'venus', tier: 6, price: 2.5e12, lon: 0, lat: 0, space: 'venus', look: 1, mult: 3.2, prestige: 1, pool: ['blizzard', 'spark'] },
  { id: 'mercury', tier: 6, price: 5e12, lon: 0, lat: 0, space: 'mercury', look: 0, mult: 4.6, prestige: 1, pool: ['arrowx', 'scout'] },
  { id: 'jupiter', tier: 6, price: 1e13, lon: 0, lat: 0, space: 'jupiter', look: 1, mult: 6.5, prestige: 1, pool: ['colossus', 'orehauler'] },
  { id: 'saturn', tier: 6, price: 2e13, lon: 0, lat: 0, space: 'saturn', look: 0, mult: 9, prestige: 1, pool: ['skyracer', 'cruiser'] },
  { id: 'uranus', tier: 6, price: 4e13, lon: 0, lat: 0, space: 'uranus', look: 1, mult: 13, prestige: 1, pool: ['ion', 'icebreaker'] },
  { id: 'neptune', tier: 6, price: 8e13, lon: 0, lat: 0, space: 'neptune', look: 0, mult: 18, prestige: 1, pool: ['nomad', 'trident'] },
];
export const SITE = new Map(SITES.map((x) => [x.id, x]));

/**
 * Cars to restore in the last opened garage before the next one can be bought (the owner's table, 2026-10-19:
 * «надо починить какое то количество машин прежде чем это можно будет сделать»), by the next garage's tier
 */
export const CARS_TO_OPEN = [0, 5, 8, 10, 12, 15, 10] as const;


// --- Tools: one line per work category; every TIER_EVERY levels a new tool (a new look, a bigger stroke)

export const TIER_EVERY = 10;

export interface ToolLine {
  cat: Cat;
  /** The tools of the line, one per tier (texts: tool.<id>) */
  tiers: readonly string[];
  /** Price of level 1 and its growth a level */
  base: number;
  growth: number;
  /** The garage level that opens the line */
  opens: number;
}

export const TOOLS: Record<Cat, ToolLine> = {
  wash: { cat: 'wash', tiers: ['sponge', 'hose', 'pressure', 'foam', 'industrial', 'nano'], base: 6, growth: 1.26, opens: 1 },
  grind: { cat: 'grind', tiers: ['wirebrush', 'grinder', 'sandblaster', 'needle', 'laser', 'plasma'], base: 8, growth: 1.26, opens: 1 },
  polish: { cat: 'polish', tiers: ['rag', 'orbital', 'rotary', 'dual', 'ceramic', 'nanopolish'], base: 7, growth: 1.26, opens: 1 },
  wrench: { cat: 'wrench', tiers: ['spanner', 'ratchet', 'impact', 'pneumatic', 'torquebot', 'magnetic'], base: 9, growth: 1.26, opens: 1 },
  paint: { cat: 'paint', tiers: ['spraycan', 'spraygun', 'hvlp', 'airless', 'electro', 'nanospray'], base: 60, growth: 1.26, opens: 3 },
};

/** Levels a line can reach: a tier per garage level (the garage is what opens the next tool) */
export const TOOL_MAX = 60;
export const toolCap = (garage: number): number => Math.min(TOOL_MAX, TIER_EVERY * garage);

/** input: a hand stroke's work at level 0 (a pass over the brush's cells) */
export const HAND = { strength: 1.4, radius: 3.6 };

/** A tool's strength and radius (grid cells) at a level: +8 % a level, ×1.5 and a bigger stroke at each new tier */
export function toolPower(level: number): { strength: number; radius: number; tier: number } {
  const tier = Math.floor(level / TIER_EVERY);
  const inTier = level % TIER_EVERY;
  // Built by multiplication, not Math.pow (the same numbers on every browser)
  let s = HAND.strength;
  for (let i = 0; i < tier; i++) {
    for (let k = 0; k < TIER_EVERY - 1; k++) s *= 1.08;
    s *= 1.5;
  }
  for (let i = 0; i < inTier; i++) s *= 1.08;
  return { strength: s, radius: HAND.radius * (1 + 0.1 * tier), tier };
}

/** The price of the next level of a tool line */
export function toolPrice(cat: Cat, level: number): number {
  const t = TOOLS[cat];
  let p = t.base;
  for (let i = 0; i < level; i++) p *= t.growth;
  return Math.ceil(p);
}

// --- Robots: one kind per category, visible in the garage; each works its layer with the line's current tool

export interface RobotKind {
  cat: Cat;
  id: string;
  /** The first unit's price and the growth for each next one */
  base: number;
  growth: number;
  /** Strokes per second a robot makes (a hand makes about 6) */
  rate: number;
  opens: number;
}

export const ROBOTS: Record<Cat, RobotKind> = {
  wash: { cat: 'wash', id: 'washbot', base: 120, growth: 10, rate: 2.2, opens: 1 },
  // A full crew from the Shed (1.4: robots do their own trade only, so a garage earns alone once it has one of each)
  grind: { cat: 'grind', id: 'grindarm', base: 300, growth: 10, rate: 1.8, opens: 1 },
  polish: { cat: 'polish', id: 'polishdrone', base: 400, growth: 10, rate: 2.0, opens: 1 },
  wrench: { cat: 'wrench', id: 'wrenchbot', base: 900, growth: 10, rate: 1.6, opens: 1 },
  paint: { cat: 'paint', id: 'paintbooth', base: 8000, growth: 10, rate: 2.0, opens: 3 },
};

export function robotPrice(cat: Cat, owned: number): number {
  const r = ROBOTS[cat];
  let p = r.base;
  for (let i = 0; i < owned; i++) p *= r.growth;
  return Math.ceil(p);
}

// --- Rarity, variants, condition

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'unknown'] as const;
export type Rarity = (typeof RARITIES)[number];
export const RARITY: Record<Rarity, { weight: number; mult: number; color: string }> = {
  common: { weight: 62, mult: 1, color: '#c9d2dc' },
  uncommon: { weight: 22, mult: 1.25, color: '#5fd06a' },
  rare: { weight: 10, mult: 1.6, color: '#4aa8ff' },
  epic: { weight: 4.2, mult: 2.2, color: '#b26bff' },
  legendary: { weight: 1.5, mult: 3, color: '#ffb02e' },
  mythic: { weight: 0.3, mult: 4.5, color: '#ff4f7a' },
  unknown: { weight: 0, mult: 6, color: '#3fffd8' },
};

export const VARIANTS = ['standard', 'racing', 'police', 'luxury', 'offroad', 'prototype', 'limited'] as const;
export type Variant = (typeof VARIANTS)[number];
export const VARIANT: Record<Variant, { weight: number; mult: number }> = {
  standard: { weight: 60, mult: 1 },
  racing: { weight: 10, mult: 1.15 },
  police: { weight: 7, mult: 1.1 },
  luxury: { weight: 9, mult: 1.2 },
  offroad: { weight: 8, mult: 1.1 },
  prototype: { weight: 4, mult: 1.35 },
  limited: { weight: 2, mult: 1.6 },
};

/**
 * How a car became a wreck: it decides which jobs it brings, so no two cars are worked the same way (the car card names
 * it). A daily driver is a light wash; a barn find is dust, deep rust and flat tyres; a flood car is mud and an engine;
 * a crash brings dents, broken parts and a bent rim; a fire, soot and a full respray; the desert, dust, faded paint and
 * bald tyres. `opens`: the garage level it first comes at
 */
export const PROFILES = ['daily', 'barn', 'flood', 'crash', 'fire', 'desert'] as const;
export type Profile = (typeof PROFILES)[number];
export const PROFILE: Record<Profile, { weight: number; opens: number }> = {
  daily: { weight: 2.6, opens: 1 },
  barn: { weight: 2, opens: 1 },
  crash: { weight: 2.4, opens: 1 },
  flood: { weight: 1.6, opens: 2 },
  desert: { weight: 1.4, opens: 2 },
  fire: { weight: 1.4, opens: 3 },
};

/** Stories a rare instance carries (texts: story.<id>) */
export const STORIES = ['barn', 'lake', 'crash', 'fire', 'desert', 'snow', 'museum', 'gate', 'storage', 'auction', 'field', 'collector', 'orbit', 'splash', 'reentry', 'pad', 'derelict', 'probe'] as const;

// --- The flow of one car

export const FLOW = {
  /** Seconds the car rolls in, and the finale (lights, horn, engine, gate, drive-out): the next car is workable ≤ 3 s after
   * RESTORED (it took 6.6 s: the designer, 1.5.0) */
  arriveSec: 1.2,
  finaleSec: 2.6,
  /** The RESTORED card waits this long, then the next car comes by itself */
  cardSec: 3.6,
  /** A layer below this share left is finished by itself (the last specks) */
  autoFinish: 0.05,
  /** Work of a part and an engine node at tier 1 (wrench strokes at level 0) */
  partWork: 4,
  engineWork: 5,
  /** Work of a dent at tier 1 (a dent pulled with the suction cup: the drag's length in cells × the wrench's strength) */
  dentWork: 14,
  /** A dent let go before it pops springs back by this share of the pull */
  dentSpring: 0.35,
  /** A respray in the rare colour pays this much more */
  rareColorBonus: 0.15,
  /** A Perfect Clean: restored within this share of the par time (par = the work at the hand's pace) */
  perfect: 1.0,
  perfectBonus: 0.3,
  /** Every Nth car's card offers ×2 (and every rare+ one) */
  doubleEvery: 5,
  /** A rush job every this many cars from car rushFrom: restored within its clock it pays rushPay × */
  rushEvery: 5,
  rushFrom: 3,
  rushPay: 2,
  /** This share of every payout goes into the next garage's fund (economy.ts earn) */
  fundShare: 0.25,
};

/** input: how a player works, for the par time and the balance bot: strokes per second while scrubbing */
export const PLAYER_STROKES = 6;

// --- Prestige: the International Chain

export const PRESTIGE = {
  /** Needs a Service Station level garage (1.4: the network's later garages are paid for with stars) */
  needsLevel: 3,
  /** Stars for the life's earnings: floor(sqrt(earned / unit)) */
  unit: 1e5,
  /** Each star: +income */
  perStar: 0.5,
};

export function starsFor(earned: number): number {
  return Math.floor(Math.sqrt(Math.max(0, earned) / PRESTIGE.unit));
}

/** Offline earnings: robots work while away, at this share of their rate, up to this many hours */
export const OFFLINE = { share: 0.6, maxHours: 8, minSec: 60 };
