"""Хвост Мии «пером»: плавные контуры без изломов (кубические безье по алгоритму Шнайдера, касательные непрерывны), основание уходит ПОД тело по касательной хвоста,
хвост не касается усов. Вход: /tmp/vec_frames.pkl (утверждённые силуэты). Выход: /tmp/pen.pkl."""
import sys, os, pickle, numpy as np
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from vec_tail import *
fr = pickle.load(open('/tmp/vec_frames.pkl', 'rb'))
S_ARC = float(os.environ.get('SARC', '3.0')); TOL = float(os.environ.get('TOL', '0.7')); SDFS = float(os.environ.get('SDFS', '1.6'))
# --- усы (светлые тонкие линии головы слева от тела) ---
mrgba = np.array(mia); lum = mrgba[..., :3].min(axis=2); light = (lum > 150) & (mrgba[..., 3] > 60)
lab, n = ndi.label(light, structure=np.ones((3, 3))); whisk = np.zeros_like(light)
for k in range(1, n + 1):
    yy, xx = np.where(lab == k)
    if len(yy) > 25 and xx.min() < 175 and yy.max() < 215 and (xx.max() - xx.min()) > 25: whisk |= (lab == k)
WHISK_KEEP = 7.0                                                  # px: хвост не ближе к усам
def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]; return x * x + y * y <= r * r
def largest(m):
    l, k = ndi.label(m, structure=np.ones((3, 3)))
    return m if k <= 1 else l == (1 + int(np.argmax(ndi.sum(m, l, range(1, k + 1)))))
SPINES = pickle.load(open('/tmp/spines_old.pkl', 'rb'))
def tube_extend(S, k):
    """продлить хвост под тело трубой по касательной: корень хвоста — у тела внизу слева (y > 225), направление и ширина — по ближайшим к корню ~30 px хвоста"""
    ring = ndi.binary_dilation(bodyD, iterations=3); J = S & ring; J[:225] = False
    ys, xs = np.where(J); fc = np.array([xs.mean(), ys.mean()])
    yy, xx = np.where(S); dd = np.hypot(xx - fc[0], yy - fc[1]); sel = (dd > 8) & (dd < 36)
    P = np.stack([xx[sel], yy[sel]], 1).astype(float); c = P.mean(0)
    _, _, vt = np.linalg.svd(P - c, full_matrices=False); d = vt[0]
    if np.dot(fc - c, d) < 0: d = -d
    edt = ndi.distance_transform_edt(S); w = max(2 * float(np.median(edt[yy[sel], xx[sel]])), 24.0)
    n = np.array([-d[1], d[0]]); a = fc - d * 22; b = fc + d * 70
    img = Image.new('L', (W * 4, H * 4), 0); poly = [a + n * w / 2, a - n * w / 2, b - n * w / 2, b + n * w / 2]
    ImageDraw.Draw(img).polygon([tuple(p * 4) for p in poly], fill=255)
    tube = np.array(img.resize((W, H), Image.LANCZOS)) > 127
    allow = ndi.binary_dilation(bodyA, iterations=2) | S
    out = S | (tube & allow); out = ndi.binary_closing(out, iterations=3) | out
    return out, d, tube, fc
def dense_contour(S, inset):
    sd = ndi.distance_transform_edt(np.pad(S, 3))[3:-3, 3:-3]; sd = ndi.gaussian_filter(sd, SDFS)
    cs = contours(sd, inset + 0.5); cs.sort(key=lambda c: -len(c)); c = cs[0]
    if np.allclose(c[0], c[-1]): c = c[:-1]
    seg = np.hypot(*np.diff(np.vstack([c, c[:1]]), axis=0).T); L = np.concatenate([[0], np.cumsum(seg)]); t = np.linspace(0, L[-1], int(L[-1]), endpoint=False)
    P = np.stack([np.interp(t, L, np.append(c[:, 0], c[0, 0])), np.interp(t, L, np.append(c[:, 1], c[0, 1]))], 1)
    P[:, 0] = ndi.gaussian_filter1d(P[:, 0], S_ARC, mode='wrap'); P[:, 1] = ndi.gaussian_filter1d(P[:, 1], S_ARC, mode='wrap')
    return P
# ---- Шнайдер ----
def bez(p0, p1, p2, p3, t):
    t = np.asarray(t)[:, None]; u = 1 - t
    return u**3 * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t**3 * p3
def bez_d(c, t):
    p0, p1, p2, p3 = c; t = np.asarray(t)[:, None]; u = 1 - t
    return 3 * u * u * (p1 - p0) + 6 * u * t * (p2 - p1) + 3 * t * t * (p3 - p2)
def bez_dd(c, t):
    p0, p1, p2, p3 = c; t = np.asarray(t)[:, None]; u = 1 - t
    return 6 * u * (p2 - 2 * p1 + p0) + 6 * t * (p3 - 2 * p2 + p1)
def unit(v): n = np.hypot(*v); return v / n if n > 1e-12 else v
def chord_u(P):
    d = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(P, axis=0).T))]); return d / d[-1]
def gen_bezier(P, u, t1, t2):
    p0, p3 = P[0], P[-1]; A1 = (3 * (1 - u) ** 2 * u)[:, None] * t1; A2 = (3 * (1 - u) * u ** 2)[:, None] * t2
    C = np.zeros((2, 2)); X = np.zeros(2)
    for i in range(len(P)):
        a1, a2 = A1[i], A2[i]; C[0, 0] += a1 @ a1; C[0, 1] += a1 @ a2; C[1, 0] = C[0, 1]; C[1, 1] += a2 @ a2
        tmp = P[i] - (p0 * ((1 - u[i]) ** 3 + 3 * (1 - u[i]) ** 2 * u[i]) + p3 * (3 * (1 - u[i]) * u[i] ** 2 + u[i] ** 3))
        X[0] += a1 @ tmp; X[1] += a2 @ tmp
    det = C[0, 0] * C[1, 1] - C[1, 0] * C[0, 1]
    if abs(det) > 1e-12: al1 = (X[0] * C[1, 1] - X[1] * C[0, 1]) / det; al2 = (C[0, 0] * X[1] - C[1, 0] * X[0]) / det
    else: al1 = al2 = 0
    seg = np.hypot(*(p3 - p0)); eps = 1e-6 * seg
    if al1 < eps or al2 < eps: al1 = al2 = seg / 3
    return [p0, p0 + t1 * al1, p3 + t2 * al2, p3]
def max_err(P, c, u):
    d = np.hypot(*(bez(*c, u) - P).T); i = int(np.argmax(d)); return d[i], i
def reparam(c, P, u):
    q = bez(*c, u); d1 = bez_d(c, u); d2 = bez_dd(c, u); num = ((q - P) * d1).sum(1); den = (d1 * d1).sum(1) + ((q - P) * d2).sum(1)
    return np.clip(np.where(np.abs(den) > 1e-12, u - num / den, u), 0, 1)
def fit_cubic(P, t1, t2, err):
    if len(P) == 2: dd = np.hypot(*(P[1] - P[0])) / 3; return [[P[0], P[0] + t1 * dd, P[1] + t2 * dd, P[1]]]
    u = chord_u(P); c = gen_bezier(P, u, t1, t2); e, sp = max_err(P, c, u)
    if e < err: return [c]
    if e < err * 6:
        for _ in range(20):
            u = reparam(c, P, u); c = gen_bezier(P, u, t1, t2); e, sp = max_err(P, c, u)
            if e < err: return [c]
    sp = min(max(sp, 1), len(P) - 2); tc = unit(P[sp - 1] - P[sp + 1])
    return fit_cubic(P[:sp + 1], t1, tc, err) + fit_cubic(P[sp:], -tc, t2, err)
def fit_closed(P, start_dir, err):
    """P — замкнутая плотная кривая; режем в самой глубокой точке под телом (start_dir — в тело), там стык не виден"""
    i0 = int(np.argmax(P @ start_dir)); Q = np.vstack([np.roll(P, -i0, axis=0), np.roll(P, -i0, axis=0)[:1]])
    return fit_cubic(Q, unit(Q[1] - Q[0]), unit(Q[-2] - Q[-1]), err)
out = []
for i, f in enumerate(fr):
    vis = largest(f['tail'] & ~bodyA)
    S2, d, tube, fc = tube_extend(vis | (f['tail'] & ndi.binary_dilation(bodyD, iterations=1) & ~bodyA), i)
    # усы: хвост не должен быть ближе WHISK_KEEP: срезаем зону усов и скругляем конец открытием; основание у тела не трогаем
    wd = ndi.distance_transform_edt(~whisk); near = (wd < WHISK_KEEP) & ~bodyA
    if (S2 & near).any():
        # хвост касается усов: поворачиваем кадр целиком вокруг корня на минимальный угол (кривизна и завиток сохраняются), пока зазор не станет WHISK_KEEP
        def rot(M, deg):
            t = np.deg2rad(deg); c, s_ = np.cos(t), np.sin(t); R = np.array([[c, s_], [-s_, c]])    # (row, col) координаты scipy
            ctr = np.array([fc[1], fc[0]]); off = ctr - R @ ctr
            return ndi.affine_transform(M.astype(float), R, offset=off, order=1) > 0.5
        best = None
        for deg in sorted(range(-24, 25), key=abs):
            if deg == 0: continue
            R2 = rot(S2, deg)
            if wd[R2 & ~bodyA].min() >= WHISK_KEEP: best = (deg, R2); break
        if best: S2 = largest(best[1] | (S2 & ndi.binary_dilation(tube, iterations=3) & ndi.binary_dilation(bodyA, iterations=2))); print('кадр', i + 1, 'усы: хвост повёрнут на', best[0], '° вокруг корня')
    S2 = largest(ndi.binary_opening(S2, structure=disk(6)))          # шипы и обрывки от гифки убираем открытием: вместе с трубой под телом форма толстая, торец у тела не страдает
    P = dense_contour(S2, OUTW / 2); segs = fit_closed(P, d, TOL)
    out.append({'segs': segs, 'S': S2, 'd': d, 'P': P})
    # проверка: IoU с утверждённым видимым хвостом
    mask = np.zeros((H * 4, W * 4), np.uint8); poly = np.vstack([bez(*c, np.linspace(0, 1, 30)) for c in segs])
    im = Image.new('L', (W * 4, H * 4), 0); ImageDraw.Draw(im).polygon([tuple(p * 4) for p in poly], fill=255)
    m = np.array(im.resize((W, H), Image.LANCZOS)) > 127; m = ndi.distance_transform_edt(~m) <= OUTW / 2; v1 = m & ~bodyA; v0 = largest(f['tail'] & ~bodyA)
    print(i + 1, 'безье-сегментов', len(segs), 'IoU видимого с утверждённым', round(float((v1 & v0).sum() / (v1 | v0).sum()), 3), 'мин. до усов', round(float(wd[v1].min()), 1))
pickle.dump(out, open('/tmp/pen.pkl', 'wb'))
