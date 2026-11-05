#!/usr/bin/env python3
"""Bake separate PHOTO body/tyre layers for five manually calibrated cars.

Only the editor's saved geometry is used. No image recognition, runtime
re-cutting, invented rubber fill, generic aftermarket rim or offset guess.
Original transparent PNG is the sole source of coloured pixels. The body
and both wheels are physically separate textures, each with native alpha.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "games" / "garage-evolution" / "painted"
CAL = ROOT / "games" / "garage-evolution" / "wheel-calibration.json"
OUT = ART / "prepared"


def source_image(id: str, size: tuple[int, int]) -> Image.Image:
    src = Image.open(ART / "originals" / (id + ".png")).convert("RGBA")
    a = np.asarray(src.getchannel("A"))
    ys, xs = np.where(a > 100)
    if xs.size < 2000:
        raise ValueError(id + ": no source artwork")
    src = src.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    w, h = size
    if abs(src.width - w) > 8:
        raise ValueError(f"{id}: source width={src.width}, meta width={w}")
    if src.width != w:
        src = src.resize((w, round(src.height * w / src.width)), Image.Resampling.LANCZOS)
    if src.height < h - 4:
        raise ValueError(f"{id}: source too short for existing body metadata")
    if src.height < h:
        pad = Image.new("RGBA", size)
        pad.alpha_composite(src, (0, 0))
        src = pad
    return src.crop((0, 0, w, h))


def wipe(alpha: np.ndarray, xx: np.ndarray, yy: np.ndarray,
         x: float, y: float, r: float, remove: bool,
         source: np.ndarray) -> None:
    """Editable circular stroke; body and tyre use identical stroke units."""
    weight = np.clip((r - np.hypot(xx - x, yy - y)) * 1.5, 0, 1)
    if remove:
        alpha *= (1.0 - weight)
    else:
        alpha[:] = alpha * (1.0 - weight) + source * weight


def apply_strokes(alpha: np.ndarray, original_alpha: np.ndarray,
                  xx: np.ndarray, yy: np.ndarray,
                  strokes: list[dict], remove: bool, width: int) -> None:
    for stroke in strokes:
        wipe(alpha, xx, yy, float(stroke["x"]) * width,
             float(stroke["y"]) * width, float(stroke["r"]) * width,
             remove, original_alpha)


def source_wheel(image: Image.Image, cx: float, cy: float, radius: float,
                 edge: float, strokes_remove: list, strokes_restore: list) -> Image.Image:
    R = int(np.ceil(radius * 1.085)) + 3
    # Bicubic subpixel cropping keeps the original hub exactly under pixel R,R.
    w = 2 * R + 1
    patch = image.transform(
        (w, w), Image.Transform.AFFINE,
        (1, 0, cx - R, 0, 1, cy - R),
        resample=Image.Resampling.BICUBIC, fillcolor=(0, 0, 0, 0))
    src = np.asarray(patch).copy()
    yy, xx = np.ogrid[:w, :w]
    dist = np.hypot(xx - R, yy - R)
    inside = np.clip((radius * edge - dist) * 1.5, 0, 1)
    base_alpha = src[:, :, 3].astype(np.float32)
    alpha = base_alpha * inside
    # Brush points live in whole-car coordinates, so the calibration JSON is
    # resolution-independent and a mask always lands at the correct axle.
    gx, gy = xx + cx - R, yy + cy - R
    apply_strokes(alpha, base_alpha, gx, gy, strokes_restore, False, image.width)
    apply_strokes(alpha, base_alpha, gx, gy, strokes_remove, True, image.width)
    src[:, :, 3] = np.uint8(np.clip(np.round(alpha), 0, 255))
    return Image.fromarray(src, "RGBA")


def composite_proof(id: str, orig: Image.Image, body: Image.Image,
                    wheels: list[tuple[Image.Image, float, float, float]]) -> Image.Image:
    w, h = orig.size
    scale = min(1.0, 950.0 / w)
    W, H = round(w * scale), round(h * scale)
    pad, label = 25, 40
    result = Image.new("RGB", (2 * (W + pad * 2), H + label + pad * 2), "#222e3c")
    def back(xoffset: int):
        tile = ImageDraw.Draw(result)
        for row in range(0, H + 2 * pad, 18):
            for col in range(0, W + 2 * pad, 18):
                if ((row // 18) + (col // 18)) % 2:
                    tile.rectangle((xoffset + col, label + row,
                                    xoffset + col + 17, label + row + 17), fill="#354459")
    def paste(p: Image.Image, x: int):
        small = p.resize((W, H), Image.Resampling.LANCZOS).convert("RGBA")
        result.paste(small, (x + pad, label + pad), small)
    back(0)
    back(W + pad * 2)
    # On the left the image is re-assembled from three independent layers.
    left = body.copy()
    for im, cx, cy, r in wheels:
        R = (im.width - 1) // 2
        left.alpha_composite(im, (round(cx - R), round(cy - R)))
    paste(left, 0)
    # On the right there are no tyres at all, only transparent apertures.
    paste(body, W + pad * 2)
    d = ImageDraw.Draw(result)
    d.text((15, 14), id.upper() + " / ASSEMBLED", fill="#e9f2ff")
    d.text((W + 2 * pad + 15, 14), "WHEELS REMOVED / ALPHA", fill="#e9f2ff")
    return result


def bake_one(id: str, m: dict, setup: dict, proof: bool) -> None:
    size = (int(m["img"]["w"]), int(m["img"]["h"]))
    original = source_image(id, size)
    body = np.asarray(original).copy()
    h, w = body.shape[:2]
    yy, xx = np.ogrid[:h, :w]
    body_a = body[:, :, 3].astype(np.float32)
    source_a = body_a.copy()
    sprites = []
    for i, wh in enumerate(m["wheels"]):
        a = setup["wheels"][i]
        cx = (wh["x"] + a["dx"]) * w
        cy = (h / w - wh["r"] - wh.get("lift", 0) + a["dy"]) * w
        radius = wh["r"] * float(a["size"]) * w
        if radius < 20 or radius > 0.3 * w:
            raise ValueError(f"{id} wheel {i}: invalid radius={radius}")
        # Cut the real photo; do not paint the cutout black or fabricate rubber.
        distance = np.hypot(xx - cx, yy - cy)
        feather = np.clip((radius * float(a["cut"]) - distance) * 1.5, 0, 1)
        body_a *= (1.0 - feather)
        apply_strokes(body_a, source_a, xx, yy, a.get("restoreBody", []), False, w)
        apply_strokes(body_a, source_a, xx, yy, a.get("eraseBody", []), True, w)
        tyre = source_wheel(original, cx, cy, radius, float(a["edge"]),
                            a.get("eraseWheel", []), a.get("restoreWheel", []))
        tyre.save(OUT / f"{id}-w{i}.webp", "WEBP", lossless=True, method=5)
        sprites.append((tyre, cx, cy, radius))
    body[:, :, 3] = np.uint8(np.round(np.clip(body_a, 0, 255)))
    prepared = Image.fromarray(body, "RGBA")
    prepared.save(OUT / f"{id}.webp", "WEBP", lossless=True, method=5)
    # Important: this asserts that neither the original tyre nor a solid black
    # wheel stand-in has been left in the body sprite.
    for i, (wheel, cx, cy, radius) in enumerate(sprites):
        center = (round(cx), round(cy))
        if prepared.getpixel(center)[3] > 8:
            raise AssertionError(f"{id} wheel {i}: removed wheel left opaque hub pixels")
        R = wheel.width // 2
        if wheel.getpixel((R, R))[3] < 200:
            raise AssertionError(f"{id} wheel {i}: missing true wheel spindle")
    if proof:
        composite_proof(id, original, prepared, sprites).save(
            OUT / f"proof-{id}.webp", "WEBP", quality=84, method=5)
    print(f"PASS {id}: {size[0]}x{size[1]}, wheel masks isolated, centres aligned; no runtime synthetic black fill", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--proof", action="store_true")
    args = parser.parse_args()
    meta = json.loads((ART / "meta.json").read_text())
    calibration = json.loads(CAL.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    for id, setup in calibration["models"].items():
        if len(setup["wheels"]) != len(meta[id]["wheels"]):
            raise ValueError(f"{id}: axle count mismatch")
        bake_one(id, meta[id], setup, proof=args.proof)
    print(f"PASS {len(calibration['models'])} models: prepared body and tyre layers")


if __name__ == "__main__":
    main()
