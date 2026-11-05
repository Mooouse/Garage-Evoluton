#!/usr/bin/env python3
"""Recover authentic bodywork around factory tyres from native transparent PNGs.

The previous HD importer erased both a tyre-shaped circle and a lower oval,
deleting real skirts/arch pixels. Runtime black fills are not a valid fix.
Restore the deleted pixels outside the actual tyre, preserving the original
photo and every pixel of the existing edited body everywhere else.
"""
from pathlib import Path
import json

import numpy as np
from PIL import Image

ART = Path(__file__).resolve().parents[2] / "games" / "garage-evolution" / "painted"
META = json.loads((ART / "meta.json").read_text(encoding="utf-8"))


def cropped_original(filename: Path, w: int, h: int) -> np.ndarray:
    src = np.asarray(Image.open(filename).convert("RGBA"), dtype=np.uint8)
    ys, xs = np.nonzero(src[:, :, 3] > 100)
    if len(xs) < 10000:
        raise ValueError(f"{filename.name}: empty original image")
    src = src[ys.min():ys.max()+1, xs.min():xs.max()+1].copy()
    sh, sw = src.shape[:2]
    if abs(sw - w) > 6:
        raise ValueError(f"{filename.name}: original width {sw}, published {w}")
    if sw != w:
        src = np.asarray(Image.fromarray(src, "RGBA").resize(
            (w, round(sh * w / sw)), Image.Resampling.LANCZOS))
    if src.shape[0] + 3 < h:
        raise ValueError(f"{filename.name}: original crop shorter than published image")
    if src.shape[0] < h:
        src = np.pad(src, ((0, h - src.shape[0]), (0, 0), (0, 0)))
    return src[:h]


def rebuild(name: str, meta: dict) -> int:
    path = ART / (name + ".webp")
    body = np.array(Image.open(path).convert("RGBA"), dtype=np.uint8)
    h, w = body.shape[:2]
    if [w, h] != [meta["img"]["w"], meta["img"]["h"]]:
        raise ValueError(f"{name}: invalid original body geometry")
    original = cropped_original(ART / "originals" / (name + ".png"), w, h)
    yy, xx = np.ogrid[:h, :w]
    count = 0
    for wheel in meta["wheels"]:
        r = wheel["r"] * w
        cx = wheel["x"] * w
        cy = h - (wheel["r"] + wheel.get("lift", 0)) * w
        dx, dy = xx - cx, yy - cy
        d2 = dx*dx + dy*dy
        # Reconstruct the historical oversized importer cutout exactly.
        old_cut = (d2 < (r*1.078)**2) | (
            (dy > r*.35) &
            ((dx/(r*1.12))**2 + ((dy-r*.36)/(r*.85))**2 < 1)
        )
        # The real wheel sprite covers this slightly smaller centre opening.
        # No original rocker/bottom pixels are removed outside this circle.
        outside_wheel = d2 >= (r*.985)**2
        restore_pixels = (old_cut & outside_wheel &
                          (original[:, :, 3] > 0) &
                          (body[:, :, 3] < original[:, :, 3]))
        body[restore_pixels] = original[restore_pixels]
        count += int(np.count_nonzero(restore_pixels))
    if count:
        # Lossless: preserve the original wheel-arch texture and paint edges.
        Image.fromarray(body, "RGBA").save(path, "WEBP", lossless=True, method=5)
        check = np.asarray(Image.open(path).convert("RGBA"))
        if not np.array_equal(check, body):
            raise ValueError(f"{name}: lossless WebP roundtrip mismatch")
    print(f"{name}: {count} original arch pixels restored", flush=True)
    return count


def main():
    active = [(name, info) for name, info in META.items() if info["img"]["w"] >= 900]
    if len(active) != 62:
        raise RuntimeError(f"Expected 62 native HD models; found {len(active)}")
    changed = sum(rebuild(name, info) for name, info in active)
    print(f"PASS: {len(active)} HD cars checked, {changed} original pixels recovered")


if __name__ == "__main__":
    main()
