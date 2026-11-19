import sys, os, pickle, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vec_tail import *
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
fr = pickle.load(open('/tmp/vec_frames.pkl', 'rb'))
N = int(os.environ.get('NPTS','40')); SIG=float(os.environ.get('SIG','1.2'))
def spine(S, d):
    ys, xs = np.where(S); pts = np.stack([xs, ys], 1).astype(float)
    base = pts[np.argmax(pts @ d)]                       # самая глубокая точка в теле
    edt = ndi.distance_transform_edt(S)
    idx = -np.ones(S.shape, int); idx[S] = np.arange(len(pts))
    rows, cols, w = [], [], []
    for dy, dx in ((0,1),(1,0),(1,1),(1,-1)):
        a = S & np.roll(np.roll(S, -dy, 0), -dx, 1)
        yy, xx = np.where(a)
        yy2, xx2 = (yy + dy) % S.shape[0], (xx + dx) % S.shape[1]
        step = np.hypot(dy, dx)
        c = step * (1.0 / (np.minimum(edt[yy, xx], edt[yy2, xx2]) + 0.5)) ** 2.2
        rows += list(idx[yy, xx]); cols += list(idx[yy2, xx2]); w += list(c)
    G = coo_matrix((w + w, (rows + cols, cols + rows)), shape=(len(pts), len(pts))).tocsr()
    b = int(idx[int(base[1]), int(base[0])])
    # самая дальняя точка по длине пути
    d_geo, pred = dijkstra(G, indices=b, return_predecessors=True)
    # хвост — самая дальняя по обычному (евклидову по пути) расстоянию: считаем по числу шагов
    G1 = G.copy(); G1.data[:] = 1.0
    d1 = dijkstra(G1, indices=b)
    tip = int(np.argmax(np.where(np.isfinite(d1), d1, -1)))
    path = [tip]
    while path[-1] != b: path.append(pred[path[-1]])
    P = pts[path[::-1]]                                  # от основания к кончику
    return P, edt
def resample(P, n):
    seg = np.hypot(*np.diff(P, axis=0).T); L = np.concatenate([[0], np.cumsum(seg)]); t = np.linspace(0, L[-1], n)
    return np.stack([np.interp(t, L, P[:, 0]), np.interp(t, L, P[:, 1])], 1)
out = []
for i, f in enumerate(fr):
    S = f['tail']; P, edt = spine(S, f['d'] if f['d'] is not None else np.array([1., 0.]))
    Pr = resample(P, 160); Pr[:, 0] = ndi.gaussian_filter1d(Pr[:, 0], SIG, mode='nearest'); Pr[:, 1] = ndi.gaussian_filter1d(Pr[:, 1], SIG, mode='nearest')
    Pr[0] = resample(P, 160)[0]
    Pd = resample(P, 400)
    ed = np.array([ndi.map_coordinates(edt, [[y], [x]], order=1)[0] for x, y in Pd])
    med = float(np.median(ed[len(ed)//5: -len(ed)//5])); hw = med
    seg = np.hypot(*np.diff(Pr, axis=0).T); L = np.concatenate([[0], np.cumsum(seg)])
    cut = L[-1] - hw * 0.93                      # конец спины — центр круглого кончика, а не его край
    t = np.linspace(0, cut, N); Q = np.stack([np.interp(t, L, Pr[:, 0]), np.interp(t, L, Pr[:, 1])], 1)
    wd = np.array([2 * ndi.map_coordinates(edt, [[y], [x]], order=1)[0] for x, y in Q])
    core = wd[2:-2]
    out.append({'q': Q, 'w': float(2*med), 'len': float(np.sum(np.hypot(*np.diff(Q, axis=0).T)))})
    print(i + 1, 'длина', round(out[-1]['len']), 'толщина (внеш.)', round(out[-1]['w'], 1))
pickle.dump(out, open('/tmp/spines.pkl', 'wb'))
