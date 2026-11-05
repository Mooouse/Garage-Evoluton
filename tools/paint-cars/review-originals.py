#!/usr/bin/env python3
"""Prepare low-bandwidth side-by-side car identity review sheets.
Sheets are printed as chunked base64 JPEG in the GH workflow log for visual QA;
no temporary thumbnails are committed to the game.
"""
from __future__ import annotations
import base64
import hashlib
import io
import json
from pathlib import Path
from zipfile import ZipFile
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
PAINT = ROOT / 'games/garage-evolution/painted'
PACK = ROOT / '.import/hd-candidates'
REPORT = json.loads((PAINT / 'original-match-report.json').read_text(encoding='utf-8'))
FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def tile(img, w, h):
    im = img.convert('RGBA')
    a = im.getchannel('A')
    bounds = a.point(lambda n: 255 if n > 64 else 0).getbbox()
    if bounds:
        im = im.crop(bounds)
    im.thumbnail((w - 10, h - 10), Image.Resampling.LANCZOS)
    out = Image.new('RGBA', (w, h), (28, 32, 42, 255))
    out.alpha_composite(im, ((w - im.width) // 2, (h - im.height) // 2))
    return out.convert('RGB')


def main():
    parts = sorted(PACK.glob('part*'))
    assert len(parts) == 13
    archive = b''.join(part.read_bytes() for part in parts)
    assert hashlib.sha256(archive).hexdigest() == REPORT['source_archive_sha256']
    cases = [(key, row) for key, row in REPORT['models'].items() if not row['confident']]
    cases.sort(key=lambda pair: pair[1]['top'][0]['score'])
    font = ImageFont.truetype(FONT_PATH, 14)
    small = ImageFont.truetype(FONT_PATH, 11)
    W, H = 245, 100
    ROW = 135
    with ZipFile(io.BytesIO(archive)) as z:
        for first in range(0, len(cases), 17):
            group = cases[first:first + 17]
            out = Image.new('RGB', (W * 3, ROW * len(group)), (19, 22, 29))
            draw = ImageDraw.Draw(out)
            for i, (model, row) in enumerate(group):
                a, b = row['top'][:2]
                y = i * ROW
                draw.text((6, y), f'{model}: {a["score"]} vs {b["score"]}', font=font, fill=(250, 245, 220))
                with Image.open(PAINT / f'{model}.webp') as old:
                    out.paste(tile(old, W, H), (0, y + 20))
                for ix, candidate in enumerate((a, b), start=1):
                    with Image.open(io.BytesIO(z.read('images/' + candidate['file']))) as car:
                        out.paste(tile(car, W, H), (ix * W, y + 20))
                for ix, name in enumerate(('CURRENT', a['file'] + ' BEST', b['file'] + ' 2ND')):
                    draw.text((ix * W + 5, y + 121), name, font=small, fill=(160, 178, 204))
            buf = io.BytesIO()
            out.save(buf, 'JPEG', quality=72, optimize=True)
            encoded = base64.b64encode(buf.getvalue()).decode()
            print(f'SHEET_INFO {first // 17} rows={len(group)} size={len(buf.getvalue())}', flush=True)
            for n in range(0, len(encoded), 12000):
                print(f'SHEET_PIECE {first // 17} {n // 12000} {encoded[n:n+12000]}', flush=True)


if __name__ == '__main__':
    main()
