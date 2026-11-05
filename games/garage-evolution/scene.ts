// The play scene: the garage room of the current level, the car on the floor (baked body, turning wheels, the parts,
// the layers over it), the robots working beside it, the tool under the player's finger, the effects of every stroke,
// the shine when the last layer goes, the parts popping in, the engine's x-ray, and the finale — headlights, horn,
// engine, the gate rolling up and the drive-out with RESTORED.

import { canvas2d, density } from '@gp/art/bake';
import { Camera } from '@gp/art/camera';
import { mix } from '@gp/art/color';
import { Fx, type Emit } from '@gp/art/fx';
import { contactShadow, glow } from '@gp/art/material';
import { ease } from '@gp/art/tween';
import { bakeCar, defaultRim, drawFlatWheel, drawHeadLamp, wheelLight, wheelShadow, nozzleSpot, shipLegs, shipNozzle, wheelAt, type CarArt, type NozzleSpot, type WheelLook } from './car-art.ts';
import { drawBay, type Bay } from './bay-art.ts';
import { CATS, FLOW, GRID, RARITY, ROBOTS, type Cat, type LayerKind } from './data.ts';
import { bakeRoom, doorBox, drawDoor, groundY, lookOf } from './garage-art.ts';
import { drawIcon, toolIcon } from './icons.ts';
import { drawDrone, drawFloorRobot, drawRailRobot } from './robot-art.ts';
import { LayerViews } from './layers.ts';
import { bounds, type Model } from './models.ts';
import { currentWheel, type Car, type RobotStroke, type StrokeResult } from './sim.ts';

type Ctx = CanvasRenderingContext2D;

interface RobotView {
  cat: Cat;
  i: number;
  /** Home (base) and the tool tip, in CSS px */
  hx: number;
  hy: number;
  tx: number;
  ty: number;
  /** Target the tip moves toward, and when it last worked */
  gx: number;
  gy: number;
  busy: number;
  /** The base's current x (floor robots drive, ceiling arms ride their rail) */
  x: number;
}


const MUD = ['#5b3d24', '#7d5733', '#4a311d'];
const RUST = ['#a9521f', '#c26b2c', '#6e2c10'];

export interface SceneView {
  top: number;
  bottom: number;
}

/** What the coach's hand shows: a swipe along a line, a tap or a press-and-hold on a point, a pull from a point outward */
export type Coach = { kind: 'swipe' | 'pull'; x0: number; y0: number; x1: number; y1: number } | { kind: 'tap' | 'hold'; x: number; y: number };

export function createScene(g: Ctx) {
  const fx = new Fx({ seed: 3 });
  const cam = new Camera();
  let w = 1;
  let h = 1;
  let view: SceneView = { top: 0, bottom: 0 };
  let level = 1;
  let room: HTMLCanvasElement | null = null;
  let roomKey = '';
  let ground = 1;
  let t = 0;
  let car: Car | null = null;
  let art: CarArt | null = null;
  let layers: LayerViews | null = null;
  let carL = 100;
  /** The car box's top-left (CSS px) at rest */
  let bx = 0;
  let by = 0;
  /** Motion: offset in x, wheel angle, a vertical shake */
  let dx = 0;
  /** The car's laid-out left edge; when it is wider than the screen (a phone upright) bx pans from it toward the work */
  let spin = 0;
  let shakeY = 0;
  let lastJolt = 0;
  let door = 0;
  let doorTarget = 0;
  let lights = 0;
  let gleam = -1;
  let restoredAt = -1;
  let restoredText = '';
  let restoredSub = '';
  const popped = new Map<string, number>();
  let robots: RobotView[] = [];
  let robotCounts: Record<Cat, number> = { wash: 0, grind: 0, paint: 0, polish: 0, wrench: 0 };
  let pointer: { x: number; y: number; on: boolean; cat: Cat | null; level: number; work: number } = { x: 0, y: 0, on: false, cat: null, level: 0, work: 0 };
  let ghost = false;
  let stampSeed = 0;
  let lastEmit = 0;
  /** The car rolls in (setCar) or simply stands there (showCar) */
  let rolling = false;
  let layoutKey = '';
  let reflAcc = 0;
  /** A rare car's arrival: a glow in its rarity's colour */
  let announce = -1;

  let roomLook = 0;
  let roomPlace: string | undefined;
  const look = () => lookOf(level, roomLook);

  // A spacecraft without wheels comes down through the roof hatch on its engines and leaves up through it (the owner's
  // table: «прибытие сбоку или сверху … без прохождения сквозь стены»): `vy` lifts it, `hatch` opens the roof
  const fromTop = () => !!car && car.model.cls === 'space' && !car.model.shape.wheels.length && car.model.dock !== 'side';
  // A spaceplane flies in through the door on its rear engines, a little above the floor, and settles (the table, §8)
  const fromSide = () => !!car && car.model.cls === 'space' && car.model.dock === 'side';
  const hover = () => Math.max(20, carL * 0.12);
  let byRest = 0;
  let vy = 0;
  let hatch = 0;
  let hatchTarget = 0;
  /** The engines' burn now (0–1): coming down, taking off */
  let burn = 0;
  let landed = true;
  /** When each broken nozzle next sputters */
  const sputter = new Map<string, number>();

  function bakeRoomNow(): void {
    const key = `${level}:${roomLook}:${roomPlace}:${w}:${h}:${ground}:${density()}`;
    if (key === roomKey && room) return;
    roomKey = key;
    room = bakeRoom(level, w, h, ground, density(), roomLook, roomPlace);
  }

  /** Fit the car: as long as the view allows, under the HUD and above the bottom bar */
  function layoutCar(): void {
    if (!car) return;
    const b = bounds(car.model.shape);
    const portrait = h > w;
    // The whole car always in view: a phone held upright gives it the full width, the view never moves
    // (the fit box has 5 % of air at each end: on a phone the body itself reaches 96 % of the width — the audit, 2026-10-20)
    // A phone on its side: the height left between the HUD and the strip is the car's (the bar is down the right edge)
    const short = !portrait && h <= 420;
    const availW = w * (portrait ? 1.06 : short ? 0.66 : 0.6);
    const availH = (ground - view.top - 24) * (portrait ? 0.72 : short ? 0.9 : 0.78);
    carL = Math.max(60, Math.min(availW / (b.x1 - b.x0), availH / (b.y1 - b.y0), portrait ? 900 : 760));
    const prev = layers;
    art = bakeCar(car.model, car.color, car.variant, carL);
    layers = new LayerViews(car, art);
    void prev;
    const cx = portrait ? w * 0.5 : w * 0.44;
    bx = Math.round(cx - art.w / 2);
    byRest = Math.round(ground - art.h + 2);
    by = byRest;
    placeRobots();
    by = byRest + vy;
  }

  function placeRobots(): void {
    robots = [];
    if (!art) return;
    const left = bx;
    const right = bx + art.w;
    const top = by;
    for (const cat of CATS) {
      const n = robotCounts[cat];
      for (let i = 0; i < n; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const k = Math.floor(i / 2);
        let hx = 0;
        let hy = 0;
        const s = Math.max(18, Math.min(42, carL * 0.08));
        if (cat === 'wash') {
          hx = side < 0 ? left - s * (0.4 + k * 1.3) : right + s * (0.4 + k * 1.3);
          hy = ground;
        } else if (cat === 'grind') {
          hx = left + art.w * (0.25 + 0.5 * (i % 2)) + k * s;
          hy = Math.max(view.top + 10, top - carL * 0.16);
        } else if (cat === 'polish') {
          hx = left + art.w * (0.15 + 0.7 * ((i * 0.37) % 1));
          hy = Math.max(view.top + 20, top - carL * 0.06);
        } else if (cat === 'wrench') {
          hx = side < 0 ? left - s * (1.2 + k * 1.3) : right + s * (1.2 + k * 1.3);
          hy = ground;
        } else {
          hx = left + art.w * (0.2 + 0.6 * ((i * 0.53) % 1));
          hy = Math.max(view.top + 10, top - carL * 0.16);
        }
        robots.push({ cat, i, hx, hy, tx: hx, ty: hy, gx: -1, gy: -1, busy: 0, x: hx });
      }
    }
  }

  /** Grid ↔ screen (CSS px) for the current car */
  const gridToScreen = (gx: number, gy: number): [number, number] => (art ? [bx + dx + (gx / GRID.w) * art.w, by + (gy / GRID.h) * art.h] : [0, 0]);
  const screenToGrid = (x: number, y: number): [number, number] => (art ? [((x - bx - dx) / art.w) * GRID.w, ((y - by) / art.h) * GRID.h] : [-1, -1]);

  function strokeFx(res: StrokeResult, x: number, y: number, hand: boolean, tier: number): void {
    const n = hand ? 1 : 0.5;
    const scale = Math.max(0.6, Math.min(1.6, carL / 320));
    const k = res.kind as LayerKind | 'part' | 'engine' | 'thruster';
    if (k === 'mud') {
      fx.emit({ n: Math.round(5 * n), speed: [60, 220], angle: -Math.PI / 2, spread: 2.2, life: [0.35, 0.8], size: [1.6, 3.6], gravity: 900, drag: 1, color: MUD, shape: 'dot', additive: false } as Emit, x, y, { scale });
      if (tier > 0) fx.emit({ n: Math.round(6 * n), speed: [80, 260], angle: -Math.PI / 2 + 0.4, spread: 1.6, life: [0.25, 0.6], size: [1, 2.2], gravity: 700, drag: 1.2, color: ['#cfeeff', '#9fd8ff', '#ffffff'], shape: 'dot', additive: false, opacity: 0.85 } as Emit, x, y, { scale });
      else fx.emit({ n: Math.round(3 * n), speed: [20, 70], angle: -Math.PI / 2, spread: 2, life: [0.4, 0.9], size: [2, 4], gravity: -40, drag: 2, color: ['#ffffff', '#f4f8ff'], shape: 'glow', additive: false, opacity: 0.7 } as Emit, x, y, { scale });
    } else if (k === 'dust') fx.emit('dust', x, y, { n: Math.round(6 * n), scale: scale * 0.8, color: ['#cbbf9f', '#a89a80'] });
    else if (k === 'soot') fx.emit('smoke', x, y, { n: Math.round(4 * n), scale: scale * 0.5 });
    else if (k === 'rust') {
      fx.emit('sparks', x, y, { n: Math.round(10 * n), scale: scale * 0.8 });
      fx.emit({ n: Math.round(4 * n), speed: [80, 200], angle: -Math.PI / 2, spread: 2.4, life: [0.4, 0.8], size: [1.5, 3], gravity: 900, drag: 0.8, color: RUST, shape: 'shard', spin: 12 } as Emit, x, y, { scale });
    } else if (k === 'paint') {
      fx.emit({ n: Math.round(6 * n), speed: [30, 110], angle: 0, spread: 3.2, life: [0.4, 0.9], size: [3, 6], grow: 2, gravity: -10, drag: 2, color: [car?.color ?? '#ffffff'], shape: 'smoke', opacity: 0.45 } as Emit, x, y, { scale });
    } else if (k === 'polish') {
      fx.emit('magic', x, y, { n: Math.round(4 * n), scale: scale * 0.7, color: ['#ffffff', '#e8f6ff'] });
      if (hand) fx.ring(x, y, { r0: 4, r1: 22 * scale, life: 0.3, color: '#ffffff', width: 2 });
    } else if (k === 'thruster') {
      // The welder on the nozzle: sparks and a blue-white arc
      fx.emit('sparks', x, y, { n: Math.round(8 * n), scale: scale * 0.6 });
      fx.emit('magic', x, y, { n: Math.round(2 * n), scale: scale * 0.5, color: ['#9fe8ff', '#ffffff'] });
    } else {
      fx.emit('sparks', x, y, { n: Math.round(5 * n), scale: scale * 0.5 });
    }
  }

  /** The finale's beats, by the stage time */
  function finale(st: number): void {
    lights = Math.min(1, st / 0.25);
    shakeY = st > 0.35 && st < 1.1 ? Math.sin(st * 90) * Math.max(0, 1.1 - st) * 1.6 : 0;
    if (fromTop()) {
      // The roof opens, the engines light, it lifts off and leaves through the hatch
      hatchTarget = st > 0.6 ? 1 : 0;
      burn = st > 0.95 ? Math.min(1, (st - 0.95) / 0.3) : 0;
      if (st > 1.25) vy = -ease.inCubic(Math.min(1, (st - 1.25) / (FLOW.finaleSec - 1.25))) * (byRest + (art?.h ?? 0) + 60);
      if (restoredAt < 0 && st > 1.25) restoredAt = t;
      return;
    }
    doorTarget = st > 0.7 ? 1 : doorTarget;
    if (fromSide()) {
      // The engines light, it lifts off the floor and flies out through the door
      burn = st > 0.95 ? Math.min(1, (st - 0.95) / 0.3) : 0;
      vy = -hover() * ease.outCubic(Math.min(1, Math.max(0, (st - 0.95) / 0.3)));
    }
    if (st > 1.25) {
      const k = (st - 1.25) / (FLOW.finaleSec - 1.25);
      dx = ease.inCubic(Math.min(1, k)) * (w - bx + 40);
    }
    if (restoredAt < 0 && st > 1.25) restoredAt = t;
  }

  /** The room's main lamp (the wheels' light comes from it) */
  const lampAt = (): [number, number] => [w * 0.47, ground * 0.14];

  function drawCar(gx: Ctx): void {
    if (!art || !car) return;
    const x = bx + dx;
    const y = by + shakeY;
    const s = car.model.shape;
    // Shadow on the floor (fainter and wider while it flies)
    const air = Math.min(1, -vy / Math.max(1, carL * 0.5));
    contactShadow(gx, x + art.w / 2, ground + 2, art.w * (0.46 + air * 0.2), Math.max(6, carL * 0.03), '#05060a', 0.55 * (1 - air * 0.7));
    drawLegs(gx, x, y);
    // Wheels behind? (no: in side view they are in front of the arches, drawn after the body)
    gx.drawImage(art.body, x, y, art.w, art.h);
    // Parts: bumpers, mirror, the head lamp — missing ones aren't drawn, fixed ones pop in
    const task = (id: string) => car!.parts.find((p) => p.id === id);
    const partVisible = (id: string) => {
      const tk = task(id);
      return !tk || tk.left <= 0;
    };
    const pop = (id: string) => {
      const at = popped.get(id);
      if (at === undefined) return 1;
      const k = Math.min(1, (t - at) / 0.35);
      return ease.outBack(k);
    };
    for (const id of ['bumperF', 'bumperR', 'mirror'] as const) {
      const p = art.parts[id];
      if (!p) continue;
      if (!partVisible(id)) {
        // A painted car's bumper to fix hangs loose off its inner mounts, its outer end dropped: the car stays whole
        // (a missing one read as a badly cropped picture: the owner's table, 2026-10-19, «часть машины просто
        // отсутствует»). Fixed, it pops back into place
        if (car.model.painted && id !== 'mirror') {
          const front = id === 'bumperF';
          const px = x + p.x + (front ? 0 : p.w);
          const py = y + p.y;
          gx.save();
          gx.translate(px, py);
          gx.rotate((front ? 1 : -1) * 0.16);
          gx.filter = 'brightness(0.8)';
          gx.drawImage(p.canvas, front ? 0 : -p.w, p.h * 0.08, p.w, p.h);
          gx.restore();
        }
        continue;
      }
      const k = pop(id);
      gx.drawImage(p.canvas, x + p.x + p.w / 2 - (p.w * k) / 2, y + p.y + p.h / 2 - (p.h * k) / 2, p.w * k, p.h * k);
    }
    if (art.parts.head) {
      const p = art.parts.head;
      const fixed = partVisible('head');
      const k = fixed ? pop('head') : 1;
      gx.drawImage(fixed ? p.canvas : art.brokenHead!, x + p.x + p.w / 2 - (p.w * k) / 2, y + p.y + p.h / 2 - (p.h * k) / 2, p.w * k, p.h * k);
    }
    // Wheels (turning), or the hub on a stand while a wheel is missing
    s.wheels.forEach((_, i) => {
      const [wx, wy, r] = wheelAt(art!, i);
      const id = `wheel${i}`;
      const job = car!.wheels.find((j) => j.wheel === i);
      // In the bay (its nuts are off): the hub on a stand; a damaged one still on: its look; a done one: its new rim
      const inBay = !!job && job.step !== 'done' && job.step !== 'nutsOff';
      if (!partVisible(id) || inBay) {
        // Scale the hub to this axle (multi-axle trucks and cars with different
        // front/rear diameters were all using the first axle's hub size).
        const firstR = wheelAt(art!, 0)[2];
        const factor = firstR > 0 ? r / firstR : 1;
        const hw = (art!.hub.width / art!.scale) * factor;
        const hh = (art!.hub.height / art!.scale) * factor;
        gx.drawImage(art!.hub, x + wx - hw / 2, y + wy - hw / 2, hw, hh);
        return;
      }
      const look = job && job.step === 'nutsOff' ? (job.damage === 'flat' ? 'ok' : job.damage) : 'ok';
      // A replaced or repaired wheel is the car's own wheel again: both sides match (the owner, 2026-10-16)
      const c = art!.wheel(i, undefined, look);
      const cw = c.width / art!.scale;
      const k = job?.step === 'done' ? pop(id) : pop(id);
      // The room's lamp: the wheels' light and shadows come from it, and move as the car rolls
      const [lx, ly] = lampAt();
      wheelShadow(gx, x + wx, y + wy + r, r * k, lx);
      // A flat tyre: the wheel's own rubber squashed on the floor (the car stands still meanwhile)
      if (job && job.step === 'nutsOff' && job.damage === 'flat' && k >= 1) {
        drawFlatWheel(gx, c, cw, x + wx, y + wy, r, 1, t);
        wheelLight(gx, x + wx, y + wy + r * 0.08, r, lx, ly, true);
        return;
      }
      gx.save();
      gx.translate(x + wx, y + wy + (1 - k) * r);
      gx.rotate(spin * (s.wheels[0].r / s.wheels[i].r));
      // Guard against transparency holes in photographed wheel cut-outs.
      // The garage wall must never be visible through tyre rubber.
      gx.fillStyle = '#17191e';
      gx.beginPath();
      gx.arc(0, 0, r * k * 0.99, 0, Math.PI * 2);
      gx.fill();
      gx.drawImage(c, (-cw * k) / 2, (-cw * k) / 2, cw * k, cw * k);
      gx.restore();
      wheelLight(gx, x + wx, y + wy + (1 - k) * r, r * k, lx, ly, true);
    });
    // The layers over everything
    layers?.draw(gx, x, y);
    drawNozzles(gx, x, y);
  }

  function drawLegs(gx: Ctx, x: number, y: number): void {
    if (art && car?.model.shape.legs) shipLegs(gx, art, car.model.shape.legs, x, y);
  }
  function nozzleAt(i: number, x = bx + dx, y = by + shakeY): NozzleSpot | null {
    const z = car?.model.shape.thrusters?.[i];
    return z && art ? nozzleSpot(art, z, x, y) : null;
  }
  /**
   * The engine nozzles (a spacecraft has them instead of wheels): a broken one is scorched and sputters sparks and
   * smoke, a repaired one glows from inside; they all burn while the ship comes down and takes off, a repaired one
   * fires a test burst
   */
  function drawNozzles(gx: Ctx, x: number, y: number): void {
    const zs = car?.model.shape.thrusters;
    if (!zs || !art || !car) return;
    zs.forEach((z, i) => {
      const id = `noz${i}`;
      const tk = car!.thrusters.find((q) => q.id === id);
      const broken = !!tk && tk.left > 0;
      // The flame: the burn (broken ones only sputter), or a repaired one's test
      const test = popped.has(id) ? Math.max(0, 1 - (t - popped.get(id)!) / 1.3) : 0;
      const f = Math.max(test, broken ? burn * (Math.sin(t * 31 + i) > 0.2 ? 0.35 : 0) : burn);
      shipNozzle(gx, art!, z, x, y, { broken, flame: f, color: car!.model.flame, t, i });
    });
  }

  /**
   * The roof over a space garage, with the hatch the ships come through: the sky through the opening behind the ship
   * (`front` false), the roof and its doors in front of it (a ship never shows through the roof)
   */
  function drawHatch(gx: Ctx, front: boolean): void {
    if (level < 6 || !art) return;
    const cx = bx + art.w / 2;
    const hw = art.w * 0.62;
    const band = Math.max(14, view.top + Math.min(w, h) * 0.06);
    const open = hw * hatch;
    gx.save();
    if (!front) {
      if (open > 1) {
        gx.fillStyle = '#03050d';
        gx.fillRect(cx - open, 0, open * 2, band);
        gx.fillStyle = 'rgba(255,255,255,0.8)';
        for (let i = 0; i < 18; i++) gx.fillRect(cx - open + (((i * 97) % 100) / 100) * open * 2, (((i * 61) % 100) / 100) * band, 1.5, 1.5);
      }
      gx.restore();
      return;
    }
    // The roof slab on both sides of the opening
    const cg = gx.createLinearGradient(0, 0, 0, band);
    cg.addColorStop(0, '#20262f');
    cg.addColorStop(1, '#3b4452');
    gx.fillStyle = cg;
    gx.fillRect(0, 0, Math.max(0, cx - open), band);
    gx.fillRect(cx + open, 0, Math.max(0, w - cx - open), band);
    // The two doors sliding apart, hazard yellow on their edges
    const dw = hw * (1 - hatch);
    if (dw > 1)
      for (const side of [-1, 1]) {
        const xx = side < 0 ? cx - open - dw : cx + open;
        gx.fillStyle = '#56606b';
        gx.fillRect(xx, 0, dw, band - 2);
        gx.fillStyle = '#f2c22e';
        gx.fillRect(side < 0 ? xx + dw - 6 : xx, 0, 6, band - 2);
      }
    gx.fillStyle = '#5ff6ff';
    gx.fillRect(0, band - 2, Math.max(0, cx - open), 2);
    gx.fillRect(cx + open, band - 2, Math.max(0, w - cx - open), 2);
    gx.strokeStyle = '#8796ab';
    gx.lineWidth = 2;
    gx.strokeRect(cx - hw, 0, hw * 2, band - 2);
    gx.restore();
  }


  let reflCanvas: HTMLCanvasElement | null = null;
  /** AutoQuality's level: 0 best … 3 cheapest */
  let quality = 0;
  function drawReflection(gx: Ctx): void {
    if (!art || quality >= 2) return;
    const shine = look().shine;
    if (shine <= 0) return;
    // The car upside down in the floor, fading out with the distance: drawn into its own canvas, faded there
    const W = Math.ceil(art.w * art.scale);
    const H = Math.ceil(art.h * 0.6 * art.scale);
    const fresh = !reflCanvas || reflCanvas.width !== W || reflCanvas.height !== H;
    if (fresh) [reflCanvas] = canvas2d(W, H);
    const rg = reflCanvas!.getContext('2d')!;
    // Repainted at most ~20 times a second (the dirt under it changes slowly); placed every frame
    reflAcc++;
    if (!fresh && reflAcc % 3 !== 0) {
      gx.save();
      gx.globalAlpha = shine * Math.max(0, 1 + vy / art.h);
      gx.drawImage(reflCanvas!, bx + dx, ground + 2 - vy, art.w, art.h * 0.6);
      gx.restore();
      return;
    }
    rg.setTransform(1, 0, 0, 1, 0, 0);
    rg.globalCompositeOperation = 'source-over';
    rg.clearRect(0, 0, W, H);
    rg.setTransform(art.scale, 0, 0, -art.scale, 0, art.h * art.scale);
    rg.drawImage(art.body, 0, 0, art.w, art.h);
    // The parts on the car and the wheels show in the floor too (the owner, 2026-10-16: «в отражении не отображаются
    // колёса»)
    for (const [id, p] of Object.entries(art.parts)) {
      const tk = car?.parts.find((q) => q.id === id);
      if (p && id !== 'head' && (!tk || tk.left <= 0)) rg.drawImage(p.canvas, p.x, p.y, p.w, p.h);
    }
    if (art.parts.head) rg.drawImage(art.parts.head.canvas, art.parts.head.x, art.parts.head.y, art.parts.head.w, art.parts.head.h);
    car?.model.shape.wheels.forEach((_, i) => {
      const job = car!.wheels.find((j) => j.wheel === i);
      if (job && job.step !== 'done' && job.step !== 'nutsOff') return;
      const [wx, wy] = wheelAt(art!, i);
      const c = art!.wheel(i, undefined, 'ok');
      const size = c.width / art!.scale;
      rg.save();
      rg.translate(wx, wy);
      rg.rotate(spin);
      rg.drawImage(c, -size / 2, -size / 2, size, size);
      rg.restore();
    });
    layers?.draw(rg, 0, 0);
    rg.setTransform(1, 0, 0, 1, 0, 0);
    rg.globalCompositeOperation = 'destination-in';
    const fade = rg.createLinearGradient(0, 0, 0, H);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    rg.fillStyle = fade;
    rg.fillRect(0, 0, W, H);
    gx.save();
    gx.globalAlpha = shine * Math.max(0, 1 + vy / art.h);
    gx.drawImage(reflCanvas!, bx + dx, ground + 2 - vy, art.w, art.h * 0.6);
    gx.restore();
  }

  function drawRobot(gx: Ctx, r: RobotView): void {
    const s = Math.max(16, Math.min(40, carL * 0.075));
    const bob = Math.sin(t * 3 + r.i) * 1.2;
    const working = t - r.busy < 0.25;
    gx.save();
    // Near the player's finger a robot fades out of the way (the owner: «мешают частенько»)
    // While the player works the car every robot steps back into the background (the reviewer: they hid dirt still to
    // find), those near the finger most
    if (pointer.on) gx.globalAlpha = Math.hypot(r.tx - pointer.x, r.ty - pointer.y) < Math.max(70, carL * 0.18) ? 0.2 : 0.45;
    if (r.cat === 'wash' || r.cat === 'wrench') {
      // A floor robot: it drives along the floor under its work and reaches up with its arm
      drawFloorRobot(gx, r.cat, r.x, r.hy, r.tx, r.ty, s, bob, working, t, r.i);
    } else if (r.cat === 'grind' || r.cat === 'paint') {
      // A carriage on the overhead rail above the car, its arm reaching down
      const rusty = car?.stage === 'surface' && car.layers.some((l) => l.kind === 'rust' && l.left > 0);
      drawRailRobot(gx, r.cat, r.x, r.hy, r.tx, r.ty, s, working, t, rusty, car?.color ?? '#ffffff');
    } else {
      // The polish drone hovers at its tip
      drawDrone(gx, r.tx, r.ty - s * 0.5 + bob, s, working, t, r.i);
    }
    gx.restore();
  }

  /** The overhead rail the ceiling arms ride on */
  function drawRail(gx: Ctx): void {
    if (!art || !robots.some((r) => r.cat === 'grind' || r.cat === 'paint')) return;
    const y = robots.find((r) => r.cat === 'grind' || r.cat === 'paint')!.hy - carL * 0.012;
    const x0 = bx - carL * 0.08;
    const x1 = bx + art.w + carL * 0.08;
    const gr = gx.createLinearGradient(0, y - 5, 0, y + 5);
    gr.addColorStop(0, '#9aa1ab');
    gr.addColorStop(1, '#3a3f46');
    gx.fillStyle = gr;
    gx.fillRect(x0, y - 4, x1 - x0, 8);
    gx.fillStyle = '#2b2e36';
    gx.fillRect(x0, view.top, 4, y - view.top);
    gx.fillRect(x1 - 4, view.top, 4, y - view.top);
  }

  /** The suction cup on a dent: the dent's index and where the finger holds the handle (screen) */
  let grab: { i: number; x: number; y: number } | null = null;
  /**
   * Dents in the panels: a hollow lit from above (dark up-left, a bright lip down-right), creases, a glow that says
   * "grab here" in the body stage; held, a rubber cup on the dent with its handle out to the finger. A dent shrinks as
   * it is pulled
   */
  function drawDents(gx: Ctx): void {
    if (!car || !art || !car.dents.length) return;
    const cw = art.w / GRID.w;
    car.dents.forEach((d, i) => {
      if (d.left <= 0) return;
      const k = d.left / d.work;
      const [x, y] = gridToScreen(d.gx, d.gy);
      const r = d.r * cw * (0.55 + 0.45 * k);
      gx.save();
      gx.globalAlpha = car!.stage === 'surface' ? 0.5 : 1;
      const gr = gx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.05, x, y, r);
      gr.addColorStop(0, `rgba(0,0,0,${0.6 * k + 0.12})`);
      gr.addColorStop(0.6, `rgba(0,0,0,${0.3 * k})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      gx.fillStyle = gr;
      gx.beginPath();
      gx.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
      gx.fill();
      gx.strokeStyle = `rgba(255,255,255,${0.15 + 0.35 * k})`;
      gx.lineWidth = Math.max(1.5, r * 0.12);
      gx.lineCap = 'round';
      gx.beginPath();
      gx.ellipse(x, y, r * 0.82, r * 0.66, 0, Math.PI * 0.05, Math.PI * 0.75);
      gx.stroke();
      // Creases
      gx.strokeStyle = `rgba(20,16,24,${0.35 * k})`;
      gx.lineWidth = 1;
      for (let c = 0; c < 4; c++) {
        const a = c * 1.7 + d.r;
        gx.beginPath();
        gx.moveTo(x + Math.cos(a) * r * 0.2, y + Math.sin(a) * r * 0.16);
        gx.lineTo(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.6);
        gx.stroke();
      }
      const held = grab && grab.i === i ? grab : null;
      if (car!.stage === 'body' && !held) {
        const p = 0.5 + 0.5 * Math.sin(t * 5 + i);
        gx.strokeStyle = `rgba(255,190,80,${0.45 + 0.4 * p})`;
        gx.lineWidth = 2.5;
        gx.beginPath();
        gx.ellipse(x, y, r * (1.15 + 0.12 * p), r * (0.95 + 0.1 * p), 0, 0, Math.PI * 2);
        gx.stroke();
      }
      if (held) {
        // The handle from the cup to the finger, the cup stretched toward it
        const ang = Math.atan2(held.y - y, held.x - x);
        const len = Math.hypot(held.x - x, held.y - y);
        const cup = Math.max(10, r * 0.75);
        gx.lineCap = 'round';
        gx.strokeStyle = '#2b2f38';
        gx.lineWidth = Math.max(5, cup * 0.32);
        gx.beginPath();
        gx.moveTo(x, y);
        gx.lineTo(held.x, held.y);
        gx.stroke();
        gx.strokeStyle = '#ffb02e';
        gx.lineWidth = Math.max(3, cup * 0.18);
        gx.stroke();
        gx.save();
        gx.translate(x, y);
        gx.rotate(ang);
        const st = 1 + Math.min(0.5, len / (carL * 0.6));
        const cg = gx.createRadialGradient(-cup * 0.3, -cup * 0.3, 1, 0, 0, cup);
        cg.addColorStop(0, '#6a7280');
        cg.addColorStop(1, '#1d2028');
        gx.fillStyle = cg;
        gx.beginPath();
        gx.ellipse(cup * 0.15 * (st - 1), 0, cup * st, cup, 0, 0, Math.PI * 2);
        gx.fill();
        gx.restore();
        // The grip
        gx.fillStyle = '#ffb02e';
        gx.beginPath();
        gx.arc(held.x, held.y, Math.max(7, cup * 0.35), 0, Math.PI * 2);
        gx.fill();
      }
      gx.restore();
    });
  }

  function drawPartsHints(gx: Ctx): void {
    if (!car || !art) return;
    const tasks = car.stage === 'parts' ? car.parts : car.stage === 'engine' ? car.engine : car.stage === 'thrusters' ? car.thrusters : [];
    if (car.stage === 'engine') {
      // The x-ray scanner over the engine
      const [ex, ey] = art.px(car.model.shape.engine[0], car.model.shape.engine[1]);
      const rw = carL * 0.24;
      const rh = carL * 0.13;
      const x = bx + dx + ex;
      const y = by + ey;
      gx.save();
      gx.fillStyle = 'rgba(10,40,60,0.72)';
      gx.strokeStyle = '#3fffd8';
      gx.lineWidth = 2;
      gx.beginPath();
      gx.roundRect(x - rw / 2, y - rh / 2, rw, rh, 8);
      gx.fill();
      gx.stroke();
      gx.clip();
      gx.strokeStyle = 'rgba(63,255,216,0.25)';
      gx.lineWidth = 1;
      for (let xx = x - rw / 2; xx < x + rw / 2; xx += 8) {
        gx.beginPath();
        gx.moveTo(xx, y - rh / 2);
        gx.lineTo(xx, y + rh / 2);
        gx.stroke();
      }
      // The engine block
      gx.strokeStyle = '#9fffe8';
      gx.lineWidth = 1.5;
      gx.strokeRect(x - rw * 0.3, y - rh * 0.15, rw * 0.6, rh * 0.45);
      for (let i = 0; i < 4; i++) gx.strokeRect(x - rw * 0.26 + i * rw * 0.14, y - rh * 0.38, rw * 0.1, rh * 0.22);
      // The scan line
      const sy = y - rh / 2 + ((t * 0.8) % 1) * rh;
      gx.fillStyle = 'rgba(63,255,216,0.35)';
      gx.fillRect(x - rw / 2, sy, rw, 2);
      gx.restore();
    }
    for (const tk of tasks) {
      const [x, y] = gridToScreen(tk.gx, tk.gy);
      const done = tk.left <= 0;
      if (done && car.stage !== 'engine') continue;
      const pulse = 1 + 0.12 * Math.sin(t * 6);
      const r = Math.max(10, carL * 0.035) * pulse;
      gx.save();
      if (!done) glow(gx, x, y, r * 2.2, car.stage === 'engine' ? '#ff4f4f' : car.stage === 'thrusters' ? '#ff8a2e' : '#ffd166', 0.8);
      gx.lineWidth = 3;
      gx.strokeStyle = done ? '#5fd06a' : car.stage === 'engine' ? '#ff6b6b' : '#ffd166';
      gx.beginPath();
      gx.arc(x, y, r, 0, Math.PI * 2);
      gx.stroke();
      // Progress around it
      gx.strokeStyle = '#ffffff';
      gx.beginPath();
      gx.arc(x, y, r + 4, -Math.PI / 2, -Math.PI / 2 + (1 - tk.left / tk.work) * Math.PI * 2);
      gx.stroke();
      if (car.stage === 'thrusters') {
        gx.restore();
        continue;
      }
      // A bolt
      gx.fillStyle = done ? '#5fd06a' : '#e6eaef';
      gx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + (1 - tk.left / tk.work) * 6;
        const px = x + Math.cos(a) * r * 0.45;
        const py = y + Math.sin(a) * r * 0.45;
        if (i) gx.lineTo(px, py);
        else gx.moveTo(px, py);
      }
      gx.closePath();
      gx.fill();
      gx.restore();
    }
  }

  function drawLightsOn(gx: Ctx): void {
    if (!art || !car || lights <= 0) return;
    const s = car.model.shape;
    if (s.head.kind !== 'none' && s.head.w > 0) {
      const [hx, hy] = art.px(s.head.x, s.head.y);
      const x = bx + dx + hx;
      const y = by + shakeY + hy;
      // The beam toward the open gate
      gx.save();
      gx.globalCompositeOperation = 'lighter';
      const len = Math.min(w * 0.5, carL * 0.9);
      const beam = gx.createLinearGradient(x, y, x + len, y);
      beam.addColorStop(0, `rgba(255,244,200,${0.55 * lights})`);
      beam.addColorStop(1, 'rgba(255,244,200,0)');
      gx.fillStyle = beam;
      gx.beginPath();
      gx.moveTo(x, y - carL * 0.012);
      gx.lineTo(x + len, y - carL * 0.1);
      gx.lineTo(x + len, y + carL * 0.16);
      gx.lineTo(x, y + carL * 0.012);
      gx.closePath();
      gx.fill();
      gx.restore();
      if (s.head.kind === 'popup') {
        // The lamps flip up
        gx.save();
        gx.translate(x, y - carL * 0.012 * lights);
        drawHeadLamp(gx, { ...s, head: { ...s.head, kind: 'rect', h: s.head.w * 0.4 } }, carL, false);
        gx.restore();
      }
      glow(gx, x, y, carL * 0.07, '#fff3c4', 1.4 * lights);
    }
    if (s.tail.w > 0) {
      const [tx, ty] = art.px(s.tail.x, s.tail.y);
      glow(gx, bx + dx + tx, by + shakeY + ty, carL * 0.05, '#ff3b2f', lights);
    }
  }

  let gleamCanvas: HTMLCanvasElement | null = null;
  function drawGleam(gx: Ctx): void {
    if (!art || gleam < 0) return;
    const k = (t - gleam) / 0.9;
    if (k > 1) {
      gleam = -1;
      return;
    }
    // A light band sweeping across the body, only on the car
    // One canvas kept for the sweep (not one a frame)
    const W = Math.ceil(art.w * art.scale);
    const H = Math.ceil(art.h * art.scale);
    if (!gleamCanvas || gleamCanvas.width !== W || gleamCanvas.height !== H) [gleamCanvas] = canvas2d(W, H);
    const c = gleamCanvas;
    const cg = c.getContext('2d')!;
    cg.setTransform(1, 0, 0, 1, 0, 0);
    cg.globalCompositeOperation = 'source-over';
    cg.clearRect(0, 0, W, H);
    cg.scale(art.scale, art.scale);
    const x = -art.w * 0.3 + k * art.w * 1.6;
    const gr = cg.createLinearGradient(x - art.w * 0.15, 0, x + art.w * 0.15, art.h);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.85)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    cg.fillStyle = gr;
    cg.fillRect(0, 0, art.w, art.h);
    cg.globalCompositeOperation = 'destination-in';
    cg.setTransform(1, 0, 0, 1, 0, 0);
    cg.drawImage(art.silhouette, 0, 0);
    gx.save();
    gx.globalCompositeOperation = 'lighter';
    gx.globalAlpha = 0.6;
    gx.drawImage(c, bx + dx, by + shakeY, art.w, art.h);
    gx.restore();
  }

  /** The tyre bay's panel: above the car on a phone, beside it on a wide screen */
  function bayGeom(): Bay | null {
    if (!car || !art || car.stage !== 'wheels') return null;
    const portrait = h > w;
    if (portrait) {
      // Room above the car, with a line under it for the hint
      const avail = by - view.top - 56;
      const r = Math.max(64, Math.min(w * 0.42, avail * 0.46, 180));
      return { x: w / 2, y: view.top + 10 + r, r };
    }
    const r = Math.max(80, Math.min(h * 0.3, (ground - view.top) * 0.46, 180));
    const x = Math.min(w - r - 16, bx + art.w + r + 30);
    return { x, y: view.top + r + 14, r };
  }

  function drawTyreBay(gx: Ctx): void {
    const bay = bayGeom();
    if (!bay || !car || !art) return;
    const job = currentWheel(car);
    if (!job) return;
    const [wx, wy] = wheelAt(art, job.wheel);
    // No random replacements: restore the exact same factory wheel.
    const rimNow = defaultRim(car.model, car.variant);
    const a = art;
    // The close-up drawn at its own size from the full picture (a magnified small sprite was a blur of pixels)
    const own = (look: WheelLook, rPx: number) => {
      // In steps of 16 px: the bay's opening animation doesn't bake a sprite a frame
      const rr = Math.ceil(rPx / 16) * 16;
      const img = a.wheel(job.wheel, undefined, look, rr);
      return { img, r: rr, size: img.width / a.scale };
    };
    drawBay(gx, bay, job, car.model, car.variant, t, rimNow, [bx + dx + wx, by + wy], own);
  }

  function drawPointer(gx: Ctx): void {
    if (!pointer.cat || !car || (car.stage !== 'surface' && car.stage !== 'parts' && car.stage !== 'engine' && car.stage !== 'wheels')) return;
    const s = Math.max(34, Math.min(58, carL * 0.12));
    const working = t - pointer.work < 0.15;
    gx.save();
    gx.translate(pointer.x - s * 0.15, pointer.y - s * 0.85);
    if (working) {
      if (pointer.cat === 'grind' || pointer.cat === 'polish') gx.rotate(Math.sin(t * 50) * 0.08);
      else gx.translate(Math.sin(t * 73), Math.cos(t * 59));
    }
    gx.globalAlpha = pointer.on ? 1 : 0.85;
    drawIcon(gx, toolIcon(pointer.cat, pointer.level), s);
    gx.restore();
  }

  /** The coach's hand: what to do and where (screen) — a swipe, a tap, a press-and-hold or a pull */
  let coach: Coach | null = null;
  function drawCoach(gx: Ctx): void {
    if (!coach) return;
    const c = coach;
    const s = Math.max(44, Math.min(66, carL * 0.15));
    const T = (t % 1.6) / 1.6;
    let x = 0;
    let y = 0;
    let press = false;
    gx.save();
    const ring = (rx: number, ry: number, k: number, a: number) => {
      gx.strokeStyle = `rgba(255,209,102,${a})`;
      gx.lineWidth = 3;
      gx.beginPath();
      gx.arc(rx, ry, 12 + k * 22, 0, Math.PI * 2);
      gx.stroke();
    };
    if ('x0' in c) {
      // The path, dashed, then the hand along it
      gx.setLineDash([6, 8]);
      gx.lineDashOffset = -t * 30;
      gx.strokeStyle = 'rgba(255,209,102,0.75)';
      gx.lineWidth = 3;
      gx.beginPath();
      gx.moveTo(c.x0, c.y0);
      gx.lineTo(c.x1, c.y1);
      gx.stroke();
      gx.setLineDash([]);
      const k = c.kind === 'swipe' ? ease.inOutQuad(T < 0.5 ? T * 2 : 2 - T * 2) : ease.inOutQuad(Math.min(1, T * 1.35));
      x = c.x0 + (c.x1 - c.x0) * k;
      y = c.y0 + (c.y1 - c.y0) * k;
      press = c.kind === 'swipe' || T < 0.8;
      if (c.kind === 'pull') ring(c.x0, c.y0, 0.3 + 0.2 * Math.sin(t * 6), 0.9);
    } else {
      x = c.x;
      y = c.y;
      press = c.kind === 'hold' ? T > 0.15 : T > 0.3 && T < 0.55;
      ring(x, y, c.kind === 'hold' ? Math.min(1, T * 1.2) : press ? (T - 0.3) * 4 : 0, press ? 0.95 : 0.5);
    }
    gx.globalAlpha = 0.95;
    gx.translate(x - s * 0.4, y - s * 0.05 + (press ? 3 : -4));
    const sc = press ? 0.92 : 1;
    gx.scale(sc, sc);
    drawIcon(gx, 'hand', s);
    gx.restore();
  }

  function drawGhost(gx: Ctx): void {
    if (!ghost || coach || !art || !car || car.stage !== 'surface') return;
    const k = (t % 2.2) / 2.2;
    const x = bx + art.w * (0.25 + 0.5 * ease.inOutQuad(k < 0.5 ? k * 2 : 2 - k * 2));
    const y = by + art.h * 0.55 + Math.sin(k * Math.PI * 4) * 6;
    const s = Math.max(40, Math.min(64, carL * 0.15));
    gx.save();
    gx.globalAlpha = 0.9;
    gx.translate(x - s * 0.4, y - s * 0.05);
    drawIcon(gx, 'hand', s);
    gx.restore();
  }

  function drawRestored(gx: Ctx): void {
    if (restoredAt < 0) return;
    const k = Math.min(1, (t - restoredAt) / 0.45);
    // It fades before the card comes (it stuck out above the card: the first look, 1.5.0)
    const fade = 1 - Math.min(1, Math.max(0, (t - restoredAt - 1.0) / 0.35));
    if (fade <= 0) return;
    const size = Math.max(30, Math.min(78, w * 0.085));
    const y = Math.max(view.top + size * 1.4, ground * 0.42);
    gx.save();
    gx.globalAlpha *= fade;
    gx.translate(w / 2, y);
    const sc = ease.outBack(k);
    gx.scale(sc, sc);
    gx.textAlign = 'center';
    gx.textBaseline = 'middle';
    gx.font = `900 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    gx.lineJoin = 'round';
    gx.lineWidth = size * 0.16;
    gx.strokeStyle = '#1b1430';
    gx.strokeText(restoredText, 0, 0);
    const gr = gx.createLinearGradient(0, -size / 2, 0, size / 2);
    gr.addColorStop(0, '#fff6c2');
    gr.addColorStop(1, '#ffb02e');
    gx.fillStyle = gr;
    gx.fillText(restoredText, 0, 0);
    gx.font = `900 ${size * 0.62}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    gx.lineWidth = size * 0.12;
    gx.strokeText(restoredSub, 0, size * 0.9);
    gx.fillStyle = '#7dff8a';
    gx.fillText(restoredSub, 0, size * 0.9);
    gx.restore();
  }

  return {
    fx,
    get carL() {
      return carL;
    },
    resize(nw: number, nh: number, v: SceneView): void {
      w = nw;
      h = nh;
      view = v;
      ground = groundY(w, h, v.top, v.bottom);
      cam.setView(w, h).snap(w / 2, h / 2);
      bakeRoomNow();
      // The car is re-baked only when its size changes (a Resume or a menu must not repaint its dirt)
      const key = `${w}:${h}:${v.top}:${v.bottom}:${density()}`;
      if (key !== layoutKey || !art) {
        layoutKey = key;
        layoutCar();
      }
    },
    setLevel(l: number, styleOf = 0, place?: string): void {
      level = l;
      roomLook = styleOf;
      roomPlace = place;
      bakeRoomNow();
    },
    setRobots(counts: Record<Cat, number>): void {
      robotCounts = { ...counts };
      placeRobots();
    },
    /** A new car rolls in */
    setCar(c: Car): void {
      car = c;
      popped.clear();
      lights = 0;
      gleam = -1;
      restoredAt = -1;
      fx.clear();
      vy = 0;
      layoutCar();
      dx = w - bx + 30;
      rolling = true;
      landed = !fromTop() && !fromSide();
      if (fromSide()) {
        vy = -hover();
        by = byRest + vy;
        burn = 0.75;
      }
      if (fromTop()) {
        // It comes down through the roof: open already, the side door stays shut
        dx = 0;
        vy = -(byRest + (art?.h ?? 0) + 40);
        by = byRest + vy;
        hatch = hatchTarget = 1;
        burn = 1;
      }
      announce = c.rarity === 'common' || c.rarity === 'uncommon' ? -1 : t;
      if (!fromTop()) {
        doorTarget = 1;
        door = Math.max(door, 0.95);
      }
    },
    /** Show a car as it is (the title's backdrop, a resume): no roll-in */
    showCar(c: Car): void {
      car = c;
      popped.clear();
      lights = 0;
      restoredAt = -1;
      vy = 0;
      burn = 0;
      layoutCar();
      dx = 0;
      rolling = false;
      doorTarget = 0;
      door = 0;
      hatch = hatchTarget = 0;
    },
    screenToGrid,
    gridToScreen,
    /** Is a screen point on the car (its box, a little margin)? */
    onCar(x: number, y: number): boolean {
      return !!art && x >= bx + dx - 20 && x <= bx + dx + art.w + 20 && y >= by - 20 && y <= ground + 10;
    },
    bay: (): Bay | null => bayGeom(),
    carBox(): { x: number; y: number; w: number; h: number } | null {
      return art ? { x: bx + dx, y: by, w: art.w, h: art.h } : null;
    },
    /** The car's box where it stands (a ship still coming down: where it will land) */
    restBox(): { x: number; y: number; w: number; h: number } | null {
      return art ? { x: bx, y: byRest, w: art.w, h: art.h } : null;
    },
    pointer(p: Partial<typeof pointer>): void {
      pointer = { ...pointer, ...p };
    },
    /** The car's paint changed (the respray's colour): the body is baked again, the dirt layers stay as they are */
    recolor(): void {
      if (!car || !art) return;
      art = bakeCar(car.model, car.color, car.variant, carL);
    },
    /** The effects' quality from AutoQuality (0 best … 3 cheapest) */
    setQuality(level: number): void {
      quality = level;
      fx.quality = [1, 0.7, 0.45, 0.25][level] ?? 1;
    },
    /** The coach's hand (null: none) */
    setCoach(c: Coach | null): void {
      coach = c;
    },
    /** The suction cup held on a dent (null: let go) */
    setGrab(g: { i: number; x: number; y: number } | null): void {
      grab = g;
    },
    setGhost(on: boolean): void {
      ghost = on;
    },
    /** A stroke happened (the player's or a robot's) */
    stroke(res: StrokeResult, by: 'hand' | RobotStroke, tier: number): void {
      if (!art) return;
      const [x, y] = gridToScreen(res.gx, res.gy);
      if (res.kind !== 'part' && res.kind !== 'engine' && res.kind !== 'dent' && res.kind !== 'thruster') layers?.stamp(res.kind, res.gx, res.gy, res.r, res.bite, stampSeed++);
      if (by === 'hand') {
        pointer.work = t;
        strokeFx(res, x, y, true, tier);
        // Scrubbing doesn't shake the view (strokes come many a second: their trauma piled up); grinding rust a touch,
        // at most a few times a second
        if (res.kind === 'rust' && t - lastJolt > 0.25) {
          lastJolt = t;
          cam.addTrauma(0.015);
        }
      } else {
        const rv = robots.find((r) => r.cat === by.cat && r.i === by.index);
        // Helpers on someone else's work stay home (only the wrench bots crowd a bolt)
        const own = res.kind === 'part' || res.kind === 'engine' || res.kind === 'thruster' ? by.cat === 'wrench' : res.cat === by.cat;
        if (rv && own) {
          rv.gx = res.gx;
          rv.gy = res.gy;
          rv.busy = t;
        }
        if (t - lastEmit > 0.03) {
          lastEmit = t;
          strokeFx(res, x, y, false, tier);
        }
      }
      if (res.fixed) {
        popped.set(res.fixed, t);
        fx.emit('sparks', x, y, { n: 18, scale: 0.8 });
        fx.emit('magic', x, y, { n: 12, color: ['#ffd166', '#ffffff'] });
        fx.ring(x, y, { r0: 6, r1: 40, life: 0.35, color: '#ffd166', width: 3 });
        cam.addTrauma(0.07);
      }
      if (res.finished) {
        const b = this.carBox();
        if (b) fx.emit('magic', b.x + b.w / 2, b.y + b.h / 2, { n: 24, scale: 2, color: ['#ffffff', '#e8f6ff', '#fff3c4'] });
      }
    },
    /** Water from the nozzle (spray: true) or a tool's tap in the bay */
    spray(x: number, y: number, water: boolean): void {
      if (water) {
        fx.emit({ n: 8, speed: [60, 220], angle: Math.PI / 2, spread: 1.2, life: [0.3, 0.6], size: [1.2, 2.6], gravity: 600, drag: 1.2, color: ['#cfeeff', '#9fd8ff', '#ffffff'], shape: 'dot', additive: false, opacity: 0.85 } as Emit, x, y);
      } else {
        fx.emit('sparks', x, y, { n: 5, scale: 0.5 });
        fx.ring(x, y, { r0: 4, r1: 24, life: 0.25, color: '#ffd166', width: 2 });
      }
      pointer.work = t;
    },
    /** A wheel went back on the car: it pops into place */
    wheelDone(i: number): void {
      popped.set(`wheel${i}`, t);
      if (!art) return;
      const [wx, wy] = wheelAt(art, i);
      fx.emit('magic', bx + dx + wx, by + wy, { n: 16, color: ['#ffd166', '#ffffff'] });
      cam.addTrauma(0.05);
    },
    /** The last surface layer is gone: a sweep of light over the clean paint */
    shine(): void {
      gleam = t;
    },
    stageChanged(stage: string): void {
      if (stage === 'finale') {
        const b = this.carBox();
        if (b) {
          fx.light(b.x + b.w, b.y + b.h * 0.5, carL, '#fff3c4', { intensity: 1, life: 0.5 });
          fx.flash('#fff6d8', 0.35);
        }
        cam.addTrauma(0.15);
      }
    },
    /** The finale's RESTORED words (localised by the caller) */
    restored(title: string, money: string): void {
      restoredText = title;
      restoredSub = money;
    },
    exhaust(): void {
      if (!art || !car) return;
      const [ex, ey] = art.px(car.model.shape.tail.x, car.model.shape.wheels[0]?.r ?? 0.05);
      fx.emit('smoke', bx + dx + ex - 4, by + ey, { n: 8, scale: Math.max(0.6, carL / 400), angle: Math.PI, spread: 0.8 });
    },
    coins(): void {
      fx.emit('coins', w / 2, Math.max(view.top + 60, ground * 0.42), { n: 26, scale: 1.6 });
      fx.emit('confetti', w / 2, Math.max(view.top + 60, ground * 0.42), { n: 50 });
    },
    update(dt: number): void {
      t += dt;
      fx.update(dt);
      cam.update(dt);
      layers?.update(dt);
      layers?.sync();
      if (car) {
        if (car.stage === 'arrive' && !rolling) dx = 0;
        else if (car.stage === 'arrive' && fromTop()) {
          // Down through the hatch on the engines; they cut out on touchdown, the roof closes
          const k = Math.min(1, car.st / FLOW.arriveSec);
          dx = 0;
          vy = -(1 - ease.outCubic(k)) * (byRest + (art?.h ?? 0) + 40);
          burn = k < 0.9 ? 1 : Math.max(0, 1 - (k - 0.9) * 10);
          hatchTarget = k < 0.92 ? 1 : 0;
          doorTarget = 0;
          lights = 0;
          if (!landed && k > 0.8) {
            landed = true;
            fx.emit('dust', bx + (art?.w ?? 0) / 2, ground, { n: 30, scale: Math.max(1, carL / 300), color: ['#9aa3ad', '#c9ccd1'] });
            cam.addTrauma(0.12);
          }
        } else if (car.stage === 'arrive' && fromSide()) {
          // In through the door above the floor, braking; it settles on its legs and the engines cut out
          const k = Math.min(1, car.st / FLOW.arriveSec);
          dx = (1 - ease.outCubic(Math.min(1, k / 0.75))) * (w - bx + 30);
          vy = -hover() * (1 - ease.inOutCubic(Math.max(0, (k - 0.7) / 0.3)));
          burn = k < 0.9 ? 0.75 : Math.max(0, 0.75 - (k - 0.9) * 7.5);
          doorTarget = k < 0.8 ? 1 : 0;
          lights = 0;
          if (!landed && k > 0.97) {
            landed = true;
            fx.emit('dust', bx + (art?.w ?? 0) / 2, ground, { n: 24, scale: Math.max(1, carL / 300), color: ['#9aa3ad', '#c9ccd1'] });
            cam.addTrauma(0.08);
          }
        } else if (car.stage === 'arrive') {
          const k = Math.min(1, car.st / FLOW.arriveSec);
          const nx = (1 - ease.outCubic(k)) * (w - bx + 30);
          spin += (nx - dx) / Math.max(8, carL * 0.07);
          dx = nx;
          doorTarget = k < 0.8 ? 1 : 0;
          lights = 0;
        } else if (car.stage === 'finale' || car.stage === 'done') {
          const prev = dx;
          finale(car.stage === 'done' ? FLOW.finaleSec : car.st);
          spin += (dx - prev) / Math.max(8, carL * 0.07);
          if (!fromTop() && !fromSide()) vy = 0;
        } else {
          dx = 0;
          vy = 0;
          burn = 0;
          shakeY = 0;
          hatchTarget = 0;
        }
        by = byRest + vy;
        // A broken nozzle sputters now and then: a spark, a puff of smoke
        if (car.stage !== 'arrive' && car.stage !== 'finale' && car.stage !== 'done')
          for (const tk of car.thrusters) {
            if (tk.left <= 0) continue;
            const due = sputter.get(tk.id) ?? t + 0.3;
            if (t < due) {
              sputter.set(tk.id, due);
              continue;
            }
            sputter.set(tk.id, t + 0.45 + ((tk.gx * 7.3 + t * 3.1) % 1) * 0.9);
            const n = nozzleAt(Number(tk.id.slice(3)));
            if (!n) continue;
            const sc = Math.max(0.5, carL / 500);
            if ((t * 10) % 2 < 1) fx.emit('sparks', n.x, n.y, { n: 6, scale: sc * 0.6 });
            fx.emit('smoke', n.x, n.y, { n: 3, scale: sc * 0.6, angle: Math.atan2(n.ay, n.ax), spread: 0.6 });
          }
      }
      door += (doorTarget - door) * Math.min(1, dt * 3);
      hatch += (hatchTarget - hatch) * Math.min(1, dt * 2.5);
      // Robot tips toward their work (or home)
      for (const r of robots) {
        let tx = r.hx + (r.cat === 'polish' ? 0 : r.cat === 'wash' || r.cat === 'wrench' ? (r.hx < bx ? 1 : -1) * carL * 0.06 : 0);
        let ty = r.cat === 'wash' || r.cat === 'wrench' ? r.hy - carL * 0.12 : r.hy + carL * 0.08;
        if (t - r.busy < 0.6 && r.gx >= 0) {
          [tx, ty] = gridToScreen(r.gx, r.gy);
          // Several on one spot spread around it
          tx += Math.sin(r.i * 2.4) * carL * 0.025 * Math.min(1, r.i);
          ty += Math.cos(r.i * 2.4) * carL * 0.015 * Math.min(1, r.i);
        }
        r.tx += (tx - r.tx) * Math.min(1, dt * 9);
        r.ty += (ty - r.ty) * Math.min(1, dt * 9);
        // The base follows: floor robots drive below the work (a little to the side), rail arms ride above it
        if (r.cat !== 'polish') {
          const want = t - r.busy < 0.6 ? tx + (r.cat === 'wash' || r.cat === 'wrench' ? (r.i % 2 ? 1 : -1) * carL * 0.05 : -carL * 0.04) : r.hx;
          r.x += (want - r.x) * Math.min(1, dt * 2.5);
        }
      }
    },
    draw(): void {
      if (!room) bakeRoomNow();
      g.drawImage(room!, 0, 0, w, h);
      const d = doorBox(w, h, ground);
      drawDoor(g, d, door, level, t);
      drawHatch(g, false);
      cam.begin(g);
      drawReflection(g);
      if (announce >= 0 && art && car) {
        const k = (t - announce) / 2.4;
        if (k > 1) announce = -1;
        else glow(g, bx + dx + art.w / 2, by + art.h * 0.55, art.w * 0.65, RARITY[car.rarity].color, 1.2 * Math.sin(Math.PI * Math.min(1, k)));
      }
      // Robots behind the car (the ceiling ones) and in front (the floor ones)
      drawCar(g);
      drawGleam(g);
      drawLightsOn(g);
      drawPartsHints(g);
      drawDents(g);
      drawRail(g);
      for (const r of robots) drawRobot(g, r);
      fx.draw(g);
      cam.end(g);
      drawHatch(g, true);
      drawTyreBay(g);
      drawGhost(g);
      drawCoach(g);
      drawPointer(g);
      drawRestored(g);
      fx.drawScreen(g, w, h);
    },
    /** For a still screen: drop the moving effects (a results card over a still frame must not burn in) */
    clearFx(): void {
      fx.clear();
    },
    t: () => t,
    model: (): Model | null => car?.model ?? null,
  };
}

export type Scene = ReturnType<typeof createScene>;
void ROBOTS;
