#!/usr/bin/env python3
"""Regression checks: original-resolution pictures, unique model IDs, wheel-cut transparency, assets catalog."""
from pathlib import Path
import re, json, base64
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
GAME=ROOT/'games/garage-evolution'
PAINT=GAME/'painted'
META=json.loads((PAINT/'meta.json').read_text())
MODEL=(GAME/'models.ts').read_text()
DATA=(GAME/'data.ts').read_text()
INDEX=(PAINT/'index.ts').read_text()
ids=re.findall(r"\bP\('([^']+)'",MODEL)
assert len(ids)==len(set(ids)), 'Duplicate model ids'
for name in ['touringgt','twincam','sixcoupe','zenith','vten','orangetrack','silveropen','violetwide','yellowrally','blueline','foresttrack','typhoon','whiteracer','sakura','greyestate']:
    m=META[name]
    assert m['img']['w']>=1300, f'{name}: degraded source width'
    assert len(m['wheels'])==2 and m['wheelImg']==[0,1], f'{name}: axle metadata'
    with Image.open(PAINT/f'{name}.webp') as f:
        assert f.size==(m['img']['w'],m['img']['h'])
        car=f.convert('RGBA')
    cw,ch=car.size
    for i,w in enumerate(m['wheels']):
        wx=round(w['x']*cw)
        wy=round(ch-(w['r']+w['lift'])*cw)
        assert 0<=wx<cw and 0<=wy<ch, f'{name}/{i}: wheel outside body'
        assert car.getpixel((wx,wy))[3] == 0, f'{name}/{i}: wheel remains embedded in body'
        with Image.open(PAINT/f'{name}-w{i}.webp') as fi:
            assert fi.width>=150 and fi.height>=150, f'{name}/{i}: tiny wheel'
        for part in ['bf','br','w0','w1','']:
            key=f'{name}-{part}' if part else name
            assert f"'{key}':" in INDEX, f'{name}: missing asset chapter import for {key}'
    expected_bytes=(m['mask']['cols']*m['mask']['rows']+7)//8
    assert len(base64.b64decode(m['mask']['bits']))==expected_bytes, f'{name}: invalid restoration mask'
for name in ids:
    if name in META:
        assert f"'{name}'" in DATA, f'{name}: missing from garage pools'
print(f'PASS: {len(ids)} photo models registered; {len(META)} painted models, 15 checked at full resolution; 30 wheel cut-outs verified.')
