"""Векторный хвост Мии: силуэты кадров -> гладкие контуры, стык с телом, метки; превью и экспорт для игры.
Запуск из /home/user/Pith_app/_tail:  python3 -I /tmp/.../vec_tail.py"""
import json, pickle, numpy as np, sys
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi
import contourpy

al = json.load(open('align.json')); s = al['s']; ox = al['ox']; oy = al['oy']; W, H = 439, 390
FILL = (100, 103, 116); LINE = (38, 36, 50); MARK = (230, 232, 238)   # #646774, #262432, #e6e8ee
OUTW = 2.7                                                              # толщина контура, px гифки (как у старого хвоста: 9,8 нативных)

def place(path):
    im = Image.open(path).convert('RGBA'); w, h = int(im.width * s), int(im.height * s); im = im.resize((w, h), Image.LANCZOS)
    c = Image.new('RGBA', (W, H), (0, 0, 0, 0)); c.paste(im.crop((max(0, -ox), max(0, -oy), w, h)), (max(0, ox), max(0, oy))); return c
mia = place('mia_notail.png'); bodyA = np.array(mia)[:, :, 3] > 40; bodyD = ndi.binary_dilation(bodyA, iterations=4)
fin = pickle.load(open('tail_final.pkl', 'rb'))

def largest(m):
    lab, n = ndi.label(m, structure=np.ones((3, 3)))
    if n <= 1: return m
    sz = ndi.sum(m, lab, range(1, n + 1)); return lab == (1 + int(np.argmax(sz)))

def extrude(S):
    """Продлить основание хвоста в тело: торец (рядом с телом) тянем вдоль касательной, обрезаем телом+кольцом."""
    near = ndi.binary_dilation(bodyD, iterations=3); F = S & near
    if not F.any(): return S, None
    ys, xs = np.where(F); fc = np.array([xs.mean(), ys.mean()])
    yy, xx = np.where(S); d0 = np.hypot(xx - fc[0], yy - fc[1]); sel = (d0 > 10) & (d0 < 24)
    c2 = np.array([xx[sel].mean(), yy[sel].mean()]); d = fc - c2; d /= np.hypot(*d)
    ext = np.zeros_like(S)
    for t in np.arange(0, 34, 0.5):
        ext |= ndi.shift(F.astype(float), (d[1] * t, d[0] * t), order=0) > 0.5
    ext = ndi.binary_dilation(ext, iterations=1) & bodyD
    return S | ext, d

def smooth_level(S, inset):
    dist = ndi.distance_transform_edt(np.pad(S, 3))[3:-3, 3:-3]; dist = ndi.gaussian_filter(dist, 1.3)
    return dist, inset + 0.5

def contours(field, level, minlen=8):
    gen = contourpy.contour_generator(z=field.astype(float)); out = []
    for ln in gen.lines(level):
        if len(ln) >= minlen: out.append(ln)
    return out

def rdp(pts, eps):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]; ab = b - a; n = np.hypot(*ab)
    d = np.abs(ab[0] * (pts - a)[:, 1] - ab[1] * (pts - a)[:, 0]) / n if n > 1e-9 else np.hypot(*(pts - a).T)
    k = int(np.argmax(d))
    if d[k] > eps: return np.vstack([rdp(pts[:k + 1], eps)[:-1], rdp(pts[k:], eps)])
    return np.vstack([a, b])

def simplify_closed(p, eps):
    if np.allclose(p[0], p[-1]): p = p[:-1]
    i = int(np.argmax(p[:, 0])); q = np.vstack([p[i:], p[:i], p[i:i + 1]])  # старт с крайней точки
    h = len(q) // 2; a = rdp(q[:h + 1], eps); b = rdp(q[h:], eps)
    r = np.vstack([a[:-1], b]); return r[:-1]

def bez_closed(P, tension=0.5):
    """Catmull-Rom -> кубические безье (замкнутая): список (p0,c1,c2,p1)"""
    n = len(P); segs = []
    for i in range(n):
        p0, p1, p2, p3 = P[(i - 1) % n], P[i], P[(i + 1) % n], P[(i + 2) % n]
        segs.append((p1, p1 + (p2 - p0) * tension / 3 * 1.0, p2 - (p3 - p1) * tension / 3 * 1.0, p2))
    return segs

def sample(segs, per=14):
    out = []
    for p0, c1, c2, p1 in segs:
        for t in np.linspace(0, 1, per, endpoint=False):
            u = 1 - t; out.append(u**3 * p0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t**3 * p1)
    return np.array(out)

def taper(poly, w0=1.9):
    """Тонкая линия-дуга по ломаной: сужается к концам; возвращает замкнутый многоугольник"""
    poly = np.asarray(poly, float)
    # сгладить и пересэмплировать
    seg = np.hypot(*np.diff(poly, axis=0).T); L = np.concatenate([[0], np.cumsum(seg)]); t = np.linspace(0, L[-1], 40)
    x = np.interp(t, L, poly[:, 0]); y = np.interp(t, L, poly[:, 1]); x = ndi.gaussian_filter1d(x, 2, mode='nearest'); y = ndi.gaussian_filter1d(y, 2, mode='nearest')
    P = np.stack([x, y], 1); tg = np.gradient(P, axis=0); tg /= np.hypot(*tg.T)[:, None]; nm = np.stack([-tg[:, 1], tg[:, 0]], 1)
    u = np.linspace(0, 1, len(P)); w = w0 * np.clip(np.sin(np.pi * u) ** 0.5, 0.18, 1) / 2
    left = P + nm * w[:, None]; right = P - nm * w[:, None]
    return np.vstack([left, right[::-1]])

# --- красные линии владельца для кадра 4 (из скрина, переведены в px гифки) ---
RED4 = [
    [(89.0, 176.8), (93.0, 180.4), (95.7, 184.0), (96.9, 187.6), (97.2, 191.3), (96.9, 194.9), (95.7, 198.5), (93.9, 202.1), (92.1, 205.7), (90.3, 209.4)],
    [(103.2, 181.0), (102.6, 184.6), (102.6, 188.2), (102.3, 191.9), (101.7, 195.5), (100.8, 199.1), (99.6, 202.7), (98.1, 206.3), (95.7, 210.0), (93.3, 213.6), (89.7, 217.2)],
]
RED4 = [[(x - 7.0, y) for x, y in line] for line in RED4]   # v3.3.292: чуть левее — кончик кадра 4 сдвинут от головы, дуги не должны касаться хвоста

def lines5(S):
    """Кадр 5: две тонкие дуги слева от хвоста, параллельно его внешнему краю (как у кадра 4)"""
    edge = {y: np.where(S[y])[0].min() for y in range(190, 250) if S[y].any()}
    ys = np.array(sorted(edge)); xs = ndi.gaussian_filter1d(np.array([edge[y] for y in ys], float), 3, mode='nearest')
    out = []
    for off, a, b in ((11.0, 197, 238), (18.0, 204, 243)):
        yy = np.arange(a, b + 1, 2.0); out.append(np.stack([np.interp(yy, ys, xs) - off, yy], 1))
    return out

def build():
    frames = []
    for i, (t, m) in enumerate(fin):
        S = largest(ndi.binary_fill_holes(t[..., 3] > 128)); S, d = extrude(S)
        S = ndi.binary_closing(S, iterations=2) | S
        dist, lvl = smooth_level(S, OUTW / 2)
        cs = contours(dist, lvl); cs.sort(key=lambda c: -len(c)); tail = cs[0]
        P = simplify_closed(tail, 0.45); segs = bez_closed(P)
        # метки
        ma = ndi.gaussian_filter(m[..., 3].astype(float) / 255, 0.6); polys = []
        if m[..., 3].max() > 20:
            lab, n = ndi.label(m[..., 3] > 40, structure=np.ones((3, 3)))
            for k in range(1, n + 1):
                comp = lab == k
                if comp.sum() < 12: continue
                ys, xs = np.where(comp)
                if i == 3 and ys.mean() > 165: continue          # кадр 4: старые дуги заменены линиями владельца
                f = ma * ndi.binary_dilation(comp, iterations=2)
                for c in contours(f, 0.3, 5):
                    polys.append(simplify_closed(c, 0.35) if np.allclose(c[0], c[-1]) else c)
        frames.append(dict(segs=segs, tail=S, polys=polys, d=d))
    return frames

def mid_frame5(frames):
    """Кадр 5: две тонкие дуги рядом с изгибом хвоста (по той же идее, что у кадра 4) — рассчитываются от силуэта"""
    return frames

if __name__ == '__main__':
    fr = build(); pickle.dump(fr, open('/tmp/vec_frames.pkl', 'wb'))
    for i, f in enumerate(fr): print(i + 1, 'узлов', len(f['segs']), 'меток', len(f['polys']), 'dir', None if f['d'] is None else np.round(f['d'], 2))
