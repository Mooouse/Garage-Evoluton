#!/usr/bin/env python3
"""Loss-minimizing importer for the owner's already-transparent, full-resolution side-view PNGs.

Use these *originals* rather than re-cutting a low-res WebP.  The wheel centres
are defined in 900px-normalized coordinates for each car to avoid the old
heuristic mis-centering the rims.  This tool never upsamples an old sprite.

Run: python tools/paint-cars/import-transparent.py
"""
from pathlib import Path
from PIL import Image, ImageFilter
import numpy as np
import cv2
import json
import base64
import math

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'games/garage-evolution/painted'
ORIG = DEST / 'originals'
# Name, body colour, [rear wheel, front wheel]: 900px-normalized x, y, r.
CONFIG = {
    'touringgt': ('#125943', [(184, 204, 70), (739, 207, 69)]),
    'twincam': ('#e8e6e0', [(177, 222, 60), (711, 222, 61)]),
    'sixcoupe': ('#e9e9e7', [(140, 216, 66), (649, 229, 69)]),
    'zenith': ('#f1f0ed', [(186, 219, 67), (716, 223, 67)]),
    'vten': ('#ebe9e5', [(171, 194, 65), (707, 199, 65)]),
    'orangetrack': ('#ed7908', [(183, 188, 74), (704, 196, 70)]),
    'silveropen': ('#d5d4d2', [(197, 179, 63), (699, 185, 63)]),
    'violetwide': ('#6814a4', [(202, 197, 60), (710, 200, 62)]),
    'yellowrally': ('#f0c612', [(163, 218, 61), (711, 219, 61)]),
    'blueline': ('#185bc0', [(189, 209, 64), (731, 219, 67)]),
    'foresttrack': ('#14623a', [(189, 188, 63), (710, 195, 65)]),
    'typhoon': ('#08b6c0', [(176, 217, 67), (712, 226, 64)]),
    'whiteracer': ('#eae9e6', [(199, 173, 65), (706, 180, 67)]),
    'sakura': ('#d51d20', [(191, 217, 59), (702, 227, 61)]),
    'greyestate': ('#55585b', [(181, 201, 65), (712, 204, 64)]),

}


def save_webp(rgba, name, lossless=True):
    out = Image.fromarray(rgba, 'RGBA')
    out.save(DEST / name, 'WEBP', lossless=lossless, quality=100, method=3)
    return out.size


def mask_bits(alpha):
    h, w = alpha.shape
    rows = max(1, math.ceil(h / w * 128))
    small = cv2.resize(alpha.astype('uint8'), (128, rows), interpolation=cv2.INTER_AREA)
    filled = small > 105
    packed = np.packbits(filled.flatten(), bitorder='big').tobytes()
    return {'cols': 128, 'rows': rows, 'bits': base64.b64encode(packed).decode()}


def main():
    metadata = json.loads((DEST / 'meta.json').read_text())
    for name, (colour, positions) in CONFIG.items():
        path = ORIG / (name + '.png')
        if not path.exists():
            raise FileNotFoundError(path)
        source = np.array(Image.open(path).convert('RGBA'))
        ys, xs = np.where(source[:, :, 3] > 100)
        if not len(xs):
            raise ValueError(f'{path}: no opaque car')
        x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
        car = source[y0:y1+1, x0:x1+1].copy()
        H, W = car.shape[:2]
        # Keep the full native detail (1400px on these originals).  WebP lossless
        # retains thin highlights and spokes without another quality-60 pass.
        yy, xx = np.ogrid[:H, :W]
        body = car.copy()
        wheels = []
        for i, (nx, ny, nr) in enumerate(positions):
            cx, cy, r = nx / 900 * W, ny / 900 * W, nr / 900 * W
            wheels.append({'x': round(cx/W, 5), 'r': round(r/W, 5), 'lift': round((H-cy-r)/W, 5)})
            R = int(math.ceil(r * 1.065))
            # Extract each wheel around its *true axle*, with no automatic
            # recentering on a skewed highlight or a brake caliper.
            padded = np.pad(car, ((R+3, R+3), (R+3, R+3), (0, 0)))
            pcx, pcy = int(round(cx))+R+3, int(round(cy))+R+3
            patch = padded[pcy-R:pcy+R+1, pcx-R:pcx+R+1].copy()
            py, px = np.ogrid[-R:R+1, -R:R+1]
            dist = np.sqrt(px*px + py*py)
            edge = np.clip((r+0.35-dist)*1.5, 0, 1)
            patch[:,:,3] = np.uint8(np.float32(patch[:,:,3])*edge)
            # Neutral cap: removes the tiny yellow manufacturer's badge on
            # the original hub, but leaves the painted spoke and tyre intact.
            center = np.sqrt(px*px + py*py)
            disk = center < r*0.06
            rimring = (center > r*0.10) & (center < r*0.17)
            if np.any(rimring):
                neutral = np.median(patch[:,:,:3][rimring],axis=0)
                patch[:,:,:3][disk] = (neutral * 0.72).astype('uint8')
            save_webp(patch, f'{name}-w{i}.webp')
            # The source car *includes* its wheels.  Remove every pixel in
            # the tyre opening, including the dark crescent outside the tyre
            # below the hub. Render-time protection applies as well.
            d = np.sqrt((xx-cx)**2+(yy-cy)**2)
            hole = (d < r*1.078) | (((yy-cy) > r*.35) & (np.sqrt(((xx-cx)/1.12)**2+((yy-cy-r*.36)/.85)**2) < r))
            body[:,:,3][hole] = 0
        # Bumpers remain separate, preserving the repair job.  The saved part
        # is from the clean source; the structure beneath is slightly dimmed.
        parts = {}
        for side, short in [('rear','br'),('front','bf')]:
            bx0 = 0 if side=='rear' else int(W*.945)
            bx1 = int(W*.055) if side=='rear' else W
            by0 = max(0, H-int(W*.095))
            by1 = H
            patch = body[by0:by1, bx0:bx1].copy()
            py, px = np.ogrid[:patch.shape[0], :patch.shape[1]]
            fade = np.minimum.reduce([np.broadcast_to(px, patch.shape[:2]),np.broadcast_to(patch.shape[1]-px-1,patch.shape[:2]),np.broadcast_to(py,patch.shape[:2]),np.broadcast_to(patch.shape[0]-py-1,patch.shape[:2])])
            patch[:,:,3] = np.uint8(patch[:,:,3] * np.clip((fade+.5)/3, 0, 1))
            save_webp(patch, f'{name}-{short}.webp')
            original = body[by0:by1,bx0:bx1]
            inset = 3
            region = original[inset:-inset,inset:-inset]
            region[:,:,:3] = (region[:,:,:3].astype('float32')*.28 + np.array([40,42,48])*.72).astype('uint8')
            parts['bumperR' if side=='rear' else 'bumperF'] = [round(bx0/W,5), round((H-by1)/W,5), round(bx1/W,5), round((H-by0)/W,5)]
        w, h = save_webp(body, f'{name}.webp')
        # The dense mask is only for the restoration grid, not the art.
        # The highest opaque pixel per horizontal position traces the roof.
        alpha = body[:,:,3]
        outline=[]
        for x in np.linspace(int(W*.04),int(W*.96),23):
            col = alpha[:, min(W-1,int(x))]
            iy = np.where(col > 100)[0]
            outline.append([round(x/W,5), round((H-int(iy.min()))/W,5) if len(iy) else 0.05])
        # Follow the actual lower silhouette rather than a rectangle.
        for x in np.linspace(int(W*.96),int(W*.04),23):
            col = alpha[:, min(W-1,int(x))]
            iy = np.where(col > 100)[0]
            outline.append([round(x/W,5), round((H-int(iy.max()))/W,5) if len(iy) else 0.01])
        metadata[name] = {
            'colour': colour, 'height': round(H/W, 6),
            'img': {'w':w,'h':h,'x':0,'top':round(H/W,6),'len':1},
            'wheels':wheels,'wheelImg':[0,1], 'parts':parts,
            'mask':mask_bits(alpha), 'outline':outline,
        }
        print(name, 'original', (W,H),'wheel positions', wheels, 'preserved lossless')
    (DEST/'meta.json').write_text(json.dumps(metadata,indent=1,sort_keys=True))
    meta_ts=DEST/'meta.ts'
    orig=meta_ts.read_text()
    intro=orig[:orig.index('export const PAINTED: Record<string, PaintedMeta> = ')]
    meta_ts.write_text(intro+'export const PAINTED: Record<string, PaintedMeta> = '+json.dumps(metadata,sort_keys=True)+';\n')

if __name__=='__main__':main()
