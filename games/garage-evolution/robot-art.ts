// The garage's robots, drawn to stand beside the owner's painted cars (2026-10-17: «обнови им графику, машины сейчас
// выглядят сильно лучше роботов»): painted metal lit from above, glass visors with glowing eyes, joints, treads, a stripe
// of their trade's colour, and a working tool at the arm's end. Pure drawing: the scene places them and moves them.

import { mix, shade } from '@gp/art/color';

type Ctx = CanvasRenderingContext2D;

/** Each trade's colour */
export const ROBOT_COLOUR = { wash: '#2a8fd8', grind: '#e86a1a', polish: '#b26bff', wrench: '#4fc860', paint: '#ff4f7a' } as const;

/** Painted metal: a vertical gradient from a lit top to a shaded bottom, a soft highlight band */
function metal(g: Ctx, y0: number, y1: number, base: string): CanvasGradient {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, mix(base, '#ffffff', 0.55));
  gr.addColorStop(0.18, mix(base, '#ffffff', 0.18));
  gr.addColorStop(0.55, base);
  gr.addColorStop(1, shade(base, -0.45));
  return gr;
}

/** A rounded box of painted metal with a dark outline and a rim of light on top */
function box(g: Ctx, x: number, y: number, w: number, h: number, rad: number, base: string): void {
  g.fillStyle = metal(g, y, y + h, base);
  g.beginPath();
  g.roundRect(x, y, w, h, rad);
  g.fill();
  g.strokeStyle = 'rgba(10,12,18,0.75)';
  g.lineWidth = Math.max(1, h * 0.04);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = Math.max(1, h * 0.035);
  g.beginPath();
  g.roundRect(x + w * 0.08, y + h * 0.06, w * 0.84, h * 0.3, rad * 0.7);
  g.stroke();
}

/** A joint: a steel disc with a bolt */
function joint(g: Ctx, x: number, y: number, r: number): void {
  const jg = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  jg.addColorStop(0, '#f2f4f7');
  jg.addColorStop(0.5, '#8d949e');
  jg.addColorStop(1, '#2b2f38');
  g.fillStyle = jg;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1b1e26';
  g.beginPath();
  g.arc(x, y, r * 0.32, 0, Math.PI * 2);
  g.fill();
}

/** One limb of an arm: a steel tube with a lit edge, a coloured sleeve */
function limb(g: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, col: string): void {
  g.lineCap = 'round';
  g.strokeStyle = '#1b1e26';
  g.lineWidth = w + 2.5;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.strokeStyle = '#a9b1bb';
  g.lineWidth = w;
  g.stroke();
  // A sleeve of the trade's colour in the middle
  const mx = x0 + (x1 - x0) * 0.3;
  const my = y0 + (y1 - y0) * 0.3;
  const nx = x0 + (x1 - x0) * 0.7;
  const ny = y0 + (y1 - y0) * 0.7;
  g.strokeStyle = col;
  g.lineWidth = w * 1.15;
  g.beginPath();
  g.moveTo(mx, my);
  g.lineTo(nx, ny);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineWidth = Math.max(1, w * 0.22);
  g.beginPath();
  g.moveTo(x0, y0 - w * 0.25);
  g.lineTo(x1, y1 - w * 0.25);
  g.stroke();
}

/** A two-limb arm from a shoulder to a tool (the elbow bent to one side); returns the elbow */
export function robotArm(g: Ctx, x0: number, y0: number, x1: number, y1: number, len: number, side: number, col: string, w: number): [number, number] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const d = Math.min(Math.hypot(dx, dy), len * 1.98);
  const a = Math.atan2(dy, dx);
  const bend = Math.acos(Math.max(-1, Math.min(1, d / (2 * len))));
  const ex = x0 + Math.cos(a + bend * side) * len;
  const ey = y0 + Math.sin(a + bend * side) * len;
  const tx = x0 + Math.cos(a) * d;
  const ty = y0 + Math.sin(a) * d;
  limb(g, x0, y0, ex, ey, w, col);
  limb(g, ex, ey, tx, ty, w * 0.85, col);
  joint(g, x0, y0, w * 0.85);
  joint(g, ex, ey, w * 0.75);
  return [ex, ey];
}

/** A visor: dark glass with a reflection and two glowing eyes looking toward `look` (−1…1) */
function visor(g: Ctx, x: number, y: number, w: number, h: number, look: number, blink: boolean, glow: string): void {
  const vg = g.createLinearGradient(0, y, 0, y + h);
  vg.addColorStop(0, '#2b3a52');
  vg.addColorStop(1, '#0c121c');
  g.fillStyle = vg;
  g.beginPath();
  g.roundRect(x, y, w, h, h / 2);
  g.fill();
  if (!blink) {
    g.save();
    g.shadowColor = glow;
    g.shadowBlur = h * 0.9;
    g.fillStyle = glow;
    const ex = look * w * 0.12;
    for (const k of [0.32, 0.68]) {
      g.beginPath();
      g.roundRect(x + w * k - h * 0.17 + ex, y + h * 0.28, h * 0.34, h * 0.44, h * 0.12);
      g.fill();
    }
    g.restore();
  }
  // The glass's reflection
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.beginPath();
  g.ellipse(x + w * 0.3, y + h * 0.25, w * 0.22, h * 0.12, -0.15, 0, Math.PI * 2);
  g.fill();
}

/** The washer's nozzle or the mechanic's socket wrench at (x, y), pointing along angle a */
function floorTool(g: Ctx, cat: 'wash' | 'wrench', x: number, y: number, a: number, s: number, working: boolean, t: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  if (cat === 'wash') {
    // A brass lance with a nozzle; a fan of water when it works
    g.fillStyle = '#2b2f38';
    g.beginPath();
    g.roundRect(-s * 0.32, -s * 0.09, s * 0.32, s * 0.18, s * 0.05);
    g.fill();
    const bg = g.createLinearGradient(0, -s * 0.08, 0, s * 0.08);
    bg.addColorStop(0, '#fff1b0');
    bg.addColorStop(1, '#b8892a');
    g.fillStyle = bg;
    g.beginPath();
    g.moveTo(0, -s * 0.07);
    g.lineTo(s * 0.22, -s * 0.04);
    g.lineTo(s * 0.22, s * 0.04);
    g.lineTo(0, s * 0.07);
    g.closePath();
    g.fill();
    if (working) {
      for (let i = 0; i < 6; i++) {
        const k = (t * 5 + i / 6) % 1;
        g.fillStyle = `rgba(200,235,255,${0.75 * (1 - k)})`;
        g.beginPath();
        g.arc(s * (0.25 + k * 0.45), Math.sin(i * 2.1 + t * 9) * s * 0.12 * k, s * (0.025 + 0.03 * k), 0, Math.PI * 2);
        g.fill();
      }
    }
  } else {
    // A socket wrench head turning
    g.fillStyle = '#3a3f48';
    g.beginPath();
    g.roundRect(-s * 0.3, -s * 0.07, s * 0.3, s * 0.14, s * 0.05);
    g.fill();
    g.save();
    g.rotate(working ? t * 14 : 0);
    const sg = g.createRadialGradient(-s * 0.04, -s * 0.04, 1, 0, 0, s * 0.16);
    sg.addColorStop(0, '#f2f4f7');
    sg.addColorStop(1, '#6b7380');
    g.fillStyle = sg;
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const aa = (i / 6) * Math.PI * 2;
      const px = Math.cos(aa) * s * 0.15;
      const py = Math.sin(aa) * s * 0.15;
      if (i) g.lineTo(px, py);
      else g.moveTo(px, py);
    }
    g.closePath();
    g.fill();
    g.fillStyle = '#1b1e26';
    g.beginPath();
    g.arc(0, 0, s * 0.06, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.restore();
}

/**
 * A floor robot (the washer, the mechanic) at (x, floor): a tracked base, a painted body with a visor, an antenna, and an
 * arm from its shoulder to the work at (tx, ty)
 */
export function drawFloorRobot(g: Ctx, cat: 'wash' | 'wrench', x: number, floor: number, tx: number, ty: number, s: number, bob: number, working: boolean, t: number, i: number): void {
  const col = ROBOT_COLOUR[cat];
  // Its shadow
  const sh = g.createRadialGradient(x, floor + 1, 1, x, floor + 1, s * 0.75);
  sh.addColorStop(0, 'rgba(0,0,0,0.5)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh;
  g.beginPath();
  g.ellipse(x, floor + 1, s * 0.75, s * 0.14, 0, 0, Math.PI * 2);
  g.fill();
  // The tracks: a dark belt over three wheels
  const ty0 = floor - s * 0.3;
  g.fillStyle = '#1d2027';
  g.beginPath();
  g.roundRect(x - s * 0.58, ty0, s * 1.16, s * 0.3, s * 0.15);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  g.lineWidth = 1;
  const roll = (t * (working ? 30 : 6)) % (s * 0.12);
  for (let k = -s * 0.55 + roll; k < s * 0.55; k += s * 0.12) {
    g.beginPath();
    g.moveTo(x + k, ty0 + 1);
    g.lineTo(x + k, ty0 + s * 0.06);
    g.stroke();
  }
  for (const k of [-0.36, 0, 0.36]) joint(g, x + s * k, ty0 + s * 0.15, s * 0.1);
  // The body
  const by = floor - s * 1.25 + bob;
  box(g, x - s * 0.5, by, s, s * 0.95, s * 0.28, col);
  // A hazard stripe low on the body
  g.save();
  g.beginPath();
  g.roundRect(x - s * 0.5, by, s, s * 0.95, s * 0.28);
  g.clip();
  g.fillStyle = 'rgba(20,22,28,0.85)';
  g.fillRect(x - s * 0.5, by + s * 0.72, s, s * 0.12);
  g.fillStyle = '#f2c22e';
  for (let k = -0.5; k < 0.5; k += 0.16) {
    g.beginPath();
    g.moveTo(x + s * k, by + s * 0.84);
    g.lineTo(x + s * (k + 0.06), by + s * 0.72);
    g.lineTo(x + s * (k + 0.12), by + s * 0.72);
    g.lineTo(x + s * (k + 0.06), by + s * 0.84);
    g.fill();
  }
  g.restore();
  // The visor
  const look = Math.max(-1, Math.min(1, (tx - x) / (s * 3)));
  const blink = (t * 0.7 + i * 0.3) % 3 < 0.08;
  visor(g, x - s * 0.38, by + s * 0.16, s * 0.76, s * 0.36, look, blink, '#7ff6ff');
  // The antenna and its LED
  g.strokeStyle = '#3a3f48';
  g.lineWidth = Math.max(1, s * 0.05);
  g.beginPath();
  g.moveTo(x + s * 0.28, by + 1);
  g.lineTo(x + s * 0.34, by - s * 0.24);
  g.stroke();
  const on = working || (t * 1.3 + i) % 2 < 1;
  g.save();
  g.shadowColor = on ? '#ff5a4a' : 'transparent';
  g.shadowBlur = s * 0.3;
  g.fillStyle = on ? '#ff5a4a' : '#7a2a24';
  g.beginPath();
  g.arc(x + s * 0.34, by - s * 0.26, s * 0.06, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // The arm from its shoulder to the work, and the tool
  const sx = x + (tx < x ? -1 : 1) * s * 0.42;
  const sy = by + s * 0.55;
  const len = Math.max(s * 1.2, Math.hypot(tx - sx, ty - sy) * 0.56);
  const [ex, ey] = robotArm(g, sx, sy, tx, ty, len, x < tx ? -1 : 1, col, Math.max(3, s * 0.15));
  floorTool(g, cat, tx, ty, Math.atan2(ty - ey, tx - ex), s, working, t);
}

/** A carriage on the overhead rail (the grinder, the painter) with its arm reaching down to (tx, ty) */
export function drawRailRobot(g: Ctx, cat: 'grind' | 'paint', x: number, y: number, tx: number, ty: number, s: number, working: boolean, t: number, sparks: boolean, paint: string): void {
  const col = ROBOT_COLOUR[cat];
  // Its wheels on the rail
  for (const k of [-0.32, 0.32]) joint(g, x + s * k, y - s * 0.3, s * 0.12);
  box(g, x - s * 0.6, y - s * 0.24, s * 1.2, s * 0.5, s * 0.12, '#3a3f48');
  g.fillStyle = col;
  g.beginPath();
  g.roundRect(x - s * 0.5, y - s * 0.08, s, s * 0.14, s * 0.05);
  g.fill();
  // A status lamp
  g.save();
  g.shadowColor = working ? col : 'transparent';
  g.shadowBlur = s * 0.4;
  g.fillStyle = working ? mix(col, '#ffffff', 0.4) : shade(col, -0.4);
  g.beginPath();
  g.arc(x + s * 0.45, y - s * 0.12, s * 0.06, 0, Math.PI * 2);
  g.fill();
  g.restore();
  const tipY = ty - s * 0.25;
  const len = Math.max(s * 1.1, Math.hypot(tx - x, tipY - y) * 0.56);
  const [ex, ey] = robotArm(g, x, y + s * 0.2, tx, tipY, len, 1, col, Math.max(4, s * 0.18));
  g.save();
  g.translate(tx, tipY);
  if (cat === 'grind') {
    // The motor and its disc, spinning (a blur when it works), sparks off the rust
    box(g, -s * 0.16, -s * 0.34, s * 0.32, s * 0.26, s * 0.06, '#5a616c');
    const dg = g.createRadialGradient(-s * 0.08, -s * 0.08, 1, 0, 0, s * 0.34);
    dg.addColorStop(0, '#f2f4f7');
    dg.addColorStop(0.6, '#9aa3ad');
    dg.addColorStop(1, '#4b5260');
    g.fillStyle = dg;
    g.beginPath();
    g.arc(0, 0, s * 0.34, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.rotate(t * 30);
    g.strokeStyle = working ? 'rgba(60,64,72,0.35)' : 'rgba(60,64,72,0.8)';
    g.lineWidth = Math.max(1, s * 0.04);
    for (let k = 0; k < 4; k++) {
      g.rotate(Math.PI / 4);
      g.beginPath();
      g.moveTo(-s * 0.3, 0);
      g.lineTo(s * 0.3, 0);
      g.stroke();
    }
    g.restore();
    if (working && sparks)
      for (let k = 0; k < 5; k++) {
        const p = (t * 6 + k / 5) % 1;
        g.strokeStyle = `rgba(255,${180 + k * 10},80,${1 - p})`;
        g.lineWidth = Math.max(1, s * 0.03);
        const a = Math.PI * 0.6 + k * 0.25;
        g.beginPath();
        g.moveTo(Math.cos(a) * s * (0.35 + p * 0.5), Math.sin(a) * s * (0.35 + p * 0.5));
        g.lineTo(Math.cos(a) * s * (0.45 + p * 0.7), Math.sin(a) * s * (0.45 + p * 0.7));
        g.stroke();
      }
  } else {
    // The spray gun: a cup of paint, the nozzle, a cone of mist when it works
    g.rotate(Math.atan2(tipY - ey, tx - ex) - Math.PI / 2);
    box(g, -s * 0.14, -s * 0.2, s * 0.28, s * 0.3, s * 0.06, '#c9ced6');
    g.fillStyle = paint;
    g.beginPath();
    g.roundRect(-s * 0.1, -s * 0.42, s * 0.2, s * 0.22, s * 0.05);
    g.fill();
    g.fillStyle = '#2b2f38';
    g.fillRect(-s * 0.04, s * 0.1, s * 0.08, s * 0.1);
    if (working) {
      const mg = g.createLinearGradient(0, s * 0.2, 0, s * 0.75);
      mg.addColorStop(0, mix(paint, '#ffffff', 0.2) + 'aa');
      mg.addColorStop(1, mix(paint, '#ffffff', 0.2) + '00');
      g.fillStyle = mg;
      g.beginPath();
      g.moveTo(-s * 0.05, s * 0.2);
      g.lineTo(s * 0.05, s * 0.2);
      g.lineTo(s * 0.3, s * 0.75);
      g.lineTo(-s * 0.3, s * 0.75);
      g.closePath();
      g.fill();
    }
  }
  g.restore();
}

/** The polish drone hovering over its work at (x, y): rotors in guards, a visor, a spinning buffer pad below */
export function drawDrone(g: Ctx, x: number, y: number, s: number, working: boolean, t: number, i: number): void {
  const col = ROBOT_COLOUR.polish;
  // The rotor arms and guards, the blades a blur
  for (const side of [-1, 1]) {
    const rx = x + side * s * 0.78;
    const ry = y - s * 0.28;
    g.strokeStyle = '#3a3f48';
    g.lineWidth = Math.max(2, s * 0.08);
    g.beginPath();
    g.moveTo(x + side * s * 0.4, y - s * 0.05);
    g.lineTo(rx, ry);
    g.stroke();
    g.fillStyle = 'rgba(210,225,240,0.28)';
    g.beginPath();
    g.ellipse(rx, ry, s * 0.36, s * 0.09, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(30,34,42,0.9)';
    g.lineWidth = Math.max(1, s * 0.04);
    g.stroke();
    const blade = Math.sin(t * 50 + side) * s * 0.3;
    g.strokeStyle = 'rgba(240,245,250,0.7)';
    g.lineWidth = Math.max(1, s * 0.035);
    g.beginPath();
    g.moveTo(rx - blade, ry);
    g.lineTo(rx + blade, ry);
    g.stroke();
  }
  // The body and its visor
  box(g, x - s * 0.45, y - s * 0.24, s * 0.9, s * 0.48, s * 0.24, col);
  visor(g, x - s * 0.3, y - s * 0.12, s * 0.6, s * 0.2, 0, (t * 0.7 + i * 0.3) % 3 < 0.08, '#7ff6ff');
  // The buffer pad underneath
  g.save();
  g.translate(x, y + s * 0.34);
  g.scale(1, 0.32);
  const pg = g.createRadialGradient(0, 0, 1, 0, 0, s * 0.32);
  pg.addColorStop(0, '#ffffff');
  pg.addColorStop(1, '#c9d0d8');
  g.fillStyle = pg;
  g.beginPath();
  g.arc(0, 0, s * 0.32, 0, Math.PI * 2);
  g.fill();
  if (working) {
    g.rotate(t * 20);
    g.strokeStyle = 'rgba(178,107,255,0.6)';
    g.lineWidth = s * 0.06;
    g.beginPath();
    g.arc(0, 0, s * 0.2, 0, Math.PI * 1.2);
    g.stroke();
  }
  g.restore();
}
