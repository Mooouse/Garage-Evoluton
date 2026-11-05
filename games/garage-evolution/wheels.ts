// The wheel job (the owner, 2026-10-10: «колёса тоже требуют каких-то действий от игрока»): a damaged wheel is worked
// in the tyre bay step by step, each with its own action — undo the nuts in a star pattern, find the leak with water
// and plug it (a flat) / pull a new tyre on (a bald one) / hammer out the dents (a bent rim), pump to the green zone,
// balance (tap when the heavy spot is on top), fit it and tighten the nuts in the star order. Pure: the page, the bot
// and the tests play the same rules. Angles are radians, 0 on top, clockwise.

import type { Rand } from './sim.ts';

export type WheelDamage = 'flat' | 'bald' | 'bent';
export type WheelStep = 'nutsOff' | 'find' | 'plug' | 'tyre' | 'dents' | 'pump' | 'balance' | 'nutsOn' | 'done';

export interface WheelJob {
  /** Which wheel of the vehicle */
  wheel: number;
  damage: WheelDamage;
  step: WheelStep;
  /** Seconds in this step */
  st: number;
  nuts: number;
  /** The star order: the nut to undo/tighten next is order[nut] */
  order: number[];
  nut: number;
  /** The leak's angle, and how much of it the water has shown (0–1: bubbles appear) */
  leak: number;
  found: number;
  /** Dent angles still to hammer (a bent rim), pulls left on the new tyre */
  dents: number[];
  pulls: number;
  /** Pressure 0…1.3: the green zone, a pop over 1 */
  pressure: number;
  /** Balance: the heavy spot's angle, its spin speed, hits still needed */
  heavy: number;
  spin: number;
  hits: number;
  /** Mistakes (a wrong nut, a pop, a missed balance tap): none keeps the Perfect */
  mistakes: number;
  /** Was any step done by a robot (no Perfect then) */
  robot: boolean;
  /** The rim fitted at the end (the album's rim row) */
  rim: string;
  /** A pop happened just now (the page shows it), and the last balance tap (hit or miss) */
  popped: boolean;
  lastTap: 'hit' | 'miss' | null;
}

export const GREEN: [number, number] = [0.72, 0.88];
/** Within this angle of the top a balance tap hits */
export const BALANCE_TOL = 0.42;
/** Pump rate (pressure a second while held) */
export const PUMP_RATE = 0.7;

/** The rims a wheel can get, with their weights (rarity) — the album's rim row */
export const RIMS = [
  { id: 'steel', weight: 30 },
  { id: 'classic', weight: 24 },
  { id: 'mesh', weight: 16 },
  { id: 'spoke', weight: 12 },
  { id: 'chrome', weight: 9 },
  { id: 'racing', weight: 6 },
  { id: 'turbine', weight: 2.5 },
  { id: 'gold', weight: 0.8 },
] as const;
export type RimId = (typeof RIMS)[number]['id'];

/** The star pattern for n nuts: every other one (4: 0 2 1 3; 5: 0 2 4 1 3; 6: 0 3 1 4 2 5 → opposite pairs) */
export function starOrder(n: number): number[] {
  if (n === 4) return [0, 2, 1, 3];
  if (n === 6) return [0, 3, 1, 4, 2, 5];
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push((i * 2) % n);
  return out;
}

export function newWheelJob(r: Rand, wheel: number, damage: WheelDamage, nuts = 5, first = false): WheelJob {
  // Repairs restore the exact wheel that arrived on this particular
  // car, never a random aftermarket rim. Keep the saved field for backwards
  // compatibility with older sessions.
  return {
    wheel, damage, step: 'nutsOff', st: 0, nuts, order: starOrder(nuts), nut: 0,
    leak: first ? Math.PI * 0.6 : r() * Math.PI * 2, found: 0,
    dents: damage === 'bent' ? [r() * 6.28, r() * 6.28, r() * 6.28].slice(0, 2 + Math.floor(r() * 2)) : [],
    pulls: 3, pressure: damage === 'flat' ? 0.05 : 0.3,
    heavy: r() * Math.PI * 2, spin: 3.6 + r() * 0.8, hits: 1,
    mistakes: 0, robot: false, rim: 'factory', popped: false, lastTap: null,
  };
}

const angDist = (a: number, b: number) => {
  const d = (((a - b) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return Math.abs(d);
};

/**
 * The steps of a damage: the nuts off, its own work, the nuts on — a flat is found, plugged and pumped, a bald tyre
 * pulled on, a bent rim hammered and balanced. Every wheel had all seven steps and the bay outlasted the scrub (14 s
 * against 10 s a car: the designer, 1.5.0)
 */
export function stepsOf(damage: WheelDamage): WheelStep[] {
  const own: WheelStep[] = damage === 'flat' ? ['find', 'plug', 'pump'] : damage === 'bald' ? ['tyre'] : ['dents', 'balance'];
  return ['nutsOff', ...own, 'nutsOn', 'done'];
}

function next(job: WheelJob): void {
  const seq = stepsOf(job.damage);
  const i = seq.indexOf(job.step);
  job.step = seq[Math.min(seq.length - 1, i + 1)];
  job.st = 0;
  job.nut = 0;
}

export type WheelAction =
  /** A tap on nut i (0…nuts-1) */
  | { kind: 'nut'; i: number }
  /** Water sprayed at an angle on the tyre */
  | { kind: 'spray'; angle: number }
  /** A tap at an angle on the tyre or rim (the bubbles, a dent, the new tyre's edge) */
  | { kind: 'tap'; angle: number }
  /** A tap anywhere (balance) */
  | { kind: 'any' };

export interface WheelResult {
  ok: boolean;
  /** What happened, for the page's effects and sounds */
  what: 'nut' | 'wrongNut' | 'bubbles' | 'plug' | 'pull' | 'dent' | 'hit' | 'miss' | 'none';
  /** The step changed */
  stepDone?: WheelStep;
}

/** One action of the player (or a robot: `robot` true) */
export function wheelAct(job: WheelJob, a: WheelAction, robot = false, nutsPerTap = 1): WheelResult {
  if (robot) job.robot = true;
  const done = (what: WheelResult['what']): WheelResult => {
    const s = job.step;
    next(job);
    return { ok: true, what, stepDone: s };
  };
  switch (job.step) {
    case 'nutsOff':
    case 'nutsOn': {
      if (a.kind !== 'nut') return { ok: false, what: 'none' };
      const want = job.order[job.nut];
      if (a.i !== want) {
        // A nut out of order still turns (it isn't blocked), but the star pattern is broken: no Perfect
        job.mistakes++;
        return { ok: false, what: 'wrongNut' };
      }
      // A better wrench turns more nuts a tap (the next ones in the star order)
      job.nut += Math.max(1, nutsPerTap);
      if (job.nut >= job.nuts) return done('nut');
      return { ok: true, what: 'nut' };
    }
    case 'find': {
      if (a.kind !== 'spray') return { ok: false, what: 'none' };
      const d = angDist(a.angle, job.leak);
      // Water near the leak makes it bubble: closer shows more
      if (d < 1.0) job.found = Math.min(1, job.found + (1.0 - d) * 1.1);
      if (job.found >= 1) return done('bubbles');
      return { ok: true, what: d < 1.0 ? 'bubbles' : 'none' };
    }
    case 'plug': {
      if (a.kind !== 'tap') return { ok: false, what: 'none' };
      if (angDist(a.angle, job.leak) < 0.6) return done('plug');
      return { ok: false, what: 'none' };
    }
    case 'tyre': {
      if (a.kind !== 'tap' && a.kind !== 'any') return { ok: false, what: 'none' };
      job.pulls--;
      if (job.pulls <= 0) return done('pull');
      return { ok: true, what: 'pull' };
    }
    case 'dents': {
      if (a.kind !== 'tap') return { ok: false, what: 'none' };
      const i = job.dents.findIndex((d) => angDist(a.angle, d) < 0.55);
      if (i < 0) return { ok: false, what: 'none' };
      job.dents.splice(i, 1);
      if (!job.dents.length) return done('dent');
      return { ok: true, what: 'dent' };
    }
    case 'balance': {
      if (a.kind !== 'any' && a.kind !== 'tap') return { ok: false, what: 'none' };
      // Robots wait for the moment; a hand can miss
      if (angDist(job.heavy, 0) < BALANCE_TOL || robot) {
        job.hits--;
        job.lastTap = 'hit';
        // The weight evens it out: the heavy spot moves on
        job.heavy += Math.PI * 0.9;
        if (job.hits <= 0) return done('hit');
        return { ok: true, what: 'hit' };
      }
      job.mistakes++;
      job.lastTap = 'miss';
      return { ok: false, what: 'miss' };
    }
    default:
      return { ok: false, what: 'none' };
  }
}

/**
 * Time passes in the bay: the wheel spins on the balancer; the pump fills while held. Releasing the pump in the green
 * zone finishes the step; let go above it and the valve lets the extra out into the green; over 1 the tyre pops (back to
 * empty, a mistake). Returns the finished step, if one finished.
 */
export function wheelTick(job: WheelJob, dt: number, pumping: boolean, pumpRate = PUMP_RATE): WheelStep | null {
  job.st += dt;
  job.popped = false;
  if (job.step === 'balance') job.heavy = (job.heavy + job.spin * dt) % (Math.PI * 2);
  if (job.step === 'pump') {
    if (pumping) {
      job.pressure += pumpRate * dt;
      if (job.pressure > 1.02) {
        job.pressure = 0.1;
        job.mistakes++;
        job.popped = true;
      }
    } else if (job.pressure > GREEN[1]) {
      // Let go above the green: the valve lets the extra out, down into the green (it never got stuck there)
      job.pressure = Math.max(GREEN[1] - 0.01, job.pressure - 0.25 * dt);
    } else if (job.pressure >= GREEN[0]) {
      next(job);
      return 'pump';
    }
  }
  return null;
}

/** A wheel job's share done (for the condition and the progress ring) */
export function wheelProgress(job: WheelJob): number {
  // The progress bar must use the exact sequence used by the wheel job.
  // Previously 'pump' and 'balance' were counted even for tyre-only jobs,
  // causing false completion percentages and skipped/negative steps.
  const seq = stepsOf(job.damage);
  return Math.max(0, seq.indexOf(job.step)) / Math.max(1, seq.length - 1);
}

/** A robot's action on the job: the right one, every time (they don't earn Perfect) */
export function robotWheelAct(job: WheelJob, dt: number): WheelResult | null {
  switch (job.step) {
    case 'nutsOff':
    case 'nutsOn':
      return wheelAct(job, { kind: 'nut', i: job.order[job.nut] }, true);
    case 'find':
      return wheelAct(job, { kind: 'spray', angle: job.leak }, true);
    case 'plug':
      return wheelAct(job, { kind: 'tap', angle: job.leak }, true);
    case 'tyre':
      return wheelAct(job, { kind: 'any' }, true);
    case 'dents':
      return wheelAct(job, { kind: 'tap', angle: job.dents[0] }, true);
    case 'pump': {
      job.robot = true;
      job.pressure = Math.min(GREEN[1] - 0.04, job.pressure + 0.35);
      wheelTick(job, dt, job.pressure < GREEN[0] + 0.02);
      return { ok: true, what: 'none' };
    }
    case 'balance':
      return wheelAct(job, { kind: 'any' }, true);
    default:
      return null;
  }
}
