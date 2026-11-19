import sys, os, pickle, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from spine_view import *
from export_vec import loc, f1   # переводит px гифки -> локальные координаты хвоста игры
sp = pickle.load(open('/tmp/spines.pkl', 'rb')); fr = pickle.load(open('/tmp/vec_frames.pkl', 'rb'))
tf = json.load(open('/tmp/tail_frames.json'))
NF = len(sp)
def angles(Q):
    v = np.diff(Q, axis=0); return np.arctan2(v[:, 1], v[:, 0]), np.hypot(v[:, 0], v[:, 1])
A = [angles(s['q']) for s in sp]
def pose(k, a):
    """линейная проба для поиска зазора метка–хвост: углы/длины между кадрами k и k+1"""
    k1 = (k + 1) % NF; th0, l0 = A[k]; th1, l1 = A[k1]
    th1 = th0 + (np.angle(np.exp(1j * (th1 - th0))))
    th = th0 + (th1 - th0) * a; l = l0 + (l1 - l0) * a; b = sp[k]['q'][0] * (1 - a) + sp[k1]['q'][0] * a
    P = [b]
    for t, ll in zip(th, l): P.append(P[-1] + ll * np.array([np.cos(t), np.sin(t)]))
    return np.array(P), sp[k]['w'] * (1 - a) + sp[k1]['w'] * a
mu = []
for k in range(NF):
    marks = list(fr[k]['polys'])
    if k == 3: marks += [taper(p) for p in RED4]
    if k == 4: marks += [taper(p) for p in lines5(fr[k]['tail'])]
    if not marks: mu.append(1.0); continue
    mimg = Image.new('L', (W, H), 0); dm = ImageDraw.Draw(mimg)
    for m in marks: dm.polygon([tuple(p) for p in np.asarray(m)], fill=255)
    dist = ndi.distance_transform_edt(np.array(mimg) == 0)
    lim = 1.0
    for a in np.linspace(0, 1, 41):
        Q, w = pose(k, a); r = np.array(render(Q, w, SS=2, UP=1))[..., 3] > 128
        if dist[r].min() < 3.0: lim = max(0.0, a - 0.05); break
    mu.append(round(float(lim), 2))
print('markUntil', mu)
K = 1 / (4 * s * 0.33014)          # px гифки -> единицы пака
out = []
for k in range(NF):
    q = loc(sp[k]['q']); out.append({'q': [round(float(x), 1) for x in q.reshape(-1)], 'w': round(float(sp[k]['w'] * K), 1), 'marks': tf[k]['marks'], 'mu': mu[k]})
js = "// Хвост Мии (владелец, v3.3.289: «мало кадров, хвост зависает, будто подрезан»): 9 ключевых поз «психованного» хвоста по гифке владельца. Каждая поза — хребет (осевая линия хвоста от основания, спрятанного под телом,\n// до центра круглого кончика, 48 точек: x y подряд, в системе группы хвоста mia2) и толщина w (внешняя, с обводкой). Между позами хвост считает miaTailDrive.js (плавно, на каждом кадре экрана), а не CSS-переключение.\n// marks — белые «штрихи движения» и треугольники позы (в позах 1 и 9 их нет); mu — до какой доли пути к следующей позе штрихи ещё не касаются хвоста (дальше прячутся). Данные: _tail/tools/export_spine.py, руками не правят.\nexport const MIA_TAIL = [\n"
for o in out:
    js += "  { w: %s, mu: %s,\n    q: [%s],\n    marks: '%s' },\n" % (o['w'], o['mu'], ','.join(str(x) for x in o['q']), o['marks'])
js += "]\n"
open('/tmp/miaTailData_new.js', 'w').write(js); print(len(js), 'байт')
