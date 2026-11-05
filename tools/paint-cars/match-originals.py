#!/usr/bin/env python3
"""Find *exact* original side-view drawings for the 132 game car IDs.

The source pack contains loss-minimizing full-resolution WebP copies of the
owner's October 17 drawings.  The game has old, much smaller body textures
with the wheels removed. Matching therefore compares only visible upper body
pixels (paint, windows, lamps), where original and current source should agree.
This script never edits sprites on a guessed match: it writes a ranked report.
"""
from pathlib import Path
from zipfile import ZipFile
import hashlib, io, json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PAINT = ROOT / 'games' / 'garage-evolution' / 'painted'
PARTS = ROOT / '.import' / 'hd-candidates'
SIZE = (256, 110)
ARCHIVE_SHA = '1a50cdc90cb7ecc75a36cccf47eea4a3f37adda6bf2ce5b1d2d63709c1597f95'


def image_repr(image):
    im = image.convert('RGBA')
    rgb = np.asarray(im)
    a = rgb[:, :, 3]
    ys, xs = np.where(a > 70)
    if len(xs) < 1000: return None
    im = im.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    W, H = im.size
    # Keep the full native sharpness in the assets; resize only the matcher.
    h = max(1, round(H / W * SIZE[0]))
    im = im.resize((SIZE[0], h), Image.Resampling.LANCZOS)
    base = Image.new('RGBA', SIZE, (16, 22, 30, 255))
    base.alpha_composite(im, (0, 0))
    alpha = np.zeros(SIZE[::-1], dtype=np.float32)
    alpha[:min(SIZE[1], h)] = np.asarray(im.getchannel('A'), np.float32)[:SIZE[1]] / 255
    return np.asarray(base.convert('RGB'), np.float32), alpha


def rank(target, samples):
    T, A = target
    upper = np.zeros((SIZE[1], SIZE[0]), bool)
    upper[:70, 6:-6] = True
    visible = upper & (A > .68)
    n = visible.sum()
    if n < 200: return []
    scores = []
    for name, src in samples:
        S, B = src
        common = visible & (B > .5)
        count = common.sum()
        if count < 200: continue
        delta = np.abs(S[common] - T[common]).mean()
        absent = (visible & (B <= .5)).sum() / n
        score = float(delta + 110 * absent)
        scores.append((round(score, 2), name))
    return sorted(scores)


def main():
    parts = sorted(PARTS.glob('part*'))
    if len(parts) != 13:
        raise RuntimeError(f'Expected 13 original artwork archive parts; found {len(parts)}')
    archive = b''.join(p.read_bytes() for p in parts)
    if hashlib.sha256(archive).hexdigest() != ARCHIVE_SHA:
        raise RuntimeError('Source art archive checksum mismatch')
    with ZipFile(io.BytesIO(archive)) as z:
        manifest = json.loads(z.read('manifest.json'))
        if len(manifest) != 150:
            raise RuntimeError(f'Expected 150 artworks, found {len(manifest)}')
        candidates = []
        for item in manifest:
            filename = item['file']
            if filename.startswith('/') or '/' in filename or not filename.endswith('.webp'):
                raise RuntimeError('Invalid image path')
            data = z.read('images/' + filename)
            if hashlib.sha256(data).hexdigest() != item['sha256']:
                raise RuntimeError('Corrupt artwork: ' + filename)
            image = Image.open(io.BytesIO(data))
            representation = image_repr(image)
            if representation is None: continue
            candidates.append((filename, representation))
    body_files = sorted(p for p in PAINT.glob('*.webp') if not any(
        p.stem.endswith(s) for s in ('-bf', '-br', '-w0', '-w1', '-w2', '-w3')))
    report = {'source_archive_sha256': ARCHIVE_SHA, 'candidate_count': len(candidates), 'models': {}}
    strong = []
    for path in body_files:
        with Image.open(path) as img:
            if img.width >= 1000: continue  # already integrated at native HD
            representation = image_repr(img)
        if representation is None: continue
        choices = rank(representation, candidates)
        if not choices: continue
        best, second = choices[0], choices[1] if len(choices) > 1 else (1e9, '')
        confident = best[0] < 16 and second[0] - best[0] > 8 and second[0] / max(1, best[0]) > 1.55
        report['models'][path.stem] = {
            'confident': confident,
            'top': [{'score': s, 'file': name,
                     'source_name': manifest[int(name.split('_')[-1].split('.')[0])]['original_name']}
                    for s, name in choices[:5]],
        }
        if confident: strong.append(path.stem)
    report['confident_count'] = len(strong)
    report['unresolved_count'] = len(report['models']) - len(strong)
    (PAINT / 'original-match-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    lines = [
        '# Original artwork matching report', '',
        f'Examined {len(candidates)} genuine original car illustrations and {len(report["models"])} low-resolution game bodies.',
        f'**{len(strong)} strong candidate matches**, {report["unresolved_count"]} uncertain (never replace those automatically).', '',
        '| Current model | Best original | Error | Runner-up | Confidence |', '| --- | --- | ---: | ---: | --- |',
    ]
    for mid, v in sorted(report['models'].items(), key=lambda p: p[1]['top'][0]['score']):
        a = v['top'][0]
        b = v['top'][1] if len(v['top']) > 1 else {'score': 999}
        label = 'strong' if v['confident'] else 'needs review'
        lines.append(f'| {mid} | {a["source_name"]} | {a["score"]} | {b["score"]} | {label} |')
    (PAINT / 'ORIGINAL-MATCHES.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(f'MATCH REPORT: {len(candidates)} candidates; {len(strong)} strong of {len(report["models"])} low-res models')
    for mid in strong[:100]:
        print(mid, report['models'][mid]['top'][:2])

if __name__ == '__main__': main()