import sys, os, pickle, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vec_tail import *
K = 0.33014; TX = -13.998; TY = -6.451; BX, BY = 484, 678
def loc(p):
    p = np.asarray(p, float); vx = (p[..., 0] - ox) / (4 * s); vy = (p[..., 1] - oy) / (4 * s)
    nx = (200 - vx - TX) / K; ny = (vy - TY) / K
    return np.stack([nx - BX, ny - BY], -1)
def f1(v): return ('%.1f' % v).rstrip('0').rstrip('.') if abs(v) >= 0.05 else '0'
def pt(p): return f1(p[0]) + ' ' + f1(p[1])
def bez_path(segs):
    segs = [(loc(a), loc(b), loc(c), loc(d)) for a, b, c, d in segs]
    out = 'M' + pt(segs[0][0])
    for _, c1, c2, p1 in segs: out += 'C' + pt(c1) + ' ' + pt(c2) + ' ' + pt(p1)
    return out + 'Z'
def poly_path(poly):
    P = loc(poly); return 'M' + 'L'.join(pt(p) for p in P) + 'Z'
fr = pickle.load(open('/tmp/vec_frames.pkl', 'rb'))
frames = []
for i, f in enumerate(fr):
    marks = list(f['polys'])
    if i == 3: marks += [taper(p) for p in RED4]
    if i == 4: marks += [taper(p) for p in lines5(f['tail'])]
    mk = []
    for m in marks:
        m = np.asarray(m, float)
        if len(m) > 12 and not np.allclose(m[0], m[-1]): m = simplify_closed(np.vstack([m, m[:1]]), 0.2)
        mk.append(poly_path(m))
    frames.append({'tail': bez_path(f['segs']), 'marks': ''.join(mk)})
print('outline width native', round(OUTW / (4 * s * K), 2))
json.dump(frames, open('/tmp/tail_frames.json', 'w'), ensure_ascii=False)
print([ (len(x['tail']), len(x['marks'])) for x in frames])
