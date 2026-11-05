#!/usr/bin/env python3
"""Restore a clean, concentric factory tyre on each existing vehicle wheel.

Only the cut-out sprites are changed; vehicle IDs, repair state, axle geometry,
paint and engine mechanics stay intact. The inner spoke and rim photography is
preserved. A dark circular sidewall hides fender paint and floor flecks that
used to rotate with the wheel, and the hub is optically re-centred ONLY when
circular symmetry improves by at least 24%.
"""
from __future__ import annotations

import math
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
FOLDER = ROOT / 'games/garage-evolution/painted'


def estimate_hub_offset(src: Image.Image) -> tuple[float, float, float]:
    base = src.resize((96, 96), Image.Resampling.LANCZOS).convert('RGBA')
    pixels = np.asarray(base, dtype=np.float32)
    grey = pixels[..., 0] * .2126 + pixels[..., 1] * .7152 + pixels[..., 2] * .0722
    alpha = pixels[..., 3] / 255
    angles = np.arange(64, dtype=np.float64) * (2 * math.pi / 64)
    rings = [.105, .15, .20, .25, .31]
    coords = [(np.cos(angles) * 44 * rad, np.sin(angles) * 44 * rad) for rad in rings]

    def score(dx: int, dy: int) -> float:
        total = 0.0
        for xs, ys in coords:
            x = np.rint(47.5 + dx + xs).astype(np.int32)
            y = np.rint(47.5 + dy + ys).astype(np.int32)
            if np.any(x < 0) or np.any(y < 0) or np.any(x >= 96) or np.any(y >= 96):
                return 1e6
            intensities = grey[y, x]
            total += float(np.std(intensities) * np.mean(alpha[y, x]))
        return total

    original = score(0, 0)
    best = (original, 0, 0)
    for dy in range(-6, 7):
        for dx in range(-6, 7):
            cost = score(dx, dy) + .15 * (dx * dx + dy * dy)
            if cost < best[0]:
                best = (cost, dx, dy)
    # A small numeric improvement is often just a reflection / red caliper.
    # Do not move an already centred hub based on it.
    if original < 5 or best[0] >= original * .76:
        return 0.0, 0.0, best[0] / max(1, original)
    return best[1] / 96.0, best[2] / 96.0, best[0] / original


def polish(path: Path) -> tuple[int, int, float]:
    original = Image.open(path).convert('RGBA')
    w, h = original.size
    if min(w, h) < 50 or abs(w - h) > max(w, h) * .08:
        raise RuntimeError(f'{path.name}: wheel texture is not square: {w}x{h}')

    nx, ny, quality = estimate_hub_offset(original)
    shift_x = int(round(nx * w))
    shift_y = int(round(ny * h))
    if shift_x or shift_y:
        shifted = Image.new('RGBA', original.size)
        shifted.paste(original, (-shift_x, -shift_y))
        original = shifted

    arr = np.asarray(original, dtype=np.uint8).copy()
    yy, xx = np.ogrid[:h, :w]
    cx, cy = (w - 1) / 2, (h - 1) / 2
    r = min(w, h) / 2 / 1.045
    distance = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    # Preserve the spokes and brake details inside the wheel. Replace only
    # the contaminated last ~11% of the radius with an even rubber sidewall.
    tyre_sample = ((distance > r * .73) & (distance < r * .88) &
                   (arr[..., 3] > 155) & (arr[..., :3].max(axis=2) < 115))
    if np.any(tyre_sample):
        tyre = np.median(arr[..., :3][tyre_sample], axis=0)
    else:
        tyre = np.array([32, 34, 39], dtype=np.float32)
    tyre = np.clip(tyre, [18, 19, 22], [52, 55, 61]).astype(np.float32)
    # Subtle fixed lighting stays on the wheel while the spokes rotate.
    grad = np.clip(.98 - .11 * (distance / r - .5), .83, 1.08)[..., None]
    sidewall = np.clip(tyre[None, None, :] * grad, 0, 255)
    blend = np.clip((distance / r - .86) / .085, 0, 1)[..., None]
    arr[..., :3] = np.uint8(np.clip(arr[..., :3] * (1 - blend) + sidewall * blend, 0, 255))
    # No jagged transparency around the tyre's circumference; feather the
    # boundary subpixel-smoothly while keeping the rim opening opaque.
    coverage = np.uint8(np.clip((r + .4 - distance) * 255 / max(1, r * .018), 0, 255))
    # The original photo may have missing pixels within a tire / rim, but a
    # wheel mounted on a car is opaque over its circular rubber body.
    arr[..., 3] = np.maximum(arr[..., 3], coverage)
    arr[..., 3][distance > r + 1] = 0
    output = Image.fromarray(arr, 'RGBA')
    output.save(path, 'WEBP', quality=97, method=5, exact=True)
    return shift_x, shift_y, round(quality, 3)


def main():
    items = sorted(FOLDER.glob('*-w*.webp'))
    if len(items) < 140:
        raise RuntimeError(f'Only {len(items)} wheels found; refusing incomplete import')
    moved = []
    for n, path in enumerate(items):
        dx, dy, confidence = polish(path)
        if dx or dy:
            moved.append((path.name, dx, dy, confidence))
        if n % 50 == 0:
            print(f'Wheel {n + 1}/{len(items)}: {path.name}', flush=True)
    print(f'POLISHED {len(items)} car-specific wheels, recentered {len(moved)} hubs', flush=True)
    for name, dx, dy, score in moved[:120]:
        print(f'CENTERED {name} by {dx:+d},{dy:+d} px (relative symmetry {score})', flush=True)


if __name__ == '__main__':
    main()
