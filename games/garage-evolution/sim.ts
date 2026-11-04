// The rules as pure logic: no DOM, no canvas, no host — the page, the balance bot and the tests all play this.
// One car = a stack of layers on a grid over its box (mud on top … scratches at the bottom), then parts to bolt on,
// then the engine, then the finale. A stroke works on whatever layer is on top where it lands: the tool follows the
// surface. Robots make strokes of their own.

import {
  CATS, FLOW, GARAGES, GRID, LAYER_CAT, LAYER_ORDER, LAYERS, PROFILE, PROFILES, RARITY, RARITIES, ROBOTS, STORIES, VARIANT, VARIANTS, WORK_OPENS,
  toolPower, type Cat, type LayerKind, type Profile, type Rarity, type Variant,
} from './data.ts';
import { bounds, inBody, MODEL, MODELS, type Model } from './models.ts';
import { newWheelJob, PUMP_RATE, robotWheelAct, wheelAct, wheelProgress, wheelTick, type WheelAction, type WheelDamage, type WheelJob, type WheelResult, type WheelStep } from './wheels.ts';

export type Rand = () => number;

export interface Layer {
  kind: LayerKind;
  /** Work left in each cell, and what it started with */
  amt: Float32Array;
  init: Float32Array;
  total: number;
  left: number;
  /** Cells changed since the art last read them (the art clears it) */
  dirty: boolean;
}

export type PartId = 'wheel0' | 'wheel1' | 'wheel2' | 'bumperF' | 'bumperR' | 'mirror' | 'head';

export interface Task {
  id: string;
  /** Grid position */
  gx: number;
  gy: number;
  work: number;
  left: number;
}

export type Stage = 'arrive' | 'surface' | 'body' | 'wheels' | 'thrusters' | 'parts' | 'engine' | 'finale' | 'done';

/** The stages worked as a list of glowing spots (a tap or a rub of the wrench on each) */
export const TASK_STAGES = ['thrusters', 'parts', 'engine'] as const;
export type TaskStage = (typeof TASK_STAGES)[number];
export const isTaskStage = (st: Stage): st is TaskStage => (TASK_STAGES as readonly Stage[]).includes(st);
/** The spots of the stage on now (the dents in the body stage), or [] */
export function stageTasks(car: Car, st: Stage = car.stage): Task[] {
  return st === 'thrusters' ? car.thrusters : st === 'parts' ? car.parts : st === 'engine' ? car.engine : st === 'body' ? car.dents : [];
}

/** A dent in a panel: pulled out with the suction cup (a Task with its size in cells) */
export interface Dent extends Task {
  r: number;
}

export interface Car {
  model: Model;
  /** A rush job: its clock in seconds, and whether it was restored in time (set as it finishes) */
  rush?: { sec: number; won?: boolean };
  color: string;
  variant: Variant;
  rarity: Rarity;
  serial: number;
  seed: number;
  story: string | null;
  /** How it became a wreck: which jobs it brings */
  profile: Profile;
  /** Dents to pull out (the body stage) */
  dents: Dent[];
  /** A full respray: the player picks the new colour from `palette` (the last one is the rare colour) */
  respray: boolean;
  /** The last stage has begun: the paint (primer, a respray), after everything else */
  painting: boolean;
  palette: string[];
  /** The colour it came in (the respray's old paint) */
  oldColor: string;
  /** The daily car of the gate */
  daily: boolean;
  /** 0–1: how wrecked it came in (the condition shown is 1 − this) */
  wreck: number;
  layers: Layer[];
  parts: Task[];
  /** Damaged wheels, worked one by one in the tyre bay */
  wheels: WheelJob[];
  /** A spacecraft's damaged engine nozzles (instead of wheels: the owner's table, 2026-10-16) */
  thrusters: Task[];
  engine: Task[];
  /** Body cells (true where the grid is on the vehicle) */
  mask: Uint8Array;
  cells: number;
  stage: Stage;
  /** Seconds in the current stage, and since the car arrived */
  st: number;
  t: number;
  /** Work done by the player's hand and by robots */
  byHand: number;
  byRobots: number;
  workTotal: number;
  value: number;
  /** The first layer reveal of this car happened (the twist's moment on the first car) */
  revealed: boolean;
  /** Grid aspect: the screen height of a cell over its width (for round strokes) */
  aspect: number;
  /** The tier's hardness (work per cell multiplier) */
  hard: number;
}

/** A seeded random source (the bot, the tests and the page with host.rng all pass one) */
export function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: Rand, list: readonly T[]): T => list[Math.floor(r() * list.length) % list.length];
function weighted<T extends string>(r: Rand, list: readonly T[], weight: (x: T) => number): T {
  let sum = 0;
  for (const x of list) sum += weight(x);
  let v = r() * sum;
  for (const x of list) {
    v -= weight(x);
    if (v <= 0) return x;
  }
  return list[list.length - 1];
}

/** Smooth value noise on the grid (a few octaves): the shape of patches */
function noiseField(r: Rand, scale: number): Float32Array {
  const { w, h } = GRID;
  const gw = Math.ceil(w / scale) + 2;
  const gh = Math.ceil(h / scale) + 2;
  const lattice = new Float32Array(gw * gh);
  for (let i = 0; i < lattice.length; i++) lattice[i] = r();
  const out = new Float32Array(w * h);
  const s = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const fx = x / scale;
      const fy = y / scale;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = s(fx - ix);
      const ty = s(fy - iy);
      const a = lattice[iy * gw + ix];
      const b = lattice[iy * gw + ix + 1];
      const c = lattice[(iy + 1) * gw + ix];
      const d = lattice[(iy + 1) * gw + ix + 1];
      out[y * w + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  return out;
}

/** The body mask of a model on the grid */
const masks = new Map<string, { mask: Uint8Array; cells: number; aspect: number }>();
export function bodyMask(model: Model): { mask: Uint8Array; cells: number; aspect: number } {
  let m = masks.get(model.id);
  if (!m) {
    const { w, h } = GRID;
    const b = bounds(model.shape);
    const mask = new Uint8Array(w * h);
    let cells = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const px = b.x0 + ((x + 0.5) / w) * (b.x1 - b.x0);
        const py = b.y1 - ((y + 0.5) / h) * (b.y1 - b.y0);
        if (inBody(model.shape, px, py)) {
          mask[y * w + x] = 1;
          cells++;
        }
      }
    const cellW = (b.x1 - b.x0) / w;
    const cellH = (b.y1 - b.y0) / h;
    m = { mask, cells, aspect: cellH / cellW };
    masks.set(model.id, m);
  }
  return m;
}

/**
 * How much of a cell's work a painted car carries: its picture covers more of the grid than the shape it replaced, and
 * the work (time, payout) stays the old car's — the dirt is thinner, the car is bigger. 1 for a drawn vehicle
 */
const workScales = new Map<string, number>();
export function workScale(model: Model): number {
  if (model.work !== undefined) return model.work;
  if (!model.drawnShape) return 1;
  let k = workScales.get(model.id);
  if (k === undefined) {
    const drawn = bodyMask({ ...model, id: `${model.id}#drawn`, shape: model.drawnShape, painted: false, drawnShape: undefined }).cells;
    k = Math.min(1, drawn / bodyMask(model).cells);
    workScales.set(model.id, k);
  }
  return k;
}

/** Grid ↔ the model's length units */
export function gridToModel(model: Model, gx: number, gy: number): [number, number] {
  const b = bounds(model.shape);
  return [b.x0 + (gx / GRID.w) * (b.x1 - b.x0), b.y1 - (gy / GRID.h) * (b.y1 - b.y0)];
}
export function modelToGrid(model: Model, x: number, y: number): [number, number] {
  const b = bounds(model.shape);
  return [((x - b.x0) / (b.x1 - b.x0)) * GRID.w, ((b.y1 - y) / (b.y1 - b.y0)) * GRID.h];
}

export interface CarOptions {
  garage: number;
  /** The garage's own vehicles (a site of the network) */
  pool?: readonly string[];
  /** The garage's payout multiplier */
  valueMult?: number;
  /** Models already found: new ones come more often */
  found?: ReadonlySet<string>;
  /** The serial for this model (how many of it came before + 1) */
  serial?: (modelId: string) => number;
  /** Force a model, rarity, variant (the first car, the daily car) */
  model?: string;
  rarity?: Rarity;
  variant?: Variant;
  daily?: boolean;
  /** The very first car: an easy one that teaches every layer */
  first?: boolean;
  /** Space vehicles arrive only after the prestige */
  prestige?: number;
  /** Force how it became a wreck (tests, the tutorial) */
  profile?: Profile;
}

/** Pick the next model for a garage level: mostly this level's, sometimes older ones; undiscovered ones more often */
export function nextModel(r: Rand, garage: number, found: ReadonlySet<string> = new Set(), own?: readonly string[]): Model {
  // A garage of the network: its own vehicles mostly, an older tier's now and then (never another site's of its tier)
  const mine = own ? new Set(own) : null;
  // An older tier's car is of the garage's own look (painted or drawn: never the two side by side)
  const look = own?.some((id) => MODEL.get(id)?.painted) ?? false;
  const pool = MODELS.filter((m) => m.id !== 'unknown' && !m.retired && (mine ? mine.has(m.id) || (m.level < garage && !!m.painted === look) : m.level <= garage) && (m.cls === 'space') === (garage >= 6));
  const w = (m: Model) => (mine ? (mine.has(m.id) ? 3 : m.level === garage - 1 ? 0.5 : 0.15) : m.level === garage ? 3 : m.level === garage - 1 ? 1 : 0.35) * (found.has(m.id) ? 1 : 2.5);
  return MODEL.get(weighted(r, pool.map((m) => m.id), (id) => w(MODEL.get(id)!)))!;
}

export function newCar(r: Rand, o: CarOptions): Car {
  const seed = Math.floor(r() * 2 ** 31);
  const rr = seeded(seed);
  const garage = Math.max(1, Math.min(GARAGES.length, o.garage));
  const model = o.model ? MODEL.get(o.model)! : nextModel(rr, garage, o.found, o.pool);
  const tier = GARAGES[Math.max(0, Math.min(GARAGES.length, Math.max(model.level, garage)) - 1)];
  const hard = tier.hard;
  const rarity: Rarity = o.rarity ?? (o.first ? 'common' : model.id === 'unknown' ? 'unknown' : weighted(rr, RARITIES, (x) => RARITY[x].weight * (x === 'common' ? 1 : 1 + 0.15 * (garage - 1))));
  const variant: Variant = o.variant ?? (o.first ? 'standard' : weighted(rr, VARIANTS, (x) => VARIANT[x].weight));
  const color = pick(rr, model.colors);
  const { mask, cells, aspect } = bodyMask(model);
  const wreck = o.first ? 0.3 : 0.35 + rr() * 0.6;
  const opens = (t: keyof typeof WORK_OPENS) => WORK_OPENS[t] <= garage;
  const profile: Profile = o.first ? 'daily' : o.profile ?? weighted(rr, PROFILES.filter((p) => PROFILE[p].opens <= garage), (p) => PROFILE[p].weight);
  const span = (k: LayerKind, a: number) => LAYERS[k].cover[0] + (LAYERS[k].cover[1] - LAYERS[k].cover[0]) * Math.min(1, a);
  const respray = !o.first && (profile === 'fire' || profile === 'desert') && opens('paint') && new Set(model.colors).size >= 3;
  const { w, h } = GRID;
  const layers: Layer[] = [];
  // What this car has on it
  const has: Partial<Record<LayerKind, number>> = {};
  if (o.first) {
    has.mud = 0.55;
    has.rust = 0.1;
    has.polish = 0.18;
  } else {
    // The profile decides the layers: what is on top, how deep the rust goes, whether the paint is gone
    const washed = (k: 'dust' | 'soot'): LayerKind => (opens(k) ? k : 'mud');
    const v = () => rr() * 0.5;
    switch (profile) {
      case 'daily':
        has.mud = span('mud', v() * 0.4);
        has.polish = span('polish', 0.3 + v());
        if (rr() < 0.5) has.rust = span('rust', v() * 0.3);
        break;
      case 'barn':
        has[washed('dust')] = span(washed('dust'), 0.7 + v());
        has.rust = span('rust', 0.6 + v());
        has.polish = span('polish', 0.5 + v());
        break;
      case 'flood':
        has.mud = span('mud', 0.75 + v());
        has.rust = span('rust', 0.3 + v());
        if (rr() < 0.5) has.polish = span('polish', v());
        break;
      case 'crash':
        has.mud = span('mud', v() * 0.5);
        if (rr() < 0.6) has.rust = span('rust', v() * 0.5);
        if (opens('paint')) has.paint = span('paint', 0.3 + v());
        has.polish = span('polish', 0.2 + v());
        break;
      case 'fire':
        has[washed('soot')] = span(washed('soot'), 0.6 + v());
        has.rust = span('rust', 0.4 + v());
        break;
      case 'desert':
        has[washed('dust')] = span(washed('dust'), 0.4 + v());
        has.polish = span('polish', 0.7 + v());
        if (rr() < 0.5) has.rust = span('rust', v());
        break;
    }
    // A respray: the old paint is sanded to primer all over, and sprayed in the colour the player picks
    if (respray) has.paint = 0.97;
  }
  const rustCells = new Uint8Array(w * h);
  for (const k of LAYER_ORDER) {
    const cover = has[k];
    if (!cover) continue;
    const L = LAYERS[k];
    const n1 = noiseField(rr, k === 'dust' ? 9 : k === 'soot' ? 7 : k === 'polish' ? 5 : 4);
    const n2 = noiseField(rr, 2);
    // A score per cell: high = covered first. Each kind has where it gathers
    const score = new Float32Array(w * h);
    const panels: [number, number][] = [];
    if (k === 'paint') {
      const n = 1 + Math.floor(rr() * 2.2);
      for (let i = 0; i < n; i++) {
        const c = 0.1 + rr() * 0.8;
        panels.push([c - 0.08 - rr() * 0.08, c + 0.08 + rr() * 0.08]);
      }
    }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!mask[i]) continue;
        const low = y / h; // 0 top … 1 bottom
        const u = x / w;
        let s = n1[i] * 0.75 + n2[i] * 0.25;
        if (k === 'mud') s += low * 0.75 + (n2[i] > 0.82 ? 0.3 : 0);
        else if (k === 'dust') s += (1 - low) * 0.5;
        else if (k === 'rust') {
          // The sills, the arches and the panel edges rust first
          let edge = 0;
          for (const [dx, dy] of [[0, 3], [3, 0], [-3, 0], [0, -3]] as const) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h || !mask[yy * w + xx]) edge = 1;
          }
          s += low * 0.6 + edge * 0.45;
        } else if (k === 'paint') s = respray ? n2[i] : n2[i] * 0.2 + (panels.some(([a, b]) => u >= a && u <= b) ? 0.9 : 0) + rustCells[i] * 1.2;
        else if (k === 'polish') s += (1 - low) * 0.45 + (Math.abs(((x * 0.7 + y * 2.3) % 9) - 4) < 0.6 ? 0.25 : 0);
        score[i] = s;
      }
    // Cover the top `cover` share of the body's cells
    const sorted = Array.from(score).filter((_, i) => mask[i]).sort((a, b) => b - a);
    const cut = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * cover))] ?? 1;
    const amt = new Float32Array(w * h);
    const tau = L.tau * hard * (0.8 + wreck * 0.5) * workScale(model);
    let total = 0;
    for (let i = 0; i < amt.length; i++) {
      if (!mask[i] || score[i] < cut) continue;
      // Thicker toward the patch's middle
      const depth = Math.min(1, 0.55 + (score[i] - cut) * 2.2);
      amt[i] = tau * depth;
      total += amt[i];
      if (k === 'rust') rustCells[i] = 1;
    }
    if (total <= 0) continue;
    layers.push({ kind: k, amt, init: amt.slice(), total, left: total, dirty: true });
  }
  // Parts to bolt on and the engine nodes
  const toGrid = (x: number, y: number) => modelToGrid(model, x, y);
  const s = model.shape;
  const partWork = FLOW.partWork * hard;
  const parts: Task[] = [];
  const candidates: { id: PartId; at: [number, number] }[] = [];
  if (s.bumperF) candidates.push({ id: 'bumperF', at: [(s.bumperF[0] + s.bumperF[2]) / 2, (s.bumperF[1] + s.bumperF[3]) / 2] });
  if (s.bumperR) candidates.push({ id: 'bumperR', at: [(s.bumperR[0] + s.bumperR[2]) / 2, (s.bumperR[1] + s.bumperR[3]) / 2] });
  if (s.mirror) candidates.push({ id: 'mirror', at: s.mirror });
  if (s.head.kind !== 'none') candidates.push({ id: 'head', at: [s.head.x, s.head.y] });
  const partsFor: Record<Profile, number> = { daily: 0, barn: rr() < 0.4 ? 1 : 0, flood: 0, crash: 2 + Math.floor(rr() * 2), fire: 1 + Math.floor(rr() * 2), desert: rr() < 0.3 ? 1 : 0 };
  const nParts = o.first ? 0 : Math.min(candidates.length, partsFor[profile]);
  const pool = candidates.slice();
  for (let i = 0; i < nParts && pool.length; i++) {
    const c = pool.splice(Math.floor(rr() * pool.length), 1)[0];
    const [gx, gy] = toGrid(c.at[0], c.at[1]);
    const work = c.id.startsWith('wheel') ? partWork * 1.4 : partWork;
    parts.push({ id: c.id, gx, gy, work, left: work });
  }
  // Damaged wheels: a flat, a bald tyre, a bent rim (not on tracked machines: their idlers are under the tracks). The very
  // first car has none: it teaches the scrub and pays within seconds; the tyre bay comes with the second car
  const wheels: WheelJob[] = [];
  if (!s.tracks && s.wheels.length) {
    const wheelsFor: Record<Profile, number> = { daily: rr() < 0.4 ? 1 : 0, barn: 1, flood: 1, crash: 1, fire: 1, desert: 2 };
    const damageFor: Record<Profile, WheelDamage> = { daily: 'flat', barn: 'flat', flood: 'bald', crash: 'bent', fire: 'bald', desert: 'bald' };
    const n = o.first ? 0 : Math.min(garage <= 1 ? 1 : 2, s.wheels.length, wheelsFor[profile]);
    const order = s.wheels.map((_, i) => i).sort(() => rr() - 0.5);
    const nuts = model.cls === 'heavy' || model.cls === 'truck' ? 6 : model.cls === 'moto' ? 4 : 5;
    for (let i = 0; i < n; i++) {
      // The profile's damage, sometimes another (a bent rim only from the Workshop: its dents step comes later)
      let damage: WheelDamage = rr() < 0.75 ? damageFor[profile] : (['flat', 'bald', 'bent'] as const)[Math.floor(rr() * 3)];
      if (damage === 'bent' && garage < 2) damage = 'flat';
      wheels.push(newWheelJob(rr, o.first ? s.wheels.length - 1 : order[i], damage, nuts, !!o.first));
    }
    wheels.sort((a, b) => b.wheel - a.wheel);
  }
  // A spacecraft's nozzles: scorched, clogged, cracked — every ship brings at least one (its tyre bay)
  const thrusters: Task[] = [];
  if (s.thrusters?.length) {
    const nozFor: Record<Profile, number> = { daily: 1, barn: 1 + Math.floor(rr() * 2), flood: 1, crash: 2, fire: 2 + Math.floor(rr() * 2), desert: 1 + Math.floor(rr() * 2) };
    const order = s.thrusters.map((_, i) => i).sort(() => rr() - 0.5);
    const n = Math.min(s.thrusters.length, nozFor[profile]);
    for (let i = 0; i < n; i++) {
      const z = s.thrusters[order[i]];
      // The spot is the bell's middle (it sticks out of the hull: back, or down)
      const [gx, gy] = toGrid(z.down ? z.x : z.x - z.r * 0.75, z.down ? z.y - z.r * 0.75 : z.y);
      const work = FLOW.partWork * hard * 1.6;
      thrusters.push({ id: `noz${order[i]}`, gx, gy, work, left: work });
    }
    thrusters.sort((a, b) => a.gy - b.gy);
  }
  const engine: Task[] = [];
  const engineFor: Record<Profile, number> = { daily: 0.1, barn: 0.5, flood: 1, crash: 0.3, fire: 0.6, desert: 0.3 };
  if (opens('engine') && !o.first && rr() < engineFor[profile]) {
    const n = 2 + Math.floor(rr() * 2.5);
    const [ex, ey] = toGrid(s.engine[0], s.engine[1]);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rr();
      const work = FLOW.engineWork * hard;
      engine.push({ id: `node${i}`, gx: ex + Math.cos(a) * 5, gy: ey + Math.sin(a) * 2.2, work, left: work });
    }
  }
  // Dents: a crash brings several, a barn find or a daily driver sometimes one; on the doors and wings, clear of the
  // arches and the glass
  const dents: Dent[] = [];
  const dentsFor: Record<Profile, number> = { daily: rr() < 0.3 ? 1 : 0, barn: rr() < 0.4 ? 1 : 0, flood: 0, crash: 2 + Math.floor(rr() * 3), fire: 0, desert: rr() < 0.3 ? 1 : 0 };
  const nDents = o.first || model.cls === 'space' || model.cls === 'moto' ? 0 : dentsFor[profile];
  const glass = s.windows.flat().length ? Math.min(...s.windows.flat().map((p) => p[1])) : s.height * 0.7;
  for (let tries = 0; dents.length < nDents && tries < 200; tries++) {
    const mx = 0.08 + rr() * 0.84;
    const my = s.wheels[0] ? s.wheels[0].r * 1.3 + rr() * Math.max(0.01, glass - s.wheels[0].r * 1.3 - 0.03) : 0.1 + rr() * 0.1;
    if (!inBody(s, mx, my) || s.wheels.some((wh) => Math.abs(wh.x - mx) < wh.r * 1.5 && my < wh.r * 2.4)) continue;
    const [gx, gy] = toGrid(mx, my);
    if (dents.some((d) => Math.hypot(d.gx - gx, (d.gy - gy) * aspect) < 14)) continue;
    const work = FLOW.dentWork * hard * (0.8 + rr() * 0.4);
    dents.push({ id: `dent${dents.length}`, gx, gy, r: 4 + rr() * 2, work, left: work });
  }
  // One or two jobs besides the cleaning, never all four: the ones true to how it became a wreck (a crash: dents and a
  // wheel; a barn find: the engine and parts; a flood: the wheels). The tyre bay came on 21 cars of 22 and outlasted the
  // scrub (the designer, 1.5.0)
  const jobs: Record<'wheels' | 'dents' | 'parts' | 'engine', unknown[]> = { wheels, dents, parts, engine };
  const prefer: Record<Profile, (keyof typeof jobs)[]> = {
    daily: ['wheels', 'dents', 'parts', 'engine'],
    barn: ['engine', 'parts', 'wheels', 'dents'],
    flood: ['wheels', 'engine', 'parts', 'dents'],
    crash: ['dents', 'wheels', 'parts', 'engine'],
    fire: ['parts', 'engine', 'wheels', 'dents'],
    desert: ['wheels', 'dents', 'parts', 'engine'],
  };
  let kept = 0;
  for (const k of prefer[profile]) if (jobs[k].length && kept++ >= 2) jobs[k].length = 0;
  // The respray's colours: three of the model's own and a rare one
  const others = model.colors.filter((c) => c !== color);
  const palette = respray ? [others[0] ?? color, others[1] ?? color, model.rare ?? pick(rr, ['#d4af37', '#7cc22e', '#ff4f7a', '#3fd0d8', '#9b59ff'])] : [];
  const workTotal = layers.reduce((a, l) => a + l.total, 0) + parts.reduce((a, p) => a + p.work, 0) + engine.reduce((a, p) => a + p.work, 0) + thrusters.reduce((a, p) => a + p.work, 0) + dents.reduce((a, d) => a + d.work, 0) + wheels.length * wheelWorkOf(layers, hard);
  // The payout: the model's value, its rarity and variant, and how much work it took (a worse car pays more)
  const avgWork = cells * workScale(model) * hard * 1.3;
  const workFactor = Math.max(0.6, Math.min(1.8, 0.55 + (0.5 * workTotal) / avgWork));
  const value = Math.round(model.value * RARITY[rarity].mult * VARIANT[variant].mult * workFactor * (o.daily ? 1.5 : 1) * (o.valueMult ?? 1));
  const rare = RARITIES.indexOf(rarity) >= 2 || o.daily;
  return {
    model, color, variant, rarity, seed, daily: !!o.daily,
    serial: o.serial ? o.serial(model.id) : 1,
    story: rare ? (o.daily ? 'gate' : pick(rr, (model.cls === 'space' ? SPACE_STORY_FOR : STORY_FOR)[profile].filter((x) => (STORIES as readonly string[]).includes(x)))) : null,
    profile, dents, respray, palette, oldColor: color, painting: false,
    wreck, layers, parts, wheels, thrusters, engine, mask, cells, aspect, hard,
    stage: 'arrive', st: 0, t: 0, byHand: 0, byRobots: 0, workTotal, value, revealed: false,
  };
}

/** The stories a rare car can carry, true to how it became a wreck */
const STORY_FOR: Record<Profile, string[]> = {
  daily: ['museum', 'collector', 'auction', 'storage'],
  barn: ['barn', 'storage', 'field', 'snow'],
  flood: ['lake'],
  crash: ['crash', 'auction'],
  fire: ['fire'],
  desert: ['desert', 'field'],
};

/** A spacecraft's stories: never a barn or a lake (the owner, 2026-10-16) */
const SPACE_STORY_FOR: Record<Profile, string[]> = {
  daily: ['museum', 'collector', 'auction'],
  barn: ['pad', 'derelict'],
  flood: ['splash'],
  crash: ['orbit', 'probe'],
  fire: ['reentry'],
  desert: ['pad', 'probe'],
};

/** A wheel job counts as this much work in the condition: an eighth of the surface work, at least 14 × the hardness */
export const WHEEL_WORK = 14;
export function wheelWorkOf(layers: Layer[], hard: number): number {
  return Math.max(WHEEL_WORK * hard, 0.125 * layers.reduce((a, l) => a + l.total, 0));
}

function workLeft(car: Car): number {
  return car.layers.reduce((a, l) => a + l.left, 0) + car.parts.reduce((a, p) => a + p.left, 0) + car.engine.reduce((a, p) => a + p.left, 0) + car.thrusters.reduce((a, p) => a + p.left, 0) + car.dents.reduce((a, d) => a + d.left, 0) + car.wheels.reduce((a, j) => a + (1 - wheelProgress(j)) * wheelWorkOf(car.layers, car.hard), 0);
}

/** The condition a player reads on the card: 100 % is like new */
export function condition(car: Car): number {
  const left = workLeft(car);
  const start = 100 - Math.round(car.wreck * 70 + 8);
  const c = Math.round(start + ((100 - start) * (1 - left / Math.max(1e-9, car.workTotal))));
  // 100 % only when nothing is left: a bolt, a nut or a nozzle still to do keeps it at 99 (the reviewer)
  return left > 0 || car.wheels.some((j) => j.step !== 'done') ? Math.min(99, c) : c;
}

/** The work left per layer kind, parts and engine — the stage strip */
export function progress(car: Car): number {
  const left = workLeft(car);
  return 1 - left / Math.max(1e-9, car.workTotal);
}

/** The index of the layer on top at a cell (-1: bare) */
export function topAt(car: Car, i: number): number {
  for (let k = 0; k < car.layers.length; k++) if (car.layers[k].amt[i] > 0) return k;
  return -1;
}

export interface StrokeResult {
  kind: LayerKind | 'part' | 'engine' | 'dent' | 'thruster';
  cat: Cat;
  removed: number;
  /** A layer was finished by this stroke (its kind), and what is on top now (the next layer, parts …) */
  finished?: LayerKind;
  /** A part or engine node was fixed */
  fixed?: string;
  /** The stage changed */
  stage?: Stage;
  /** Where it worked (grid), the brush radius (cells) and its strength against the layer's thickness (0–1) */
  gx: number;
  gy: number;
  r: number;
  bite: number;
}

export interface Power {
  strength: number;
  radius: number;
}

/** The power of each tool line at the save's levels */
export function powers(levels: Record<Cat, number>): Record<Cat, Power> {
  const out = {} as Record<Cat, Power>;
  for (const c of CATS) out[c] = toolPower(levels[c] ?? 0);
  return out;
}

/** What the tool under the finger would do at a grid point: the category, or null (nothing to work there) */
export function toolAt(car: Car, gx: number, gy: number, radius = 3): { cat: Cat; kind: StrokeResult['kind'] } | null {
  if (car.stage === 'surface') {
    const i = nearestTop(car, gx, gy, radius);
    if (i < 0) return null;
    const k = car.layers[topAt(car, i)].kind;
    return { cat: LAYER_CAT[k], kind: k };
  }
  if (car.stage === 'body') return { cat: 'wrench', kind: 'dent' };
  if (car.stage === 'thrusters') return { cat: 'wrench', kind: 'thruster' };
  if (car.stage === 'parts' || car.stage === 'engine' || car.stage === 'wheels') return { cat: 'wrench', kind: car.stage === 'engine' ? 'engine' : 'part' };
  return null;
}

/**
 * The surface is worked one stage at a time, in order: all the mud (or dust, soot), then the rust, then the primer, then
 * the scratches. The layer of the stage on now is the first one not done; only it can be worked (the owner, 2026-10-13:
 * «эти этапы не должны проходиться одновременно»)
 */
export function currentLayerIndex(car: Car): number {
  return car.layers.findIndex((l) => l.left > 0 && (car.painting || l.kind !== 'paint'));
}

/** The nearest cell within reach where the stage's layer is on top (-1: none) */
function nearestTop(car: Car, gx: number, gy: number, reach: number, cat?: Cat): number {
  const { w, h } = GRID;
  const cur = currentLayerIndex(car);
  if (cur < 0 || (cat && LAYER_CAT[car.layers[cur].kind] !== cat)) return -1;
  const cx = Math.round(gx - 0.5);
  const cy = Math.round(gy - 0.5);
  if (cx >= 0 && cy >= 0 && cx < w && cy < h) {
    if (topAt(car, cy * w + cx) === cur) return cy * w + cx;
  }
  const ry = Math.max(1, Math.ceil(reach / car.aspect));
  let best = -1;
  let bd = Infinity;
  for (let y = Math.max(0, cy - ry); y <= Math.min(h - 1, cy + ry); y++)
    for (let x = Math.max(0, cx - Math.ceil(reach)); x <= Math.min(w - 1, cx + Math.ceil(reach)); x++) {
      const i = y * w + x;
      if (topAt(car, i) !== cur) continue;
      const d = (x - cx) ** 2 + ((y - cy) * car.aspect) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
  return best;
}

/**
 * One stroke at a grid point (the player's tap or a robot's pass). It works the layer on top where it lands — with the
 * tool of that layer — over a round brush (round on screen), stronger at the middle.
 */
export function stroke(car: Car, gx: number, gy: number, power: Record<Cat, Power>, by: 'hand' | 'robot' = 'hand', only?: Cat, scale = 1): StrokeResult | null {
  if (car.stage === 'surface') {
    const reach = (only ? 40 : power.wash.radius * 1.2);
    const i = nearestTop(car, gx, gy, reach, only);
    if (i < 0) return null;
    const L = car.layers[topAt(car, i)];
    const cat = LAYER_CAT[L.kind];
    const p = power[cat];
    const { w, h } = GRID;
    // Aim at the cell found when the touch landed beside the dirt
    const ax = by === 'robot' || topAt(car, Math.round(gy - 0.5) * w + Math.round(gx - 0.5)) < 0 ? (i % w) + 0.5 : gx;
    const ay = by === 'robot' || topAt(car, Math.round(gy - 0.5) * w + Math.round(gx - 0.5)) < 0 ? Math.floor(i / w) + 0.5 : gy;
    const r = p.radius;
    const ry = r / car.aspect;
    const li = car.layers.indexOf(L);
    let removed = 0;
    for (let y = Math.max(0, Math.floor(ay - ry)); y <= Math.min(h - 1, Math.ceil(ay + ry)); y++)
      for (let x = Math.max(0, Math.floor(ax - r)); x <= Math.min(w - 1, Math.ceil(ax + r)); x++) {
        const j = y * w + x;
        if (L.amt[j] <= 0) continue;
        // Only where this layer is the one on top
        let covered = false;
        for (let k = 0; k < li; k++) if (car.layers[k].amt[j] > 0) covered = true;
        if (covered) continue;
        const d2 = ((x + 0.5 - ax) / r) ** 2 + ((y + 0.5 - ay) / ry) ** 2;
        if (d2 > 1) continue;
        const take = Math.min(L.amt[j], p.strength * scale * (1 - 0.55 * d2));
        L.amt[j] -= take;
        if (L.amt[j] < 1e-4) L.amt[j] = 0;
        removed += take;
      }
    L.left = Math.max(0, L.left - removed);
    L.dirty = true;
    if (by === 'hand') car.byHand += removed;
    else car.byRobots += removed;
    const ci = Math.max(0, Math.min(w * h - 1, Math.floor(ay) * w + Math.floor(ax)));
    const thick = L.init[ci] > 0 ? L.init[ci] : L.total / Math.max(1, countCells(L));
    const res: StrokeResult = { kind: L.kind, cat, removed, gx: ax, gy: ay, r, bite: Math.min(1, (p.strength * scale) / thick) };
    if (L.left <= L.total * FLOW.autoFinish) {
      // The last specks go by themselves
      if (by === 'hand') car.byHand += L.left;
      else car.byRobots += L.left;
      L.amt.fill(0);
      L.left = 0;
      res.finished = L.kind;
    }
    advance(car, res);
    return res;
  }
  if (isTaskStage(car.stage) || (car.stage === 'body' && by !== 'hand')) {
    const tasks = stageTasks(car);
    const p = power.wrench;
    // The nearest unfinished task within reach (robots: any)
    let best: Task | null = null;
    let bd = Infinity;
    for (const t of tasks) {
      if (t.left <= 0) continue;
      const d = Math.hypot(t.gx - gx, (t.gy - gy) * car.aspect);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    if (!best || (by === 'hand' && bd > Math.max(9, p.radius * 2.6))) return null;
    if (only && only !== 'wrench') return null;
    const take = Math.min(best.left, p.strength * scale);
    best.left -= take;
    if (best.left < 1e-4) best.left = 0;
    if (by === 'hand') car.byHand += take;
    else car.byRobots += take;
    const res: StrokeResult = { kind: car.stage === 'parts' ? 'part' : car.stage === 'body' ? 'dent' : car.stage === 'thrusters' ? 'thruster' : 'engine', cat: 'wrench', removed: take, gx: best.gx, gy: best.gy, r: p.radius, bite: take / best.work };
    if (best.left === 0) res.fixed = best.id;
    advance(car, res);
    return res;
  }
  return null;
}

/** Move to the next stage when the current one is done */
function advance(car: Car, res: StrokeResult | null): void {
  const before = car.stage;
  // The paint comes last: when everything else is done the car goes back to the surface for it
  const end = (): Stage => {
    if (!car.painting && car.layers.some((l) => l.kind === 'paint' && l.left > 0)) {
      car.painting = true;
      return 'surface';
    }
    return 'finale';
  };
  if (car.stage === 'surface' && currentLayerIndex(car) < 0) car.stage = car.painting ? 'finale' : 'body';
  // The bodywork, the wheels (a ship: its nozzles), the parts, the engine: each stage that has work, in turn
  const after = (from: number): Stage => {
    for (const st of TASK_STAGES.slice(from)) if (stageTasks(car, st).length) return st;
    return end();
  };
  if (car.stage === 'body' && car.dents.every((d) => d.left <= 0)) car.stage = car.wheels.length ? 'wheels' : after(0);
  if (car.stage === 'wheels' && car.wheels.every((j) => j.step === 'done')) car.stage = after(0);
  for (let k = 0; k < TASK_STAGES.length; k++)
    if (car.stage === TASK_STAGES[k] && stageTasks(car).every((p) => p.left <= 0)) car.stage = after(k + 1);
  if (car.stage !== before) {
    car.st = 0;
    if (res) res.stage = car.stage;
  }
}

/** The dent under a grid point (its index), or -1 */
export function dentAt(car: Car, gx: number, gy: number, slack = 2.5): number {
  if (car.stage !== 'body') return -1;
  let best = -1;
  let bd = Infinity;
  car.dents.forEach((d, i) => {
    if (d.left <= 0) return;
    const dd = Math.hypot(d.gx - gx, (d.gy - gy) * car.aspect);
    if (dd < d.r + slack && dd < bd) {
      bd = dd;
      best = i;
    }
  });
  return best;
}

/**
 * The suction cup pulls a dent: `cells` is how much further from the dent the finger got (the drag outward), times the
 * wrench's strength. Let go too early (`release`) and it springs back part of the way
 */
export function pullDent(car: Car, i: number, cells: number, power: Record<Cat, Power>): StrokeResult | null {
  const d = car.dents[i];
  if (!d || d.left <= 0 || car.stage !== 'body' || cells <= 0) return null;
  const take = Math.min(d.left, cells * power.wrench.strength);
  d.left -= take;
  if (d.left < 1e-4) d.left = 0;
  car.byHand += take;
  const res: StrokeResult = { kind: 'dent', cat: 'wrench', removed: take, gx: d.gx, gy: d.gy, r: d.r, bite: take / d.work };
  if (d.left === 0) res.fixed = d.id;
  advance(car, res);
  return res;
}
export function releaseDent(car: Car, i: number, pulled: number): void {
  const d = car.dents[i];
  if (!d || d.left <= 0) return;
  d.left = Math.min(d.work, d.left + pulled * FLOW.dentSpring);
}

/** The layer on top now (the strip's current step), or null */
export function currentLayer(car: Car): Layer | null {
  return car.layers.find((l) => l.left > 0) ?? null;
}

/** Time passes: the car rolls in, the finale plays. Returns the stage when it changed */
export function tick(car: Car, dt: number): Stage | null {
  car.t += dt;
  car.st += dt;
  if (car.stage === 'arrive' && car.st >= FLOW.arriveSec) {
    car.stage = 'surface';
    car.st = 0;
    advance(car, null);
    return car.stage;
  }
  if (car.stage === 'finale' && car.st >= FLOW.finaleSec) {
    car.stage = 'done';
    car.st = 0;
    return 'done';
  }
  return null;
}

// --- Robots: each makes strokes of its own on its layer; with nothing of its own to do it helps, slower.
// They sweep the car column by column (a cursor per category), so finding the next spot is cheap.

export interface RobotStroke {
  cat: Cat;
  index: number;
  gx: number;
  gy: number;
  res: StrokeResult;
  /** In the tyre bay: what the robot did to the wheel */
  wheel?: WheelEvent;
}

export interface RobotState {
  /** Fractional strokes owed per category */
  acc: Record<Cat, number>;
  /** Each category's sweep position: a cell index in column order */
  cursor: Record<Cat, number>;
  turn: Record<Cat, number>;
}

export function newRobots(): RobotState {
  const z = () => ({ wash: 0, grind: 0, paint: 0, polish: 0, wrench: 0 }) as Record<Cat, number>;
  return { acc: z(), cursor: { wash: 0, grind: 900, paint: 1800, polish: 2700, wrench: 0 }, turn: z() };
}

/** The next cell (column order from the cursor) whose top layer is of this category (any category: undefined) */
function sweep(car: Car, from: number, cat?: Cat): number {
  const { w, h } = GRID;
  const n = w * h;
  const cur = currentLayerIndex(car);
  if (cur < 0 || (cat && LAYER_CAT[car.layers[cur].kind] !== cat)) return -1;
  for (let k = 0; k < n; k++) {
    const c = (from + k) % n;
    // column order: c = x * h + y
    const x = Math.floor(c / h);
    const y = c % h;
    const i = y * w + x;
    if (!car.mask[i]) continue;
    if (topAt(car, i) !== cur) continue;
    return c;
  }
  return -1;
}

/** Robots beside a player (the owner, 2026-10-17: «роботы слишком хорошо и быстро работают, особенно с колёсами, и
 * мешают»): they leave the tyre bay to the player, work at this share of their pace, and keep clear of the player's
 * spot. Alone (another garage, offline) they work at full pace and do the wheels too */
export const ROBOT_BESIDE = 0.6;
export interface RobotsBeside {
  /** The player's spot on the grid and how far to keep from it (cells): set while their finger is down */
  avoid?: [number, number, number];
}

export function robotsStep(car: Car, rs: RobotState, dt: number, counts: Record<Cat, number>, power: Record<Cat, Power>, boost = 1, beside?: RobotsBeside): RobotStroke[] {
  if (beside) boost *= ROBOT_BESIDE;
  const out: RobotStroke[] = [];
  const { w, h } = GRID;
  for (const cat of CATS) {
    const n = counts[cat] ?? 0;
    if (!n) continue;
    if (car.stage !== 'surface' && car.stage !== 'body' && car.stage !== 'wheels' && !isTaskStage(car.stage)) {
      rs.acc[cat] = 0;
      continue;
    }
    // Every robot does its own trade only (the owner, 2026-10-16: «должен либо полировать либо механикой заниматься»):
    // the washer washes, the grinder grinds, the painter paints, the polisher polishes, the mechanic does the bodywork,
    // the parts, the engine and the tyre bay. With nothing of its own to do it waits
    const mine = car.stage === 'surface' ? cat !== 'wrench' : cat === 'wrench';
    if (!mine) {
      rs.acc[cat] = 0;
      continue;
    }
    if (car.stage === 'wheels') {
      // The mechanic does the wheels through to the end (the owner's table, 2026-10-19: «Исправить робота механика, что
      // бы он ремонтировал колеса полностью»); beside the player it waits while their finger is on the car
      if (beside?.avoid) {
        rs.acc[cat] = 0;
        continue;
      }
      rs.acc[cat] += n * ROBOTS[cat].rate * dt * boost;
      while (rs.acc[cat] >= 1 && car.stage === 'wheels') {
        rs.acc[cat] -= 1;
        const ev = wheelRobot(car, 1 / Math.max(0.1, ROBOTS[cat].rate));
        if (!ev) break;
        const wh = car.model.shape.wheels[ev.job.wheel];
        const [gx, gy] = modelToGrid(car.model, wh.x, wh.r + (wh.lift ?? 0));
        out.push({ cat, index: rs.turn[cat]++ % n, gx, gy, res: { kind: 'part', cat: 'wrench', removed: 1, gx, gy, r: 0, bite: 1, ...(ev.stage ? { stage: ev.stage } : {}) }, wheel: ev });
      }
      continue;
    }
    rs.acc[cat] += n * ROBOTS[cat].rate * dt * boost;
    while (rs.acc[cat] >= 1) {
      rs.acc[cat] -= 1;
      let res: StrokeResult | null = null;
      let gx = 0;
      let gy = 0;
      if (car.stage === 'surface') {
        let c = sweep(car, rs.cursor[cat], cat);
        // Keep clear of the player's spot: skip on past it (a few tries)
        const av = beside?.avoid;
        for (let tries = 0; av && c >= 0 && tries < 6; tries++) {
          const cx = Math.floor(c / h) + 0.5;
          const cy2 = (c % h) + 0.5;
          if (Math.hypot(cx - av[0], (cy2 - av[1]) * car.aspect) > av[2]) break;
          c = sweep(car, (c + h * Math.ceil(av[2])) % (w * h), cat);
        }
        if (c < 0) {
          rs.acc[cat] = 0;
          break;
        }
        // Move on a little past the spot: the next pass lands beside it
        rs.cursor[cat] = c;
        gx = Math.floor(c / h) + 0.5;
        gy = (c % h) + 0.5;
        res = stroke(car, gx, gy, power, 'robot', cat, 0.8);
        if (res && !res.removed) rs.cursor[cat] = (c + 1) % (w * h);
      } else {
        const t = stageTasks(car).find((p) => p.left > 0);
        if (!t) break;
        gx = t.gx;
        gy = t.gy;
        res = stroke(car, gx, gy, power, 'robot', undefined, 0.8);
      }
      if (!res) break;
      out.push({ cat, index: rs.turn[cat]++ % n, gx, gy, res });
      if ((car.stage as Stage) === 'finale') break;
    }
  }
  return out;
}

/** The par time of a car: its work at a player's pace with these tools (no robots) */
/** The work a stroke takes from a cell of this thickness, averaged over the brush (see parSec) */
export function strokeTake(strength: number, thick: number): number {
  if (strength * 0.45 >= thick) return thick;
  if (strength <= thick) return strength * 0.725;
  const u = (1 - thick / strength) / 0.55;
  return thick * u + strength * (1 - u - 0.275 * (1 - u * u));
}

/** Strokes a layer takes with a tool (parSec's measure: the work a stroke takes, averaged over the brush) */
export function layerStrokes(car: Car, l: Layer, p: Power): number {
  const thick = l.total / Math.max(1, countCells(l));
  return l.total / Math.max(1e-6, strokeTake(p.strength, thick) * Math.PI * p.radius * (p.radius / car.aspect) * 0.72);
}

export function parSec(car: Car, power: Record<Cat, Power>, strokesPerSec: number): number {
  let sec = 0;
  for (const l of car.layers) {
    const p = power[LAYER_CAT[l.kind]];
    // What a stroke takes per cell, averaged over the brush: strength × (1 − 0.55 d²) at distance d (d² spread evenly),
    // never more than the cell holds — a stronger tool clears more of the brush's edge in one pass. × πr² cells and
    // ≈ 0.72 for the overlap of strokes
    const thick = l.total / Math.max(1, countCells(l));
    const perStroke = Math.max(1e-6, strokeTake(p.strength, thick) * Math.PI * p.radius * (p.radius / car.aspect) * 0.72);
    sec += l.total / perStroke / strokesPerSec;
  }
  for (const t of [...car.parts, ...car.engine, ...car.thrusters]) sec += Math.ceil(t.work / power.wrench.strength) / Math.min(strokesPerSec, 4) + 0.4;
  // A dent: a pull of its work over the wrench's strength in cells, at ≈ 14 cells a second, and the grab
  for (const d of car.dents) sec += d.work / power.wrench.strength / 14 + 0.6;
  // A wheel job at a player's pace: the nuts twice, the repair, the pump, the balance (the bot measures ≈ 8 s)
  sec += car.wheels.length * 8;
  return sec;
}

const cellCounts = new WeakMap<Layer, number>();
function countCells(l: Layer): number {
  const known = cellCounts.get(l);
  if (known !== undefined) return known;
  let n = 0;
  for (let i = 0; i < l.init.length; i++) if (l.init[i] > 0) n++;
  cellCounts.set(l, n);
  return n;
}


// --- The tyre bay: the wheel job on the car's wheels

/** The wheel being worked now (null outside the wheels stage) */
export function currentWheel(car: Car): WheelJob | null {
  if (car.stage !== 'wheels') return null;
  return car.wheels.find((j) => j.step !== 'done') ?? null;
}

export interface WheelEvent extends WheelResult {
  job: WheelJob;
  /** The car's stage changed (all wheels done) */
  stage?: Stage;
  /** This wheel is done */
  wheelDone?: boolean;
}

function wheelAfter(car: Car, job: WheelJob, r: WheelResult, by: 'hand' | 'robot'): WheelEvent {
  const ev: WheelEvent = { ...r, job };
  if (r.ok) {
    if (by === 'hand') car.byHand += car.hard;
    else car.byRobots += car.hard;
  }
  if (job.step === 'done') {
    ev.wheelDone = true;
    const before = car.stage;
    advance(car, null);
    if (car.stage !== before) ev.stage = car.stage;
  }
  return ev;
}

/** The player's action in the bay */
export function wheelHand(car: Car, a: WheelAction, wrenchTier = 0): WheelEvent | null {
  const job = currentWheel(car);
  if (!job) return null;
  // One nut a tap, whatever the wrench (the owner, 2026-10-17: «одним кликом можно сделать 3 штуки» — the star order is
  // the game)
  void wrenchTier;
  return wheelAfter(car, job, wheelAct(job, a, false, 1), 'hand');
}

/** Time in the bay (the balancer spins, the pump fills while held); a finished pump is an event */
export function wheelTime(car: Car, dt: number, pumping: boolean, wrenchTier = 0): WheelEvent | null {
  const job = currentWheel(car);
  if (!job) return null;
  // A better compressor with the tier: a quicker pump (and a needle to watch closer)
  const step: WheelStep | null = wheelTick(job, dt, pumping, PUMP_RATE * (1 + 0.35 * Math.min(4, wrenchTier)));
  if (step) return wheelAfter(car, job, { ok: true, what: 'none', stepDone: step }, 'hand');
  if (job.popped) return { ok: false, what: 'none', job };
  return null;
}

/** A robot's action on the current wheel */
export function wheelRobot(car: Car, dt: number): WheelEvent | null {
  const job = currentWheel(car);
  if (!job) return null;
  const r = robotWheelAct(job, dt);
  if (!r) return null;
  return wheelAfter(car, job, r, 'robot');
}
