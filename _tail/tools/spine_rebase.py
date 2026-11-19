"""Единая точка основания хвоста: у разных поз основание (глубочайшая точка в теле) стояло в разных местах (y 170…223), при интерполяции оно выходило из тела — хвост «отваливался».
Каждая поза: [A] + хребет от точки, лежащей в теле на INSIDE px глубже места выхода, до кончика (M точек)."""
import sys, os, pickle, json, numpy as np
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from vec_tail import *
sp = pickle.load(open('/tmp/spines.pkl', 'rb'))
M = int(os.environ.get('MPTS', '47')); INSIDE = float(os.environ.get('INSIDE', '26'))
bodyEdt = ndi.distance_transform_edt(bodyA)
def inside(p): x, y = int(round(p[0])), int(round(p[1])); return 0 <= x < W and 0 <= y < H and bodyA[y, x]
def dense(Q, n=600):
    seg = np.hypot(*np.diff(Q, axis=0).T); L = np.concatenate([[0], np.cumsum(seg)]); t = np.linspace(0, L[-1], n)
    return np.stack([np.interp(t, L, Q[:, 0]), np.interp(t, L, Q[:, 1])], 1), L[-1] / (n - 1)
Es, vis = [], []
for s_ in sp:
    D, step = dense(s_['q'])
    j0 = next((i for i in range(len(D)) if not inside(D[i])), len(D) - 1)       # первая точка вне тела
    jc = max(0, j0 - int(round(INSIDE / step)))                                  # точка INSIDE px глубже
    # если хребет весь снаружи/глубина мала — берём самую глубокую точку внутри
    Es.append(D[jc]); vis.append(D[jc:])
Em = np.mean(Es, axis=0)
cand = np.argwhere(bodyA); A = cand[np.argmin(np.hypot(cand[:, 1] - Em[0], cand[:, 0] - Em[1]))][::-1].astype(float)
# сдвигаем в самую глубокую точку тела рядом (чтобы основание не торчало)
y0, x0 = int(A[1]), int(A[0]); win = bodyEdt[max(0, y0 - 15):y0 + 16, max(0, x0 - 15):x0 + 16]; dy, dx = np.unravel_index(np.argmax(win), win.shape); A = np.array([max(0, x0 - 15) + dx, max(0, y0 - 15) + dy], float)
print('A (px гифки):', A, 'в теле:', inside(A), 'EDT', round(float(bodyEdt[int(A[1]), int(A[0])]), 1), '  средняя точка входа', np.round(Em, 1))
out = []
for k, V in enumerate(vis):
    seg = np.hypot(*np.diff(V, axis=0).T); L = np.concatenate([[0], np.cumsum(seg)]); t = np.linspace(0, L[-1], M)
    Q = np.vstack([A, np.stack([np.interp(t, L, V[:, 0]), np.interp(t, L, V[:, 1])], 1)])
    out.append({'q': Q, 'w': sp[k]['w'], 'len': float(np.sum(np.hypot(*np.diff(Q, axis=0).T)))})
    print(k + 1, 'E', np.round(Es[k], 0), 'длина', round(out[-1]['len']))
pickle.dump(out, open('/tmp/spines.pkl', 'wb'))
