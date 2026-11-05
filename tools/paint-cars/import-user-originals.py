#!/usr/bin/env python3
"""Import the owner's original transparent high-resolution PNG drawings.

The body and wheel sprites are produced from the original pixels at native
resolution, not upscaled from the low-quality WebP placeholders.  The model
IDs, balance, task and save IDs remain unchanged.  Wheel centres have been
measured on the *original* images, so the tyres continue rotating separately.

The generated geometric metadata is also patched into the single-file web
build (game.js): merely changing meta.ts would not affect the published game.

Run from the repository root with Pillow and NumPy installed:
python tools/paint-cars/import-user-originals.py
"""
from __future__ import annotations
import base64
import json
import math
import re
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PAINT = ROOT / 'games' / 'garage-evolution' / 'painted'
ORIGINALS = PAINT / 'originals'
GAME_JS = ROOT / 'game.js'

# (base colour, rear and front wheels): wheel locations on the original
# trimmed picture rescaled to 900 pixels wide, x/y/r in pixels.
# Both wheel centres were checked against the native, transparent sources.
CONFIG = {
    'longnose': ('#183f80', [(180, 202, 62), (729, 205, 63)]),
    'scissor': ('#687544', [(164, 151, 57), (682, 157, 56)]),
    'storm': ('#687746', [(166, 154, 56), (683, 159, 55)]),
    'zephyrus': ('#61733d', [(165, 145, 58), (684, 155, 55)]),
    'viola': ('#63733e', [(164, 153, 57), (683, 160, 55)]),
    'tempest': ('#8634c6', [(160, 212, 70), (722, 217, 68)]),
    'trackwing': ('#11a85a', [(202, 193, 61), (700, 199, 63)]),
    'carboncrown': ('#096848', [(183, 211, 68), (729, 211, 64)]),
}


def save_webp(rgba: np.ndarray, dest: Path, quality: int = 96) -> None:
    image = Image.fromarray(rgba, 'RGBA')
    image.save(dest, 'WEBP', quality=quality, method=5, exact=True)


def crop_original(path: Path):
    source = np.array(Image.open(path).convert('RGBA'))
    ys, xs = np.nonzero(source[:, :, 3] > 80)
    if len(xs) < 5000:
        raise ValueError(f'{path.name}: no opaque vehicle')
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    car = source[y0:y1 + 1, x0:x1 + 1].copy()
    if car.shape[1] < 900:
        raise ValueError(f'{path.name}: source is below native HD size')
    return car


def wheel_patch(car, cx, cy, radius):
    rad = math.ceil(radius * 1.065)
    pad = rad + 4
    padded = np.pad(car, ((pad, pad), (pad, pad), (0, 0)))
    center_x, center_y = int(round(cx)) + pad, int(round(cy)) + pad
    patch = padded[center_y - rad:center_y + rad + 1,
                   center_x - rad:center_x + rad + 1].copy()
    py, px = np.ogrid[-rad:rad + 1, -rad:rad + 1]
    dist = np.hypot(px, py)
    edge = np.clip((radius + 0.6 - dist) * 1.35, 0, 1)
    patch[:, :, 3] = np.uint8(patch[:, :, 3].astype(np.float32) * edge)
    # Neutral centre cap: these generated artworks must have no manufacturer logo.
    rim = (dist >= radius * .12) & (dist <= radius * .20) & (patch[:, :, 3] > 120)
    if np.any(rim):
        metal = np.median(patch[:, :, :3][rim], axis=0)
        patch[:, :, :3][dist < radius * .075] = (metal * .75).astype('uint8')
    return patch


def polygon_and_mask(body, width):
    H, W = body.shape[:2]
    # A real mask from the final cut-out, not the old placeholder's outline.
    from PIL import Image as PilImage
    rows = max(1, round(128 * H / W))
    alpha_small = np.asarray(PilImage.fromarray(body[:, :, 3], 'L').resize((128, rows), PilImage.Resampling.BOX))
    bits = np.packbits((alpha_small > 95).flatten(), bitorder='big').tobytes()
    outline = []
    for xs in (np.linspace(.04, .96, 24), np.linspace(.96, .04, 24)):
        top = len(outline) == 0
        for u in xs:
            col = body[:, min(W - 1, max(0, int(u * (W - 1)))), 3]
            opaque = np.flatnonzero(col > 90)
            yy = int(opaque.min() if top else opaque.max()) if len(opaque) else H - 1
            outline.append([round(float(u), 5), round((H - yy) / W, 5)])
    return {'cols': 128, 'rows': rows, 'bits': base64.b64encode(bits).decode()}, outline


def import_one(name, colour, positions, meta):
    path = ORIGINALS / (name + '.png')
    if not path.exists():
        raise FileNotFoundError(path)
    car = crop_original(path)
    H0, W = car.shape[:2]
    centers = [(x / 900 * W, y / 900 * W, r / 900 * W) for x, y, r in positions]
    # Trim non-vehicle pixels below the tyre contact line. The image's floor
    # shadow must not make the car hover in the garage.
    ground = min(H0, math.ceil(max(y + r for _, y, r in centers)) + 2)
    if ground < int(H0 * .76):
        raise ValueError(f'{name}: suspect tyre positions, ground at {ground} / {H0}')
    car = car[:ground].copy()
    H = car.shape[0]
    body = car.copy()
    yy, xx = np.ogrid[:H, :W]
    wheels = []
    # Existing game expects independent rear/front wheel sprites. Never bake
    # wheel pixels into the body, including the dark lower tyre arc.
    for index, (cx, cy, r) in enumerate(centers):
        if not (r > 20 and r < W * .17 and r < cx < W - r and r < cy < H + r):
            raise ValueError(f'{name}: wheel {index} outside source')
        patch = wheel_patch(car, cx, cy, r)
        save_webp(patch, PAINT / f'{name}-w{index}.webp', 98)
        wheels.append({'x': round(cx / W, 6), 'r': round(r / W, 6),
                       'lift': round(max(0, (H - cy - r) / W), 6)})
        d = np.hypot(xx - cx, yy - cy)
        hole = (d < r * 1.085) | ((yy - cy > r * .35) &
                (np.hypot((xx - cx) / 1.12, (yy - cy - r * .36) / .85) < r))
        body[:, :, 3][hole] = 0
    # Separate the small bumper panels. The darkened mounting area remains,
    # so a removed bumper never makes a whole side of the car disappear.
    parts = {}
    for side, code in (('rear', 'br'), ('front', 'bf')):
        x0, x1 = (0, int(W * .056)) if side == 'rear' else (int(W * .944), W)
        y0, y1 = max(0, H - int(W * .12)), H
        patch = body[y0:y1, x0:x1].copy()
        # Original colour in the detached part, dark inner mount in the car.
        save_webp(patch, PAINT / f'{name}-{code}.webp', 98)
        section = body[y0:y1, x0:x1, :3]
        section[:] = (section.astype(np.float32) * .32 + 30 * .68).astype('uint8')
        key = 'bumperR' if side == 'rear' else 'bumperF'
        parts[key] = [round(x0 / W, 6), 0, round(x1 / W, 6), round((H - y0) / W, 6)]
    save_webp(body, PAINT / f'{name}.webp', 96)
    mask, outline = polygon_and_mask(body, W)
    ratio = round(H / W, 6)
    meta[name] = {
        'colour': colour, 'height': ratio,
        'img': {'w': W, 'h': H, 'x': 0, 'top': ratio, 'len': 1},
        'wheels': wheels, 'wheelImg': [0, 1],
        'parts': parts, 'mask': mask, 'outline': outline,
    }
    print(f'{name}: source {W}x{H0} -> {W}x{H} HD, 2 separate wheels, bumpers')


def find_balanced_json(source: str, prefix: str):
    at = source.find(prefix)
    if at < 0:
        raise RuntimeError('Game metadata entry marker changed: ' + prefix)
    begin = at + len(prefix)
    if source[begin] != '{':
        raise RuntimeError('Expected metadata JSON object')
    depth, quoted, escaped = 0, False, False
    for i in range(begin, len(source)):
        c = source[i]
        if quoted:
            if escaped: escaped = False
            elif c == '\\': escaped = True
            elif c == '"': quoted = False
        elif c == '"': quoted = True
        elif c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return begin, i + 1
    raise RuntimeError('Unclosed runtime metadata JSON')


def main():
    path = PAINT / 'meta.json'
    meta = json.loads(path.read_text(encoding='utf-8'))
    missing = sorted(set(CONFIG) - set(meta))
    if missing:
        raise RuntimeError('Unknown IDs; refusing to overwrite models: ' + ', '.join(missing))
    for name, (colour, positions) in CONFIG.items():
        import_one(name, colour, positions, meta)
    path.write_text(json.dumps(meta, ensure_ascii=False, indent=1, sort_keys=True) + '\n', encoding='utf-8')
    mt = PAINT / 'meta.ts'
    old = mt.read_text(encoding='utf-8')
    marker = 'export const PAINTED: Record<string, PaintedMeta> = '
    at = old.find(marker)
    if at < 0: raise RuntimeError('meta.ts generated declaration not found')
    mt.write_text(old[:at] + marker + json.dumps(meta, sort_keys=True, separators=(',', ':')) + ';\n', encoding='utf-8')
    # The live static GitHub Pages game uses game.js, not main.ts. Update its
    # embedded metadata as part of the same revision.
    runtime = GAME_JS.read_text(encoding='utf-8')
    a, b = find_balanced_json(runtime, 'Object.assign(Yr,')
    embedded = json.loads(runtime[a:b])
    for name in CONFIG: embedded[name] = meta[name]
    runtime = runtime[:a] + json.dumps(embedded, separators=(',', ':')) + runtime[b:]
    GAME_JS.write_text(runtime, encoding='utf-8')
    print(f'Updated {len(CONFIG)} original cars, source metadata and live game.js')

if __name__ == '__main__':
    main()