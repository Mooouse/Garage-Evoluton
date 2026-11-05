#!/usr/bin/env python3
"""Import only exact, high-confidence matches from the 150 owner originals.

Reads the immutable, checksummed 150-image archive already stored in .import/.
The independent matcher produced original-match-report.json. We do not assign
ambiguous candidates to unrelated car models. Original artwork is preserved as
PNG, and all in-game parts are regenerated from the same source pixels.
"""
from __future__ import annotations

import hashlib
import importlib.util
import io
import json
from pathlib import Path
from zipfile import ZipFile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PAINT = ROOT / 'games/garage-evolution/painted'
PARTS = ROOT / '.import/hd-candidates'
REPORT_PATH = PAINT / 'original-match-report.json'
IMPORTER_PATH = ROOT / 'tools/paint-cars/import-user-originals.py'

# Additional candidates verified by side-by-side comparison of actual car silhouettes,
# rooflines, headlamps, door seams, body shape, and rear lights against the game.
# Entries with merely similar colours but different models are intentionally excluded.
VISUALLY_REVIEWED = {
    'highwing': 'car_034.webp',
    'bubble': 'car_146.webp',
    'sledge': 'car_131.webp',
    'skyscraper': 'car_149.webp',
    'dusk': 'car_052.webp',
    'feather': 'car_101.webp',
    'pounce': 'car_031.webp',
    'mulberry': 'car_061.webp',
    'boxer': 'car_063.webp',
    'aero': 'car_026.webp',
    'bellaotto': 'car_130.webp',
    'swiftarrow': 'car_004.webp',
    'senator': 'car_029.webp',
    'sovereign': 'car_005.webp',
    'thunderfour': 'car_072.webp',
    'serpent': 'car_001.webp',
    'emerald': 'car_085.webp',
    'turini': 'car_137.webp',
    'prowler': 'car_119.webp',
    'viaggio': 'car_025.webp',
    'kabuki': 'car_009.webp',
    'diamond': 'car_050.webp',
    'hanok': 'car_135.webp',
    'zeppelin': 'car_105.webp',
    'papaya': 'car_099.webp',
    'amethyst': 'car_053.webp',
}


def load_importer():
    spec = importlib.util.spec_from_file_location('garage_full_res_importer', IMPORTER_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def validate_report(report):
    if report.get('candidate_count') != 150:
        raise RuntimeError('The matching report was generated for a different source pack')
    matches = {}
    seen_art = set()
    machine_verified = 0
    for model, entry in report['models'].items():
        if not entry.get('confident') and model not in VISUALLY_REVIEWED:
            continue
        top = entry.get('top', [])
        if len(top) < 2:
            raise RuntimeError(f'{model}: cannot establish unique original match')
        best, runner_up = top[:2]
        if entry.get('confident'):
            if not (best['score'] < 16 and runner_up['score'] - best['score'] > 8 and
                    runner_up['score'] / max(1, best['score']) > 1.55):
                raise RuntimeError(f'{model}: confidence criteria were changed')
            machine_verified += 1
        elif best['file'] != VISUALLY_REVIEWED[model]:
            raise RuntimeError(f'{model}: reviewed original changed since inspection')
        original_file = best['file']
        if original_file in seen_art:
            raise RuntimeError(f'{original_file}: same drawing mapped to multiple cars')
        seen_art.add(original_file)
        matches[model] = original_file
    if machine_verified != report['confident_count']:
        raise RuntimeError('Confidence report count does not match its entries')
    if len(matches) != machine_verified + len(VISUALLY_REVIEWED):
        raise RuntimeError('Visual review mapping does not match candidate report')
    return matches


def convert_to_positions(meta, image, name):
    # Existing model metadata was measured from this SAME original drawing,
    # so reuse exact axle locations rather than hallucinating new ones.
    source = meta[name]
    cropped = image
    height, width = cropped.shape[:2]
    x_start = source['img']['x']
    length = source['img']['len']
    result = []
    if len(source['wheels']) != 2 or length <= 0:
        raise RuntimeError(f'{name}: expected two correctly registered axles')
    for wheel in source['wheels']:
        radius = wheel['r'] / length
        cx = (wheel['x'] - x_start) / length
        # Native source crop is anchored to its actual contact line.
        cy = height / width - (wheel['r'] + wheel.get('lift', 0)) / length
        if not (.05 < radius < .16 and .05 < cx < .95 and
                .08 < cy < height / width + .02):
            raise RuntimeError(f'{name}: axle outside source bounds: {cx=}, {cy=}, {radius=}')
        result.append((round(cx * 900, 4), round(cy * 900, 4), round(radius * 900, 4)))
    return result


def main():
    report = json.loads(REPORT_PATH.read_text(encoding='utf-8'))
    matches = validate_report(report)
    parts = sorted(PARTS.glob('part*'))
    if len(parts) != 13:
        raise RuntimeError(f'Expected 13 source pack parts, received {len(parts)}')
    archive = b''.join(part.read_bytes() for part in parts)
    checksum = hashlib.sha256(archive).hexdigest()
    if checksum != report['source_archive_sha256']:
        raise RuntimeError('Archived user artwork checksum mismatch')
    importer = load_importer()
    old_meta = json.loads((PAINT / 'meta.json').read_text(encoding='utf-8'))
    importer.CONFIG.clear()
    with ZipFile(io.BytesIO(archive)) as z:
        manifest = json.loads(z.read('manifest.json'))
        files = {item['file']: item for item in manifest}
        for model, filename in sorted(matches.items()):
            if model not in old_meta or filename not in files:
                raise RuntimeError(f'{model}: original or old model metadata missing')
            original = z.read('images/' + filename)
            if hashlib.sha256(original).hexdigest() != files[filename]['sha256']:
                raise RuntimeError('Original image checksum mismatch: ' + filename)
            with Image.open(io.BytesIO(original)) as im:
                rgba = im.convert('RGBA')
            original_path = importer.ORIGINALS / (model + '.png')
            original_path.parent.mkdir(parents=True, exist_ok=True)
            rgba.save(original_path, 'PNG', optimize=True)
            cropped = importer.crop_original(original_path)
            positions = convert_to_positions(old_meta, cropped, model)
            importer.CONFIG[model] = (old_meta[model]['colour'], positions)
            print(f'MATCHED {model} -> {files[filename].get("original_name", filename)}: '
                  f'{rgba.width}x{rgba.height}, wheel positions {positions}', flush=True)

    # One single atomic metadata rewrite; use the same importer that already
    # passed browser and restoration checks for the first eight originals.
    importer.main()
    updated = json.loads((PAINT / 'meta.json').read_text(encoding='utf-8'))
    for model in matches:
        entry = updated[model]
        assert entry['img']['w'] >= 900
        assert len(entry['wheels']) == 2 and entry['wheelImg'] == [0, 1]
        with Image.open(PAINT / (model + '.webp')) as im:
            assert im.width == entry['img']['w']
            assert im.height == entry['img']['h']
            body = im.convert('RGBA')
        for index, wh in enumerate(entry['wheels']):
            px = round(wh['x'] * entry['img']['w'])
            py = round((entry['height'] - wh['r'] - wh['lift']) * entry['img']['w'])
            if not (0 <= px < body.width and 0 <= py < body.height):
                raise RuntimeError(f'{model}: wheel outside body')
            if body.getpixel((px, py))[3] > 8:
                raise RuntimeError(f'{model}: original wheel not separated')
            with Image.open(PAINT / f'{model}-w{index}.webp') as wheel:
                if wheel.width < 145:
                    raise RuntimeError(f'{model}: wheel resolution is too low')
        print(f'VERIFIED {model}: {body.width} x {body.height}', flush=True)

    print(f'SUCCESS: {len(matches)} full-resolution originals imported, with separate wheels')


if __name__ == '__main__':
    main()
