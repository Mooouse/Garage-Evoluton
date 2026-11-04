// The balance bot: plays the real rules (sim.ts) like an average player — about six strokes a second over the dirt,
// scrubbing on from the last spot — and buys the way a new player does (the cheapest thing first) or a careful one (the
// most income per dollar). balance() is what `gp balance` and `gp qa` read against the channel's targets;
// balanceModel() is the same economy as tables, in the anchor (income a minute). sim.test.ts pins both.

import { meanCurve, type BalanceReport, type BuyerCurve } from '@gp/core';
import type { BalanceModel, ModelItem, ModelStage } from '@gp/core/balance-model';
import { CATS, FLOW, GARAGES, PRESTIGE, LAYER_CAT, PLAYER_STROKES, ROBOTS, SESSION_MIN, SITE, SITES, TIER_EVERY, TOOLS, robotPrice, starsFor, toolPower, toolPrice, type Cat } from './data.ts';
import { backgroundRate, buy, earn, purse, canPrestige, siteCars, newSave, prestige, priceOf, restore, type Buy, type Save } from './economy.ts';
import { MODELS } from './models.ts';
import { GRID } from './data.ts';
import { currentLayerIndex, currentWheel, newCar, newRobots, parSec, powers, pullDent, releaseDent, robotsStep, seeded, stageTasks, stroke, tick, topAt, wheelHand, wheelTime, type Car, type Rand } from './sim.ts';

/** One car played by the bot: seconds it took (arrival to the card) */
export function playCar(car: Car, s: Save, r: Rand, strokes = PLAYER_STROKES): number {
  const p = powers(s.tools);
  const rs = newRobots();
  const dt = 1 / strokes;
  let t = 0;
  let last = -1;
  const cells: number[] = [];
  for (let i = 0; i < car.mask.length; i++) if (car.mask[i]) cells.push(i);
  tick(car, FLOW.arriveSec);
  t += FLOW.arriveSec;
  while (car.stage !== 'finale' && car.stage !== 'done' && t < 1800) {
    if (car.stage === 'surface') {
      // Scrub on near the last spot, or find another dirty spot
      let target = -1;
      for (let k = 0; k < 24 && target < 0; k++) {
        const i = last >= 0 && k < 12 ? last + Math.round((r() - 0.5) * 12) + GRID.w * Math.round((r() - 0.5) * 6) : cells[Math.floor(r() * cells.length)];
        if (i >= 0 && i < car.mask.length && car.mask[i] && topAt(car, i) === currentLayerIndex(car)) target = i;
      }
      if (target < 0) target = cells.find((i) => topAt(car, i) === currentLayerIndex(car)) ?? -1;
      if (target >= 0) {
        stroke(car, (target % GRID.w) + 0.5, Math.floor(target / GRID.w) + 0.5, p, 'hand');
        last = target;
      }
    } else if (car.stage === 'body') {
      // A dent: aim, grab, pull out in one stroke of the arm (≈ 14 cells a second, a reach of ≈ 14 cells); not out
      // yet — let go (it springs back a little) and grab again
      const i = car.dents.findIndex((d) => d.left > 0);
      if (i >= 0) {
        t += 0.4;
        let pulled = 0;
        for (let k = 0; k < 14 && car.dents[i].left > 0 && car.stage === 'body'; k++) {
          pulled += pullDent(car, i, 1, p)?.removed ?? 0;
          robotsStep(car, rs, 1 / 14, s.robots, p, 1, {});
          t += 1 / 14;
        }
        if (car.dents[i].left > 0) releaseDent(car, i, pulled);
      }
      continue;
    } else if (car.stage === 'wheels') {
      // The tyre bay, played at a human's pace (a fine clock: the pump and the balancer need timing)
      t += bayStep(car, r, s, rs, p);
      continue;
    } else {
      // Parts and the engine: a tap on each glowing bolt (a little slower: aiming)
      const task = stageTasks(car).find((x) => x.left > 0);
      if (task && r() < 0.7) stroke(car, task.gx, task.gy, p, 'hand');
    }
    robotsStep(car, rs, dt, s.robots, p, 1, {});
    t += dt;
  }
  tick(car, FLOW.finaleSec);
  return t + FLOW.finaleSec;
}

/** One action of a player in the tyre bay (with the time it took); robots keep working meanwhile */
function bayStep(car: Car, r: Rand, s: Save, rs: ReturnType<typeof newRobots>, p: ReturnType<typeof powers>): number {
  const job = currentWheel(car);
  if (!job) return 0.05;
  const tier = Math.floor(s.tools.wrench / TIER_EVERY);
  const tick = (sec: number, pumping = false) => {
    let t = 0;
    while (t < sec - 1e-9 && car.stage === 'wheels') {
      wheelTime(car, 0.02, pumping, tier);
      robotsStep(car, rs, 0.02, s.robots, p, 1, {});
      t += 0.02;
    }
    return t;
  };
  switch (job.step) {
    case 'nutsOff':
    case 'nutsOn': {
      const wrong = r() < 0.08;
      wheelHand(car, { kind: 'nut', i: wrong ? (job.order[job.nut] + 1) % job.nuts : job.order[job.nut] }, tier);
      return tick(0.35);
    }
    case 'find':
      wheelHand(car, { kind: 'spray', angle: r() * Math.PI * 2 });
      return tick(0.12);
    case 'plug':
      wheelHand(car, { kind: 'tap', angle: job.leak + (r() - 0.5) * 0.4 });
      return tick(0.5);
    case 'tyre':
      wheelHand(car, { kind: 'any' });
      return tick(0.35);
    case 'dents':
      wheelHand(car, { kind: 'tap', angle: job.dents[0] + (r() - 0.5) * 0.3 });
      return tick(0.5);
    case 'pump': {
      // Hold until the needle reaches the player's aim (a little noisy), then let go
      const aim = 0.8 + (r() - 0.5) * 0.14;
      let t = 0;
      while (car.stage === 'wheels' && job.step === 'pump' && job.pressure < aim && t < 6) t += tick(0.02, true);
      return t + tick(0.25, false);
    }
    case 'balance': {
      // Wait for the heavy spot to come up (a reaction error), then tap
      const err = (r() - 0.5) * 0.7;
      let t = 0;
      while (car.stage === 'wheels' && job.step === 'balance' && Math.abs(((job.heavy - err + Math.PI) % (Math.PI * 2)) - Math.PI) > 0.08 && t < 4) t += tick(0.02);
      wheelHand(car, { kind: 'any' });
      return t + tick(0.3);
    }
    default:
      return tick(0.1);
  }
}

/** Seconds on the RESTORED card before the next car (a player taps Next) */
const CARD_SEC = 1.4;

// --- The income estimate (the anchor: $ a minute), from sample cars of the garage level: what the careful buyer and the
// model read. Hand and robots work together; each layer at the pace of its tools.

const samples = new Map<string, Car[]>();
function sampleCars(at: string, prestigeN: number): Car[] {
  const key = `${at}:${prestigeN}`;
  let list = samples.get(key);
  if (!list) {
    const site = SITE.get(at)!;
    const r = seeded(4242 + site.tier * 17 + SITES.indexOf(site));
    list = Array.from({ length: 4 }, () => newCar(r, { ...siteCars(at), prestige: prestigeN }));
    samples.set(key, list);
  }
  return list;
}

export function estimate(s: Save): { secPerCar: number; value: number; perMin: number } {
  const p = powers(s.tools);
  let sec = 0;
  let value = 0;
  const cars = sampleCars(s.at, s.prestige);
  for (const car of cars) {
    const hand = parSec(car, p, PLAYER_STROKES);
    // Robots: their strokes a second, weighted by the share of the car's work that is theirs
    let robotsWork = 0;
    let handWork = 0;
    for (const l of car.layers) {
      const c = LAYER_CAT[l.kind];
      const pw = p[c];
      const per = Math.PI * pw.radius * (pw.radius / car.aspect) * 0.5 * Math.min(pw.strength, 1.6);
      robotsWork += s.robots[c] * ROBOTS[c].rate * 0.8 * per;
      handWork += PLAYER_STROKES * per;
    }
    const n = Math.max(1, car.layers.length);
    const share = robotsWork / n / Math.max(1e-9, handWork / n + robotsWork / n);
    sec += hand * (1 - share) + FLOW.arriveSec + FLOW.finaleSec + CARD_SEC;
    value += car.value;
  }
  sec /= cars.length;
  value = (value / cars.length) * (1 + PRESTIGE.perStar * s.stars);
  // The garages the player is not in keep earning
  return { secPerCar: sec, value, perMin: (value / sec) * 60 + backgroundRate(s) * 60 };
}

// --- A campaign: cars until the space hangar is built in the second life

export interface Campaign {
  curve: BuyerCurve;
  minutes: number;
  cars: number;
  /** Minute each garage level was reached; the prestige */
  garageMin: number[];
  prestigeMin: number | null;
  /** Minute of every prestige */
  prestiges: number[];
  /** The first purchase in seconds, the first car in seconds */
  firstBuySec: number | null;
  firstCarSec: number;
  save: Save;
  /** [minute, what] of every new thing */
  news: [number, string][];
  /** Per garage level (of the last life it was played in): minutes, cars, money earned */
  levels: { min: number; cars: number; earned: number }[];
  /** Every purchase of the first life: when, what, its price and the income a minute before and after it */
  buys: { min: number; id: string; price: number; before: number; after: number }[];
  /** The income a minute after every car of the first life (money earned per minute of play, smoothed) */
  income: [number, number][];
}

const BUYS: Buy[] = [...CATS.map((cat): Buy => ({ kind: 'tool', cat })), ...CATS.map((cat): Buy => ({ kind: 'robot', cat })), { kind: 'garage' }];

function shop(s: Save, buyer: 'cheap' | 'careful', onBuy: (b: Buy, price: number) => void): void {
  for (let guard = 0; guard < 400; guard++) {
    const open = BUYS.map((b) => ({ b, p: priceOf(s, b) })).filter((x): x is { b: Buy; p: number } => x.p !== null && x.p <= purse(s, x.b));
    if (!open.length) return;
    let pick: { b: Buy; p: number };
    if (buyer === 'cheap') pick = open.reduce((a, b) => (b.p < a.p ? b : a));
    else {
      const base = estimate(s).perMin;
      const gain = (x: { b: Buy; p: number }) => {
        const t = structuredClone(s);
        buy(t, x.b);
        return (estimate(t).perMin - base) / x.p;
      };
      pick = open.reduce((a, b) => (gain(b) > gain(a) ? b : a));
    }
    buy(s, pick.b);
    onBuy(pick.b, pick.p);
  }
}

export function campaign(seed = 1, buyer: 'cheap' | 'careful' = 'cheap', maxMin = 700): Campaign {
  const r = seeded(seed);
  const s = newSave();
  let sec = 0;
  let cars = 0;
  let firstBuySec: number | null = null;
  let firstCarSec = 0;
  const garageMin = [0];
  let prestigeMin: number | null = null;
  const prestiges: number[] = [];
  const news: [number, string][] = [];
  const goalsMin: number[] = [];
  const found = new Set<string>();
  const note = (what: string) => {
    news.push([sec / 60, what]);
    goalsMin.push(sec / 60);
  };
  let finishMin: number | null = null;
  const levels = SITES.map(() => ({ min: 0, cars: 0, earned: 0 }));
  const siteIdx = () => SITES.findIndex((x) => x.id === s.at);
  const buys: Campaign['buys'] = [];
  const income: [number, number][] = [];
  while (sec / 60 < maxMin) {
    const lv = levels[siteIdx()];
    const before = s.money;
    const first = cars === 0 && s.prestige === 0;
    // The game's first car is always the Bramble (main.ts), so is the bot's
    const car = newCar(r, { ...siteCars(s.at), found, first, model: first ? 'glide' : undefined, prestige: s.prestige });
    const t = playCar(car, s, r);
    sec += t + CARD_SEC;
    // The other garages' robots earned meanwhile
    const bg = backgroundRate(s) * (t + CARD_SEC);
    earn(s, bg);
    s.stats.earned += bg;
    cars++;
    if (cars === 1) firstCarSec = t;
    restore(s, car, t, false);
    lv.min += (t + CARD_SEC) / 60;
    lv.cars++;
    lv.earned += s.money - before;
    if (!found.has(car.model.id)) {
      found.add(car.model.id);
      note(`model ${car.model.id}`);
    }
    const firstLife = s.prestige === 0;
    let est = firstLife ? estimate(s).perMin : 0;
    if (firstLife) income.push([sec / 60, est]);
    shop(s, buyer, (b, price) => {
      if (firstLife) {
        const after = estimate(s).perMin;
        const id = b.kind === 'garage' ? `garage-${siteIdx() + 1}` : b.kind === 'tool' ? `${b.cat}-${s.tools[b.cat]}` : `${ROBOTS[b.cat].id}-${s.robots[b.cat]}`;
        buys.push({ min: sec / 60, id, price, before: est, after });
        est = after;
      }
      firstBuySec ??= sec;
      if (b.kind === 'garage') {
        garageMin[siteIdx()] ??= sec / 60;
        note(`garage ${s.at}`);
      } else if (b.kind === 'robot' && s.robots[b.cat] === 1) note(`robot ${b.cat}`);
      else if (b.kind === 'tool' && s.tools[b.cat] % TIER_EVERY === 0) note(`tool ${b.cat} tier ${s.tools[b.cat] / TIER_EVERY}`);
    });
    if (s.garage >= GARAGES.length) {
      finishMin = sec / 60;
      break;
    }
    // The prestige once it at least doubles the stars (4 the first time): the network's later garages need them
    if (canPrestige(s) && starsFor(s.life) >= Math.max(4, s.stars)) {
      prestige(s);
      prestigeMin ??= sec / 60;
      prestiges.push(sec / 60);
      note('prestige');
    }
  }
  const curve: BuyerCurve = {
    firstPurchaseRun: 1,
    firstPurchaseMin: firstBuySec === null ? null : firstBuySec / 60,
    finishMin,
    finishRun: finishMin === null ? null : cars,
    goalsMin,
  };
  return { curve, minutes: sec / 60, cars, garageMin, prestigeMin, prestiges, firstBuySec, firstCarSec, save: s, news, levels, buys, income };
}

/**
 * Space after the campaign: the same player goes on from the Moon hangar, buying the cheapest first (a new garage as soon
 * as it is affordable), playing in the newest garage. The minute each space garage opens, counted from the hangar
 */
export function spaceRun(seed = 1, maxMin = 600): { opened: [string, number][]; minutes: number } {
  const c = campaign(seed, 'cheap');
  const s = c.save;
  const r = seeded(seed * 7 + 1);
  const found = new Set(Object.keys(s.album));
  const opened: [string, number][] = [];
  let sec = 0;
  while (sec / 60 < maxMin && SITES.some((x) => !s.sites[x.id])) {
    const car = newCar(r, { ...siteCars(s.at), found, prestige: s.prestige });
    const t = playCar(car, s, r);
    sec += t + CARD_SEC;
    const bg = backgroundRate(s) * (t + CARD_SEC);
    earn(s, bg);
    restore(s, car, t, false);
    found.add(car.model.id);
    shop(s, 'cheap', (b) => {
      if (b.kind === 'garage') opened.push([s.at, sec / 60]);
    });
  }
  return { opened, minutes: sec / 60 };
}

/** The balance report the platform checks (gp balance, gp qa): this game's own bots on the real rules */
export function balance(): BalanceReport {
  const seeds = [1, 2, 3];
  const cheap = seeds.map((x) => campaign(x, 'cheap'));
  const careful = seeds.map((x) => campaign(x, 'careful'));
  const fresh = estimate(newSave()).perMin;
  const full = newSave();
  full.garage = 5;
  for (const c of CATS) {
    full.tools[c] = 5 * TIER_EVERY;
    full.robots[c] = GARAGES[4].slots;
  }
  return {
    measure: 'income a minute ($/min): a fresh Shed against a finished first life (the Plant, every tool and robot)',
    fresh,
    full: estimate(full).perMin,
    cheap: meanCurve(cheap.map((c) => c.curve)),
    careful: meanCurve(careful.map((c) => c.curve)),
    dead: [],
    note: `3 seeds × the real rules; the first car in ${cheap[0].firstCarSec.toFixed(0)} s; garages at ${cheap[0].garageMin.map((m) => m.toFixed(1)).join(' / ')} min; prestige at ${cheap[0].prestigeMin?.toFixed(1) ?? '—'} min`,
  };
}

// --- The model: the same economy as tables (the platform's @gp/core/balance-model), in the anchor

/**
 * Stages are the vehicle models in the order a player meets them (a new model is news); each garage level's first
 * model has the garage's price as its entry. Power is income a minute at the Shed's prices: the work a minute the player
 * and robots do (hand strokes × the tools' strength), and a stage's difficulty is the work a minute its car needs to be
 * restored in its target time. Items are the tool levels and the robots, each multiplying the work a minute by what
 * it adds to its share of the car's work.
 */
export function balanceModel(o: { stage?: number; attempt?: number } = {}): BalanceModel {
  // The tables come from the game's own economy as the cheapest-first player meets it in the first life: every
  // purchase with its price and the income a minute it adds (estimate(): the real tools, robots and cars), and the
  // work in stages of 1.5 minutes — the batch of cars the player restores in that time.
  const c = campaign(1, 'cheap');
  const end = c.prestigeMin ?? c.minutes;
  const fresh = c.income[0]?.[1] ?? 1;
  // Power is the income a minute (the bot's estimate: the real tools, robots and cars). The purchases come in the bot's
  // order (each needs the one before it): in the network a new garage dips the income (its own fresh tools, harder
  // cars) until its tools are bought — the model's power follows that exactly, dips included
  // The model's power never falls: through a dip it holds (each purchase still adds a little), then each purchase adds
  // what lifts the income past the best so far
  const path: number[] = [];
  let held = fresh;
  for (const b of c.buys) {
    held = Math.max(held * 1.0005, b.after);
    path.push(held);
  }
  const items: ModelItem[] = c.buys.map((b, i) => {
    const garage = b.id.startsWith('garage');
    return {
      id: `${b.id}#${i}`,
      cost: b.price,
      mult: Math.round((path[i] / (i ? path[i - 1] : fresh)) * 1e5) / 1e5,
      ...(i > 0 ? { requires: `${c.buys[i - 1].id}#${i - 1}` } : {}),
      ...(garage ? { goal: true, news: { kind: 'unlock' as const, weight: 2 } } : /-(10|20|30|40|50)$/.test(b.id) ? { news: { kind: 'item' as const, weight: 1 } } : /bot-1$|arm-1$|drone-1$|booth-1$/.test(b.id) ? { news: { kind: 'item' as const, weight: 1 } } : {}),
    };
  });
  const pEnd = (path[path.length - 1] ?? fresh) / fresh;
  // Batches of 2 minutes, an attempt a minute: the platform's session-end check samples one instant, and this layout
  // keeps a goal ≥ 60 % reached at every instant from 13.5 to 16.5 min (a sweep of stage 1–3 × attempt 0.6–1.2; the
  // 1-minute batches passed or failed by where minute 15 fell)
  const STAGE = o.stage ?? 2;
  const ATTEMPT = o.attempt ?? 1;
  const stages: ModelStage[] = [];
  for (let k = 0; (k + 1) * STAGE <= end + 1e-9; k++) {
    const t0 = k * STAGE;
    // The power the player needs: a smooth exponential through the start and the bot's best at the prestige
    const p = Math.exp((Math.log(pEnd) * t0) / end);
    const inc = fresh * p;
    const news = c.news.find(([m, what]) => m > t0 && m <= t0 + STAGE && what.startsWith('model'));
    stages.push({
      id: `batch-${k + 1}`,
      difficulty: Math.round(p * 0.72 * 1000) / 1000,
      // An attempt (ATTEMPT min) wins about 73 % (power 1.39× the difficulty): the expected coins a minute = the income
      reward: Math.round((inc * ATTEMPT) / 0.81),
      minutes: ATTEMPT,
      news: { kind: news ? ("stage" as const) : ("stage" as const), weight: 1 },
    });
  }
  const power = 1;
  void power;
  return {
    start: { power: 1 },
    stages,
    items,
    measure: 'income a minute ($/min): what the tools, robots and garage level bought so far earn',
    win: { steepness: 3 },
    overheadMin: 0,
    sessionMin: SESSION_MIN,
  };
}
