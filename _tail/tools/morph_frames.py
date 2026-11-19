"""Кадры хвоста v3.3.292: девять утверждённых силуэтов (как у владельца в покадровом просмотре) + промежуточные (морфинг по знаковому расстоянию),
чтобы то же движение шло с большей частотой (25 кадров/с вместо 6). Переходы CUT_PAIRS (4→5, 5→6) без промежуточных — как в гифке, резкая смена."""
import sys, os, pickle, json, numpy as np
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from vec_tail import *
fr = pickle.load(open('/tmp/vec_frames.pkl', 'rb'))
CUT_PAIRS = {3, 4}; MIDS = 3
def sdf(S): return ndi.distance_transform_edt(S) - ndi.distance_transform_edt(~S)
SD = [sdf(f['tail']) for f in fr]
def largest_fill(m):
    lab, n = ndi.label(m, structure=np.ones((3, 3)))
    if n > 1: m = lab == (1 + int(np.argmax(ndi.sum(m, lab, range(1, n + 1)))))
    return ndi.binary_fill_holes(m)
def path_of(S):
    dist, lvl = smooth_level(S, OUTW / 2); cs = contours(dist, lvl); cs.sort(key=lambda c: -len(c))
    P = simplify_closed(cs[0], 0.45); return bez_closed(P)
def marks_of(k):
    ms = list(fr[k]['polys'])
    if k == 3: ms += [taper(p) for p in RED4]
    if k == 4: ms += [taper(p) for p in lines5(fr[k]['tail'])]
    return ms
def good_mid(S, k, k1):
    v = S & ~bodyA; lab, n = ndi.label(v, structure=np.ones((3, 3)))
    big = [i for i in range(1, n + 1) if (lab == i).sum() > 60]
    a0, a1 = (fr[k]['tail'] & ~bodyA).sum(), (fr[k1]['tail'] & ~bodyA).sum()
    return len(big) == 1 and v.sum() >= 0.8 * min(a0, a1)
for k in range(9):                       # переходы, где смесь рассыпается (кусок без связи с телом или хвост усох), — рывок, как в гифке
    if k in CUT_PAIRS: continue
    k1 = (k + 1) % 9
    if not all(good_mid(largest_fill((1 - a) * SD[k] + a * SD[k1] > 0), k, k1) for a in (0.25, 0.5, 0.75)): CUT_PAIRS.add(k); print('рывок', k + 1, '->', k1 + 1)
frames = []   # {'pose': k, 'a': alpha, 'S': bool array, 'segs': bezier}
for k in range(9):
    frames.append({'pose': k, 'a': 0.0, 'S': fr[k]['tail'], 'segs': fr[k]['segs']})
    if k in CUT_PAIRS: continue
    k1 = (k + 1) % 9
    for j in range(1, MIDS + 1):
        a = j / (MIDS + 1); S = largest_fill((1 - a) * SD[k] + a * SD[k1] > 0)
        frames.append({'pose': k, 'a': a, 'S': S, 'segs': path_of(S)})
print('кадров', len(frames))
# окно штрихов: сколько слотов подряд (с позы) штрихи позы k не ближе 3 px к хвосту
spans = []
for k in range(9):
    ms = marks_of(k)
    if not ms: spans.append(0); continue
    mimg = Image.new('L', (W, H), 0); dm = ImageDraw.Draw(mimg)
    for m in ms: dm.polygon([tuple(p) for p in np.asarray(m)], fill=255)
    dist = ndi.distance_transform_edt(np.array(mimg) == 0)
    n = 0
    for f in [x for x in frames if x['pose'] == k]:
        if dist[f['S'] & ~bodyA].min() < 3.5: break
        n += 1
    spans.append(4 if (k in CUT_PAIRS and n) else n)
print('окно штрихов (слотов из 4):', spans)
pickle.dump({'cuts': sorted(CUT_PAIRS), 'frames': frames, 'spans': spans, 'marks': [marks_of(k) for k in range(9)]}, open('/tmp/morph.pkl', 'wb'))
