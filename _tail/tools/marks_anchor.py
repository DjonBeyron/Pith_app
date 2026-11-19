import sys, pickle, json
import numpy as np
sys.path.append('/tmp/claude-0/-home-user/13d7a56f-a728-5d74-b9ff-ec01809c14cd/scratchpad')
import export_spine as E
from PIL import Image, ImageDraw
NF = 9
def marks_of(k):
    marks = list(E.fr[k]['polys'])
    if k == 3: marks += [E.taper(p) for p in E.RED4]
    if k == 4: marks += [E.taper(p) for p in E.lines5(E.fr[k]['tail'])]
    return [np.asarray(m, float) for m in marks]
def pose_at(k, a):
    """поза между кадрами k и k+1 при a ∈ [0,1] (a<0 — между k-1 и k)"""
    if a < 0: return E.pose((k - 1) % NF, 1 + a)
    return E.pose(k, a)
def seg_angles(Q):
    v = np.diff(Q, axis=0); return np.arctan2(v[:, 1], v[:, 0])
def anchor(Q, poly):
    c = poly.mean(axis=0); j = int(np.argmin(np.hypot(*(Q[:-1] - c).T))); return j
def build():
    res = []; worst = []
    for k in range(NF):
        Qk = E.sp[k]['q']; th = seg_angles(Qk); ms = []
        for poly in marks_of(k):
            j = anchor(Qk, poly); ms.append((poly, j, Qk[j].copy(), th[j]))
        res.append(ms)
        if not ms: continue
        md = 1e9
        for a in np.linspace(-0.45, 0.45, 13):
            Q, w = pose_at(k, a); thn = seg_angles(Q)
            img = Image.new('L', (E.W, E.H), 0); d = ImageDraw.Draw(img)
            for poly, j, p0, t0 in ms:
                c, s_ = np.cos(thn[j] - t0), np.sin(thn[j] - t0); R = np.array([[c, -s_], [s_, c]])
                d.polygon([tuple(R @ (p - p0) + Q[j]) for p in poly], fill=255)
            dist = E.ndi.distance_transform_edt(np.array(img) == 0)
            r = np.array(E.render(Q, w, SS=2, UP=1))[..., 3] > 128
            md = min(md, float(dist[r].min()))
        worst.append((k + 1, round(md, 1)))
    return res, worst
if __name__ == '__main__':
    res, worst = build(); print(worst)
    pickle.dump(res, open('/tmp/marks_anchor.pkl', 'wb'))
