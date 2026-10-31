# Векторизация по картинке (numpy + PIL, без OpenCV): маска → внешний контур → сглаживание → упрощение → гладкие кривые Безье.
# Общий инструмент для gray_cat_regions.py: из эталонного рисунка берутся силуэты и цветовые области, а не рисуются на глаз.
import numpy as np, re
from collections import deque

OFFS4 = [(0, 1), (1, 0), (0, -1), (-1, 0)]
OFFS8 = OFFS4 + [(1, 1), (1, -1), (-1, 1), (-1, -1)]

def shift(a, dy, dx):
    h, w = a.shape; b = np.zeros_like(a)
    b[max(dy, 0):h + min(dy, 0), max(dx, 0):w + min(dx, 0)] = a[max(-dy, 0):h + min(-dy, 0), max(-dx, 0):w + min(-dx, 0)]
    return b

def morph(a, n, op):
    """Эрозия ('e') / дилатация ('d') на n шагов: крест и квадрат по очереди — получается восьмиугольник, близкий к кругу"""
    for i in range(n):
        offs = OFFS8 if i % 2 else OFFS4; b = a.copy()
        for dy, dx in offs: b = (b & shift(a, dy, dx)) if op == 'e' else (b | shift(a, dy, dx))
        a = b
    return a

def blur(a, n):
    k = np.ones(2 * n + 1) / (2 * n + 1)
    a = np.apply_along_axis(lambda r: np.convolve(r, k, 'same'), 1, a)
    return np.apply_along_axis(lambda r: np.convolve(r, k, 'same'), 0, a)

def component(mask, seed):
    """Связная область маски, содержащая точку seed (x, y); если в seed пусто — ближайший пиксель маски в радиусе 12"""
    h, w = mask.shape; sx, sy = seed
    if not mask[sy, sx]:
        best = None
        for r in range(1, 13):
            ys, xs = np.nonzero(mask[max(sy - r, 0):sy + r + 1, max(sx - r, 0):sx + r + 1])
            if len(ys): sy, sx = max(sy - r, 0) + ys[0], max(sx - r, 0) + xs[0]; best = 1; break
        if not best: return np.zeros_like(mask)
    out = np.zeros_like(mask); q = deque([(sy, sx)]); out[sy, sx] = True
    while q:
        y, x = q.popleft()
        for dy, dx in OFFS8:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not out[ny, nx]: out[ny, nx] = True; q.append((ny, nx))
    return out

def components(mask, min_area=30):
    """Все связные области с площадью ≥ min_area (по возрастанию позиции сверху вниз), каждая — своей булевой маской"""
    rest = mask.copy(); res = []
    while True:
        ys, xs = np.nonzero(rest)
        if not len(ys): break
        c = component(rest, (xs[0], ys[0])); rest &= ~c
        if c.sum() >= min_area: res.append(c)
    return res

def fill_holes(mask):
    """Заливает дыры: фон, до которого нельзя дойти от края кадра, становится частью области"""
    h, w = mask.shape; ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = max(ys.min() - 2, 0), min(ys.max() + 3, h), max(xs.min() - 2, 0), min(xs.max() + 3, w)
    sub = ~mask[y0:y1, x0:x1]; hh, ww = sub.shape; seen = np.zeros_like(sub); q = deque()
    for x in range(ww):
        for y in (0, hh - 1):
            if sub[y, x] and not seen[y, x]: seen[y, x] = True; q.append((y, x))
    for y in range(hh):
        for x in (0, ww - 1):
            if sub[y, x] and not seen[y, x]: seen[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in OFFS4:
            ny, nx = y + dy, x + dx
            if 0 <= ny < hh and 0 <= nx < ww and sub[ny, nx] and not seen[ny, nx]: seen[ny, nx] = True; q.append((ny, nx))
    out = mask.copy(); out[y0:y1, x0:x1] = ~seen
    return out

def outer_contour(mask):
    """Внешняя граница области (Moore): ломаная [(x, y)…] по часовой стрелке, старт — самый верхний-левый пиксель"""
    h, w = mask.shape; ys, xs = np.nonzero(mask); i = np.lexsort((xs, ys))[0]; start = (ys[i], xs[i])
    nb = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]
    get = lambda y, x: 0 <= y < h and 0 <= x < w and mask[y, x]
    pts = [start]; cur = start; d = 6
    for _ in range(200000):
        for k in range(8):
            dd = (d + k) % 8; ny, nx = cur[0] + nb[dd][0], cur[1] + nb[dd][1]
            if get(ny, nx): cur = (ny, nx); d = (dd + 6) % 8; break
        else: break
        if cur == start and len(pts) > 2: break
        pts.append(cur)
    return np.array([(x, y) for y, x in pts], float)

def smooth_closed(P, n=4):
    """Скользящее среднее по замкнутой ломаной (убирает «лесенку» пикселей)"""
    N = len(P); idx = (np.arange(N)[:, None] + np.arange(-n, n + 1)[None, :]) % N
    return P[idx].mean(1)

def _dp(P, eps):
    if len(P) < 3: return [0, len(P) - 1]
    a, b = P[0], P[-1]; ab = b - a; L = np.hypot(*ab); v = P - a
    dist = np.abs(ab[0] * v[:, 1] - ab[1] * v[:, 0]) / L if L > 0 else np.hypot(v[:, 0], v[:, 1])
    j = int(np.argmax(dist))
    if dist[j] > eps: l = _dp(P[:j + 1], eps); r = _dp(P[j:], eps); return l[:-1] + [j + x for x in r]
    return [0, len(P) - 1]

def simplify_closed(P, eps):
    """Дуглас—Пекер для замкнутой ломаной: делим по самой дальней от старта точке"""
    h = int(np.argmax(np.hypot(*(P - P[0]).T)))
    l = _dp(P[:h + 1], eps); r = _dp(P[h:], eps)
    return P[l[:-1] + [h + x for x in r[:-1]]]

def simplify_open(P, eps): return P[_dp(P, eps)]

def bezier_path(Q, closed=True, corner_deg=70, f=lambda x, y: (x, y), corners=None):
    """Гладкая кривая через опорные точки (Catmull-Rom → кубические Безье). Вершины с поворотом острее corner_deg остаются углами.
    f — преобразование координат рисунка → координаты спрайта"""
    n = len(Q); P = [f(x, y) for x, y in Q]
    def corner(i):
        if corners is not None: return i in corners
        a, b, c = np.array(P[(i - 1) % n]), np.array(P[i]), np.array(P[(i + 1) % n])
        u, v = b - a, c - b
        if not np.hypot(*u) or not np.hypot(*v): return False
        cosang = (u @ v) / (np.hypot(*u) * np.hypot(*v)); return np.degrees(np.arccos(np.clip(cosang, -1, 1))) > corner_deg
    fmt = lambda p: '%g %g' % (round(p[0], 1), round(p[1], 1))
    d = 'M' + fmt(P[0]); last = n if closed else n - 1
    for i in range(last):
        p0, p1, p2, p3 = (np.array(P[(i + k) % n]) if closed or 0 <= i + k < n else np.array(P[min(max(i + k, 0), n - 1)]) for k in (-1, 0, 1, 2))
        c1 = p1 + ((p2 - p1) / 3 if corner(i % n) and closed else (p2 - p0) / 6)
        c2 = p2 - ((p2 - p1) / 3 if corner((i + 1) % n) and closed else (p3 - p1) / 6)
        d += 'C' + fmt(c1) + ' ' + fmt(c2) + ' ' + fmt(p2)
    return d + ('Z' if closed else '')

def region_path(mask, f, eps=1.6, sm=3, corner_deg=70, grow=0):
    """Путь по булевой маске: внешний контур (при grow > 0 область чуть расширяется — чтобы заходить под обводку)"""
    if grow: mask = morph(mask, grow, 'd')
    P = smooth_closed(outer_contour(fill_holes(mask)), sm)
    return bezier_path(simplify_closed(P, eps), True, corner_deg, f)

def find_corners(P, win=6, ang=55):
    """Острые углы замкнутой ломаной: места, где направление за ±win точек меняется больше чем на ang градусов (берётся локальный максимум)"""
    N = len(P); a = P - np.roll(P, win, 0); b = np.roll(P, -win, 0) - P
    cosang = (a * b).sum(1) / (np.hypot(*a.T) * np.hypot(*b.T) + 1e-9); turn = np.degrees(np.arccos(np.clip(cosang, -1, 1)))
    out = []
    for i in range(N):
        if turn[i] > ang and turn[i] == turn[[(i + k) % N for k in range(-win, win + 1)]].max(): out.append(i)
    return out

def smart_outline(P, eps=1.2, n=8, win=6, ang=55):
    """Сглаживание замкнутого контура с сохранением углов: ломаная режется в углах, каждый кусок сглаживается отдельно (концы на месте), потом упрощается.
    Возвращает (опорные точки, номера опорных точек-углов)"""
    P = smooth_closed(P, 2); cs = find_corners(P, win, ang)
    if not cs: Q = simplify_closed(smooth_closed(P, n), eps); return Q, []
    N = len(P); Q = []; corner_ids = []
    for k, c in enumerate(cs):
        e = cs[(k + 1) % len(cs)]; seg = np.array([P[(c + j) % N] for j in range(((e - c) % N or N) + 1)])
        sm = np.array([seg[max(j - min(n, j, len(seg) - 1 - j), 0):j + min(n, j, len(seg) - 1 - j) + 1].mean(0) for j in range(len(seg))])
        v = simplify_open(sm, eps); corner_ids.append(len(Q)); Q.extend(v[:-1].tolist())
    return np.array(Q), corner_ids

# ── преобразования готовых путей (абсолютные M L C Q H V Z) ──
def shift_path(d, dx, dy):
    """Сдвиг абсолютного пути (M L C Q H V Z) на dx dy: у M L C Q числа идут парами x y, у H только x, у V только y"""
    out = []; cmd = ''; k = 0
    for t in re.findall(r'[MLCQHVZ]|-?\d*\.?\d+', d):
        if t.isalpha(): cmd = t; k = 0; out.append(t); continue
        v = float(t) + (dx if cmd == 'H' or (cmd in 'MLCQ' and k % 2 == 0) else dy)
        out.append(f'{v:.1f}'); k += 1
    return ' '.join(out)
def scale_path(d, sx, sy, ox, oy):
    """Масштаб абсолютного пути вокруг точки (ox, oy)"""
    out = []; cmd = ''; k = 0
    for t in re.findall(r'[MLCQHVZ]|-?\d*\.?\d+', d):
        if t.isalpha(): cmd = t; k = 0; out.append(t); continue
        v = float(t); x_axis = cmd == 'H' or (cmd in 'MLCQ' and k % 2 == 0)
        v = ox + (v - ox) * sx if x_axis else oy + (v - oy) * sy
        out.append(f'{v:.1f}'); k += 1
    return ' '.join(out)
def map_pairs(d, fn):
    """Каждая пара (x, y) пути → fn(x, y); для путей из M / L / C / Q / Z (без H и V): поворот, сдвиг, любой аффинный перенос"""
    toks = re.findall(r'[MLCQZ]|-?\d*\.?\d+', d); out = []; nums = []
    for t in toks + ['Z']:
        if t.isalpha():
            for i in range(0, len(nums) - 1, 2): x, y = fn(nums[i], nums[i + 1]); out += [f'{x:.1f}', f'{y:.1f}']
            nums = []; out.append(t)
        else: nums.append(float(t))
    return ' '.join(out[:-1])
def rot_move(d, ang, cx, cy, dx=0.0, dy=0.0):
    """Поворот пути на ang градусов (по часовой на экране) вокруг (cx, cy) и сдвиг на (dx, dy)"""
    c, s = np.cos(np.radians(ang)), np.sin(np.radians(ang))
    return map_pairs(d, lambda x, y: (cx + (x - cx) * c - (y - cy) * s + dx, cy + (x - cx) * s + (y - cy) * c + dy))
