// Keep the factory rim, tyre, spokes and brakes from the original photograph.
// Some cut-outs were extracted around a slightly wrong axle: the outer tyre is
// circular but the rim/hub inside it is off-centre. Correct the *photograph*
// instead of hiding the error under a separately drawn black circle.
const cache = new WeakMap<HTMLImageElement, CanvasImageSource>();

/** Locate the concentric metal rim / hub edges inside a factory tyre image. */
export function alignedFactoryWheel(img: HTMLImageElement): CanvasImageSource {
  const hit = cache.get(img);
  if (hit) return hit;

  const result = align(img);
  cache.set(img, result);
  return result;
}

function align(img: HTMLImageElement): CanvasImageSource {
  if (img.width < 50 || img.height < 50 || Math.abs(img.width - img.height) > img.width * .1) return img;

  // One small optical measurement per loaded asset, never once per animation frame.
  const n = 96;
  const probe = document.createElement('canvas');
  probe.width = probe.height = n;
  const pg = probe.getContext('2d', { willReadFrequently: true });
  if (!pg) return img;
  pg.drawImage(img, 0, 0, n, n);
  const pixels = pg.getImageData(0, 0, n, n).data;
  const lum = new Float32Array(n * n);
  for (let i = 0; i < lum.length; i++) {
    const k = i * 4;
    lum[i] = (pixels[k] * .2126 + pixels[k + 1] * .7152 + pixels[k + 2] * .0722) *
      Math.min(1, pixels[k + 3] / 220);
  }

  const angles = Array.from({ length: 48 }, (_, i) => {
    const a = i * Math.PI * 2 / 48;
    return [Math.cos(a), Math.sin(a)] as const;
  });
  const edge = (cx: number, cy: number, radius: number): number => {
    const values: number[] = [];
    for (const [cos, sin] of angles) {
      const ax = Math.round(cx + cos * (radius - 1.5));
      const ay = Math.round(cy + sin * (radius - 1.5));
      const bx = Math.round(cx + cos * (radius + 1.5));
      const by = Math.round(cy + sin * (radius + 1.5));
      if (ax < 0 || ax >= n || ay < 0 || ay >= n || bx < 0 || bx >= n || by < 0 || by >= n) return 0;
      values.push(Math.abs(lum[by * n + bx] - lum[ay * n + ax]));
    }
    // Ignore reflections / spokes that happen to cross the circle.
    values.sort((a, b) => a - b);
    let total = 0;
    for (let i = 6; i < 42; i++) total += values[i];
    return total / 36;
  };

  const centre = (n - 1) / 2;
  let base = 0;
  let best = { score: 0, x: 0, y: 0 };
  for (let dy = -6; dy <= 6; dy++) {
    for (let dx = -6; dx <= 6; dx++) {
      let value = 0;
      for (let r = 23; r <= 39; r++) value = Math.max(value, edge(centre + dx, centre + dy, r));
      if (dx === 0 && dy === 0) base = value;
      // Avoid shifting an already centred factory wheel to a bright brake caliper.
      const score = value - .13 * (dx * dx + dy * dy);
      if (score > best.score) best = { score, x: dx, y: dy };
    }
  }

  // No speculative corrections; accept only a clear circular edge and a
  // measurable offset, with a tight displacement limit.
  if (Math.hypot(best.x, best.y) < 1.8 || best.score < base * 1.13 + 1.5) return img;

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return img;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const original = new Uint8ClampedArray(data.data);
  const output = data.data;
  const ox = (w - 1) / 2;
  const oy = (h - 1) / 2;
  const radius = Math.min(w, h) / 2;
  const shiftX = best.x * w / n;
  const shiftY = best.y * h / n;

  // Shift the inner *original pixels*, tapering the displacement through the
  // rubber sidewall. The tyre's circular outer outline and its antialiasing stay
  // exactly as photographed; no pasted solid disks, generic rims or black fill.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const rr = Math.hypot(x - ox, y - oy) / radius;
      if (rr >= .95) continue;
      const u = Math.max(0, Math.min(1, (rr - .78) / .17));
      const taper = 1 - u * u * (3 - 2 * u);
      const sx = Math.max(0, Math.min(w - 1.001, x + shiftX * taper));
      const sy = Math.max(0, Math.min(h - 1.001, y + shiftY * taper));
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const a = (y0 * w + x0) * 4;
      const b = a + 4;
      const c = a + w * 4;
      const d = c + 4;
      const dst = (y * w + x) * 4;
      // Never turn a filled tyre into a transparent hole.
      const alpha = original[a + 3] * (1 - fx) * (1 - fy) + original[b + 3] * fx * (1 - fy) +
        original[c + 3] * (1 - fx) * fy + original[d + 3] * fx * fy;
      if (alpha < original[dst + 3] * .85) continue;
      for (let k = 0; k < 4; k++) {
        output[dst + k] = original[a + k] * (1 - fx) * (1 - fy) +
          original[b + k] * fx * (1 - fy) + original[c + k] * (1 - fx) * fy + original[d + k] * fx * fy;
      }
    }
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}
