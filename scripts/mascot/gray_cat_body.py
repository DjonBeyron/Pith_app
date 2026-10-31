# Тело, лапы и хвост серой кошки по ЧИСТОМУ рисунку (source/gray_ref2.webp): линия там ровной толщины, поэтому обводка берётся с него как есть —
# сплошной тёмной областью (внешний контур минус «дырки» меха, even-odd), без дорисовок и склеек. Рисунок ложится на старый (gray_ref.webp) подобием:
# масштаб 0.85 вокруг стыка передних лап (по ним оба рисунка совпадают в 2–3%), а дальше — обычное преобразование F.
# Голову берём прежнюю (gray_cat_regions / gray_cat_details), здесь всё ниже подбородка.
import numpy as np, os
from PIL import Image, ImageDraw
from vec_trace import *

HERE = os.path.dirname(os.path.abspath(__file__))
EX = np.array(Image.open(f'{HERE}/source/gray_ref2.webp').convert('RGB')).astype(int); EH, EW, _ = EX.shape
ELUM = EX.mean(2); DARK = blur(ELUM, 1) < 75
KS, EA, OA = 0.85, (400.0, 1300.0), (517.0, 1205.0)          # масштаб, стык лап на чистом рисунке, он же на старом
def M(x, y): return OA[0] + KS * (x - EA[0]), OA[1] + KS * (y - EA[1])        # чистый рисунок → координаты старого

def _box(m, x0, y0, x1, y1): m[max(y0, 0):y1, max(x0, 0):x1] = True; return m
HAUNCH = [(960, 745), (1000, 761), (1040, 781), (1080, 792), (1120, 794), (1160, 789), (1200, 774), (1220, 763), (1240, 750), (1262, 742), (1433, 742)]   # (y, x) правый край бедра (центр обводки)

def tail_zone():
    """Правее бедра (с запасом 10 px, чтобы линия бедра осталась целой): здесь хвост"""
    ys = np.arange(EH); hx = np.interp(ys, [p[0] for p in HAUNCH], [p[1] for p in HAUNCH]) + 10
    z = np.arange(EW)[None, :] > hx[:, None]; z[:960] = np.arange(EW)[None, :] > 830; return z

def body_network(top=740):
    """Тёмные линии тела: без головы, подвески и хвоста. Сверху у шеи линии обрываются там, где их закрывает голова"""
    n = DARK.copy(); n[:top] = False
    n = n & ~_box(np.zeros_like(n), 222, 0, 626, 800) & ~_box(np.zeros_like(n), 380, 800, 480, 915) & ~tail_zone()
    return n

def silhouette_all():
    comps = components(DARK, 5000); big = max(comps, key=lambda m: m.sum()); return fill_holes(big)

def parts(f):
    """(заливка тела, обводка тела evenodd, мазки на лапах) — пути в координатах спрайта; f — преобразование (x, y) чистого рисунка → спрайт"""
    n = body_network()
    topy = np.nonzero(n[700:900].any(1))[0][0] + 700                                           # верхний срез линий шеи
    l_top = (float(np.nonzero(n[topy + 2, :400])[0].mean()), topy + 2); r_top = (float(np.nonzero(n[topy + 2, 400:])[0].mean()) + 400, topy + 2)
    top = Image.new('L', (EW, EH), 0); d = ImageDraw.Draw(top)
    d.line([l_top, (l_top[0] + 60, 640), (r_top[0] - 60, 640), r_top], fill=255, width=16, joint='curve')      # перемычка глубоко под головой (на экране скрыта)
    closed = n | (np.array(top) > 0); sil = fill_holes(closed)
    holes = [h for h in components(sil & ~closed, 300)]
    cont = lambda m: region_path(m, f, 1.1, 5, 60)
    outline = ' '.join([cont(sil)] + [cont(h) for h in holes])
    return cont(sil), outline, sil, holes

def tail_mask():
    """Хвост целиком (с обводкой), как заливка; центр обводки — эрозией на половину толщины (≈7 px)"""
    return silhouette_all() & tail_zone()

def tail_line():
    """Хвост: ось по скелету центра обводки (чистый рисунок), корень первым и продолженный под бедро; толщина между центрами обводки — медиана расстояния до края
    (эрозией). Возвращает (ось [(x, y)…], толщина в px чистого рисунка)"""
    m = morph(tail_mask(), 7, 'e'); line, _ = skeleton_line(m); line = smooth_open(line, 8)
    if line[0][0] > line[-1][0]: line = line[::-1]                                       # корень (левее) — в начале
    depth = np.zeros(len(line)); cur = m; pts = np.rint(line).astype(int)
    for k in range(2, 80, 2):
        cur = morph(cur, 2, 'e'); alive = cur[pts[:, 1], pts[:, 0]]; depth[alive] = k
    vis = depth[line[:, 0] > 850]; w = 2 * float(np.median(vis)) + 1
    root = np.array([(700, 1244), (740, 1236), (780, 1230), (820, 1227), (850, 1226)], float)      # у корня скелет уводит вниз (срез зоны хвоста), ось здесь — по середине между краями хвоста
    line = line[int(np.argmax(line[:, 0] >= 870)):]
    return np.vstack([root, line]), w

def toes(f):
    """Пальчики на лапах: светлее обводки, темнее меха — оси тонких пятен (линии постоянной толщины) → [(путь, цвет, толщина)]"""
    sil = silhouette_all(); inner = morph(sil, 14, 'e') & ~_box(np.zeros_like(sil), 0, 0, EW, 1262)
    m = (blur(ELUM, 2) < 97) & (blur(ELUM, 2) > 60) & inner
    m = morph(morph(m, 2, 'e'), 2, 'd'); res = []
    for c in components(m, 120):
        line, w = skeleton_line(c); line = smooth_open(line, 3)
        res.append((bezier_path(simplify_open(line, 0.8), False, 70, f, set()), '#%02x%02x%02x' % tuple(int(v) for v in EX[c].mean(0)), round(min(max(w * KS * 0.58, 2.6), 4.6), 1)))
    return res
