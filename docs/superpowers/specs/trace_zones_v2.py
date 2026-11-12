"""Zone outlines v2: customer's thin lines (annotated - clean diff) define the cells,
the land mask makes the outline hug the coast with a small margin, then it is smoothed.

Usage: python -I trace_zones_v2.py clean_day.jpg annotated.jpg out.json overlay.png
All coordinates are in the 2000x1714 reference space.
"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw

clean_p, annot_p, out_p, overlay_p = sys.argv[1:5]
clean = np.asarray(Image.open(clean_p).convert('RGB')).astype(int)
annot = np.asarray(Image.open(annot_p).convert('RGB')).astype(int)
H, W = clean.shape[:2]

SEA = np.array([59, 93, 156])
MARGIN = 7       # px of sea kept around the coast
SMOOTH = 9       # closing radius
STROKE_HALF = 3  # grow cells up to the middle of the customer's line

# interior seeds for every zone (several seeds = several cells of one zone)
SEEDS = {
    'state':     [(1200, 560)],
    'farm':      [(900, 700)],
    'fbi':       [(1545, 540)],
    'county':    [(640, 600)],
    'rich':      [(1550, 820), (1560, 1150)],
    'race':      [(890, 330)],
    'outskirts': [(430, 1000), (330, 600)],
    'alcatraz':  [(1065, 960)],
}
# extra areas joined to a zone: bridge to the south island, FBI ship
BRIDGES = {'rich': [(1600, 1020, 1632, 1110)], 'fbi': [(1546, 598, 1606, 619)]}


def disk_offsets(r):
    return [(dy, dx) for dy in range(-r, r + 1) for dx in range(-r, r + 1) if dx * dx + dy * dy <= r * r]


def dilate(m, r):
    if r <= 0:
        return m.copy()
    out = np.zeros_like(m)
    p = np.pad(m, r)
    for dy, dx in disk_offsets(r):
        out |= p[r + dy:r + dy + H, r + dx:r + dx + W]
    return out


def erode(m, r):
    return ~dilate(~m, r)


def flood(free, seed):
    img = Image.fromarray(np.where(free, 255, 0).astype(np.uint8)).copy()
    ImageDraw.floodfill(img, seed, 128)
    return np.asarray(img) == 128


def components(mask, min_px=1):
    """Yield boolean masks of connected components (4-connectivity) via flood fill."""
    left = mask.copy()
    while left.any():
        ys, xs = np.nonzero(left)
        comp = flood(left, (int(xs[0]), int(ys[0])))
        left &= ~comp
        if comp.sum() >= min_px:
            yield comp


# --- customer's strokes and pink dots ---------------------------------------
delta = np.abs(clean - annot).max(-1)
R, G, B = annot[..., 0], annot[..., 1], annot[..., 2]
# pink marker dots: pink blobs at least 3x3 px (1-px-wide pink runs are anti-aliased lines)
pinkish = (R > 200) & (R - G > 45) & (B - G > 10) & (G > 90) & (B > 140)
dots, dot_px = [], np.zeros(delta.shape, bool)
for comp in components(pinkish, 8):
    ys, xs = np.nonzero(comp)
    if xs.max() - xs.min() + 1 >= 3 and ys.max() - ys.min() + 1 >= 3:
        dots.append([int(round(xs.mean())), int(round(ys.mean()))])
        dot_px |= comp
stroke = (delta > 32) & ~dilate(dot_px, 3)
stroke = dilate(stroke, 2)

# --- land mask: everything not connected to the open sea --------------------
water = np.abs(clean - SEA).sum(-1) < 45
water = erode(dilate(water, 1), 1)  # close JPEG speckles
sea = flood(water, (0, 0))
land = ~sea
land = erode(dilate(land, 2), 2)    # join tiny gaps (piers, ships)

# --- zones ------------------------------------------------------------------
free = ~stroke
result, masks = {}, {}
for zid, seeds in SEEDS.items():
    cell = np.zeros_like(free)
    for sx, sy in seeds:
        assert free[sy, sx], f'{zid}: seed {sx},{sy} on a stroke'
        part = flood(free, (sx, sy))
        assert not (part[0].any() or part[-1].any() or part[:, 0].any() or part[:, -1].any()),             f'{zid}: seed {sx},{sy} leaks to the image border (gap in the line)'
        cell |= part
    cell = dilate(cell, STROKE_HALF + 1)
    for x0, y0, x1, y1 in BRIDGES.get(zid, []):
        cell[y0:y1, x0:x1] = True
    zone = cell & dilate(land, MARGIN)
    zone = erode(dilate(zone, SMOOTH), SMOOTH)      # fill notches
    zone = dilate(erode(zone, 3), 3)                # cut spikes
    zone &= dilate(cell, 1)                         # never cross the customer's line
    comps = sorted(components(zone, 30), key=lambda c: -c.sum())
    if len(comps) > 1:
        print(f'  {zid}: dropping {len(comps) - 1} small part(s):', [int(c.sum()) for c in comps[1:]])
    masks[zid] = comps[0]


def trace(mask):
    """Moore-neighbour boundary trace; returns [(x, y), ...]."""
    ys, xs = np.nonzero(mask)
    i = np.lexsort((xs, ys))[0]
    start = (int(xs[i]), int(ys[i]))
    nb = [(-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1)]
    pts, cur, back = [start], start, 0
    while True:
        for k in range(8):
            d = (back + k) % 8
            nx, ny = cur[0] + nb[d][0], cur[1] + nb[d][1]
            if 0 <= nx < W and 0 <= ny < H and mask[ny, nx]:
                back, cur = (d + 5) % 8, (nx, ny)
                break
        if cur == start or len(pts) > 400000:
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
        v = q - p
        d = np.abs(v[0] * (seg - p)[:, 1] - v[1] * (seg - p)[:, 0]) / (np.hypot(*v) or 1)
        k = int(np.argmax(d))
        if d[k] > eps:
            m = a + 1 + k
            return rec(a, m) + rec(m, b)
        return [a]

    far = int(np.argmax(np.linalg.norm(pts - pts[0], axis=1)))
    return [pts[i] for i in rec(0, far) + rec(far, len(pts) - 1)]


def chaikin(pts, n=2):
    p = np.array(pts, float)
    for _ in range(n):
        q = np.roll(p, -1, axis=0)
        p = np.stack([0.75 * p + 0.25 * q, 0.25 * p + 0.75 * q], axis=1).reshape(-1, 2)
    return p


ov = Image.open(clean_p).convert('RGB')
draw = ImageDraw.Draw(ov, 'RGBA')
for zid, mask in masks.items():
    ring = dp(chaikin(dp(trace(mask), 1.2), 2), 0.6)
    ring = [[int(round(x)), int(round(y))] for x, y in ring]
    # drop consecutive duplicates
    ring = [p for i, p in enumerate(ring) if p != ring[i - 1]]
    result[zid] = ring
    draw.polygon([tuple(p) for p in ring], outline=(255, 0, 255, 255), fill=(255, 0, 255, 40))
    print(f'{zid}: {len(ring)} vertices, area {int(mask.sum())}')
for x, y in dots:
    draw.ellipse([x - 5, y - 5, x + 5, y + 5], outline=(0, 255, 0, 255), width=2)
print(len(dots), 'pink dots')
json.dump({'zones': result, 'dots': dots}, open(out_p, 'w'))
ov.save(overlay_p)
