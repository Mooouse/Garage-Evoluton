// The vehicle catalogue: the owner's 50 legendary cars (docs/cars-list.md), each drawn after its real model and a
// little changed, with a name of its own — never a misspelt brand, no logos or lettering — plus the garage's work
// vehicles, heavy machines and spacecraft. Pure data and geometry: no DOM, so the simulation, the bot and the tests read the same
// silhouettes the art draws.
//
// Coordinates: x from 0 (the rear) to 1 (the nose, the car faces right), y UP from the ground, both in units of the
// vehicle's length. A point is [x, y, r]: r is the corner's rounding in the same units.

import { PAINTED, type PaintedMeta } from './painted/meta.ts';

export type Pt = [number, number, number?];
export type VehicleClass = 'car' | 'sport' | 'truck' | 'special' | 'moto' | 'heavy' | 'space';
export type HeadKind = 'round' | 'rect' | 'popup' | 'slim' | 'dual' | 'none';

export interface Wheel {
  x: number;
  r: number;
  /** Centre height above r (lifted off-roaders, the space cradle) */
  lift?: number;
}

export interface Lamp {
  x: number;
  y: number;
  w: number;
  h: number;
  kind?: HeadKind;
}

export interface Detail {
  kind: 'line' | 'bar' | 'engine' | 'trim' | 'tone' | 'flare' | 'curve' | 'seat' | 'swoosh' | 'dome' | 'grille' | 'stripe' | 'chrome' | 'dark' | 'light' | 'vent' | 'exhaust' | 'lightbar' | 'ladder' | 'rack' | 'spare' | 'spoiler' | 'blade' | 'boom' | 'dish' | 'glyph' | 'flame' | 'panel' | 'number';
  pts?: Pt[];
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  color?: string;
}

export interface Thruster {
  x: number;
  y: number;
  r: number;
  down?: boolean;
}

export interface VehicleShape {
  body: Pt[];
  windows: Pt[][];
  wheels: Wheel[];
  head: Lamp;
  tail: Lamp;
  /** Bumper bars [x0, y0, x1, y1] — parts that can come off */
  bumperF?: [number, number, number, number];
  bumperR?: [number, number, number, number];
  mirror?: [number, number];
  /** Where the engine sits (the diagnostic view) */
  engine: [number, number];
  details: Detail[];
  tracks?: { x0: number; x1: number; h: number };
  /** The roof line's height, for fitting */
  height: number;
  /** A spacecraft's engine nozzles (it has no wheels): the throat on the hull, its radius; the bell points back (−x) or down */
  thrusters?: Thruster[];
  /** A spacecraft's landing legs: [x, the hull's bottom there] — it stands on them */
  legs?: [number, number][];
  /** A painted car's silhouette (without the wheels) as a bit grid: x0/y1 its left and top, w/h its size, in units */
  raster?: { cols: number; rows: number; bits: Uint8Array; x0: number; y1: number; w: number; h: number };
}

export interface Model {
  id: string;
  name: string;
  /** The country and the era in a few words (the album card's subtitle; never the make) */
  kind: string;
  cls: VehicleClass;
  /** The garage level it first arrives at (1–6) */
  level: number;
  /** Base payout in $ for a Common instance in average condition */
  value: number;
  /** The paint colours it comes in */
  colors: string[];
  /** The year of the real model it is drawn after (the "oldest" record) */
  year: number;
  /** The rim it comes on (its real model's wheels) */
  rim?: string;
  shape: VehicleShape;
  /** Drawn from the owner's picture (painted/), not from the shape */
  painted?: boolean;
  /** The respray's rare colour (a painted car: one that recolours cleanly) */
  rare?: string;
  /** Its engines' flame (a spacecraft; default the orange of a chemical rocket) */
  flame?: string;
  /** No longer arrives (a drawn car the owner's pictures replaced): kept for the saves that found it */
  retired?: boolean;
  /** A painted car's former shape: its surface sets how much work the car is (the picture's own surface is larger) */
  drawnShape?: VehicleShape;
  /** A painted car with no former shape: the share of a cell's work it carries */
  work?: number;
  /** How a spacecraft comes in (the owner's table, §8): 'side' flies in through the door on its rear engines; the
   * others come down through the roof hatch */
  dock?: 'side';
}

// --- The profile generator: most cars are a body line, a greenhouse and two wheel arches

interface Profile {
  /** Body bottom (sill) */
  sill: number;
  /** Belt line: where the side windows start */
  belt: number;
  roof: number;
  /** Hood height at the front edge, and the nose's drop below it */
  hood: number;
  nose?: number;
  /** Rear deck height (trunk lid, hatch base, pickup bed rail) */
  deck: number;
  /** Greenhouse: windshield base x, roof front x, roof rear x, rear glass base x */
  xa: number;
  xrf: number;
  xrr: number;
  xc: number;
  rear: 'notch' | 'hatch' | 'wagon' | 'fast' | 'bed' | 'van';
  /** Corner roundness: nose, tail, roof */
  rn?: number;
  rt?: number;
  rr?: number;
  wheels: Wheel[];
  /** Pillars between side windows (x positions) */
  pillars?: number[];
  head?: Partial<Lamp>;
  tail?: Partial<Lamp>;
  details?: Detail[];
  bumpers?: boolean;
  chromeBumpers?: boolean;
  mirror?: boolean;
}

/** The arch over a wheel: points from the front side to the rear side along the body's bottom */
function arch(w: Wheel, sill: number): Pt[] {
  const cy = w.r + (w.lift ?? 0);
  const ar = w.r * 1.16;
  const out: Pt[] = [];
  // Where the circle crosses the sill line
  const dy = sill - cy;
  const a0 = Math.abs(dy) < ar ? Math.asin(Math.max(-1, Math.min(1, dy / ar))) : 0;
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((Math.PI - 2 * a0) * i) / n;
    out.push([w.x + Math.cos(a) * ar, cy + Math.sin(a) * ar, 0]);
  }
  return out;
}

function profile(p: Profile): VehicleShape {
  const rn = p.rn ?? 0.03;
  const rt = p.rt ?? 0.025;
  const rr = p.rr ?? 0.04;
  const nose = p.nose ?? 0.03;
  const body: Pt[] = [];
  // Rear bottom → up the rear
  body.push([0.004, p.sill + 0.01, rt * 0.6]);
  if (p.rear === 'notch' || p.rear === 'bed') {
    body.push([0, p.deck - 0.012, rt]);
    body.push([0.015, p.deck, rt * 0.6]);
    body.push([p.xc - 0.015, p.deck + (p.rear === 'bed' ? 0 : 0.008), p.rear === 'bed' ? 0.004 : 0.02]);
    if (p.rear === 'bed') body.push([p.xc, p.roof - 0.01, 0.01]);
    body.push([p.xrr, p.roof, rr]);
  } else if (p.rear === 'hatch') {
    body.push([0, p.deck, rt]);
    body.push([p.xrr, p.roof, rr]);
  } else if (p.rear === 'fast') {
    body.push([0, p.deck - 0.01, rt]);
    body.push([0.03, p.deck, rt]);
    body.push([p.xrr, p.roof, rr * 1.4]);
  } else {
    // wagon, van: a nearly vertical rear
    body.push([0, p.roof - 0.02, rr]);
    body.push([p.xrr, p.roof, rr]);
  }
  body.push([p.xrf, p.roof, rr]);
  body.push([p.xa, p.belt + 0.012, 0.02]);
  body.push([0.985, p.hood, rn]);
  body.push([1, p.hood - nose, rn * 0.7]);
  body.push([1, p.sill + 0.02, rn * 0.6]);
  body.push([0.99, p.sill, 0.01]);
  // The bottom, front to rear, with the arches
  const ws = [...p.wheels].sort((a, b) => b.x - a.x);
  for (const w of ws) body.push(...arch(w, p.sill));
  body.push([0.012, p.sill, 0.01]);

  // Windows: the greenhouse inset, split by pillars
  const windows: Pt[][] = [];
  const inset = 0.012;
  const yb = p.belt + 0.016;
  const yr = p.roof - inset * 1.4;
  // The greenhouse's edges as functions of y: rear edge from (xc|xrr) and front edge from xa → xrf
  const rearBase = p.rear === 'wagon' || p.rear === 'van' ? p.xrr : p.xc;
  const frontAt = (y: number) => p.xa + ((p.xrf - p.xa) * (y - p.belt)) / (p.roof - p.belt) - inset;
  const rearAt = (y: number) => rearBase + ((p.xrr - rearBase) * (y - p.belt)) / (p.roof - p.belt) + inset;
  const cuts = [rearAt, ...(p.pillars ?? []).map((x) => () => x), frontAt];
  for (let i = 0; i < cuts.length - 1; i++) {
    const L = cuts[i];
    const R = cuts[i + 1];
    const gap = i === 0 ? 0 : 0.012;
    const gapR = i === cuts.length - 2 ? 0 : 0.012;
    windows.push([
      [L(yb) + gap, yb, 0.008],
      [L(yr) + gap, yr, 0.012],
      [R(yr) - gapR, yr, 0.012],
      [R(yb) - gapR, yb, 0.008],
    ]);
  }
  const head: Lamp = { x: 0.965, y: p.hood - nose - 0.022, w: 0.05, h: 0.03, kind: 'rect', ...p.head };
  const tail: Lamp = { x: 0.012, y: p.deck - 0.03, w: 0.03, h: 0.03, ...p.tail };
  const details: Detail[] = [...(p.details ?? [])];
  // Door lines and a handle
  const dx = (p.pillars ?? [])[0] ?? (p.xa + p.xc) / 2;
  details.push({ kind: 'line', pts: [[dx, p.sill + 0.015], [dx, p.belt + 0.005]] });
  details.push({ kind: 'line', pts: [[p.xa + 0.01, p.sill + 0.02], [p.xa + 0.005, p.belt + 0.005]] });
  details.push({ kind: 'dark', x: dx + 0.03, y: p.belt - 0.03, w: 0.035, h: 0.008 });
  const shape: VehicleShape = {
    body,
    windows,
    wheels: p.wheels,
    head,
    tail,
    engine: [p.rear === 'fast' && p.xa > 0.7 ? 0.2 : 0.82, (p.sill + p.hood) / 2],
    details,
    height: p.roof,
  };
  if (p.bumpers !== false) {
    shape.bumperF = [0.975, p.sill + 0.005, 1.012, p.sill + 0.035];
    shape.bumperR = [-0.012, p.sill + 0.005, 0.025, p.sill + 0.035];
  }
  if (p.mirror !== false) shape.mirror = [p.xa - 0.01, p.belt + 0.02];
  if (p.chromeBumpers) details.push({ kind: 'chrome', x: 0, y: 0, w: 0, h: 0 });
  return shape;
}

/** A shape from hand-placed points (trucks, machines, spacecraft) */
function custom(s: Omit<VehicleShape, 'details' | 'windows'> & { details?: Detail[]; windows?: Pt[][] }): VehicleShape {
  return { details: [], windows: [], ...s };
}

const W = (x: number, r: number, lift = 0): Wheel => ({ x, r, lift });
const T = (x: number, y: number, r: number, down = false): Thruster => (down ? { x, y, r, down } : { x, y, r });

// --- The catalogue

/**
 * A body from its top line (rear bottom → over the top → front bottom, as [x, y, r]) and the bottom drawn along the
 * sill with an arch over every wheel
 */
function shell(top: Pt[], sill: number, wheels: Wheel[], archK = 1.16): Pt[] {
  const out: Pt[] = [...top];
  const ws = [...wheels].sort((a, b) => b.x - a.x);
  for (const w of ws) {
    const cy = w.r + (w.lift ?? 0);
    const ar = w.r * archK;
    const dy = sill - cy;
    const a0 = Math.abs(dy) < ar ? Math.asin(Math.max(-1, Math.min(1, dy / ar))) : 0;
    for (let i = 0; i <= 9; i++) {
      const a = a0 + ((Math.PI - 2 * a0) * i) / 9;
      out.push([w.x + Math.cos(a) * ar, cy + Math.sin(a) * ar, 0]);
    }
  }
  return out;
}

/** A window from its corners (rear bottom, rear top, front top, front bottom) */
const win = (a: [number, number], b: [number, number], c: [number, number], d: [number, number], r = 0.01): Pt[] => [
  [a[0], a[1], r * 0.6],
  [b[0], b[1], r],
  [c[0], c[1], r],
  [d[0], d[1], r * 0.6],
];
const line = (...p: [number, number][]): Detail => ({ kind: 'line', pts: p.map(([x, y]): Pt => [x, y]) });

/**
 * A passenger car from its profile: the top line, the wheels, the glass and the lamps. Real cars have glass about a
 * third of the side's height: a profile with a shallower greenhouse has its shoulder lowered and its glass stretched
 * (every point between the sill and the roof moves; the silhouette's outline keeps its shape). `glassK` sets the
 * share (a chopped muscle car less); an open car (`open`) keeps its windscreen as glass above the body
 */
function auto(o: { top: Pt[]; sill: number; wheels: Wheel[]; glass: Pt[][]; head: Lamp; tail: Lamp; mirror?: [number, number]; engine?: [number, number]; details?: Detail[]; archK?: number; glassK?: number; open?: boolean }): VehicleShape {
  const roof = Math.max(...o.top.map((p) => p[1]));
  const belt = Math.min(...o.glass.flat().map((p) => p[1]));
  const want = Math.max(roof - belt, (roof - o.sill) * (o.glassK ?? 0.35));
  const nb = roof - want;
  const Y = o.open || belt >= roof ? (y: number) => y : (y: number) => (y <= o.sill ? y : y <= belt ? o.sill + ((y - o.sill) * (nb - o.sill)) / (belt - o.sill) : y <= roof ? nb + ((y - belt) * (roof - nb)) / (roof - belt) : y);
  const P = (p: Pt): Pt => [p[0], Y(p[1]), p[2]];
  const H = <T extends { y: number; h: number }>(r: T): T => ({ ...r, y: Y(r.y), h: Y(r.y + r.h) - Y(r.y) });
  const details = (o.details ?? []).map((d): Detail => {
    const e: Detail = { ...d };
    if (d.pts) e.pts = d.pts.map(P);
    if (d.y !== undefined) {
      e.y = Y(d.y);
      if (d.h !== undefined && d.kind !== 'tone') e.h = Y(d.y + d.h) - Y(d.y);
    }
    return e;
  });
  const top = o.top.map(P);
  return {
    body: shell(top, o.sill, o.wheels, o.archK),
    windows: o.glass.map((w) => w.map(P)),
    wheels: o.wheels,
    head: H(o.head),
    tail: H(o.tail),
    bumperF: [0.972, o.sill + 0.006, 1.01, o.sill + 0.03],
    bumperR: [-0.01, o.sill + 0.006, 0.028, o.sill + 0.03],
    mirror: o.mirror && [o.mirror[0], Y(o.mirror[1])],
    engine: o.engine ?? [0.85, o.sill + 0.09],
    details,
    height: Math.max(...top.map((p) => p[1]), ...o.glass.flat().map((p) => p[1])),
  };
}
/** A door's edge, a door handle, a chrome or rubber strip at a height */
const dl = (x: number, y0: number, y1: number): Detail => line([x, y0], [x, y1]);
const hd = (x: number, y: number): Detail => ({ kind: 'dark', x, y, w: 0.028, h: 0.007 });
const tr = (y: number, x0 = 0.02, x1 = 0.98): Detail => ({ kind: 'trim', pts: [[x0, y], [x1, y]] });
/** A rear wing from x0 to x1 at height y, on two struts down to the deck */
const wing = (x0: number, x1: number, y: number, deck: number): Detail[] => [
  { kind: 'spoiler', pts: [[x0, y], [x1, y + 0.004], [x1, y + 0.014], [x0 + 0.005, y + 0.011]] },
  line([x0 + 0.03, deck], [x0 + 0.03, y + 0.002]),
  line([x1 - 0.025, deck], [x1 - 0.025, y + 0.004]),
];

// The catalogue. Each vehicle is drawn after one real model (the owner, 2026-10-10: «точные копии машин как в реале,
// только названия поменять»): its proportions, roof and glass, lamps, grille, wheels and characteristic lines — with
// our own name, no badge and no lettering of the make. The album card names the country and the era, never the make.
const DRAWN: readonly Model[] = [
  // ===== Level 1: the Shed — everyday cars of the 80s–2000s (the owner's list, 2026-10-10)
  {
    // after the Toyota Camry (XV20, 1997): a plain three-box saloon, a soft roof, wide rectangular lamps. Changed: a
    // chrome rubbing strip, slimmer lamps, rounder trunk
    id: 'glide', name: 'Daily Glide', kind: 'Japanese family saloon of the 2010s', cls: 'car', level: 1, value: 80, year: 2018, rim: 'classic',
    colors: ['#c9ccd1', '#e8e2d0', '#2f4a6b', '#7a2e2e', '#3f5f4a', '#b9a07a'],
    shape: auto({
      top: [[0.008, 0.075, 0.012], [0, 0.17, 0.02], [0.012, 0.222, 0.015], [0.2, 0.234, 0.012], [0.265, 0.242, 0.02], [0.37, 0.298, 0.035], [0.56, 0.3, 0.03], [0.69, 0.236, 0.01], [0.955, 0.208, 0.02], [1, 0.175, 0.03], [1, 0.085, 0.02], [0.99, 0.065, 0.005]],
      sill: 0.062, wheels: [W(0.215, 0.068), W(0.805, 0.068)],
      glass: [win([0.285, 0.246], [0.375, 0.29], [0.47, 0.292], [0.47, 0.246], 0.008), win([0.485, 0.246], [0.485, 0.292], [0.555, 0.292], [0.67, 0.246], 0.008)],
      head: { x: 0.985, y: 0.172, w: 0.03, h: 0.026, kind: 'rect' }, tail: { x: 0.008, y: 0.185, w: 0.02, h: 0.035 }, mirror: [0.665, 0.256],
      details: [dl(0.285, 0.1, 0.238), dl(0.478, 0.09, 0.24), dl(0.675, 0.1, 0.232), hd(0.42, 0.215), hd(0.62, 0.215), tr(0.145), { kind: 'grille', x: 0.99, y: 0.15, w: 0.012, h: 0.022 }],
    }),
  },
  {
    // after the Volkswagen Passat B5 (1997): one arc from the windscreen to the short trunk, a high tail. Changed:
    // twin-lens lamps, a chrome belt line
    id: 'wayfarer', name: 'Wayfarer 1.8T', kind: 'German family saloon of the 90s', cls: 'car', level: 1, value: 90, year: 1997, rim: 'classic',
    colors: ['#1f2b44', '#c9ccd1', '#e8e2d0', '#4a5a3a', '#6b1f2a', '#2a2d33'],
    shape: auto({
      top: [[0.008, 0.078, 0.012], [0, 0.18, 0.02], [0.015, 0.235, 0.015], [0.17, 0.245, 0.012], [0.24, 0.255, 0.03], [0.33, 0.305, 0.06], [0.47, 0.312, 0.06], [0.57, 0.3, 0.04], [0.69, 0.24, 0.01], [0.955, 0.212, 0.02], [1, 0.18, 0.03], [1, 0.09, 0.02], [0.99, 0.066, 0.005]],
      sill: 0.064, wheels: [W(0.21, 0.07), W(0.8, 0.07)],
      glass: [win([0.26, 0.252], [0.34, 0.298], [0.46, 0.304], [0.46, 0.252], 0.02), win([0.475, 0.252], [0.475, 0.304], [0.57, 0.294], [0.675, 0.252], 0.015)],
      head: { x: 0.984, y: 0.18, w: 0.032, h: 0.03, kind: 'dual' }, tail: { x: 0.01, y: 0.19, w: 0.022, h: 0.04 }, mirror: [0.665, 0.26],
      details: [dl(0.268, 0.1, 0.245), dl(0.468, 0.09, 0.248), dl(0.68, 0.1, 0.238), hd(0.41, 0.222), hd(0.61, 0.222), tr(0.15, 0.03, 0.97), tr(0.246, 0.25, 0.68)],
    }),
  },
  {
    // after the Volkswagen Golf GTI (Mk2, 1986): a box with a near-upright hatch, round lamps big and small, a black
    // rubbing strip. Changed: a thin pinstripe instead of the red grille line, own wheels
    id: 'rocket', name: 'Pocket Rocket 16V', kind: 'German hot hatch of the 2020s', cls: 'car', level: 1, value: 105, year: 2020, rim: 'mesh',
    colors: ['#c8102e', '#f4f1ea', '#1c1c24', '#2f4a8a', '#c9ccd1'],
    shape: auto({
      top: [[0.01, 0.08, 0.012], [0, 0.2, 0.015], [0.01, 0.25, 0.01], [0.035, 0.27, 0.015], [0.125, 0.346, 0.02], [0.16, 0.352, 0.02], [0.52, 0.352, 0.02], [0.66, 0.255, 0.01], [0.96, 0.235, 0.02], [1, 0.2, 0.02], [1, 0.09, 0.02], [0.99, 0.068, 0.005]],
      sill: 0.068, wheels: [W(0.2, 0.076), W(0.8, 0.076)],
      glass: [win([0.19, 0.265], [0.19, 0.34], [0.3, 0.34], [0.3, 0.265], 0.006), win([0.315, 0.265], [0.315, 0.34], [0.515, 0.34], [0.635, 0.265], 0.01)],
      head: { x: 0.988, y: 0.2, w: 0.026, h: 0.036, kind: 'dual' }, tail: { x: 0.01, y: 0.205, w: 0.022, h: 0.04 }, mirror: [0.625, 0.275],
      details: [{ kind: 'dark', x: 0.02, y: 0.14, w: 0.96, h: 0.014 }, dl(0.31, 0.1, 0.26), dl(0.64, 0.1, 0.25), hd(0.36, 0.238), { kind: 'stripe', x: 0.03, y: 0.235, w: 0.94, h: 0.004 }, { kind: 'grille', x: 0.99, y: 0.19, w: 0.012, h: 0.03 }],
    }),
  },
  {
    // after the Toyota Mark II (JZX90, 1992): a long low pillarless hardtop saloon, slim lamps, a chrome belt.
    // Changed: lower roof, own tail lamps
    id: 'salaryman', name: 'Salaryman Turbo', kind: 'Japanese executive saloon of the 2010s', cls: 'car', level: 1, value: 95, year: 2015, rim: 'mesh',
    colors: ['#f4f1ea', '#c9ccd1', '#1c1c24', '#5a2a3a', '#2f4a6b'],
    shape: auto({
      top: [[0.008, 0.075, 0.012], [0, 0.17, 0.015], [0.012, 0.218, 0.01], [0.21, 0.226, 0.01], [0.27, 0.232, 0.02], [0.38, 0.29, 0.04], [0.55, 0.29, 0.03], [0.68, 0.228, 0.01], [0.96, 0.205, 0.015], [1, 0.18, 0.02], [1, 0.085, 0.02], [0.99, 0.064, 0.005]],
      sill: 0.062, wheels: [W(0.21, 0.068), W(0.8, 0.068)],
      glass: [win([0.29, 0.238], [0.385, 0.283], [0.47, 0.284], [0.47, 0.238], 0.01), win([0.48, 0.238], [0.48, 0.284], [0.545, 0.284], [0.66, 0.238], 0.008)],
      head: { x: 0.985, y: 0.176, w: 0.03, h: 0.02, kind: 'slim' }, tail: { x: 0.008, y: 0.18, w: 0.02, h: 0.03 }, mirror: [0.655, 0.248],
      details: [tr(0.232, 0.27, 0.68), dl(0.28, 0.1, 0.228), dl(0.475, 0.09, 0.232), dl(0.672, 0.1, 0.226), hd(0.41, 0.205), hd(0.6, 0.205), tr(0.135, 0.03, 0.97)],
    }),
  },
  {
    // after the Honda Civic Type R (EK9, 1997): a short three-door hatch, a roof spoiler, slim lamps. Changed: no red
    // badge, a thin side stripe
    id: 'redline', name: 'Redline Hatch', kind: 'German family hatch of the 2020s', cls: 'car', level: 1, value: 110, year: 2021, rim: 'racing',
    colors: ['#f4f1ea', '#1c1c24', '#c8102e', '#e3c22a', '#2f4a8a'],
    shape: auto({
      top: [[0.01, 0.078, 0.012], [0, 0.19, 0.02], [0.015, 0.235, 0.01], [0.04, 0.26, 0.02], [0.1, 0.31, 0.03], [0.2, 0.325, 0.03], [0.5, 0.322, 0.03], [0.66, 0.235, 0.01], [0.95, 0.205, 0.02], [1, 0.165, 0.03], [1, 0.085, 0.02], [0.99, 0.066, 0.005]],
      sill: 0.066, wheels: [W(0.2, 0.07), W(0.81, 0.07)],
      glass: [win([0.13, 0.245], [0.17, 0.31], [0.3, 0.315], [0.3, 0.245], 0.012), win([0.315, 0.245], [0.315, 0.315], [0.495, 0.315], [0.645, 0.245], 0.01)],
      head: { x: 0.975, y: 0.18, w: 0.045, h: 0.024, kind: 'slim' }, tail: { x: 0.01, y: 0.2, w: 0.022, h: 0.035 }, mirror: [0.635, 0.258],
      details: [{ kind: 'spoiler', pts: [[0.07, 0.3], [0.15, 0.322], [0.15, 0.33], [0.075, 0.31]] }, dl(0.315, 0.1, 0.24), dl(0.655, 0.1, 0.232), hd(0.35, 0.215), { kind: 'stripe', x: 0.03, y: 0.12, w: 0.94, h: 0.005 }],
    }),
  },
  {
    // after the Mercedes-Benz S-Class (W140, 1991): a big slab saloon, an upright chrome grille, contrasting lower
    // cladding. Changed: no star, own cladding colour and wheels
    id: 'chancellor', name: 'Chancellor 600', kind: 'German luxury saloon of the 90s', cls: 'car', level: 1, value: 120, year: 1991, rim: 'mesh',
    colors: ['#1c1c24', '#c9ccd1', '#1f2b44', '#b9a07a', '#3f4a3f', '#f4f1ea'],
    shape: auto({
      top: [[0.008, 0.075, 0.012], [0, 0.18, 0.02], [0.012, 0.228, 0.012], [0.19, 0.238, 0.012], [0.25, 0.246, 0.025], [0.36, 0.295, 0.035], [0.57, 0.296, 0.03], [0.69, 0.238, 0.01], [0.96, 0.214, 0.015], [1, 0.19, 0.02], [1, 0.085, 0.02], [0.99, 0.065, 0.005]],
      sill: 0.062, wheels: [W(0.21, 0.068), W(0.805, 0.068)],
      glass: [win([0.27, 0.25], [0.365, 0.288], [0.47, 0.289], [0.47, 0.25], 0.008), win([0.485, 0.25], [0.485, 0.289], [0.565, 0.289], [0.675, 0.25], 0.008)],
      head: { x: 0.985, y: 0.186, w: 0.03, h: 0.034, kind: 'rect' }, tail: { x: 0.008, y: 0.19, w: 0.02, h: 0.04 }, mirror: [0.665, 0.262],
      details: [{ kind: 'tone', y: 0.125, h: -1, color: '#9a9ea6' }, tr(0.125, 0.02, 0.98), { kind: 'grille', x: 0.99, y: 0.16, w: 0.012, h: 0.05 }, { kind: 'chrome', x: 0, y: 0, w: 0, h: 0 }, dl(0.27, 0.1, 0.245), dl(0.478, 0.09, 0.248), dl(0.68, 0.1, 0.24), hd(0.41, 0.225), hd(0.61, 0.225)],
    }),
  },


  // ===== Level 2: the Workshop — Japanese and German driver's cars, a rally icon, a luxury SUV
  {
    // after the Mitsubishi Lancer Evolution IX (2005): a boxy saloon on wide arches, a tall wing, a hood vent.
    // Changed: own wing and lamps
    id: 'rallynine', name: 'Rally Nine', kind: 'Japanese rally saloon of the 2000s', cls: 'sport', level: 2, value: 700, year: 2005, rim: 'racing',
    colors: ['#f4f1ea', '#2f4a8a', '#c8102e', '#8b8f93', '#1c1c24'],
    shape: auto({
      top: [[0.008, 0.078, 0.012], [0, 0.185, 0.02], [0.012, 0.24, 0.012], [0.17, 0.248, 0.012], [0.25, 0.255, 0.025], [0.35, 0.315, 0.035], [0.56, 0.318, 0.03], [0.68, 0.248, 0.01], [0.95, 0.215, 0.02], [1, 0.17, 0.03], [1, 0.085, 0.02], [0.99, 0.065, 0.005]],
      sill: 0.065, wheels: [W(0.21, 0.072), W(0.8, 0.072)],
      glass: [win([0.27, 0.258], [0.355, 0.308], [0.46, 0.31], [0.46, 0.258], 0.01), win([0.475, 0.258], [0.475, 0.31], [0.555, 0.31], [0.665, 0.258], 0.01)],
      head: { x: 0.975, y: 0.19, w: 0.045, h: 0.026, kind: 'slim' }, tail: { x: 0.008, y: 0.2, w: 0.02, h: 0.035 }, mirror: [0.655, 0.27],
      details: [...wing(0.0, 0.14, 0.29, 0.248), { kind: 'flare' }, { kind: 'vent', x: 0.82, y: 0.218, w: 0.06, h: 0.008 }, dl(0.268, 0.1, 0.25), dl(0.468, 0.09, 0.252), dl(0.672, 0.1, 0.245), hd(0.41, 0.228), hd(0.61, 0.228)],
    }),
  },
  {
    // after the Mercedes-Benz 190E Evo II (1990): a compact saloon with a huge adjustable wing and wide arches.
    // Changed: own wing and lip, no star
    id: 'bigwing', name: 'Big Wing 2.5', kind: 'German touring-car saloon of the 90s', cls: 'sport', level: 2, value: 680, year: 1990, rim: 'mesh',
    colors: ['#1d2330', '#c9ccd1', '#f4f1ea', '#c8102e'],
    shape: auto({
      top: [[0.008, 0.075, 0.012], [0, 0.18, 0.015], [0.012, 0.228, 0.01], [0.2, 0.236, 0.01], [0.26, 0.244, 0.02], [0.35, 0.3, 0.03], [0.56, 0.302, 0.02], [0.68, 0.238, 0.008], [0.97, 0.215, 0.012], [1, 0.19, 0.015], [1, 0.085, 0.02], [0.99, 0.065, 0.005]],
      sill: 0.062, wheels: [W(0.21, 0.07), W(0.8, 0.07)],
      glass: [win([0.275, 0.25], [0.355, 0.294], [0.465, 0.295], [0.465, 0.25], 0.008), win([0.48, 0.25], [0.48, 0.295], [0.555, 0.295], [0.665, 0.25], 0.008)],
      head: { x: 0.985, y: 0.19, w: 0.03, h: 0.03, kind: 'rect' }, tail: { x: 0.008, y: 0.19, w: 0.02, h: 0.035 }, mirror: [0.655, 0.262],
      details: [...wing(-0.01, 0.17, 0.305, 0.236), { kind: 'flare' }, dl(0.272, 0.1, 0.244), dl(0.473, 0.09, 0.246), dl(0.675, 0.1, 0.238), hd(0.41, 0.222), hd(0.61, 0.222), { kind: 'grille', x: 0.99, y: 0.165, w: 0.012, h: 0.035 }],
    }),
  },
  {
    // after the Audi Quattro (1980): a flat-roofed coupe, box flares, a thick rear pillar, a rubber lip spoiler.
    // Changed: own lamps, no rings
    id: 'fourfold', name: 'Fourfold Turbo', kind: 'German rally coupe of the 80s', cls: 'sport', level: 2, value: 650, year: 1980, rim: 'turbine',
    colors: ['#c8102e', '#f4f1ea', '#1c1c24', '#c9ccd1', '#6b5a45'],
    shape: auto({
      top: [[0.008, 0.075, 0.012], [0, 0.19, 0.012], [0.012, 0.235, 0.008], [0.17, 0.24, 0.008], [0.22, 0.25, 0.01], [0.33, 0.305, 0.012], [0.56, 0.305, 0.012], [0.67, 0.24, 0.006], [0.98, 0.22, 0.008], [1, 0.2, 0.01], [1, 0.085, 0.012], [0.99, 0.065, 0.005]],
      sill: 0.065, wheels: [W(0.21, 0.07), W(0.8, 0.07)],
      glass: [win([0.26, 0.252], [0.33, 0.296], [0.345, 0.296], [0.345, 0.252], 0.004), win([0.365, 0.246], [0.37, 0.298], [0.555, 0.298], [0.655, 0.246], 0.006)],
      head: { x: 0.99, y: 0.195, w: 0.022, h: 0.03, kind: 'rect' }, tail: { x: 0.008, y: 0.2, w: 0.02, h: 0.035 }, mirror: [0.645, 0.258],
      details: [{ kind: 'spoiler', pts: [[0.01, 0.24], [0.08, 0.243], [0.08, 0.25], [0.015, 0.248]] }, { kind: 'flare' }, dl(0.36, 0.1, 0.24), dl(0.66, 0.1, 0.236), hd(0.4, 0.222), tr(0.13, 0.03, 0.97)],
    }),
  },
  {
    // after the Range Rover Sport (L494, 2014): a tall SUV with a falling roof, a floating black roof, slim lamps,
    // a fender vent. Changed: own vent and lamps, no lettering
    id: 'highlands', name: 'Highlands Sport', kind: 'British luxury SUV of the 2010s', cls: 'car', level: 1, value: 115, year: 2014, rim: 'turbine',
    colors: ['#f4f1ea', '#1c1c24', '#8b8f93', '#1f2b44', '#4a5a3a'],
    shape: auto({
      top: [[0.008, 0.1, 0.015], [0, 0.27, 0.03], [0.02, 0.33, 0.03], [0.06, 0.36, 0.03], [0.56, 0.365, 0.03], [0.69, 0.28, 0.012], [0.96, 0.255, 0.03], [1, 0.22, 0.03], [1, 0.11, 0.02], [0.99, 0.095, 0.005]],
      sill: 0.096, wheels: [W(0.2, 0.085, 0.01), W(0.8, 0.085, 0.01)],
      glass: [win([0.06, 0.285], [0.08, 0.35], [0.2, 0.352], [0.2, 0.285], 0.02), win([0.215, 0.285], [0.215, 0.355], [0.39, 0.356], [0.39, 0.285], 0.01), win([0.405, 0.285], [0.405, 0.356], [0.55, 0.356], [0.67, 0.285], 0.012)],
      head: { x: 0.972, y: 0.23, w: 0.055, h: 0.022, kind: 'slim' }, tail: { x: 0.01, y: 0.24, w: 0.02, h: 0.035 }, mirror: [0.66, 0.3],
      details: [{ kind: 'tone', y: 0.356, h: 1, color: '#15171c' }, { kind: 'tone', y: 0.13, h: -1, color: '#2a2d33' }, { kind: 'vent', x: 0.7, y: 0.2, w: 0.05, h: 0.012 }, dl(0.205, 0.12, 0.28), dl(0.398, 0.12, 0.28), dl(0.68, 0.12, 0.276), hd(0.33, 0.262), hd(0.53, 0.262)],
    }),
  },


  // ===== Level 3: the Service Station — 90s legends, 2000s sports saloons, American muscle
  {
    // after the Mercedes-Benz G-Class (W463): a tall box, flat glass, round lamps, indicators on the fender tops, a
    // spare on the door. Changed: own grille and rubbing strip, no star
    id: 'ironbrick', name: 'Iron Brick', kind: 'German off-roader, built since 1979', cls: 'car', level: 1, value: 110, year: 1990, rim: 'turbine',
    colors: ['#1c1c24', '#c9ccd1', '#4a5a3a', '#f4f1ea', '#6b1f2a'],
    shape: auto({
      top: [[0.008, 0.1, 0.01], [0, 0.33, 0.01], [0.008, 0.415, 0.012], [0.6, 0.418, 0.012], [0.66, 0.31, 0.006], [0.99, 0.3, 0.008], [1, 0.28, 0.008], [1, 0.11, 0.01], [0.99, 0.095, 0.005]],
      sill: 0.1, wheels: [W(0.21, 0.085, 0.012), W(0.8, 0.085, 0.012)],
      glass: [win([0.02, 0.32], [0.02, 0.405], [0.2, 0.405], [0.2, 0.32], 0.005), win([0.215, 0.32], [0.215, 0.405], [0.4, 0.405], [0.4, 0.32], 0.005), win([0.415, 0.32], [0.415, 0.405], [0.595, 0.405], [0.645, 0.32], 0.005)],
      head: { x: 0.988, y: 0.265, w: 0.02, h: 0.045, kind: 'round' }, tail: { x: 0.008, y: 0.25, w: 0.016, h: 0.05 }, mirror: [0.64, 0.33],
      details: [{ kind: 'spare', x: -0.07, y: 0.3, w: 0.11, h: 0.11 }, { kind: 'light', x: 0.92, y: 0.302, w: 0.03, h: 0.008 }, { kind: 'dark', x: 0.02, y: 0.16, w: 0.96, h: 0.02 }, { kind: 'flare' }, dl(0.208, 0.12, 0.31), dl(0.408, 0.12, 0.31), dl(0.652, 0.12, 0.3), hd(0.33, 0.29), hd(0.53, 0.29)],
    }),
  },
  {
    // after the Audi RS 6 Avant (C8, 2020): a long low estate on blistered arches, slim lamps, roof rails.
    // Changed: own rails and lamps, no rings
    id: 'missile', name: 'Family Missile', kind: 'German super estate of the 2020s', cls: 'car', level: 1, value: 112, year: 2020, rim: 'turbine',
    colors: ['#8b8f93', '#1c1c24', '#2f4a8a', '#c8102e', '#f4f1ea'],
    shape: auto({
      top: [[0.008, 0.08, 0.015], [0, 0.19, 0.025], [0.01, 0.235, 0.02], [0.03, 0.27, 0.02], [0.08, 0.292, 0.02], [0.53, 0.295, 0.03], [0.67, 0.228, 0.012], [0.96, 0.2, 0.025], [1, 0.16, 0.035], [1, 0.085, 0.02], [0.99, 0.066, 0.005]],
      sill: 0.066, wheels: [W(0.2, 0.078), W(0.8, 0.078)],
      glass: [win([0.05, 0.24], [0.09, 0.283], [0.25, 0.286], [0.25, 0.24], 0.012), win([0.265, 0.24], [0.265, 0.287], [0.415, 0.288], [0.415, 0.24], 0.008), win([0.43, 0.24], [0.43, 0.288], [0.53, 0.288], [0.655, 0.24], 0.01)],
      head: { x: 0.965, y: 0.176, w: 0.06, h: 0.018, kind: 'slim' }, tail: { x: 0.01, y: 0.2, w: 0.02, h: 0.025 }, mirror: [0.645, 0.25],
      details: [{ kind: 'rack', x: 0.1, y: 0.297, w: 0.4, h: 0.007 }, { kind: 'flare' }, { kind: 'tone', y: 0.1, h: -1, color: '#2a2d33' }, dl(0.258, 0.1, 0.236), dl(0.422, 0.09, 0.238), dl(0.662, 0.1, 0.23), hd(0.36, 0.218), hd(0.56, 0.218)],
    }),
  },
  {
    // after the Ford Mustang GT (S550, 2015): a fastback with a long hood, a short deck, three-bar tail lamps.
    // Changed: no horse, own grille and lamps
    id: 'stallion', name: 'Stallion GT', kind: 'American pony car of the 2010s', cls: 'sport', level: 2, value: 620, year: 2015, rim: 'racing',
    colors: ['#c8102e', '#f2c22e', '#2f4a8a', '#1c1c24', '#f4f1ea', '#e86a1a'],
    shape: auto({
      top: [[0.008, 0.08, 0.012], [0, 0.2, 0.02], [0.012, 0.24, 0.01], [0.1, 0.246, 0.01], [0.2, 0.262, 0.03], [0.36, 0.29, 0.04], [0.5, 0.288, 0.03], [0.62, 0.24, 0.01], [0.97, 0.225, 0.015], [1, 0.2, 0.02], [1, 0.085, 0.02], [0.99, 0.065, 0.005]],
      sill: 0.066, wheels: [W(0.21, 0.075), W(0.79, 0.075)],
      glass: [win([0.27, 0.248], [0.37, 0.283], [0.49, 0.282], [0.6, 0.243], 0.015)],
      head: { x: 0.975, y: 0.2, w: 0.04, h: 0.022, kind: 'slim' }, tail: { x: 0.008, y: 0.205, w: 0.02, h: 0.03 }, mirror: [0.6, 0.255],
      details: [{ kind: 'line', pts: [[0.06, 0.2], [0.3, 0.205], [0.62, 0.21]] }, { kind: 'vent', x: 0.78, y: 0.23, w: 0.05, h: 0.006 }, dl(0.29, 0.1, 0.24), dl(0.61, 0.1, 0.236), hd(0.33, 0.22), { kind: 'grille', x: 0.99, y: 0.16, w: 0.012, h: 0.04 }],
    }),
  },
  {
    // after the Chevrolet Camaro (6th gen, 2016): a low chopped roof, a slit of glass over a high belt, slim lamps.
    // Changed: no bow-tie, own vents
    id: 'rival', name: 'Rival SS', kind: 'American muscle coupe of the 2010s', cls: 'sport', level: 2, value: 600, year: 2016, rim: 'racing',
    colors: ['#f2c22e', '#1c1c24', '#c8102e', '#f4f1ea', '#e86a1a', '#2f4a8a'],
    shape: auto({
      top: [[0.008, 0.08, 0.012], [0, 0.2, 0.02], [0.012, 0.245, 0.012], [0.13, 0.252, 0.012], [0.23, 0.262, 0.03], [0.37, 0.282, 0.03], [0.5, 0.28, 0.02], [0.6, 0.246, 0.01], [0.97, 0.228, 0.015], [1, 0.2, 0.02], [1, 0.085, 0.02], [0.99, 0.065, 0.005]],
      glassK: 0.29, sill: 0.066, wheels: [W(0.21, 0.077), W(0.79, 0.077)],
      glass: [win([0.29, 0.252], [0.375, 0.276], [0.49, 0.275], [0.585, 0.25], 0.008)],
      head: { x: 0.975, y: 0.207, w: 0.04, h: 0.015, kind: 'slim' }, tail: { x: 0.008, y: 0.21, w: 0.02, h: 0.022 }, mirror: [0.585, 0.258],
      details: [{ kind: 'vent', x: 0.76, y: 0.232, w: 0.06, h: 0.008 }, { kind: 'vent', x: 0.24, y: 0.18, w: 0.035, h: 0.012 }, dl(0.3, 0.1, 0.248), dl(0.595, 0.1, 0.242), hd(0.34, 0.225)],
    }),
  },
  {
    // after the Dodge Challenger SRT Hellcat (2015): long, square and retro, twin round lamps in a wide grille, a hood
    // scoop. Changed: no lettering, own scoop
    id: 'hellhound', name: 'Hellhound 707', kind: 'American muscle car of the 2010s', cls: 'sport', level: 3, value: 7400, year: 2015, rim: 'chrome',
    colors: ['#c8102e', '#5b2a86', '#2f6b3a', '#1c1c24', '#e86a1a', '#f4f1ea'],
    shape: auto({
      top: [[0.008, 0.08, 0.012], [0, 0.205, 0.012], [0.01, 0.245, 0.008], [0.19, 0.252, 0.008], [0.27, 0.262, 0.02], [0.38, 0.29, 0.025], [0.53, 0.29, 0.02], [0.64, 0.25, 0.008], [0.74, 0.246, 0.006], [0.75, 0.256, 0.004], [0.83, 0.256, 0.004], [0.84, 0.243, 0.006], [0.97, 0.24, 0.01], [1, 0.215, 0.012], [1, 0.085, 0.015], [0.99, 0.065, 0.005]],
      sill: 0.066, wheels: [W(0.2, 0.075), W(0.79, 0.075)],
      glass: [win([0.3, 0.258], [0.385, 0.284], [0.52, 0.284], [0.62, 0.255], 0.006)],
      head: { x: 0.99, y: 0.207, w: 0.022, h: 0.034, kind: 'dual' }, tail: { x: 0.008, y: 0.21, w: 0.02, h: 0.03 }, mirror: [0.615, 0.265],
      details: [{ kind: 'grille', x: 0.99, y: 0.18, w: 0.012, h: 0.045 }, dl(0.3, 0.1, 0.25), dl(0.63, 0.1, 0.248), hd(0.34, 0.23), { kind: 'chrome', x: 0, y: 0, w: 0, h: 0 }],
    }),
  },
  {
    // after the Chevrolet Corvette (C7, 2014): a long hood, the cab set back, a sharp tail, big side vents.
    // Changed: own vents and lamps, no flags
    id: 'manta', name: 'Manta Seven', kind: 'American sports car of the 2010s', cls: 'sport', level: 3, value: 6800, year: 2014, rim: 'racing',
    colors: ['#c8102e', '#e3c22a', '#2f4a8a', '#f4f1ea', '#1c1c24'],
    shape: auto({
      top: [[0.008, 0.08, 0.012], [0, 0.19, 0.02], [0.012, 0.225, 0.012], [0.15, 0.24, 0.012], [0.26, 0.262, 0.03], [0.38, 0.272, 0.03], [0.47, 0.27, 0.02], [0.58, 0.225, 0.01], [0.96, 0.175, 0.025], [1, 0.135, 0.03], [1, 0.085, 0.02], [0.99, 0.065, 0.005]],
      sill: 0.065, wheels: [W(0.2, 0.075), W(0.8, 0.075)],
      glass: [win([0.3, 0.235], [0.385, 0.266], [0.465, 0.265], [0.565, 0.228], 0.01)],
      head: { x: 0.96, y: 0.152, w: 0.06, h: 0.018, kind: 'slim' }, tail: { x: 0.008, y: 0.19, w: 0.02, h: 0.022 }, mirror: [0.56, 0.24],
      details: [{ kind: 'vent', x: 0.6, y: 0.14, w: 0.07, h: 0.03 }, { kind: 'vent', x: 0.22, y: 0.2, w: 0.05, h: 0.012 }, dl(0.3, 0.1, 0.232), dl(0.575, 0.1, 0.222), hd(0.34, 0.21)],
    }),
  },
    {
    // after a 1970s American motorhome (the Winnebago Brave look): the boxy coach with the swoosh stripe
    id: 'wanderer', name: 'Wanderer Camper', kind: 'American motorhome of the 70s', cls: 'truck', level: 3, value: 6200, year: 1974, rim: 'steel',
    colors: ['#f4f1ea', '#e8e2d0'],
    shape: {
      body: shell([[0, 0.08, 0.008], [0, 0.44, 0.03], [0.68, 0.46, 0.04], [0.79, 0.44, 0.04], [0.865, 0.34, 0.03], [0.975, 0.245, 0.03], [1, 0.2, 0.02], [1, 0.08, 0.008], [0.99, 0.07, 0.004]], 0.07, [W(0.24, 0.07), W(0.84, 0.07)]),
      windows: [win([0.8, 0.245], [0.8, 0.33], [0.86, 0.33], [0.955, 0.245], 0.006), win([0.12, 0.27], [0.12, 0.37], [0.3, 0.37], [0.3, 0.27], 0.012), win([0.48, 0.27], [0.48, 0.37], [0.62, 0.37], [0.62, 0.27], 0.012)],
      wheels: [W(0.24, 0.07), W(0.84, 0.07)],
      head: { x: 0.993, y: 0.14, w: 0.016, h: 0.04, kind: 'rect' }, tail: { x: 0.004, y: 0.13, w: 0.012, h: 0.06 },
      bumperF: [0.97, 0.07, 1.016, 0.095], bumperR: [-0.012, 0.07, 0.02, 0.095], mirror: [0.97, 0.28], engine: [0.9, 0.15], height: 0.46,
      details: [{ kind: 'swoosh', color: '#c75a1a' }, line([0.36, 0.09], [0.36, 0.38]), line([0.44, 0.09], [0.44, 0.38]), { kind: 'rack', x: 0.1, y: 0.455, w: 0.4, h: 0.015 }, line([0.79, 0.1], [0.79, 0.335])],
    },
  },


  // ===== Level 4: the Luxury studio — supercars and super saloons, classic and new
  {
    // after the BMW M5 (F90, 2018): a modern long saloon, a sharp shoulder line, slim lamps. Changed: own grille,
    // gills and lamps
    id: 'exec', name: 'Executive Missile', kind: 'German executive saloon of the 90s', cls: 'car', level: 1, value: 125, year: 1990, rim: 'turbine',
    colors: ['#2b4c8a', '#8b8f93', '#f4f1ea', '#1c1c24', '#3f5f4a'],
    shape: auto({
      top: [[0.008, 0.078, 0.015], [0, 0.19, 0.025], [0.012, 0.236, 0.02], [0.16, 0.246, 0.015], [0.24, 0.258, 0.035], [0.37, 0.298, 0.05], [0.55, 0.298, 0.04], [0.68, 0.236, 0.012], [0.96, 0.205, 0.025], [1, 0.165, 0.035], [1, 0.085, 0.02], [0.99, 0.065, 0.005]],
      sill: 0.065, wheels: [W(0.21, 0.075), W(0.8, 0.075)],
      glass: [win([0.26, 0.26], [0.37, 0.291], [0.465, 0.292], [0.465, 0.26], 0.015), win([0.48, 0.26], [0.48, 0.292], [0.55, 0.292], [0.665, 0.26], 0.01)],
      head: { x: 0.97, y: 0.18, w: 0.05, h: 0.02, kind: 'slim' }, tail: { x: 0.01, y: 0.2, w: 0.022, h: 0.026 }, mirror: [0.655, 0.27],
      details: [tr(0.256, 0.25, 0.68), { kind: 'line', pts: [[0.03, 0.215], [0.5, 0.222], [0.95, 0.2]] }, { kind: 'vent', x: 0.72, y: 0.17, w: 0.035, h: 0.01 }, dl(0.262, 0.1, 0.252), dl(0.472, 0.09, 0.254), dl(0.672, 0.1, 0.246), hd(0.41, 0.232), hd(0.61, 0.232), { kind: 'grille', x: 0.99, y: 0.15, w: 0.012, h: 0.03 }],
    }),
  },
  {
    // after the Mercedes-AMG GT (2015): an enormous hood, the cab right over the rear axle, a fastback, side gills.
    // Changed: own gills and grille, no star
    id: 'longnose', name: 'Long Nose GT', kind: 'German grand tourer of the 2010s', cls: 'sport', level: 4, value: 80000, year: 2015, rim: 'turbine',
    colors: ['#c9ccd1', '#e3c22a', '#3b6b2c', '#1c1c24', '#f4f1ea'],
    shape: auto({
      top: [[0.008, 0.08, 0.012], [0, 0.19, 0.03], [0.012, 0.225, 0.02], [0.12, 0.245, 0.03], [0.25, 0.272, 0.05], [0.33, 0.283, 0.04], [0.42, 0.28, 0.03], [0.52, 0.235, 0.012], [0.95, 0.195, 0.04], [1, 0.15, 0.04], [1, 0.085, 0.02], [0.99, 0.065, 0.005]],
      sill: 0.065, wheels: [W(0.2, 0.078), W(0.78, 0.078)],
      glass: [win([0.24, 0.245], [0.33, 0.276], [0.415, 0.274], [0.505, 0.24], 0.02)],
      head: { x: 0.955, y: 0.172, w: 0.06, h: 0.024, kind: 'slim' }, tail: { x: 0.008, y: 0.2, w: 0.02, h: 0.022 }, mirror: [0.5, 0.25],
      details: [{ kind: 'vent', x: 0.6, y: 0.17, w: 0.05, h: 0.02 }, dl(0.25, 0.1, 0.24), dl(0.51, 0.1, 0.232), hd(0.3, 0.22), { kind: 'grille', x: 0.99, y: 0.12, w: 0.012, h: 0.04 }],
    }),
  },
  {
    // after the Audi R8 (Mk1, 2007): a mid-engine coupe with the contrasting side blade behind the door.
    // Changed: own blade and lamps, no rings
    id: 'blade', name: 'Blade V10', kind: 'German mid-engine supercar of the 2000s', cls: 'sport', level: 4, value: 84000, year: 2007, rim: 'turbine',
    colors: ['#f4f1ea', '#c8102e', '#1c1c24', '#8b8f93', '#2f4a8a'],
    shape: auto({
      top: [[0.008, 0.08, 0.012], [0, 0.19, 0.02], [0.012, 0.225, 0.012], [0.15, 0.24, 0.015], [0.3, 0.262, 0.04], [0.42, 0.28, 0.04], [0.53, 0.277, 0.03], [0.64, 0.225, 0.01], [0.96, 0.17, 0.03], [1, 0.13, 0.035], [1, 0.085, 0.02], [0.99, 0.066, 0.005]],
      sill: 0.066, wheels: [W(0.21, 0.075), W(0.81, 0.073)],
      glass: [win([0.4, 0.235], [0.43, 0.272], [0.525, 0.27], [0.62, 0.23], 0.012)],
      head: { x: 0.96, y: 0.157, w: 0.06, h: 0.02, kind: 'slim' }, tail: { x: 0.008, y: 0.19, w: 0.02, h: 0.024 }, mirror: [0.615, 0.24], engine: [0.25, 0.16],
      details: [{ kind: 'dark', x: 0.29, y: 0.09, w: 0.075, h: 0.14 }, dl(0.38, 0.1, 0.232), dl(0.63, 0.1, 0.222), hd(0.42, 0.212)],
    }),
  },
  {
    // after the Porsche 911 GT3 RS (991.2, 2018): the rear-engine teardrop, upright oval lamps on the fenders, a big
    // wing on struts. Changed: own wing and intakes, no lettering
    id: 'trackwing', name: 'Track Wing RS', kind: 'German track coupe of the 2010s', cls: 'sport', level: 4, value: 90000, year: 2018, rim: 'racing',
    colors: ['#f26b1d', '#5fbf3a', '#f4f1ea', '#8b8f93', '#1c1c24'],
    shape: auto({
      top: [[0.008, 0.08, 0.012], [0, 0.18, 0.03], [0.01, 0.22, 0.03], [0.08, 0.245, 0.04], [0.2, 0.27, 0.05], [0.36, 0.287, 0.06], [0.5, 0.283, 0.04], [0.62, 0.228, 0.012], [0.95, 0.175, 0.035], [1, 0.135, 0.035], [1, 0.085, 0.02], [0.99, 0.066, 0.005]],
      sill: 0.066, wheels: [W(0.2, 0.078), W(0.8, 0.075)],
      glass: [win([0.3, 0.24], [0.37, 0.28], [0.49, 0.278], [0.6, 0.232], 0.02)],
      head: { x: 0.95, y: 0.172, w: 0.045, h: 0.04, kind: 'round' }, tail: { x: 0.008, y: 0.19, w: 0.02, h: 0.022 }, mirror: [0.595, 0.244], engine: [0.12, 0.15],
      details: [...wing(-0.01, 0.13, 0.302, 0.245), { kind: 'vent', x: 0.25, y: 0.15, w: 0.05, h: 0.02 }, dl(0.32, 0.1, 0.235), dl(0.61, 0.1, 0.225), hd(0.36, 0.215)],
    }),
  },
  {
    // after the Porsche 959 (1986): a rounded rear-engine body with an integrated hoop wing and wide flanks.
    // Changed: own hoop and intakes
    id: 'dune', name: 'Dune Turbo', kind: 'German rally supercar of the 80s', cls: 'sport', level: 2, value: 730, year: 1986, rim: 'classic',
    colors: ['#f4f1ea', '#c9ccd1', '#c8102e', '#1c1c24'],
    shape: auto({
      top: [[0.008, 0.08, 0.012], [0, 0.17, 0.03], [0.012, 0.215, 0.02], [0.02, 0.238, 0.01], [0.1, 0.244, 0.01], [0.2, 0.262, 0.04], [0.36, 0.295, 0.07], [0.5, 0.29, 0.04], [0.62, 0.235, 0.012], [0.95, 0.18, 0.04], [1, 0.14, 0.04], [1, 0.085, 0.02], [0.99, 0.066, 0.005]],
      sill: 0.066, wheels: [W(0.2, 0.078), W(0.8, 0.076)],
      glass: [win([0.3, 0.246], [0.37, 0.287], [0.49, 0.284], [0.6, 0.238], 0.02)],
      head: { x: 0.948, y: 0.176, w: 0.045, h: 0.04, kind: 'round' }, tail: { x: 0.008, y: 0.18, w: 0.02, h: 0.024 }, mirror: [0.595, 0.25], engine: [0.12, 0.15],
      details: [{ kind: 'spoiler', pts: [[0.0, 0.238], [0.09, 0.244], [0.1, 0.256], [0.005, 0.25]] }, { kind: 'vent', x: 0.24, y: 0.17, w: 0.04, h: 0.02 }, dl(0.32, 0.1, 0.24), dl(0.61, 0.1, 0.232), hd(0.36, 0.22)],
    }),
  },
  {
    // after the Dodge Viper GTS (1996): a hood as long as the car, a short bubble cab, side exhausts.
    // Changed: own vents, no snake
    id: 'fang', name: 'Fang V10', kind: 'American sports coupe of the 2010s', cls: 'sport', level: 3, value: 7800, year: 2013, rim: 'classic',
    colors: ['#1d3fa8', '#c8102e', '#1c1c24', '#e3c22a', '#f4f1ea'],
    shape: auto({
      top: [[0.008, 0.08, 0.012], [0, 0.18, 0.03], [0.012, 0.22, 0.02], [0.12, 0.235, 0.02], [0.22, 0.248, 0.03], [0.3, 0.265, 0.04], [0.4, 0.264, 0.03], [0.48, 0.228, 0.01], [0.9, 0.2, 0.04], [0.97, 0.18, 0.04], [1, 0.14, 0.04], [1, 0.085, 0.02], [0.99, 0.066, 0.005]],
      sill: 0.066, wheels: [W(0.2, 0.08), W(0.79, 0.078)],
      glass: [win([0.24, 0.238], [0.31, 0.258], [0.395, 0.258], [0.47, 0.23], 0.012)],
      head: { x: 0.95, y: 0.18, w: 0.05, h: 0.024, kind: 'slim' }, tail: { x: 0.008, y: 0.19, w: 0.02, h: 0.024 }, mirror: [0.47, 0.24],
      details: [{ kind: 'exhaust', x: 0.5, y: 0.075, w: 0, h: 0 }, { kind: 'dark', x: 0.3, y: 0.068, w: 0.2, h: 0.014 }, { kind: 'vent', x: 0.58, y: 0.15, w: 0.06, h: 0.03 }, { kind: 'vent', x: 0.75, y: 0.205, w: 0.06, h: 0.008 }, dl(0.24, 0.1, 0.235), dl(0.48, 0.1, 0.222), hd(0.28, 0.21)],
    }),
  },
  {
    // after the Ford GT40 (1966): a racer barely a metre tall, doors cut into the roof, a long tail.
    // Changed: own stripes and intakes, no lettering
    id: 'forty', name: 'Endurance Forty', kind: 'American Le Mans racer of the 60s', cls: 'sport', level: 4, value: 104000, year: 1966, rim: 'classic',
    colors: ['#8ec5e8', '#c8102e', '#f4f1ea', '#1f2b44', '#1c1c24'],
    shape: auto({
      top: [[0.008, 0.08, 0.012], [0, 0.17, 0.02], [0.02, 0.2, 0.015], [0.18, 0.212, 0.02], [0.3, 0.23, 0.04], [0.42, 0.245, 0.04], [0.52, 0.242, 0.02], [0.6, 0.205, 0.01], [0.95, 0.16, 0.04], [1, 0.12, 0.04], [1, 0.085, 0.02], [0.99, 0.066, 0.005]],
      sill: 0.066, wheels: [W(0.2, 0.075), W(0.81, 0.07)],
      glass: [win([0.4, 0.215], [0.43, 0.238], [0.515, 0.236], [0.585, 0.208], 0.01)],
      head: { x: 0.948, y: 0.16, w: 0.04, h: 0.025, kind: 'round' }, tail: { x: 0.008, y: 0.17, w: 0.02, h: 0.02 }, mirror: [0.575, 0.215], engine: [0.25, 0.15],
      details: [{ kind: 'stripe', x: 0.0, y: 0.13, w: 1, h: 0.016 }, { kind: 'vent', x: 0.3, y: 0.17, w: 0.05, h: 0.025 }, line([0.36, 0.1], [0.38, 0.235], [0.45, 0.242]), dl(0.6, 0.1, 0.2)],
    }),
  },
    {
    // after the Lamborghini Countach (1974): the knife-edge wedge, the cab-forward screen, the side duct, pop-up lamps. Changed: own duct and wheels
    id: 'wedge', name: 'Wedge Twelve', kind: 'Italian wedge supercar of the 70s', cls: 'sport', level: 4, value: 92000, year: 1974, rim: 'turbine',
    colors: ['#d6332c', '#f2c94c', '#f4f1ea', '#1c1c24', '#3a7d5c'],
    shape: {
      body: shell([[0.004, 0.065, 0.006], [0, 0.18, 0.008], [0.02, 0.2, 0.008], [0.13, 0.212, 0.01], [0.37, 0.258, 0.012], [0.465, 0.258, 0.012], [0.62, 0.19, 0.004], [1, 0.11, 0.008], [1.002, 0.075, 0.006], [0.99, 0.062, 0.004]], 0.062, [W(0.21, 0.076), W(0.8, 0.07)]),
      windows: [win([0.395, 0.2], [0.43, 0.248], [0.47, 0.248], [0.58, 0.198], 0.004)],
      wheels: [W(0.21, 0.076), W(0.8, 0.07)],
      head: { x: 0.88, y: 0.13, w: 0.07, h: 0.01, kind: 'popup' }, tail: { x: 0.004, y: 0.15, w: 0.012, h: 0.04 },
      bumperF: [0.975, 0.066, 1.012, 0.082], bumperR: [-0.01, 0.066, 0.025, 0.082], mirror: [0.6, 0.205], engine: [0.2, 0.17], height: 0.258,
      details: [{ kind: 'vent', x: 0.3, y: 0.13, w: 0.1, h: 0.055 }, { kind: 'dark', x: 0.22, y: 0.208, w: 0.12, h: 0.012 }, line([0.36, 0.08], [0.38, 0.2]), line([0.58, 0.085], [0.59, 0.19]), { kind: 'trim', pts: [[0.07, 0.155], [0.36, 0.155]] }],
    },
  },
  {
    // after the Ferrari 458 Italia (2010): a smooth mid-engine coupe, swept lamps reaching up the fenders, a side
    // intake. Changed: no horse, own intake and lamps
    id: 'rosso', name: 'Rosso V8', kind: 'Italian mid-engine supercar of the 2010s', cls: 'sport', level: 4, value: 88000, year: 2010, rim: 'racing',
    colors: ['#c8102e', '#e3c22a', '#1c1c24', '#f4f1ea', '#2f4a8a'],
    shape: auto({
      top: [[0.008, 0.08, 0.012], [0, 0.18, 0.02], [0.012, 0.215, 0.015], [0.15, 0.228, 0.02], [0.3, 0.25, 0.04], [0.42, 0.265, 0.04], [0.52, 0.262, 0.03], [0.63, 0.215, 0.01], [0.96, 0.155, 0.03], [1, 0.12, 0.035], [1, 0.085, 0.02], [0.99, 0.066, 0.005]],
      sill: 0.066, wheels: [W(0.2, 0.075), W(0.81, 0.073)],
      glass: [win([0.4, 0.228], [0.43, 0.258], [0.515, 0.256], [0.61, 0.218], 0.012)],
      head: { x: 0.955, y: 0.146, w: 0.065, h: 0.02, kind: 'slim' }, tail: { x: 0.008, y: 0.18, w: 0.02, h: 0.022, kind: 'round' }, mirror: [0.6, 0.228], engine: [0.28, 0.15],
      details: [{ kind: 'vent', x: 0.29, y: 0.13, w: 0.07, h: 0.035 }, dl(0.37, 0.1, 0.235), dl(0.62, 0.1, 0.212), hd(0.4, 0.2)],
    }),
  },


  // ===== Level 5: the Plant — hypercars (and the heavy machines further down)
  {
    // after the Ferrari F40 (1987): a raw wedge, the wing grown out of the tail, louvres over the engine, pop-up
    // lamps. Changed: own louvres and ducts, no horse
    id: 'anniversary', name: 'Anniversary Turbo', kind: 'Italian turbo supercar of the 80s', cls: 'sport', level: 4, value: 98000, year: 1987, rim: 'racing',
    colors: ['#c8102e', '#e3c22a', '#1c1c24', '#f4f1ea'],
    shape: auto({
      top: [[0.008, 0.08, 0.012], [0, 0.19, 0.01], [-0.005, 0.255, 0.006], [0.06, 0.258, 0.006], [0.065, 0.24, 0.006], [0.25, 0.24, 0.02], [0.4, 0.258, 0.03], [0.5, 0.255, 0.02], [0.6, 0.21, 0.01], [0.96, 0.15, 0.02], [1, 0.12, 0.03], [1, 0.085, 0.02], [0.99, 0.066, 0.005]],
      sill: 0.066, wheels: [W(0.2, 0.075), W(0.81, 0.07)],
      glass: [win([0.38, 0.222], [0.41, 0.25], [0.495, 0.248], [0.585, 0.214], 0.008)],
      head: { x: 0.94, y: 0.146, w: 0.045, h: 0.015, kind: 'popup' }, tail: { x: 0.008, y: 0.19, w: 0.02, h: 0.024, kind: 'round' }, mirror: [0.575, 0.222], engine: [0.25, 0.15],
      details: [{ kind: 'vent', x: 0.12, y: 0.236, w: 0.2, h: 0.006 }, { kind: 'vent', x: 0.7, y: 0.13, w: 0.05, h: 0.01 }, { kind: 'vent', x: 0.3, y: 0.14, w: 0.05, h: 0.03 }, dl(0.37, 0.1, 0.222), dl(0.6, 0.1, 0.205), hd(0.4, 0.2)],
    }),
  },
  {
    // after the Porsche Carrera GT (2004): a long open mid-engine car, a low screen, big side intakes, a pop-up wing.
    // Changed: own intakes and wing
    id: 'screamer', name: 'Screamer V10', kind: 'German open supercar of the 2000s', cls: 'sport', level: 5, value: 660000, year: 2004, rim: 'turbine',
    colors: ['#c9ccd1', '#1c1c24', '#c8102e', '#e3c22a', '#2f4a8a'],
    shape: auto({
      top: [[0.008, 0.08, 0.012], [0, 0.18, 0.02], [0.012, 0.215, 0.015], [0.2, 0.228, 0.02], [0.33, 0.24, 0.02], [0.45, 0.24, 0.005], [0.55, 0.212, 0.006], [0.96, 0.155, 0.03], [1, 0.12, 0.035], [1, 0.085, 0.02], [0.99, 0.066, 0.005]],
      open: true, sill: 0.066, wheels: [W(0.2, 0.076), W(0.81, 0.073)],
      glass: [win([0.474, 0.212], [0.484, 0.245], [0.494, 0.245], [0.54, 0.212], 0.003)],
      head: { x: 0.955, y: 0.15, w: 0.05, h: 0.026, kind: 'slim' }, tail: { x: 0.008, y: 0.18, w: 0.02, h: 0.022 }, mirror: [0.55, 0.222], engine: [0.28, 0.15],
      details: [{ kind: 'seat', x: 0.4, y: 0.238, w: 0.04, h: 0.03 }, { kind: 'vent', x: 0.28, y: 0.12, w: 0.08, h: 0.045 }, { kind: 'spoiler', pts: [[0.0, 0.225], [0.08, 0.23], [0.08, 0.236], [0.004, 0.232]] }, dl(0.38, 0.1, 0.235), dl(0.56, 0.1, 0.205)],
    }),
  },
  {
    // after the Lamborghini Huracán (2014): an angular wedge, hexagon intakes, Y-shaped slim lamps.
    // Changed: own intakes and lamps, no bull
    id: 'storm', name: 'Storm V10', kind: 'Italian supercar of the 2010s', cls: 'sport', level: 5, value: 600000, year: 2014, rim: 'racing',
    colors: ['#7cc22e', '#e86a1a', '#e3c22a', '#f4f1ea', '#8b8f93'],
    shape: auto({
      top: [[0.008, 0.08, 0.008], [0, 0.185, 0.008], [0.01, 0.222, 0.006], [0.16, 0.232, 0.008], [0.32, 0.252, 0.012], [0.44, 0.262, 0.012], [0.52, 0.258, 0.01], [0.63, 0.21, 0.006], [0.97, 0.15, 0.01], [1, 0.125, 0.012], [1, 0.085, 0.012], [0.99, 0.066, 0.005]],
      sill: 0.066, wheels: [W(0.2, 0.076), W(0.81, 0.074)],
      glass: [win([0.42, 0.225], [0.45, 0.256], [0.515, 0.253], [0.61, 0.214], 0.005)],
      head: { x: 0.962, y: 0.142, w: 0.065, h: 0.015, kind: 'slim' }, tail: { x: 0.008, y: 0.185, w: 0.02, h: 0.02 }, mirror: [0.6, 0.224], engine: [0.28, 0.15],
      details: [{ kind: 'vent', x: 0.3, y: 0.14, w: 0.06, h: 0.03 }, { kind: 'dark', x: 0.04, y: 0.07, w: 0.1, h: 0.02 }, dl(0.39, 0.1, 0.24), dl(0.62, 0.1, 0.208), hd(0.43, 0.2)],
    }),
  },
  {
    // after the Lamborghini Aventador (2011): a long very low wedge, a huge intake behind the scissor door.
    // Changed: own intake and lamps, no bull
    id: 'scissor', name: 'Scissor V12', kind: 'Italian supercar of the 2010s', cls: 'sport', level: 5, value: 700000, year: 2011, rim: 'racing',
    colors: ['#e86a1a', '#1c1c24', '#f4f1ea', '#e3c22a', '#2f4a8a'],
    shape: auto({
      top: [[0.008, 0.08, 0.008], [0, 0.18, 0.008], [0.012, 0.22, 0.006], [0.18, 0.228, 0.008], [0.34, 0.245, 0.012], [0.46, 0.255, 0.012], [0.53, 0.25, 0.01], [0.63, 0.205, 0.006], [0.97, 0.145, 0.01], [1, 0.12, 0.012], [1, 0.085, 0.012], [0.99, 0.066, 0.005]],
      sill: 0.066, wheels: [W(0.2, 0.078), W(0.81, 0.075)],
      glass: [win([0.44, 0.22], [0.465, 0.248], [0.525, 0.245], [0.61, 0.208], 0.005)],
      head: { x: 0.962, y: 0.136, w: 0.06, h: 0.015, kind: 'slim' }, tail: { x: 0.008, y: 0.18, w: 0.02, h: 0.02 }, mirror: [0.6, 0.218], engine: [0.28, 0.15],
      details: [{ kind: 'tone', y: 0.1, h: -1, color: '#1c1c24' }, { kind: 'vent', x: 0.3, y: 0.12, w: 0.11, h: 0.07 }, { kind: 'dark', x: 0.03, y: 0.07, w: 0.1, h: 0.025 }, dl(0.42, 0.1, 0.232), dl(0.62, 0.1, 0.202), hd(0.45, 0.2)],
    }),
  },
  {
    // after the Ferrari LaFerrari (2013): a low curvaceous hybrid, a long tail, a deep scoop along the flank.
    // Changed: own scoop and lamps, no horse
    id: 'ibrido', name: 'Rosso Ibrido', kind: 'Italian hybrid hypercar of the 2010s', cls: 'sport', level: 5, value: 800000, year: 2013, rim: 'racing',
    colors: ['#c8102e', '#e3c22a', '#1c1c24', '#f4f1ea'],
    shape: auto({
      top: [[0.008, 0.08, 0.012], [0, 0.18, 0.025], [0.012, 0.212, 0.02], [0.16, 0.222, 0.02], [0.3, 0.24, 0.04], [0.42, 0.25, 0.04], [0.5, 0.248, 0.03], [0.6, 0.2, 0.012], [0.84, 0.17, 0.03], [0.96, 0.15, 0.03], [1, 0.115, 0.035], [1, 0.085, 0.02], [0.99, 0.066, 0.005]],
      sill: 0.066, wheels: [W(0.2, 0.078), W(0.81, 0.075)],
      glass: [win([0.4, 0.215], [0.43, 0.244], [0.495, 0.242], [0.585, 0.205], 0.012)],
      head: { x: 0.955, y: 0.14, w: 0.06, h: 0.018, kind: 'slim' }, tail: { x: 0.008, y: 0.18, w: 0.02, h: 0.02, kind: 'round' }, mirror: [0.575, 0.212], engine: [0.28, 0.15],
      details: [{ kind: 'curve', pts: [[0.28, 0.16], [0.4, 0.11], [0.62, 0.12], [0.72, 0.15]], color: '#1c1c24' }, { kind: 'vent', x: 0.3, y: 0.13, w: 0.05, h: 0.03 }, dl(0.38, 0.1, 0.228), dl(0.59, 0.1, 0.198)],
    }),
  },
  {
    // after the McLaren F1 (1992): a compact smooth coupe, a roof scoop over the centre seat, butterfly doors.
    // Changed: own scoop and intakes
    id: 'centreseat', name: 'Centre Seat', kind: 'British supercar of the 90s', cls: 'sport', level: 4, value: 102000, year: 1992, rim: 'classic',
    colors: ['#c9ccd1', '#1f4d3a', '#f28c1d', '#1c1c24', '#f4f1ea'],
    shape: auto({
      top: [[0.008, 0.08, 0.012], [0, 0.17, 0.03], [0.012, 0.205, 0.02], [0.15, 0.222, 0.03], [0.3, 0.245, 0.04], [0.38, 0.262, 0.01], [0.4, 0.272, 0.005], [0.44, 0.272, 0.005], [0.45, 0.262, 0.01], [0.52, 0.258, 0.03], [0.62, 0.21, 0.01], [0.95, 0.16, 0.04], [1, 0.12, 0.04], [1, 0.085, 0.02], [0.99, 0.066, 0.005]],
      sill: 0.066, wheels: [W(0.2, 0.074), W(0.81, 0.07)],
      glass: [win([0.41, 0.222], [0.44, 0.252], [0.515, 0.25], [0.6, 0.214], 0.015)],
      head: { x: 0.952, y: 0.152, w: 0.045, h: 0.024, kind: 'slim' }, tail: { x: 0.008, y: 0.17, w: 0.02, h: 0.024, kind: 'round' }, mirror: [0.59, 0.225], engine: [0.28, 0.15],
      details: [{ kind: 'vent', x: 0.3, y: 0.14, w: 0.06, h: 0.03 }, dl(0.38, 0.1, 0.235), dl(0.61, 0.1, 0.206), hd(0.42, 0.2)],
    }),
  },
  {
    // after the McLaren P1 (2013): a teardrop on a shrink-wrapped body, huge side intakes, a tall rear wing.
    // Changed: own wing and lamps, no swoosh
    id: 'neon', name: 'Neon Hybrid', kind: 'British hybrid hypercar of the 2010s', cls: 'sport', level: 5, value: 760000, year: 2013, rim: 'turbine',
    colors: ['#e6d41e', '#f28c1d', '#1c1c24', '#f4f1ea', '#3b6b2c'],
    shape: auto({
      top: [[0.008, 0.08, 0.012], [0, 0.19, 0.02], [0.01, 0.225, 0.015], [0.12, 0.235, 0.02], [0.28, 0.252, 0.04], [0.42, 0.262, 0.05], [0.52, 0.258, 0.03], [0.63, 0.208, 0.012], [0.96, 0.148, 0.03], [1, 0.115, 0.035], [1, 0.085, 0.02], [0.99, 0.066, 0.005]],
      sill: 0.066, wheels: [W(0.2, 0.078), W(0.81, 0.075)],
      glass: [win([0.4, 0.226], [0.43, 0.255], [0.515, 0.252], [0.61, 0.212], 0.015)],
      head: { x: 0.955, y: 0.142, w: 0.055, h: 0.02, kind: 'slim' }, tail: { x: 0.008, y: 0.19, w: 0.02, h: 0.016 }, mirror: [0.6, 0.222], engine: [0.28, 0.15],
      details: [...wing(-0.01, 0.12, 0.265, 0.226), { kind: 'tone', y: 0.245, h: 1, color: '#1c1c24' }, { kind: 'vent', x: 0.28, y: 0.12, w: 0.09, h: 0.06 }, dl(0.38, 0.1, 0.235), dl(0.62, 0.1, 0.204)],
    }),
  },
  {
    // after the Koenigsegg Agera RS (2015): a compact targa-topped hypercar, a rounded nose, a wing on swan-neck
    // struts. Changed: own wing and lamps, no shield
    id: 'ghost', name: 'Nordic Ghost', kind: 'Swedish hypercar of the 2010s', cls: 'sport', level: 5, value: 780000, year: 2015, rim: 'turbine',
    colors: ['#f4f1ea', '#e86a1a', '#1c1c24', '#2f4a8a', '#8b8f93'],
    shape: auto({
      top: [[0.008, 0.08, 0.012], [0, 0.19, 0.02], [0.012, 0.225, 0.015], [0.1, 0.232, 0.015], [0.28, 0.248, 0.04], [0.4, 0.26, 0.04], [0.5, 0.258, 0.03], [0.6, 0.215, 0.012], [0.95, 0.16, 0.04], [1, 0.12, 0.04], [1, 0.085, 0.02], [0.99, 0.066, 0.005]],
      sill: 0.066, wheels: [W(0.2, 0.076), W(0.81, 0.074)],
      glass: [win([0.38, 0.228], [0.41, 0.254], [0.495, 0.252], [0.585, 0.218], 0.015)],
      head: { x: 0.948, y: 0.155, w: 0.05, h: 0.03, kind: 'rect' }, tail: { x: 0.008, y: 0.19, w: 0.02, h: 0.02, kind: 'round' }, mirror: [0.575, 0.228], engine: [0.28, 0.15],
      details: [...wing(-0.01, 0.11, 0.26, 0.232), { kind: 'tone', y: 0.252, h: 1, color: '#1c1c24' }, { kind: 'vent', x: 0.29, y: 0.14, w: 0.05, h: 0.03 }, dl(0.36, 0.1, 0.235), dl(0.6, 0.1, 0.21)],
    }),
  },
  {
    // after the Bugatti Veyron (2005): a tall rounded body, the two-tone split, roof scoops, the horseshoe grille.
    // Changed: own scoops and lamps, no lettering
    id: 'mach', name: 'Mach Sixteen', kind: 'French hypercar of the 2000s', cls: 'sport', level: 5, value: 820000, year: 2005, rim: 'turbine',
    colors: ['#1f3f7a', '#c8102e', '#c9ccd1', '#1c1c24', '#e8e2d0'],
    shape: auto({
      top: [[0.008, 0.08, 0.012], [0, 0.18, 0.03], [0.012, 0.215, 0.03], [0.12, 0.232, 0.03], [0.28, 0.265, 0.05], [0.4, 0.272, 0.05], [0.5, 0.268, 0.035], [0.61, 0.218, 0.012], [0.94, 0.17, 0.04], [1, 0.125, 0.045], [1, 0.085, 0.02], [0.99, 0.066, 0.005]],
      sill: 0.066, wheels: [W(0.2, 0.078), W(0.8, 0.076)],
      glass: [win([0.38, 0.232], [0.41, 0.264], [0.495, 0.262], [0.59, 0.222], 0.02)],
      head: { x: 0.955, y: 0.142, w: 0.04, h: 0.03, kind: 'dual' }, tail: { x: 0.008, y: 0.18, w: 0.02, h: 0.016 }, mirror: [0.58, 0.232], engine: [0.25, 0.16],
      details: [{ kind: 'tone', pts: [[-0.1, -0.1], [0.5, -0.1], [0.5, 0.1], [0.44, 0.17], [0.46, 0.23], [0.6, 0.29], [-0.1, 0.29]], color: '#1c1f2a' }, { kind: 'curve', pts: [[0.5, 0.08], [0.44, 0.17], [0.46, 0.22], [0.53, 0.235]], color: '#c9ccd1' }, { kind: 'vent', x: 0.24, y: 0.262, w: 0.07, h: 0.008 }, { kind: 'grille', x: 0.99, y: 0.09, w: 0.012, h: 0.045 }, dl(0.36, 0.1, 0.24), dl(0.6, 0.1, 0.212)],
    }),
  },
    {
    // after the Bugatti Chiron (2016): a long rounded body, the C-shaped sweep around the door, the horseshoe grille. Changed: own sweep and lamps, no lettering
    id: 'horseshoe', name: 'Horseshoe 1500', kind: 'French hypercar of the 2010s', cls: 'sport', level: 5, value: 860000, year: 2016, rim: 'turbine',
    colors: ['#1f4e9a', '#1c1c24', '#e8e2d0', '#c43b2d', '#c9ccd1'],
    shape: {
      body: shell([[0.006, 0.06, 0.008], [0, 0.17, 0.03], [0.06, 0.205, 0.03], [0.28, 0.238, 0.08], [0.42, 0.267, 0.1], [0.56, 0.262, 0.08], [0.7, 0.18, 0.06], [0.95, 0.13, 0.06], [1, 0.09, 0.04], [0.99, 0.06, 0.01]], 0.058, [W(0.19, 0.077), W(0.79, 0.074)]),
      windows: [win([0.4, 0.212], [0.45, 0.255], [0.56, 0.253], [0.64, 0.205], 0.012)],
      wheels: [W(0.19, 0.077), W(0.79, 0.074)],
      head: { x: 0.94, y: 0.13, w: 0.05, h: 0.016, kind: 'slim' }, tail: { x: 0.004, y: 0.14, w: 0.01, h: 0.03 },
      bumperF: [0.96, 0.055, 1.006, 0.07], bumperR: [-0.006, 0.055, 0.03, 0.07], mirror: [0.62, 0.215], engine: [0.2, 0.17], height: 0.267,
      details: [{ kind: 'curve', pts: [[0.6, 0.235], [0.42, 0.24], [0.36, 0.19], [0.36, 0.12], [0.42, 0.075]] }, { kind: 'grille', x: 0.985, y: 0.075, w: 0.016, h: 0.04 }, { kind: 'vent', x: 0.3, y: 0.11, w: 0.05, h: 0.06 }, { kind: 'dark', x: 0.25, y: 0.055, w: 0.5, h: 0.012 }],
    },
  },
    {
    // after the Peterbilt 379: the long square hood, the tall grille, the lamps on the wings, chrome stacks, a sleeper
    id: 'longhorn', name: 'Longhorn Semi', kind: 'American long-nose semi', cls: 'heavy', level: 5, value: 530000, year: 1993, rim: 'chrome',
    colors: ['#d6332c', '#1f2b44', '#f4f1ea', '#2f5a3c', '#c9a227'],
    shape: {
      body: [[0, 0.12, 0.005], [0, 0.2, 0.005], [0.2, 0.2, 0.005], [0.2, 0.56, 0.03], [0.33, 0.58, 0.02], [0.36, 0.6, 0.02], [0.5, 0.6, 0.02], [0.54, 0.4, 0.01], [0.97, 0.39, 0.01], [1, 0.36, 0.01], [1, 0.14, 0.01], ...shellArches([W(0.86, 0.1), W(0.25, 0.1), W(0.08, 0.1)], 0.12)],
      windows: [win([0.4, 0.42], [0.4, 0.57], [0.49, 0.58], [0.53, 0.42], 0.005), win([0.24, 0.44], [0.24, 0.53], [0.31, 0.53], [0.31, 0.44], 0.01)],
      wheels: [W(0.08, 0.1), W(0.25, 0.1), W(0.86, 0.1)],
      head: { x: 0.93, y: 0.37, w: 0.045, h: 0.045, kind: 'round' }, tail: { x: 0.005, y: 0.16, w: 0.02, h: 0.03 },
      bumperF: [0.96, 0.1, 1.03, 0.15], mirror: [0.56, 0.48], engine: [0.78, 0.3], height: 0.75,
      details: [{ kind: 'exhaust', x: 0.53, y: 0.6 }, { kind: 'bar', pts: [[0.37, 0.25], [0.37, 0.75]] }, { kind: 'grille', x: 0.975, y: 0.16, w: 0.025, h: 0.22 }, { kind: 'chrome', x: 0, y: 0, w: 0, h: 0 }, line([0.38, 0.13], [0.38, 0.55]), { kind: 'vent', x: 0.6, y: 0.33, w: 0.25, h: 0.02 }],
    },
  },
    {
    // after the John Deere 4020: no cab, the big rear wheels under their fenders, the narrow hood, the upright exhaust
    id: 'fieldking', name: 'Field King', kind: 'American farm tractor of the 60s', cls: 'heavy', level: 5, value: 500000, year: 1964, rim: 'steel',
    colors: ['#2f8a3c', '#d6332c', '#2a5db0', '#e86a1a'],
    shape: {
      body: [[0.1, 0.3, 0.02], [0.08, 0.5, 0.06], [0.2, 0.56, 0.03], [0.4, 0.56, 0.03], [0.44, 0.48, 0.02], [0.92, 0.46, 0.03], [0.98, 0.34, 0.03], [0.92, 0.22, 0.02], [0.55, 0.22, 0.02], [0.45, 0.3, 0.01]],
      windows: [],
      wheels: [W(0.25, 0.25), W(0.84, 0.13)],
      head: { x: 0.96, y: 0.42, w: 0.03, h: 0.03, kind: 'round' }, tail: { x: 0.1, y: 0.42, w: 0.02, h: 0.02 },
      engine: [0.72, 0.34], height: 0.72,
      details: [{ kind: 'exhaust', x: 0.68, y: 0.46 }, { kind: 'bar', pts: [[0.68, 0.46], [0.68, 0.72]] }, { kind: 'bar', pts: [[0.42, 0.56], [0.48, 0.66]] }, { kind: 'seat', x: 0.24, y: 0.56, w: 0.1, h: 0.08 }, { kind: 'grille', x: 0.95, y: 0.26, w: 0.03, h: 0.15 }, { kind: 'vent', x: 0.55, y: 0.36, w: 0.3, h: 0.05 }, { kind: 'tone', y: 0.3, h: -1, color: '#f2c22e' }],
    },
  },
    {
    // after the BTR-80: a boat-shaped eight-wheel hull, the sloped bow, hatches — no weapon
    id: 'rhino', name: 'Rhino 8x8', kind: 'Soviet armoured transport (unarmed)', cls: 'heavy', level: 5, value: 860000, year: 1986, rim: 'steel',
    colors: ['#6d7d4b', '#c9b88a', '#5a6470'],
    shape: {
      body: [[0, 0.17, 0.01], [0.02, 0.36, 0.02], [0.06, 0.4, 0.02], [0.7, 0.4, 0.02], [0.86, 0.36, 0.02], [1, 0.26, 0.02], [0.97, 0.16, 0.02], ...shellArches([W(0.84, 0.085), W(0.64, 0.085), W(0.38, 0.085), W(0.17, 0.085)], 0.16)],
      windows: [win([0.72, 0.34], [0.74, 0.38], [0.84, 0.36], [0.87, 0.33], 0.004)],
      wheels: [W(0.17, 0.085), W(0.38, 0.085), W(0.64, 0.085), W(0.84, 0.085)],
      head: { x: 0.97, y: 0.25, w: 0.025, h: 0.025, kind: 'round' }, tail: { x: 0.01, y: 0.3, w: 0.02, h: 0.02 },
      engine: [0.15, 0.28], height: 0.48,
      details: [{ kind: 'panel', x: 0.4, y: 0.2, w: 0.12, h: 0.14 }, { kind: 'dome', x: 0.5, y: 0.4, w: 0.12, h: 0.06 }, { kind: 'vent', x: 0.05, y: 0.32, w: 0.15, h: 0.04 }, { kind: 'rack', x: 0.1, y: 0.4, w: 0.25, h: 0.015 }],
    },
  },
    {
    // after the Kässbohrer PistenBully: wide tracks, a tall glass cab, the blade in front and the tiller behind
    id: 'snowcat', name: 'Polar Snowcat', kind: 'German snow groomer', cls: 'heavy', level: 5, value: 640000, year: 2001, rim: 'steel',
    colors: ['#d6332c', '#f2c22e', '#f4f1ea'],
    shape: {
      body: [[0.08, 0.2, 0.01], [0.08, 0.36, 0.02], [0.3, 0.38, 0.02], [0.36, 0.7, 0.04], [0.74, 0.7, 0.04], [0.82, 0.42, 0.02], [0.9, 0.36, 0.02], [0.9, 0.2, 0.01]],
      windows: [win([0.4, 0.44], [0.42, 0.66], [0.72, 0.66], [0.78, 0.44], 0.01)],
      wheels: [W(0.14, 0.08), W(0.84, 0.08), W(0.38, 0.065), W(0.6, 0.065)],
      tracks: { x0: 0.05, x1: 0.93, h: 0.2 },
      head: { x: 0.88, y: 0.36, w: 0.04, h: 0.03, kind: 'rect' }, tail: { x: 0.09, y: 0.3, w: 0.02, h: 0.03 },
      engine: [0.6, 0.3], height: 0.7,
      details: [{ kind: 'blade', pts: [[0.93, 0.02], [1.0, 0.04], [1.0, 0.32], [0.94, 0.3]] }, { kind: 'boom', pts: [[0.08, 0.24], [-0.02, 0.08], [0.0, 0.04], [0.08, 0.18]] }, { kind: 'lightbar', x: 0.46, y: 0.7, w: 0.2, h: 0.02 }, { kind: 'stripe', x: 0.08, y: 0.27, w: 0.82, h: 0.02 }],
    },
  },

  // ===== Level 6: the Space hangar (after the prestige)
    {
    // after the Apollo Lunar Roving Vehicle: an open frame, four mesh wheels under fenders, two seats, the dish
    id: 'selene', name: 'Selene Rover', kind: 'American lunar rover of the 70s', cls: 'space', level: 6, value: 5300000, year: 1971, rim: 'mesh',
    colors: ['#d9c08a', '#c9ccd1', '#eef3f8'],
    shape: {
      body: [[0.05, 0.2, 0.01], [0.05, 0.28, 0.02], [0.14, 0.3, 0.02], [0.3, 0.3, 0.01], [0.32, 0.36, 0.01], [0.68, 0.36, 0.01], [0.7, 0.3, 0.01], [0.86, 0.3, 0.02], [0.95, 0.28, 0.02], [0.95, 0.2, 0.01]],
      windows: [],
      wheels: [W(0.16, 0.1), W(0.84, 0.1)],
      head: { x: 0.95, y: 0.25, w: 0.0, h: 0.0, kind: 'none' }, tail: { x: 0.05, y: 0.25, w: 0.0, h: 0.0 },
      engine: [0.5, 0.25], height: 0.62,
      details: [{ kind: 'seat', x: 0.36, y: 0.36, w: 0.1, h: 0.08 }, { kind: 'seat', x: 0.52, y: 0.36, w: 0.1, h: 0.08 }, { kind: 'bar', pts: [[0.85, 0.3], [0.85, 0.5]] }, { kind: 'dish', x: 0.8, y: 0.5, w: 0.14, h: 0.12 }, { kind: 'bar', pts: [[0.2, 0.3], [0.2, 0.46]] }, { kind: 'panel', x: 0.06, y: 0.21, w: 0.88, h: 0.06 }],
    },
  },
    {
    // after the Space Shuttle orbiter: black belly and nose, the delta wing, the tail fin, three main engines and the
    // manoeuvring pod; it stands on its landing gear
    id: 'orbiter', name: 'Orbiter Shuttle', kind: 'American orbital shuttle', cls: 'space', level: 6, value: 7700000, year: 1981,
    colors: ['#f4f1ea', '#e8e2d0'],
    shape: {
      body: [[0.0, 0.16, 0.01], [0.0, 0.3, 0.01], [0.04, 0.32, 0.01], [0.05, 0.46, 0.01], [0.12, 0.46, 0.01], [0.2, 0.32, 0.02], [0.75, 0.32, 0.06], [0.9, 0.28, 0.06], [1, 0.2, 0.04], [0.92, 0.12, 0.03], [0.1, 0.12, 0.01]],
      windows: [win([0.82, 0.25], [0.85, 0.29], [0.92, 0.27], [0.95, 0.23], 0.01)],
      wheels: [],
      thrusters: [T(0.0, 0.19, 0.028), T(0.0, 0.25, 0.028), T(0.043, 0.37, 0.018)],
      legs: [[0.25, 0.12], [0.85, 0.125]],
      head: { x: 0.97, y: 0.18, w: 0.0, h: 0.0, kind: 'none' }, tail: { x: 0.0, y: 0.2, w: 0.03, h: 0.06 },
      engine: [0.08, 0.22], height: 0.46,
      details: [{ kind: 'tone', y: 0.17, h: -1, color: '#1c1c24' }, { kind: 'dark', x: 0.9, y: 0.14, w: 0.1, h: 0.1 }, { kind: 'panel', x: 0.3, y: 0.2, w: 0.42, h: 0.1 }, { kind: 'spoiler', pts: [[0.3, 0.17], [0.7, 0.17], [0.55, 0.1], [0.38, 0.1]] }],
    },
  },
    {
    // after the Soyuz rocket: the core stage, the strap-on boosters with their cones, lying in its launch cradle
    id: 'spark', name: 'Spark Launcher', kind: 'Soviet rocket of the 60s', cls: 'space', level: 6, value: 6200000, year: 1967,
    colors: ['#e8edf3', '#c9ccd1'],
    shape: {
      body: [[0.0, 0.18, 0.01], [0.0, 0.32, 0.01], [0.3, 0.33, 0.04], [0.38, 0.3, 0.02], [0.8, 0.3, 0.01], [0.86, 0.29, 0.03], [1, 0.25, 0.04], [0.86, 0.21, 0.03], [0.8, 0.2, 0.01], [0.38, 0.2, 0.02], [0.3, 0.17, 0.04]],
      windows: [],
      wheels: [],
      thrusters: [T(0.0, 0.21, 0.022), T(0.0, 0.25, 0.026), T(0.0, 0.29, 0.022)],
      legs: [[0.3, 0.17], [0.7, 0.2]],
      head: { x: 0.97, y: 0.25, w: 0.0, h: 0.0, kind: 'none' }, tail: { x: 0.0, y: 0.22, w: 0.02, h: 0.08 },
      engine: [0.06, 0.25], height: 0.36,
      details: [{ kind: 'stripe', x: 0.42, y: 0.2, w: 0.03, h: 0.1 }, { kind: 'stripe', x: 0.62, y: 0.2, w: 0.03, h: 0.1 }, line([0.3, 0.18], [0.3, 0.32]), { kind: 'panel', x: 0.82, y: 0.215, w: 0.05, h: 0.07 }],
    },
  },
    {
    // our own design: a boxy cargo hauler (no real counterpart)
    id: 'packmule', name: 'Packmule Freighter', kind: 'boxy cargo spaceship', cls: 'space', level: 6, value: 9100000, year: 2049,
    colors: ['#c9ccd1', '#f2c22e', '#e86a1a', '#9be7ff'],
    shape: {
      body: [[0.0, 0.14, 0.02], [0.0, 0.46, 0.02], [0.1, 0.5, 0.02], [0.68, 0.5, 0.02], [0.78, 0.44, 0.04], [0.96, 0.4, 0.05], [1, 0.3, 0.04], [0.94, 0.2, 0.03], [0.75, 0.14, 0.02]],
      windows: [[[0.82, 0.32, 0.02], [0.84, 0.4, 0.02], [0.94, 0.38, 0.02], [0.96, 0.31, 0.02]]],
      wheels: [],
      thrusters: [T(0.0, 0.22, 0.035), T(0.0, 0.38, 0.035)],
      legs: [[0.15, 0.14], [0.62, 0.14]],
      head: { x: 0.97, y: 0.26, w: 0.03, h: 0.02, kind: 'slim' }, tail: { x: 0.0, y: 0.3, w: 0.02, h: 0.1 },
      engine: [0.1, 0.32], height: 0.5,
      details: [{ kind: 'panel', x: 0.08, y: 0.2, w: 0.25, h: 0.25 }, { kind: 'panel', x: 0.36, y: 0.2, w: 0.25, h: 0.25 }, { kind: 'stripe', x: 0.0, y: 0.47, w: 0.7, h: 0.015 }],
    },
  },
    {
    // after the Apollo Lunar Module: the gold-foil descent stage on its legs, the angular cabin above, the descent engine
    // under it
    id: 'moth', name: 'Moth Lander', kind: 'American lunar lander of the 60s', cls: 'space', level: 6, value: 5600000, year: 1969,
    colors: ['#c9ccd1', '#e8e2d0', '#9aa3ad'],
    shape: {
      body: [[0.1, 0.25, 0.01], [0.1, 0.45, 0.01], [0.2, 0.47, 0.01], [0.22, 0.72, 0.02], [0.35, 0.8, 0.02], [0.62, 0.8, 0.02], [0.82, 0.68, 0.02], [0.86, 0.47, 0.01], [0.9, 0.45, 0.01], [0.9, 0.25, 0.01]],
      windows: [win([0.7, 0.58], [0.73, 0.69], [0.8, 0.65], [0.8, 0.57], 0.01)],
      wheels: [],
      thrusters: [T(0.5, 0.25, 0.07, true), T(0.215, 0.62, 0.018)],
      legs: [[0.14, 0.25], [0.86, 0.25]],
      head: { x: 0.9, y: 0.4, w: 0.0, h: 0.0, kind: 'none' }, tail: { x: 0.1, y: 0.4, w: 0.0, h: 0.0 },
      engine: [0.5, 0.6], height: 0.82,
      details: [{ kind: 'tone', y: 0.46, h: -1, color: '#d9a43a' }, { kind: 'dish', x: 0.32, y: 0.8, w: 0.12, h: 0.1 }, { kind: 'panel', x: 0.3, y: 0.52, w: 0.3, h: 0.16 }, { kind: 'stripe', x: 0.1, y: 0.35, w: 0.8, h: 0.012 }],
    },
  },
    {
    // after the Apollo command and service module: the service module's drum, the cone of the crew cabin, one big engine
    id: 'drift', name: 'Drift Capsule', kind: 'American crew capsule of the 60s', cls: 'space', level: 6, value: 5900000, year: 1968,
    colors: ['#e8edf3', '#c9ccd1'],
    shape: {
      body: [[0.06, 0.15, 0.01], [0.06, 0.45, 0.01], [0.62, 0.45, 0.01], [0.95, 0.33, 0.03], [1, 0.3, 0.02], [0.95, 0.27, 0.03], [0.62, 0.15, 0.01]],
      windows: [win([0.77, 0.355], [0.79, 0.395], [0.84, 0.375], [0.83, 0.345], 0.008)],
      wheels: [],
      thrusters: [T(0.06, 0.3, 0.075)],
      legs: [[0.2, 0.15], [0.52, 0.15]],
      head: { x: 0.98, y: 0.3, w: 0.0, h: 0.0, kind: 'none' }, tail: { x: 0.06, y: 0.3, w: 0.0, h: 0.0 },
      engine: [0.35, 0.3], height: 0.5,
      details: [{ kind: 'panel', x: 0.12, y: 0.2, w: 0.14, h: 0.2 }, { kind: 'panel', x: 0.32, y: 0.2, w: 0.14, h: 0.2 }, { kind: 'stripe', x: 0.06, y: 0.42, w: 0.56, h: 0.015 }, { kind: 'dish', x: 0.36, y: 0.45, w: 0.1, h: 0.08 }],
    },
  },
    {
    // after the Crew Dragon: the rounded capsule, the trunk with its solar cells behind it, the side thrusters' pods
    id: 'drake', name: 'Drake Capsule', kind: 'American crew capsule of the 2020s', cls: 'space', level: 6, value: 6800000, year: 2020,
    colors: ['#f4f6f8', '#e8edf3'],
    shape: {
      body: [[0.05, 0.12, 0.01], [0.05, 0.5, 0.01], [0.4, 0.5, 0.01], [0.45, 0.52, 0.02], [0.85, 0.42, 0.08], [1, 0.31, 0.06], [0.85, 0.2, 0.08], [0.45, 0.1, 0.02], [0.4, 0.12, 0.01]],
      windows: [win([0.62, 0.38], [0.64, 0.44], [0.71, 0.42], [0.71, 0.37], 0.012)],
      wheels: [],
      thrusters: [T(0.56, 0.125, 0.024, true), T(0.76, 0.175, 0.024, true)],
      legs: [[0.14, 0.12], [0.36, 0.12]],
      head: { x: 0.98, y: 0.3, w: 0.0, h: 0.0, kind: 'none' }, tail: { x: 0.05, y: 0.3, w: 0.0, h: 0.0 },
      engine: [0.65, 0.3], height: 0.56,
      details: [{ kind: 'tone', pts: [[0.05, 0.12], [0.4, 0.12], [0.4, 0.3], [0.05, 0.3]], color: '#1f2a44' }, line([0.05, 0.21], [0.4, 0.21]), { kind: 'stripe', x: 0.45, y: 0.29, w: 0.42, h: 0.02, color: '#1c1c24' }],
    },
  },
    {
    // our own design: a stubby orbital tug with a grab arm
    id: 'tug', name: 'Pocket Tug', kind: 'orbital tug', cls: 'space', level: 6, value: 5400000, year: 2041,
    colors: ['#f2c22e', '#e86a1a', '#c9ccd1'],
    shape: {
      body: [[0.05, 0.18, 0.03], [0.05, 0.5, 0.03], [0.5, 0.55, 0.05], [0.8, 0.5, 0.06], [0.95, 0.42, 0.05], [0.95, 0.26, 0.04], [0.8, 0.18, 0.03]],
      windows: [win([0.72, 0.38], [0.75, 0.48], [0.88, 0.45], [0.9, 0.38], 0.02)],
      wheels: [],
      thrusters: [T(0.05, 0.27, 0.04), T(0.05, 0.42, 0.04)],
      legs: [[0.2, 0.18], [0.75, 0.18]],
      head: { x: 0.95, y: 0.3, w: 0.02, h: 0.02, kind: 'slim' }, tail: { x: 0.05, y: 0.35, w: 0.0, h: 0.0 },
      engine: [0.3, 0.35], height: 0.58,
      details: [{ kind: 'boom', pts: [[0.95, 0.31], [1.06, 0.29], [1.09, 0.21], [1.02, 0.24], [0.95, 0.27]] }, { kind: 'stripe', x: 0.05, y: 0.33, w: 0.6, h: 0.03, color: '#1c1c24' }, { kind: 'panel', x: 0.18, y: 0.38, w: 0.3, h: 0.1 }],
    },
  },
    {
    // after the Buran orbiter: like the shuttle but leaner, no main engines (only its manoeuvring pods), the black belly
    id: 'blizzard', name: 'Snowstorm Orbiter', kind: 'Soviet orbital shuttle of the 80s', cls: 'space', level: 6, value: 7300000, year: 1988,
    colors: ['#eef1f5', '#e2e6ea'],
    shape: {
      body: [[0.02, 0.14, 0.01], [0.02, 0.28, 0.01], [0.06, 0.31, 0.01], [0.08, 0.48, 0.01], [0.14, 0.48, 0.01], [0.22, 0.31, 0.02], [0.72, 0.31, 0.07], [0.9, 0.27, 0.07], [1, 0.19, 0.05], [0.9, 0.11, 0.03], [0.12, 0.11, 0.01]],
      windows: [win([0.8, 0.245], [0.83, 0.285], [0.9, 0.265], [0.93, 0.225], 0.01)],
      wheels: [],
      thrusters: [T(0.02, 0.18, 0.024), T(0.02, 0.245, 0.024)],
      legs: [[0.25, 0.11], [0.86, 0.115]],
      head: { x: 0.97, y: 0.18, w: 0.0, h: 0.0, kind: 'none' }, tail: { x: 0.02, y: 0.2, w: 0.0, h: 0.0 },
      engine: [0.1, 0.22], height: 0.48,
      details: [{ kind: 'tone', y: 0.16, h: -1, color: '#1c1c24' }, { kind: 'dark', x: 0.91, y: 0.13, w: 0.09, h: 0.09 }, { kind: 'spoiler', pts: [[0.28, 0.16], [0.72, 0.16], [0.56, 0.09], [0.36, 0.09]] }, { kind: 'stripe', x: 0.22, y: 0.27, w: 0.5, h: 0.012 }],
    },
  },
    {
    // after Starship: the long stainless hull, the flaps fore and aft, the black heat tiles on its belly, three engines
    id: 'tallship', name: 'Tallship', kind: 'American steel starship of the 2020s', cls: 'space', level: 6, value: 9600000, year: 2023,
    colors: ['#c9ccd1', '#b8bcc4'],
    shape: {
      body: [[0.0, 0.14, 0.01], [0.0, 0.36, 0.01], [0.7, 0.36, 0.01], [0.85, 0.34, 0.06], [0.97, 0.29, 0.06], [1, 0.25, 0.04], [0.97, 0.21, 0.06], [0.85, 0.16, 0.06], [0.7, 0.14, 0.01]],
      windows: [],
      wheels: [],
      thrusters: [T(0.0, 0.19, 0.03), T(0.0, 0.25, 0.035), T(0.0, 0.31, 0.03)],
      legs: [[0.2, 0.14], [0.6, 0.14]],
      head: { x: 0.98, y: 0.25, w: 0.0, h: 0.0, kind: 'none' }, tail: { x: 0.0, y: 0.25, w: 0.0, h: 0.0 },
      engine: [0.08, 0.25], height: 0.46,
      details: [{ kind: 'tone', y: 0.2, h: -1, color: '#24262c' }, { kind: 'spoiler', pts: [[0.03, 0.36], [0.17, 0.36], [0.11, 0.45], [0.04, 0.45]] }, { kind: 'spoiler', pts: [[0.8, 0.345], [0.9, 0.31], [0.88, 0.4], [0.82, 0.41]] }, line([0.35, 0.14], [0.35, 0.36]), line([0.55, 0.14], [0.55, 0.36])],
    },
  },
    {
    // after the Falcon 9 first stage: the slim white booster, the black interstage and grid fins at its top
    id: 'kestrel', name: 'Kestrel Booster', kind: 'American reusable booster of the 2010s', cls: 'space', level: 6, value: 6500000, year: 2015,
    colors: ['#f4f6f8', '#e8edf3'],
    shape: {
      body: [[0.02, 0.16, 0.01], [0.02, 0.3, 0.01], [0.97, 0.3, 0.01], [1, 0.28, 0.01], [1, 0.18, 0.01], [0.97, 0.16, 0.01]],
      windows: [],
      wheels: [],
      thrusters: [T(0.02, 0.19, 0.022), T(0.02, 0.23, 0.024), T(0.02, 0.27, 0.022)],
      legs: [[0.1, 0.16], [0.5, 0.16]],
      head: { x: 0.98, y: 0.23, w: 0.0, h: 0.0, kind: 'none' }, tail: { x: 0.02, y: 0.23, w: 0.0, h: 0.0 },
      engine: [0.1, 0.23], height: 0.34,
      details: [{ kind: 'tone', pts: [[0.86, 0.16], [1, 0.16], [1, 0.3], [0.86, 0.3]], color: '#24262c' }, { kind: 'rack', x: 0.88, y: 0.305, w: 0.06, h: 0.015 }, { kind: 'stripe', x: 0.02, y: 0.16, w: 0.12, h: 0.14, color: '#3a3d44' }],
    },
  },
    {
    // after the X-15: the black needle of a rocket plane, its wedge tail and the fin under it, one engine
    id: 'arrowx', name: 'Arrow X', kind: 'American rocket plane of the 60s', cls: 'space', level: 6, value: 5200000, year: 1959,
    colors: ['#2b2f38', '#1c1c24', '#c9ccd1'],
    shape: {
      body: [[0.0, 0.16, 0.01], [0.0, 0.26, 0.01], [0.04, 0.27, 0.01], [0.06, 0.44, 0.01], [0.13, 0.44, 0.01], [0.2, 0.28, 0.02], [0.75, 0.27, 0.03], [0.88, 0.25, 0.04], [1, 0.21, 0.02], [0.88, 0.18, 0.03], [0.2, 0.15, 0.01], [0.12, 0.08, 0.01], [0.05, 0.08, 0.01], [0.06, 0.15, 0.01]],
      windows: [win([0.72, 0.27], [0.75, 0.305], [0.81, 0.295], [0.83, 0.26], 0.01)],
      wheels: [],
      thrusters: [T(0.0, 0.21, 0.035)],
      legs: [[0.3, 0.15], [0.8, 0.182]],
      head: { x: 0.98, y: 0.21, w: 0.0, h: 0.0, kind: 'none' }, tail: { x: 0.0, y: 0.21, w: 0.0, h: 0.0 },
      engine: [0.12, 0.21], height: 0.46,
      details: [{ kind: 'spoiler', pts: [[0.32, 0.19], [0.5, 0.19], [0.44, 0.13], [0.36, 0.13]] }, { kind: 'stripe', x: 0.2, y: 0.205, w: 0.55, h: 0.01, color: '#c9ccd1' }],
    },
  },
    {
    // after the Saturn V: three stages narrowing toward the escape tower, the black roll pattern, its fins
    id: 'colossus', name: 'Colossus V', kind: 'American moon rocket of the 60s', cls: 'space', level: 6, value: 11000000, year: 1967,
    colors: ['#f4f6f8', '#eef1f5'],
    shape: {
      body: [[0.0, 0.13, 0.01], [0.0, 0.33, 0.01], [0.4, 0.33, 0.01], [0.44, 0.31, 0.01], [0.72, 0.31, 0.01], [0.74, 0.29, 0.01], [0.86, 0.29, 0.01], [0.9, 0.26, 0.01], [0.95, 0.25, 0.01], [1, 0.23, 0.005], [0.95, 0.21, 0.01], [0.9, 0.2, 0.01], [0.86, 0.17, 0.01], [0.74, 0.17, 0.01], [0.72, 0.15, 0.01], [0.44, 0.15, 0.01], [0.4, 0.13, 0.01]],
      windows: [],
      wheels: [],
      thrusters: [T(0.0, 0.17, 0.03), T(0.0, 0.23, 0.036), T(0.0, 0.29, 0.03)],
      legs: [[0.15, 0.13], [0.6, 0.15]],
      head: { x: 0.98, y: 0.23, w: 0.0, h: 0.0, kind: 'none' }, tail: { x: 0.0, y: 0.23, w: 0.0, h: 0.0 },
      engine: [0.1, 0.23], height: 0.4,
      details: [{ kind: 'tone', pts: [[0.02, 0.13], [0.1, 0.13], [0.1, 0.23], [0.02, 0.23]], color: '#1c1c24' }, { kind: 'tone', pts: [[0.28, 0.23], [0.36, 0.23], [0.36, 0.33], [0.28, 0.33]], color: '#1c1c24' }, { kind: 'tone', pts: [[0.6, 0.15], [0.66, 0.15], [0.66, 0.23], [0.6, 0.23]], color: '#1c1c24' }, line([0.4, 0.13], [0.4, 0.33]), line([0.72, 0.15], [0.72, 0.31]), { kind: 'spoiler', pts: [[0.0, 0.33], [0.08, 0.33], [0.03, 0.38], [-0.02, 0.38]] }],
    },
  },
    {
    // our own design: an asteroid miner with ore bins and a drill for a nose
    id: 'orehauler', name: 'Ore Hauler', kind: 'asteroid mining ship', cls: 'space', level: 6, value: 9800000, year: 2061,
    colors: ['#f2c22e', '#c9ccd1', '#e86a1a'],
    shape: {
      body: [[0.0, 0.14, 0.02], [0.0, 0.48, 0.02], [0.55, 0.5, 0.03], [0.62, 0.44, 0.02], [0.82, 0.44, 0.04], [0.9, 0.38, 0.03], [0.9, 0.2, 0.03], [0.82, 0.14, 0.02]],
      windows: [win([0.68, 0.36], [0.7, 0.42], [0.8, 0.42], [0.82, 0.36], 0.01)],
      wheels: [],
      thrusters: [T(0.0, 0.2, 0.03), T(0.0, 0.28, 0.03), T(0.0, 0.36, 0.03), T(0.0, 0.43, 0.026)],
      legs: [[0.15, 0.14], [0.75, 0.14]],
      head: { x: 0.9, y: 0.3, w: 0.0, h: 0.0, kind: 'none' }, tail: { x: 0.0, y: 0.3, w: 0.0, h: 0.0 },
      engine: [0.12, 0.3], height: 0.52,
      details: [{ kind: 'blade', pts: [[0.9, 0.21], [1.0, 0.29], [0.9, 0.37]] }, { kind: 'panel', x: 0.08, y: 0.2, w: 0.2, h: 0.24 }, { kind: 'panel', x: 0.31, y: 0.2, w: 0.2, h: 0.24 }, { kind: 'stripe', x: 0.0, y: 0.16, w: 0.82, h: 0.02, color: '#1c1c24' }],
    },
  },
    {
    // our own design: a slender science ship with a ring and a dish; its ion engines burn blue
    id: 'ion', name: 'Glow Drifter', kind: 'ion-drive science ship', cls: 'space', level: 6, value: 8400000, year: 2072, flame: '#7fd8ff',
    colors: ['#eef3f8', '#9be7ff', '#c9ccd1'],
    shape: {
      body: [[0.05, 0.2, 0.02], [0.05, 0.36, 0.02], [0.3, 0.38, 0.02], [0.34, 0.46, 0.02], [0.46, 0.46, 0.02], [0.5, 0.38, 0.02], [0.85, 0.36, 0.04], [1, 0.28, 0.04], [0.85, 0.2, 0.04], [0.5, 0.18, 0.02], [0.46, 0.1, 0.02], [0.34, 0.1, 0.02], [0.3, 0.18, 0.02]],
      windows: [win([0.84, 0.29], [0.86, 0.33], [0.93, 0.31], [0.94, 0.28], 0.01)],
      wheels: [],
      thrusters: [T(0.05, 0.24, 0.026), T(0.05, 0.32, 0.026)],
      legs: [[0.4, 0.1], [0.75, 0.185]],
      head: { x: 0.98, y: 0.28, w: 0.0, h: 0.0, kind: 'none' }, tail: { x: 0.05, y: 0.28, w: 0.0, h: 0.0 },
      engine: [0.2, 0.28], height: 0.5,
      details: [{ kind: 'dish', x: 0.6, y: 0.37, w: 0.14, h: 0.1 }, { kind: 'stripe', x: 0.34, y: 0.27, w: 0.12, h: 0.02, color: '#4aa8ff' }, { kind: 'panel', x: 0.55, y: 0.22, w: 0.25, h: 0.1 }],
    },
  },
    {
    // our own design: a racing ship of the solar-system circuit
    id: 'skyracer', name: 'Halo Racer', kind: 'solar-system racing ship', cls: 'space', level: 6, value: 10500000, year: 2080,
    colors: ['#ff4f7a', '#3fd0d8', '#f2c22e', '#9b59ff'],
    shape: {
      body: [[0.0, 0.2, 0.02], [0.0, 0.3, 0.02], [0.08, 0.4, 0.02], [0.2, 0.36, 0.02], [0.55, 0.36, 0.06], [0.8, 0.3, 0.08], [1, 0.22, 0.03], [0.75, 0.16, 0.04], [0.3, 0.14, 0.02], [0.1, 0.16, 0.02]],
      windows: [win([0.55, 0.33], [0.6, 0.38], [0.7, 0.355], [0.74, 0.3], 0.02)],
      wheels: [],
      thrusters: [T(0.0, 0.225, 0.025), T(0.0, 0.28, 0.025)],
      legs: [[0.25, 0.145], [0.7, 0.16]],
      head: { x: 0.98, y: 0.22, w: 0.03, h: 0.015, kind: 'slim' }, tail: { x: 0.0, y: 0.25, w: 0.0, h: 0.0 },
      engine: [0.12, 0.25], height: 0.44,
      details: [{ kind: 'stripe', x: 0.05, y: 0.25, w: 0.85, h: 0.02, color: '#ffffff' }, { kind: 'spoiler', pts: [[0.2, 0.17], [0.5, 0.15], [0.36, 0.06], [0.26, 0.07]] }],
    },
  },
    {
    // our own design: a liner with a row of portholes
    id: 'cruiser', name: 'Ring Cruiser', kind: 'passenger space liner', cls: 'space', level: 6, value: 11500000, year: 2090,
    colors: ['#eef3f8', '#e8e2d0', '#9be7ff'],
    shape: {
      body: [[0.0, 0.14, 0.02], [0.0, 0.44, 0.02], [0.1, 0.48, 0.03], [0.78, 0.48, 0.06], [0.95, 0.4, 0.06], [1, 0.32, 0.04], [0.95, 0.2, 0.04], [0.8, 0.14, 0.02]],
      windows: [...[0.16, 0.24, 0.32, 0.4, 0.48, 0.56, 0.64].map((x) => win([x, 0.36], [x, 0.4], [x + 0.04, 0.4], [x + 0.04, 0.36], 0.015)), win([0.84, 0.36], [0.86, 0.42], [0.94, 0.39], [0.96, 0.34], 0.015)],
      wheels: [],
      thrusters: [T(0.0, 0.2, 0.03), T(0.0, 0.29, 0.035), T(0.0, 0.38, 0.03)],
      legs: [[0.15, 0.14], [0.7, 0.14]],
      head: { x: 0.98, y: 0.3, w: 0.02, h: 0.02, kind: 'slim' }, tail: { x: 0.0, y: 0.3, w: 0.0, h: 0.0 },
      engine: [0.08, 0.3], height: 0.52,
      details: [{ kind: 'stripe', x: 0.0, y: 0.3, w: 0.95, h: 0.025, color: '#4aa8ff' }, { kind: 'stripe', x: 0.0, y: 0.18, w: 0.8, h: 0.012, color: '#9aa3ad' }],
    },
  },
    {
    // our own design: an ice miner of the outer planets with a cutter for a nose
    id: 'icebreaker', name: 'Frost Breaker', kind: 'ice-mining ship of the outer planets', cls: 'space', level: 6, value: 10200000, year: 2085,
    colors: ['#3fd0d8', '#c9ccd1', '#eef3f8'],
    shape: {
      body: [[0.0, 0.14, 0.02], [0.0, 0.46, 0.02], [0.6, 0.46, 0.02], [0.66, 0.52, 0.02], [0.8, 0.52, 0.02], [0.86, 0.44, 0.02], [0.86, 0.14, 0.02]],
      windows: [win([0.68, 0.45], [0.7, 0.5], [0.78, 0.5], [0.8, 0.45], 0.01)],
      wheels: [],
      thrusters: [T(0.0, 0.21, 0.035), T(0.0, 0.39, 0.035)],
      legs: [[0.15, 0.14], [0.7, 0.14]],
      head: { x: 0.86, y: 0.3, w: 0.0, h: 0.0, kind: 'none' }, tail: { x: 0.0, y: 0.3, w: 0.0, h: 0.0 },
      engine: [0.12, 0.3], height: 0.56,
      details: [{ kind: 'blade', pts: [[0.86, 0.16], [1.0, 0.2], [1.0, 0.38], [0.86, 0.42]] }, { kind: 'panel', x: 0.08, y: 0.2, w: 0.5, h: 0.2 }, { kind: 'stripe', x: 0.0, y: 0.43, w: 0.6, h: 0.015, color: '#1c1c24' }],
    },
  },
    {
    // our own design: a long ark with two habitat rings
    id: 'nomad', name: 'Last Nomad', kind: 'deep-space ark', cls: 'space', level: 6, value: 12500000, year: 2120,
    colors: ['#c9ccd1', '#e8e2d0', '#9aa3ad'],
    shape: {
      body: [[0.0, 0.18, 0.02], [0.0, 0.38, 0.02], [0.2, 0.38, 0.01], [0.22, 0.5, 0.03], [0.36, 0.5, 0.03], [0.38, 0.38, 0.01], [0.5, 0.38, 0.01], [0.52, 0.5, 0.03], [0.66, 0.5, 0.03], [0.68, 0.38, 0.01], [0.85, 0.36, 0.05], [1, 0.28, 0.04], [0.85, 0.2, 0.05], [0.68, 0.18, 0.01], [0.66, 0.06, 0.03], [0.52, 0.06, 0.03], [0.5, 0.18, 0.01], [0.38, 0.18, 0.01], [0.36, 0.06, 0.03], [0.22, 0.06, 0.03], [0.2, 0.18, 0.01]],
      windows: [win([0.86, 0.29], [0.88, 0.33], [0.94, 0.31], [0.95, 0.28], 0.01), win([0.25, 0.42], [0.25, 0.46], [0.33, 0.46], [0.33, 0.42], 0.01), win([0.55, 0.42], [0.55, 0.46], [0.63, 0.46], [0.63, 0.42], 0.01)],
      wheels: [],
      thrusters: [T(0.0, 0.23, 0.035), T(0.0, 0.33, 0.035)],
      legs: [[0.29, 0.06], [0.59, 0.06]],
      head: { x: 0.98, y: 0.28, w: 0.0, h: 0.0, kind: 'none' }, tail: { x: 0.0, y: 0.28, w: 0.0, h: 0.0 },
      engine: [0.1, 0.28], height: 0.54,
      details: [{ kind: 'stripe', x: 0.22, y: 0.27, w: 0.14, h: 0.03, color: '#4f74e8' }, { kind: 'stripe', x: 0.52, y: 0.27, w: 0.14, h: 0.03, color: '#4f74e8' }, { kind: 'dish', x: 0.74, y: 0.36, w: 0.1, h: 0.08 }],
    },
  },
    {
    // our own design: a three-hulled patrol cruiser of the outer system
    id: 'trident', name: 'Deep Trident', kind: 'patrol cruiser of the outer system', cls: 'space', level: 6, value: 13000000, year: 2110,
    colors: ['#4f74e8', '#2b2f38', '#c9ccd1'],
    shape: {
      body: [[0.0, 0.12, 0.02], [0.0, 0.24, 0.02], [0.18, 0.26, 0.02], [0.2, 0.34, 0.02], [0.0, 0.36, 0.02], [0.0, 0.48, 0.02], [0.4, 0.46, 0.04], [0.62, 0.4, 0.05], [0.85, 0.34, 0.05], [1, 0.28, 0.03], [0.85, 0.22, 0.04], [0.55, 0.12, 0.03]],
      windows: [win([0.8, 0.29], [0.83, 0.335], [0.92, 0.31], [0.94, 0.27], 0.012)],
      wheels: [],
      thrusters: [T(0.0, 0.18, 0.035), T(0.0, 0.42, 0.035)],
      legs: [[0.2, 0.12], [0.6, 0.13]],
      head: { x: 0.98, y: 0.28, w: 0.02, h: 0.015, kind: 'slim' }, tail: { x: 0.0, y: 0.3, w: 0.0, h: 0.0 },
      engine: [0.1, 0.3], height: 0.5,
      details: [{ kind: 'stripe', x: 0.2, y: 0.3, w: 0.65, h: 0.02, color: '#9be7ff' }, { kind: 'panel', x: 0.25, y: 0.34, w: 0.3, h: 0.08 }, { kind: 'dish', x: 0.45, y: 0.46, w: 0.1, h: 0.07 }],
    },
  },
    {
    // our own design: a one-seat scout with swept wings
    id: 'scout', name: 'Dart Scout', kind: 'one-seat scout ship', cls: 'space', level: 6, value: 5000000, year: 2070,
    colors: ['#e86a1a', '#c9ccd1', '#7cc22e'],
    shape: {
      body: [[0.05, 0.2, 0.02], [0.05, 0.34, 0.02], [0.15, 0.38, 0.02], [0.5, 0.42, 0.06], [0.75, 0.36, 0.06], [1, 0.26, 0.03], [0.75, 0.2, 0.04], [0.4, 0.16, 0.02], [0.15, 0.16, 0.02]],
      windows: [win([0.55, 0.38], [0.6, 0.43], [0.72, 0.4], [0.74, 0.35], 0.02)],
      wheels: [],
      thrusters: [T(0.05, 0.24, 0.025), T(0.05, 0.3, 0.025)],
      legs: [[0.33, 0.08], [0.72, 0.2]],
      head: { x: 0.98, y: 0.26, w: 0.02, h: 0.015, kind: 'slim' }, tail: { x: 0.05, y: 0.27, w: 0.0, h: 0.0 },
      engine: [0.2, 0.27], height: 0.48,
      details: [{ kind: 'spoiler', pts: [[0.25, 0.2], [0.55, 0.2], [0.42, 0.08], [0.3, 0.08]] }, { kind: 'stripe', x: 0.15, y: 0.27, w: 0.6, h: 0.02, color: '#1c1c24' }],
    },
  },
    {
    id: 'unknown', name: 'Unknown Object', kind: 'origin unknown', cls: 'space', level: 6, value: 14000000, year: 0,
    colors: ['#3a2a6a', '#1c3a4a', '#4a1c3a'],
    shape: {
      body: [[0.0, 0.3, 0.12], [0.15, 0.52, 0.15], [0.5, 0.6, 0.2], [0.85, 0.52, 0.15], [1, 0.3, 0.12], [0.85, 0.1, 0.12], [0.5, 0.04, 0.15], [0.15, 0.1, 0.12]],
      windows: [],
      wheels: [],
      head: { x: 0.5, y: 0.3, w: 0.0, h: 0.0, kind: 'none' }, tail: { x: 0.0, y: 0.3, w: 0.0, h: 0.0 },
      engine: [0.5, 0.32], height: 0.6,
      details: [{ kind: 'glyph', x: 0.5, y: 0.32, w: 0.4, h: 0.3 }],
    },
  },

];

/** The arches only (for hand-drawn bodies that end their top line at the front bottom) */
function shellArches(wheels: Wheel[], sill: number): Pt[] {
  return shell([], sill, wheels);
}

// --- The owner's painted cars (2026-10-16: «переработай старые машины в новые дизайны»): a car with a picture takes its
// silhouette, wheels and bumpers from the picture (painted/meta.ts, made by tools/paint-cars), keeps its name, class,
// value and engine place; the picture's own paint comes first in its colours

function decodeBits(b64: string, n: number): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
  return out;
}

/** Two-tone pictures: a recolour can't tell their tones apart, they keep the paint they were painted in */
const TWO_TONE = new Set(['mach', 'horseshoe']);
/** Pictures recoloured only to shades near their own paint */
// The dark greens too: their pictures' teal reflections stay in a far colour (a brown Verdant read as an oil slick: the
// reviewer, 1.4.0)
const OWN_SHADES = new Set(['rhino', 'verdant', 'monarch', 'emerald', 'swiftarrow', 'mulberry', 'prowler', 'carboncrown', 'halo']);

function hslOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d < 1e-6) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function hexOf(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

/**
 * The colours a painted car comes in and is resprayed in, the rare one last. Only what recolours cleanly from the
 * picture's paint (the reviewer, 2026-10-16: blotches and white streaks from far colours): a coloured car turns its hue
 * at the same saturation and lightness; a white, silver or black car keeps to near shades; a two-tone keeps its own
 */
function paintedColours(id: string, src: string): string[] {
  if (TWO_TONE.has(id)) return [src, src];
  // A military picture keeps to its own olive and the shades near it (a red-brown turned only its trim: the reviewer, 1.3.5)
  if (OWN_SHADES.has(id)) {
    const [h, s, l] = hslOf(src);
    const at = (d: number) => (h + d + 360) % 360;
    return [src, hexOf(at(18), s * 0.8, l + 0.05), hexOf(at(-30), s, l + 0.03), hexOf(h, s * 0.4, l + 0.04), hexOf(at(8), s * 1.2, l - 0.04), hexOf(at(-40), s * 1.1, l + 0.08)];
  }
  const [h, s, l] = hslOf(src);
  if (s >= 0.25) return [0, 150, 210, 40, 270, 320].map((d) => hexOf((h + d) % 360, s, l));
  if (l > 0.75) return [src, '#f2efe6', '#e9edf2', '#efe6d2', '#e4ece9', '#f1e3ea'];
  if (l > 0.45) return [src, hexOf(210, 0.06, l), hexOf(40, 0.08, l), hexOf(0, 0, Math.max(0.5, l - 0.08)), hexOf(150, 0.06, l), hexOf(30, 0.18, l)];
  return [src, hexOf(220, 0.25, l), hexOf(0, 0.25, l), hexOf(150, 0.2, l), hexOf(0, 0, l + 0.05), hexOf(280, 0.3, l)];
}

function paintedModel(m: Model, p: PaintedMeta): Model {
  const h = (p.img.len * p.img.h) / p.img.w;
  const shape: VehicleShape = {
    body: p.outline.map(([x, y]) => [x, y, 0] as Pt),
    windows: [],
    wheels: p.wheels.map((w) => ({ x: w.x, r: w.r, ...(w.lift ? { lift: w.lift } : {}) })),
    head: { x: 0.97, y: m.shape.head.y, w: 0, h: 0, kind: 'none' },
    tail: { x: 0.01, y: m.shape.tail.y, w: 0, h: 0, kind: 'none' },
    bumperF: p.parts.bumperF,
    bumperR: p.parts.bumperR,
    engine: m.shape.engine,
    details: [],
    height: p.height,
    raster: { cols: p.mask.cols, rows: p.mask.rows, bits: decodeBits(p.mask.bits, p.mask.cols * p.mask.rows), x0: p.img.x, y1: p.img.top, w: p.img.len, h },
  };
  const colors = paintedColours(m.id, p.colour);
  return { ...m, colors: colors.slice(0, -1), rare: colors[colors.length - 1], shape, painted: true, drawnShape: m.shape };
}

/**
 * The owner's pictures with no drawn car before them (2026-10-19, 80 more; «Удали все машинки кроме тех которые я тебе
 * отправил»): all of it comes from the picture. A line: the id, the name, the album's kind, the class, the garage level
 * it first arrives at, its value, its year and where its engine sits (0.84 in front, 0.32 behind the seats)
 */
function P(id: string, name: string, kind: string, cls: VehicleClass, level: number, value: number, year: number, engine: number): Model {
  const lamp = { x: 0.97, y: 0.17, w: 0, h: 0, kind: 'none' as const };
  return { id, name, kind, cls, level, value, year, colors: [], shape: { body: [], windows: [], wheels: [], head: lamp, tail: { ...lamp, x: 0.01 }, engine: [engine, 0.15], details: [], height: 0.3 } };
}
const PHOTOS: readonly Model[] = [
  // Full-resolution 2D artwork recovered from the owner's original transparent PNGs.
  P('twincam', 'Twin Cam R', 'Japanese sports coupe of the 90s', 'sport', 2, 740, 1998, 0.84),
  P('sixcoupe', 'Six Turbo', 'Japanese turbo coupe of the 90s', 'sport', 2, 760, 1997, 0.84),
  P('touringgt', 'Touring GT', 'British grand tourer of the 2020s', 'sport', 3, 7800, 2022, 0.84),
  P('vten', 'V-Ten', 'Japanese V10 supercar of the 2010s', 'sport', 4, 105000, 2012, 0.32),
  P('orangetrack', 'Orange Track RS', 'German track coupe of the 2020s', 'sport', 4, 93000, 2023, 0.84),
  P('silveropen', 'Silver Speedster', 'German open-top sports car of the 2020s', 'sport', 4, 103000, 2024, 0.84),
  P('violetwide', 'Violet Wide', 'German widebody sports coupe of the 2010s', 'sport', 3, 7200, 2019, 0.84),
  P('yellowrally', 'Yellow Rally R', 'German performance hatch of the 2020s', 'sport', 2, 800, 2023, 0.84),
  P('blueline', 'Blue Line M', 'German performance saloon of the 2020s', 'sport', 3, 7800, 2022, 0.84),
  P('foresttrack', 'Forest Track', 'German track-oriented coupe of the 2020s', 'sport', 4, 98000, 2024, 0.84),
  P('whiteracer', 'White Racer', 'Italian mid-engine supercar of the 2020s', 'sport', 4, 105000, 2025, 0.32),
  P('greyestate', 'Grey Estate', 'German sports estate of the 2020s', 'car', 3, 7600, 2023, 0.84),
  P('aero', 'Aero Hatch', 'Swedish hatchback of the 80s', 'car', 1, 110, 1987, 0.84),
  P('gamin', 'Gamin 1.9', 'French hot hatch of the 80s', 'car', 1, 90, 1986, 0.84),
  P('bubble', 'Double Bubble', 'French sports coupe of the 2010s', 'car', 1, 100, 2012, 0.84),
  P('swedebrick', 'Swede Brick', 'Swedish estate of the 90s', 'car', 1, 90, 1995, 0.84),
  P('longroof', 'Longroof V8', 'American estate of the 2000s', 'car', 1, 100, 2006, 0.84),
  P('hornet', 'Hornet GT', 'Korean fastback saloon of the 2010s', 'car', 1, 100, 2018, 0.84),
  P('serpent', 'Serpent QV', 'Italian sports saloon of the 2010s', 'car', 1, 90, 2017, 0.84),
  P('zenith', 'Zenith 37', 'Japanese sports coupe of the 2010s', 'sport', 2, 700, 2015, 0.84),
  P('thunderfour', 'Thunder Four', 'Japanese sports coupe of the 90s', 'sport', 2, 600, 1994, 0.84),
  P('sakura', 'Sakura S', 'Japanese sports coupe of the 90s', 'sport', 2, 700, 1996, 0.84),
  P('dusk', 'Dusk Turbo', 'Japanese sports coupe of the 90s', 'sport', 2, 700, 1997, 0.84),
  P('boxer', 'Boxer 86', 'Japanese sports coupe of the 2020s', 'sport', 2, 700, 2022, 0.84),
  P('tangerine', 'Tangerine V8', 'Japanese sports coupe of the 2010s', 'sport', 2, 600, 2019, 0.84),
  P('ember', 'Ember GT', 'Japanese sports coupe of the 2020s', 'sport', 2, 700, 2022, 0.84),
  P('cinq', 'Cinq Turbo', 'French rally hatch of the 80s', 'sport', 2, 700, 1982, 0.84),
  P('squadra', 'Evo Squadra', 'Italian rally hatch of the 90s', 'sport', 2, 600, 1992, 0.84),
  P('gremlin', 'Gremlin 4x4', 'Japanese rally hatch of the 2020s', 'sport', 2, 600, 2021, 0.84),
  P('voltage', 'Voltage Hatch', 'Korean electric hot hatch of the 2020s', 'sport', 2, 700, 2023, 0.84),
  P('sledge', 'Sledge Wagon V', 'American super estate of the 2010s', 'car', 3, 7900, 2014, 0.84),
  P('palace', 'Palace MPV', 'Chinese luxury MPV of the 2020s', 'car', 3, 6300, 2023, 0.84),
  P('capsule', 'Capsule EV', 'Chinese electric MPV of the 2020s', 'car', 3, 7700, 2024, 0.84),
  P('atlas', 'Atlas Six', 'Chinese family SUV of the 2020s', 'car', 3, 6900, 2022, 0.84),
  P('shootingstar', 'Shooting Star', 'Chinese electric shooting brake of the 2020s', 'car', 3, 6300, 2021, 0.84),
  P('ridgeback', 'Ridgeback', 'Chinese off-roader of the 2020s', 'car', 3, 6400, 2024, 0.84),
  P('skyscraper', 'Skyscraper', 'American full-size SUV of the 2020s', 'car', 3, 6600, 2021, 0.84),
  P('brawler', 'Brawler Widebody', 'American muscle saloon of the 2020s', 'sport', 3, 7000, 2021, 0.84),
  P('vandal', 'Vandal V8', 'American sports saloon of the 2020s', 'sport', 3, 7900, 2022, 0.84),
  P('midship', 'Midship Eight', 'American mid-engine sports car of the 2020s', 'sport', 3, 7300, 2020, 0.32),
  P('emerald', 'Emerald V8', 'British sports coupe of the 2020s', 'sport', 3, 7700, 2018, 0.84),
  P('pounce', 'Pounce R', 'British sports coupe of the 2010s', 'sport', 3, 7100, 2014, 0.84),
  P('monarch', 'Monarch GT', 'British grand tourer of the 2010s', 'sport', 3, 6700, 2018, 0.84),
  P('viaggio', 'Gran Viaggio', 'Italian grand tourer of the 2010s', 'sport', 3, 7900, 2018, 0.84),
  P('lumen', 'Lumen V8', 'Japanese grand tourer of the 2010s', 'sport', 3, 7000, 2017, 0.84),
  P('bellaotto', 'Bella Otto', 'Italian sports coupe of the 2000s', 'sport', 3, 7800, 2008, 0.84),
  P('feather', 'Featherweight', 'British roadster of the 2010s', 'sport', 3, 7400, 2017, 0.84),
  P('turini', 'Turini', 'French sports coupe of the 2010s', 'sport', 3, 6900, 2018, 0.84),
  P('gecko', 'Gecko', 'German mid-engine sports car of the 2010s', 'sport', 3, 6700, 2016, 0.32),
  P('verdant', 'Verdant GT', 'British grand tourer of the 2020s', 'sport', 3, 6700, 2023, 0.84),
  P('carboncrown', 'Carbon Crown', 'British grand tourer of the 2020s', 'sport', 4, 89000, 2021, 0.84),
  P('autobahn', 'Autobahn', 'German super saloon of the 2020s', 'sport', 4, 85000, 2021, 0.84),
  P('carbonsix', 'Carbon Six', 'German sports coupe of the 2020s', 'sport', 4, 96000, 2021, 0.84),
  P('tempest', 'Tempest', 'Italian super SUV of the 2020s', 'sport', 4, 101000, 2022, 0.84),
  P('typhoon', 'Typhoon', 'Italian super SUV of the 2010s', 'sport', 4, 103000, 2019, 0.84),
  P('sovereign', 'Sovereign', 'British limousine of the 2010s', 'car', 4, 81000, 2018, 0.84),
  P('apparition', 'Apparition', 'British luxury saloon of the 2020s', 'car', 4, 90000, 2021, 0.84),
  P('swiftarrow', 'Swift Arrow', 'British luxury saloon of the 2020s', 'car', 4, 98000, 2020, 0.84),
  P('mulberry', 'Mulberry', 'British luxury saloon of the 2010s', 'car', 4, 102000, 2016, 0.84),
  P('prowler', 'Prowler', 'British luxury saloon of the 2010s', 'car', 4, 101000, 2016, 0.84),
  P('senator', 'Senator', 'American luxury saloon of the 2010s', 'car', 4, 97000, 2017, 0.84),
  P('zeppelin', 'Zeppelin Twelve', 'German limousine of the 2020s', 'car', 4, 97000, 2021, 0.84),
  P('origami', 'Origami', 'Japanese luxury saloon of the 2020s', 'car', 4, 85000, 2021, 0.84),
  P('hanok', 'Hanok', 'Korean luxury saloon of the 2020s', 'car', 4, 92000, 2022, 0.84),
  P('ringleader', 'Ringleader', 'German luxury saloon of the 2010s', 'car', 4, 88000, 2019, 0.84),
  P('diamond', 'Diamond Mine', 'British luxury SUV of the 2010s', 'car', 4, 90000, 2018, 0.84),
  P('highwing', 'Highwing', 'British luxury SUV of the 2010s', 'car', 4, 93000, 2016, 0.84),
  P('heritage', 'Heritage GT', 'American supercar of the 2010s', 'sport', 4, 84000, 2017, 0.32),
  P('homolog', 'Homologation', 'German race-bred supercar of the 90s', 'sport', 4, 103000, 1998, 0.32),
  P('saber', 'Saber Seven', 'American supercar of the 2000s', 'sport', 4, 91000, 2003, 0.32),
  P('bigcat', 'Big Cat 220', 'British supercar of the 90s', 'sport', 4, 83000, 1992, 0.32),
  P('inferno', 'Inferno', 'Italian supercar of the 90s', 'sport', 4, 89000, 1993, 0.32),
  P('propeller', 'Propeller', 'Dutch supercar of the 2000s', 'sport', 4, 103000, 2009, 0.32),
  P('kabuki', 'Kabuki V10', 'Japanese supercar of the 2010s', 'sport', 4, 98000, 2011, 0.32),
  P('kaminari', 'Kaminari', 'Japanese race-bred supercar of the 2020s', 'sport', 4, 86000, 2025, 0.32),
  P('wisp', 'Wisp', 'British mid-engine sports car of the 2020s', 'sport', 4, 94000, 2022, 0.32),
  P('papaya', 'Papaya', 'British supercar of the 2010s', 'sport', 4, 88000, 2017, 0.32),
  P('fjord', 'Fjord', 'Swedish hypercar of the 2020s', 'sport', 5, 630000, 2022, 0.32),
  P('vento', 'Vento', 'Italian track hypercar of the 2000s', 'sport', 5, 707000, 2009, 0.32),
  P('zephyrus', 'Zephyrus', 'Italian hypercar of the 2010s', 'sport', 5, 686000, 2016, 0.32),
  P('viola', 'Viola', 'Italian hypercar of the 2020s', 'sport', 5, 672000, 2020, 0.32),
  P('brezza', 'Brezza', 'Italian open hypercar of the 2020s', 'sport', 5, 777000, 2021, 0.32),
  P('halo', 'Halo', 'British track hypercar of the 2020s', 'sport', 5, 672000, 2021, 0.32),
  P('prism', 'Prism', 'British hypercar of the 2020s', 'sport', 5, 707000, 2024, 0.32),
  P('dart', 'Dart', 'French track hypercar of the 2020s', 'sport', 5, 777000, 2024, 0.32),
  P('talon', 'Talon', 'German hypercar of the 2010s', 'sport', 5, 721000, 2018, 0.32),
  P('raven', 'Raven', 'German track hypercar of the 2020s', 'sport', 5, 630000, 2023, 0.32),
  P('orchid', 'Orchid', 'British supercar of the 2020s', 'sport', 5, 735000, 2023, 0.32),
  P('amethyst', 'Amethyst', 'Italian hypercar of the 2020s', 'sport', 5, 770000, 2023, 0.32),
  P('orca', 'Orca', 'Chinese electric saloon of the 2020s', 'car', 5, 679000, 2022, 0.84),
  P('pebble', 'Pebble', 'Chinese electric saloon of the 2020s', 'car', 5, 665000, 2024, 0.84),
  P('static', 'Static', 'Chinese electric super saloon of the 2020s', 'sport', 5, 714000, 2025, 0.84),
];

/**
 * How much of a cell's work a car with no drawn shape carries: the mean of the painted cars that had one (their old
 * surface over the picture's), so a new car is as much work as an old one of its size
 */
const PHOTO_WORK = 0.82;

/** Spaceplanes and long ships with rear engines: they fly in sideways (the others are landers, capsules, rockets) */
const SIDE_DOCK = new Set(['orbiter', 'blizzard', 'arrowx', 'skyracer', 'scout', 'tug', 'packmule', 'ion', 'cruiser', 'icebreaker', 'nomad', 'trident', 'orehauler']);

// Only the owner's pictures are vehicles on the Earth (2026-10-19); the spacecraft stay drawn in the space garages
export const MODELS: readonly Model[] = [
  ...DRAWN.filter((m) => (PAINTED[m.id]?.img.w ?? 0) >= 900 || m.cls === 'space').map((m) => (PAINTED[m.id] ? paintedModel(m, PAINTED[m.id]) : SIDE_DOCK.has(m.id) ? { ...m, dock: 'side' as const } : m)),
  ...PHOTOS.filter((m) => (PAINTED[m.id]?.img.w ?? 0) >= 900).map((m) => ({ ...paintedModel(m, PAINTED[m.id]), drawnShape: undefined, work: PHOTO_WORK })),
];

export const MODEL = new Map(MODELS.map((m) => [m.id, m]));

/** The vehicle's box in length units: the art and the grid share it (x −0.06…1.06, y from the ground to the top) */
export function bounds(s: VehicleShape): { x0: number; x1: number; y0: number; y1: number } {
  let x0 = 0;
  let x1 = 1;
  let y1 = s.height;
  for (const p of s.body) {
    x0 = Math.min(x0, p[0]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  }
  for (const d of s.details) for (const p of d.pts ?? []) {
    x0 = Math.min(x0, p[0]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  }
  // A spacecraft's nozzles stick out of its tail
  for (const z of s.thrusters ?? []) if (!z.down) x0 = Math.min(x0, z.x - z.r * 1.6);
  return { x0: x0 - 0.05, x1: x1 + 0.05, y0: 0, y1: y1 + 0.04 };
}

/** Point in the body's polygon (the corners' rounding ignored: the grid is coarse) */
export function inBody(s: VehicleShape, x: number, y: number): boolean {
  const r = s.raster;
  if (r) {
    const cx = Math.floor(((x - r.x0) / r.w) * r.cols);
    const cy = Math.floor(((r.y1 - y) / r.h) * r.rows);
    return cx >= 0 && cy >= 0 && cx < r.cols && cy < r.rows && r.bits[cy * r.cols + cx] === 1;
  }
  let inside = false;
  const b = s.body;
  for (let i = 0, j = b.length - 1; i < b.length; j = i++) {
    const [xi, yi] = b[i];
    const [xj, yj] = b[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  if (inside) return true;
  // Tracks count as the vehicle's surface too (they get muddy)
  if (s.tracks && x >= s.tracks.x0 && x <= s.tracks.x1 && y <= s.tracks.h) return true;
  return false;
}
