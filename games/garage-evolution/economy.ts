// The garage's economy and records, pure: money, tools, robots, garage levels, the prestige, the collection album and
// the statistics. The page, the balance bot and the tests share it.

import { dailyDone, daySeed, loadDaily, type DailyLog } from '@gp/core';
import {
  CARS_TO_OPEN, CATS, FLOW, LAYER_CAT, PLAYER_STROKES, GARAGES, OFFLINE, PRESTIGE, PROFILE, PROFILES, RARITIES, ROBOTS, SITE, SITES, TOOL_MAX, TOOLS, VARIANTS, robotPrice, starsFor, TIER_EVERY, toolCap, toolPrice,
  type Cat, type Profile, type Rarity, type Variant,
} from './data.ts';
import { MODEL, MODELS, type VehicleClass } from './models.ts';
import { RIMS } from './wheels.ts';
import { layerStrokes, newCar, newRobots, parSec, powers, progress, robotsStep, seeded, tick, wheelWorkOf, type Car } from './sim.ts';

export interface ModelRecord {
  /** Restored count, the best and worst condition seen, the top payout, rarities and variants found */
  n: number;
  best: number;
  worst: number;
  top: number;
  rar: string[];
  vars: string[];
  fastest: number;
}

export interface Stats {
  restored: number;
  byCls: Record<VehicleClass, number>;
  byGarage: number[];
  /** m² cleaned, kg of rust, parts fitted, engines fixed */
  area: number;
  rust: number;
  parts: number;
  engines: number;
  /** Wheels fixed in the tyre bay, and how many of them perfectly */
  wheels: number;
  perfectWheels: number;
  earned: number;
  perfect: number;
  priciest: { id: string; value: number } | null;
  dirtiest: number;
  worst: number;
  fastest: number;
  longest: number;
  /** The first car restored ever */
  first: { id: string; at: string } | null;
  /** Minutes played */
  minutes: number;
  /** Vehicles the robots restored while the player was away (offline earnings) */
  away: number;
}

/** One garage of the network: its own tools and robots, what it has done */
export interface SiteState {
  tools: Record<Cat, number>;
  robots: Record<Cat, number>;
  /** Vehicles restored here (by hand and by its robots), money it made */
  cars: number;
  earned: number;
}

export interface Save {
  v: number;
  /** The garage the player is in (SITES id); `garage`, `tools` and `robots` are its tier and its own (the same objects
   * as in `sites`) */
  at: string;
  /** Every opened garage's state */
  sites: Record<string, SiteState>;
  money: number;
  /**
   * The next garage's fund: a share of every payout put aside, never spent on tools or robots, so the goal only grows
   * (the designer, 1.5.0: the goal fell 80 % → 3 % on one upgrade). Paid into the garage when it is opened
   */
  fund: number;
  /** Earned in this life (prestige stars come from it) */
  life: number;
  garage: number;
  prestige: number;
  stars: number;
  tools: Record<Cat, number>;
  robots: Record<Cat, number>;
  album: Record<string, ModelRecord>;
  stats: Stats;
  daily: DailyLog;
  /** ms timestamp of the last save (offline earnings) */
  seen: number;
  /** The rare car of the day is waiting (its day key), brought in (true) */
  sound: boolean;
  music: number;
  sfx: number;
  /** Cars restored in this life (the ×2 offer every Nth) */
  lifeCars: number;
  /** Rims found (the album's rim row) */
  rims: string[];
  /** Achievements earned (achievements.ts ids) */
  ach: string[];
  /** Days in a row the player came (the day's key, the count, the day's reward collected) */
  streak: { day: string; n: number; claimed: boolean };
  /** The day's order: restore `need` cars of a profile (the day's key, the profile, how many so far, paid) */
  order: { day: string; profile: Profile; n: number; done: boolean };
  /** What the coach has taught (an action is shown with a hand until the player has done it) */
  lessons: string[];
}

export const zeroCats = (): Record<Cat, number> => ({ wash: 0, grind: 0, paint: 0, polish: 0, wrench: 0 });

export function newStats(): Stats {
  return {
    restored: 0, byCls: { car: 0, sport: 0, truck: 0, special: 0, moto: 0, heavy: 0, space: 0 }, byGarage: [0, 0, 0, 0, 0, 0],
    area: 0, rust: 0, parts: 0, engines: 0, wheels: 0, perfectWheels: 0, earned: 0, perfect: 0, priciest: null, dirtiest: 0, worst: 100, fastest: 0, longest: 0, first: null, minutes: 0, away: 0,
  };
}

/** A garage as it opens: the basic kit of its level (the tools of its tier, at their first level), no robots */
const newSite = (tier = 1): SiteState => {
  const tools = zeroCats();
  for (const c of CATS) if (TOOLS[c].opens <= tier) tools[c] = Math.max(0, (tier - 1) * TIER_EVERY);
  return { tools, robots: zeroCats(), cars: 0, earned: 0 };
};

export function newSave(): Save {
  const shed = newSite();
  return {
    v: 0, at: 'shed', sites: { shed }, money: 0, fund: 0, life: 0, garage: 1, prestige: 0, stars: 0, tools: shed.tools, robots: shed.robots, album: {}, stats: newStats(),
    daily: { days: [], count: 0 }, seen: 0, sound: true, music: 0.55, sfx: 0.8, lifeCars: 0, rims: [], ach: [], lessons: [], streak: { day: '', n: 0, claimed: true }, order: { day: '', profile: 'daily', n: 0, done: false },
  };
}

/** A loaded save made safe: numbers in range, unknown ids dropped */
/**
 * The shape host.load fits a stored save to: the platform keeps only the keys a non-empty default map has, so the
 * garages map is empty here (taken as stored) — with { shed } as its default every other garage was dropped on a reload
 * and the player woke up in the Shed (the owner's table, 2026-10-19: «прогресс гаражей не сохраняется»)
 */
export function saveShape(): Save {
  return { ...newSave(), sites: {} };
}

export function sanitize(s: Save): Save {
  const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  s.v = 1;
  s.money = Math.max(0, num(s.money));
  s.fund = Math.max(0, num(s.fund));
  s.life = Math.max(0, num(s.life));
  s.garage = Math.max(1, Math.min(GARAGES.length, Math.floor(num(s.garage, 1))));
  s.prestige = Math.max(0, Math.floor(num(s.prestige)));
  s.stars = Math.max(0, Math.floor(num(s.stars)));
  const cats = (o: unknown, max: (c: Cat) => number) => {
    const r = zeroCats();
    for (const c of CATS) r[c] = Math.max(0, Math.min(max(c), Math.floor(num((o as Record<string, unknown>)?.[c]))));
    return r;
  };
  // The network: a 1.3 save had one garage level and its tools and robots — every garage of the levels it reached opens
  // (the first of each tier), the tools and robots go to the one it was in
  if (!s.sites || typeof s.sites !== 'object' || !Object.keys(s.sites).length) {
    const sites: Record<string, SiteState> = {};
    const firsts = GARAGES.slice(0, s.garage).map((g, i) => SITES.find((x) => x.tier === i + 1)!.id);
    for (const id of firsts) sites[id] = newSite(SITE.get(id)!.tier);
    const here = firsts[firsts.length - 1];
    sites[here] = { tools: s.tools ?? zeroCats(), robots: s.robots ?? zeroCats(), cars: 0, earned: 0 };
    s.sites = sites;
    s.at = here;
  }
  const sites: Record<string, SiteState> = {};
  for (const x of SITES) {
    const st = (s.sites as Record<string, Partial<SiteState>>)[x.id];
    if (!st || typeof st !== 'object') continue;
    sites[x.id] = {
      tools: cats(st.tools, () => toolCap(x.tier)),
      robots: cats(st.robots, () => GARAGES[x.tier - 1].slots),
      cars: Math.max(0, num(st.cars)),
      earned: Math.max(0, num(st.earned)),
    };
  }
  if (!sites.shed) sites.shed = newSite();
  s.sites = sites;
  if (typeof s.at !== 'string' || !sites[s.at]) s.at = 'shed';
  s.garage = SITE.get(s.at)!.tier;
  s.tools = sites[s.at].tools;
  s.robots = sites[s.at].robots;
  const album: Record<string, ModelRecord> = {};
  for (const [id, r] of Object.entries(s.album ?? {})) {
    if (!MODEL.has(id) || !r || typeof r !== 'object') continue;
    album[id] = {
      n: Math.max(0, Math.floor(num(r.n))), best: num(r.best), worst: num(r.worst, 100), top: num(r.top),
      rar: (Array.isArray(r.rar) ? r.rar : []).filter((x) => (RARITIES as readonly string[]).includes(x)),
      vars: (Array.isArray(r.vars) ? r.vars : []).filter((x) => (VARIANTS as readonly string[]).includes(x)),
      fastest: num(r.fastest),
    };
  }
  s.album = album;
  const st = { ...newStats(), ...(s.stats ?? {}) };
  for (const k of ['restored', 'area', 'rust', 'parts', 'engines', 'wheels', 'perfectWheels', 'earned', 'perfect', 'dirtiest', 'fastest', 'longest', 'minutes', 'away'] as const) st[k] = Math.max(0, num(st[k]));
  st.worst = Math.max(0, Math.min(100, num(st.worst, 100)));
  st.byCls = { ...newStats().byCls, ...(st.byCls ?? {}) };
  st.byGarage = Array.from({ length: 6 }, (_, i) => num(st.byGarage?.[i]));
  s.stats = st;
  s.daily = loadDaily(s.daily);
  s.seen = num(s.seen);
  s.music = Math.max(0, Math.min(1, num(s.music, 0.55)));
  s.sfx = Math.max(0, Math.min(1, num(s.sfx, 0.8)));
  s.lifeCars = Math.max(0, Math.floor(num(s.lifeCars)));
  s.ach = Array.isArray(s.ach) ? [...new Set(s.ach.filter((x): x is string => typeof x === 'string'))] : [];
  const sk = (s.streak ?? {}) as Partial<Save['streak']>;
  s.streak = { day: typeof sk.day === 'string' ? sk.day.slice(0, 16) : '', n: Math.max(0, Math.min(9999, Math.floor(num(sk.n)))), claimed: sk.claimed !== false };
  const od = (s.order ?? {}) as Partial<Save['order']>;
  s.order = { day: typeof od.day === 'string' ? od.day.slice(0, 16) : '', profile: PROFILES.includes(od.profile as Profile) ? (od.profile as Profile) : 'daily', n: Math.max(0, Math.min(99, Math.floor(num(od.n)))), done: !!od.done };
  s.lessons = [...new Set((Array.isArray(s.lessons) ? s.lessons : []).filter((x): x is string => typeof x === 'string' && x.length < 40))].slice(0, 60);
  s.rims = [...new Set((Array.isArray(s.rims) ? s.rims : []).filter((x) => RIMS.some((r) => r.id === x)))];
  return s;
}

/** The income multiplier from prestige stars */
export const starMult = (s: Save): number => 1 + PRESTIGE.perStar * s.stars;

// --- Buying

export type Buy = { kind: 'tool'; cat: Cat } | { kind: 'robot'; cat: Cat } | { kind: 'garage' };

export function priceOf(s: Save, b: Buy): number | null {
  if (b.kind === 'tool') {
    if (TOOLS[b.cat].opens > s.garage || s.tools[b.cat] >= toolCap(s.garage)) return null;
    return toolPrice(b.cat, s.tools[b.cat]);
  }
  if (b.kind === 'robot') {
    if (ROBOTS[b.cat].opens > s.garage || s.robots[b.cat] >= GARAGES[s.garage - 1].slots) return null;
    return robotPrice(b.cat, s.robots[b.cat]);
  }
  const next = nextSite(s);
  if (!next) return null;
  if ((next.prestige ?? 0) > s.prestige) return null;
  // Not for sale until the last garage restored its cars (the shop shows the count instead of a price)
  if (!gateOpen(s)) return null;
  return next.price;
}

/** The fund's garage: the next one to open, when it is for sale in this life (not behind a prestige) */
function fundFor(s: Save) {
  const next = nextSite(s);
  return next && (next.prestige ?? 0) <= s.prestige ? next : null;
}
/** The money a purchase can use: a garage takes its fund too */
export const purse = (s: Save, b: Buy): number => s.money + (b.kind === 'garage' ? s.fund : 0);
export function affords(s: Save, b: Buy): boolean {
  const p = priceOf(s, b);
  return p !== null && p <= purse(s, b);
}

/**
 * Income in: the fund's share goes aside (up to the next garage's price), the rest is money. Returns what was put aside
 */
export function earn(s: Save, m: number): number {
  const next = fundFor(s);
  const cut = next ? Math.max(0, Math.min(m * FLOW.fundShare, next.price - s.fund)) : 0;
  s.fund += cut;
  s.money += m - cut;
  s.life += m;
  return cut;
}

/** Why it can't be bought now (null: it can, or it is just too expensive) */
export function lockOf(s: Save, b: Buy): 'garage' | 'max' | 'prestige' | null {
  if (b.kind === 'tool') return TOOLS[b.cat].opens > s.garage ? 'garage' : s.tools[b.cat] >= toolCap(s.garage) ? (s.tools[b.cat] >= TOOL_MAX ? 'max' : 'garage') : null;
  if (b.kind === 'robot') return ROBOTS[b.cat].opens > s.garage ? 'garage' : s.robots[b.cat] >= GARAGES[s.garage - 1].slots ? 'max' : null;
  const next = nextSite(s);
  if (!next) return 'max';
  return (next.prestige ?? 0) > s.prestige ? 'prestige' : null;
}

export function buy(s: Save, b: Buy): boolean {
  const p = priceOf(s, b);
  if (p === null || purse(s, b) < p) return false;
  if (b.kind === 'garage' && !gateOpen(s)) return false;
  if (b.kind === 'garage') {
    // The fund first, the rest from the money; what is left in the fund goes back to the money
    const fromFund = Math.min(s.fund, p);
    s.money -= p - fromFund;
    s.money += s.fund - fromFund;
    s.fund = 0;
  } else s.money -= p;
  if (b.kind === 'tool') s.tools[b.cat]++;
  else if (b.kind === 'robot') s.robots[b.cat]++;
  else {
    // A new garage of the network: open it and move in
    const next = nextSite(s)!;
    s.sites[next.id] = newSite(next.tier);
    travel(s, next.id);
  }
  return true;
}

// --- The network

/** The cars the last opened garage has restored towards the next one, and how many it takes */
export function openGate(s: Save): { have: number; need: number; at: string } | null {
  const next = nextSite(s);
  if (!next) return null;
  const last = [...SITES].reverse().find((x) => s.sites[x.id])!;
  return { have: Math.min(s.sites[last.id].cars, CARS_TO_OPEN[next.tier]), need: CARS_TO_OPEN[next.tier], at: last.id };
}
export function gateOpen(s: Save): boolean {
  const g = openGate(s);
  return !g || g.have >= g.need;
}

/** The next garage to open (in order), or null when all are open */
export function nextSite(s: Save) {
  return SITES.find((x) => !s.sites[x.id]) ?? null;
}
/** The highest garage level among the opened ones (the prestige, the album and the achievements read it) */
export function topTier(s: Save): number {
  return Math.max(1, ...Object.keys(s.sites).map((id) => SITE.get(id)!.tier));
}
/** A garage's cars: its tier, its own vehicles, its payout multiplier (newCar's options) */
export function siteCars(id: string): { garage: number; pool: readonly string[]; valueMult: number } {
  const x = SITE.get(id)!;
  return { garage: x.tier, pool: x.pool, valueMult: x.mult ?? 1 };
}

/** Move to another opened garage: its tier, tools and robots become the live ones */
export function travel(s: Save, id: string): boolean {
  const st = s.sites[id];
  if (!st) return false;
  s.at = id;
  s.garage = SITE.get(id)!.tier;
  s.tools = st.tools;
  s.robots = st.robots;
  return true;
}

/**
 * What a garage's robots earn alone, $ a second (the stars counted): an average car of its own, their time for it, their
 * share of its work (each robot does its own trade). Computed from the numbers, never from a scene; cached
 */
const siteRates = new Map<string, number>();
export function siteRate(s: Save, id: string): number {
  const st = s.sites[id];
  const site = SITE.get(id);
  if (!st || !site || !CATS.some((c) => st.robots[c] > 0)) return 0;
  const key = `${id}|${s.prestige}|${CATS.map((c) => `${st.tools[c]}.${st.robots[c]}`).join(',')}`;
  let base = siteRates.get(key);
  if (base === undefined) {
    base = crewRate(id, st.tools, st.robots, s.prestige).perSec;
    siteRates.set(key, base);
  }
  return base * starMult(s);
}
/** The whole network's robots, $ a second: every garage, the one the player is in too */
export function networkRate(s: Save): number {
  return Object.keys(s.sites).reduce((a, id) => a + siteRate(s, id), 0);
}
/** The garages the player is not in, $ a second: paid while playing (the player's own garage pays per car) */
export function backgroundRate(s: Save): number {
  return Object.keys(s.sites).reduce((a, id) => a + (id === s.at ? 0 : siteRate(s, id)), 0);
}

/** Undo a tool or robot purchase at exactly its price */
export function refund(s: Save, b: Buy): boolean {
  if (b.kind === 'tool' && s.tools[b.cat] > 0) {
    s.tools[b.cat]--;
    s.money += toolPrice(b.cat, s.tools[b.cat]);
    return true;
  }
  if (b.kind === 'robot' && s.robots[b.cat] > 0) {
    s.robots[b.cat]--;
    s.money += robotPrice(b.cat, s.robots[b.cat]);
    return true;
  }
  return false;
}

// --- A restored car

export interface Payout {
  /** Rims found for the first time on this car */
  newRims?: string[];
  base: number;
  perfect: boolean;
  total: number;
  newModel: boolean;
  newVariant: boolean;
  newRarity: boolean;
}

/** Wheels fixed by hand with no mistake: +10 % each */
export const perfectWheels = (car: Car): number => car.wheels.filter((j) => j.step === 'done' && !j.mistakes && !j.robot).length;

export function payout(s: Save, car: Car, perfect: boolean): number {
  return Math.round(car.value * starMult(s) * (perfect ? 1 + FLOW.perfectBonus : 1) * (1 + 0.1 * perfectWheels(car)) * (car.rush?.won ? FLOW.rushPay : 1));
}

/**
 * A rush job (the audit, 2026-10-20: the same verb car after car, nothing to race): every few cars one comes with a
 * clock on it — restored in time, it pays double. Never the first cars, a car of the day or a spacecraft
 */
export function isRush(s: Save, car: Car): boolean {
  return s.lifeCars >= FLOW.rushFrom && (s.lifeCars + 1) % FLOW.rushEvery === 0 && !car.daily && car.model.cls !== 'space';
}

/** Book a restored car: money, the album, the statistics. `sec`: how long it took */
export function restore(s: Save, car: Car, sec: number, perfect: boolean, doubled = false, today = new Date()): Payout {
  const base = payout(s, car, perfect);
  const total = base * (doubled ? 2 : 1);
  earn(s, total);
  s.lifeCars++;
  const here = s.sites[s.at];
  if (here) {
    here.cars++;
    here.earned += total;
  }
  const id = car.model.id;
  const rec = s.album[id];
  const newModel = !rec;
  const r: ModelRecord = rec ?? { n: 0, best: 0, worst: 100, top: 0, rar: [], vars: [], fastest: 0 };
  const cond = Math.round(100 - car.wreck * 70 - 8);
  const newVariant = !r.vars.includes(car.variant);
  const newRarity = !r.rar.includes(car.rarity);
  r.n++;
  r.best = Math.max(r.best, cond);
  r.worst = Math.min(r.worst, cond);
  r.top = Math.max(r.top, total);
  if (newRarity) r.rar.push(car.rarity);
  if (newVariant) r.vars.push(car.variant);
  r.fastest = r.fastest ? Math.min(r.fastest, sec) : sec;
  s.album[id] = r;
  const st = s.stats;
  st.restored++;
  st.byCls[car.model.cls]++;
  st.byGarage[Math.min(5, Math.max(car.model.level, s.garage) - 1)]++;
  // m² of a car's surface: about 2 × its length² × 0.6, its length from the class; kg of rust from the rust layer's work
  const len = car.model.cls === 'heavy' ? 10 : car.model.cls === 'truck' || car.model.cls === 'special' ? 8 : car.model.cls === 'space' ? 30 : car.model.cls === 'moto' ? 2.1 : 4.4;
  const top = car.layers[0];
  st.area += Math.round(((top ? top.total / Math.max(1e-9, top.total) : 0) * len * len * 1.1 * (car.cells / 2300)) * 10) / 10;
  const rust = car.layers.find((l) => l.kind === 'rust');
  st.rust += rust ? Math.round(rust.total * 0.004 * len * 10) / 10 : 0;
  st.parts += car.parts.length;
  st.engines += car.engine.length ? 1 : 0;
  const rimsBefore = new Set(s.rims);
  st.wheels += car.wheels.length;
  st.perfectWheels += perfectWheels(car);
  for (const j of car.wheels) if (!s.rims.includes(j.rim)) s.rims.push(j.rim);
  st.earned += total;
  if (perfect) st.perfect++;
  if (!st.priciest || total > st.priciest.value) st.priciest = { id, value: total };
  const dirt = Math.round((car.wreck * 0.6 + 0.4) * 1000) / 10;
  st.dirtiest = Math.max(st.dirtiest, dirt);
  st.worst = Math.min(st.worst, cond);
  st.fastest = st.fastest ? Math.min(st.fastest, sec) : sec;
  st.longest = Math.max(st.longest, sec);
  if (!st.first) st.first = { id, at: today.toISOString().slice(0, 10) };
  return { base, perfect, total, newModel, newVariant, newRarity, newRims: s.rims.filter((r) => !rimsBefore.has(r)) };
}

/** The ×2 offer on this card? Every Nth car of the life and every rare one */
export function offersDouble(s: Save, car: Car): boolean {
  // Every few cars and the epic and rarer ones (it came on half the early cards: «No thanks» became a habit)
  return s.lifeCars % FLOW.doubleEvery === 0 || RARITIES.indexOf(car.rarity) >= 3 || car.daily;
}

// --- The collection album's progress

export function album(s: Save): { models: number; of: number; variants: number; varOf: number; rarities: number; rarOf: number; share: number } {
  // The retired cars leave the count (a save that found one keeps its card)
  const live = (id: string) => !!MODEL.get(id) && !MODEL.get(id)!.retired;
  const of = MODELS.filter((m) => !m.retired).length;
  const found = Object.entries(s.album).filter(([id]) => live(id));
  const models = found.length;
  let variants = 0;
  let rarities = 0;
  for (const [, r] of found) {
    variants += r.vars.length;
    rarities += r.rar.filter((x) => RARITIES.indexOf(x as Rarity) >= 2).length;
  }
  const varOf = of * VARIANTS.length;
  const rarOf = of * 4;
  return { models, of, variants, varOf, rarities, rarOf, share: (models / of) * 0.6 + (variants / varOf) * 0.25 + (rarities / rarOf) * 0.15 };
}

// --- The next goal (the HUD's line and the RESTORED card's unfinished goal)

export interface Goal {
  kind: 'garage' | 'prestige' | 'tool' | 'robot' | 'album';
  /** 0–1 */
  share: number;
  price: number;
  id: string;
  /** A garage: the fund's share, and its cars done of those it takes */
  fund?: number;
  cars?: { have: number; need: number };
}

export function nextGoal(s: Save): Goal {
  const g = nextSite(s);
  if (g && (g.prestige ?? 0) <= s.prestige) {
    const gate = openGate(s)!;
    // The fund's share: it only grows (the money can be spent on upgrades, the fund can't)
    return { kind: 'garage', share: Math.min(1, s.fund / g.price, gate.have / Math.max(1, gate.need)), price: g.price, id: g.id, fund: Math.min(1, s.fund / g.price), cars: gate };
  }
  if (canPrestige(s) || (topTier(s) >= PRESTIGE.needsLevel && s.prestige === 0)) {
    const need = PRESTIGE.unit * 4; // the first star needs this life to earn 1 unit; 2 stars to feel it
    return { kind: 'prestige', share: Math.min(1, s.life / need), price: need, id: 'chain' };
  }
  return { kind: 'album', share: album(s).share, price: 0, id: 'album' };
}

// --- The prestige: the International Chain

export function canPrestige(s: Save): boolean {
  return topTier(s) >= PRESTIGE.needsLevel && starsFor(s.life) >= 1;
}

/** Sell the business: money, tools, robots and the garage go; stars, the album and the statistics stay */
export function prestige(s: Save): number {
  if (!canPrestige(s)) return 0;
  const gained = starsFor(s.life);
  s.stars += gained;
  s.prestige++;
  s.money = 0;
  s.fund = 0;
  s.life = 0;
  const shed = newSite();
  s.sites = { shed };
  travel(s, 'shed');
  s.lifeCars = 0;
  return gained;
}

// --- The rare car of the day

export interface DailyCar {
  key: string;
  model: string;
  rarity: Rarity;
  variant: Variant;
  done: boolean;
}

export function dailyCar(s: Save, key: string): DailyCar {
  const r = seeded(daySeed(key, 'garage-evolution-gate'));
  // The daily car is one of the garage's own vehicles (its look too): a rare find, never a jump past the next garage
  const pool = (SITE.get(s.at)?.pool ?? []).filter((id) => id !== 'unknown').map((id) => MODEL.get(id)!);
  const m = pool[Math.floor(r() * pool.length) % pool.length];
  const rarity: Rarity = r() < 0.25 ? 'legendary' : 'epic';
  const variant: Variant = (['racing', 'luxury', 'prototype', 'limited', 'police', 'offroad'] as const)[Math.floor(r() * 6) % 6];
  return { key, model: m.id, rarity, variant, done: dailyDone(s.daily, key) };
}

// --- Robots alone: how long they take for a car, and what they earn while the player is away

/** Seconds robots alone need for an average car of the save's garage (null: no robots) */
export function robotCarSec(s: Save, seed = 7): { sec: number; value: number } | null {
  return robotCarSecFor(s.at, s.tools, s.robots, s.prestige, seed);
}

/**
 * The same for any garage: its tier and own vehicles, its tools and robots. Each robot does its own trade only; a crew
 * that can't finish a car is paid for its share of the work (the designer, 1.5.0: one wash bot earned nothing while the
 * player was away — the genre's return hook was missing until the whole crew of a garage was hired)
 */
export function robotCarSecFor(at: string, tools: Record<Cat, number>, robots: Record<Cat, number>, prestigeN: number, seed = 7): { sec: number; value: number; share: number } | null {
  const n = CATS.reduce((a, c) => a + robots[c], 0);
  if (!n) return null;
  const r = seeded(seed);
  let sec = 0;
  let value = 0;
  let share = 0;
  const runs = 3;
  for (let k = 0; k < runs; k++) {
    const car = newCar(r, { ...siteCars(at), prestige: prestigeN });
    const rs = newRobots();
    const p = powers(tools);
    const hand = parSec(car, p, PLAYER_STROKES);
    tick(car, 99);
    let t = 0;
    let done = 0;
    let doneAt = 0;
    while (car.stage !== 'finale' && car.stage !== 'done' && t < 3600) {
      robotsStep(car, rs, 0.25, robots, p);
      t += 0.25;
      const pr = progress(car);
      if (pr > done + 1e-6) {
        done = pr;
        doneAt = t;
      } else if (t - doneAt > 20) break;
    }
    const whole = car.stage === 'finale' || car.stage === 'done';
    // A crew short of a trade: the rest of the car waits for it at a hand's pace (a wash bot alone must not earn more a
    // second than the whole crew), and it is paid its share
    sec += (whole ? t : doneAt + (1 - done) * hand) + FLOW.arriveSec + FLOW.finaleSec;
    value += car.value * (whole ? 1 : done);
    share += whole ? 1 : done;
  }
  if (value <= 0) return null;
  return { sec: sec / runs, value: value / runs, share: share / runs };
}

/** A robot keeps this share of its strokes' pace: it moves between spots and waits its turn (set so the rates match the
 * 1.5.0 simulation they replace: within 0.4–1.4× of it from the Shed to Neptune) */
const ROBOT_PACE = 0.38;

/** A garage's sample cars for its crew's pace (seeded: the same two every time) */
const crewCars = new Map<string, Car[]>();
function crewSample(at: string, prestigeN: number): Car[] {
  const key = `${at}|${prestigeN}`;
  let cars = crewCars.get(key);
  if (!cars) {
    const r = seeded(7);
    cars = Array.from({ length: 2 }, () => newCar(r, { ...siteCars(at), prestige: prestigeN }));
    crewCars.set(key, cars);
  }
  return cars;
}

/**
 * One crew's pace from the numbers (the balance's estimate: a robot's work a second from its rate and its tool's
 * strength and reach; a trade with no robot waits at a hand's pace and isn't paid) — no simulation: it ran at boot for
 * every garage and froze a returning player's first screen for 11 s on a slow phone (1.5.1)
 */
function crewOnce(at: string, tools: Record<Cat, number>, robots: Record<Cat, number>, prestigeN: number): { perSec: number; carsPerSec: number } {
  const p = powers(tools);
  let sec = 0;
  let value = 0;
  let share = 0;
  const cars = crewSample(at, prestigeN);
  for (const car of cars) {
    let t = FLOW.arriveSec + FLOW.finaleSec;
    let done = 0;
    for (const l of car.layers) {
      const c = LAYER_CAT[l.kind];
      const n = layerStrokes(car, l, p[c]);
      const rs = robots[c] * ROBOTS[c].rate * ROBOT_PACE;
      if (rs > 0) {
        t += n / rs;
        done += l.total;
      } else t += n / PLAYER_STROKES;
    }
    const w = p.wrench.strength;
    const tasks = [...car.parts, ...car.engine, ...car.thrusters];
    // Wrench strokes: a task its work over the wrench's strength; a dent its pull; a wheel ≈ 12 actions (nuts, the repair)
    const taskStrokes = tasks.reduce((a, x) => a + Math.ceil(x.work / w), 0) + car.dents.reduce((a, d) => a + d.work / w / 3, 0) + car.wheels.length * 12;
    const taskWork = tasks.reduce((a, x) => a + x.work, 0) + car.dents.reduce((a, d) => a + d.work, 0) + car.wheels.length * wheelWorkOf(car.layers, car.hard);
    const rsT = robots.wrench * ROBOTS.wrench.rate * ROBOT_PACE;
    if (rsT > 0) {
      t += taskStrokes / rsT;
      done += taskWork;
    } else t += tasks.reduce((a, x) => a + Math.ceil(x.work / w) / Math.min(PLAYER_STROKES, 4) + 0.4, 0) + car.dents.reduce((a, d) => a + d.work / w / 14 + 0.6, 0) + car.wheels.length * 8;
    const frac = Math.min(1, done / Math.max(1e-9, car.workTotal));
    sec += t;
    value += car.value * frac;
    share += frac;
  }
  return value > 0 ? { perSec: value / sec, carsPerSec: share / sec } : { perSec: 0, carsPerSec: 0 };
}

/**
 * A garage's crew alone: $ a second and cars' worth of work a second (no stars). A robot never lowers it: the crew earns
 * at least what it would without any one of its trades (a slow robot on a car the hand would finish faster — the
 * foreman lets a robot do only what pays). Cached
 */
const crewRates = new Map<string, { perSec: number; carsPerSec: number }>();
export function crewRate(at: string, tools: Record<Cat, number>, robots: Record<Cat, number>, prestigeN: number): { perSec: number; carsPerSec: number } {
  const key = `${at}|${prestigeN}|${CATS.map((c) => `${tools[c]}.${robots[c]}`).join(',')}`;
  let out = crewRates.get(key);
  if (out) return out;
  out = CATS.some((c) => robots[c] > 0) ? crewOnce(at, tools, robots, prestigeN) : { perSec: 0, carsPerSec: 0 };
  for (const c of CATS) {
    if (!robots[c]) continue;
    const sub = crewRate(at, tools, { ...robots, [c]: 0 }, prestigeN);
    if (sub.perSec > out.perSec) out = sub;
  }
  crewRates.set(key, out);
  return out;
}

export interface Offline {
  sec: number;
  cars: number;
  money: number;
  /** Each garage's share (its counters get it when collected) */
  bySite?: Record<string, { cars: number; money: number }>;
}

export function offline(s: Save, now: number): Offline | null {
  if (!s.seen) return null;
  const away = Math.min(OFFLINE.maxHours * 3600, (now - s.seen) / 1000);
  if (away < OFFLINE.minSec) return null;
  // Every garage of the network: its robots at their pace, at the away share
  let cars = 0;
  let money = 0;
  const bySite: Record<string, { cars: number; money: number }> = {};
  for (const id of Object.keys(s.sites)) {
    const st = s.sites[id];
    const cr = crewRate(id, st.tools, st.robots, s.prestige);
    if (!cr.perSec) continue;
    const t = away * OFFLINE.share;
    // Cars' worth of work: a crew short of a trade did part of each
    const done = Math.floor(t * cr.carsPerSec);
    const m = Math.round(t * cr.perSec * starMult(s));
    cars += done;
    money += m;
    if (m) bySite[id] = { cars: done, money: m };
  }
  if (money < 1) return null;
  cars = Math.max(1, cars);
  return { sec: away, cars, money: Math.round(money), bySite };
}

// --- Coming back: the days in a row, the day's order, what the robots earn meanwhile (the owner, 2026-10-14: D1)

/**
 * The first visit of a day: the streak goes on (yesterday's key) or starts over at 1, and today's reward waits to be
 * collected. Never framed as a loss: what is waiting, not what was missed. Returns whether a reward is waiting
 */
export function visitDay(s: Save, today: string, yesterday: string): boolean {
  if (s.streak.day !== today) {
    s.streak = { day: today, n: s.streak.day === yesterday ? s.streak.n + 1 : 1, claimed: false };
  }
  return !s.streak.claimed;
}
/** Minutes of income the day's reward is worth: 1 on the first day, 1 more each day in a row, up to 7 */
export const streakMinutes = (n: number): number => 1 + Math.min(6, Math.max(0, n - 1));

/** Cars of the day's profile an order asks for */
export const ORDER_NEED = 3;
/** The day's order (from the day's seed, among the profiles the garage gets); a new day brings a new one */
export function dayOrder(s: Save, today: string): Save['order'] {
  if (s.order.day !== today) {
    const open = PROFILES.filter((p) => PROFILE[p].opens <= s.garage);
    const r = seeded(daySeed(today, 'garage-evolution-order'));
    s.order = { day: today, profile: open[Math.floor(r() * open.length) % open.length], n: 0, done: false };
  }
  return s.order;
}
/** A restored car counts toward the day's order: 'progress', 'done' (the reward is due), or null */
export function orderCount(s: Save, car: Car, today: string): 'progress' | 'done' | null {
  const o = dayOrder(s, today);
  if (o.done || car.profile !== o.profile) return null;
  o.n++;
  if (o.n >= ORDER_NEED) {
    o.done = true;
    return 'done';
  }
  return 'progress';
}

/** What the robots earn in an hour while the player is away (0: no robots) */
export function awayPerHour(s: Save): number {
  return Math.round(networkRate(s) * 3600 * OFFLINE.share);
}
