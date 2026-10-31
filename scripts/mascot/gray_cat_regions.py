# Серая кошка по эталонному рисунку (source/gray_ref.webp): силуэты и цветовые области → векторные пути в координатах спрайта Мии.
# Рисунок хранится в своих пикселях (1182×1330), в спрайт переводится преобразованием F (голова того же размера и на том же месте, что у Мии: нос в 296 347).
# Сами слои собирает build_gray_cat.py; здесь только «что где лежит на картинке».
import numpy as np, os, math
from PIL import ImageDraw
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
    mx = np.clip(2 * OX - 6 - np.arange(W), 0, W - 1); mm = mask[:, mx]            # правое ухо под бантиком — по симметрии с левым
    mask[55:250, 600:770] = mm[55:250, 600:770]; mask[:232, 430:600] = False; mask[232:300, 430:600] = True
    for x in range(418, 613):                                                   # верх головы между ушами — лёгкий купол (виден только у ушей, остальное под бантиком)
        top = 243 - int(20 * math.sin(math.pi * (x - 418) / 195) ** 0.7); mask[top:243, x] = True
    mask[130:200, :163] = False                                                 # колечко-серёжка вне силуэта
    mask |= closing(mask, 14) & box(100, 500, 900, 690)                          # усы поверх края щёк
    mask = fill_holes(closing(mask, 4))                                         # блики и зрачки
    return morph(opening(mask, 3), 7, 'e')

_sil = None
def contour():
    global _sil
    if _sil is None:
        _sil = outer_contour(silhouette())
        ys = _sil[:, 1]; edge = np.nonzero((_sil[:, 0] < 200) & (ys > 98) & (ys < 228))[0]      # левое ухо в месте колечка: край выпрямляется между ровными участками
        if len(edge):
            a, b = edge.min(), edge.max(); y0, y1 = 100, 226
            pa = _sil[a:b + 1]; xa = pa[np.argmin(np.abs(pa[:, 1] - y0)), 0]; xb = pa[np.argmin(np.abs(pa[:, 1] - y1)), 0]
            keep = [i for i in range(a, b + 1) if _sil[i, 1] <= y0 or _sil[i, 1] >= y1]
            line = np.array([(xa + (xb - xa) * (y - y0) / (y1 - y0) - 3.5 * 4 * ((y - y0) / (y1 - y0)) * (1 - (y - y0) / (y1 - y0)), y) for y in np.arange(y1, y0, -1.0)])
            lo = [i for i in keep if _sil[i, 1] >= y1]; hi = [i for i in keep if _sil[i, 1] <= y0]
            _sil = np.vstack([_sil[:a], _sil[lo[0]:lo[-1] + 1] if lo else _sil[:0], line, _sil[hi[0]:hi[-1] + 1] if hi else _sil[:0], _sil[b + 1:]])
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
NR = [(697, 727), (704, 737), (711, 748), (715, 760), (715, 772), (714, 782)]  # край шеи у подбородка (по рисунку; в силуэте здесь лишний «пенёк»)
NL = [(336, 725), (327, 733), (317, 745), (310, 755), (307, 765), (307, 776), (303, 783)]
def spline(pts, step=2.0):
    """Плавная линия через опорные точки (Catmull-Rom), густо — чтобы определитель углов не принимал изгиб за излом"""
    P = np.array(pts, float); out = []
    for i in range(len(P) - 1):
        p0, p1, p2, p3 = P[max(i - 1, 0)], P[i], P[i + 1], P[min(i + 2, len(P) - 1)]
        n = max(2, int(np.hypot(*(p2 - p1)) / step))
        for k in range(n):
            t = k / n; out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-1]); return np.array(out)
TAIL_THIN = 3                                                                 # хвост на 3 px (с каждой стороны) тоньше, чем на рисунке
def dense(pts, step=2.0):
    """Ломаная через опорные точки с шагом step (для замыкающих отрезков: сглаживанию нужны частые точки)"""
    P = np.array(pts, float); out = []
    for a, b in zip(P[:-1], P[1:]):
        n = max(1, int(np.hypot(*(b - a)) / step)); out += [a + (b - a) * k / n for k in range(n)]
    out.append(P[-1]); return np.array(out)
PAW_GAP = 4                                                                  # на сколько px рисунка раздвинуты передние лапки
def paw_arcs():
    """Нижний край передних лап: центры тёмной обводки по столбцам — две дуги, сходящиеся острым уголком между лапами (по x вниз к краю рисунка)"""
    dark = blur(LUM, 1) < 85; pts = []
    for x in range(424, 616, 3):
        ys = [y for y in range(1175, 1250) if dark[y, x]]
        if not ys: continue
        run = [ys[-1]]
        for y in reversed(ys[:-1]):
            if run[-1] - y > 1: break
            run.append(y)
        pts.append((x, (run[0] + run[-1]) / 2))
    P = np.array(pts, float); P = P[np.abs(P[:, 0] - 517) >= 9]
    L, Rt = P[P[:, 0] < 517], P[P[:, 0] > 517]
    L[:, 0] -= PAW_GAP; Rt[:, 0] += PAW_GAP                                      # лапки раздвинуты: обводки не слипаются
    apex = min(L[-1, 1], Rt[0, 1]) - 30                                          # между лапками неглубокая выемка до просвета (стебелёк от ног спускается в неё)
    notch = np.array([(L[-1, 0] + 3, L[-1, 1] - 12), (511, apex + 9), (517, apex), (523, apex + 9), (Rt[0, 0] - 3, Rt[0, 1] - 12)])
    return np.vstack([L, notch, Rt])
def thin(P, k, root_x=885, extra=6, step=9):
    """Контур, уменьшенный на k пикселей со всех сторон (хвост тоньше): заливка многоугольника → эрозия → внешняя граница.
    У корня (левее root_x) эрозия плавно растёт ещё на extra px — хвост сужается к телу, а не «утолщается» там, где выходит из-под бедра"""
    img = Image.new('L', (W, H), 0); ImageDraw.Draw(img).polygon([tuple(p) for p in P], fill=255); m = np.array(img) > 0
    out = morph(m, k, 'e')
    for d in range(1, extra + 1):
        x1 = root_x - (d - 1) * step; x0 = 0 if d == extra else root_x - d * step
        cols = np.zeros((H, W), bool); cols[:, x0:x1] = True; out = (out & ~cols) | (morph(m, k + d, 'e') & cols)
    return outer_contour(out)
def parts():
    S_ = contour(); iL, iR, iA, iB = at(S_, LN), at(S_, RN), at(S_, TS), at(S_, TE)
    jR, jL = at(S_, (717, 794)), at(S_, (300, 800))
    head = np.vstack([S_[iL:], S_[:iR + 1], chin_arc(RN[0] - 8, LN[0] + 10)])
    idx = [i for i in range(iB, jL + 1) if 424 < S_[i, 0] < 616 and S_[i, 1] > 1185]       # низ передних лап — по рисунку (острый уголок между лапами)
    bottom = S_[iB:jL + 1]
    if idx:
        a, b = idx[0] - iB, idx[-1] - iB
        bottom = np.vstack([bottom[:a], dense(paw_arcs()[::-1], 2.0), bottom[b + 1:]])
    body = np.vstack([spline(NR), S_[jR:iA], spline([(823, 1060), (820, 1078), (813, 1096), (803, 1118), (791, 1140)]), bottom, spline(NL[::-1]), dense([(336, 725), (352, 698), (680, 698), (697, 727)])[1:-1]])
    tail = np.vstack([S_[iA:iB + 1], dense([S_[iB], (775, 1140), (790, 1070), S_[iA]])[1:-1]])
    return head, body, thin(tail, TAIL_THIN)
def outline_path(P, f, eps=1.2, sm=8):
    Q, cs = smart_outline(P, eps, sm, 5, 28); return bezier_path(Q, True, 70, f, set(cs))

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
