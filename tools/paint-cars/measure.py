"""Measure new pictures for paint_cars.py: the ground line and every wheel's [centre x, radius], written into
cleanup.json ("ground", "wheels") for the ids not measured yet, and an overlay per picture to check by eye.

The wheels are found as paint_cars.find_wheels does (dark discs on the ground line), then each axle is refined on the
picture (hub_centre: the circles of the tyre, the rim's lip and the hub read the same all round the true centre) and
the radius is the axle's height above the ground. A wheel the overlay shows wrong is corrected in cleanup.json by hand.

Usage (the same Python as paint_cars.py):
  python tools/paint-cars/measure.py <source dir> <overlay dir> [--only id,id] [--redo] [--parts]
  python tools/paint-cars/measure.py --merge <overlay dir>     (after parallel --parts runs)
"""
import importlib.util, json, os, sys
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('paint_cars', os.path.join(HERE, 'paint_cars.py'))
pc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pc)


def tyre_bottom(rgb, alpha, cx, r, ground):
    """The tyre's lowest row under its axle: the last row brighter than the background in a narrow band of columns.
    On a black backdrop the cut-out keeps the soft floor shadow under the car, so the cut's lowest row is no ground"""
    lum = rgb.max(axis=2).astype(np.float32)
    H = lum.shape[0]
    bg = float(np.median(lum[min(H - 1, ground + 10):min(H, ground + 60)])) if ground + 10 < H else 8.0
    band = lum[:min(H, ground + 30), max(0, int(cx - r * 0.12)):int(cx + r * 0.12) + 1].max(axis=1)
    ys = np.nonzero(band > bg + 14)[0]
    return int(ys.max()) if len(ys) else ground


def measure(path, session, seeds=None):
    img = Image.open(path).convert('RGB')
    rgb = np.asarray(img).copy()
    alpha = pc.cut(img, session)
    if seeds:
        ys = np.nonzero(alpha.max(axis=1) > 0.5)[0]
        ground = int(ys.max())
        wheels = [(1, cx, ground - r, r) for cx, r in seeds]
    else:
        wheels, ground, x0, x1 = pc.find_wheels(rgb, alpha)
    found = []
    for (_, cx, cy, r) in wheels:
        bot = tyre_bottom(rgb, alpha, cx, r, ground)
        hx, hy = pc.hub_centre(rgb, cx, bot - r, r)
        found.append((hx, hy, r, tyre_bottom(rgb, alpha, hx, r, ground)))
    # The ground: the tyres' bottoms (one line for the car); each radius is its axle's height above it
    ground = int(round(np.mean([b for (_, _, _, b) in found])))
    out = [[int(hx), int(max(r * 0.85, min(r * 1.15, ground - hy)))] for (hx, hy, r, _) in found]
    return img, alpha, ground, out


def main():
    if sys.argv[1] == '--merge':
        return merge(sys.argv[2])
    src, ov = sys.argv[1], sys.argv[2]
    only = set(sys.argv[sys.argv.index('--only') + 1].split(',')) if '--only' in sys.argv else None
    redo = '--redo' in sys.argv
    os.makedirs(ov, exist_ok=True)
    from rembg import new_session
    session = new_session('isnet-general-use')
    cpath = os.path.join(HERE, 'cleanup.json')
    cleanup = json.load(open(cpath))
    for f in sorted(os.listdir(src)):
        mid, ext = os.path.splitext(f)
        if ext.lower() not in ('.webp', '.png', '.jpg', '.jpeg') or (only and mid not in only):
            continue
        if mid in cleanup['wheels'] and not redo:
            continue
        img, alpha, ground, wheels = measure(os.path.join(src, f), session, cleanup.get('wheelSeed', {}).get(mid))
        if '--parts' in sys.argv:
            # Parallel runs each write their own result; --merge folds them into cleanup.json
            json.dump({'ground': ground, 'wheels': wheels}, open(os.path.join(ov, mid + '.json'), 'w'))
        else:
            cleanup['ground'][mid] = ground
            cleanup['wheels'][mid] = wheels
        d = ImageDraw.Draw(img)
        d.line([(0, ground), (img.width, ground)], fill=(0, 255, 0), width=2)
        for cx, r in wheels:
            cy = ground - r
            d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 0, 255), width=3)
            d.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=(255, 0, 255))
        img.save(os.path.join(ov, mid + '.jpg'), quality=80)
        print(mid, ground, wheels, flush=True)
        if '--parts' not in sys.argv:
            json.dump(cleanup, open(cpath, 'w'), indent=1)


def merge(ov):
    cpath = os.path.join(HERE, 'cleanup.json')
    cleanup = json.load(open(cpath))
    for f in sorted(os.listdir(ov)):
        if f.endswith('.json'):
            r = json.load(open(os.path.join(ov, f)))
            cleanup['ground'][f[:-5]] = r['ground']
            cleanup['wheels'][f[:-5]] = r['wheels']
    json.dump(cleanup, open(cpath, 'w'), indent=1)


if __name__ == '__main__':
    main()
