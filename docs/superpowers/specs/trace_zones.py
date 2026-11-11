"""Trace zone outlines from the customer's colored strokes on the reference image.
Usage: python -I trace_zones.py <reference.webp> <out.json> <overlay.png>
"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw

ref_path, out_path, overlay_path = sys.argv[1:4]
im = Image.open(ref_path).convert('RGB')
A = np.asarray(im).astype(int)
H, W = A.shape[:2]

# color, bbox (x0,y0,x1,y1) to search stroke in, interior seed (non-stroke pixel)
Z = {
    'state':     ((62, 204, 254), (1060, 330, 1380, 870), (1150, 450)),
    'farm':      ((244, 99, 34),  (765, 395, 1030, 850),  (850, 760)),
    'fbi':       ((31, 31, 31),   (1445, 470, 1655, 605), (1467, 493)),
    'county':    ((254, 212, 49), (455, 330, 800, 885),   (560, 420)),
    'rich':      ((125, 196, 0),  (1225, 600, 1760, 1260), (1660, 700)),
    'race':      ((91, 49, 141),  (760, 225, 1025, 405),  (800, 380)),
    'outskirts': ((228, 24, 45),  (175, 295, 975, 1340),  (300, 1200)),
}


def dilate(m, r):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r:
                out |= np.roll(np.roll(m, dy, 0), dx, 1)
    return out


def flood(free, seed):
    """Connected component of `free` (bool array) containing seed (x, y)."""
    img = Image.fromarray(np.where(free, 255, 0).astype(np.uint8)).copy()
    ImageDraw.floodfill(img, seed, 128)
    return np.asarray(img) == 128


def trace(mask):
    """Moore-neighbour boundary trace of the largest blob; returns [(x, y), ...]."""
    ys, xs = np.nonzero(mask)
    i = np.lexsort((xs, ys))[0]
    start = (xs[i], ys[i])
    nbrs = [(-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1)]
    pts = [start]
    cur, back = start, 0  # came from the left (west)
    while True:
        for k in range(8):
            d = (back + k) % 8
            nx, ny = cur[0] + nbrs[d][0], cur[1] + nbrs[d][1]
            if 0 <= nx < mask.shape[1] and 0 <= ny < mask.shape[0] and mask[ny, nx]:
                back = (d + 5) % 8
                cur = (nx, ny)
                break
        if cur == start or len(pts) > 200000:
            break
        pts.append(cur)
    return pts


def dp(pts, eps):
    pts = np.array(pts, float)
    def rec(a, b):
        if b <= a + 1:
            return [a]
        p, q = pts[a], pts[b]
        seg = pts[a + 1:b]
        d = np.abs((q - p)[0] * (seg - p)[:, 1] - (q - p)[1] * (seg - p)[:, 0]) / (np.linalg.norm(q - p) or 1)
        k = int(np.argmax(d))
        if d[k] > eps:
            m = a + 1 + k
            return rec(a, m) + rec(m, b)
        return [a]
    # split closed loop at farthest point from start
    far = int(np.argmax(np.linalg.norm(pts - pts[0], axis=1)))
    idx = rec(0, far) + rec(far, len(pts) - 1)
    return [[int(round(pts[i][0])), int(round(pts[i][1]))] for i in idx]


ANCH = {'state': (1195, 565), 'farm': (890, 620), 'fbi': (1545, 535), 'county': (640, 590),
        'rich': (1550, 820), 'race': (870, 320), 'outskirts': (430, 1000)}
GAP = 6
regions = {}
for zid, (col, (x0, y0, x1, y1), _) in Z.items():
    box = np.zeros((H, W), bool)
    box[y0:y1, x0:x1] = True
    raw = np.zeros((H, W), bool)
    for oid, (ocol, _, _) in Z.items():
        if oid == 'fbi' and zid != 'fbi':
            continue
        dist = np.sqrt(((A - np.array(ocol)) ** 2).sum(-1))
        raw |= dist < (20 if oid == 'fbi' else 40)
    stroke = dilate(raw & box, GAP)
    outside = flood(~stroke | ~box, (0, 0))
    inside = ~outside & box
    ax, ay = ANCH[zid]
    comp = flood(inside, (ax, ay))
    assert comp.sum() > 0, zid
    region = ~dilate(~comp, GAP)  # pull back to roughly the stroke centre line
    regions[zid] = region

# outskirts must not contain county
regions['outskirts'] &= ~regions['county']

out, overlay = {}, im.copy()
draw = ImageDraw.Draw(overlay)
for zid, region in regions.items():
    poly = dp(trace(region), 4.0)
    out[zid] = poly
    draw.line([tuple(p) for p in poly] + [tuple(poly[0])], fill=(255, 0, 255) if zid != 'fbi' else (255,255,255), width=3)
    print(zid, 'vertices:', len(poly), 'area px:', int(region.sum()))
json.dump(out, open(out_path, 'w'))
overlay.save(overlay_path)
