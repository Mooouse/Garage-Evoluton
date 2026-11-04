// The layers over the car, drawn: each kind has its own painted texture (wet mud with drips, a dust film, soot, pitted
// rust, grey primer, a hazy scratched film), clipped to the vehicle. A stroke stamps a noisy-edged brush out of the
// layer where it lands (crisp, organic scrub marks); where the simulation says a cell is clean, the leftovers go too.

import { canvas2d } from '@gp/art/bake';
import { mix } from '@gp/art/color';
import { GRID, type LayerKind } from './data.ts';
import type { CarArt } from './car-art.ts';
import { seeded, type Car, type Layer, type Rand } from './sim.ts';

interface View {
  layer: Layer;
  /** What is left of the layer, in the box (device px) */
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  /** The cells that still have something (alpha 255) — the presence mask */
  mask: HTMLCanvasElement;
  mg: CanvasRenderingContext2D;
  img: ImageData;
  /** Fading out after the layer is finished (1 → 0) */
  fade: number;
  /** Cells that had something at the last sync (only newly cleared cells cut the picture: edges don't erode) */
  had: Uint8Array;
}

/** The presence mask, softened: a blurred 4× copy (organic edges instead of grid blocks) */
const [soft, sg] = (() => {
  const c = document.createElement('canvas');
  c.width = GRID.w * 4;
  c.height = GRID.h * 4;
  return [c, c.getContext('2d')!] as const;
})();

const brushes = new Map<number, HTMLCanvasElement[]>();
/** A round brush with a noisy edge, a few variants per size (device px radius) */
function brush(rpx: number): HTMLCanvasElement[] {
  const key = Math.max(4, Math.round(rpx / 2) * 2);
  let list = brushes.get(key);
  if (!list) {
    list = [];
    for (let v = 0; v < 4; v++) {
      const r = seeded(key * 31 + v);
      const size = key * 2 + 4;
      const [c, g] = canvas2d(size, size);
      const cx = size / 2;
      // The core
      const gr = g.createRadialGradient(cx, cx, 0, cx, cx, key);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(0.62, 'rgba(0,0,0,0.95)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(cx, cx, key, 0, Math.PI * 2);
      g.fill();
      // Ragged edge: blobs around the rim
      g.fillStyle = 'rgba(0,0,0,0.9)';
      for (let i = 0; i < 26; i++) {
        const a = r() * Math.PI * 2;
        const d = key * (0.55 + r() * 0.38);
        g.beginPath();
        g.arc(cx + Math.cos(a) * d, cx + Math.sin(a) * d, key * (0.08 + r() * 0.16), 0, Math.PI * 2);
        g.fill();
      }
      list.push(c);
    }
    brushes.set(key, list);
  }
  return list;
}

/** Paint one layer kind's texture over the whole box */
/** `old`: a respray car's old paint (its paint layer shows it faded until the new colour goes on, not grey primer) */
function texture(kind: LayerKind, art: CarArt, r: Rand, old?: string): HTMLCanvasElement {
  const s = art.scale;
  const W = art.w;
  const H = art.h;
  const [c, g] = canvas2d(W * s, H * s);
  g.scale(s, s);
  const L = art.L;
  const blob = (x: number, y: number, rx: number, ry: number, color: string, a = 1) => {
    g.globalAlpha = a;
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(x, y, rx, ry, r() * Math.PI, 0, Math.PI * 2);
    g.fill();
  };
  const [, ground] = art.px(0, 0);
  if (kind === 'mud') {
    const cols = ['#5b3d24', '#6e4b2c', '#7d5733', '#4a311d', '#64452a'];
    g.fillStyle = '#5d4027';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 420; i++) {
      const x = r() * W;
      const y = r() * H;
      blob(x, y, L * (0.012 + r() * 0.05), L * (0.01 + r() * 0.035), cols[i % cols.length], 0.55 + r() * 0.45);
    }
    // Drips running down
    for (let i = 0; i < 40; i++) {
      const x = r() * W;
      const y0 = r() * H * 0.6;
      const len = L * (0.03 + r() * 0.12);
      g.globalAlpha = 0.7;
      g.strokeStyle = '#3e2816';
      g.lineWidth = L * (0.004 + r() * 0.006);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, y0);
      g.lineTo(x + (r() - 0.5) * 2, y0 + len);
      g.stroke();
    }
    // Wet glints
    for (let i = 0; i < 90; i++) blob(r() * W, r() * H, L * 0.006, L * 0.003, '#b38c5e', 0.45);
    // Heavier toward the ground
    const gr = g.createLinearGradient(0, 0, 0, ground);
    gr.addColorStop(0, 'rgba(60,38,20,0)');
    gr.addColorStop(1, 'rgba(45,28,14,0.55)');
    g.globalAlpha = 1;
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  } else if (kind === 'dust') {
    g.fillStyle = '#b8ab90';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) blob(r() * W, r() * H, L * (0.002 + r() * 0.006), L * 0.003, r() < 0.5 ? '#cfc3a8' : '#9d907a', 0.5);
    // Smears and a finger-drawn line
    g.globalAlpha = 0.25;
    g.strokeStyle = '#e4dccb';
    g.lineWidth = L * 0.01;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      const x = r() * W;
      const y = r() * H;
      g.moveTo(x, y);
      g.quadraticCurveTo(x + L * 0.1, y - L * 0.05, x + L * 0.2, y + (r() - 0.5) * L * 0.1);
      g.stroke();
    }
    // Cobweb-grey toward the top
    const gr = g.createLinearGradient(0, 0, 0, ground);
    gr.addColorStop(0, 'rgba(220,214,200,0.35)');
    gr.addColorStop(1, 'rgba(120,110,95,0.25)');
    g.globalAlpha = 1;
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  } else if (kind === 'soot') {
    g.fillStyle = '#2b2725';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) blob(r() * W, r() * H, L * (0.02 + r() * 0.06), L * (0.015 + r() * 0.04), r() < 0.6 ? '#1a1716' : '#433d39', 0.6);
    for (let i = 0; i < 60; i++) blob(r() * W, r() * H, L * 0.01, L * 0.006, '#6b5e55', 0.35);
  } else if (kind === 'rust') {
    g.fillStyle = '#8a3b16';
    g.fillRect(0, 0, W, H);
    const cols = ['#a9521f', '#c26b2c', '#6e2c10', '#9a4519', '#d4843f'];
    for (let i = 0; i < 520; i++) blob(r() * W, r() * H, L * (0.005 + r() * 0.03), L * (0.004 + r() * 0.02), cols[i % cols.length], 0.5 + r() * 0.5);
    // Pitting
    for (let i = 0; i < 300; i++) blob(r() * W, r() * H, L * 0.003, L * 0.003, '#3d1405', 0.8);
    // Flaking paint edges
    for (let i = 0; i < 70; i++) blob(r() * W, r() * H, L * 0.008, L * 0.004, '#e8b07a', 0.5);
  } else if (kind === 'paint' && old) {
    // A respray: the car in its old paint, sun-faded and blotchy (the owner, 2026-10-17: a whole car of grey primer
    // «выглядит отвратительно»): the body's picture faded toward a dusty tone, its lines and glass still there
    g.fillStyle = mix(old, '#b8b2a6', 0.45);
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.6;
    g.drawImage(art.body, 0, 0, W, H);
    for (let i = 0; i < 160; i++) blob(r() * W, r() * H, L * (0.02 + r() * 0.06), L * (0.01 + r() * 0.03), mix(old, '#d8d2c4', 0.55), 0.3);
    for (let i = 0; i < 120; i++) blob(r() * W, r() * H, L * 0.006, L * 0.004, '#e8e2d6', 0.4);
    g.globalAlpha = 1;
  } else if (kind === 'paint') {
    g.fillStyle = '#8e949b';
    g.fillRect(0, 0, W, H);
    // Sanding swirls
    g.strokeStyle = 'rgba(220,226,232,0.4)';
    g.lineWidth = 1;
    for (let i = 0; i < 160; i++) {
      g.globalAlpha = 0.5;
      g.beginPath();
      g.arc(r() * W, r() * H, L * (0.01 + r() * 0.03), r() * 6, r() * 6 + 2);
      g.stroke();
    }
    for (let i = 0; i < 200; i++) blob(r() * W, r() * H, L * 0.008, L * 0.004, r() < 0.5 ? '#9fa6ae' : '#7a8088', 0.5);
  } else {
    // polish: a light dull haze (the car's paint and glass show through: a 62 % grey sheet read as an unpainted car, the
    // owner 2026-10-17) with swirl marks and fine scratches — the scratches are what the player polishes out
    g.fillStyle = 'rgba(214,220,228,0.22)';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(235,240,246,0.35)';
    g.lineWidth = 1;
    for (let i = 0; i < 90; i++) {
      g.globalAlpha = 0.4;
      g.beginPath();
      g.arc(r() * W, r() * H, L * (0.015 + r() * 0.04), r() * 6, r() * 6 + 2.5);
      g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineCap = 'round';
    for (let i = 0; i < 140; i++) {
      g.globalAlpha = 0.35 + r() * 0.5;
      g.lineWidth = 0.6 + r() * 0.9;
      const x = r() * W;
      const y = r() * H;
      const a = (r() - 0.5) * 0.6 + (r() < 0.2 ? 1.2 : 0);
      const len = L * (0.03 + r() * 0.16);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
    // Swirl marks
    for (let i = 0; i < 24; i++) {
      g.globalAlpha = 0.25;
      g.lineWidth = 0.8;
      g.beginPath();
      g.arc(r() * W, r() * H, L * (0.02 + r() * 0.03), 0, Math.PI * 2);
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  // Only on the vehicle
  g.globalCompositeOperation = 'destination-in';
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(art.silhouette, 0, 0);
  g.globalCompositeOperation = 'source-over';
  return c;
}

export class LayerViews {
  views: View[] = [];
  constructor(
    readonly car: Car,
    readonly art: CarArt,
  ) {
    const r = seeded(car.seed + 99);
    for (const layer of car.layers) {
      const tex = texture(layer.kind, art, r, car.respray ? car.oldColor : undefined);
      const g = tex.getContext('2d')!;
      const [mask, mg] = canvas2d(GRID.w, GRID.h);
      const img = mg.createImageData(GRID.w, GRID.h);
      this.views.push({ layer, canvas: tex, g, mask, mg, img, fade: 1, had: new Uint8Array(GRID.w * GRID.h).fill(1) });
    }
    this.sync(true);
  }

  /** A stroke landed: stamp the brush out of its layer */
  stamp(kind: LayerKind, gx: number, gy: number, rCells: number, bite: number, seed: number): void {
    const v = this.views.find((x) => x.layer.kind === kind);
    if (!v) return;
    const s = this.art.scale;
    const x = (gx / GRID.w) * this.art.w * s;
    const y = (gy / GRID.h) * this.art.h * s;
    const rpx = rCells * (this.art.w / GRID.w) * s * 1.05;
    const list = brush(rpx);
    const b = list[seed % list.length];
    const size = (rpx / (b.width / 2 - 2)) * b.width;
    v.g.save();
    v.g.globalCompositeOperation = 'destination-out';
    v.g.globalAlpha = Math.max(0.25, Math.min(1, bite * 1.15));
    v.g.drawImage(b, x - size / 2, y - size / 2, size, size);
    v.g.restore();
  }

  /** Where the simulation says a cell is clean, nothing stays (call after strokes; cheap when nothing changed) */
  private syncAt = 0;
  sync(force = false): void {
    // At most ~12 times a second: the brush stamps already show each stroke at once
    const now = performance.now();
    if (!force && now - this.syncAt < 80) return;
    this.syncAt = now;
    for (const v of this.views) {
      if (!v.layer.dirty && !force) continue;
      v.layer.dirty = false;
      const d = v.img.data;
      const a = v.layer.amt;
      let cut = false;
      for (let i = 0; i < a.length; i++) {
        const gone = v.had[i] && a[i] <= 0;
        d[i * 4 + 3] = gone ? 0 : 255;
        if (gone) {
          cut = true;
          v.had[i] = 0;
        }
      }
      if (!cut) continue;
      v.mg.putImageData(v.img, 0, 0);
      sg.clearRect(0, 0, soft.width, soft.height);
      sg.filter = 'blur(3px)';
      sg.drawImage(v.mask, 0, 0, soft.width, soft.height);
      sg.filter = 'none';
      v.g.save();
      v.g.globalCompositeOperation = 'destination-in';
      v.g.imageSmoothingEnabled = true;
      v.g.drawImage(soft, 0, 0, v.canvas.width, v.canvas.height);
      v.g.restore();
    }
  }

  /** Finished layers fade out over a moment */
  update(dt: number): void {
    for (const v of this.views) if (v.layer.left <= 0 && v.fade > 0) v.fade = Math.max(0, v.fade - dt * 3);
  }

  /** Draw every layer still there, the bottom one first (x, y: the box's top-left in CSS px) */
  draw(g: CanvasRenderingContext2D, x: number, y: number): void {
    for (let i = this.views.length - 1; i >= 0; i--) {
      const v = this.views[i];
      if (v.fade <= 0) continue;
      g.globalAlpha = v.fade;
      g.drawImage(v.canvas, x, y, this.art.w, this.art.h);
    }
    g.globalAlpha = 1;
  }
}
