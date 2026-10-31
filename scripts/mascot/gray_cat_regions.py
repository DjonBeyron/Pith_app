# Серая кошка по эталонному рисунку (source/gray_ref.webp): силуэты и цветовые области → векторные пути в координатах спрайта Мии.
# Рисунок хранится в своих пикселях (1182×1330), в спрайт переводится преобразованием F (голова того же размера и на том же месте, что у Мии: нос в 296 347).
# Сами слои собирает build_gray_cat.py; здесь только «что где лежит на картинке».
import numpy as np, os, math
from PIL import Image
from vec_trace import *

HERE = os.path.dirname(os.path.abspath(__file__))
S, OX, OY = 0.58, 515, 13.5                       # масштаб, ось симметрии рисунка, сдвиг по y
F = lambda x, y: (296 + (x - OX) * S, y * S + OY)
TB = (805, 1112)                                  # основание хвоста на рисунке (хвост качается вокруг него)
TBX, TBY = F(*TB)
FT = lambda x, y: (F(x, y)[0] - TBX, F(x, y)[1] - TBY)

im = np.array(Image.open(f'{HERE}/source/gray_ref.webp').convert('RGB')).astype(int)
H, W, _ = im.shape
R, G, B = im[:, :, 0], im[:, :, 1], im[:, :, 2]
LUM = im.mean(2); BL = blur(LUM, 3)
BG = np.array([245, 243, 239]); FUR = np.array([100, 103, 117])
hexc = lambda c: '#%02x%02x%02x' % tuple(int(v) for v in c)
def color(mask, er=3):
    """Средний цвет области (по её внутренности, без размытых краёв)"""
    m = morph(mask, er, 'e'); m = m if m.sum() > 20 else mask
    return hexc(im[m].mean(0))
def box(x0, y0, x1, y1):
    m = np.zeros((H, W), bool); m[y0:y1, x0:x1] = True; return m
def opening(m, n): return morph(morph(m, n, 'e'), n, 'd')
def closing(m, n): return morph(morph(m, n, 'd'), n, 'e')
def centroid(m): ys, xs = np.nonzero(m); return xs.mean(), ys.mean()

# ── силуэт (центр линии обводки) ──
def silhouette():
    mask = (np.abs(im - BG).sum(2) > 130) & ~((R - G > 55) & (R > 150))        # без бантика и ошейника: розовое — не силуэт
    mx = np.clip(2 * OX - np.arange(W), 0, W - 1); mm = mask[:, mx]            # правое ухо под бантиком — по симметрии с левым
    mask[110:250, 600:745] = mm[110:250, 600:745]; mask[:232, 430:600] = False; mask[232:300, 430:600] = True
    for x in range(418, 613):                                                   # верх головы между ушами — лёгкий купол (виден только у ушей, остальное под бантиком)
        top = 243 - int(20 * math.sin(math.pi * (x - 418) / 195) ** 0.7); mask[top:243, x] = True
    mask[130:200, :163] = False                                                 # колечко-серёжка вне силуэта
    mask = fill_holes(closing(mask, 7))                                         # усы и блики поверх морды
    return morph(opening(mask, 5), 7, 'e')

_sil = None
def contour():
    global _sil
    if _sil is None: _sil = smooth_closed(outer_contour(silhouette()), 4)
    return _sil
def at(S_, p): return int(np.argmin(np.hypot(*(S_ - np.array(p)).T)))

def chin_arc(x_from, x_to, step=8):
    """Нижний край головы (обводка подбородка) — центры тёмных полос по столбцам; по ним голова замыкается внизу"""
    dark = blur(LUM, 1) < 75; pts = []
    for x in range(x_from, x_to, -step if x_from > x_to else step):
        run = None
        for y in range(675, 800):
            if dark[y, x] and dark[y + 1:y + 9, x].all(): run = y; break
        if run is None: continue
        end = run
        while dark[end + 1, x]: end += 1
        pts.append((x, (run + end) / 2))
    return np.array(pts, float)

LN, RN = (329, 718), (700, 721)                                                # места, где шея выходит из-под головы
TS, TE = (826, 1062), (795, 1173)                                              # где хвост выходит из-под тела / уходит под него
def parts():
    S_ = contour(); iL, iR, iA, iB = at(S_, LN), at(S_, RN), at(S_, TS), at(S_, TE)
    head = np.vstack([S_[iL:], S_[:iR + 1], chin_arc(RN[0] - 8, LN[0] + 10)])
    body = np.vstack([S_[iR:iA], [(822, 1100), (812, 1140)], S_[iB:iL + 1], [(LN[0], LN[1] - 20), (RN[0], RN[1] - 20)]])
    tail = np.vstack([S_[iA:iB + 1], [(775, 1140), (790, 1070)]])
    return head, body, tail
def outline_path(P, f, eps=1.8, sm=10): return bezier_path(simplify_closed(smooth_closed(P, sm), eps), True, 70, f)

# ── цветовые классы ──
def cls():
    b = blur(LUM, 4); bb = blur(B.astype(float) - R, 4)
    return dict(
        light=(b > 112.5) & (b < 128) & (bb > 8), shade=(b > 85) & (b < 99) & (bb > 6),
        rose=(R > B + 18) & (R > 110) & (R < 175) & (G < 135), dark=blur(LUM, 1) < 66,
        warm=(R - G > 45) & (R > 120), amber=(R > 150) & (R - B > 55) & (G > 120),
        whisk=(blur(LUM, 1) > 170) & (blur(LUM, 1) < 236) & (B > R + 5))
C = None
def classes():
    global C
    if C is None: C = cls()
    return C
inside_cat = lambda er=9: morph(silhouette(), er - 7, 'e')
