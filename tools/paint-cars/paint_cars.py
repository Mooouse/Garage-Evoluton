"""Turn the owner's painted car pictures (a side view in a studio) into the game's car art.

For each `<model-id>.<ext>` in the source folder: cut the car out (rembg, IS-Net), find its two wheels, take them off
as sprites (a plain hub cap: no emblem), darken the arches under them, cut the bumpers out as parts, paint over the
emblems listed in `cleanup.json`, and write
  games/garage-evolution/painted/<id>.webp        the body (the wheels off, the arches dark)
  games/garage-evolution/painted/<id>-w0.webp …    the wheels, rear first
  games/garage-evolution/painted/<id>-bf.webp, -br the bumpers
  games/garage-evolution/painted/meta.json         geometry in the model's units (x 0 rear … 1 nose, y up from the ground)

Usage (a Python with rembg, onnxruntime, pillow, numpy, scipy):
  python tools/paint-cars/paint_cars.py <source dir> [--only id,id]
"""
import json, os, sys, base64
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
from skimage.color import rgb2hsv

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'games', 'garage-evolution', 'painted')
HERE = os.path.dirname(os.path.abspath(__file__))
# One utilitarian quality for every vehicle (the owner, 2026-10-17: «Качество всех машин должно быть одинаковым и
# утилитарным»; 2026-10-19: 120 pictures in one upload): the body's length in px, the wheels' sprite in px (the tyre
# bay's close-up), the WebP quality
STORE_LEN = 560
QUALITY = 60
WHEEL_PX = 160


def cut(img: Image.Image, session) -> np.ndarray:
    from rembg import remove
    m = np.asarray(remove(img, session=session, only_mask=True)).astype(np.float32) / 255
    solid = m > 0.5
    solid = ndimage.binary_fill_holes(solid)
    # Keep the biggest piece (a stray light cone or a reflection fleck goes)
    lab, n = ndimage.label(solid)
    if n > 1:
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        solid = lab == (1 + int(np.argmax(sizes)))
    soft = np.where(solid, np.maximum(m, ndimage.binary_erosion(solid, iterations=2)), 0)
    return soft


def decontaminate(rgb: np.ndarray, alpha: np.ndarray):
    """The cut-out's soft edge keeps the backdrop's colour (a black studio drew a dotted dark line round the roof): each
    edge pixel takes the colour of the solid paint beside it, its transparency stays"""
    solid = alpha > 0.98
    w = solid.astype(np.float32)
    den = np.maximum(ndimage.gaussian_filter(w, 2.5), 1e-4)
    edge = (alpha > 0.01) & ~solid & (ndimage.gaussian_filter(w, 2.5) > 0.02)
    for c in range(3):
        fill = ndimage.gaussian_filter(rgb[..., c].astype(np.float32) * w, 2.5) / den
        rgb[..., c][edge] = np.clip(fill[edge], 0, 255).astype(np.uint8)


def find_wheels(rgb: np.ndarray, alpha: np.ndarray):
    """The two tyres: dark discs standing on the ground line (the lowest row of the car)"""
    H, W = alpha.shape
    ys, xs = np.nonzero(alpha > 0.5)
    ground = ys.max()
    x0, x1 = xs.min(), xs.max()
    L = x1 - x0
    lum = rgb.mean(axis=2)
    dark = (lum < 70) & (alpha > 0.5)
    best = []
    angles = np.linspace(np.pi * 0.15, np.pi * 0.85, 40)  # the lower arc (y down)
    for r in range(int(L * 0.055), int(L * 0.13), 2):
        cy = ground - r
        for cx in range(x0 + r, x1 - r, 3):
            ix = (cx + np.cos(angles) * r * 0.9).astype(int)
            iy = (cy + np.sin(angles) * r * 0.9).astype(int)
            ox = (cx + np.cos(angles) * r * 1.12).astype(int)
            oy = np.clip((cy + np.sin(angles) * r * 1.12).astype(int), 0, H - 1)
            inner = dark[iy, ix].mean()
            outer = 1 - (alpha[oy, np.clip(ox, 0, W - 1)] > 0.5).mean()
            # The tyre's side, left and right of the centre at mid height: dark too
            side = (dark[cy, min(W - 1, cx + int(r * 0.9))] + dark[cy, max(0, cx - int(r * 0.9))]) / 2
            best.append((inner * outer * (0.5 + side / 2), cx, cy, r))
    best.sort(reverse=True)
    mid = x0 + L / 2
    rear = next(b for b in best if b[1] < mid)
    front = next(b for b in best if b[1] > mid)
    return [rear, front], ground, x0, x1


def refine(alpha, cx, ground, r, L):
    """The tyre's centre and radius: below the sill only the tyre stands on the ground, so each row k above the ground
    shows its edges at cx ± sqrt(2rk − k²). A grid search with a truncated cost: rows where a bumper or a skirt joins
    the tyre cost a fixed amount instead of pulling the fit"""
    W = alpha.shape[1]
    solid = alpha > 0.5
    edges = {}
    for k in range(3, int(L * 0.09)):
        row = solid[ground - k]
        if not row[cx]:
            continue
        a = cx
        while a > 0 and row[a - 1]:
            a -= 1
        b = cx
        while b < W - 1 and row[b + 1]:
            b += 1
        edges[k] = (a, b)
    best = (1e18, cx, r)
    for rr in np.arange(L * 0.06, L * 0.14, 1.0):
        ks = [k for k in edges if rr * 0.15 <= k <= rr * 0.6]
        if len(ks) < 5:
            continue
        hw = np.array([np.sqrt(2 * rr * k - k * k) for k in ks])
        A = np.array([edges[k][0] for k in ks], float)
        B = np.array([edges[k][1] for k in ks], float)
        for c in range(int(cx - rr * 0.3), int(cx + rr * 0.3)):
            cost = np.minimum(np.abs(A - (c - hw)), 4).sum() + np.minimum(np.abs(B - (c + hw)), 4).sum()
            cost /= len(ks)
            if cost < best[0]:
                best = (cost, c, rr)
    return best[1], ground - best[2], best[2]


def hub_centre(rgb: np.ndarray, cx: float, cy: float, r: float):
    """The wheel's true axle near a measured guess: the tyre, the rim's lip and the hub are circles, so around the true
    centre each radius reads the same all the way round (the spokes add the same either way). The centre with the least
    brightness change around its circles wins (the owner, 2026-10-17: «колеса не центрированы»)"""
    lum = rgb.mean(axis=2).astype(np.float32)
    rhos = np.linspace(0.2, 0.97, 28) * r
    angs = np.linspace(0, 2 * np.pi, 96, endpoint=False)
    span = int(max(4, r * 0.12))
    best = (1e18, cx, cy)
    for dy in range(-span, span + 1):
        for dx in range(-span, span + 1):
            x = cx + dx + np.cos(angs)[None, :] * rhos[:, None]
            y = cy + dy + np.sin(angs)[None, :] * rhos[:, None]
            v = ndimage.map_coordinates(lum, [y.ravel(), x.ravel()], order=1, mode='nearest').reshape(x.shape)
            cost = v.std(axis=1).mean()
            if cost < best[0]:
                best = (cost, cx + dx, cy + dy)
    return best[1], best[2]


def even_tyre(wheel: np.ndarray, d: np.ndarray, r: float):
    """The tyre the same all the way round: the picture's light and the arch's shadow are baked into its rubber and
    turned with the wheel, so it looked lopsided (the owner, 2026-10-17: «из-за теней кажется что колеса не симметричны»).
    Each radius of the tyre band takes its median colour over the whole circle; the rim keeps the picture"""
    rgb = wheel[..., :3].astype(np.float32)
    lum = rgb.mean(axis=2)
    solid = wheel[..., 3] > 128
    ring = np.round(d).astype(int)
    R = int(r)
    prof = np.zeros((R + 2, 3), np.float32)
    lumr = np.full(R + 2, 255.0)
    for k in range(int(r * 0.5), R + 1):
        m = (ring == k) & solid
        if m.sum() > 8:
            prof[k] = np.median(rgb[m], axis=0)
            lumr[k] = np.median(lum[m])
    # The tyre: the dark band from the outside in, down to the rim's lip (never deeper than 72 % of the radius)
    edge = R
    while edge > r * 0.72 and lumr[edge - 1] < 72:
        edge -= 1
    edge += 1
    for k in range(edge, R + 1):
        if not prof[k].any():
            prof[k] = prof[k - 1]
    band = (d >= edge) & (d <= r + 1)
    kk = np.clip(np.round(d[band]).astype(int), edge, R)
    out = prof[kk]
    # A soft step from the rim into the even rubber
    w = np.clip((d[band] - edge) / 2.0, 0, 1)[:, None]
    wheel[..., :3][band] = (rgb[band] * (1 - w) + out * w).astype(np.uint8)


def cap(wheel: np.ndarray, r: float):
    """A plain centre cap over the hub: no emblem survives"""
    h, w = wheel.shape[:2]
    c = (w - 1) / 2
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.hypot(xx - c, yy - c)
    ring = (d > r * 0.13) & (d < r * 0.17)
    col = np.median(wheel[ring][:, :3], axis=0)
    inner = d <= r * 0.13
    shade = np.clip(1.15 - (yy - c + r * 0.13) / (r * 0.26) * 0.3, 0.8, 1.15)[..., None]
    wheel[inner, :3] = np.clip(col * shade[inner] , 0, 255)
    edge = (d > r * 0.12) & (d <= r * 0.14)
    wheel[edge, :3] = col * 0.6


def clean(rgb: np.ndarray, rects):
    """Paint over an emblem: each rect gets the colours around it, blended in from its edges"""
    for rect in rects:
        x0, y0, x1, y1 = rect[:4]
        if len(rect) > 4:
            # A solid fill (an emblem on a plain plate)
            h = rect[4].lstrip('#')
            rgb[y0:y1, x0:x1] = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
            continue
        pad = 6
        box = rgb[y0 - pad:y1 + pad, x0 - pad:x1 + pad].astype(np.float32)
        h, w = box.shape[:2]
        filled = box.copy()
        mask = np.zeros((h, w), bool)
        mask[pad:h - pad, pad:w - pad] = True
        # Diffuse inward from the border a few hundred times (a cheap inpaint)
        for _ in range(300):
            blur = ndimage.uniform_filter(filled, size=(3, 3, 1))
            filled[mask] = blur[mask]
        rgb[y0 - pad:y1 + pad, x0 - pad:x1 + pad] = filled.astype(np.uint8)


def restore(rgb: np.ndarray, paints):
    """The picture's painted-in wear lifted off: rust streaks, brown grime, chips and drips on the paint (the owner,
    2026-10-17: «Качество всех машин должно быть одинаковым», «Бери в пример лучшие варианты» — a restored machine as
    clean as the best pictures; the game lays its own dirt and rust on top). `paints`: [[hex, hue tolerance, the
    darkest clean shade as a share of the paint's]], cleanup.json "restore". A blemish is a weathering colour (rust,
    brown, the paint's own hue lighter or darker) inside a panel of the paint; it takes the clean paint around it
    (a normalized blur keeps the panel's shading). Outlines, glass, grey metal and the other paints stay"""
    f = rgb.astype(np.float32) / 255
    hsv = rgb2hsv(f)
    H, S, V = hsv[..., 0] * 360, hsv[..., 1], hsv[..., 2]
    dark = V < 0.2
    rustlike = (H > 5) & (H < 50) & (S > 0.25) & (S < 0.65) & (V > 0.2) & (V < 0.9)
    specs = []
    for hexc, tol, vlo in paints:
        p = np.array([int(hexc[i:i + 2], 16) for i in (1, 3, 5)]) / 255
        ph, ps, pv = rgb2hsv(p[None, None])[0, 0]
        dh = np.abs(((H - ph * 360 + 180) % 360) - 180)
        specs.append(((dh < tol) & (S > ps * 0.55) & (V > pv * vlo), dh < 45))
    anyclean = np.logical_or.reduce([c for c, _ in specs])
    done = np.zeros(V.shape, bool)
    for clean, near in specs:
        region = ndimage.binary_closing(clean, structure=np.ones((3, 3)), iterations=12)
        region = ndimage.binary_fill_holes(region) & ndimage.binary_dilation(clean, iterations=14)
        blem = region & ~anyclean & ~dark & ~done & (rustlike | near)
        w = clean.astype(np.float32)
        norm = np.maximum(ndimage.gaussian_filter(w, 9), 1e-4)
        for c in range(3):
            f[..., c][blem] = (ndimage.gaussian_filter(f[..., c] * w, 9) / norm)[blem]
        done |= blem
    rgb[...] = np.clip(f * 255 + 0.5, 0, 255).astype(np.uint8)


def paint_colour(rgb, alpha, wheels):
    """The body's main paint: the most common colour on the lower half of the body, wheels and glass left out"""
    H, W = alpha.shape
    yy, xx = np.mgrid[0:H, 0:W]
    m = alpha > 0.9
    for (_, cx, cy, r) in wheels:
        m &= np.hypot(xx - cx, yy - cy) > r * 1.25
    px = rgb[m].astype(np.int32)
    q = (px // 24)
    keys = q[:, 0] * 10000 + q[:, 1] * 100 + q[:, 2]
    vals, counts = np.unique(keys, return_counts=True)
    k = vals[np.argmax(counts)]
    sel = px[keys == k]
    c = np.median(sel, axis=0).astype(int)
    return '#%02x%02x%02x' % tuple(c)


def mask_bits(alpha: np.ndarray, cols: int):
    """The silhouette as a bit grid, `cols` cells over the image's width (rows to keep the cells square)"""
    H, W = alpha.shape
    rows = max(1, round(cols * H / W))
    small = Image.fromarray((alpha * 255).astype(np.uint8)).resize((cols, rows), Image.BOX)
    bits = (np.asarray(small) > 140).astype(np.uint8)
    packed = np.packbits(bits.flatten())
    return rows, base64.b64encode(packed.tobytes()).decode()


def outline(alpha: np.ndarray, n: int = 24):
    """A coarse polygon around the silhouette (the top line rear→nose, the bottom line back): only for bounds"""
    H, W = alpha.shape
    cols = np.linspace(0, W - 1, n).astype(int)
    top, bot = [], []
    for x in cols:
        ys = np.nonzero(alpha[:, x] > 0.5)[0]
        if len(ys):
            top.append((x, ys.min()))
            bot.append((x, ys.max()))
    return top + bot[::-1]


def process(path, mid, session, cleanup, meta):
    img = Image.open(path).convert('RGB')
    rgb = np.asarray(img).copy()
    alpha = cut(img, session)
    # A picture on a black backdrop was cut out once already: its edge carries a dotted ring of dark and light leftovers.
    # The cut is pulled in by 2 px there (under one pixel at the stored size)
    border = np.concatenate([rgb[:8].reshape(-1, 3), rgb[-8:].reshape(-1, 3), rgb[:, :8].reshape(-1, 3), rgb[:, -8:].reshape(-1, 3)])
    if np.median(border.max(axis=1)) < 30:
        core = ndimage.binary_erosion(alpha > 0.5, iterations=2)
        alpha = np.minimum(alpha, ndimage.gaussian_filter(core.astype(np.float32), 0.8))
    decontaminate(rgb, alpha)
    clean(rgb, cleanup.get(mid, []))
    if mid in cleanup.get('restore', {}):
        # A heavily worn picture takes a second pass on the first one's result (cleanup.json "restorePasses")
        for _ in range(cleanup.get('restorePasses', {}).get(mid, 1)):
            restore(rgb, cleanup['restore'][mid])
    wheels, ground, x0, x1 = find_wheels(rgb, alpha)
    # The tyres' bottom line, read off each picture (cleanup.json "ground"): the cutout keeps a few rows of the glossy
    # floor's reflection under the tyres, which would make the wheels too big
    real = cleanup.get('ground', {}).get(mid)
    if real is not None and real < ground:
        alpha[real + 1:] = 0
        wheels, ground, x0, x1 = find_wheels(rgb, alpha)
    # The tyres measured on each picture (cleanup.json "wheels": [centre x, radius] in source px, rear first): the
    # automatic fit stays the fallback for a new picture until it is measured
    manual = cleanup.get('wheels', {}).get(mid)
    exact = cleanup.get('exact', {}).get(mid)
    if exact:
        # Read off the picture by hand ([centre x, centre y, radius]): no search moves them (a carbon brake disc behind
        # thin spokes pulled the axle search off the hub)
        wheels = [(1, int(cx), int(cy), int(r)) for cx, cy, r in exact]
    elif manual == []:
        # A tracked machine (cleanup.json "wheels": {"<id>": []}): its tracks stay in the body, no wheel comes off
        wheels = []
    elif manual:
        wheels = [(1, int(cx), int(ground - r), int(r)) for cx, r in manual]
        # The measured spot is the tyre's: the axle is found on the picture around it
        found = [(sc, *[int(round(v)) for v in hub_centre(rgb, cx, cy, r)], r) for (sc, cx, cy, r) in wheels]
        # The tyre stands on the ground: its radius is the axle's height (never far from the measured one)
        wheels = [(sc, cx, cy, int(max(r * 0.92, min(r * 1.08, ground - cy)))) for (sc, cx, cy, r) in found]
    else:
        wheels = [(s, *refine(alpha, cx, ground, r, x1 - x0)) for (s, cx, cy, r) in wheels]
        wheels = [(s, cx, int(round(cy)), int(round(r))) for (s, cx, cy, r) in wheels]
    L = x1 - x0
    # A machine whose lower half is mostly tracks or steel names its paint by hand (cleanup.json "colour")
    colour = cleanup.get('colour', {}).get(mid) or paint_colour(rgb, alpha, wheels)
    # The crop: the car with a small margin
    ys = np.nonzero(alpha.max(axis=1) > 0.5)[0]
    top = ys.min()
    pad = 4
    cx0, cx1, cy0, cy1 = max(0, x0 - pad), min(rgb.shape[1], x1 + pad + 1), max(0, top - pad), min(rgb.shape[0], ground + 2)
    rgba = np.dstack([rgb, (alpha * 255).astype(np.uint8)])[cy0:cy1, cx0:cx1].copy()
    # Below the ground line nothing (a reflection fleck)
    s = STORE_LEN / L
    H, W = rgba.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]
    out = {'colour': colour, 'wheels': [], 'parts': {}}
    unit = lambda px_x, px_y: [round((px_x + cx0 - x0) / L, 3), round((ground - (px_y + cy0)) / L, 3)]
    os.makedirs(OUT, exist_ok=True)

    def save(arr, name, size=None):
        im = Image.fromarray(arr, 'RGBA')
        im = im.resize(size or (max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
        # A light sharpen after the downscale: the paint's edges and the spokes stay crisp
        rgb_, a_ = im.convert('RGB').filter(ImageFilter.UnsharpMask(radius=1.2, percent=70, threshold=2)), im.getchannel('A')
        im = Image.merge('RGBA', (*rgb_.split(), a_))
        im.save(os.path.join(OUT, name), 'WEBP', quality=QUALITY, method=6, alpha_quality=70)
        return im.size

    body = rgba.copy()
    # The studio floor's colour beside the car, just above the ground line
    fl = rgb[ground - 14:ground - 2, max(0, x0 - 60):max(1, x0 - 8)].reshape(-1, 3)
    if not len(fl):
        fl = rgb[ground - 14:ground - 2, x1 + 8:x1 + 60].reshape(-1, 3)
    floor = np.median(fl, axis=0).astype(np.int32)
    sprites = {}
    wimg = []
    # Two wheels of (nearly) one size share a sprite; a tractor's or a multi-axle machine's keep their own
    radii = [r for (_, _, _, r) in wheels]
    shared = len(wheels) == 2 and abs(radii[0] - radii[1]) <= 0.06 * max(radii) and mid not in cleanup.get('ownWheels', [])
    for f_ in os.listdir(OUT):
        if f_.startswith(mid + '-w') and f_.endswith('.webp'):
            os.remove(os.path.join(OUT, f_))
    for i, (_, wcx, wcy, r) in enumerate(wheels):
        lx, ly = wcx - cx0, wcy - cy0
        R = int(r * 1.03)
        padded = np.pad(rgba, ((R, R), (R, R), (0, 0)))
        wheel = padded[ly:ly + 2 * R + 1, lx:lx + 2 * R + 1].copy()
        d = np.hypot(*np.mgrid[-R:R + 1, -R:R + 1])
        # The disc to the tyre's edge (r), never past it: the studio's colour bleeds into the soft edge beyond
        edge = np.clip((r + 0.5 - d), 0, 1)
        wheel[..., 3] = (edge * 255).astype(np.uint8)
        # The arch's paint where it overlaps the tyre's rim: a coloured sliver that would spin with the wheel and keep
        # the old colour after a respray (the reviewer, 2026-10-16) — the tyre is dark and grey, so colour out there goes
        c = wheel[..., :3].astype(np.float32) / 255
        mx, mn = c.max(axis=2), c.min(axis=2)
        sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
        # And a light body's arch: white flecks on the tyre's outer ring (a tyre is dark there, its rim's lip inside).
        # Both are painted the tyre's own dark (cut out, they left holes)
        bad = ((d > r * 0.72) & (sat > 0.3) & (mx > 0.25)) | ((d > r * 0.88) & (mx > 0.5))
        ring = (d > r * 0.88) & (d <= r) & ~bad & (wheel[..., 3] > 128)
        if ring.any():
            wheel[..., :3][bad] = np.median(wheel[..., :3][ring], axis=0).astype(np.uint8)
        if mid in cleanup.get('caps', []):
            cap(wheel, r)
        # A lugged tyre (cleanup.json "tread": a tractor's chevrons, an 8x8's blocks) keeps its tread: evening it wiped them
        if mid not in cleanup.get('tread', []):
            even_tyre(wheel, d, r)
        # A wheel has its own resolution: the tyre bay shows it big
        # A wheel seen in perspective on the picture (its rim face off its tyre's circle) takes the car's other wheel:
        # the same rim, drawn at its own radius (cleanup.json "sameWheel": {"<id>": [<i>, <from>]})
        same = cleanup.get('sameWheel', {}).get(mid)
        if same and same[0] == i and same[1] in sprites:
            wimg.append(same[1])
        elif i > 0 and shared:
            # A car's wheels are one rim (the owner's table: «колёса … одинаковые»): the front takes the rear's sprite
            wimg.append(0)
        else:
            sprites[i] = save(wheel, f'{mid}-w{i}.webp', (WHEEL_PX, WHEEL_PX))
            wimg.append(i)
        # The centre's height above the ground can be a little under r (a flattened contact patch): the rest is `lift`
        out['wheels'].append({'x': round((wcx - x0) / L, 4), 'r': round(r / L, 4), 'lift': round((ground - wcy - r) / L, 4)})
        # The arch behind it: a dark well above the hub line, air below. No trace of the wheel stays on the body once it is
        # off (the owner's table, 2026-10-19: «Когда снимается колесо часть его остается на машине»): the well is one flat
        # shade (lighter at the bottom, as lit from the floor), and the tyre's drawn outline just outside it goes too
        dd = np.hypot(xx - lx, yy - ly)
        archy = (dd <= r * 1.04) & (yy <= ly + r * 0.25)
        k = np.clip((yy - (ly - r)) / (r * 1.25), 0, 1)[..., None]
        well = np.array([9, 10, 14]) * (1 - k) + np.array([26, 28, 34]) * k
        body[..., :3][archy] = well[archy].astype(np.uint8)
        below = yy > ly + r * 0.25
        body[(dd <= r * 1.0) & below, 3] = 0
        ring = below & (dd > r * 1.0) & (dd <= r * 1.1) & (body[..., :3].max(axis=2) < 70)
        body[ring, 3] = 0
    # The bumpers: the lower corners at each end, as parts; the body under them is the bare crash structure
    sil = body[..., 3] > 128
    for key, at in (('bumperR', 'rear'), ('bumperF', 'front')):
        bw = int(L * 0.055)
        if at == 'rear':
            colsx = np.nonzero(sil.any(axis=0))[0]
            bx0 = colsx.min()
            bx1 = bx0 + bw
        else:
            colsx = np.nonzero(sil.any(axis=0))[0]
            bx1 = colsx.max() + 1
            bx0 = bx1 - bw
        rowsy = np.nonzero(sil[:, bx0:bx1].any(axis=1))[0]
        by1 = rowsy.max() + 1
        by0 = max(rowsy.min(), by1 - int(L * 0.075))
        part = np.zeros_like(body)
        part[by0:by1, bx0:bx1] = body[by0:by1, bx0:bx1]
        part = part[by0:by1, bx0:bx1]
        # Its edges fade out over the band where the body under it keeps its paint: the part and the body are resampled
        # apart, so a hard box edge showed as a hairline (the reviewer, 1.3.5)
        ph, pw_ = part.shape[:2]
        fy, fx = np.mgrid[0:ph, 0:pw_]
        dist = np.minimum(np.minimum(fy, ph - 1 - fy), np.minimum(fx, pw_ - 1 - fx))
        part[..., 3] = (part[..., 3] * np.clip((dist + 0.5) / 3, 0, 1)).astype(np.uint8)
        save(part.copy(), f'{mid}-{"bf" if key == "bumperF" else "br"}.webp')
        p0 = unit(bx0, by1)
        p1 = unit(bx1, by0)
        out['parts'][key] = [p0[0], p0[1], p1[0], p1[1]]
        # The bare structure stays inside the bumper's box by a few px: at its edge the box's dark showed past the resampled
        # part as a hairline seam on the restored car (the reviewer, 1.3.5)
        inset = 4
        region = np.zeros(sil.shape, bool)
        region[by0 + inset:by1 - inset, bx0 + inset:bx1 - inset] = True
        region &= sil
        body[region, :3] = (body[region, :3] * 0.25 + np.array([40, 42, 48]) * 0.75).astype(np.uint8)
    size = save(body, f'{mid}.webp')
    # The silhouette the dirt lives on: the body as stored, without the wheels
    a = np.asarray(Image.open(os.path.join(OUT, f'{mid}.webp')).convert('RGBA'))[..., 3].astype(np.float32) / 255
    # The arches are no surface to clean: the wheel discs leave the mask
    ah, aw = a.shape
    ay, ax = np.mgrid[0:ah, 0:aw]
    for (_, wcx, wcy, r) in wheels:
        a[np.hypot(ax - (wcx - cx0) * s, ay - (wcy - cy0) * s) <= r * s * 1.06] = 0
    rows, bits = mask_bits(a, 128)
    out['img'] = {'w': size[0], 'h': size[1], 'x': round((cx0 - x0) / L, 4), 'top': round((ground - cy0) / L, 4), 'len': round(W / L, 4)}
    out['mask'] = {'cols': 128, 'rows': rows, 'bits': bits}
    out['outline'] = [unit(x, y) for x, y in outline(rgba[..., 3].astype(np.float32) / 255)]
    out['height'] = round((ground - top) / L, 4)
    # The sprite each wheel is drawn with (painted/<id>-w<n>.webp)
    out['wheelImg'] = wimg
    meta[mid] = out
    print(mid, 'colour', colour, 'wheels', out['wheels'], 'size', size, flush=True)


def main():
    src = sys.argv[1]
    only = None
    if '--only' in sys.argv:
        only = set(sys.argv[sys.argv.index('--only') + 1].split(','))
    from rembg import new_session
    session = new_session('isnet-general-use')
    cleanup = json.load(open(os.path.join(HERE, 'cleanup.json')))
    meta_path = os.path.join(OUT, 'meta.json')
    done = {}
    for f in sorted(os.listdir(src)):
        mid, ext = os.path.splitext(f)
        if ext.lower() not in ('.webp', '.png', '.jpg', '.jpeg') or (only and mid not in only):
            continue
        process(os.path.join(src, f), mid, session, cleanup, done)
    # Several runs may work at once (each on its own --only): each merges its cars into meta.json under a lock
    import fcntl
    lock = open(os.path.join(HERE, '.meta.lock'), 'w')
    fcntl.flock(lock, fcntl.LOCK_EX)
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    meta.update(done)
    json.dump(meta, open(meta_path, 'w'), indent=1, sort_keys=True)
    # The same as TypeScript for the game (models.ts reads it; no JSON import needed)
    ts = [
        '// Generated by tools/paint-cars/paint_cars.py from the owner\'s painted cars: do not edit (run the tool again).',
        '// Geometry in the model\'s units: x 0 (the rear) … 1 (the nose), y up from the ground, both in car lengths.',
        '',
        'export interface PaintedMeta {',
        '  /** The body\'s own paint (what a respray recolours) */',
        '  colour: string;',
        '  wheels: { x: number; r: number; lift: number }[];',
        '  /** The sprite each wheel is drawn with (a car\'s two wheels share one) */',
        '  wheelImg: number[];',
        '  parts: { bumperF: [number, number, number, number]; bumperR: [number, number, number, number] };',
        '  /** The body image: its size in px, its left edge and top in model units, its width in model units */',
        '  img: { w: number; h: number; x: number; top: number; len: number };',
        '  /** The silhouette without the wheels: a bit grid over the image, base64 */',
        '  mask: { cols: number; rows: number; bits: string };',
        '  outline: [number, number][];',
        '  height: number;',
        '}',
        '',
        'export const PAINTED: Record<string, PaintedMeta> = ' + json.dumps(meta, sort_keys=True) + ';',
        '',
    ]
    open(os.path.join(OUT, 'meta.ts'), 'w').write('\n'.join(ts))


if __name__ == '__main__':
    main()
