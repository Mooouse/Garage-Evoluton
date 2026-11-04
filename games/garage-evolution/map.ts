// The network's map (1.4, the owner's table §5): the Earth as a flat map with the garages in their cities — drag to move,
// pinch or scroll to zoom, tap a garage — and the Solar System with the Sun, the planets on their orbits and the Moon,
// where the space garages are. A smooth zoom between the two. Drawn on its own canvas; the DOM around it (the card of the
// chosen garage, its buttons) is main.ts's. Only the opened and the next garages show their numbers.

import { SITES, type Site } from './data.ts';

type Ctx = CanvasRenderingContext2D;
export type MapView = 'earth' | 'space';

export interface MapPin {
  site: Site;
  /** open: the player has it; next: the one to buy; locked: later */
  state: 'open' | 'next' | 'locked';
  here: boolean;
  /** Robots in it, its income a minute (open ones) */
  robots: number;
  label: string;
}

export interface MapOptions {
  pins: () => MapPin[];
  /** A garage was tapped */
  onPick: (id: string) => void;
  /** The view changed (the tab follows) */
  onView?: (v: MapView) => void;
  /** Texts: the planets' names */
  t: (key: string) => string;
}

// The continents, coarse (lon, lat): a cartoon world, recognisable at a glance
const LAND: [number, number][][] = [
  // North America
  [[-168, 65], [-140, 70], [-110, 72], [-80, 72], [-62, 60], [-55, 50], [-67, 45], [-76, 35], [-81, 25], [-90, 29], [-97, 26], [-97, 20], [-87, 15], [-83, 9], [-80, 8], [-92, 15], [-105, 20], [-112, 30], [-118, 34], [-124, 40], [-124, 48], [-135, 58], [-150, 60], [-165, 60]],
  // Greenland
  [[-50, 60], [-42, 60], [-20, 70], [-20, 80], [-60, 82], [-70, 76], [-55, 68]],
  // South America
  [[-80, 8], [-72, 12], [-60, 10], [-50, 0], [-35, -6], [-38, -15], [-48, -25], [-58, -35], [-65, -45], [-68, -55], [-75, -50], [-72, -35], [-71, -18], [-80, -5]],
  // Europe
  [[-10, 36], [-9, 43], [-2, 44], [-5, 48], [2, 51], [8, 54], [10, 58], [5, 62], [15, 69], [28, 71], [40, 67], [45, 60], [40, 48], [30, 45], [28, 41], [22, 38], [18, 40], [12, 44], [8, 44], [3, 42], [-5, 36]],
  // Britain
  [[-5, 50], [1, 51], [-1, 55], [-3, 58], [-6, 56], [-4, 53]],
  // Africa
  [[-17, 15], [-17, 21], [-10, 30], [-5, 36], [10, 37], [20, 32], [32, 31], [35, 28], [43, 12], [51, 12], [42, -2], [40, -15], [35, -25], [20, -35], [17, -29], [12, -17], [13, -5], [9, 4], [-8, 4], [-15, 10]],
  // Madagascar
  [[44, -25], [47, -25], [50, -15], [49, -12], [44, -17]],
  // Asia (with India)
  [[28, 41], [40, 48], [45, 60], [60, 70], [80, 73], [110, 77], [140, 72], [170, 68], [180, 65], [160, 60], [142, 50], [135, 43], [127, 38], [120, 32], [122, 25], [110, 20], [106, 10], [100, 13], [98, 8], [92, 22], [80, 15], [77, 8], [72, 20], [66, 25], [57, 25], [50, 30], [48, 30], [44, 38], [36, 36]],
  // Arabia
  [[35, 28], [44, 12], [52, 15], [58, 22], [56, 26], [50, 27], [47, 30], [38, 33]],
  // Japan
  [[130, 31], [136, 34], [141, 36], [142, 42], [140, 44], [138, 38], [132, 34]],
  // Indonesia
  [[95, 5], [105, -6], [115, -8], [125, -9], [130, -3], [120, 2], [110, 2]],
  // Australia
  [[114, -22], [122, -18], [130, -12], [137, -12], [142, -11], [146, -19], [153, -27], [150, -37], [140, -38], [132, -32], [116, -35], [114, -30]],
  // New Zealand
  [[172, -34], [178, -38], [174, -41], [170, -46], [167, -45], [172, -40]],
];

/** The planets: orbit radius (a share of the view), size, colour, a ring */
const PLANETS: { id: string; orbit: number; r: number; color: string; ring?: boolean; speed: number }[] = [
  { id: 'mercury', orbit: 0.12, r: 0.012, color: '#b9a48e', speed: 0.9 },
  { id: 'venus', orbit: 0.18, r: 0.018, color: '#e8c27a', speed: 0.6 },
  { id: 'earth', orbit: 0.25, r: 0.02, color: '#3d8de0', speed: 0.45 },
  { id: 'mars', orbit: 0.32, r: 0.015, color: '#d4613a', speed: 0.35 },
  { id: 'jupiter', orbit: 0.44, r: 0.04, color: '#d9a877', speed: 0.18 },
  { id: 'saturn', orbit: 0.56, r: 0.034, color: '#e6cf8f', ring: true, speed: 0.13 },
  { id: 'uranus', orbit: 0.67, r: 0.025, color: '#9fe3ea', speed: 0.09 },
  { id: 'neptune', orbit: 0.77, r: 0.024, color: '#4f74e8', speed: 0.07 },
];

export function createMap(canvas: HTMLCanvasElement, o: MapOptions) {
  const g = canvas.getContext('2d')!;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let view: MapView = 'earth';
  /** 0 the Earth … 1 the Solar System (animated) */
  let blend = 0;
  let blendTo = 0;
  // The Earth's camera: the map's centre in lon/lat and the zoom (1: the whole world fits the width)
  let cx = 10;
  let cy = 22;
  let zoom = 1;
  let selected: string | null = null;
  let raf = 0;
  let t0 = performance.now();
  let alive = true;

  function resize(): void {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  // Earth projection: equirectangular, the world 360° wide at zoom 1 spans the view's width (or its height ×2)
  const scaleE = () => (Math.max(W / 360, (H * 2) / 360 / 1.1) * zoom);
  const toScreen = (lon: number, lat: number): [number, number] => [W / 2 + (lon - cx) * scaleE(), H / 2 - (lat - cy) * scaleE()];
  function clampCam(): void {
    const s = scaleE();
    const halfW = W / 2 / s;
    const halfH = H / 2 / s;
    cx = halfW >= 180 ? 0 : Math.max(-180 + halfW, Math.min(180 - halfW, cx));
    cy = halfH >= 75 ? 10 : Math.max(-60 + halfH, Math.min(82 - halfH, cy));
  }

  // Space: the Sun in the middle, the orbits scaled to the view's shorter side
  // The system fills the view: wide orbits on a wide view (they are ellipses), never off its height
  // A tall view (a phone held upright) lays the orbits out tall
  const wide = () => W >= H;
  const R = () => (wide() ? Math.min(W / 2.5, H / 1.35) : Math.min(H / 2.5, W / 1.35));
  const kx = () => (wide() ? 1.55 : 0.82);
  const ky = () => (wide() ? 0.82 : 1.55);
  function planetAt(id: string, t: number): [number, number] {
    const p = PLANETS.find((x) => x.id === id)!;
    const a = 0.6 + PLANETS.indexOf(p) * 1.7 + t * p.speed * 0.05;
    return [W / 2 + Math.cos(a) * p.orbit * R() * kx(), H / 2 + Math.sin(a) * p.orbit * R() * ky()];
  }
  function moonAt(t: number): [number, number] {
    const [ex, ey] = planetAt('earth', t);
    const a = t * 0.4;
    return [ex + Math.cos(a) * R() * 0.045, ey + Math.sin(a) * R() * 0.045];
  }
  /** Where a garage's pin sits now */
  function pinAt(site: Site, t: number): [number, number] {
    if (!site.space) return toScreen(site.lon, site.lat);
    // The Moon's garage and the orbital dock beside the Earth, apart (their labels never on each other)
    if (site.space === 'moon' || site.space === 'orbit') {
      const [ex, ey] = planetAt('earth', t);
      return site.space === 'moon' ? [ex + 30, ey - 10] : [ex - 30, ey - 30];
    }
    const [x, y] = planetAt(site.space, t);
    return [x, y - R() * 0.06];
  }

  function drawEarth(t: number): void {
    // The ocean
    const sea = g.createLinearGradient(0, 0, 0, H);
    sea.addColorStop(0, '#1d4f86');
    sea.addColorStop(1, '#123a66');
    g.fillStyle = sea;
    g.fillRect(0, 0, W, H);
    // The graticule
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    g.lineWidth = 1;
    for (let lon = -180; lon <= 180; lon += 30) {
      const [x] = toScreen(lon, 0);
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, H);
      g.stroke();
    }
    for (let lat = -60; lat <= 80; lat += 20) {
      const [, y] = toScreen(0, lat);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
    // The land: a shadow, the fill, a coast line
    for (const pass of [0, 1]) {
      for (const poly of LAND) {
        g.beginPath();
        poly.forEach(([lon, lat], i) => {
          const [x, y] = toScreen(lon, lat);
          if (i) g.lineTo(x, y + (pass ? 0 : 3));
          else g.moveTo(x, y + (pass ? 0 : 3));
        });
        g.closePath();
        if (pass === 0) {
          g.fillStyle = 'rgba(5,20,40,0.45)';
          g.fill();
        } else {
          const land = g.createLinearGradient(0, 0, 0, H);
          land.addColorStop(0, '#9fcf7a');
          land.addColorStop(1, '#6fa857');
          g.fillStyle = land;
          g.fill();
          g.strokeStyle = '#e9f6d8';
          g.lineWidth = 1.5;
          g.stroke();
        }
      }
    }
    // The routes between opened garages, in order
    const pins = o.pins().filter((p) => !p.site.space);
    const open = pins.filter((p) => p.state === 'open');
    g.save();
    g.setLineDash([6, 6]);
    g.lineDashOffset = -t * 20;
    g.strokeStyle = 'rgba(255,214,102,0.7)';
    g.lineWidth = 2;
    for (let i = 1; i < open.length; i++) {
      const [x0, y0] = toScreen(open[i - 1].site.lon, open[i - 1].site.lat);
      const [x1, y1] = toScreen(open[i].site.lon, open[i].site.lat);
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo((x0 + x1) / 2, Math.min(y0, y1) - Math.abs(x1 - x0) * 0.2, x1, y1);
      g.stroke();
    }
    g.restore();
    for (const p of pins) drawPin(p, ...toScreen(p.site.lon, p.site.lat), t);
  }

  function drawSpace(t: number): void {
    g.fillStyle = '#050816';
    g.fillRect(0, 0, W, H);
    // Stars
    for (let i = 0; i < 160; i++) {
      const x = ((i * 9301 + 49297) % 233280) / 233280;
      const y = ((i * 7907 + 13) % 104729) / 104729;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.8 + i));
      g.fillStyle = `rgba(255,255,255,${0.25 + 0.5 * tw * ((i % 5) / 5)})`;
      g.fillRect(x * W, y * H, 1.5, 1.5);
    }
    // The Sun
    const sun = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, R() * 0.12);
    sun.addColorStop(0, '#fffbe0');
    sun.addColorStop(0.35, '#ffd34a');
    sun.addColorStop(1, 'rgba(255,140,30,0)');
    g.fillStyle = sun;
    g.beginPath();
    g.arc(W / 2, H / 2, R() * 0.12, 0, Math.PI * 2);
    g.fill();
    // Orbits and planets
    for (const p of PLANETS) {
      g.strokeStyle = 'rgba(160,190,255,0.18)';
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(W / 2, H / 2, p.orbit * R() * kx(), p.orbit * R() * ky(), 0, 0, Math.PI * 2);
      g.stroke();
      const [x, y] = planetAt(p.id, t);
      const r = Math.max(3, p.r * R());
      const body = g.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
      body.addColorStop(0, '#ffffff');
      body.addColorStop(0.25, p.color);
      body.addColorStop(1, '#0b0d18');
      if (p.ring) {
        g.strokeStyle = 'rgba(240,220,170,0.7)';
        g.lineWidth = Math.max(1.5, r * 0.25);
        g.beginPath();
        g.ellipse(x, y, r * 1.9, r * 0.6, -0.3, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = body;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(220,230,255,0.75)';
      g.font = `600 ${Math.max(10, Math.min(13, W / 60))}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.fillText(o.t(`map.planet.${p.id}`), x, y + r + 13);
    }
    // The Moon
    const [mx, my] = moonAt(t);
    g.fillStyle = '#d9dde3';
    g.beginPath();
    g.arc(mx, my, Math.max(2.5, R() * 0.008), 0, Math.PI * 2);
    g.fill();
    for (const p of o.pins().filter((q) => q.site.space)) drawPin(p, ...pinAt(p.site, t), t);
  }

  function drawPin(p: MapPin, x: number, y: number, t: number): void {
    const r = p.here ? 15 : 12;
    const sel = selected === p.site.id;
    g.save();
    if (p.here || sel) {
      const pulse = 1 + 0.25 * Math.sin(t * 4);
      g.fillStyle = sel ? 'rgba(255,214,102,0.35)' : 'rgba(127,224,255,0.3)';
      g.beginPath();
      g.arc(x, y, r * 1.8 * pulse, 0, Math.PI * 2);
      g.fill();
    }
    // The pin: a disc on a stem
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(x, y + r + 4, r * 0.6, r * 0.22, 0, 0, Math.PI * 2);
    g.fill();
    const fill = p.state === 'open' ? (p.here ? '#7fe0ff' : '#ffd166') : p.state === 'next' ? '#ffffff' : '#7c8594';
    g.fillStyle = fill;
    g.strokeStyle = '#1b1f2a';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#1b1f2a';
    g.font = `900 ${r}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (p.state === 'locked') {
      // A padlock: a shackle and a body
      g.strokeStyle = '#1b1f2a';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y - r * 0.12, r * 0.3, Math.PI, 0);
      g.stroke();
      g.fillStyle = '#1b1f2a';
      g.fillRect(x - r * 0.42, y - r * 0.1, r * 0.84, r * 0.6);
    } else g.fillText(String(p.site.tier), x, y + 1);
    // Its label (open and next only; a planet's garage has the planet's name under it already)
    const planet = !!p.site.space && p.site.space !== 'moon' && p.site.space !== 'orbit';
    if (p.state !== 'locked' || sel) {
      if (!planet) {
        g.font = `800 ${Math.max(11, Math.min(13, W / 55))}px system-ui, sans-serif`;
        const tw = g.measureText(p.label).width;
        const lx = Math.max(tw / 2 + 4, Math.min(W - tw / 2 - 4, x));
        const ly = y - r - 12;
        g.fillStyle = 'rgba(12,16,28,0.82)';
        g.beginPath();
        g.roundRect(lx - tw / 2 - 6, ly - 9, tw + 12, 18, 9);
        g.fill();
        g.fillStyle = p.state === 'next' ? '#ffffff' : '#ffe08a';
        g.fillText(p.label, lx, ly + 1);
      }
      if (p.state === 'open' && p.robots) {
        // Its robots: a small robot head and the count
        const hx = x + r + 8;
        g.fillStyle = '#9fe8a0';
        g.beginPath();
        g.roundRect(hx - 5, y - 5, 10, 9, 3);
        g.fill();
        g.fillStyle = '#1b1f2a';
        g.fillRect(hx - 3, y - 2, 2, 2);
        g.fillRect(hx + 1, y - 2, 2, 2);
        g.fillStyle = '#9fe8a0';
        g.font = `800 11px system-ui, sans-serif`;
        g.textAlign = 'left';
        g.fillText(String(p.robots), hx + 7, y);
      }
    }
    g.restore();
  }

  function frame(now: number): void {
    if (!alive) return;
    const t = (now - t0) / 1000;
    blend += (blendTo - blend) * Math.min(1, 0.12);
    if (Math.abs(blendTo - blend) < 0.002) blend = blendTo;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (blend < 1) {
      // The Earth shrinks toward the planet Earth on its orbit as the view leaves for space
      const [ex, ey] = planetAt('earth', t);
      const k = 1 - blend;
      g.save();
      g.globalAlpha = Math.min(1, k * 1.4);
      g.translate(ex + (W / 2 - ex) * k, ey + (H / 2 - ey) * k);
      g.scale(0.04 + 0.96 * k * k, 0.04 + 0.96 * k * k);
      g.translate(-W / 2, -H / 2);
      drawEarth(t);
      g.restore();
    }
    if (blend > 0) {
      g.save();
      g.globalAlpha = Math.min(1, blend * 1.4);
      drawSpace(t);
      g.restore();
    }
    raf = requestAnimationFrame(frame);
  }

  // --- Input: drag to move, pinch or wheel to zoom, a tap picks a pin
  const touches = new Map<number, [number, number]>();
  let moved = 0;
  let pinchD = 0;
  const local = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  function zoomAt(f: number, x: number, y: number): void {
    if (view !== 'earth') return;
    const s0 = scaleE();
    const lon = cx + (x - W / 2) / s0;
    const lat = cy - (y - H / 2) / s0;
    zoom = Math.max(1, Math.min(6, zoom * f));
    const s1 = scaleE();
    cx = lon - (x - W / 2) / s1;
    cy = lat + (y - H / 2) / s1;
    clampCam();
  }
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    touches.set(e.pointerId, local(e));
    moved = 0;
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      pinchD = Math.hypot(a[0] - b[0], a[1] - b[1]);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = touches.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    touches.set(e.pointerId, p);
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinchD) zoomAt(d / pinchD, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      pinchD = d;
      moved += 10;
      return;
    }
    moved += Math.abs(p[0] - prev[0]) + Math.abs(p[1] - prev[1]);
    if (view === 'earth') {
      cx -= (p[0] - prev[0]) / scaleE();
      cy += (p[1] - prev[1]) / scaleE();
      clampCam();
    }
  });
  const up = (e: PointerEvent) => {
    const p = touches.get(e.pointerId);
    touches.delete(e.pointerId);
    if (touches.size < 2) pinchD = 0;
    if (!p || moved > 8) return;
    // A tap: the nearest pin within reach
    const t = (performance.now() - t0) / 1000;
    let best: string | null = null;
    let bd = 34;
    for (const pin of o.pins()) {
      if (!!pin.site.space !== (view === 'space')) continue;
      const [x, y] = pinAt(pin.site, t);
      const d = Math.hypot(x - p[0], y - p[1]);
      if (d < bd) {
        bd = d;
        best = pin.site.id;
      }
    }
    if (best) {
      selected = best;
      o.onPick(best);
    }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', (e) => touches.delete(e.pointerId));
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [x, y] = [e.offsetX, e.offsetY];
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, x, y);
  }, { passive: false });

  resize();
  clampCam();
  raf = requestAnimationFrame(frame);

  return {
    resize(): void {
      resize();
      clampCam();
    },
    setView(v: MapView): void {
      view = v;
      blendTo = v === 'space' ? 1 : 0;
      o.onView?.(v);
    },
    get view(): MapView {
      return view;
    },
    zoomBy(f: number): void {
      zoomAt(f, W / 2, H / 2);
    },
    /** Centre on a garage and choose it */
    focus(id: string): void {
      const s = SITES.find((x) => x.id === id);
      if (!s) return;
      selected = id;
      if (s.space) this.setView('space');
      else {
        this.setView('earth');
        cx = s.lon;
        cy = s.lat;
        zoom = Math.max(zoom, 1.6);
        clampCam();
      }
      blend = blendTo;
    },
    destroy(): void {
      alive = false;
      cancelAnimationFrame(raf);
    },
  };
}
