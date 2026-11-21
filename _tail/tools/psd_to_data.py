import sys, json
from psd_tools import PSDImage
PSD = sys.argv[1]; OUT = sys.argv[2]
SC = 8; W, H = 1600, 1920
K = 0.33014; TX = -13.998; TY = -6.451; BX, BY = 484, 678
# Совмещение по лапкам (v3.3.325): векторная Мия игры в пространстве PSD — масштаб 1,000, сдвиг (0; +0,5) ед. вьюбокса (IOU нижней части тела 0,997; низ лап PSD 235,8 против 236,3 в игре):
# хвост сдвигается так же, чтобы относительно лапок стоял как в PSD
SHIFT = (0.0, 0.5)
def loc(px, py):
    vx = px / SC + SHIFT[0]; vy = py / SC + SHIFT[1]
    nx = (200 - vx - TX) / K; ny = (vy - TY) / K
    return nx - BX, ny - BY
def f1(v): s = ('%.1f' % v).rstrip('0').rstrip('.'); return '0' if s in ('-0', '') else s
def pt(p): return f1(p[0]) + ' ' + f1(p[1])
def px(pnt): return (pnt[1] * W, pnt[0] * H)   # psd-tools: (y, x) нормированные
def path_of(sub, rep=None):
    ks = list(sub); n = len(ks)
    A = [px(k.anchor) for k in ks]; OUTH = [px(k.leaving) for k in ks]; INH = [px(k.preceding) for k in ks]
    out = 'M' + pt(loc(*A[0]))
    for i in range(n):
        j = (i + 1) % n
        if not sub.is_closed() and j == 0: break
        c1, c2, p = OUTH[i], INH[j], A[j]
        straight = (abs(c1[0]-A[i][0]) + abs(c1[1]-A[i][1]) < 0.05) and (abs(c2[0]-p[0]) + abs(c2[1]-p[1]) < 0.05)
        out += ('L' + pt(loc(*p))) if straight else ('C' + pt(loc(*c1)) + ' ' + pt(loc(*c2)) + ' ' + pt(loc(*p)))
    return out + ('Z' if sub.is_closed() else '')
psd = PSDImage.open(PSD)
frames = []; info = []
for grp in [x for x in psd if x.kind == 'group']:
    tail = marks = None
    for l in grp:
        if l.name.startswith('Хвост'): tail = l
        elif l.name.startswith('Штрихи'): marks = l
    tp = [p for p in tail.vector_mask.paths if p.is_closed() and len(list(p)) > 2]; assert len(tp) == 1, (grp.name, len(tp)); tpath = path_of(tp[0])
    mpath = ''.join(path_of(s) for s in marks.vector_mask.paths if s.is_closed() and len(list(s)) > 2) if marks else ''
    frames.append({'tail': tpath, 'marks': mpath})
    info.append((grp.name, len(list(tail.vector_mask.paths[0])), len(marks.vector_mask.paths) if marks else 0, bool(marks and marks.visible), str(tail.stroke)[:60] if getattr(tail, 'stroke', None) else None))
json.dump(frames, open(OUT, 'w'), ensure_ascii=False)
for i in info: print(i)
