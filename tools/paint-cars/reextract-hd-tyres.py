#!/usr/bin/env python3
"""Re-extract the factory tyres from native transparent PNG originals.

No AI upscaling, no moving the original axle (the previous automatic centring
step could move a hub 30 px off its spindle). Fill only genuine transparent
holes and painted fender contamination with a smooth, circular rubber body.
The center stays the original wheel photograph, including its own spokes and
brake caliper.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'games/garage-evolution/painted'
ORIGINALS = ART / 'originals'
META = json.loads((ART / 'meta.json').read_text(encoding='utf-8'))


def cropped_original(path: Path) -> np.ndarray:
    pixels = np.asarray(Image.open(path).convert('RGBA'), dtype=np.uint8)
    ys, xs = np.nonzero(pixels[:, :, 3] > 80)
    if len(xs) < 5000:
        raise RuntimeError(f'{path.name}: no visible original artwork')
    return pixels[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()


def extract(car: np.ndarray, center_x: float, center_y: float, radius: float) -> Image.Image:
    R = math.ceil(radius * 1.065)
    W = 2 * R + 1
    pad = R + 6
    src = np.pad(car, ((pad, pad), (pad, pad), (0, 0)))
    cx = round(center_x) + pad
    cy = round(center_y) + pad
    photo = src[cy - R:cy + R + 1, cx - R:cx + R + 1].astype(np.float32)
    if photo.shape[:2] != (W, W):
        raise RuntimeError('Original source wheel crop outside image')
    yy, xx = np.ogrid[-R:R + 1, -R:R + 1]
    d = np.hypot(xx, yy)
    r = max(1.0, radius)

    # Match the colour of the *real* source tyre where possible, not any
    # nearby bodywork or coloured wheel-arch insert.
    light = photo[..., :3].max(axis=2)
    sample = ((d > r * .70) & (d < r * .86) &
              (photo[..., 3] > 180) & (light < 110))
    if np.count_nonzero(sample) >= 30:
        tyre = np.median(photo[..., :3][sample], axis=0)
    else:
        tyre = np.array([29, 32, 37], dtype=np.float32)
    tyre = np.clip(tyre, [20, 22, 26], [46, 49, 54])
    rad = np.clip(d / r, 0, 1)
    shade = np.clip(1.08 - .24 * rad, .78, 1.08)
    # Non-transparent, continuous dark rubber behind the source photograph.
    rubber = np.clip(tyre[None, None, :] * shade[..., None], 0, 255)

    # Preserve the photo's metal and details in the centre. Feather it into
    # an even tyre wall, removing old blue garage, white paint and floor at
    # the perimeter. Missing pixels INSIDE the wheel are backed by rubber.
    picture_weight = np.clip((.905 - rad) / .075, 0, 1) * (photo[..., 3] / 255)
    picture_weight = picture_weight[..., None]
    rgb = rubber * (1 - picture_weight) + photo[..., :3] * picture_weight

    # Smooth black outer tread, fixed concentric to the model's real axle.
    ring = np.clip((rad - .935) / .04, 0, 1)[..., None]
    rgb = rgb * (1 - .18 * ring)

    # Antialiased complete circular tyre. A masked-out photo never creates
    # a transparent crescent inside this boundary.
    alpha = np.clip((r + .55 - d) * 220, 0, 255)
    rgba = np.concatenate([rgb, alpha[..., None]], axis=2).astype(np.uint8)
    assert rgba[int(R), int(R), 3] == 255
    assert rgba[int(R + r * .75), int(R), 3] == 255
    return Image.fromarray(rgba, mode='RGBA')


def main() -> None:
    rebuilt = 0
    for path in sorted(ORIGINALS.glob('*.png')):
        model = path.stem
        if model not in META or META[model]['img']['w'] < 900:
            continue
        info = META[model]
        car = cropped_original(path)
        h, w = car.shape[:2]
        if abs(w - info['img']['w']) > 4:
            raise RuntimeError(f'{model}: source {w} and art width {info["img"]["w"]} disagree')
        # The PNG is the pre-trim source. The published car body ended at the
        # measured tyre contact line, without the floor under the vehicle.
        finished_height = info['img']['h']
        if h + 3 < finished_height:
            raise RuntimeError(f'{model}: original shorter than published body')
        for axle, wheel in enumerate(info['wheels']):
            pic_id = info['wheelImg'][axle]
            dest = ART / f'{model}-w{pic_id}.webp'
            if not dest.exists():
                raise RuntimeError(f'{model}: missing sprite for axle {axle}: {dest.name}')
            width_scale = w
            cx = wheel['x'] * width_scale
            rr = wheel['r'] * width_scale
            cy = finished_height - (wheel['r'] + wheel.get('lift', 0)) * width_scale
            if cx < rr or cx > w - rr or cy < rr * .65 or cy > h + rr * .2:
                raise RuntimeError(f'{model}: suspicious axle {axle}, center={cx:.1f},{cy:.1f}, radius={rr:.1f}')
            image = extract(car, cx, cy, rr)
            image.save(dest, 'WEBP', quality=97, method=5, exact=True)
            rebuilt += 1
            print(f'REBUILT {dest.name} {image.width}x{image.height}; center at {cx:.1f},{cy:.1f}', flush=True)
    if rebuilt < 120:
        raise RuntimeError(f'Only {rebuilt} native wheels rebuilt; expected at least 120')
    print(f'OK: {rebuilt} fully opaque, concentric original PNG wheel sprites regenerated', flush=True)


if __name__ == '__main__':
    main()
