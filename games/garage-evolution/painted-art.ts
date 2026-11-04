// The owner's painted cars as images (painted/, made by tools/paint-cars) in asset chapters (game_platform D84): the Shed's
// cars load before Play, the later garages' after it, a tier at a time (painted/index.ts, tools/paint-cars/chapters.py).
// In the one-file upload a later chapter is data blocks after the game's script; @gp/art/assets decodes a picture in
// idle time when it is asked for (the car on the stand first). Until it is decoded a painted car is drawn as a plain
// silhouette; main re-bakes the car and its thumbnails when it arrives.

import { createAssets } from '@gp/art/assets';
import { CHAPTERS, URLS } from './painted/index.ts';

export const pictures = createAssets({ urls: URLS, chapters: CHAPTERS });

/** A decoded picture by name (`<model>`, `<model>-w0`, `<model>-bf` …), or null while it isn't (asks for it, first in line) */
export function paintedImg(name: string): HTMLImageElement | null {
  return name in URLS ? pictures.get(name) : null;
}

/** A model's pictures: its body, wheels and bumpers */
const carIdsCache = new Map<string, string[]>();
export function carPictures(model: string): string[] {
  let ids = carIdsCache.get(model);
  if (!ids) {
    ids = Object.keys(URLS).filter((n) => n === model || n.startsWith(`${model}-`));
    carIdsCache.set(model, ids);
  }
  return ids;
}
/** All of a model's pictures are decoded (a drawn vehicle has none: true) */
export const carLoaded = (model: string): boolean => carPictures(model).every((n) => pictures.loaded(n));
/** Resolves when a model's pictures are decoded (asks for them now) */
export const carReady = (model: string): Promise<void> => pictures.ready(carPictures(model)).catch(() => undefined);

/** Hex → [r, g, b] */
function rgbOf(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Hue (0–360), saturation and lightness (0–1) of a colour */
function hsl(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b) / 255;
  const mn = Math.min(r, g, b) / 255;
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d < 1e-6) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  if (mx === R) h = ((G - B) / d) % 6;
  else if (mx === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

/** [r, g, b] 0–255 from hue (0–360), saturation and lightness (0–1) */
function rgbFromHsl(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

const smooth = (a: number, b: number, x: number) => Math.max(0, Math.min(1, (x - a) / (b - a)));

const recolored = new Map<string, HTMLCanvasElement>();

/**
 * A body picture (or a bumper) in another paint (a respray, a colour variant): the pixels of the picture's own paint take the new
 * colour at the same lightness — shading, reflections and highlights stay; glass, trim, lamps and other colours (a
 * two-tone's second colour, a livery) stay as painted
 */
export function paintedBody(name: string, from: string, to: string): HTMLCanvasElement | HTMLImageElement | null {
  const img = paintedImg(name);
  if (!img) return null;
  if (from.toLowerCase() === to.toLowerCase()) return img;
  const key = `${name}:${to}`;
  const hit = recolored.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  const [fr, fg, fb] = rgbOf(from);
  const [tr, tg, tb] = rgbOf(to);
  const [fh, fs, fl] = hsl(fr, fg, fb);
  const [th, ts, tl] = hsl(tr, tg, tb);
  const grey = fs < 0.25;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const r = px[i];
    const gg = px[i + 1];
    const b = px[i + 2];
    const [h, s, l] = hsl(r, gg, b);
    // How much this pixel is the body's paint, and its new colour: a coloured paint turns its hue (saturation, shading
    // and highlights stay: the picture's own light); a white, silver or black one is tinted at its lightness
    let w: number;
    let nr: number;
    let ng: number;
    let nb: number;
    if (grey) {
      w = (1 - smooth(0.1, 0.2, s)) * smooth(fl - 0.4, fl - 0.22, l) * (1 - smooth(fl + 0.25, fl + 0.4, l));
      if (w <= 0) continue;
      [nr, ng, nb] = rgbFromHsl(th, ts, Math.max(0, Math.min(1, l + (tl - fl))));
    } else {
      const dh = Math.min(Math.abs(h - fh), 360 - Math.abs(h - fh));
      w = (1 - smooth(18, 32, dh)) * smooth(fs * 0.45, fs * 0.7, s);
      if (w <= 0) continue;
      [nr, ng, nb] = rgbFromHsl((h + th - fh + 360) % 360, s, l);
    }
    px[i] = r + (nr - r) * w;
    px[i + 1] = gg + (ng - gg) * w;
    px[i + 2] = b + (nb - b) * w;
  }
  g.putImageData(data, 0, 0);
  recolored.set(key, c);
  return c;
}
