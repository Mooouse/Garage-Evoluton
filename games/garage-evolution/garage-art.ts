// The garage itself, one room per level, baked once per size: the Shed (planks, one bulb, a pegboard), the Workshop
// (brick, tubes, a red tool chest, a compressor), the Service Station (tiles, a paint booth, a diagnostic screen), the
// Luxury Garage (dark gloss, LED strips, glass to the city at night, a showroom plinth), the Industrial Plant (steel,
// a gantry crane, catwalks, hazard stripes) and the Space Hangar (panels, a window on the Earth from orbit).
// The rolling door on the right is drawn every frame (it opens).

import { canvas2d } from '@gp/art/bake';
import { mix, shade } from '@gp/art/color';
import { seeded, type Rand } from './sim.ts';

type Ctx = CanvasRenderingContext2D;

export interface RoomLook {
  wall: string;
  wall2: string;
  floor: string;
  floor2: string;
  light: string;
  /** Floor reflection strength of the car (0 concrete … 0.3 polished) */
  shine: number;
  ambient: string;
}

export const LOOKS: RoomLook[] = [
  { wall: '#6b4a33', wall2: '#3e2a1d', floor: '#6d6a63', floor2: '#3f3d39', light: '#ffd9a0', shine: 0.06, ambient: '#2a1c14' },
  { wall: '#8a6f62', wall2: '#4c3b36', floor: '#7d8288', floor2: '#454a51', light: '#e8f4ff', shine: 0.1, ambient: '#251d1c' },
  { wall: '#dfe7ee', wall2: '#9fb1c2', floor: '#9aa6b2', floor2: '#5c6876', light: '#ffffff', shine: 0.16, ambient: '#1e2a38' },
  { wall: '#22232c', wall2: '#0d0e14', floor: '#2c2e38', floor2: '#101118', light: '#ffe7c2', shine: 0.32, ambient: '#08080d' },
  { wall: '#56606b', wall2: '#2b3138', floor: '#5d636b', floor2: '#2a2e33', light: '#fff2c9', shine: 0.12, ambient: '#14171b' },
  { wall: '#c9d3df', wall2: '#5d6b80', floor: '#7d8a9c', floor2: '#2f3848', light: '#bff4ff', shine: 0.28, ambient: '#0b1220' },
];

/** The second garage of each level (the network, 1.4): its own palette and an accent band on the wall */
export const LOOKS_ALT: (RoomLook & { accent: string })[] = [
  { wall: '#9a5b3c', wall2: '#5c3322', floor: '#7a716a', floor2: '#45403c', light: '#ffe0b0', shine: 0.07, ambient: '#2b1810', accent: '#2fa86a' },
  { wall: '#5f7d86', wall2: '#33464d', floor: '#6f767c', floor2: '#3d4247', light: '#eef8ff', shine: 0.12, ambient: '#152025', accent: '#ffcc1f' },
  { wall: '#7a2b2b', wall2: '#3d1414', floor: '#3a3a40', floor2: '#1c1c22', light: '#ffe1c2', shine: 0.2, ambient: '#1a0a0a', accent: '#f2f2f2' },
  { wall: '#e8edf3', wall2: '#2d4f8a', floor: '#9ea7b3', floor2: '#4b5566', light: '#ffffff', shine: 0.22, ambient: '#101a2c', accent: '#e8342c' },
  { wall: '#2a2418', wall2: '#0f0c06', floor: '#3a352a', floor2: '#16130c', light: '#ffe9b0', shine: 0.34, ambient: '#0a0805', accent: '#e8c25a' },
  { wall: '#c9d3df', wall2: '#5d6b80', floor: '#7d8a9c', floor2: '#2f3848', light: '#bff4ff', shine: 0.28, ambient: '#0b1220', accent: '#7fe0ff' },
];
/**
 * The third garage of a level (2026-10-19: the GT garage, the prestige salon, the future centre): a darker, richer
 * palette with tall lit panels on the back wall
 */
export const LOOKS_3: (RoomLook & { accent: string })[] = [
  { wall: '#4a5a3a', wall2: '#283120', floor: '#6d6a5e', floor2: '#3c3a33', light: '#fff0c8', shine: 0.08, ambient: '#1a2012', accent: '#e8a23a' },
  { wall: '#3d3550', wall2: '#1f1a2b', floor: '#666270', floor2: '#36333d', light: '#f4ecff', shine: 0.14, ambient: '#140f1d', accent: '#58d1c9' },
  { wall: '#183a33', wall2: '#0a1d19', floor: '#3f4544', floor2: '#1b1f1e', light: '#fff4dc', shine: 0.24, ambient: '#06110e', accent: '#d9b46a' },
  { wall: '#2b2219', wall2: '#140f0a', floor: '#4a4038', floor2: '#1e1915', light: '#ffeacc', shine: 0.3, ambient: '#0d0906', accent: '#c9a56b' },
  { wall: '#141a2a', wall2: '#060912', floor: '#232a3a', floor2: '#0a0d16', light: '#d6f2ff', shine: 0.36, ambient: '#04060c', accent: '#3fe6ff' },
  { wall: '#c9d3df', wall2: '#5d6b80', floor: '#7d8a9c', floor2: '#2f3848', light: '#bff4ff', shine: 0.28, ambient: '#0b1220', accent: '#7fe0ff' },
];
/** A level's room look: 0 its own, 1 its second style, 2 its third */
export function lookOf(level: number, look = 0): RoomLook {
  const i = Math.max(0, Math.min(5, level - 1));
  return look === 2 ? LOOKS_3[i] : look ? LOOKS_ALT[i] : LOOKS[i];
}

/** The floor line (y of the ground) for a view */
export function groundY(w: number, h: number, top: number, bottom: number): number {
  const portrait = h > w;
  return portrait ? top + (h - top - bottom) * 0.72 : top + (h - top - bottom) * 0.8;
}

/** The door's box on the right wall */
export function doorBox(w: number, h: number, ground: number): { x: number; y: number; w: number; h: number } {
  const dw = Math.max(70, Math.min(w * 0.2, 260));
  const dh = Math.min(ground - 20, Math.max(110, ground * 0.62));
  return { x: w - dw * 0.92, y: ground - dh, w: dw, h: dh };
}

/** Bake the room: back wall, floor, lights, the level's furniture (not the door's shutter) */
/** The space garage being baked: what its window looks out on (data.ts Site.space) */
let place: string | undefined;

export function bakeRoom(level: number, w: number, h: number, ground: number, scale: number, look = 0, at?: string): HTMLCanvasElement {
  place = at;
  const [c, g] = canvas2d(w * scale, h * scale);
  g.scale(scale, scale);
  const L = lookOf(level, look);
  const r = seeded(level * 101 + look * 7919 + Math.round(w) * 7 + Math.round(h));
  const u = Math.min(w, h * 1.4) / 100; // a unit that scales with the view
  // The back wall
  const wg = g.createLinearGradient(0, 0, 0, ground);
  wg.addColorStop(0, shade(L.wall2, -0.25));
  wg.addColorStop(0.45, L.wall2);
  wg.addColorStop(1, L.wall);
  g.fillStyle = wg;
  g.fillRect(0, 0, w, ground);
  const door = doorBox(w, h, ground);
  if (look === 2) {
    // The third style: tall lit panels on the back wall, a thin accent line at their foot
    const accent = LOOKS_3[Math.max(0, Math.min(5, level - 1))].accent;
    const pw = u * 9;
    for (let x = u * 4; x < w - pw; x += pw * 1.6) {
      const pg = g.createLinearGradient(0, ground * 0.12, 0, ground * 0.9);
      pg.addColorStop(0, 'rgba(255,255,255,0.02)');
      pg.addColorStop(0.5, 'rgba(255,255,255,0.08)');
      pg.addColorStop(1, 'rgba(255,255,255,0.02)');
      g.fillStyle = pg;
      g.fillRect(x, ground * 0.12, pw, ground * 0.78);
      g.fillStyle = accent;
      g.globalAlpha = 0.55;
      g.fillRect(x, ground * 0.12, pw, u * 0.25);
      g.globalAlpha = 1;
    }
    g.fillStyle = accent;
    g.fillRect(0, ground - u * 1.4, w, u * 0.35);
  } else if (look) {
    // The second style: a band of the garage's own colour along the wall, with a thin light line
    const accent = LOOKS_ALT[Math.max(0, Math.min(5, level - 1))].accent;
    g.fillStyle = accent;
    g.fillRect(0, ground * 0.56, w, u * 2.2);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(0, ground * 0.56, w, u * 0.35);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, ground * 0.56 + u * 2.2, w, u * 0.4);
  }
  ;[shed, workshop, station, luxury, plant, hangar][Math.max(0, Math.min(5, level - 1))](g, w, h, ground, u, r, L, door);
  // The floor: a gradient, joints, the light pool under the lamps
  const fg = g.createLinearGradient(0, ground, 0, h);
  fg.addColorStop(0, L.floor);
  fg.addColorStop(1, L.floor2);
  g.fillStyle = fg;
  g.fillRect(0, ground, w, h - ground);
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 1;
  const vx = w * 0.45;
  for (let i = -12; i <= 12; i++) {
    g.beginPath();
    g.moveTo(vx + i * u * 9, ground);
    g.lineTo(vx + i * u * 30, h);
    g.stroke();
  }
  for (let y = ground + u * 2; y < h; y += (y - ground) * 0.55 + u * 2.5) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  // The skirting where wall meets floor
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, ground - u * 0.6, w, u * 0.6);
  // Oil stains on concrete (the first rooms)
  if (level <= 2 || level === 5)
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `rgba(20,16,12,${0.15 + r() * 0.15})`;
      g.beginPath();
      g.ellipse(r() * w, ground + (h - ground) * (0.2 + r() * 0.6), u * (3 + r() * 6), u * (0.8 + r() * 1.2), 0, 0, Math.PI * 2);
      g.fill();
    }
  // Light pool on the floor under the work spot
  const pool = g.createRadialGradient(w * 0.45, ground + (h - ground) * 0.2, 0, w * 0.45, ground + (h - ground) * 0.2, w * 0.5);
  pool.addColorStop(0, mix(L.light, '#ffffff', 0.3) + '55');
  pool.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = pool;
  g.fillRect(0, ground, w, h - ground);
  // Vignette: the room's corners in shadow
  const vg = g.createRadialGradient(w * 0.45, ground * 0.7, Math.min(w, h) * 0.25, w * 0.45, ground * 0.7, Math.max(w, h) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, L.ambient + 'cc');
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
  return c;
}

// --- Furniture helpers

function lamp(g: Ctx, x: number, y: number, r: number, color: string, kind: 'bulb' | 'tube' | 'spot' | 'led'): void {
  // The cone of light falling from it
  const cone = g.createLinearGradient(0, y, 0, y + r * 9);
  cone.addColorStop(0, color + '55');
  cone.addColorStop(1, color + '00');
  g.fillStyle = cone;
  g.beginPath();
  g.moveTo(x - r * (kind === 'tube' ? 3 : 0.8), y);
  g.lineTo(x + r * (kind === 'tube' ? 3 : 0.8), y);
  g.lineTo(x + r * 5, y + r * 9);
  g.lineTo(x - r * 5, y + r * 9);
  g.closePath();
  g.fill();
  const halo = g.createRadialGradient(x, y, 0, x, y, r * 3.5);
  halo.addColorStop(0, color + 'cc');
  halo.addColorStop(1, color + '00');
  g.fillStyle = halo;
  g.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
  g.fillStyle = '#fffaf0';
  if (kind === 'bulb') {
    g.strokeStyle = '#1b1b1b';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, y - r);
    g.stroke();
    g.beginPath();
    g.arc(x, y, r * 0.6, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'tube') {
    g.fillStyle = '#3a3f46';
    g.fillRect(x - r * 3.2, y - r * 0.7, r * 6.4, r * 0.5);
    g.fillStyle = '#ffffff';
    g.fillRect(x - r * 3, y - r * 0.25, r * 6, r * 0.45);
  } else if (kind === 'spot') {
    g.fillStyle = '#20232a';
    g.beginPath();
    g.moveTo(x - r, y - r * 0.8);
    g.lineTo(x + r, y - r * 0.8);
    g.lineTo(x + r * 0.6, y);
    g.lineTo(x - r * 0.6, y);
    g.closePath();
    g.fill();
    g.fillStyle = '#fffaf0';
    g.fillRect(x - r * 0.55, y - r * 0.1, r * 1.1, r * 0.2);
  } else {
    g.fillRect(x - r * 2, y - r * 0.15, r * 4, r * 0.3);
  }
}

function panel(g: Ctx, x: number, y: number, w: number, h: number, color: string, rad = 3): void {
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, mix(color, '#ffffff', 0.18));
  gr.addColorStop(1, shade(color, -0.35));
  g.fillStyle = gr;
  g.beginPath();
  g.roundRect(x, y, w, h, rad);
  g.fill();
  g.strokeStyle = shade(color, -0.6);
  g.lineWidth = 1;
  g.stroke();
}

function tireStack(g: Ctx, x: number, ground: number, u: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const y = ground - u * 2.2 * (i + 0.5);
    g.fillStyle = '#1d1e22';
    g.beginPath();
    g.ellipse(x, y, u * 4.2, u * 1.25, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#3a3c42';
    g.lineWidth = 1;
    g.stroke();
  }
}

function pegboard(g: Ctx, x: number, y: number, w: number, h: number, u: number, r: Rand): void {
  panel(g, x, y, w, h, '#b88a5a', 2);
  g.fillStyle = 'rgba(40,25,10,0.5)';
  for (let yy = y + u; yy < y + h - u * 0.5; yy += u * 1.4) for (let xx = x + u; xx < x + w - u * 0.5; xx += u * 1.4) g.fillRect(xx, yy, 1.2, 1.2);
  // Hand tools hanging
  const tools = ['#9aa1ab', '#c0392b', '#2f6fe8', '#9aa1ab', '#e8b84a', '#7a8088'];
  for (let i = 0; i < 6; i++) {
    const tx = x + u * 2 + (i * (w - u * 4)) / 5;
    const ty = y + h * (0.25 + r() * 0.3);
    g.strokeStyle = tools[i];
    g.lineWidth = u * 0.6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(tx, ty);
    g.lineTo(tx + (r() - 0.5) * u, ty + u * (4 + r() * 3));
    g.stroke();
  }
}

function shelf(g: Ctx, x: number, y: number, w: number, u: number, r: Rand, cols: string[]): void {
  g.fillStyle = '#4a3a2c';
  g.fillRect(x, y, w, u * 0.7);
  for (let xx = x + u; xx < x + w - u * 2; xx += u * (2 + r() * 1.5)) {
    const ch = u * (2 + r() * 2.5);
    panel(g, xx, y - ch, u * (1.4 + r()), ch, cols[Math.floor(r() * cols.length)], 1.5);
  }
}

function windowPane(g: Ctx, x: number, y: number, w: number, h: number, sky: [string, string], frame: string, dirty = 0): void {
  const sg = g.createLinearGradient(0, y, 0, y + h);
  sg.addColorStop(0, sky[0]);
  sg.addColorStop(1, sky[1]);
  g.fillStyle = sg;
  g.fillRect(x, y, w, h);
  if (dirty) {
    g.fillStyle = `rgba(90,70,40,${dirty})`;
    g.fillRect(x, y, w, h);
  }
  g.strokeStyle = frame;
  g.lineWidth = Math.max(2, w * 0.05);
  g.strokeRect(x, y, w, h);
  g.beginPath();
  g.moveTo(x + w / 2, y);
  g.lineTo(x + w / 2, y + h);
  g.moveTo(x, y + h / 2);
  g.lineTo(x + w, y + h / 2);
  g.stroke();
}

type Room = (g: Ctx, w: number, h: number, ground: number, u: number, r: Rand, L: RoomLook, door: { x: number; y: number; w: number; h: number }) => void;

// --- Level 1: the Shed
const shed: Room = (g, w, h, ground, u, r, L, door) => {
  // Planks
  for (let x = 0; x < w; x += u * 4.5) {
    g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,220,180,0.05)';
    g.fillRect(x, 0, u * 4.5, ground);
    g.strokeStyle = 'rgba(20,10,5,0.5)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, ground);
    g.stroke();
    for (let k = 0; k < 2; k++) {
      g.fillStyle = 'rgba(20,10,5,0.45)';
      g.beginPath();
      g.arc(x + u * 2.2, r() * ground, u * 0.25, 0, Math.PI * 2);
      g.fill();
    }
  }
  // A beam across the top
  panel(g, 0, ground * 0.1, w, u * 2.5, '#4a3222', 0);
  windowPane(g, w * 0.06, ground * 0.26, u * 14, u * 10, ['#9ecbe6', '#e6d5a8'], '#3a281b', 0.35);
  pegboard(g, w * 0.3, ground * 0.28, Math.min(w * 0.3, u * 30), u * 14, u, r);
  shelf(g, w * 0.04, ground * 0.66, u * 18, u, r, ['#c0392b', '#2f6fe8', '#e8b84a', '#5c7d5a']);
  tireStack(g, Math.min(door.x - u * 6, w * 0.8), ground, u, 4);
  // An oil drum
  panel(g, w * 0.02, ground - u * 9, u * 6, u * 9, '#2f5a7a', 2);
  lamp(g, w * 0.45, ground * 0.24, u * 1.6, L.light, 'bulb');
};

// --- Level 2: the Workshop
const workshop: Room = (g, w, h, ground, u, r, L, door) => {
  // Brick
  const bh = u * 2.2;
  for (let y = 0, row = 0; y < ground; y += bh, row++)
    for (let x = row % 2 ? -u * 3 : 0; x < w; x += u * 6) {
      g.fillStyle = mix('#8a6f62', r() < 0.5 ? '#9b5b45' : '#6e5a52', 0.35 + r() * 0.3);
      g.fillRect(x + 0.5, y + 0.5, u * 6 - 1, bh - 1);
    }
  g.fillStyle = 'rgba(30,20,18,0.3)';
  g.fillRect(0, 0, w, ground);
  // A painted band
  g.fillStyle = '#3d5a6e';
  g.fillRect(0, ground * 0.62, w, ground * 0.38);
  g.fillStyle = '#e8b84a';
  g.fillRect(0, ground * 0.62, w, u * 0.8);
  // The red tool chest and a workbench
  panel(g, w * 0.05, ground - u * 16, u * 12, u * 16, '#c0392b', 3);
  for (let i = 1; i < 6; i++) {
    g.fillStyle = '#e6eaef';
    g.fillRect(w * 0.05 + u * 4, ground - u * 16 + i * u * 2.6, u * 4, u * 0.4);
  }
  panel(g, w * 0.22, ground - u * 8, u * 22, u * 1.4, '#7a5a3a', 1);
  g.fillStyle = '#3a3f46';
  g.fillRect(w * 0.22 + u, ground - u * 6.6, u, u * 6.6);
  g.fillRect(w * 0.22 + u * 20, ground - u * 6.6, u, u * 6.6);
  pegboard(g, w * 0.22, ground * 0.3, Math.min(w * 0.28, u * 26), u * 12, u, r);
  // The compressor
  const cx = Math.min(door.x - u * 12, w * 0.74);
  panel(g, cx, ground - u * 8, u * 10, u * 7, '#e8b84a', 3);
  g.fillStyle = '#1d1e22';
  g.beginPath();
  g.arc(cx + u * 2, ground - u * 0.6, u * 1.2, 0, Math.PI * 2);
  g.arc(cx + u * 8, ground - u * 0.6, u * 1.2, 0, Math.PI * 2);
  g.fill();
  windowPane(g, w * 0.55, ground * 0.18, u * 12, u * 9, ['#a7d3ef', '#f1e3b8'], '#2f3338', 0.1);
  lamp(g, w * 0.3, ground * 0.12, u * 1.5, L.light, 'tube');
  lamp(g, w * 0.62, ground * 0.12, u * 1.5, L.light, 'tube');
};

// --- Level 3: the Service Station
const station: Room = (g, w, h, ground, u, r, L, door) => {
  // Tiles
  g.strokeStyle = 'rgba(80,100,120,0.25)';
  g.lineWidth = 1;
  for (let y = 0; y < ground; y += u * 3) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  for (let x = 0; x < w; x += u * 3) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, ground);
    g.stroke();
  }
  g.fillStyle = '#2a6fb0';
  g.fillRect(0, ground * 0.55, w, u * 1.6);
  g.fillStyle = '#e8b84a';
  g.fillRect(0, ground * 0.55 + u * 1.6, w, u * 0.6);
  // The paint booth behind (glass and a frame)
  const bx = w * 0.04;
  g.fillStyle = 'rgba(160,200,230,0.35)';
  g.fillRect(bx, ground * 0.2, u * 24, ground * 0.8);
  g.strokeStyle = '#5a6a7a';
  g.lineWidth = u * 0.6;
  g.strokeRect(bx, ground * 0.2, u * 24, ground * 0.8);
  for (let i = 1; i < 3; i++) {
    g.beginPath();
    g.moveTo(bx + i * u * 8, ground * 0.2);
    g.lineTo(bx + i * u * 8, ground);
    g.stroke();
  }
  // A diagnostic screen on an arm
  const sx = w * 0.42;
  panel(g, sx, ground * 0.22, u * 14, u * 9, '#1d2733', 3);
  g.strokeStyle = '#3fffd8';
  g.lineWidth = 1.5;
  g.beginPath();
  for (let i = 0; i <= 20; i++) {
    const x = sx + u + (i / 20) * u * 12;
    const y = ground * 0.22 + u * 4.5 + Math.sin(i * 0.9) * u * 2;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.stroke();
  g.fillStyle = '#5fd06a';
  g.fillRect(sx + u, ground * 0.22 + u * 7, u * 6, u);
  // Lift posts
  for (const px of [w * 0.2, w * 0.7]) {
    panel(g, px, ground * 0.3, u * 2.2, ground * 0.7, '#c0392b', 1);
  }
  shelf(g, Math.min(door.x - u * 22, w * 0.72), ground * 0.45, u * 18, u, r, ['#2a6fb0', '#e8b84a', '#e6eaef', '#c0392b']);
  lamp(g, w * 0.25, ground * 0.08, u * 1.5, L.light, 'tube');
  lamp(g, w * 0.5, ground * 0.08, u * 1.5, L.light, 'tube');
  lamp(g, w * 0.75, ground * 0.08, u * 1.5, L.light, 'tube');
};

// --- Level 4: the Luxury Garage
const luxury: Room = (g, w, h, ground, u, r, L, door) => {
  // Glass wall to the city at night
  const gx = w * 0.04;
  const gw = w * 0.6;
  const gy = ground * 0.08;
  const gh = ground * 0.72;
  const sky = g.createLinearGradient(0, gy, 0, gy + gh);
  sky.addColorStop(0, '#0b1230');
  sky.addColorStop(0.7, '#2a2a5e');
  sky.addColorStop(1, '#6a3c6a');
  g.fillStyle = sky;
  g.fillRect(gx, gy, gw, gh);
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`;
    g.fillRect(gx + r() * gw, gy + r() * gh * 0.4, 1.2, 1.2);
  }
  // Skyline with lit windows
  for (let x = gx; x < gx + gw; x += u * (3 + r() * 4)) {
    const bh = gh * (0.2 + r() * 0.45);
    const bw = u * (2.5 + r() * 3);
    g.fillStyle = '#141632';
    g.fillRect(x, gy + gh - bh, bw, bh);
    for (let yy = gy + gh - bh + u; yy < gy + gh - u; yy += u * 1.3)
      for (let xx = x + u * 0.5; xx < x + bw - u * 0.5; xx += u * 1.1) if (r() < 0.35) {
        g.fillStyle = r() < 0.7 ? '#ffd38a' : '#9be7ff';
        g.fillRect(xx, yy, u * 0.5, u * 0.6);
      }
  }
  g.strokeStyle = '#3a3c48';
  g.lineWidth = u * 0.7;
  g.strokeRect(gx, gy, gw, gh);
  for (let i = 1; i < 4; i++) {
    g.beginPath();
    g.moveTo(gx + (gw * i) / 4, gy);
    g.lineTo(gx + (gw * i) / 4, gy + gh);
    g.stroke();
  }
  // LED strips
  g.fillStyle = '#ffe7c2';
  g.fillRect(0, ground * 0.04, w, u * 0.4);
  g.fillRect(0, ground - u * 1.4, w, u * 0.3);
  // A showroom plinth with a spotlit trophy car silhouette
  const px = gx + gw + u * 4;
  if (px + u * 18 < door.x) {
    panel(g, px, ground - u * 3, u * 18, u * 3, '#2c2e38', 2);
    g.fillStyle = 'rgba(255,231,194,0.12)';
    g.beginPath();
    g.moveTo(px + u * 9, 0);
    g.lineTo(px + u * 18, ground - u * 3);
    g.lineTo(px, ground - u * 3);
    g.closePath();
    g.fill();
  }
  lamp(g, w * 0.3, ground * 0.06, u * 1.3, L.light, 'spot');
  lamp(g, w * 0.55, ground * 0.06, u * 1.3, L.light, 'spot');
  lamp(g, w * 0.78, ground * 0.06, u * 1.3, L.light, 'spot');
};

// --- Level 5: the Industrial Plant
const plant: Room = (g, w, h, ground, u, r, L, door) => {
  // Steel columns and cross bracing
  for (let x = w * 0.08; x < w; x += w * 0.28) {
    panel(g, x, 0, u * 2.4, ground, '#3c4652', 0);
    g.strokeStyle = 'rgba(20,24,30,0.5)';
    g.lineWidth = u * 0.5;
    g.beginPath();
    g.moveTo(x + u * 2.4, ground * 0.15);
    g.lineTo(x + w * 0.28, ground * 0.6);
    g.moveTo(x + u * 2.4, ground * 0.6);
    g.lineTo(x + w * 0.28, ground * 0.15);
    g.stroke();
  }
  // Pipes
  for (let i = 0; i < 3; i++) {
    const y = ground * (0.3 + i * 0.07);
    const pg = g.createLinearGradient(0, y - u, 0, y + u);
    pg.addColorStop(0, '#9aa1ab');
    pg.addColorStop(1, '#3a3f46');
    g.fillStyle = i === 1 ? '#c0392b' : pg;
    g.fillRect(0, y - u * 0.7, w, u * 1.4);
  }
  // The gantry crane rail and its hook
  panel(g, 0, ground * 0.06, w, u * 3, '#e8b84a', 0);
  g.fillStyle = '#1d1e22';
  for (let x = 0; x < w; x += u * 4) {
    g.beginPath();
    g.moveTo(x, ground * 0.06 + u * 3);
    g.lineTo(x + u * 2, ground * 0.06);
    g.lineTo(x + u * 3, ground * 0.06);
    g.lineTo(x + u, ground * 0.06 + u * 3);
    g.fill();
  }
  // A catwalk
  g.fillStyle = '#2b3138';
  g.fillRect(0, ground * 0.48, w * 0.5, u);
  g.strokeStyle = '#8d949e';
  g.lineWidth = 1;
  for (let x = 0; x < w * 0.5; x += u * 2) {
    g.beginPath();
    g.moveTo(x, ground * 0.48);
    g.lineTo(x, ground * 0.48 - u * 3);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(0, ground * 0.48 - u * 3);
  g.lineTo(w * 0.5, ground * 0.48 - u * 3);
  g.stroke();
  // Hazard stripes on the floor edge
  for (let x = 0; x < w; x += u * 4) {
    g.fillStyle = '#e8b84a';
    g.beginPath();
    g.moveTo(x, ground - u * 1.5);
    g.lineTo(x + u * 2, ground - u * 1.5);
    g.lineTo(x + u * 3.5, ground);
    g.lineTo(x + u * 1.5, ground);
    g.fill();
  }
  lamp(g, w * 0.25, ground * 0.16, u * 1.8, L.light, 'spot');
  lamp(g, w * 0.5, ground * 0.16, u * 1.8, L.light, 'spot');
  lamp(g, w * 0.75, ground * 0.16, u * 1.8, L.light, 'spot');
  void door;
};

/** A planet's ball: lit from the upper left, its bands */
function ball(g: Ctx, x: number, y: number, rad: number, c: [string, string, string], bands?: string[], tilt = 0): void {
  const pg = g.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad);
  pg.addColorStop(0, c[0]);
  pg.addColorStop(0.6, c[1]);
  pg.addColorStop(1, c[2]);
  g.fillStyle = pg;
  g.beginPath();
  g.arc(x, y, rad, 0, Math.PI * 2);
  g.fill();
  if (bands) {
    g.save();
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.clip();
    g.translate(x, y);
    g.rotate(tilt);
    bands.forEach((b, i) => {
      g.fillStyle = b;
      g.fillRect(-rad, -rad + ((i + 0.5) / bands.length) * rad * 2 - rad * 0.06, rad * 2, rad * (0.07 + (i % 3) * 0.03));
    });
    // The night side
    g.rotate(-tilt);
    const sh = g.createLinearGradient(-rad, -rad, rad, rad);
    sh.addColorStop(0.45, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(0,0,8,0.55)');
    g.fillStyle = sh;
    g.fillRect(-rad, -rad, rad * 2, rad * 2);
    g.restore();
  }
}

/** A ring seen at an angle (Saturn's, Uranus's faint one): the back half before the ball, the front half after */
function ring(g: Ctx, x: number, y: number, rad: number, tilt: number, color: string, half: 'back' | 'front'): void {
  g.save();
  g.translate(x, y);
  g.rotate(tilt);
  g.strokeStyle = color;
  for (const [k, lw] of [[1.6, rad * 0.16], [2.05, rad * 0.1]] as const) {
    g.lineWidth = lw;
    g.beginPath();
    g.ellipse(0, 0, rad * k, rad * k * 0.28, 0, half === 'back' ? Math.PI : 0, half === 'back' ? Math.PI * 2 : Math.PI);
    g.stroke();
  }
  g.restore();
}

/** What a space garage's big window looks out on: each its own world */
function outside(g: Ctx, wx: number, wy: number, ww: number, wh: number, u: number, r: () => number): void {
  const ground = (top: string, bottom: string, hill = 0.12) => {
    // The surface the garage stands on, with a few hills and craters
    const gy = wy + wh * 0.78;
    const gg = g.createLinearGradient(0, gy - wh * hill, 0, wy + wh);
    gg.addColorStop(0, top);
    gg.addColorStop(1, bottom);
    g.fillStyle = gg;
    g.beginPath();
    g.moveTo(wx, wy + wh);
    g.lineTo(wx, gy);
    for (let i = 0; i <= 8; i++) g.lineTo(wx + (ww * i) / 8, gy - r() * wh * hill);
    g.lineTo(wx + ww, wy + wh);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.ellipse(wx + r() * ww, gy + r() * wh * 0.18, u * (1 + r() * 3), u * (0.3 + r() * 0.6), 0, 0, Math.PI * 2);
      g.fill();
    }
  };
  const sky = (top: string, bottom: string) => {
    const sg = g.createLinearGradient(0, wy, 0, wy + wh);
    sg.addColorStop(0, top);
    sg.addColorStop(1, bottom);
    g.fillStyle = sg;
    g.fillRect(wx, wy, ww, wh);
  };
  const er = ww * 0.55;
  switch (place) {
    case 'orbit': {
      // Low orbit: the Earth's curve fills the bottom, the thin blue air on its edge
      const ex = wx + ww * 0.5;
      const ey = wy + wh + er * 0.9;
      ball(g, ex, ey, er * 1.3, ['#8fd0ff', '#2a6fb0', '#0b2a50']);
      g.fillStyle = 'rgba(80,170,90,0.6)';
      for (let i = 0; i < 7; i++) {
        g.beginPath();
        g.ellipse(ex - er + r() * er * 2, ey - er * 1.22 + r() * er * 0.2, er * 0.16, er * 0.05, r() - 0.5, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = 'rgba(150,220,255,0.7)';
      g.lineWidth = u * 1.2;
      g.beginPath();
      g.arc(ex, ey, er * 1.3 + u * 0.8, Math.PI * 1.05, Math.PI * 1.95);
      g.stroke();
      return;
    }
    case 'mars':
      sky('#c98a6a', '#e8b48a');
      ball(g, wx + ww * 0.8, wy + wh * 0.2, ww * 0.03, ['#f4f1ea', '#c9ccd1', '#9aa3ad']);
      ground('#b4552e', '#6a2a14', 0.16);
      return;
    case 'venus': {
      // Thick yellow clouds, the Sun a blur behind them
      sky('#e8b04a', '#a8642a');
      const sg = g.createRadialGradient(wx + ww * 0.3, wy + wh * 0.25, 1, wx + ww * 0.3, wy + wh * 0.25, ww * 0.2);
      sg.addColorStop(0, 'rgba(255,250,220,0.9)');
      sg.addColorStop(1, 'rgba(255,250,220,0)');
      g.fillStyle = sg;
      g.fillRect(wx, wy, ww, wh);
      g.fillStyle = 'rgba(255,220,140,0.25)';
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        g.ellipse(wx + r() * ww, wy + r() * wh * 0.6, ww * (0.1 + r() * 0.15), wh * 0.04, 0, 0, Math.PI * 2);
        g.fill();
      }
      ground('#8a5a2a', '#3a2410', 0.08);
      return;
    }
    case 'mercury': {
      // The Sun huge and white over grey rock
      const sx = wx + ww * 0.25;
      const sy = wy + wh * 0.3;
      const sg = g.createRadialGradient(sx, sy, ww * 0.05, sx, sy, ww * 0.45);
      sg.addColorStop(0, '#fffbe8');
      sg.addColorStop(0.3, 'rgba(255,220,140,0.75)');
      sg.addColorStop(1, 'rgba(255,160,60,0)');
      g.fillStyle = sg;
      g.fillRect(wx, wy, ww, wh);
      ball(g, sx, sy, ww * 0.1, ['#ffffff', '#fff3c4', '#ffd166']);
      ground('#8d8a86', '#3d3b39', 0.14);
      return;
    }
    case 'jupiter':
      // From Europa's ice: Jupiter fills the sky
      ball(g, wx + ww * 0.6, wy + wh * 0.42, ww * 0.42, ['#f0d8b0', '#c99a6a', '#5a3a24'], ['#b07a52', '#e8d0a8', '#a0623a', '#d9b48a', '#8a5a3a', '#e0c8a0', '#b5704a'], 0.08);
      g.fillStyle = '#c0573a';
      g.beginPath();
      g.ellipse(wx + ww * 0.52, wy + wh * 0.55, ww * 0.05, ww * 0.025, 0.08, 0, Math.PI * 2);
      g.fill();
      ground('#d8e4ea', '#8aa0ae', 0.06);
      return;
    case 'saturn': {
      const x = wx + ww * 0.55;
      const y = wy + wh * 0.4;
      const rad = ww * 0.2;
      ring(g, x, y, rad, -0.25, 'rgba(230,207,143,0.75)', 'back');
      ball(g, x, y, rad, ['#f6e6b8', '#e0c27a', '#6a5430'], ['#d4b06a', '#f0dca8', '#c8a060', '#e8d098'], -0.25);
      ring(g, x, y, rad, -0.25, 'rgba(230,207,143,0.85)', 'front');
      ground('#b8b0a0', '#5a554c', 0.1);
      return;
    }
    case 'uranus': {
      const x = wx + ww * 0.4;
      const y = wy + wh * 0.38;
      const rad = ww * 0.17;
      ring(g, x, y, rad, 1.35, 'rgba(200,240,250,0.35)', 'back');
      ball(g, x, y, rad, ['#d8fbff', '#9fe3ea', '#3a7a86']);
      ring(g, x, y, rad, 1.35, 'rgba(200,240,250,0.45)', 'front');
      ground('#9ab8c0', '#3a4c52', 0.08);
      return;
    }
    case 'neptune':
      ball(g, wx + ww * 0.62, wy + wh * 0.36, ww * 0.2, ['#9fb8ff', '#4f74e8', '#14205a'], ['#3a5ad0', '#6a8cf0', '#2c48b0'], 0);
      ground('#c8d4e8', '#5a6a88', 0.1);
      return;
    default: {
      // The Moon: the Earth rising over the grey horizon
      const ex = wx + ww * 0.65;
      const ey = wy + wh + er * 0.55;
      ball(g, ex, ey, er, ['#6fb8ff', '#2a6fb0', '#0b2a50']);
      g.fillStyle = 'rgba(80,170,90,0.6)';
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.ellipse(ex - er * 0.6 + r() * er * 1.2, ey - er * 0.85 + r() * er * 0.3, er * 0.15, er * 0.06, r(), 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = 'rgba(150,220,255,0.6)';
      g.lineWidth = u * 0.8;
      g.beginPath();
      g.arc(ex, ey, er + u * 0.6, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }
  }
}

// --- Level 6: the Space Hangar
const hangar: Room = (g, w, h, ground, u, r, L, door) => {
  // A big window on space and the Earth
  const wx = w * 0.06;
  const wy = ground * 0.08;
  const ww = w * 0.62;
  const wh = ground * 0.62;
  g.fillStyle = '#03050d';
  g.beginPath();
  g.roundRect(wx, wy, ww, wh, u * 3);
  g.fill();
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.8})`;
    g.fillRect(wx + r() * ww, wy + r() * wh, r() < 0.1 ? 2 : 1, r() < 0.1 ? 2 : 1);
  }
  g.save();
  g.beginPath();
  g.roundRect(wx, wy, ww, wh, u * 3);
  g.clip();
  outside(g, wx, wy, ww, wh, u, r);
  g.restore();
  g.strokeStyle = '#8796ab';
  g.lineWidth = u * 1.2;
  g.beginPath();
  g.roundRect(wx, wy, ww, wh, u * 3);
  g.stroke();
  // Panels and cyan strips
  for (let x = wx + ww + u * 2; x < w; x += u * 8) panel(g, x, ground * 0.1, u * 7, ground * 0.85, '#9aa8bb', 2);
  g.fillStyle = '#5ff6ff';
  g.fillRect(0, ground - u * 1.2, w, u * 0.4);
  g.fillRect(0, ground * 0.04, w, u * 0.3);
  lamp(g, w * 0.3, ground * 0.05, u * 1.4, L.light, 'led');
  lamp(g, w * 0.6, ground * 0.05, u * 1.4, L.light, 'led');
  void door;
};

/** The rolling door: its frame, the outside through the opening and the shutter rolled up by `open` (0–1) */
export function drawDoor(g: Ctx, d: { x: number; y: number; w: number; h: number }, open: number, level: number, t: number): void {
  const u = d.w / 30;
  // The outside: daylight (space for the hangar)
  const out = g.createLinearGradient(0, d.y, 0, d.y + d.h);
  if (level >= 6) {
    out.addColorStop(0, '#02040c');
    out.addColorStop(1, '#0d1a3a');
  } else {
    out.addColorStop(0, '#9fd3f2');
    out.addColorStop(0.75, '#f2e6c4');
    out.addColorStop(1, '#a8a294');
  }
  g.fillStyle = out;
  g.fillRect(d.x, d.y, d.w, d.h);
  if (level < 6) {
    // A street and a tree outside
    g.fillStyle = '#7a8a6a';
    g.fillRect(d.x, d.y + d.h * 0.72, d.w, d.h * 0.1);
    // A tree: a trunk and a crown of three lit clumps (a flat disc read as a glitch: the first look, 1.5.0)
    const tx = d.x + d.w * 0.7;
    const ty = d.y + d.h * 0.72;
    const tr = d.w * 0.16;
    g.fillStyle = '#5b4632';
    g.fillRect(tx - tr * 0.12, ty - tr * 1.3, tr * 0.24, tr * 1.3);
    for (const [cx, cy, rr, col] of [[-0.45, -1.5, 0.75, '#4c6b3a'], [0.45, -1.55, 0.7, '#4c6b3a'], [0, -2.1, 0.85, '#5f8546'], [-0.15, -2.3, 0.45, '#7aa35a']] as const) {
      g.fillStyle = col;
      g.beginPath();
      g.arc(tx + cx * tr, ty + cy * tr, rr * tr, 0, Math.PI * 2);
      g.fill();
    }
    // Its shadow on the street
    g.fillStyle = 'rgba(40,50,30,0.35)';
    g.beginPath();
    g.ellipse(tx, ty + tr * 0.05, tr * 0.9, tr * 0.18, 0, 0, Math.PI * 2);
    g.fill();
    if (level === 5) {
      // The promise: a rocket on its pad in the distance (the space hangar comes after the chain)
      const rx = d.x + d.w * 0.35;
      const ry = d.y + d.h * 0.72;
      const rh = d.h * 0.42;
      const rw = rh * 0.16;
      g.fillStyle = '#e8edf3';
      g.beginPath();
      g.moveTo(rx, ry - rh);
      g.quadraticCurveTo(rx + rw * 0.6, ry - rh * 0.8, rx + rw / 2, ry - rh * 0.6);
      g.lineTo(rx + rw / 2, ry);
      g.lineTo(rx - rw / 2, ry);
      g.lineTo(rx - rw / 2, ry - rh * 0.6);
      g.quadraticCurveTo(rx - rw * 0.6, ry - rh * 0.8, rx, ry - rh);
      g.fill();
      g.fillStyle = '#d6332c';
      g.fillRect(rx - rw / 2, ry - rh * 0.35, rw, rh * 0.06);
      g.strokeStyle = '#5a6470';
      g.lineWidth = 1;
      g.strokeRect(rx + rw * 0.8, ry - rh * 0.9, rw * 0.4, rh * 0.9);
    }
  }
  // The shutter: slats from the top down to (1 - open)
  const sh = d.h * (1 - open);
  if (sh > 0.5) {
    const sg = g.createLinearGradient(d.x, 0, d.x + d.w, 0);
    const base = level === 4 ? '#3a3c48' : level >= 5 ? '#8d949e' : '#9aa1ab';
    sg.addColorStop(0, shade(base, -0.3));
    sg.addColorStop(0.5, base);
    sg.addColorStop(1, shade(base, -0.35));
    g.fillStyle = sg;
    g.fillRect(d.x, d.y, d.w, sh);
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = 1;
    for (let y = d.y + sh - u * 1.4; y > d.y; y -= u * 1.4) {
      g.beginPath();
      g.moveTo(d.x, y);
      g.lineTo(d.x + d.w, y);
      g.stroke();
    }
    g.fillStyle = '#2b2e34';
    g.fillRect(d.x, d.y + sh - u * 0.8, d.w, u * 0.8);
  }
  // The frame
  g.strokeStyle = '#25282e';
  g.lineWidth = u * 1.6;
  g.strokeRect(d.x, d.y, d.w + u, d.h);
  // A warning light that turns while it moves
  if (open > 0.02 && open < 0.98) {
    const a = 0.5 + 0.5 * Math.sin(t * 12);
    g.fillStyle = `rgba(255,170,40,${0.4 + a * 0.6})`;
    g.beginPath();
    g.arc(d.x + d.w * 0.1, d.y - u * 1.6, u * 1.1, 0, Math.PI * 2);
    g.fill();
  }
}
