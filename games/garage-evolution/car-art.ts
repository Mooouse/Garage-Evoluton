// Drawing a vehicle: its body in lit car paint (sky above the shoulder, the floor below it, a highlight on the
// shoulder line), glass, lamps, chrome and trim, wheels as their own sprites (they turn), the parts that can be missing
// as their own sprites, and the variant's livery. Everything is baked once per car at the size it is shown.

import { canvas2d, density } from '@gp/art/bake';
import { mix, shade } from '@gp/art/color';
import { glow } from '@gp/art/material';
import type { Variant } from './data.ts';
import { bounds, type Detail, type Model, type Pt, type Thruster, type VehicleShape, type Wheel } from './models.ts';
import { PAINTED } from './painted/meta.ts';
import { paintedBody, paintedImg } from './painted-art.ts';

export type Ctx = CanvasRenderingContext2D;

/** A rounded polygon with a radius per corner (in px) */
export function roundPath(pts: [number, number, number][], path = new Path2D()): Path2D {
  const n = pts.length;
  const mid = (a: [number, number, number], b: [number, number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(pts[n - 1], pts[0]);
  path.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    const m = mid(p, q);
    const o = pts[(i + n - 1) % n];
    // Never more than half of either side (a big radius on a short side makes a loop)
    const r = Math.min(p[2], Math.hypot(p[0] - o[0], p[1] - o[1]) / 2, Math.hypot(q[0] - p[0], q[1] - p[1]) / 2);
    if (r > 0.05) path.arcTo(p[0], p[1], m[0], m[1], r);
    else {
      path.lineTo(p[0], p[1]);
      path.lineTo(m[0], m[1]);
    }
  }
  path.closePath();
  return path;
}

export interface CarArt {
  model: Model;
  /** CSS px per length unit, and the bake box in CSS px */
  L: number;
  w: number;
  h: number;
  /** The box's origin in model units */
  x0: number;
  y1: number;
  /** Device px per CSS px of the bakes */
  scale: number;
  body: HTMLCanvasElement;
  /** body + wheels: what the layers are clipped to */
  silhouette: HTMLCanvasElement;
  /** Factory wheel only. No drawn or aftermarket replacements for photographed cars. */
  wheelAvailable?: (i: number) => boolean;
  /** A wheel's sprite; `rPx` draws it at another radius (the tyre bay's close-up, from the full picture) */
  wheel: (i: number, rim?: string, look?: WheelLook, rPx?: number) => HTMLCanvasElement;
  /** The missing-wheel stand-in (a hub and a jack stand) */
  hub: HTMLCanvasElement;
  parts: Partial<Record<'bumperF' | 'bumperR' | 'mirror' | 'head', { canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number }>>;
  /** The broken lamp glass (drawn while the head lamp part isn't fixed) */
  brokenHead: HTMLCanvasElement | null;
  /** Model units → px in the box */
  px: (x: number, y: number) => [number, number];
  color: string;
  variant: Variant;
}

const GLASS_TOP = '#5f7a94';
const GLASS_BOT = '#16202c';
const TIRE = '#1b1d23';
const TRIM = '#22252c';

/** Bake a vehicle for a length of L CSS px */
export function bakeCar(model: Model, color: string, variant: Variant, L: number, scale = density()): CarArt {
  if (model.painted) return bakePainted(model, color, variant, L, scale);
  const s = model.shape;
  const b = bounds(s);
  const w = Math.ceil((b.x1 - b.x0) * L);
  const h = Math.ceil((b.y1 - b.y0) * L);
  const px = (x: number, y: number): [number, number] => [(x - b.x0) * L, (b.y1 - y) * L];
  const pts = (list: Pt[]): [number, number, number][] => list.map((p) => [...px(p[0], p[1]), (p[2] ?? 0) * L]);
  const offroad = variant === 'offroad' && model.cls !== 'space' && model.cls !== 'moto';
  const wheels: Wheel[] = s.wheels.map((wh) => (offroad ? { ...wh, r: wh.r * 1.1 } : wh));

  const make = (draw: (g: Ctx) => void): HTMLCanvasElement => {
    const [c, g] = canvas2d(w * scale, h * scale);
    g.scale(scale, scale);
    draw(g);
    return c;
  };
  const bodyPath = roundPath(pts(s.body));
  const outline = shade(color, -0.55);

  const body = make((g) => {
    // The underbody between the wheels: a dark gap under the sill
    if (s.wheels.length >= 2 && model.cls !== 'moto' && model.cls !== 'space') {
      const xs = s.wheels.map((q) => q.x);
      const [ux0, uy0] = px(Math.min(...xs) - 0.02, Math.max(0.035, s.wheels[0].r * 0.7));
      const [ux1, uy1] = px(Math.max(...xs) + 0.02, 0.012);
      g.fillStyle = '#0d0f14';
      g.beginPath();
      g.roundRect(ux0, uy0, ux1 - ux0, uy1 - uy0, 4);
      g.fill();
    }
    if (s.tracks) drawTracks(g, s, px, L, color);
    for (const d of s.details) drawDetail(g, d, px, L, color, model, variant, 'back');
    paintBody(g, bodyPath, s, px, L, color, variant, model);
    for (const d of s.details) drawPaintDetail(g, d, bodyPath, s, px, L, color);
    // Windows
    for (const win of s.windows) {
      const wp = pts(win);
      drawGlass(g, roundPath(wp), L, [Math.min(...wp.map((q) => q[0])), Math.min(...wp.map((q) => q[1])), Math.max(...wp.map((q) => q[0])), Math.max(...wp.map((q) => q[1]))]);
    }
    for (const d of s.details) drawDetail(g, d, px, L, color, model, variant, 'front');
    livery(g, bodyPath, s, px, L, color, variant, model);
    // Lamps (off): the tail always, the head when it isn't a part that can be missing (drawn by parts)
    drawTail(g, s, px, L);
    g.lineJoin = 'round';
    g.strokeStyle = outline;
    g.lineWidth = Math.max(1.2, L * 0.006);
    g.stroke(bodyPath);
  });

  const silhouette = make((g) => {
    g.fillStyle = '#fff';
    g.fill(bodyPath);
    if (s.tracks) {
      const [tx0, ty0] = px(s.tracks.x0, s.tracks.h);
      const [tx1, ty1] = px(s.tracks.x1, 0);
      g.beginPath();
      g.roundRect(tx0, ty0, tx1 - tx0, ty1 - ty0, (ty1 - ty0) / 2);
      g.fill();
    }
  });

  // Wheels: one sprite per wheel size, drawn turning
  const wheelCache = new Map<string, HTMLCanvasElement>();
  const wheel = (i: number, rim?: string, look: WheelLook = 'ok', rPx?: number) => {
    const wh = wheels[i];
    const r = rPx ?? wh.r * L;
    const key = `${Math.round(r * 10)}:${rim ?? ''}:${look}`;
    let c = wheelCache.get(key);
    if (!c) {
      const size = Math.ceil(r * 2 + 4);
      const [cv, g] = canvas2d(size * scale, size * scale);
      g.scale(scale, scale);
      g.translate(size / 2, size / 2);
      drawWheel(g, r, model, variant, rim ?? defaultRim(model, variant), look);
      c = cv;
      wheelCache.set(key, c);
    }
    return c;
  };

  const hubSize = Math.ceil((s.wheels[0]?.r ?? 0.08) * L * 2 + 4);
  const [hub, hg] = canvas2d(hubSize * scale, hubSize * 1.3 * scale);
  hg.scale(scale, scale);
  drawHub(hg, hubSize, L);

  const parts: CarArt['parts'] = {};
  const partOf = (key: 'bumperF' | 'bumperR', r: [number, number, number, number]) => {
    const [x0, y0] = px(r[0], r[3]);
    const [x1, y1] = px(r[2], r[1]);
    const pw = Math.max(2, x1 - x0);
    const ph = Math.max(2, y1 - y0);
    const chrome = s.details.some((d) => d.kind === 'chrome') || variant === 'luxury';
    const [c, g] = canvas2d((pw + 2) * scale, (ph + 2) * scale);
    g.scale(scale, scale);
    g.translate(1, 1);
    const p = new Path2D();
    p.roundRect(0, 0, pw, ph, ph / 2.2);
    const gr = g.createLinearGradient(0, 0, 0, ph);
    if (chrome) {
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.45, '#aeb6c0');
      gr.addColorStop(0.55, '#5a626d');
      gr.addColorStop(1, '#c9d0d8');
    } else {
      gr.addColorStop(0, mix(color, '#ffffff', 0.25));
      gr.addColorStop(0.5, shade(color, -0.1));
      gr.addColorStop(1, shade(color, -0.45));
    }
    g.fillStyle = gr;
    g.fill(p);
    g.strokeStyle = chrome ? '#3c434c' : outline;
    g.lineWidth = 1;
    g.stroke(p);
    parts[key] = { canvas: c, x: x0 - 1, y: y0 - 1, w: pw + 2, h: ph + 2 };
  };
  if (s.bumperF) partOf('bumperF', s.bumperF);
  if (s.bumperR) partOf('bumperR', s.bumperR);
  if (s.mirror) {
    const [mx, my] = px(s.mirror[0], s.mirror[1]);
    const mw = Math.max(5, L * 0.035);
    const mh = Math.max(4, L * 0.022);
    const [c, g] = canvas2d((mw + 4) * scale, (mh + 4) * scale);
    g.scale(scale, scale);
    g.translate(2, 2);
    const p = new Path2D();
    p.roundRect(0, 0, mw, mh, mh / 2);
    const gr = g.createLinearGradient(0, 0, 0, mh);
    gr.addColorStop(0, mix(color, '#ffffff', 0.3));
    gr.addColorStop(1, shade(color, -0.35));
    g.fillStyle = gr;
    g.fill(p);
    g.strokeStyle = outline;
    g.lineWidth = 1;
    g.stroke(p);
    parts.mirror = { canvas: c, x: mx - mw * 0.2 - 2, y: my - mh - 2, w: mw + 4, h: mh + 4 };
  }
  let brokenHead: HTMLCanvasElement | null = null;
  if (s.head.kind !== 'none' && s.head.w > 0) {
    const hw = Math.max(5, s.head.w * L) + 4;
    const hh = Math.max(4, s.head.h * L) + 4;
    const [c, g] = canvas2d(hw * scale, hh * scale);
    g.scale(scale, scale);
    g.translate(hw / 2, hh / 2);
    drawHeadLamp(g, s, L, false);
    const [hx, hy] = px(s.head.x, s.head.y);
    parts.head = { canvas: c, x: hx - hw / 2, y: hy - hh / 2, w: hw, h: hh };
    const [bc, bg] = canvas2d(hw * scale, hh * scale);
    bg.scale(scale, scale);
    bg.translate(hw / 2, hh / 2);
    drawHeadLamp(bg, s, L, true);
    brokenHead = bc;
  }
  return { model, L, w, h, x0: b.x0, y1: b.y1, scale, body, silhouette, wheel, hub, parts, brokenHead, px, color, variant };
}

/**
 * A car from the owner's picture: the body (recoloured for a respray), its own wheels as turning sprites, its bumpers
 * as parts; the rim collection, a damaged tyre and the hub on its stand stay the game's own drawings. Before the
 * pictures are decoded: the silhouette in the paint colour
 */
function bakePainted(model: Model, color: string, variant: Variant, L: number, scale: number): CarArt {
  const s = model.shape;
  const meta = PAINTED[model.id];
  const b = bounds(s);
  const w = Math.ceil((b.x1 - b.x0) * L);
  const h = Math.ceil((b.y1 - b.y0) * L);
  const px = (x: number, y: number): [number, number] => [(x - b.x0) * L, (b.y1 - y) * L];
  const offroad = variant === 'offroad';
  const wheels: Wheel[] = s.wheels.map((wh) => (offroad ? { ...wh, r: wh.r * 1.1 } : wh));
  // The pictures' px per model unit, and where the body picture sits in the box
  const pxu = meta.img.w / meta.img.len;
  const k = L / pxu;
  const [ix, iy] = px(meta.img.x, meta.img.top);
  const make = (draw: (g: Ctx) => void): HTMLCanvasElement => {
    const [c, g] = canvas2d(w * scale, h * scale);
    g.scale(scale, scale);
    g.imageSmoothingQuality = 'high';
    draw(g);
    return c;
  };
  const pic = paintedBody(model.id, model.colors[0], color);
  const drawBody = (g: Ctx) => {
    if (pic) g.drawImage(pic, ix, iy, meta.img.w * k, meta.img.h * k);
    else {
      // Not decoded yet: the silhouette from the mask, in the paint
      const r = s.raster!;
      g.fillStyle = color;
      const cw = (r.w * L) / r.cols;
      const ch = (r.h * L) / r.rows;
      for (let y = 0; y < r.rows; y++)
        for (let x = 0; x < r.cols; x++) if (r.bits[y * r.cols + x]) g.fillRect(ix + x * cw, iy + y * ch, cw + 0.5, ch + 0.5);
    }

    // The exported body images are NOT all wheel-free: several still contain
    // the complete original tyre and spokes. Drawing an independent wheel on
    // top hides them until the wheel is detached, when the old tyre remains on
    // the car. Cut every axle out of the BODY texture itself, not out of the
    // scene framebuffer (which would also erase the wall behind the car).
    // Reuse the exact centre/radius used for the separate rotating wheel.
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    for (const wh of wheels) {
      const [cx, cy] = px(wh.x, wh.r + (wh.lift ?? 0));
      g.beginPath();
      g.arc(cx, cy, wh.r * L * 1.06, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    // Leave the opening genuinely transparent. In particular, do not repaint
    // it with a dark circular/semicircular stand-in: the owner's source picture
    // already carries the actual wheel arch OUTSIDE the tyre's circular cut.
    // The exposed hub and background remain visible when the tyre is removed.
  };
  // Genuine native PNG wheel cut-outs; no synthetic background circles.
  const body = make(drawBody);
  const silhouette = make((g) => {
    drawBody(g);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
  });
  // A missing factory texture may still be decoding. Request that exact sprite,
  // never substitute a generic five-spoke or aftermarket wheel while it loads.
  const wheelPicture = (i: number) => paintedImg(`${model.id}-w${meta.wheelImg?.[i] ?? i}`);
  const wheelAvailable = (i: number) => !!wheelPicture(i);
  const wheelCache = new Map<string, HTMLCanvasElement>();
  const wheel = (i: number, rim?: string, look: WheelLook = 'ok', rPx?: number) => {
    const wh = wheels[i];
    const r = rPx ?? wh.r * L;
    // Always preserve this model's original wheel; alternate catalogue
    // rims have been removed, including for restored / balanced tyres.
    const own = wheelPicture(i);
    // Two axles can have different spoke/brake images even when their radii match.
    // Including the source image in the key prevents one axle borrowing the other's
    // wheel sprite from the cache.
    const key = `${i}:${Math.round(r * 10)}:${own ? `factory${meta.wheelImg?.[i] ?? i}` : 'loading'}:${look}`;
    let c = wheelCache.get(key);
    if (!c) {
      // Room for the picture's wheel (drawn 3 % past its tyre, more on an off-roader): a canvas of 2r cut its edge square
      const size = Math.ceil(r * 2 * 1.07 + 6);
      const [cv, g] = canvas2d(size * scale, size * scale);
      g.scale(scale, scale);
      g.translate(size / 2, size / 2);
      if (own) {
        // Paint and rubber are from the original wheel WebP, not generated.
        const d = 2 * r * 1.065;
        g.imageSmoothingQuality = 'high';
        g.save();
        g.drawImage(own, -d / 2, -d / 2, d, d);
        // A bent rim stays on its axle (off it, it read as a wheel out of centre: the owner, 2026-10-17): a kink in the lip
        if (look === 'bent') bentKink(g, r);
        g.restore();
        if (look === 'bald') {
          // Worn smooth: the tread gone grey, a crack or two
          g.strokeStyle = 'rgba(108,112,122,0.85)';
          g.lineWidth = r * 0.16;
          g.beginPath();
          g.arc(0, 0, r * 0.9, 0, Math.PI * 2);
          g.stroke();
          g.strokeStyle = 'rgba(210,214,222,0.45)';
          g.lineWidth = 1;
          g.beginPath();
          g.arc(0, 0, r * 0.93, 0.4, 1.1);
          g.moveTo(Math.cos(3.6) * r * 0.9, Math.sin(3.6) * r * 0.9);
          g.arc(0, 0, r * 0.9, 3.6, 4.0);
          g.stroke();
        }
      }
      // Until the exact factory sprite arrives, leave this wheel transparent.
      // The scene skips it instead of drawing unrelated generic rims.
      c = cv;
      wheelCache.set(key, c);
    }
    return c;
  };
  const hubSize = Math.ceil((s.wheels[0]?.r ?? 0.08) * L * 2 + 4);
  const [hub, hg] = canvas2d(hubSize * scale, hubSize * 1.3 * scale);
  hg.scale(scale, scale);
  drawHub(hg, hubSize, L);
  const parts: CarArt['parts'] = {};
  for (const [key, file] of [['bumperF', 'bf'], ['bumperR', 'br']] as const) {
    const r = s[key];
    const img = paintedBody(`${model.id}-${file}`, model.colors[0], color);
    if (!r || !img) continue;
    const [x0, y0] = px(r[0], r[3]);
    const pw = img.width * k;
    const ph = img.height * k;
    const [c, g] = canvas2d(Math.ceil(pw * scale), Math.ceil(ph * scale));
    g.scale(scale, scale);
    g.drawImage(img, 0, 0, pw, ph);
    parts[key] = { canvas: c, x: x0, y: y0, w: pw, h: ph };
  }
  return { model, L, w, h, x0: b.x0, y1: b.y1, scale, body, silhouette, wheel, wheelAvailable, hub, parts, brokenHead: null, px, color, variant };
}

/** Wheel centres in box px (with the off-road lift) */
export function wheelAt(art: CarArt, i: number): [number, number, number] {
  const s = art.model.shape;
  const wh = s.wheels[i];
  const r = wh.r * (art.variant === 'offroad' && art.model.cls !== 'space' && art.model.cls !== 'moto' ? 1.1 : 1);
  const [x, y] = art.px(wh.x, r + (wh.lift ?? 0));
  return [x, y, r * art.L];
}

function paintBody(g: Ctx, path: Path2D, s: VehicleShape, px: (x: number, y: number) => [number, number], L: number, color: string, variant: Variant, model: Model): void {
  const belt = s.windows.length ? Math.min(...s.windows.flat().map((p) => p[1])) - 0.012 : s.height * 0.62;
  const [, yTop] = px(0, s.height + 0.02);
  const [, yBelt] = px(0, belt);
  const [, yGround] = px(0, 0);
  g.save();
  g.clip(path);
  // The car paint: the sky reflected above the shoulder, a crisp horizon, the floor below
  const gr = g.createLinearGradient(0, yTop, 0, yGround);
  const span = Math.max(1, yGround - yTop);
  const at = (y: number) => Math.max(0, Math.min(1, (y - yTop) / span));
  const sky = mix(color, '#e8f4ff', 0.42);
  const top = mix(color, '#ffffff', 0.18);
  gr.addColorStop(0, sky);
  gr.addColorStop(at(yBelt) * 0.7, top);
  gr.addColorStop(Math.max(0, at(yBelt) - 0.015), mix(color, '#ffffff', 0.32));
  gr.addColorStop(at(yBelt) + 0.005, shade(color, 0.02));
  gr.addColorStop(Math.min(1, at(yBelt) + 0.28), color);
  gr.addColorStop(0.86, shade(color, -0.32));
  gr.addColorStop(1, shade(color, -0.55));
  g.fillStyle = gr;
  g.fill(path);
  // Luxury and police: a two-tone lower body
  if (variant === 'luxury' || variant === 'police') {
    const lower = variant === 'police' ? '#f4f6f8' : shade(color, -0.45);
    const [, yl] = px(0, belt - 0.045);
    const lg = g.createLinearGradient(0, yl, 0, yGround);
    lg.addColorStop(0, mix(lower, '#ffffff', 0.15));
    lg.addColorStop(0.7, lower);
    lg.addColorStop(1, shade(lower, -0.45));
    g.fillStyle = lg;
    if (variant === 'police') {
      const [x0] = px(0.3, 0);
      const [x1] = px(0.7, 0);
      g.fillRect(x0, yl, x1 - x0, yGround - yl);
    } else g.fillRect(0, yl, 9999, yGround - yl);
  }
  // The shoulder's highlight: a soft streak along the belt line
  const [hx0] = px(0.05, 0);
  const [hx1] = px(0.95, 0);
  const hl = g.createLinearGradient(0, yBelt - L * 0.03, 0, yBelt + L * 0.012);
  hl.addColorStop(0, 'rgba(255,255,255,0)');
  hl.addColorStop(0.75, 'rgba(255,255,255,0.4)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hl;
  g.fillRect(hx0, yBelt - L * 0.03, hx1 - hx0, L * 0.042);
  // A long specular glint on the upper side, toward the key light (up-left)
  const sg = g.createRadialGradient(px(0.32, 0)[0], yBelt - L * 0.01, 1, px(0.32, 0)[0], yBelt - L * 0.01, L * 0.22);
  sg.addColorStop(0, 'rgba(255,255,255,0.35)');
  sg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sg;
  g.fillRect(0, yTop, 9999, yGround - yTop);
  // Darker toward the rocker and in the arches (ambient occlusion)
  for (const wh of s.wheels) {
    const [ax, ay] = px(wh.x, wh.r + (wh.lift ?? 0));
    const ao = g.createRadialGradient(ax, ay, wh.r * L * 1.05, ax, ay, wh.r * L * 1.6);
    ao.addColorStop(0, 'rgba(10,12,20,0.45)');
    ao.addColorStop(1, 'rgba(10,12,20,0)');
    g.fillStyle = ao;
    g.fillRect(ax - wh.r * L * 2, ay - wh.r * L * 2, wh.r * L * 4, wh.r * L * 4);
  }
  // Space and machines: panel seams; everything: a faint metallic flake
  if (model.cls === 'space' && model.id !== 'unknown') {
    g.strokeStyle = 'rgba(30,40,60,0.25)';
    g.lineWidth = 1;
    for (let x = 0.08; x < 1; x += 0.08) {
      const [lx] = px(x, 0);
      g.beginPath();
      g.moveTo(lx, yTop);
      g.lineTo(lx, yGround);
      g.stroke();
    }
  }
  g.restore();
}

function drawGlass(g: Ctx, p: Path2D, L: number, box: [number, number, number, number]): void {
  g.save();
  g.clip(p);
  const gr = g.createLinearGradient(0, box[1], 0, box[3]);
  gr.addColorStop(0, GLASS_TOP);
  gr.addColorStop(0.55, '#2b3c50');
  gr.addColorStop(1, GLASS_BOT);
  g.fillStyle = gr;
  g.fillRect(box[0] - 2, box[1] - 2, box[2] - box[0] + 4, box[3] - box[1] + 4);
  // Two diagonal reflections
  g.fillStyle = 'rgba(220,240,255,0.22)';
  const hgt = box[3] - box[1];
  for (const [o, wdt] of [[0.18, 0.12], [0.42, 0.05]]) {
    const x = box[0] + (box[2] - box[0]) * o;
    g.beginPath();
    g.moveTo(x, box[3] + 2);
    g.lineTo(x + hgt * 0.7, box[1] - 2);
    g.lineTo(x + hgt * 0.7 + L * wdt, box[1] - 2);
    g.lineTo(x + L * wdt, box[3] + 2);
    g.fill();
  }
  g.restore();
  g.strokeStyle = TRIM;
  g.lineWidth = Math.max(1, L * 0.006);
  g.stroke(p);
}

function drawTail(g: Ctx, s: VehicleShape, px: (x: number, y: number) => [number, number], L: number): void {
  if (s.tail.w <= 0) return;
  const [x, y] = px(s.tail.x, s.tail.y);
  const tw = s.tail.w * L;
  const th = s.tail.h * L;
  const gr = g.createLinearGradient(0, y - th / 2, 0, y + th / 2);
  gr.addColorStop(0, '#ff8a7a');
  gr.addColorStop(0.5, '#d4231c');
  gr.addColorStop(1, '#6e0f0c');
  g.fillStyle = gr;
  g.beginPath();
  g.roundRect(x - tw / 2, y - th / 2, tw, th, Math.min(tw, th) * 0.25);
  g.fill();
  g.strokeStyle = '#3a0c0a';
  g.lineWidth = 1;
  g.stroke();
}

/** The head lamp, centred at 0,0 (off, or broken: cracked and dark) */
export function drawHeadLamp(g: Ctx, s: VehicleShape, L: number, broken: boolean): void {
  const k = s.head.kind;
  const hw = Math.max(4, s.head.w * L);
  const hh = Math.max(3, s.head.h * L);
  g.save();
  if (k === 'popup') {
    // A closed pop-up lid: a body-coloured slit with a dark edge
    g.fillStyle = TRIM;
    g.fillRect(-hw / 2, -hh / 2, hw, hh);
    g.restore();
    return;
  }
  const lens = (cx: number, cy: number, rw: number, rh: number, round: boolean) => {
    const p = new Path2D();
    if (round) p.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2);
    else p.roundRect(cx - rw / 2, cy - rh / 2, rw, rh, Math.min(rw, rh) * 0.3);
    const gr = g.createRadialGradient(cx - rw * 0.15, cy - rh * 0.2, 0.5, cx, cy, Math.max(rw, rh) * 0.7);
    if (broken) {
      gr.addColorStop(0, '#5a5e66');
      gr.addColorStop(1, '#1e2026');
    } else {
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.35, '#f3f1e6');
      gr.addColorStop(1, '#a9b2bd');
    }
    g.fillStyle = gr;
    g.fill(p);
    g.strokeStyle = broken ? '#111' : '#cfd6de';
    g.lineWidth = Math.max(1, Math.min(rw, rh) * 0.14);
    g.stroke(p);
    if (broken) {
      g.strokeStyle = 'rgba(230,236,245,0.85)';
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(cx - rw * 0.4, cy - rh * 0.3);
      g.lineTo(cx + rw * 0.05, cy + rh * 0.05);
      g.lineTo(cx + rw * 0.4, cy - rh * 0.35);
      g.moveTo(cx + rw * 0.05, cy + rh * 0.05);
      g.lineTo(cx - rw * 0.1, cy + rh * 0.45);
      g.stroke();
    }
  };
  if (k === 'dual') {
    lens(-hw * 0.28, 0, hw * 0.48, hh, true);
    lens(hw * 0.28, 0, hw * 0.48, hh, true);
  } else lens(0, 0, hw, hh, k === 'round');
  g.restore();
}

/** The rim a vehicle wears by default (its variant and class), before a wheel job fits a new one */
export function defaultRim(model: Model, variant: Variant): string {
  if (variant === 'limited') return 'gold';
  if (variant === 'racing' && model.cls !== 'moto') return 'racing';
  if (variant === 'luxury' && model.cls !== 'heavy') return 'chrome';
  if (model.rim) return model.rim;
  if (model.cls === 'moto') return 'spoke';
  if (variant === 'offroad' || model.cls === 'heavy') return 'steel';
  return 'classic';
}

export type WheelLook = 'ok' | 'flat' | 'bald' | 'bent';

/**
 * A wheel at 0,0 of radius r: the tyre (lit sidewall, tread blocks that show it turning — a bald one has none), and the
 * rim of a style (the album's rim row: steel, classic, mesh, spoke, chrome, racing, turbine, gold). A bent rim is drawn
 * off-centre; a flat tyre's sag is drawn by the scene (it doesn't turn with the wheel).
 */
export function drawWheel(g: Ctx, r: number, model: Model, variant: Variant, rimId = defaultRim(model, variant), look: WheelLook = 'ok'): void {
  const tire = g.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.2, 0, 0, r);
  tire.addColorStop(0, look === 'bald' ? '#5a5d66' : '#454852');
  tire.addColorStop(0.75, look === 'bald' ? '#3a3c43' : '#2a2c33');
  tire.addColorStop(1, TIRE);
  g.fillStyle = tire;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  if (rimId === 'chrome' && model.cls !== 'heavy') {
    // A white wall
    g.strokeStyle = '#eef0f2';
    g.lineWidth = r * 0.1;
    g.beginPath();
    g.arc(0, 0, r * 0.75, 0, Math.PI * 2);
    g.stroke();
  }
  if (look !== 'bald') {
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = Math.max(1, r * 0.06);
    const n = model.cls === 'heavy' ? 14 : 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
      g.lineTo(Math.cos(a) * r * 0.99, Math.sin(a) * r * 0.99);
      g.stroke();
    }
  } else {
    // Worn smooth, with a crack or two
    g.strokeStyle = 'rgba(200,205,215,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, r * 0.93, 0.4, 1.1);
    g.moveTo(Math.cos(3.6) * r * 0.9, Math.sin(3.6) * r * 0.9);
    g.arc(0, 0, r * 0.9, 3.6, 4.0);
    g.stroke();
  }
  g.save();
  drawRim(g, r * (model.cls === 'heavy' ? 0.55 : model.cls === 'moto' ? 0.8 : 0.62), rimId, model);
  g.restore();
  if (look === 'bent') bentKink(g, r * (model.cls === 'heavy' ? 0.85 : 1));
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = Math.max(1, r * 0.06);
  g.beginPath();
  g.arc(0, 0, r * 0.95, -2.6, -1.7);
  g.stroke();
}

/** A rim of a style, radius rr, at 0,0 */
export function drawRim(g: Ctx, rr: number, rimId: string, model?: Model): void {
  const disc = (stops: [number, string][]) => {
    const gr = g.createLinearGradient(-rr, -rr, rr, rr);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, rr, 0, Math.PI * 2);
    g.fill();
  };
  const holes = (n: number, inner: number, outer: number, width: number, color = '#16181d', twist = 0) => {
    g.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const a1 = a + (Math.PI / n) * width;
      g.beginPath();
      g.moveTo(Math.cos(a) * rr * inner, Math.sin(a) * rr * inner);
      g.lineTo(Math.cos(a + twist) * rr * outer, Math.sin(a + twist) * rr * outer);
      g.arc(0, 0, rr * outer, a + twist, a1 + twist);
      g.lineTo(Math.cos(a1) * rr * inner, Math.sin(a1) * rr * inner);
      g.closePath();
      g.fill();
    }
  };
  const cap = (c: string) => {
    g.fillStyle = c;
    g.beginPath();
    g.arc(0, 0, rr * 0.22, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 0.8;
    g.stroke();
  };
  const heavy = model?.cls === 'heavy';
  switch (rimId) {
    case 'steel': {
      disc(heavy ? [[0, '#ffe27a'], [1, '#b07a12']] : [[0, '#6a6f7a'], [1, '#22252b']]);
      g.fillStyle = '#121418';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.beginPath();
        g.arc(Math.cos(a) * rr * 0.6, Math.sin(a) * rr * 0.6, rr * 0.13, 0, Math.PI * 2);
        g.fill();
      }
      cap('#9aa1ab');
      break;
    }
    case 'mesh': {
      disc([[0, '#ffffff'], [0.5, '#c9d0d8'], [1, '#6b7280']]);
      g.strokeStyle = '#3a3f46';
      g.lineWidth = Math.max(0.6, rr * 0.035);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.beginPath();
        g.moveTo(Math.cos(a) * rr * 0.25, Math.sin(a) * rr * 0.25);
        g.lineTo(Math.cos(a + 0.7) * rr * 0.9, Math.sin(a + 0.7) * rr * 0.9);
        g.moveTo(Math.cos(a) * rr * 0.25, Math.sin(a) * rr * 0.25);
        g.lineTo(Math.cos(a - 0.7) * rr * 0.9, Math.sin(a - 0.7) * rr * 0.9);
        g.stroke();
      }
      cap('#e6eaef');
      break;
    }
    case 'spoke': {
      g.fillStyle = '#2a2c33';
      g.beginPath();
      g.arc(0, 0, rr, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#d8dee6';
      g.lineWidth = Math.max(0.6, rr * 0.03);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        g.beginPath();
        g.moveTo(Math.cos(a + 0.4) * rr * 0.18, Math.sin(a + 0.4) * rr * 0.18);
        g.lineTo(Math.cos(a) * rr * 0.92, Math.sin(a) * rr * 0.92);
        g.stroke();
      }
      g.strokeStyle = '#c9d0d8';
      g.lineWidth = Math.max(1, rr * 0.1);
      g.beginPath();
      g.arc(0, 0, rr * 0.93, 0, Math.PI * 2);
      g.stroke();
      cap('#e6eaef');
      break;
    }
    case 'chrome': {
      disc([[0, '#ffffff'], [0.45, '#dfe6ee'], [0.5, '#7a828c'], [1, '#f4f7fa']]);
      holes(6, 0.34, 0.86, 0.45);
      cap('#ffffff');
      break;
    }
    case 'racing': {
      disc([[0, '#4a4e57'], [1, '#121418']]);
      holes(10, 0.3, 0.84, 0.5, '#050608');
      g.strokeStyle = '#e0402e';
      g.lineWidth = Math.max(1, rr * 0.08);
      g.beginPath();
      g.arc(0, 0, rr * 0.95, 0, Math.PI * 2);
      g.stroke();
      cap('#e0402e');
      break;
    }
    case 'turbine': {
      disc([[0, '#ffffff'], [1, '#9aa1ab']]);
      g.fillStyle = '#3a3f46';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.beginPath();
        g.moveTo(Math.cos(a) * rr * 0.3, Math.sin(a) * rr * 0.3);
        g.quadraticCurveTo(Math.cos(a + 0.5) * rr * 0.7, Math.sin(a + 0.5) * rr * 0.7, Math.cos(a + 0.75) * rr * 0.9, Math.sin(a + 0.75) * rr * 0.9);
        g.lineTo(Math.cos(a + 0.95) * rr * 0.9, Math.sin(a + 0.95) * rr * 0.9);
        g.quadraticCurveTo(Math.cos(a + 0.6) * rr * 0.6, Math.sin(a + 0.6) * rr * 0.6, Math.cos(a + 0.2) * rr * 0.3, Math.sin(a + 0.2) * rr * 0.3);
        g.fill();
      }
      cap('#5ff6ff');
      break;
    }
    case 'gold': {
      disc([[0, '#fff2b8'], [0.5, '#d9a531'], [1, '#7a5512']]);
      holes(5, 0.32, 0.86, 0.55);
      cap('#ffe27a');
      break;
    }
    default: {
      // classic: a silver five-spoke
      disc([[0, '#ffffff'], [0.5, '#b9c0c9'], [1, '#5d646e']]);
      holes(heavy ? 8 : 5, 0.32, 0.86, 0.55);
      cap('#e6eaef');
    }
  }
}

function drawHub(g: Ctx, size: number, L: number): void {
  const r = size / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  // The jack stand under the hub
  g.fillStyle = '#c0392b';
  g.beginPath();
  g.moveTo(cx - r * 0.55, cy + r * 1.25);
  g.lineTo(cx - r * 0.12, cy + r * 0.15);
  g.lineTo(cx + r * 0.12, cy + r * 0.15);
  g.lineTo(cx + r * 0.55, cy + r * 1.25);
  g.closePath();
  g.fill();
  g.strokeStyle = '#5a1810';
  g.lineWidth = 1;
  g.stroke();
  // The brake disc and the hub
  const d = g.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 1, cx, cy, r * 0.55);
  d.addColorStop(0, '#d8dde3');
  d.addColorStop(1, '#6b7079');
  g.fillStyle = d;
  g.beginPath();
  g.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#c96a1e';
  g.fillRect(cx - r * 0.62, cy - r * 0.2, r * 0.22, r * 0.4);
  g.fillStyle = '#3a3d44';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.beginPath();
    g.arc(cx + Math.cos(a) * r * 0.25, cy + Math.sin(a) * r * 0.25, Math.max(1, r * 0.06), 0, Math.PI * 2);
    g.fill();
  }
  void L;
}

function drawTracks(g: Ctx, s: VehicleShape, px: (x: number, y: number) => [number, number], L: number, color: string): void {
  const t = s.tracks!;
  const [x0, y0] = px(t.x0, t.h);
  const [x1, y1] = px(t.x1, 0);
  const hgt = y1 - y0;
  const p = new Path2D();
  p.roundRect(x0, y0, x1 - x0, hgt, hgt / 2);
  g.fillStyle = '#23252b';
  g.fill(p);
  g.save();
  g.clip(p);
  g.strokeStyle = '#3c4049';
  g.lineWidth = Math.max(1, L * 0.012);
  for (let x = x0; x < x1; x += L * 0.035) {
    g.beginPath();
    g.moveTo(x, y0);
    g.lineTo(x, y0 + hgt * 0.16);
    g.moveTo(x, y1 - hgt * 0.16);
    g.lineTo(x, y1);
    g.stroke();
  }
  g.restore();
  g.fillStyle = '#121317';
  g.beginPath();
  g.roundRect(x0 + hgt * 0.18, y0 + hgt * 0.2, x1 - x0 - hgt * 0.36, hgt * 0.6, hgt * 0.3);
  g.fill();
  void color;
}

/** Details that are part of the paint (drawn over the body, under the glass): a two-tone, a swoosh, arch flares */
function drawPaintDetail(g: Ctx, d: Detail, path: Path2D, s: VehicleShape, px: (x: number, y: number) => [number, number], L: number, color: string): void {
  if (d.kind === 'tone' && d.pts) {
    // A two-tone split along a line of its own (the hypercar's colour split)
    g.save();
    g.clip(path);
    g.fillStyle = d.color ?? '#1c1f2a';
    g.beginPath();
    d.pts.forEach((p, i) => (i ? g.lineTo(...px(p[0], p[1])) : g.moveTo(...px(p[0], p[1]))));
    g.closePath();
    g.fill();
    g.restore();
  } else if (d.kind === 'tone') {
    const [x0, y] = px(-0.2, d.y!);
    const [x1] = px(1.2, 0);
    g.save();
    g.clip(path);
    const tall = s.height * L * 1.2;
    const top = (d.h ?? 1) > 0;
    const c = d.color ?? '#f4f1ea';
    const gr = g.createLinearGradient(0, top ? y - tall : y, 0, top ? y : y + tall);
    gr.addColorStop(0, top ? shade(c, 0.08) : shade(c, -0.05));
    gr.addColorStop(1, top ? shade(c, -0.08) : shade(c, -0.3));
    g.fillStyle = gr;
    g.fillRect(x0, top ? y - tall : y, x1 - x0, tall);
    g.restore();
  } else if (d.kind === 'swoosh') {
    const H = s.height;
    const pt = (x: number, y: number) => px(x, y);
    g.save();
    g.clip(path);
    g.fillStyle = d.color ?? shade(color, -0.4);
    g.beginPath();
    g.moveTo(...pt(1.02, H * 0.38));
    g.bezierCurveTo(...pt(0.7, H * 0.36), ...pt(0.45, H * 0.62), ...pt(-0.02, H * 0.6));
    g.lineTo(...pt(-0.02, H * 0.5));
    g.bezierCurveTo(...pt(0.42, H * 0.52), ...pt(0.66, H * 0.27), ...pt(1.02, H * 0.28));
    g.closePath();
    g.fill();
    g.fillStyle = shade(d.color ?? color, 0.35);
    g.globalAlpha = 0.7;
    g.beginPath();
    g.moveTo(...pt(1.02, H * 0.25));
    g.bezierCurveTo(...pt(0.66, H * 0.24), ...pt(0.42, H * 0.49), ...pt(-0.02, H * 0.47));
    g.lineTo(...pt(-0.02, H * 0.45));
    g.bezierCurveTo(...pt(0.42, H * 0.47), ...pt(0.66, H * 0.22), ...pt(1.02, H * 0.23));
    g.closePath();
    g.fill();
    g.restore();
  } else if (d.kind === 'flare') {
    g.strokeStyle = '#2a2d33';
    g.lineCap = 'round';
    for (const w of s.wheels) {
      const [cx, cy] = px(w.x, w.r);
      const r = w.r * L;
      g.lineWidth = r * 0.22;
      g.beginPath();
      g.arc(cx, cy, r * 1.18, Math.PI * 1.08, Math.PI * 1.92);
      g.stroke();
    }
    g.lineCap = 'butt';
  }
}

function drawDetail(g: Ctx, d: Detail, px: (x: number, y: number) => [number, number], L: number, color: string, model: Model, variant: Variant, layer: 'back' | 'front'): void {
  const back = d.kind === 'boom' || d.kind === 'blade' || d.kind === 'spare' || d.kind === 'dish' || d.kind === 'bar' || d.kind === 'engine';
  if ((layer === 'back') !== back) return;
  const rect = () => {
    const [x, y] = px(d.x!, d.y! + (d.h ?? 0));
    return [x, y, (d.w ?? 0) * L, (d.h ?? 0) * L] as const;
  };
  const line = (w = 1, c = 'rgba(15,18,26,0.55)') => {
    g.strokeStyle = c;
    g.lineWidth = w;
    g.beginPath();
    d.pts!.forEach((p, i) => {
      const [x, y] = px(p[0], p[1]);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.stroke();
  };
  switch (d.kind) {
    case 'line': {
      line(Math.max(1, L * 0.004));
      g.save();
      g.translate(1, 0);
      line(Math.max(0.6, L * 0.003), 'rgba(255,255,255,0.18)');
      g.restore();
      break;
    }
    case 'bar': {
      g.lineCap = 'round';
      line(Math.max(2, L * 0.022), '#8d949e');
      line(Math.max(1, L * 0.008), '#dfe4ea');
      break;
    }
    case 'engine': {
      const [x, y, w, h] = rect();
      const gr = g.createLinearGradient(x, y, x + w, y + h);
      gr.addColorStop(0, '#9aa1ab');
      gr.addColorStop(1, '#3a3e46');
      g.fillStyle = gr;
      g.beginPath();
      g.roundRect(x, y, w, h, 4);
      g.fill();
      g.strokeStyle = '#1b1d22';
      g.lineWidth = 1;
      for (let xx = x + w * 0.15; xx < x + w; xx += w * 0.18) {
        g.beginPath();
        g.moveTo(xx, y + 2);
        g.lineTo(xx, y + h * 0.6);
        g.stroke();
      }
      break;
    }
    case 'grille': {
      const [x, y, w, h] = rect();
      g.fillStyle = '#15171c';
      g.beginPath();
      g.roundRect(x, y, w, h, 2);
      g.fill();
      g.strokeStyle = '#8d949e';
      g.lineWidth = 1;
      for (let yy = y + 2; yy < y + h - 1; yy += Math.max(2.5, h / 6)) {
        g.beginPath();
        g.moveTo(x + 1, yy);
        g.lineTo(x + w - 1, yy);
        g.stroke();
      }
      break;
    }
    case 'stripe': {
      const [x, y, w, h] = rect();
      g.fillStyle = d.color ?? (variant === 'racing' ? '#ffffff' : mix(shade(color, -0.5), '#ffffff', 0.15));
      g.globalAlpha = 0.85;
      g.fillRect(x, y, w, h);
      g.globalAlpha = 1;
      break;
    }
    case 'dark': {
      const [x, y, w, h] = rect();
      g.fillStyle = TRIM;
      g.beginPath();
      g.roundRect(x, y, w, h, Math.min(w, h) / 2);
      g.fill();
      break;
    }
    case 'light': {
      const [x, y, w, h] = rect();
      g.fillStyle = model.cls === 'sport' ? '#9be7ff' : '#ffe9a8';
      g.fillRect(x, y, w, Math.max(1.5, h));
      break;
    }
    case 'vent': {
      const [x, y, w, h] = rect();
      g.fillStyle = '#121418';
      g.beginPath();
      g.roundRect(x, y, w, Math.max(2, h), 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.lineWidth = 1;
      for (let xx = x + 3; xx < x + w - 2; xx += 4) {
        g.beginPath();
        g.moveTo(xx, y + 1);
        g.lineTo(xx, y + Math.max(2, h) - 1);
        g.stroke();
      }
      break;
    }
    case 'exhaust': {
      const [x, y] = px(d.x!, d.y!);
      const r = Math.max(2, L * 0.01);
      g.fillStyle = '#9aa1ab';
      g.beginPath();
      g.roundRect(x - r * 2.5, y - r, r * 3, r * 2, r);
      g.fill();
      g.fillStyle = '#1a1c21';
      g.beginPath();
      g.arc(x - r * 2.2, y, r * 0.6, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'lightbar': {
      const [x, y, w, h] = rect();
      const hh = Math.max(3, h);
      g.fillStyle = '#2a2d34';
      g.fillRect(x, y + hh * 0.4, w, hh * 0.6);
      const amber = model.id === 'hook' || model.id === 'snowcat';
      g.fillStyle = amber ? '#ffb02e' : '#e8322b';
      g.fillRect(x, y, w / 2, hh * 0.7);
      g.fillStyle = amber ? '#ffd166' : '#2f6fe8';
      g.fillRect(x + w / 2, y, w / 2, hh * 0.7);
      break;
    }
    case 'ladder': {
      const [x, y, w, h] = rect();
      g.strokeStyle = '#c9d0d8';
      g.lineWidth = Math.max(1, h * 0.18);
      g.strokeRect(x, y, w, h);
      for (let xx = x + h; xx < x + w; xx += h * 1.1) {
        g.beginPath();
        g.moveTo(xx, y);
        g.lineTo(xx, y + h);
        g.stroke();
      }
      break;
    }
    case 'rack': {
      const [x, y, w, h] = rect();
      g.fillStyle = '#1f2228';
      g.fillRect(x, y, w, Math.max(2, h));
      for (let xx = x; xx <= x + w; xx += w / 4) g.fillRect(xx - 1, y, 2, Math.max(4, h * 2.2));
      break;
    }
    case 'spare': {
      const [x, y, w, h] = rect();
      const r = Math.min(w, h) / 2;
      g.fillStyle = TIRE;
      g.beginPath();
      g.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#8d949e';
      g.beginPath();
      g.arc(x + w / 2, y + h / 2, r * 0.5, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'spoiler':
    case 'blade':
    case 'boom': {
      const pts = d.pts!.map((p): [number, number, number] => [...px(p[0], p[1]), 2]);
      const p = roundPath(pts);
      const base = d.kind === 'blade' ? '#8d949e' : d.kind === 'boom' ? (model.cls === 'heavy' ? '#f2c22e' : '#c9ccd1') : model.cls === 'space' ? shade(color, -0.2) : variant === 'racing' ? '#1c1c24' : shade(color, -0.12);
      const box = pts.reduce((a, q) => [Math.min(a[0], q[0]), Math.min(a[1], q[1]), Math.max(a[2], q[0]), Math.max(a[3], q[1])], [Infinity, Infinity, -Infinity, -Infinity]);
      const gr = g.createLinearGradient(0, box[1], 0, box[3]);
      gr.addColorStop(0, mix(base, '#ffffff', 0.3));
      gr.addColorStop(1, shade(base, -0.4));
      g.fillStyle = gr;
      g.fill(p);
      g.strokeStyle = shade(base, -0.6);
      g.lineWidth = 1;
      g.stroke(p);
      if (d.kind === 'boom' && model.cls !== 'space') {
        // A lattice
        g.save();
        g.clip(p);
        g.strokeStyle = 'rgba(40,30,10,0.4)';
        for (let x = box[0]; x < box[2]; x += 7) {
          g.beginPath();
          g.moveTo(x, box[3]);
          g.lineTo(x + (box[3] - box[1]), box[1]);
          g.stroke();
        }
        g.restore();
      }
      break;
    }
    case 'dish': {
      const [x, y, w, h] = rect();
      g.fillStyle = '#eef3f8';
      g.beginPath();
      g.ellipse(x + w / 2, y + h / 2, w / 2, h / 4, -0.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#8d949e';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x + w / 2, y + h / 2);
      g.lineTo(x + w / 2 + w * 0.1, y + h * 1.1);
      g.stroke();
      break;
    }
    case 'panel': {
      const [x, y, w, h] = rect();
      g.strokeStyle = 'rgba(15,18,26,0.35)';
      g.lineWidth = Math.max(1, L * 0.003);
      g.beginPath();
      g.roundRect(x, y, w, h, 3);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.15)';
      g.beginPath();
      g.roundRect(x + 1, y + 1, w, h, 3);
      g.stroke();
      break;
    }
    case 'number': {
      const [x, y, w, h] = rect();
      g.fillStyle = '#f4f6f8';
      g.beginPath();
      g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1c1c24';
      g.font = `900 ${Math.max(6, h * 0.62)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(7 + (model.id.length % 20)), x + w / 2, y + h / 2 + 0.5);
      break;
    }
    case 'glyph': {
      const [x, y, w, h] = rect();
      g.strokeStyle = '#3fffd8';
      g.lineWidth = Math.max(1, L * 0.006);
      g.shadowColor = '#3fffd8';
      g.shadowBlur = 8;
      g.beginPath();
      g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      g.moveTo(x + w * 0.2, y + h / 2);
      g.lineTo(x + w * 0.8, y + h / 2);
      g.moveTo(x + w / 2, y + h * 0.1);
      g.lineTo(x + w / 2, y + h * 0.9);
      g.stroke();
      g.beginPath();
      g.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.18, 0, Math.PI * 2);
      g.stroke();
      g.shadowBlur = 0;
      break;
    }
    case 'flame': {
      const [x, y, w, h] = rect();
      g.fillStyle = '#3a3d44';
      g.beginPath();
      g.roundRect(x, y, w, h, 2);
      g.fill();
      g.fillStyle = '#16181d';
      g.beginPath();
      g.ellipse(x + w * 0.2, y + h / 2, w * 0.25, h * 0.38, 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'trim': {
      g.lineCap = 'round';
      line(Math.max(1.4, L * 0.007), 'rgba(20,22,28,0.55)');
      g.save();
      g.translate(0, -Math.max(0.6, L * 0.002));
      line(Math.max(1, L * 0.004), '#e4e8ee');
      g.restore();
      g.lineCap = 'butt';
      break;
    }
    case 'curve': {
      g.lineCap = 'round';
      // A polished sweep (the hypercar's C-line): dark edge, bright metal, a highlight
      line(Math.max(3, L * 0.016), shade(color, -0.6));
      line(Math.max(2, L * 0.01), d.color ?? '#d9dee5');
      g.save();
      g.translate(-Math.max(0.6, L * 0.002), -Math.max(0.6, L * 0.002));
      line(Math.max(1, L * 0.003), 'rgba(255,255,255,0.8)');
      g.restore();
      g.lineCap = 'butt';
      break;
    }
    case 'seat': {
      const [x, y, w, h] = rect();
      const gr = g.createLinearGradient(x, y, x + w, y);
      gr.addColorStop(0, '#5a3d2c');
      gr.addColorStop(1, '#2b1d15');
      g.fillStyle = gr;
      g.beginPath();
      g.roundRect(x, y, w, h, Math.min(w, h) * 0.35);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(x + w * 0.15, y + h * 0.12, w * 0.12, h * 0.6);
      break;
    }
    case 'dome': {
      const [cx, cy] = px(d.x!, d.y!);
      const rw = ((d.w ?? 0.1) * L) / 2;
      const rh = (d.h ?? 0.05) * L;
      const gr = g.createLinearGradient(cx - rw, cy - rh, cx + rw, cy);
      gr.addColorStop(0, shade(color, 0.2));
      gr.addColorStop(1, shade(color, -0.3));
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(cx, cy, rw, rh, 0, Math.PI, 0);
      g.closePath();
      g.fill();
      g.strokeStyle = shade(color, -0.55);
      g.lineWidth = Math.max(1, L * 0.004);
      g.stroke();
      g.fillStyle = '#1c1f25';
      g.fillRect(cx - rw * 0.5, cy - rh * 0.55, rw, Math.max(1.5, rh * 0.18));
      break;
    }
    case 'tone':
    case 'swoosh':
    case 'flare':
    case 'chrome':
      break;
  }
}

/** The variant's livery over the paint */
function livery(g: Ctx, path: Path2D, s: VehicleShape, px: (x: number, y: number) => [number, number], L: number, color: string, variant: Variant, model: Model): void {
  if (model.cls === 'space' && variant !== 'limited') return;
  g.save();
  g.clip(path);
  const belt = s.windows.length ? Math.min(...s.windows.flat().map((p) => p[1])) - 0.012 : s.height * 0.62;
  const [, yb] = px(0, belt);
  const [x0] = px(0, 0);
  const [x1] = px(1, 0);
  if (variant === 'racing') {
    const [, ys] = px(0, belt - 0.07);
    g.fillStyle = '#ffffff';
    g.globalAlpha = 0.9;
    g.fillRect(x0, ys, x1 - x0, L * 0.012);
    g.fillRect(x0, ys + L * 0.02, x1 - x0, L * 0.012);
    g.globalAlpha = 1;
    const [nx, ny] = px(0.5, (belt + s.wheels[0]?.r * 1.6 || 0.15) / 2);
    g.fillStyle = '#f4f6f8';
    g.beginPath();
    g.arc(nx, ny, L * 0.035, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1c1c24';
    g.font = `900 ${Math.round(L * 0.045)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(3 + (model.name.length % 60)), nx, ny + 0.5);
  } else if (variant === 'police') {
    g.fillStyle = '#2f6fe8';
    const [, ys] = px(0, belt - 0.06);
    g.fillRect(x0, ys, x1 - x0, L * 0.01);
  } else if (variant === 'luxury') {
    g.fillStyle = 'rgba(255,255,255,0.75)';
    const [, ys] = px(0, belt - 0.04);
    g.fillRect(x0, ys, x1 - x0, Math.max(1, L * 0.004));
  } else if (variant === 'limited') {
    g.strokeStyle = '#f2c94c';
    g.lineWidth = Math.max(1, L * 0.004);
    const [, ys] = px(0, belt - 0.025);
    g.beginPath();
    g.moveTo(x0, ys);
    g.lineTo(x1, ys);
    g.stroke();
  } else if (variant === 'prototype') {
    // A black-and-white camouflage wrap
    let seed = model.id.length * 97;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(20,22,28,0.8)' : 'rgba(240,242,246,0.75)';
      const cx = x0 + r() * (x1 - x0);
      const cy = yb - L * 0.15 + r() * L * 0.35;
      g.beginPath();
      g.ellipse(cx, cy, L * (0.02 + r() * 0.04), L * (0.01 + r() * 0.025), r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  } else if (variant === 'offroad') {
    // Black arch flares
    g.restore();
    g.save();
    g.strokeStyle = '#1b1d22';
    g.lineWidth = Math.max(2, L * 0.016);
    for (const wh of s.wheels) {
      const [ax, ay] = px(wh.x, wh.r * 1.1 + (wh.lift ?? 0));
      g.beginPath();
      g.arc(ax, ay, wh.r * L * 1.3, Math.PI * 1.08, Math.PI * 1.92);
      g.stroke();
    }
  }
  g.restore();
  void color;
}

/** A soft headlight glow at the lamp (when lit) */
export function lampGlow(g: Ctx, x: number, y: number, r: number, strength: number): void {
  glow(g, x, y, r, '#fff1c4', strength);
}

// --- A spacecraft's landing legs and engine nozzles (drawn live: they flame, glow and sputter)

/** The legs: a strut from the hull to a foot pad on the floor, a brace. (x, y): the art's top-left on screen */
export function shipLegs(g: Ctx, art: CarArt, legs: [number, number][], x: number, y: number): void {
  const L = art.px(1, 0)[0] - art.px(0, 0)[0];
  const [, gy0] = art.px(0, 0);
  const lw = Math.max(2.5, L * 0.011);
  g.save();
  g.lineCap = 'round';
  for (const [lx, ly] of legs) {
    const [px, py] = art.px(lx, ly);
    const top = y + py;
    const foot = y + gy0 - lw * 0.6;
    const side = lx < 0.5 ? -1 : 1;
    const fx0 = x + px + side * L * 0.03;
    g.strokeStyle = '#2b2f38';
    g.lineWidth = lw * 1.6;
    g.beginPath();
    g.moveTo(x + px, top);
    g.lineTo(fx0, foot);
    g.moveTo(x + px - side * L * 0.03, top);
    g.lineTo(fx0, foot - (foot - top) * 0.35);
    g.stroke();
    g.strokeStyle = '#9aa3ad';
    g.lineWidth = lw * 0.7;
    g.beginPath();
    g.moveTo(x + px, top);
    g.lineTo(fx0, foot);
    g.stroke();
    // The foot pad
    g.fillStyle = '#5e6672';
    g.beginPath();
    g.ellipse(fx0, foot, L * 0.028, lw * 0.9, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

export interface NozzleSpot {
  /** The bell's mouth on screen, the way it points, its radius and length */
  x: number;
  y: number;
  ax: number;
  ay: number;
  r: number;
  len: number;
}
export function nozzleSpot(art: CarArt, z: Thruster, x: number, y: number): NozzleSpot {
  const [tx, ty] = art.px(z.x, z.y);
  const r = z.r * 1.2 * (art.px(1, 0)[0] - art.px(0, 0)[0]);
  const len = r * 1.5;
  const [ax, ay] = z.down ? [0, 1] : [-1, 0];
  return { x: x + tx + ax * len, y: y + ty + ay * len, ax, ay, r, len };
}

/** A flame from (0,0) along +x in the current transform */
function flame(g: Ctx, len: number, wd: number, color: string): void {
  const fl = g.createLinearGradient(0, 0, len, 0);
  fl.addColorStop(0, '#fffbe8');
  fl.addColorStop(0.22, color);
  fl.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fl;
  g.beginPath();
  g.moveTo(0, -wd / 2);
  g.quadraticCurveTo(len * 0.45, -wd * 0.62, len, 0);
  g.quadraticCurveTo(len * 0.45, wd * 0.62, 0, wd / 2);
  g.closePath();
  g.fill();
  // The bright core
  const core = g.createLinearGradient(0, 0, len * 0.4, 0);
  core.addColorStop(0, 'rgba(255,255,255,0.95)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = core;
  g.beginPath();
  g.ellipse(len * 0.12, 0, len * 0.22, wd * 0.22, 0, 0, Math.PI * 2);
  g.fill();
}

/** One nozzle: the bell, scorched and cracked while broken, glowing inside once it works, its flame (0–1) */
export function shipNozzle(g: Ctx, art: CarArt, z: Thruster, x: number, y: number, o: { broken: boolean; flame: number; color?: string; t: number; i: number }): void {
  const n = nozzleSpot(art, z, x, y);
  const r = n.r;
  const col = o.color ?? '#ff8a2e';
  g.save();
  g.translate(n.x - n.ax * n.len, n.y - n.ay * n.len);
  g.rotate(z.down ? Math.PI / 2 : Math.PI);
  // The bell: the throat on the hull, widening to the mouth
  const bell = g.createLinearGradient(0, -r * 1.15, 0, r * 1.15);
  const [c0, c1, c2] = o.broken ? ['#6a5446', '#3a2c24', '#1c1410'] : ['#e4e8ee', '#9aa3ad', '#4b5566'];
  bell.addColorStop(0, c1);
  bell.addColorStop(0.35, c0);
  bell.addColorStop(1, c2);
  g.fillStyle = bell;
  g.beginPath();
  g.moveTo(0, -r * 0.55);
  g.quadraticCurveTo(n.len * 0.55, -r * 0.6, n.len, -r * 1.15);
  g.lineTo(n.len, r * 1.15);
  g.quadraticCurveTo(n.len * 0.55, r * 0.6, 0, r * 0.55);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(10,12,18,0.7)';
  g.lineWidth = 1;
  g.stroke();
  // Cooling rings
  g.strokeStyle = o.broken ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.25)';
  for (const k of [0.35, 0.65]) {
    const hw = r * (0.55 + 0.6 * k * k);
    g.beginPath();
    g.moveTo(n.len * k, -hw);
    g.lineTo(n.len * k, hw);
    g.stroke();
  }
  // The mouth
  g.fillStyle = '#121418';
  g.beginPath();
  g.ellipse(n.len, 0, r * 0.28, r * 1.12, 0, 0, Math.PI * 2);
  g.fill();
  if (o.broken) {
    // A crack glowing hot
    g.strokeStyle = `rgba(255,120,40,${0.5 + 0.4 * Math.sin(o.t * 7 + o.i)})`;
    g.lineWidth = Math.max(1.2, r * 0.08);
    g.beginPath();
    g.moveTo(n.len * 0.25, -r * 0.6);
    g.lineTo(n.len * 0.45, -r * 0.2);
    g.lineTo(n.len * 0.38, r * 0.15);
    g.lineTo(n.len * 0.6, r * 0.5);
    g.stroke();
  }
  g.globalCompositeOperation = 'lighter';
  if (!o.broken) {
    // The glow inside a working engine
    const gl = g.createRadialGradient(n.len, 0, 1, n.len, 0, r * 1.3);
    gl.addColorStop(0, col);
    gl.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.35 + 0.15 * Math.sin(o.t * 4 + o.i);
    g.fillStyle = gl;
    g.beginPath();
    g.ellipse(n.len, 0, r * 0.5, r * 1.1, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }
  if (o.flame > 0.02) {
    g.translate(n.len, 0);
    const flick = 1 + 0.12 * Math.sin(o.t * 47 + o.i * 3) + 0.08 * Math.sin(o.t * 73 + o.i);
    flame(g, r * 7 * o.flame * flick, r * 2.1, col);
  }
  g.restore();
}

/** A bent rim: a kink pressed into the lip, a crease of light beside it (turns with the wheel; drawn about the axle) */
export function bentKink(g: Ctx, r: number): void {
  const a = -0.7;
  g.save();
  g.rotate(a);
  // The pressed-in lip: a dark wedge
  g.fillStyle = 'rgba(14,15,20,0.9)';
  g.beginPath();
  g.moveTo(r * 0.92, -r * 0.2);
  g.quadraticCurveTo(r * 0.66, 0, r * 0.92, r * 0.2);
  g.lineTo(r * 0.98, r * 0.12);
  g.lineTo(r * 0.98, -r * 0.12);
  g.closePath();
  g.fill();
  // The crease's light and a scrape on the metal
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.lineWidth = Math.max(1, r * 0.03);
  g.beginPath();
  g.moveTo(r * 0.9, -r * 0.22);
  g.quadraticCurveTo(r * 0.63, 0, r * 0.9, r * 0.22);
  g.stroke();
  g.strokeStyle = 'rgba(255,170,90,0.7)';
  g.lineWidth = Math.max(1, r * 0.018);
  for (const k of [-0.1, 0, 0.1]) {
    g.beginPath();
    g.moveTo(r * 0.7, r * k);
    g.lineTo(r * 0.55, r * (k + 0.05));
    g.stroke();
  }
  g.restore();
}

/** The tyre's own colour on a wheel sprite (its ring just inside the edge), cached */
const tyreTone = new WeakMap<object, [number, number, number]>();
function tyreColour(img: CanvasImageSource & { width: number }): [number, number, number] {
  const known = tyreTone.get(img);
  if (known) return known;
  const n = 64;
  const [c, cg] = canvas2d(n, n);
  cg.drawImage(img, 0, 0, n, n);
  const px = cg.getImageData(0, 0, n, n).data;
  let r = 0;
  let gg = 0;
  let b = 0;
  let k = 0;
  for (let a = 0; a < Math.PI * 2; a += 0.05) {
    const x = Math.round(n / 2 + Math.cos(a) * n * 0.45);
    const y = Math.round(n / 2 + Math.sin(a) * n * 0.45);
    const o = (y * n + x) * 4;
    if (px[o + 3] < 200) continue;
    r += px[o];
    gg += px[o + 1];
    b += px[o + 2];
    k++;
  }
  void c;
  const out: [number, number, number] = k ? [r / k, gg / k, b / k] : [30, 31, 36];
  tyreTone.set(img, out);
  return out;
}

/**
 * A flat wheel (the owner, 2026-10-17: the squash «меняется сильно геометрия»): the wheel's picture untouched — rim,
 * spokes and tyre as they are — sunk a little so its rubber meets the floor in a flat patch, with the sidewall bulging
 * out at the floor on both sides in the tyre's own colour; a nail head in the tread, a little air escaping (t animates
 * it). `img` the wheel's sprite (its centre the axle) drawn `size` px across; (x, y) the axle when round, r the tyre's
 * radius, sag 0–1 (the pump fills it back to round)
 */
export function drawFlatWheel(g: Ctx, img: CanvasImageSource & { width: number }, size: number, x: number, y: number, r: number, sag: number, t = 0): void {
  const sink = r * 0.08 * sag;
  const floor = y + r;
  const cy = y + sink;
  const bulge = r * 0.1 * sag;
  g.save();
  // Nothing below the floor: the tyre's bottom is its flat contact patch
  g.beginPath();
  g.rect(x - size, cy - size, size * 2, floor - (cy - size));
  g.clip();
  if (sag > 0.01) {
    // The sidewall bulging out at the floor, behind the wheel's own edge: only the band between the tyre's circle and
    // a slightly wider one, low down
    const [tr, tgc, tb] = tyreColour(img);
    g.save();
    const band = new Path2D();
    band.ellipse(x, cy, r + bulge, r, 0, 0, Math.PI * 2);
    g.clip(band);
    g.beginPath();
    g.rect(x - r * 2, cy + r * 0.35, r * 4, r);
    g.clip();
    const bg = g.createLinearGradient(0, cy + r * 0.35, 0, floor);
    bg.addColorStop(0, `rgb(${tr},${tgc},${tb})`);
    bg.addColorStop(1, `rgb(${tr * 0.6},${tgc * 0.6},${tb * 0.6})`);
    g.fillStyle = bg;
    g.fillRect(x - r * 2, cy + r * 0.35, r * 4, r);
    g.restore();
  }
  g.drawImage(img, x - size / 2, cy - size / 2, size, size);
  if (sag > 0.01) {
    // The contact patch's shadow on the floor, wide and short
    const sh = g.createRadialGradient(x, floor, 1, x, floor, r * 1.1);
    sh.addColorStop(0, `rgba(0,0,0,${0.5 * sag})`);
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh;
    g.fillRect(x - r * 1.3, floor - r * 0.06, r * 2.6, r * 0.06);
    // The nail head in the tread, low on the rubber
    const nx = x - r * 0.62;
    const ny = floor - r * 0.22;
    const nr = Math.max(1.5, r * 0.035);
    g.fillStyle = '#5a5f68';
    g.beginPath();
    g.arc(nx, ny, nr * 1.25, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c9ced6';
    g.beginPath();
    g.arc(nx - nr * 0.2, ny - nr * 0.2, nr * 0.8, 0, Math.PI * 2);
    g.fill();
    // A few wisps of air from it
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.9 + i / 3) % 1;
      g.fillStyle = `rgba(225,235,245,${0.35 * (1 - p) * sag})`;
      g.beginPath();
      g.arc(nx - r * (0.06 + 0.3 * p), ny - r * 0.04 * p, r * (0.02 + 0.05 * p), 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

/**
 * The light on a wheel that doesn't turn with it (the owner, 2026-10-17: «поработай над динамическими тенями для колёс»):
 * the lamp's side lit, the far side in shade, the arch's shadow over its top (on the car), and its own shadow on the
 * floor cast away from the lamp (wheelShadow, drawn before the wheel). (x, y) the axle, r the tyre's radius, (lx, ly) the lamp
 */
export function wheelLight(g: Ctx, x: number, y: number, r: number, lx: number, ly: number, arch: boolean): void {
  const a = Math.atan2(ly - y, lx - x);
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  g.save();
  g.beginPath();
  g.arc(x, y, r * 1.02, 0, Math.PI * 2);
  g.clip();
  // The lamp's side lit, the far side shaded
  const lg = g.createRadialGradient(x + ca * r * 0.6, y + sa * r * 0.6, r * 0.1, x + ca * r * 0.2, y + sa * r * 0.2, r * 1.5);
  lg.addColorStop(0, 'rgba(255,248,230,0.16)');
  lg.addColorStop(0.45, 'rgba(255,248,230,0)');
  lg.addColorStop(1, 'rgba(0,0,8,0.38)');
  g.fillStyle = lg;
  g.fillRect(x - r * 1.1, y - r * 1.1, r * 2.2, r * 2.2);
  // The floor under it: the tyre's bottom in its own shade (on a light floor it read as a whitewall: the reviewer, 1.4.0)
  const bg = g.createLinearGradient(0, y + r * 0.45, 0, y + r * 1.02);
  bg.addColorStop(0, 'rgba(0,0,6,0)');
  bg.addColorStop(1, 'rgba(0,0,6,0.45)');
  g.fillStyle = bg;
  g.fillRect(x - r * 1.1, y + r * 0.45, r * 2.2, r * 0.6);
  if (arch) {
    // The arch over it keeps the light off its top
    const ag = g.createLinearGradient(0, y - r, 0, y - r * 0.15);
    ag.addColorStop(0, 'rgba(0,0,6,0.55)');
    ag.addColorStop(1, 'rgba(0,0,6,0)');
    g.fillStyle = ag;
    g.fillRect(x - r * 1.1, y - r * 1.1, r * 2.2, r * 0.95);
  }
  g.restore();
}

/** A wheel's own shadow on the floor: a soft contact under it, smudged away from the lamp (lx) */
export function wheelShadow(g: Ctx, x: number, floor: number, r: number, lx: number): void {
  const sx = x + Math.sign(x - lx) * Math.min(1, Math.abs(x - lx) / (r * 8)) * r * 0.35;
  const cs = g.createRadialGradient(sx, floor, 1, sx, floor, r * 1.05);
  cs.addColorStop(0, 'rgba(0,0,0,0.5)');
  cs.addColorStop(0.5, 'rgba(0,0,0,0.22)');
  cs.addColorStop(1, 'rgba(0,0,0,0)');
  g.save();
  g.fillStyle = cs;
  g.beginPath();
  g.ellipse(sx, floor, r * 1.05, r * 0.14, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}
