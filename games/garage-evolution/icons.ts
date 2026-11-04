// Every icon is drawn in code, in the game's style (the platform's lesson: emoji and OS glyphs as icons read as a
// prototype): the tools of each line and tier, the robots, the work types, the garage levels, money, stars, the
// album, statistics, sound, the gate. drawIcon() paints one on a canvas; iconUrl() gives a cached data: URL for the DOM.

import { canvas2d } from '@gp/art/bake';
import { mix, shade } from '@gp/art/color';
import { TOOLS, type Cat } from './data.ts';
import { drawTool } from './tool-art.ts';

type Ctx = CanvasRenderingContext2D;

const INK = '#1b1e26';

function body(g: Ctx, p: Path2D, color: string, y0: number, y1: number, line = 1.6): void {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, mix(color, '#ffffff', 0.35));
  gr.addColorStop(0.55, color);
  gr.addColorStop(1, shade(color, -0.4));
  g.fillStyle = gr;
  g.fill(p);
  g.strokeStyle = shade(color, -0.7);
  g.lineWidth = line;
  g.lineJoin = 'round';
  g.stroke(p);
}

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

/** The tool colour per tier: plain → steel → yellow → red → black-gold → cyan glow */
const TIER_COLORS = ['#f2c94c', '#4caf50', '#f2c22e', '#e0402e', '#2b2e36', '#5ff6ff', '#b26bff'];

/** Draw icon `id` in a box of `s` px at 0,0 */
export function drawIcon(g: Ctx, id: string, s: number): void {
  g.save();
  g.scale(s / 64, s / 64);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const [kind, arg] = id.split(':');
  const tier = Number(arg ?? 0);
  switch (kind) {
    case 'wash':
    case 'grind':
    case 'polish':
    case 'wrench':
    case 'paint': {
      // Each tier its own tool, drawn as the real thing (tool-art.ts)
      drawTool(g, kind, tier);
      break;
    }
    case 'washbot':
    case 'grindarm':
    case 'polishdrone':
    case 'wrenchbot':
    case 'paintbooth': {
      drawRobotIcon(g, kind);
      break;
    }
    case 'mud':
    case 'dust':
    case 'soot': {
      const c = kind === 'mud' ? '#6e4b2c' : kind === 'dust' ? '#b8ab90' : '#2b2725';
      body(g, blobPath(32, 34, 22, 7), c, 12, 56);
      g.fillStyle = mix(c, '#ffffff', 0.3);
      g.fill(circ(24, 26, 4));
      g.fill(circ(40, 40, 3));
      break;
    }
    case 'rust': {
      body(g, rr(10, 14, 44, 36, 6), '#9aa1ab', 14, 50);
      g.fillStyle = '#a9521f';
      g.fill(blobPath(30, 34, 14, 3));
      g.fillStyle = '#5e2610';
      for (const [x, y] of [[26, 30], [34, 38], [30, 40]]) g.fill(circ(x, y, 1.8));
      break;
    }
    case 'scratch': {
      body(g, rr(10, 14, 44, 36, 6), '#4a7bd0', 14, 50);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      for (const [a, b, c2, d] of [[16, 22, 44, 30], [20, 34, 50, 38], [14, 44, 34, 40]]) {
        g.beginPath();
        g.moveTo(a, b);
        g.lineTo(c2, d);
        g.stroke();
      }
      break;
    }
    case 'primer': {
      body(g, rr(10, 14, 44, 36, 6), '#8e949b', 14, 50);
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(28, 30, 8, 0, 4);
      g.stroke();
      break;
    }
    case 'dent': {
      // A panel with a hollow in it, and the suction cup's handle
      body(g, rr(8, 16, 48, 34, 6), '#4a7fc0', 16, 50);
      const dg = g.createRadialGradient(26, 30, 1, 30, 34, 11);
      dg.addColorStop(0, 'rgba(0,0,0,0.55)');
      dg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = dg;
      g.beginPath();
      g.ellipse(30, 34, 11, 9, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(30, 34, 9, 7, 0, 0.2, 2.4);
      g.stroke();
      g.strokeStyle = '#ffb02e';
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(38, 26);
      g.lineTo(52, 10);
      g.stroke();
      break;
    }
    case 'parts': {
      drawWheelIcon(g, 32, 32, 22);
      break;
    }
    case 'engine': {
      body(g, rr(12, 22, 40, 26, 4), '#7a8088', 22, 48);
      body(g, rr(18, 14, 8, 10, 2), '#9aa1ab', 14, 24);
      body(g, rr(30, 14, 8, 10, 2), '#9aa1ab', 14, 24);
      body(g, rr(42, 26, 12, 8, 2), '#c0392b', 26, 34);
      g.strokeStyle = '#3fffd8';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(8, 56);
      g.lineTo(20, 56);
      g.lineTo(24, 50);
      g.lineTo(30, 60);
      g.lineTo(34, 54);
      g.lineTo(56, 54);
      g.stroke();
      break;
    }
    case 'nozzle': {
      // A rocket nozzle's bell with its flame
      const fl = g.createLinearGradient(8, 32, 30, 32);
      fl.addColorStop(0, 'rgba(255,90,40,0)');
      fl.addColorStop(0.5, '#ff8a2e');
      fl.addColorStop(1, '#fff3c4');
      g.fillStyle = fl;
      g.beginPath();
      g.moveTo(30, 22);
      g.quadraticCurveTo(6, 26, 2, 32);
      g.quadraticCurveTo(6, 38, 30, 42);
      g.fill();
      body(g, ((p: Path2D) => (p.moveTo(26, 14), p.lineTo(46, 24), p.lineTo(46, 40), p.lineTo(26, 50), p.closePath(), p))(new Path2D()), '#9aa1ab', 14, 50);
      body(g, rr(44, 20, 14, 24, 3), '#5e6672', 20, 44);
      break;
    }
    case 'lights': {
      g.fillStyle = 'rgba(255,240,180,0.4)';
      g.beginPath();
      g.moveTo(26, 26);
      g.lineTo(62, 12);
      g.lineTo(62, 52);
      g.lineTo(26, 38);
      g.fill();
      body(g, circ(22, 32, 12), '#fff6d0', 20, 44);
      break;
    }
    case 'garage': {
      const lvl = tier || 1;
      const roof = ['#7a5236', '#9b5b45', '#2a6fb0', '#2c2e38', '#56606b', '#9aa8bb'][(lvl - 1) % 6];
      const p = new Path2D();
      p.moveTo(6, 30);
      p.lineTo(32, 10);
      p.lineTo(58, 30);
      p.lineTo(58, 56);
      p.lineTo(6, 56);
      p.closePath();
      body(g, p, mix(roof, '#ffffff', 0.25), 10, 56);
      body(g, rr(16, 32, 32, 24, 2), '#9aa1ab', 32, 56);
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 1.5;
      for (let y = 36; y < 56; y += 4) {
        g.beginPath();
        g.moveTo(16, y);
        g.lineTo(48, y);
        g.stroke();
      }
      if (lvl >= 6) {
        g.fillStyle = '#ffffff';
        g.fill(star(50, 14, 6));
      }
      break;
    }
    case 'coin': {
      const gr = g.createRadialGradient(26, 24, 2, 32, 32, 26);
      gr.addColorStop(0, '#fff6c2');
      gr.addColorStop(0.5, '#ffc93c');
      gr.addColorStop(1, '#b07a12');
      g.fillStyle = gr;
      g.fill(circ(32, 32, 24));
      g.strokeStyle = '#7a520a';
      g.lineWidth = 2.5;
      g.stroke(circ(32, 32, 24));
      g.stroke(circ(32, 32, 17));
      g.fillStyle = '#8a5a0a';
      g.font = '900 26px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('$', 32, 33);
      break;
    }
    case 'star': {
      body(g, star(32, 33, 26), '#ffc93c', 7, 59, 2);
      break;
    }
    case 'album': {
      body(g, rr(10, 8, 44, 50, 5), '#7d1d2c', 8, 58);
      body(g, rr(16, 16, 32, 22, 3), '#e6e9ef', 16, 38);
      g.fillStyle = '#2a6fb0';
      g.beginPath();
      g.moveTo(19, 34);
      g.quadraticCurveTo(24, 24, 32, 25);
      g.quadraticCurveTo(42, 24, 45, 34);
      g.closePath();
      g.fill();
      g.fillStyle = INK;
      g.fill(circ(24, 34, 3));
      g.fill(circ(40, 34, 3));
      g.fillStyle = '#ffc93c';
      g.fillRect(16, 44, 32, 4);
      break;
    }
    case 'stats': {
      body(g, rr(8, 8, 48, 48, 8), '#2b3a55', 8, 56);
      const bars = [16, 26, 20, 34];
      bars.forEach((v, i) => {
        g.fillStyle = ['#5ff6ff', '#ffc93c', '#5fd06a', '#ff7a7a'][i];
        g.fillRect(16 + i * 9, 48 - v, 6, v);
      });
      break;
    }
    case 'sound':
    case 'mute': {
      body(g, (() => {
        const p = new Path2D();
        p.moveTo(10, 24);
        p.lineTo(22, 24);
        p.lineTo(36, 12);
        p.lineTo(36, 52);
        p.lineTo(22, 40);
        p.lineTo(10, 40);
        p.closePath();
        return p;
      })(), '#e6e9ef', 12, 52);
      g.strokeStyle = kind === 'sound' ? '#e6e9ef' : '#ff6b6b';
      g.lineWidth = 4;
      g.beginPath();
      if (kind === 'sound') {
        g.arc(36, 32, 12, -0.8, 0.8);
        g.moveTo(36 + Math.cos(-0.8) * 20, 32 + Math.sin(-0.8) * 20);
        g.arc(36, 32, 20, -0.8, 0.8);
      } else {
        g.moveTo(44, 22);
        g.lineTo(60, 42);
        g.moveTo(60, 22);
        g.lineTo(44, 42);
      }
      g.stroke();
      break;
    }
    case 'prev':
    case 'next': {
      // A pager's arrow: a chunky chevron (the font's ◀ ▶ read as a web page: QA E_QA_GLYPH_ICON)
      const p = new Path2D();
      const r = id === 'next';
      const x = (v: number) => (r ? v : 64 - v);
      p.moveTo(x(20), 12);
      p.lineTo(x(48), 32);
      p.lineTo(x(20), 52);
      p.lineTo(x(20), 40);
      p.lineTo(x(32), 32);
      p.lineTo(x(20), 24);
      p.closePath();
      body(g, p, '#e6e9ef', 12, 52);
      break;
    }
    case 'pause': {
      body(g, rr(16, 12, 12, 40, 3), '#e6e9ef', 12, 52);
      body(g, rr(36, 12, 12, 40, 3), '#e6e9ef', 12, 52);
      break;
    }
    case 'gate': {
      body(g, rr(6, 14, 52, 42, 4), '#56606b', 14, 56);
      g.fillStyle = '#ffc93c';
      g.fill(star(32, 34, 13));
      g.strokeStyle = 'rgba(0,0,0,0.3)';
      g.lineWidth = 1.5;
      for (let y = 18; y < 56; y += 5) {
        g.beginPath();
        g.moveTo(6, y);
        g.lineTo(14, y);
        g.moveTo(50, y);
        g.lineTo(58, y);
        g.stroke();
      }
      break;
    }
    case 'map': {
      // A folded map with a route and a pin
      const fold = new Path2D();
      fold.moveTo(6, 14);
      fold.lineTo(22, 8);
      fold.lineTo(42, 14);
      fold.lineTo(58, 8);
      fold.lineTo(58, 50);
      fold.lineTo(42, 56);
      fold.lineTo(22, 50);
      fold.lineTo(6, 56);
      fold.closePath();
      body(g, fold, '#7fcf8a', 8, 56);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.beginPath();
      g.moveTo(22, 8);
      g.lineTo(42, 14);
      g.lineTo(42, 56);
      g.lineTo(22, 50);
      g.closePath();
      g.fill();
      g.strokeStyle = '#ffffff';
      g.setLineDash([3, 3]);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(12, 46);
      g.quadraticCurveTo(26, 22, 44, 30);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#e8342c';
      g.beginPath();
      g.arc(46, 24, 7, Math.PI, 0);
      g.lineTo(46, 38);
      g.closePath();
      g.fill();
      g.fillStyle = '#ffffff';
      g.fill(circ(46, 24, 2.6));
      break;
    }
    case 'chain': {
      // The International Chain: a globe with pins
      const gr = g.createRadialGradient(24, 22, 3, 32, 32, 26);
      gr.addColorStop(0, '#9be7ff');
      gr.addColorStop(1, '#1f5f9a');
      g.fillStyle = gr;
      g.fill(circ(32, 32, 24));
      g.fillStyle = '#5fd06a';
      g.fill(blobPath(26, 28, 9, 11));
      g.fill(blobPath(42, 40, 7, 5));
      g.strokeStyle = '#0d2f50';
      g.lineWidth = 2;
      g.stroke(circ(32, 32, 24));
      g.fillStyle = '#ff4f7a';
      for (const [x, y] of [[24, 24], [40, 36], [30, 44]]) g.fill(circ(x, y, 3.5));
      break;
    }
    case 'clock': {
      body(g, circ(32, 32, 24), '#e6e9ef', 8, 56);
      g.strokeStyle = INK;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(32, 32);
      g.lineTo(32, 16);
      g.moveTo(32, 32);
      g.lineTo(44, 38);
      g.stroke();
      break;
    }
    case 'trophy': {
      body(g, (() => {
        const p = new Path2D();
        p.moveTo(16, 10);
        p.lineTo(48, 10);
        p.quadraticCurveTo(48, 36, 32, 38);
        p.quadraticCurveTo(16, 36, 16, 10);
        return p;
      })(), '#ffc93c', 10, 38);
      body(g, rr(28, 38, 8, 10, 1), '#d9a531', 38, 48);
      body(g, rr(18, 48, 28, 8, 2), '#7a5512', 48, 56);
      break;
    }
    case 'hand': {
      // A pointing hand (the ghost hint)
      g.fillStyle = '#ffffff';
      g.strokeStyle = INK;
      g.lineWidth = 3;
      const p = new Path2D();
      p.moveTo(26, 6);
      p.quadraticCurveTo(32, 4, 32, 10);
      p.lineTo(32, 30);
      p.lineTo(46, 32);
      p.quadraticCurveTo(54, 34, 52, 44);
      p.lineTo(48, 58);
      p.lineTo(24, 58);
      p.lineTo(14, 40);
      p.quadraticCurveTo(12, 34, 18, 34);
      p.lineTo(22, 38);
      p.lineTo(22, 10);
      p.quadraticCurveTo(22, 5, 26, 6);
      g.fill(p);
      g.stroke(p);
      break;
    }
    default: {
      g.fillStyle = '#9aa1ab';
      g.fill(circ(32, 32, 20));
    }
  }
  g.restore();
}

function star(cx: number, cy: number, r: number): Path2D {
  const p = new Path2D();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const d = i % 2 ? r * 0.45 : r;
    if (i) p.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
    else p.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
  }
  p.closePath();
  return p;
}

function blobPath(cx: number, cy: number, r: number, seed: number): Path2D {
  const p = new Path2D();
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const d = r * (0.8 + 0.25 * Math.sin(seed * 3.1 + i * 2.3));
    if (i) p.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
    else p.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
  }
  p.closePath();
  return p;
}

function drawWheelIcon(g: Ctx, x: number, y: number, r: number): void {
  g.fillStyle = '#1b1d23';
  g.fill(circ(x, y, r));
  const gr = g.createLinearGradient(x - r, y - r, x + r, y + r);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(1, '#5d646e');
  g.fillStyle = gr;
  g.fill(circ(x, y, r * 0.6));
  g.fillStyle = '#16181d';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.fill(circ(x + Math.cos(a) * r * 0.38, y + Math.sin(a) * r * 0.38, r * 0.1));
  }
}

function drawRobotIcon(g: Ctx, kind: string): void {
  const color = { washbot: '#2a8fd8', grindarm: '#e86a1a', polishdrone: '#b26bff', wrenchbot: '#5fd06a', paintbooth: '#ff4f7a' }[kind] ?? '#9aa1ab';
  if (kind === 'polishdrone') {
    body(g, rr(18, 24, 28, 16, 8), color, 24, 40);
    g.fillStyle = '#5ff6ff';
    g.fill(rr(24, 28, 16, 6, 3));
    g.strokeStyle = '#2b2e36';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(18, 26);
    g.lineTo(8, 18);
    g.moveTo(46, 26);
    g.lineTo(56, 18);
    g.stroke();
    g.fillStyle = 'rgba(200,220,240,0.7)';
    g.fill(rr(0, 14, 16, 4, 2));
    g.fill(rr(48, 14, 16, 4, 2));
    body(g, rr(22, 42, 20, 8, 4), '#f4f6f8', 42, 50);
    return;
  }
  if (kind === 'grindarm') {
    body(g, rr(4, 4, 20, 8, 3), '#3a3f46', 4, 12);
    g.strokeStyle = color;
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(14, 10);
    g.lineTo(30, 30);
    g.lineTo(46, 26);
    g.stroke();
    g.fillStyle = '#2b2e36';
    g.fill(circ(30, 30, 5));
    body(g, circ(50, 36, 11), '#c9d0d8', 25, 47);
    g.fillStyle = '#ffb02e';
    g.fill(circ(58, 50, 2));
    g.fill(circ(54, 54, 1.6));
    return;
  }
  if (kind === 'paintbooth') {
    body(g, rr(4, 6, 56, 8, 3), '#3a3f46', 6, 14);
    body(g, rr(24, 14, 16, 18, 4), color, 14, 32);
    g.fillStyle = 'rgba(255,79,122,0.45)';
    g.beginPath();
    g.moveTo(28, 32);
    g.lineTo(36, 32);
    g.lineTo(50, 58);
    g.lineTo(14, 58);
    g.fill();
    return;
  }
  // washbot / wrenchbot: a little floor robot with a visor
  body(g, rr(14, 18, 36, 30, 10), color, 18, 48);
  g.fillStyle = '#1b2433';
  g.fill(rr(20, 24, 24, 12, 6));
  g.fillStyle = '#5ff6ff';
  g.fill(circ(27, 30, 3));
  g.fill(circ(37, 30, 3));
  g.fillStyle = '#2b2e36';
  g.fill(circ(20, 52, 6));
  g.fill(circ(44, 52, 6));
  g.strokeStyle = '#9aa1ab';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(48, 30);
  g.lineTo(58, 22);
  g.stroke();
  if (kind === 'wrenchbot') {
    g.fillStyle = '#c9d0d8';
    g.fill(circ(58, 18, 5));
  } else {
    g.strokeStyle = '#7fd4ff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(58, 22);
    g.lineTo(63, 16);
    g.stroke();
  }
}

const urls = new Map<string, string>();
/** A data: URL of icon `id` at `size` CSS px (drawn at 2× for sharp DOM images) */
export function iconUrl(id: string, size = 48): string {
  const key = `${id}@${size}`;
  let u = urls.get(key);
  if (!u) {
    const [c, g] = canvas2d(size * 2, size * 2);
    drawIcon(g, id, size * 2);
    u = c.toDataURL();
    urls.set(key, u);
  }
  return u;
}

/** The icon id of a tool line at a level (its tier) */
export function toolIcon(cat: Cat, level: number): string {
  const tier = Math.min(TOOLS[cat].tiers.length - 1, Math.floor(level / 10));
  return `${cat}:${tier}`;
}
