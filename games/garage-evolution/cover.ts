// The cover's key art (host.qa({ cover }), the platform's docs/guides/covers.md): before → after. On the left, in the
// dim old shed, a red 90s sports coupe caked in mud and rust; a big golden arrow; on the right, in the bright renovated
// garage, the same car restored and shining — and the money it earned piled in front. The game's loop in one picture.

import type { CoverArt, CoverLayout } from '@gp/core';
import { glow } from '@gp/art/material';
import { bakeCar, wheelAt, type CarArt } from './car-art.ts';
import { GRID } from './data.ts';
import { bakeRoom } from './garage-art.ts';
import { LayerViews } from './layers.ts';
import { newCar, seeded, type Car } from './sim.ts';

type Ctx = CanvasRenderingContext2D;
interface Spot {
  /** Left edge, ground line, length (px) */
  x: number;
  ground: number;
  len: number;
}
interface Plan {
  wreck: Spot;
  shiny: Spot;
  /** The arrow: from, control, to */
  arrow: [number, number, number, number, number, number];
  /** The split between the old and the new garage: a line from (x0, 0) to (x1, h), or a horizontal one at y (portrait) */
  split: { x0: number; x1: number } | { y: number };
  /** The cash pile: centre x, bottom, width */
  cash: [number, number, number];
}

function plan(L: CoverLayout): Plan {
  const { w, h } = L;
  if (L.shape === 'portrait')
    return {
      wreck: { x: -w * 0.06, ground: h * 0.5, len: w * 0.88 },
      shiny: { x: w * 0.03, ground: h * 0.8, len: w * 0.95 },
      arrow: [w * 0.8, h * 0.4, w * 1.0, h * 0.5, w * 0.8, h * 0.6],
      split: { y: h * 0.555 },
      cash: [w * 0.5, h * 1.02, w * 1.1],
    };
  if (L.shape === 'square')
    return {
      wreck: { x: -w * 0.05, ground: h * 0.7, len: w * 0.53 },
      shiny: { x: w * 0.5, ground: h * 0.7, len: w * 0.495 },
      arrow: [w * 0.33, h * 0.44, w * 0.5, h * 0.29, w * 0.66, h * 0.43],
      split: { x0: w * 0.53, x1: w * 0.47 },
      cash: [w * 0.5, h * 1.03, w * 0.9],
    };
  // The title on the right (the main composition, which the preview video opens on): before above after on the left
  if (L.variant === 'hero')
    return {
      wreck: { x: -w * 0.03, ground: h * 0.47, len: w * 0.42 },
      shiny: { x: w * 0.0, ground: h * 0.9, len: w * 0.53 },
      arrow: [w * 0.4, h * 0.31, w * 0.53, h * 0.45, w * 0.45, h * 0.6],
      split: { y: h * 0.53 },
      cash: [w * 0.78, h * 1.04, w * 0.42],
    };
  return {
    wreck: { x: -w * 0.04, ground: h * 0.76, len: w * 0.52 },
    shiny: { x: w * 0.51, ground: h * 0.76, len: w * 0.48 },
    arrow: [w * 0.37, h * 0.47, w * 0.5, h * 0.3, w * 0.63, h * 0.44],
    split: { x0: w * 0.53, x1: w * 0.47 },
    cash: [w * 0.5, h * 1.03, w * 0.62],
  };
}

interface Built {
  car: Car;
  art: CarArt;
  views: LayerViews | null;
  x: number;
  y: number;
}

/** The coupe at a spot: dirty (mud and rust as the game draws them) or restored */
function build(s: Spot, dirty: boolean): Built {
  // The Fang V10: one of the owner's painted cars, in its own red (the drawn coupe it replaced is retired)
  const car = newCar(seeded(11), { garage: 3, model: 'fang', rarity: 'epic', variant: 'standard', profile: 'flood' });
  car.color = car.model.colors[0];
  const art = bakeCar(car.model, car.color, 'standard', s.len / 1.12, 1);
  let views: LayerViews | null = null;
  if (dirty) {
    // Red paint shows through: the mud thick on the lower body and in big patches above, the rust where it is
    const patch = (x: number, y: number) => Math.sin(x * 0.21 + 1.3) * Math.sin(y * 0.55 + x * 0.07) + Math.sin(x * 0.09 - y * 0.3) * 0.6;
    for (const l of car.layers) {
      if (l.kind === 'polish') l.amt.fill(0);
      if (l.kind === 'mud')
        for (let i = 0; i < l.amt.length; i++) {
          const gx = i % GRID.w;
          const gy = Math.floor(i / GRID.w);
          if (gy / GRID.h < 0.6 && patch(gx, gy) < 0.35) l.amt[i] = 0;
        }
      l.dirty = true;
    }
    views = new LayerViews(car, art);
    views.sync();
  }
  return { car, art, views, x: s.x, y: s.ground - art.h };
}

function drawCar(g: Ctx, b: Built, wreck = false): void {
  const { art } = b;
  if (wreck) {
    // The wreck's paint faded and grimy: the car on its own canvas, a brown wash over it, then the mud and the rust
    const c = document.createElement('canvas');
    c.width = g.canvas.width;
    c.height = g.canvas.height;
    const cg = c.getContext('2d')!;
    cg.setTransform(g.getTransform());
    drawCar(cg, { ...b, views: null });
    cg.setTransform(1, 0, 0, 1, 0, 0);
    cg.globalCompositeOperation = 'source-atop';
    cg.fillStyle = 'rgba(96,62,36,0.38)';
    cg.fillRect(0, 0, c.width, c.height);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(c, 0, 0);
    g.restore();
    b.views?.draw(g, b.x, b.y);
    return;
  }
  g.drawImage(art.body, b.x, b.y, art.w, art.h);
  for (const p of Object.values(art.parts)) if (p) g.drawImage(p.canvas, b.x + p.x, b.y + p.y, p.w, p.h);
  b.car.model.shape.wheels.forEach((_, i) => {
    const [wx, wy] = wheelAt(art, i);
    const c = art.wheel(i);
    g.drawImage(c, b.x + wx - c.width / 2, b.y + wy - c.height / 2);
  });
  b.views?.draw(g, b.x, b.y);
}

/** The split: the old shed's side as a clip path */
function oldSide(g: Ctx, L: CoverLayout, p: Plan): void {
  g.beginPath();
  if ('y' in p.split) {
    g.rect(0, 0, L.w, p.split.y);
  } else {
    g.moveTo(0, 0);
    g.lineTo(p.split.x0, 0);
    g.lineTo(p.split.x1, L.h);
    g.lineTo(0, L.h);
    g.closePath();
  }
}

/** A cone of warm light from a ceiling lamp */
function lampCone(g: Ctx, x: number, y: number, len: number, spread: number, alpha: number, u: number): void {
  const gr = g.createLinearGradient(x, y, x, y + len);
  gr.addColorStop(0, `rgba(255,236,190,${alpha})`);
  gr.addColorStop(1, 'rgba(255,236,190,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(x - 30 * u, y);
  g.lineTo(x + 30 * u, y);
  g.lineTo(x + spread, y + len);
  g.lineTo(x - spread, y + len);
  g.closePath();
  g.fill();
  // The lamp: a dark shade with a bright rim
  g.fillStyle = '#2b2622';
  g.beginPath();
  g.moveTo(x - 46 * u, y);
  g.quadraticCurveTo(x, y - 40 * u, x + 46 * u, y);
  g.closePath();
  g.fill();
  g.fillStyle = '#fff6d8';
  g.fillRect(x - 40 * u, y - 4 * u, 80 * u, 7 * u);
  glow(g, x, y + 4 * u, 70 * u, '#fff1c8', 0.8);
}

/** One stack of banknotes, seen a little from above: paper edges on the side, the top note with its band and emblem */
function stack(g: Ctx, x: number, y: number, s: number, rot: number, layers: number): void {
  const W = 150 * s;
  const H = 62 * s;
  const T = 9 * s * layers;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.lineJoin = 'round';
  // The side: paper edges
  g.fillStyle = '#e9f3d2';
  g.strokeStyle = '#1d4a1c';
  g.lineWidth = 4 * s;
  g.beginPath();
  g.roundRect(-W / 2, -H / 2, W, H + T, 8 * s);
  g.fill();
  g.stroke();
  g.strokeStyle = 'rgba(46,120,52,0.55)';
  g.lineWidth = 1.6 * s;
  for (let i = 1; i < layers * 2; i++) {
    const yy = H / 2 + (T * i) / (layers * 2);
    g.beginPath();
    g.moveTo(-W / 2 + 4 * s, yy);
    g.lineTo(W / 2 - 4 * s, yy);
    g.stroke();
  }
  // The top note
  const top = g.createLinearGradient(0, -H / 2, 0, H / 2);
  top.addColorStop(0, '#b4ff7e');
  top.addColorStop(1, '#2fbf4a');
  g.fillStyle = top;
  g.strokeStyle = '#1d4a1c';
  g.lineWidth = 4 * s;
  g.beginPath();
  g.roundRect(-W / 2, -H / 2, W, H, 8 * s);
  g.fill();
  g.stroke();
  g.strokeStyle = 'rgba(230,255,210,0.75)';
  g.lineWidth = 2.5 * s;
  g.beginPath();
  g.roundRect(-W / 2 + 9 * s, -H / 2 + 8 * s, W - 18 * s, H - 16 * s, 5 * s);
  g.stroke();
  // The emblem: a ring with a dollar sign
  g.fillStyle = '#2f8a3a';
  g.beginPath();
  g.arc(0, 0, H * 0.3, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#d9f7c4';
  g.font = `900 ${H * 0.42}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('$', 0, H * 0.02);
  // The paper band
  g.fillStyle = '#f6e7b0';
  g.fillRect(-W * 0.3, -H / 2, W * 0.12, H + T);
  g.strokeStyle = 'rgba(120,90,30,0.6)';
  g.lineWidth = 1.5 * s;
  g.strokeRect(-W * 0.3, -H / 2, W * 0.12, H + T);
  g.restore();
}

/** A gold coin, a little tilted */
function coin(g: Ctx, x: number, y: number, r: number, tilt: number): void {
  const ry = r * tilt;
  g.save();
  g.fillStyle = '#9a5a06';
  g.beginPath();
  g.ellipse(x, y + r * 0.16, r, ry, 0, 0, Math.PI * 2);
  g.fill();
  const gr = g.createRadialGradient(x - r * 0.35, y - ry * 0.4, r * 0.1, x, y, r);
  gr.addColorStop(0, '#fff6b8');
  gr.addColorStop(0.45, '#ffcf3a');
  gr.addColorStop(1, '#e08a0c');
  g.fillStyle = gr;
  g.strokeStyle = '#6b3a02';
  g.lineWidth = Math.max(2, r * 0.09);
  g.beginPath();
  g.ellipse(x, y, r, ry, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.strokeStyle = 'rgba(160,90,10,0.8)';
  g.lineWidth = Math.max(1.5, r * 0.06);
  g.beginPath();
  g.ellipse(x, y, r * 0.72, ry * 0.72, 0, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#b8680a';
  g.font = `900 ${r * 0.95}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.save();
  g.translate(x, y);
  g.scale(1, tilt);
  g.fillText('$', 0, r * 0.05);
  g.restore();
  g.restore();
}

/** The pile: stacks in rows from the back, coins spilled over and around */
function cashPile(g: Ctx, cx: number, bottom: number, width: number, u: number): void {
  const r = seeded(7);
  const s = (width / 1200) * 1.6;
  const rows = [
    { n: 4, y: -0.3, k: 0.56, l: 3 },
    { n: 5, y: -0.2, k: 0.78, l: 4 },
    { n: 6, y: -0.08, k: 1.0, l: 4 },
  ];
  for (const row of rows) {
    for (let i = 0; i < row.n; i++) {
      const f = row.n === 1 ? 0.5 : i / (row.n - 1);
      const x = cx + (f - 0.5) * width * row.k * (0.9 + r() * 0.1);
      const y = bottom + row.y * width * 0.42 + (r() - 0.5) * 14 * s;
      stack(g, x, y, s * (0.95 + r() * 0.15), (r() - 0.5) * 0.5, row.l);
    }
  }
  for (let i = 0; i < 26; i++) {
    const a = r();
    const x = cx + (a - 0.5) * width * (0.85 + r() * 0.2);
    const y = bottom - width * (0.02 + r() * 0.16) * (1 - Math.abs(a - 0.5));
    coin(g, x, y, (22 + r() * 16) * s, 0.55 + r() * 0.3);
  }
  void u;
}

/** A banknote in the air (a single note, turned) */
function flyingNote(g: Ctx, x: number, y: number, s: number, rot: number): void {
  stack(g, x, y, s, rot, 0.25);
}

/** The arrow: a fat curve with a head, golden, outlined, a shine along its top */
function arrow(g: Ctx, a: Plan['arrow'], u: number): void {
  const [x0, y0, cx, cy, x1, y1] = a;
  const W = 46 * u;
  const ang = Math.atan2(y1 - cy, x1 - cx);
  const head = W * 1.9;
  const hx = x1 + Math.cos(ang) * head * 0.55;
  const hy = y1 + Math.sin(ang) * head * 0.55;
  const tri = (grow: number) => {
    g.beginPath();
    g.moveTo(hx + Math.cos(ang) * (head * 0.5 + grow), hy + Math.sin(ang) * (head * 0.5 + grow));
    g.lineTo(x1 + Math.cos(ang + Math.PI / 2) * (head * 0.62 + grow), y1 + Math.sin(ang + Math.PI / 2) * (head * 0.62 + grow));
    g.lineTo(x1 - Math.cos(ang + Math.PI / 2) * (head * 0.62 + grow), y1 - Math.sin(ang + Math.PI / 2) * (head * 0.62 + grow));
    g.closePath();
  };
  const curve = () => {
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo(cx, cy, x1, y1);
  };
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // Shadow
  g.save();
  g.translate(6 * u, 10 * u);
  g.strokeStyle = 'rgba(30,10,0,0.35)';
  g.lineWidth = W + 14 * u;
  curve();
  g.stroke();
  tri(7 * u);
  g.fillStyle = 'rgba(30,10,0,0.35)';
  g.fill();
  g.restore();
  // Outline
  g.strokeStyle = '#4a1d02';
  g.lineWidth = W + 14 * u;
  curve();
  g.stroke();
  tri(9 * u);
  g.fillStyle = '#4a1d02';
  g.fill();
  // Fill
  const gr = g.createLinearGradient(0, Math.min(y0, cy, y1), 0, Math.max(y0, y1) + head);
  gr.addColorStop(0, '#fff07a');
  gr.addColorStop(0.5, '#ffc21a');
  gr.addColorStop(1, '#ff8a10');
  g.strokeStyle = gr;
  g.lineWidth = W;
  curve();
  g.stroke();
  tri(0);
  g.fillStyle = gr;
  g.fill();
  // Shine
  g.strokeStyle = 'rgba(255,255,235,0.85)';
  g.lineWidth = W * 0.22;
  g.beginPath();
  g.moveTo(x0 + (cx - x0) * 0.15, y0 + (cy - y0) * 0.15 - W * 0.22);
  g.quadraticCurveTo(cx, cy - W * 0.3, cx + (x1 - cx) * 0.75, cy + (y1 - cy) * 0.75 - W * 0.3);
  g.stroke();
  g.restore();
}

/** A four-point sparkle */
function sparkle(g: Ctx, x: number, y: number, r: number, color = '#ffffff'): void {
  g.save();
  glow(g, x, y, r * 1.6, '#fff7d0', 0.7);
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const rr = i % 2 ? r * 0.18 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  g.restore();
}

/** Rays of light fanning out from a point, warm and additive */
function sunburst(g: Ctx, x: number, y: number, R: number, core: number): void {
  g.save();
  g.globalCompositeOperation = 'lighter';
  const n = 16;
  const rg = g.createRadialGradient(x, y, core * 0.3, x, y, R);
  rg.addColorStop(0, 'rgba(255,214,80,0.5)');
  rg.addColorStop(0.5, 'rgba(255,180,60,0.16)');
  rg.addColorStop(1, 'rgba(255,200,90,0)');
  g.fillStyle = rg;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.1;
    const da = (Math.PI / n) * 0.55;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a - da) * R, y + Math.sin(a - da) * R);
    g.lineTo(x + Math.cos(a + da) * R, y + Math.sin(a + da) * R);
    g.closePath();
    g.fill();
  }
  const halo = g.createRadialGradient(x, y, 0, x, y, core * 2.4);
  halo.addColorStop(0, 'rgba(255,230,150,0.6)');
  halo.addColorStop(1, 'rgba(255,220,140,0)');
  g.fillStyle = halo;
  g.fillRect(x - core * 2.4, y - core * 2.4, core * 4.8, core * 4.8);
  g.restore();
}

/** The restored car, juicy: saturated paint, glossy streaks across the body, a hot specular line along the shoulder */
function glossy(g: Ctx, b: Built): void {
  const c = document.createElement('canvas');
  c.width = g.canvas.width;
  c.height = g.canvas.height;
  const cg = c.getContext('2d')!;
  cg.setTransform(g.getTransform());
  drawCar(cg, b);
  cg.globalCompositeOperation = 'source-atop';
  const { x, y, art } = b;
  // Two diagonal sheen bands
  for (const [f, wdt, a] of [[0.3, 0.07, 0.45], [0.42, 0.03, 0.6], [0.72, 0.05, 0.35]] as const) {
    const sx = x + art.w * f;
    const gr = cg.createLinearGradient(sx, y, sx + art.w * wdt, y);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, `rgba(255,255,255,${a})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    cg.fillStyle = gr;
    cg.save();
    cg.translate(sx, y + art.h * 0.5);
    cg.transform(1, 0, -0.6, 1, 0, 0);
    cg.translate(-sx, -(y + art.h * 0.5));
    cg.fillRect(sx, y, art.w * wdt, art.h * 0.62);
    cg.restore();
  }
  // The shoulder line catches the light
  const sh = cg.createLinearGradient(0, y + art.h * 0.36, 0, y + art.h * 0.46);
  sh.addColorStop(0, 'rgba(255,255,255,0)');
  sh.addColorStop(0.5, 'rgba(255,240,230,0.35)');
  sh.addColorStop(1, 'rgba(255,255,255,0)');
  cg.fillStyle = sh;
  cg.fillRect(x, y + art.h * 0.36, art.w, art.h * 0.1);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.filter = 'saturate(1.45) brightness(1.06) contrast(1.05)';
  g.drawImage(c, 0, 0);
  g.restore();
}

export function coverArt(): CoverArt {
  return {
    rim: '#fff0b0',
    title: { fill: ['#ffffff', '#ffe23a', '#ff7a00'], outline: '#3a1004', glow: '#ffb02e' },
    scene(g, L) {
      const p = plan(L);
      const u = L.unit;
      // The new garage: bright, clean, a cool blue-grey with a glossy floor
      const bright = bakeRoom(3, L.w, L.h, p.shiny.ground + 4, 1);
      // Out of focus behind the cars: fewer edges, the cars stand off it
      g.filter = `blur(${Math.max(1.5, 4 * u)}px) saturate(1.7) brightness(0.92)`;
      g.drawImage(bright, 0, 0, L.w, L.h);
      g.filter = 'none';
      g.save();
      g.globalCompositeOperation = 'soft-light';
      g.fillStyle = 'rgba(20,120,255,0.9)';
      g.fillRect(0, 0, L.w, L.h);
      g.restore();
      // The restored car's reflection on the glossy floor
      const shiny = build(p.shiny, false);
      g.save();
      g.globalAlpha = 0.28;
      g.translate(0, p.shiny.ground * 2);
      g.scale(1, -1);
      drawCar(g, shiny);
      g.restore();
      // Rays of light burst from behind the restored car
      sunburst(g, p.shiny.x + p.shiny.len * 0.5, p.shiny.ground - p.shiny.len * 0.14, Math.max(L.w, L.h) * 0.75, p.shiny.len * 0.32);
      // The old shed: the same building before — dim, brown, dusty
      const old = bakeRoom(2, L.w, L.h, p.wreck.ground + 4, 1);
      g.save();
      oldSide(g, L, p);
      g.clip();
      g.filter = `blur(${Math.max(1.5, 4 * u)}px) saturate(1.5)`;
      g.drawImage(old, 0, 0, L.w, L.h);
      g.filter = 'none';
      // Warm and moody: an amber lamp in the dark, not a grey fog
      const dusk = g.createRadialGradient(p.wreck.x + p.wreck.len * 0.5, p.wreck.ground - p.wreck.len * 0.2, 0, p.wreck.x + p.wreck.len * 0.5, p.wreck.ground - p.wreck.len * 0.2, p.wreck.len);
      dusk.addColorStop(0, 'rgba(255,150,40,0.10)');
      dusk.addColorStop(1, 'rgba(45,16,2,0.55)');
      g.fillStyle = dusk;
      g.fillRect(0, 0, L.w, L.h);
      // An oil puddle under the wreck
      const px = p.wreck.x + p.wreck.len * 0.5;
      g.fillStyle = 'rgba(15,10,8,0.55)';
      g.beginPath();
      g.ellipse(px, p.wreck.ground + 14 * u, p.wreck.len * 0.42, 22 * u, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(120,140,170,0.35)';
      g.lineWidth = 3 * u;
      g.beginPath();
      g.ellipse(px - p.wreck.len * 0.1, p.wreck.ground + 10 * u, p.wreck.len * 0.18, 7 * u, 0, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
      // Cobwebs in the top corner
      g.strokeStyle = 'rgba(230,230,230,0.35)';
      g.lineWidth = 1.6 * u;
      const cw = 150 * u;
      for (let i = 0; i <= 5; i++) {
        const a = (i / 5) * (Math.PI / 2);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(Math.cos(a) * cw, Math.sin(a) * cw);
        g.stroke();
      }
      for (let k = 1; k <= 4; k++) {
        g.beginPath();
        for (let i = 0; i <= 5; i++) {
          const a = (i / 5) * (Math.PI / 2);
          const rr = (cw * k) / 4.5;
          const xx = Math.cos(a) * rr;
          const yy = Math.sin(a) * rr;
          if (i === 0) g.moveTo(xx, yy);
          else g.quadraticCurveTo(Math.cos(a - 0.16) * rr * 0.85, Math.sin(a - 0.16) * rr * 0.85, xx, yy);
        }
        g.stroke();
      }
      // Dust in the air, lit by the lamp
      const r = seeded(3);
      g.fillStyle = 'rgba(255,230,180,0.35)';
      for (let i = 0; i < 60; i++) {
        g.beginPath();
        g.arc(r() * L.w * 0.5, r() * L.h * 0.8, (1 + r() * 2.5) * u, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      // The seam between the two: a soft bright line
      g.save();
      g.strokeStyle = 'rgba(255,240,200,0.5)';
      g.lineWidth = 6 * u;
      g.shadowColor = '#ffe6a0';
      g.shadowBlur = 30 * u;
      g.beginPath();
      if ('y' in p.split) {
        g.moveTo(0, p.split.y);
        g.lineTo(L.w, p.split.y);
      } else {
        g.moveTo(p.split.x0, 0);
        g.lineTo(p.split.x1, L.h);
      }
      g.stroke();
      g.restore();
      // Ceiling lamps over each car
      lampCone(g, p.wreck.x + p.wreck.len * 0.45, 0.04 * L.h + 20 * u, L.h * 0.6, p.wreck.len * 0.42, 0.32, u);
      lampCone(g, p.shiny.x + p.shiny.len * 0.55, ('y' in p.split ? p.split.y : 0.04 * L.h) + 20 * u, L.h * 0.6, p.shiny.len * 0.45, 0.5, u);
    },
    hero(g, L) {
      const p = plan(L);
      g.filter = 'saturate(1.35) contrast(1.06)';
      drawCar(g, build(p.wreck, true), true);
      g.filter = 'none';
      glossy(g, build(p.shiny, false));
    },
    front(g, L) {
      const p = plan(L);
      const u = L.unit;
      glow(g, p.arrow[2], p.arrow[3] + 40 * u, 180 * u, '#ffd23a', 0.55);
      arrow(g, p.arrow, u);
      // The paint shines: a soft highlight on the shoulder (in front: the hero's outline would ring it)
      glow(g, p.shiny.x + p.shiny.len * 0.62, p.shiny.ground - p.shiny.len * 0.17, p.shiny.len * 0.09, '#ffffff', 0.55);
      // Sparkles on the restored car
      const r = seeded(9);
      const sx = p.shiny.x;
      const sy = p.shiny.ground - p.shiny.len * 0.24;
      for (let i = 0; i < 10; i++) sparkle(g, sx + p.shiny.len * (0.08 + r() * 0.88), sy + p.shiny.len * (r() * 0.22 - 0.06), (20 + r() * 30) * u);
      // The money it earns, piled in front
      const [cx, by, cw] = p.cash;
      glow(g, cx, by - cw * 0.12, cw * 0.55, '#fff2a0', 0.5);
      cashPile(g, cx, by, cw, u);
      // Notes in the air at the edges
      const s = Math.min(L.w, L.h) / 1080;
      flyingNote(g, L.w * 0.05, L.h * 0.12, 1.5 * s, -0.5);
      flyingNote(g, L.w * 0.95, L.h * 0.16, 1.4 * s, 0.6);
      flyingNote(g, L.w * 0.04, L.h * 0.92, 1.7 * s, 0.35);
      flyingNote(g, L.w * 0.96, L.h * 0.88, 1.6 * s, -0.4);
      for (let i = 0; i < 6; i++) sparkle(g, L.w * (0.25 + r() * 0.5), by - cw * (0.1 + r() * 0.15), (12 + r() * 14) * u, '#fff6c0');
    },
  };
}
