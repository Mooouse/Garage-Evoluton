// The tools of each line and tier, drawn as real objects (the owner, 2026-10-17: «инструменты тоже выглядят устаревше»):
// each tier its own tool — a sponge, a garden hose, a pressure washer, a foam cannon, an industrial washer, a nano
// emitter; a wire brush to a plasma torch; a rag to a nano polisher; a spanner to a magnetic wrench; a spray can to a
// nano sprayer. Shaded metal and plastic lit from the upper left, a dark outline, a highlight; the top tiers glow.
// Drawn in a 64 × 64 box (the caller scales); the shop, the cursor and the cards all use it.

import { mix, shade } from '@gp/art/color';
import type { Cat } from './data.ts';

type Ctx = CanvasRenderingContext2D;
const INK = '#14161c';

const rr = (x: number, y: number, w: number, h: number, r: number) => {
  const p = new Path2D();
  p.roundRect(x, y, w, h, r);
  return p;
};
const circ = (x: number, y: number, r: number) => {
  const p = new Path2D();
  p.arc(x, y, r, 0, Math.PI * 2);
  return p;
};
const poly = (...pts: [number, number][]) => {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
};

/** Painted plastic or metal: lit top, shaded bottom, an outline */
function fill(g: Ctx, p: Path2D, c: string, y0: number, y1: number, line = 1.6): void {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, mix(c, '#ffffff', 0.5));
  gr.addColorStop(0.25, mix(c, '#ffffff', 0.12));
  gr.addColorStop(0.6, c);
  gr.addColorStop(1, shade(c, -0.45));
  g.fillStyle = gr;
  g.fill(p);
  g.strokeStyle = INK;
  g.lineWidth = line;
  g.stroke(p);
}
/** Polished steel: banded like a chrome tube */
function chrome(g: Ctx, p: Path2D, y0: number, y1: number, line = 1.4): void {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, '#f7f9fb');
  gr.addColorStop(0.35, '#aeb6c0');
  gr.addColorStop(0.5, '#e9edf2');
  gr.addColorStop(0.75, '#6f7783');
  gr.addColorStop(1, '#3a404a');
  g.fillStyle = gr;
  g.fill(p);
  g.strokeStyle = INK;
  g.lineWidth = line;
  g.stroke(p);
}
/** A streak of light along the top of a part */
function shine(g: Ctx, x0: number, y0: number, x1: number, y1: number, w = 1.6): void {
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}
function glow(g: Ctx, x: number, y: number, r: number, c: string, a = 0.8): void {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, mix(c, '#ffffff', 0.5));
  gr.addColorStop(0.3, c);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.save();
  g.globalAlpha = a;
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.restore();
}
function dots(g: Ctx, c: string, pts: [number, number, number][]): void {
  g.fillStyle = c;
  for (const [x, y, r] of pts) g.fill(circ(x, y, r));
}
function spray(g: Ctx, x: number, y: number, c: string, spread = 10, len = 14): void {
  g.strokeStyle = c;
  g.lineWidth = 2;
  g.lineCap = 'round';
  for (const a of [-0.45, -0.15, 0.15, 0.45]) {
    g.beginPath();
    g.moveTo(x + 2, y + a * 4);
    g.lineTo(x + len, y + a * spread * 1.4);
    g.stroke();
  }
}
/** A pistol grip with a trigger under a body at (x, y) */
function grip(g: Ctx, x: number, y: number, c: string, h = 18): void {
  fill(g, poly([x, y], [x + 9, y], [x + 7, y + h], [x - 3, y + h]), c, y, y + h);
  g.strokeStyle = INK;
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(x + 11, y + 1);
  g.quadraticCurveTo(x + 14, y + 7, x + 10, y + 9);
  g.stroke();
}

function wash(g: Ctx, tier: number): void {
  switch (tier) {
    case 0: {
      // A sponge with its pores, soap bubbles
      fill(g, rr(8, 22, 44, 26, 9), '#f2c94c', 22, 48);
      fill(g, rr(8, 40, 44, 8, 4), '#3fa45a', 40, 48);
      dots(g, 'rgba(150,100,20,0.45)', [[18, 30, 2.6], [29, 34, 2.1], [41, 28, 2.6], [24, 37, 1.8], [36, 37, 2]]);
      for (const [x, y, r] of [[48, 16, 6], [56, 26, 4], [40, 12, 3.5]] as const) {
        g.fillStyle = 'rgba(200,235,255,0.45)';
        g.fill(circ(x, y, r));
        g.strokeStyle = 'rgba(255,255,255,0.9)';
        g.lineWidth = 1.2;
        g.stroke(circ(x, y, r));
        dots(g, '#ffffff', [[x - r * 0.35, y - r * 0.35, r * 0.25]]);
      }
      break;
    }
    case 1: {
      // A garden hose coiled, a brass nozzle, a stream of water
      g.strokeStyle = INK;
      g.lineWidth = 8;
      for (const r of [14, 9]) {
        g.beginPath();
        g.ellipse(20, 42, r, r * 0.55, 0, 0, Math.PI * 2);
        g.stroke();
      }
      g.strokeStyle = '#3fa45a';
      g.lineWidth = 5.5;
      for (const r of [14, 9]) {
        g.beginPath();
        g.ellipse(20, 42, r, r * 0.55, 0, 0, Math.PI * 2);
        g.stroke();
      }
      g.strokeStyle = 'rgba(255,255,255,0.4)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(20, 41, 14, 7.2, 0, Math.PI * 1.1, Math.PI * 1.7);
      g.stroke();
      g.strokeStyle = INK;
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(32, 38);
      g.quadraticCurveTo(38, 26, 42, 22);
      g.stroke();
      g.strokeStyle = '#3fa45a';
      g.lineWidth = 4.5;
      g.stroke();
      const brass = poly([40, 18], [52, 14], [54, 20], [44, 26]);
      fill(g, brass, '#d4a23a', 14, 26);
      spray(g, 54, 16, '#7fd4ff', 8, 10);
      break;
    }
    case 2: {
      // A pressure washer gun: yellow body, black grip, a steel lance, a fan of water
      fill(g, rr(6, 22, 26, 12, 5), '#f2c22e', 22, 34);
      grip(g, 12, 32, '#2b2e36');
      chrome(g, rr(30, 25, 22, 6, 3), 25, 31);
      fill(g, rr(50, 23, 6, 10, 2), '#2b2e36', 23, 33);
      shine(g, 9, 24, 28, 24);
      spray(g, 56, 28, '#7fd4ff', 12, 8);
      break;
    }
    case 3: {
      // A foam cannon: the gun with a clear bottle of foam on top, a blob of foam out of the nozzle
      fill(g, rr(6, 30, 24, 11, 5), '#e0402e', 30, 41);
      grip(g, 11, 39, '#2b2e36', 16);
      g.fillStyle = 'rgba(220,240,255,0.55)';
      g.fill(rr(14, 6, 16, 24, 5));
      g.strokeStyle = INK;
      g.lineWidth = 1.5;
      g.stroke(rr(14, 6, 16, 24, 5));
      g.fillStyle = 'rgba(255,190,220,0.85)';
      g.fill(rr(15.5, 16, 13, 13, 4));
      shine(g, 17, 9, 17, 26, 1.4);
      chrome(g, rr(28, 32, 14, 6, 3), 32, 38);
      dots(g, '#ffffff', [[48, 33, 6], [55, 29, 5], [56, 38, 4.5], [61, 33, 3.5]]);
      g.strokeStyle = 'rgba(180,200,220,0.9)';
      g.lineWidth = 1;
      for (const [x, y, r] of [[48, 33, 6], [55, 29, 5], [56, 38, 4.5]] as const) g.stroke(circ(x, y, r));
      break;
    }
    case 4: {
      // An industrial washer: a red pump on wheels with a gauge, its hose to a long heavy lance
      fill(g, rr(4, 30, 26, 22, 4), '#c0392b', 30, 52);
      fill(g, circ(10, 54, 5), '#2b2e36', 49, 59);
      fill(g, circ(25, 54, 5), '#2b2e36', 49, 59);
      fill(g, circ(17, 39, 6), '#f4f6f8', 33, 45);
      g.strokeStyle = '#c0392b';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(17, 39);
      g.lineTo(20, 35);
      g.stroke();
      g.strokeStyle = INK;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(28, 32);
      g.quadraticCurveTo(34, 16, 40, 18);
      g.stroke();
      chrome(g, poly([36, 14], [58, 8], [59, 13], [37, 19]), 8, 19);
      fill(g, rr(34, 13, 8, 10, 2), '#2b2e36', 13, 23);
      spray(g, 59, 10, '#7fd4ff', 10, 6);
      break;
    }
    default: {
      // A nano emitter: a white shell with cyan rings, a beam of mist
      glow(g, 52, 28, 14, '#5ff6ff', 0.7);
      fill(g, rr(6, 22, 34, 13, 6), '#eef2f6', 22, 35);
      grip(g, 12, 33, '#2b2e36', 16);
      for (const x of [18, 26, 34]) {
        g.strokeStyle = '#5ff6ff';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, 23);
        g.lineTo(x, 34);
        g.stroke();
      }
      fill(g, poly([40, 24], [48, 26], [48, 31], [40, 33]), '#2b2e36', 24, 33);
      g.fillStyle = 'rgba(127,246,255,0.55)';
      g.fill(poly([48, 27], [62, 20], [62, 37], [48, 30]));
      dots(g, '#ffffff', [[54, 26, 1.2], [58, 31, 1], [60, 24, 1.1]]);
    }
  }
}

function grind(g: Ctx, tier: number): void {
  switch (tier) {
    case 0: {
      // A wire brush: a wooden handle with its grain, steel bristles
      fill(g, poly([4, 36], [36, 28], [38, 36], [6, 44]), '#a0683a', 28, 44);
      g.strokeStyle = 'rgba(70,40,15,0.45)';
      g.lineWidth = 1;
      for (const k of [0, 3]) {
        g.beginPath();
        g.moveTo(8, 38 + k);
        g.lineTo(34, 32 + k);
        g.stroke();
      }
      fill(g, rr(34, 22, 24, 10, 3), '#8a929c', 22, 32);
      g.strokeStyle = '#4b525c';
      g.lineWidth = 1.2;
      for (let x = 36; x < 58; x += 2.5) {
        g.beginPath();
        g.moveTo(x, 32);
        g.lineTo(x + 1, 44);
        g.stroke();
      }
      break;
    }
    case 1: {
      // An angle grinder: the motor body, a side handle, the guard over a spinning disc, sparks
      fill(g, rr(4, 24, 32, 14, 7), '#2a8fd8', 24, 38);
      fill(g, rr(6, 28, 12, 6, 3), '#2b2e36', 28, 34);
      fill(g, rr(30, 10, 6, 16, 3), '#2b2e36', 10, 26);
      fill(g, poly([34, 22], [42, 22], [44, 30], [34, 32]), '#5a616c', 22, 32);
      chrome(g, circ(46, 36, 13), 23, 49);
      g.strokeStyle = 'rgba(40,44,52,0.45)';
      g.lineWidth = 1;
      for (let a = 0; a < Math.PI; a += Math.PI / 4) {
        g.beginPath();
        g.moveTo(46 + Math.cos(a) * 12, 36 + Math.sin(a) * 12);
        g.lineTo(46 - Math.cos(a) * 12, 36 - Math.sin(a) * 12);
        g.stroke();
      }
      g.fillStyle = 'rgba(80,86,96,0.85)';
      g.fill((() => { const p = new Path2D(); p.arc(46, 36, 14.5, Math.PI * 1.05, Math.PI * 1.85); p.lineTo(46, 36); p.closePath(); return p; })());
      g.strokeStyle = '#ffb02e';
      g.lineWidth = 1.6;
      for (const [x0, y0, x1, y1] of [[54, 46, 61, 52], [57, 42, 63, 45], [50, 49, 54, 57]]) {
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
      }
      break;
    }
    case 2: {
      // A sandblaster: a gun under a funnel hopper of sand, a cone of grit
      fill(g, poly([12, 4], [34, 4], [27, 18], [19, 18]), '#c9ced6', 4, 18);
      g.fillStyle = '#d9b46a';
      g.fill(poly([14, 7], [32, 7], [26, 16], [20, 16]));
      fill(g, rr(6, 20, 34, 12, 5), '#7a5a3a', 20, 32);
      grip(g, 12, 30, '#2b2e36');
      chrome(g, rr(38, 23, 12, 6, 2), 23, 29);
      dots(g, '#d9b46a', [[54, 24, 1.6], [58, 28, 1.4], [55, 31, 1.5], [60, 23, 1.2], [61, 32, 1.1], [57, 35, 1.3], [52, 28, 1.2]]);
      break;
    }
    case 3: {
      // A needle scaler: a pneumatic barrel, a bundle of needles hammering, the air hose
      g.strokeStyle = INK;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(4, 52);
      g.quadraticCurveTo(6, 38, 12, 34);
      g.stroke();
      chrome(g, rr(10, 26, 30, 14, 6), 26, 40);
      fill(g, rr(14, 28, 8, 10, 2), '#e86a1a', 28, 38);
      fill(g, rr(38, 28, 6, 10, 2), '#2b2e36', 28, 38);
      g.strokeStyle = '#c9ced6';
      g.lineWidth = 1.2;
      for (let y = 29; y <= 37; y += 2) {
        g.beginPath();
        g.moveTo(44, y);
        g.lineTo(58 + ((y * 7) % 4), y);
        g.stroke();
      }
      dots(g, '#ffb02e', [[61, 30, 1.3], [62, 35, 1.1]]);
      break;
    }
    case 4: {
      // A laser cleaner: a sleek head, a red beam, a hot spot
      fill(g, rr(6, 24, 30, 13, 6), '#2b2e36', 24, 37);
      grip(g, 12, 35, '#2b2e36', 16);
      fill(g, poly([34, 26], [44, 27], [44, 34], [34, 35]), '#c9ced6', 26, 35);
      g.strokeStyle = '#ff3b3b';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(44, 30.5);
      g.lineTo(60, 30.5);
      g.stroke();
      glow(g, 60, 30.5, 8, '#ff3b3b', 0.9);
      g.strokeStyle = '#ff3b3b';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(12, 30);
      g.lineTo(30, 30);
      g.stroke();
      break;
    }
    default: {
      // A plasma torch: a ceramic nozzle, a violet-blue arc of plasma
      fill(g, rr(4, 26, 30, 11, 5), '#5a616c', 26, 37);
      fill(g, rr(8, 28, 10, 7, 3), '#b26bff', 28, 35);
      fill(g, poly([32, 27], [44, 29], [44, 34], [32, 36]), '#e6dccb', 27, 36);
      glow(g, 52, 31.5, 14, '#7a5cff', 0.85);
      g.strokeStyle = '#e8e2ff';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(44, 31.5);
      g.lineTo(50, 28);
      g.lineTo(53, 33);
      g.lineTo(59, 29);
      g.stroke();
    }
  }
}

function polish(g: Ctx, tier: number): void {
  switch (tier) {
    case 0: {
      // A folded microfibre cloth, a gleam
      fill(g, poly([8, 30], [40, 18], [54, 30], [22, 44]), '#4aa8ff', 18, 44);
      fill(g, poly([8, 30], [22, 44], [22, 50], [8, 38]), '#2a7fd0', 30, 50);
      fill(g, poly([22, 44], [54, 30], [54, 37], [22, 50]), '#2f8be0', 30, 50);
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.moveTo(14 + k * 7, 28 - k * 2.5);
        g.lineTo(26 + k * 7, 38 - k * 2.5);
        g.stroke();
      }
      break;
    }
    case 1: {
      // An orbital sander: a palm grip on a round pad
      fill(g, rr(18, 10, 28, 20, 10), '#f2c22e', 10, 30);
      fill(g, rr(14, 28, 36, 8, 3), '#2b2e36', 28, 36);
      fill(g, rr(10, 36, 44, 8, 4), '#d9dee5', 36, 44);
      shine(g, 22, 13, 40, 13);
      break;
    }
    case 2: {
      // A rotary polisher: a long body, a side handle, a big foam pad at its head
      fill(g, rr(4, 24, 36, 12, 6), '#e0402e', 24, 36);
      fill(g, rr(8, 12, 6, 14, 3), '#2b2e36', 12, 26);
      fill(g, rr(38, 22, 8, 16, 2), '#5a616c', 22, 38);
      fill(g, rr(46, 12, 10, 36, 5), '#f2c94c', 12, 48);
      g.strokeStyle = 'rgba(120,80,10,0.4)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(51, 14);
      g.lineTo(51, 46);
      g.stroke();
      break;
    }
    case 3: {
      // A dual-action polisher: compact, its orange foam pad wobbling
      fill(g, rr(8, 14, 34, 14, 7), '#b26bff', 14, 28);
      fill(g, rr(14, 26, 10, 18, 4), '#2b2e36', 26, 44);
      fill(g, rr(36, 24, 10, 8, 2), '#5a616c', 24, 32);
      fill(g, rr(30, 32, 24, 10, 5), '#ff8a2e', 32, 42);
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.ellipse(42, 47, 12, 2.5, 0, 0, Math.PI);
      g.stroke();
      break;
    }
    case 4: {
      // A ceramic coat: a dark bottle with its label, an applicator block, a glossy drop
      fill(g, rr(10, 14, 16, 34, 4), '#1f2a44', 14, 48);
      fill(g, rr(14, 6, 8, 9, 2), '#c9ced6', 6, 15);
      fill(g, rr(11, 26, 14, 10, 2), '#d4af37', 26, 36);
      fill(g, rr(32, 34, 24, 12, 4), '#2b2e36', 34, 46);
      fill(g, rr(32, 30, 24, 6, 3), '#4aa8ff', 30, 36);
      const drop = new Path2D();
      drop.moveTo(46, 8);
      drop.quadraticCurveTo(54, 18, 50, 22);
      drop.quadraticCurveTo(46, 25, 42, 22);
      drop.quadraticCurveTo(38, 18, 46, 8);
      fill(g, drop, '#7fd4ff', 8, 24);
      dots(g, '#ffffff', [[44, 17, 1.5]]);
      break;
    }
    default: {
      // A nano polisher: a hovering pad with a violet glow ring
      glow(g, 32, 40, 22, '#b26bff', 0.6);
      fill(g, rr(14, 14, 36, 14, 7), '#eef2f6', 14, 28);
      fill(g, rr(20, 18, 24, 6, 3), '#2b2e36', 18, 24);
      g.strokeStyle = '#d6a8ff';
      g.lineWidth = 2.5;
      g.beginPath();
      g.ellipse(32, 40, 20, 5, 0, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(32, 40, 13, 3, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  // A star of gloss
  g.fillStyle = '#ffffff';
  const s = new Path2D();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? 1.6 : 5;
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    if (i) s.lineTo(56 + Math.cos(a) * r, 10 + Math.sin(a) * r);
    else s.moveTo(56 + Math.cos(a) * r, 10 + Math.sin(a) * r);
  }
  s.closePath();
  g.fill(s);
}

function wrench(g: Ctx, tier: number): void {
  switch (tier) {
    case 0: {
      // A combination spanner: an open jaw and a ring, chrome (stroked, no holes cut)
      g.save();
      g.translate(32, 32);
      g.rotate(-0.7);
      chrome(g, rr(-4, -14, 8, 30, 3), -14, 16);
      const ring = (cx: number, cy: number, r: number, from: number, to: number) => {
        for (const [w, c] of [[r * 0.75, INK], [r * 0.55, '#c9d0d8']] as const) {
          g.strokeStyle = c;
          g.lineWidth = w;
          g.lineCap = 'butt';
          g.beginPath();
          g.arc(cx, cy, r, from, to);
          g.stroke();
        }
        g.strokeStyle = 'rgba(255,255,255,0.8)';
        g.lineWidth = r * 0.15;
        g.beginPath();
        g.arc(cx, cy, r * 1.1, from + 0.3, Math.min(to, from + 1.6));
        g.stroke();
      };
      ring(0, -20, 8, -Math.PI * 0.25, Math.PI * 1.25);
      ring(0, 22, 6.5, 0, Math.PI * 2);
      g.restore();
      break;
    }
    case 1: {
      // A ratchet: a red grip, a round head, a socket
      g.save();
      g.translate(32, 32);
      g.rotate(-0.7);
      chrome(g, rr(-4, -12, 8, 22, 3), -12, 10);
      fill(g, rr(-5, 8, 10, 18, 4), '#e0402e', 8, 26);
      chrome(g, circ(0, -16, 9), -25, -7);
      fill(g, circ(0, -16, 4), '#5a616c', -20, -12);
      g.restore();
      break;
    }
    case 2: {
      // A cordless impact wrench: a yellow body, the battery pack, a socket at its nose
      fill(g, rr(8, 16, 30, 14, 6), '#f2c22e', 16, 30);
      grip(g, 14, 28, '#2b2e36', 16);
      fill(g, rr(8, 44, 22, 10, 3), '#2b2e36', 44, 54);
      fill(g, rr(10, 46, 6, 3, 1), '#5fd06a', 46, 49);
      chrome(g, rr(36, 19, 10, 8, 2), 19, 27);
      chrome(g, rr(46, 18, 10, 10, 2), 18, 28);
      shine(g, 11, 18, 34, 18);
      break;
    }
    case 3: {
      // A pneumatic impact gun: a grey body, its coiled air hose
      fill(g, rr(8, 16, 32, 15, 6), '#7a8088', 16, 31);
      grip(g, 14, 29, '#2b2e36', 18);
      chrome(g, rr(38, 19, 16, 9, 2), 19, 28);
      g.strokeStyle = '#2a8fd8';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(17, 47);
      for (let k = 0; k < 4; k++) g.arc(20 + k * 7, 52, 4, Math.PI, 0, k % 2 === 1);
      g.stroke();
      break;
    }
    case 4: {
      // A digital torque wrench: a long arm with a green screen
      g.save();
      g.translate(32, 32);
      g.rotate(-0.6);
      chrome(g, rr(-4, -22, 8, 30, 3), -22, 8);
      fill(g, rr(-6, 6, 12, 22, 4), '#2b2e36', 6, 28);
      fill(g, rr(-4, 9, 8, 7, 1), '#5fd06a', 9, 16);
      chrome(g, circ(0, -24, 8), -32, -16);
      g.restore();
      break;
    }
    default: {
      // A magnetic wrench: a dark tool in blue field lines
      glow(g, 40, 22, 18, '#4aa8ff', 0.6);
      g.save();
      g.translate(32, 32);
      g.rotate(-0.7);
      fill(g, rr(-4, -12, 8, 30, 3), '#2b2e36', -12, 18);
      fill(g, circ(0, -16, 9), '#4aa8ff', -25, -7);
      fill(g, circ(0, -16, 4), '#eef3f8', -20, -12);
      g.restore();
      g.strokeStyle = '#9fd8ff';
      g.lineWidth = 1.5;
      for (const r of [14, 20]) {
        g.beginPath();
        g.arc(42, 20, r, Math.PI * 1.2, Math.PI * 1.9);
        g.stroke();
      }
    }
  }
}

function paint(g: Ctx, tier: number): void {
  switch (tier) {
    case 0: {
      // A spray can: the can with its band, the cap's nozzle, a puff of paint
      fill(g, rr(14, 18, 22, 36, 6), '#ff4f7a', 18, 54);
      fill(g, rr(14, 30, 22, 10, 2), '#f4f6f8', 30, 40);
      chrome(g, rr(18, 10, 14, 9, 3), 10, 19);
      fill(g, rr(22, 6, 6, 5, 1), '#2b2e36', 6, 11);
      shine(g, 18, 22, 18, 50, 1.6);
      dots(g, 'rgba(255,79,122,0.6)', [[36, 8, 3], [42, 6, 2.4], [42, 12, 2.6], [48, 9, 2]]);
      break;
    }
    case 1: {
      // A gravity spray gun: the cup on top, the body, a fan of paint
      fill(g, rr(18, 4, 14, 14, 4), '#c9ced6', 4, 18);
      fill(g, rr(8, 18, 34, 12, 5), '#5a616c', 18, 30);
      grip(g, 14, 28, '#2b2e36', 18);
      chrome(g, rr(40, 21, 8, 6, 2), 21, 27);
      g.fillStyle = 'rgba(255,79,122,0.45)';
      g.fill(poly([48, 22], [62, 15], [62, 33], [48, 26]));
      break;
    }
    case 2: {
      // An HVLP gun: a bigger cup, an air gauge, a soft wide fan
      fill(g, rr(16, 2, 18, 16, 5), '#eef2f6', 2, 18);
      fill(g, rr(8, 18, 34, 12, 5), '#2a8fd8', 18, 30);
      grip(g, 14, 28, '#2b2e36', 18);
      fill(g, circ(12, 46, 6), '#f4f6f8', 40, 52);
      g.strokeStyle = '#e0402e';
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(12, 46);
      g.lineTo(15, 43);
      g.stroke();
      chrome(g, rr(40, 21, 8, 6, 2), 21, 27);
      g.fillStyle = 'rgba(79,170,255,0.4)';
      g.fill(poly([48, 22], [63, 12], [63, 36], [48, 26]));
      break;
    }
    case 3: {
      // An airless sprayer: a slim gun with a long tip, its high-pressure hose
      fill(g, rr(8, 22, 26, 10, 4), '#e86a1a', 22, 32);
      grip(g, 12, 30, '#2b2e36', 18);
      chrome(g, rr(32, 25, 20, 4, 2), 25, 29);
      fill(g, rr(50, 23, 5, 8, 1), '#2b2e36', 23, 31);
      g.strokeStyle = INK;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(16, 48);
      g.quadraticCurveTo(10, 58, 2, 56);
      g.stroke();
      g.fillStyle = 'rgba(232,106,26,0.5)';
      g.fill(poly([55, 25], [63, 18], [63, 36], [55, 29]));
      break;
    }
    case 4: {
      // An electrostatic gun: a lightning mark, the charged mist wrapping toward the panel
      fill(g, rr(8, 20, 32, 12, 5), '#2b2e36', 20, 32);
      grip(g, 14, 30, '#2b2e36', 18);
      fill(g, poly([22, 22], [18, 27], [22, 27], [19, 31], [26, 25], [22, 25]), '#f2c22e', 22, 31, 0.8);
      chrome(g, rr(38, 23, 10, 6, 2), 23, 29);
      g.strokeStyle = 'rgba(255,215,90,0.85)';
      g.lineWidth = 1.5;
      for (const k of [-6, 0, 6]) {
        g.beginPath();
        g.moveTo(48, 26);
        g.quadraticCurveTo(56, 26 + k * 0.5, 62, 26 + k);
        g.stroke();
      }
      dots(g, 'rgba(255,79,122,0.6)', [[56, 22, 1.6], [58, 30, 1.4], [61, 26, 1.5]]);
      break;
    }
    default: {
      // A nano sprayer: a white emitter with a prism mist
      glow(g, 52, 27, 14, '#ff4f7a', 0.5);
      fill(g, rr(6, 20, 34, 13, 6), '#eef2f6', 20, 33);
      grip(g, 12, 31, '#2b2e36', 16);
      for (const [x, c] of [[18, '#ff4f7a'], [24, '#f2c22e'], [30, '#5ff6ff']] as const) {
        g.strokeStyle = c;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, 21);
        g.lineTo(x, 32);
        g.stroke();
      }
      const fan = g.createLinearGradient(40, 0, 63, 0);
      fan.addColorStop(0, 'rgba(255,79,122,0.6)');
      fan.addColorStop(0.5, 'rgba(242,194,46,0.5)');
      fan.addColorStop(1, 'rgba(95,246,255,0.3)');
      g.fillStyle = fan;
      g.fill(poly([40, 24], [63, 15], [63, 38], [40, 29]));
    }
  }
}

/** Draw the tool of line `cat` at tier `tier` in the 64 × 64 box */
export function drawTool(g: Ctx, cat: Cat, tier: number): void {
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  ({ wash, grind, polish, wrench, paint })[cat](g, tier);
  g.restore();
}
