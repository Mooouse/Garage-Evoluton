// The tyre bay, drawn: the damaged wheel big in a round panel beside the car — the nuts with their star order, water
// and the leak's bubbles, the new tyre being pulled on, the dents, the pressure gauge with its green zone, the balancer
// spinning the wheel with its heavy spot and the mark on top. bayAction() turns a touch in the panel into the job's
// action, so the page and the demo bot share the geometry.

import { drawFlatWheel, drawWheel, wheelLight, type WheelLook } from './car-art.ts';
import type { Variant } from './data.ts';
import type { Model } from './models.ts';
import { BALANCE_TOL, GREEN, type WheelAction, type WheelJob } from './wheels.ts';

type Ctx = CanvasRenderingContext2D;

export interface Bay {
  x: number;
  y: number;
  /** The panel's radius; the wheel is drawn at 0.78 of it */
  r: number;
}

const WHEEL = 0.78;
const NUT_R = 0.2;

/** Where nut i sits (screen px) */
export function nutAt(bay: Bay, job: WheelJob, i: number, rot = 0): [number, number] {
  const a = (i / job.nuts) * Math.PI * 2 + rot - Math.PI / 2;
  return [bay.x + Math.cos(a) * bay.r * NUT_R, bay.y + Math.sin(a) * bay.r * NUT_R];
}

/** The angle of a point around the bay's centre (0 on top, clockwise), and its distance in panel radii */
export function bayPolar(bay: Bay, x: number, y: number): { angle: number; d: number } {
  const a = Math.atan2(x - bay.x, -(y - bay.y));
  return { angle: (a + Math.PI * 2) % (Math.PI * 2), d: Math.hypot(x - bay.x, y - bay.y) / bay.r };
}

/** The job's action for a touch at x, y (null: nothing there for this step) */
export function bayAction(bay: Bay, job: WheelJob, x: number, y: number): WheelAction | null {
  const p = bayPolar(bay, x, y);
  if (job.step === 'balance' || job.step === 'tyre') return p.d < 1.5 ? { kind: 'any' } : null;
  if (p.d > 1.15) return null;
  if (job.step === 'nutsOff' || job.step === 'nutsOn') {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < job.nuts; i++) {
      const [nx, ny] = nutAt(bay, job, i);
      const d = Math.hypot(nx - x, ny - y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    // A finger is ~48 px: a touch that reaches the nut due next counts as that nut; a wrong nut only when it is clearly hit
    if (job.nut < job.nuts) {
      const [tx, ty] = nutAt(bay, job, job.order[job.nut]);
      if (Math.hypot(tx - x, ty - y) < Math.max(26, bay.r * 0.2)) return { kind: 'nut', i: job.order[job.nut] };
    }
    return bd < Math.max(22, bay.r * 0.16) ? { kind: 'nut', i: best } : null;
  }
  if (job.step === 'find') return p.d > 0.35 ? { kind: 'spray', angle: p.angle } : null;
  if (job.step === 'plug' || job.step === 'dents') return { kind: 'tap', angle: p.angle };
  return null;
}

/** The point the job wants touched now (the demo bot and the ghost hand aim here) */
export function bayTarget(bay: Bay, job: WheelJob): [number, number] {
  const onTyre = (a: number, k = 0.7): [number, number] => [bay.x + Math.sin(a) * bay.r * k, bay.y - Math.cos(a) * bay.r * k];
  switch (job.step) {
    case 'nutsOff':
    case 'nutsOn':
      return nutAt(bay, job, job.order[Math.min(job.nut, job.nuts - 1)]);
    case 'find':
    case 'plug':
      return onTyre(job.leak);
    case 'dents':
      return onTyre(job.dents[0] ?? 0, 0.45);
    default:
      return [bay.x, bay.y];
  }
}

/** The car's own wheel in a look: its baked sprite, its tyre radius and the sprite's size (CSS px) */
export type OwnWheel = (look: WheelLook, rPx: number) => { img: CanvasImageSource; r: number; size: number };

export function drawBay(g: Ctx, bay: Bay, job: WheelJob, model: Model, variant: Variant, t: number, rimNow: string, from: [number, number] | null, own?: OwnWheel): void {
  const { x, y, r } = bay;
  g.save();
  // A line from the car's wheel to the panel: "this wheel"
  if (from) {
    g.strokeStyle = 'rgba(255,209,102,0.55)';
    g.lineWidth = 2;
    g.setLineDash([6, 6]);
    g.beginPath();
    g.moveTo(from[0], from[1]);
    g.lineTo(x, y);
    g.stroke();
    g.setLineDash([]);
  }
  // The panel
  const bg = g.createRadialGradient(x, y - r * 0.3, r * 0.2, x, y, r * 1.05);
  bg.addColorStop(0, 'rgba(46,58,86,0.96)');
  bg.addColorStop(1, 'rgba(14,18,30,0.96)');
  g.fillStyle = bg;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#ffd166';
  g.lineWidth = 3;
  g.stroke();
  // The wheel (spinning on the balancer)
  const rw = r * WHEEL;
  const rot = job.step === 'balance' ? job.heavy : 0;
  const look: WheelLook = job.step === 'nutsOff' || job.step === 'find' || job.step === 'plug' || job.step === 'tyre' || job.step === 'dents' ? (job.damage === 'flat' ? 'ok' : job.damage === 'bald' && job.step !== 'tyre' ? 'bald' : job.damage === 'bent' ? 'bent' : 'ok') : 'ok';
  // A flat tyre: the wheel's own rubber squashed, filling back to round as the pump works
  const flat = job.damage === 'flat' && (job.step === 'nutsOff' || job.step === 'find' || job.step === 'plug' || (job.step === 'pump' && job.pressure < 0.5));
  if (flat) {
    const sag = job.step === 'pump' ? 1 - Math.min(1, job.pressure / 0.5) : 1;
    if (own) {
      const o = own(look, rw);
      const k = rw / o.r;
      drawFlatWheel(g, o.img as CanvasImageSource & { width: number }, o.size * k, x, y, rw, sag, t);
    } else {
      const size = Math.ceil(rw * 2 + 6);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const cg = c.getContext('2d')!;
      cg.translate(size / 2, size / 2);
      drawWheel(cg, rw, model, variant, rimNow, look);
      drawFlatWheel(g, c, size, x, y, rw, sag, t);
    }
  } else {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    // The repair stand also has a full opaque circular tyre underneath the
    // original spoke image, centred on its exact spindle.
    g.fillStyle = '#17191e';
    g.beginPath();
    g.arc(0, 0, rw * 0.99, 0, Math.PI * 2);
    g.fill();
    if (own) {
      // The wheel the car came on (a new tyre or a fixed rim looks the same as the other wheels: the owner, 2026-10-16)
      const o = own(look, rw);
      const k = rw / o.r;
      g.drawImage(o.img, (-o.size * k) / 2, (-o.size * k) / 2, o.size * k, o.size * k);
    } else drawWheel(g, rw, model, variant, rimNow, look);
    g.restore();
  }
  // The bay's light from above left, not turning with the wheel
  wheelLight(g, x, y + (flat ? rw * 0.08 * (job.step === 'pump' ? 1 - Math.min(1, job.pressure / 0.5) : 1) : 0), rw, x - rw * 2, y - rw * 3, false);
  // The new tyre pulled on, a third at a time
  if (job.step === 'tyre') {
    g.strokeStyle = '#2a2c33';
    g.lineWidth = rw * 0.18;
    g.beginPath();
    g.arc(x, y, rw * 0.92, -Math.PI / 2, -Math.PI / 2 + ((3 - job.pulls) / 3) * Math.PI * 2 + 0.2);
    g.stroke();
    g.fillStyle = '#ffd166';
    const a = -Math.PI / 2 + ((3 - job.pulls) / 3) * Math.PI * 2 + 0.2;
    g.beginPath();
    g.arc(x + Math.cos(a) * rw * 0.92, y + Math.sin(a) * rw * 0.92, 6 + 2 * Math.sin(t * 8), 0, Math.PI * 2);
    g.fill();
  }
  // The dents to hammer
  if (job.step === 'dents')
    for (const d of job.dents) {
      const dx = x + Math.sin(d) * rw * 0.45;
      const dy = y - Math.cos(d) * rw * 0.45;
      g.strokeStyle = '#ff4f4f';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(dx, dy, 9 + 3 * Math.sin(t * 6), 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = '#1b1e26';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(dx - 5, dy - 3);
      g.lineTo(dx, dy + 2);
      g.lineTo(dx + 5, dy - 3);
      g.stroke();
    }
  // Water and the leak's bubbles
  if (job.step === 'find' || job.step === 'plug') {
    g.fillStyle = 'rgba(160,215,255,0.18)';
    g.beginPath();
    g.arc(x, y, rw, 0, Math.PI * 2);
    g.arc(x, y, rw * 0.62, 0, Math.PI * 2, true);
    g.fill();
    const n = Math.round((job.step === 'plug' ? 1 : job.found) * 14);
    for (let i = 0; i < n; i++) {
      const a = job.leak + Math.sin(i * 1.7) * 0.18;
      const k = 0.8 + (((t * 0.6 + i * 0.13) % 1) * 0.25);
      const bx = x + Math.sin(a) * rw * k;
      const by = y - Math.cos(a) * rw * k;
      g.strokeStyle = 'rgba(230,248,255,0.9)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(bx, by, 2 + (i % 4) * 1.6, 0, Math.PI * 2);
      g.stroke();
    }
    if (job.step === 'plug') {
      const lx = x + Math.sin(job.leak) * rw * 0.86;
      const ly = y - Math.cos(job.leak) * rw * 0.86;
      g.strokeStyle = '#ffd166';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(lx, ly, 14 + 4 * Math.sin(t * 7), 0, Math.PI * 2);
      g.stroke();
    }
  }
  // Nuts: numbered in the star order, the next one glowing
  if (job.step === 'nutsOff' || job.step === 'nutsOn') {
    for (let i = 0; i < job.nuts; i++) {
      const k = job.order.indexOf(i);
      const done = k < job.nut;
      const on = job.step === 'nutsOn' ? done : !done;
      const [nx, ny] = nutAt(bay, job, i);
      const next = k === job.nut;
      if (next) {
        g.fillStyle = `rgba(255,209,102,${0.35 + 0.25 * Math.sin(t * 8)})`;
        g.beginPath();
        g.arc(nx, ny, r * 0.12, 0, Math.PI * 2);
        g.fill();
      }
      if (on) {
        g.fillStyle = job.step === 'nutsOn' ? '#9ae6a2' : '#c9d0d8';
        g.strokeStyle = '#1b1e26';
        g.lineWidth = 1.5;
        g.beginPath();
        for (let v = 0; v < 6; v++) {
          const a = (v / 6) * Math.PI * 2 + (job.step === 'nutsOn' ? t * 0 : 0);
          const px = nx + Math.cos(a) * r * 0.065;
          const py = ny + Math.sin(a) * r * 0.065;
          if (v) g.lineTo(px, py);
          else g.moveTo(px, py);
        }
        g.closePath();
        g.fill();
        g.stroke();
      } else {
        g.fillStyle = '#121418';
        g.beginPath();
        g.arc(nx, ny, r * 0.035, 0, Math.PI * 2);
        g.fill();
      }
      // The order number beside it
      g.font = `900 ${Math.max(12, r * 0.1)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const a = (i / job.nuts) * Math.PI * 2 - Math.PI / 2;
      const tx = x + Math.cos(a) * r * (NUT_R + 0.14);
      const ty = y + Math.sin(a) * r * (NUT_R + 0.14);
      g.lineWidth = 3;
      g.strokeStyle = '#0d1018';
      g.strokeText(String(k + 1), tx, ty);
      g.fillStyle = next ? '#ffd166' : done ? '#7d8796' : '#ffffff';
      g.fillText(String(k + 1), tx, ty);
    }
  }
  // The pump's gauge: an arc on the right with the green zone
  if (job.step === 'pump') {
    const a0 = -Math.PI * 0.75;
    const a1 = Math.PI * 0.75;
    const at = (v: number) => a0 + (a1 - a0) * Math.min(1, v / 1.05);
    const gr = r * 0.42;
    g.lineWidth = r * 0.07;
    g.strokeStyle = 'rgba(255,255,255,0.15)';
    g.beginPath();
    g.arc(x, y, gr, a0 - Math.PI / 2, a1 - Math.PI / 2);
    g.stroke();
    g.strokeStyle = '#5fd06a';
    g.beginPath();
    g.arc(x, y, gr, at(GREEN[0]) - Math.PI / 2, at(GREEN[1]) - Math.PI / 2);
    g.stroke();
    g.strokeStyle = '#ff4f4f';
    g.beginPath();
    g.arc(x, y, gr, at(0.98) - Math.PI / 2, a1 - Math.PI / 2);
    g.stroke();
    // The needle
    const na = at(job.pressure) - Math.PI / 2;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(na) * gr * 1.05, y + Math.sin(na) * gr * 1.05);
    g.stroke();
    g.fillStyle = '#ffd166';
    g.beginPath();
    g.arc(x, y, r * 0.05, 0, Math.PI * 2);
    g.fill();
  }
  // The balancer: a mark on top, the heavy spot in red, the weights put on
  if (job.step === 'balance') {
    const hx = x + Math.sin(job.heavy) * rw * 0.7;
    const hy = y - Math.cos(job.heavy) * rw * 0.7;
    const near = Math.abs(((job.heavy + Math.PI) % (Math.PI * 2)) - Math.PI) < BALANCE_TOL;
    g.fillStyle = near ? '#5fd06a' : '#ff4f4f';
    g.beginPath();
    g.arc(hx, hy, r * 0.07, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.stroke();
    // The window on top where it must be
    g.strokeStyle = near ? '#5fd06a' : '#ffd166';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(x, y, rw * 0.7, -Math.PI / 2 - BALANCE_TOL, -Math.PI / 2 + BALANCE_TOL);
    g.stroke();
    g.fillStyle = '#ffd166';
    g.beginPath();
    g.moveTo(x, y - r * 0.98);
    g.lineTo(x - r * 0.07, y - r * 1.1);
    g.lineTo(x + r * 0.07, y - r * 1.1);
    g.closePath();
    g.fill();
  }
  g.restore();
}
