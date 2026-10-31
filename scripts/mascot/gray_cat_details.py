# Детали серой кошки с эталонного рисунка: глаза, мордочка, уши, усы, бантик, ошейник, тени тела. Каждая функция возвращает список (путь, цвет) в координатах спрайта.
# Области берутся по цвету (классы — gray_cat_regions.classes()), контуры строит vec_trace.
import numpy as np, math
from gray_cat_regions import *

def paths(masks, f=F, eps=1.4, sm=2, grow=0, col=None):
    """Список масок → [(d, цвет)]; цвет — средний по области, если не задан"""
    return [(region_path(m, f, eps, sm, 70, grow), col or color(m)) for m in masks]
def big(masks, n=1): return sorted(masks, key=lambda m: -m.sum())[:n]

# ── глаза: тёмный силуэт (обводка), янтарная радужка (два тона), зрачок-щель, блики ──
EYE_BOX = {'l': (240, 425, 448, 592), 'r': (586, 425, 792, 592)}
_eyes = {}
def eye_masks(side):
    """Области глаза на рисунке: силуэт с ободком, янтарная радужка, светлая середина, зрачок, блики (считаются один раз на глаз)"""
    if side in _eyes: return _eyes[side]
    c = classes(); x0, y0, x1, y1 = EYE_BOX[side]; bx = box(x0, y0, x1, y1)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2 + 8
    union = fill_holes(component(bx & (c['dark'] | c['amber'] | (LUM > 190)), (cx, cy)))
    amber = fill_holes(component(bx & c['amber'], (cx - 40, cy + 30)))
    core = morph(amber, 22, 'e')
    pup = component(bx & c['dark'] & amber & morph(amber, 3, 'e'), (cx, cy))
    ys, xs = np.nonzero(amber)
    _eyes[side] = dict(union=union, amber=amber, core=core, pup=pup, hl=components(bx & (LUM > 205) & amber, 20), box=(xs.min(), xs.max(), ys.min(), ys.max()),
                       edge=hexc(im[amber & ~core & c['amber']].mean(0)), mid=hexc(im[core & c['amber']].mean(0)), dark=color(union & c['dark'], 0))
    return _eyes[side]

def warp_rows(m, yc, s_top, s_bot):
    """Вертикальное сжатие маски к линии уголков глаза yc: выше линии — в s_top раз (по столбцам), ниже — в s_bot раз. Так прикрывается настоящий глаз:
    верхнее веко опускается, нижнее чуть поднимается, а уголки остаются на месте"""
    yy = np.arange(H)[:, None].astype(float); s = np.where(yy < yc, s_top[None, :], s_bot[None, :])
    src = yc + (yy - yc) / s; ok = (src >= 0) & (src <= H - 1)
    return m[np.clip(np.rint(src).astype(int), 0, H - 1), np.arange(W)[None, :]] & ok

RING_LOW, RING_TOP_W = 7, 12                                       # толщина ободка глаза (px рисунка): низ и бока / верхняя «подводка»
def eye_ring(lens, yc):
    """Ободок вокруг видимой части глаза: везде RING_LOW, а выше линии уголков плавно толще до RING_TOP_W. Строится вокруг формы глаза, поэтому толщина
    не меняется, когда глаз сужается веком"""
    ys, xs = np.nonzero(lens); y0, y1, x0, x1 = ys.min() - 20, ys.max() + 21, xs.min() - 20, xs.max() + 21
    sub = lens[y0:y1, x0:x1]; yy = np.arange(y1 - y0)[:, None]; ring = morph(sub, RING_LOW, 'd')
    for k in range(RING_LOW + 1, RING_TOP_W + 1): ring |= morph(sub, k, 'd') & (yy < (yc - y0) - (k - RING_LOW) * 5)
    out = np.zeros_like(lens); out[y0:y1, x0:x1] = ring; return out

def eye(side, lid=0.0, gaze=(0, 0), slant=0.0):
    """Глаз в состоянии. lid — какая доля верхней половины глаза закрыта веком (0 — открыт, 1 — закрыт: щель по линии уголков); slant — скос века (>0: к носу веко ниже,
    сердитый прищур); gaze — сдвиг зрачка и светлой середины (px рисунка).
    Как закрываются глаза у животных: верхнее веко идёт сверху вниз, нижнее чуть поднимается, уголки неподвижны, видимая часть остаётся «линзой» (дугой вверх),
    а радужка и зрачок не сплющиваются — их просто закрывает веко. Форма глаза сжимается к линии уголков, содержимое обрезается по ней, а ободок (eye_ring) строится
    вокруг получившейся формы с той же толщиной, что у открытого глаза"""
    M = eye_masks(side); gx, gy = int(round(gaze[0])), int(round(gaze[1])); amber, hls = M['amber'], M['hl']
    ys, xs = np.nonzero(M['union']); xl, xr = xs.min(), xs.max()
    yc = (ys[xs <= xl + 3].mean() + ys[xs >= xr - 3].mean()) / 2                               # линия уголков глаза
    if lid > 0:
        cx, hw = (xl + xr) / 2, (xr - xl) / 2; inner = 1 if side == 'l' else -1               # у левого глаза к носу — вправо
        w = np.clip((np.arange(W) - cx) / hw * inner, -1, 1)
        s_top = np.clip(1 - lid - slant * w, 0.04, 1.0); s_bot = np.full(W, 1 - 0.35 * lid)
        amber = warp_rows(amber, yc, s_top, s_bot); hls = [m & amber for m in hls]
    union = eye_ring(fill_holes(amber), yc)
    mv = lambda m, k=1.0: shift(shift(m, int(round(gy * k)), 0), 0, int(round(gx * k))) & amber
    pup = mv(M['pup']); core = mv(M['core'], 0.7); px, py = centroid(M['pup'])
    return dict(sil=(region_path(union, F, 1.0, 6), M['dark']), amber=(region_path(amber, F, 1.0, 6), M['edge']),
                core=(region_path(core, F, 1.0, 8), M['mid']), pupil=(region_path(pup, F, 0.8, 2), '#1e1c22'),
                hl=[(region_path(m, F, 0.6, 1), '#ffffff') for m in hls if m.sum() > 8], pc=F(px + gx, py + gy), lid=None)

# ── мордочка: светлая зона от переносицы к носу и подбородку, щёки ──
def face_light():
    c = classes(); m = opening(c['light'] & box(250, 430, 780, 745), 3)
    m = closing(m, 16) & ~box(0, 0, W, 430)
    return [(region_path(x, F, 1.2, 4), color(x)) for x in components(m, 1500)]
def nose():
    m = (np.abs(im - np.array([77, 62, 72])).sum(2) < 60) & box(470, 548, 565, 612)
    n = big(components(m, 80))[0]
    P = lambda x, y: '%.1f %.1f' % F(x, y)       # скруглённый треугольник: широкий верх, мягкий кончик
    d = f'M{P(497, 567)}C{P(495, 559)} {P(503, 559)} {P(510, 560)}L{P(527, 560)}C{P(536, 559)} {P(541, 563)} {P(538, 569)}C{P(534, 577)} {P(526, 584)} {P(518, 590)}C{P(510, 584)} {P(500, 577)} {P(497, 567)}Z'
    return d, color(n, 1)
def mouth_closed():
    """Закрытый рот по рисунку: короткая ножка от носа и две дуги (мордочка «:3»)"""
    P = lambda x, y: '%.1f %.1f' % F(x, y)
    return (f'M{P(521, 592)}L{P(521, 607)}C{P(518, 622)} {P(506, 630)} {P(490, 629)}C{P(476, 628)} {P(468, 616)} {P(468, 602)}'
            f'M{P(521, 607)}C{P(524, 622)} {P(536, 630)} {P(547, 629)}C{P(560, 628)} {P(568, 617)} {P(567, 605)}')

# ── уши: внутренность и тёмные «волоски» ──
def ear_inner():
    m = opening(classes()['rose'] & box(150, 60, 900, 420), 6)
    return [(region_path(x, F, 1.2, 4, 70, 3), color(x)) for x in components(m, 3000)]
def ear_lines():
    c = classes(); res = []
    for x0, x1 in ((180, 390), (650, 860)):
        m = opening(c['shade'] & box(x0, 90, x1, 300), 2)
        res += [(region_path(x, F, 0.8, 2), color(x, 1)) for x in components(m, 60)]
    return res
def line_path(m):
    """Тонкая линия по маске: ось (открытая кривая) + цвет + толщина в единицах спрайта — рисуется обводкой постоянной толщины со скруглёнными концами"""
    line, w = skeleton_line(m); line = smooth_open(line, 3)
    return bezier_path(simplify_open(line, 0.6), False, 70, F, set()), color(m, 1), round(min(max(w * S, 2.8), 4.6), 1)
def brow_hairs():
    c = classes(); res = []
    for x0, x1 in ((220, 420), (610, 810)):
        m = (blur(LUM, 1) > 128) & (B > R + 8) & box(x0, 335, x1, 425)
        res += [line_path(x) for x in components(m, 70)]
    return res

# ── усы: четыре светлых штриха; у левых корень справа, у правых слева (так их качает scene-v2-pit.css) ──
def whiskers():
    m = classes()['whisk'] & ~opening(silhouette(), 1) | (classes()['whisk'] & box(150, 500, 300, 690)) | (classes()['whisk'] & box(730, 500, 880, 690))
    res = []
    for x in components(m & box(60, 500, 1000, 700), 120):
        cx, cy = centroid(x); side = 'l' if cx < OX else 'r'
        res.append((cy, side) + line_path(x))
    out = []
    for side in 'lr':
        s = sorted([r for r in res if r[1] == side])
        for k, r in enumerate(s): out.append((side, 'u' if k == 0 else 'd', r[2], r[3], round(r[4] * 0.5, 1)))      # усы вдвое тоньше волосков
    return out

# ── серёжки: колечко и звёздочки (по рисунку) ──
def star(cx, cy, r, ol, fill):
    P = [F(cx + (r if i % 2 == 0 else r * 0.6) * math.cos(math.radians(-90 + i * 36)), cy + (r if i % 2 == 0 else r * 0.6) * math.sin(math.radians(-90 + i * 36))) for i in range(10)]
    d = 'M' + 'L'.join('%.1f %.1f' % p for p in P) + 'Z'
    return (f'<path d="{d}" fill="{fill}" stroke="{ol}" stroke-width="3.2" stroke-linejoin="round"/>'
            f'<ellipse cx="{F(cx - r * .3, cy - r * .25)[0]:.1f}" cy="{F(cx - r * .3, cy - r * .25)[1]:.1f}" rx="2.4" ry="3.2" fill="#ffffff" opacity=".9"/>')
# Ось колечка (пиксели рисунка, снята скелетом белой трубки): от правого конца в ухе поверх края, вокруг левой петли и назад — нижний конец уходит за ухо.
# Колечко — две линии постоянной толщины (тёмный ободок и белая трубка), поэтому толщина везде одна и та же. Толщины: трубка 8.5 px, ободок 15.5 px рисунка
RING_AXIS = [(209, 167), (206, 166), (202, 163), (196, 161), (190, 160), (184, 159), (178, 159), (172, 159), (166, 161), (160, 162), (154, 165), (150, 168),
             (148, 173), (151, 178), (156, 181), (162, 184), (168, 185.5), (178, 186.5)]
RING_W, RING_O = 8.5 * S, 15.5 * S
def ring_paths():
    """(верх: ободок, трубка), (всё колечко) — путь по оси. Верх лежит поверх головы (ободок с x ≥ 166, трубка с x ≥ 160), всё колечко — под головой"""
    P = spline(RING_AXIS, 1.5)
    stop = next(i for i, p in enumerate(P) if p[0] < 160); top = P[:stop]
    cut = next(i for i, p in enumerate(P) if p[0] < 166)
    op = lambda Q: bezier_path(simplify_open(Q, 0.5), False, 70, F, set())
    return (op(P[:cut]), op(top)), op(P)

# ── розовое: бантик, ошейник, сердечко (обводка тёмно-малиновая, заливка розовая) ──
def pink_parts():
    c = classes(); warm = c['warm']; comps = components(warm, 400); res = {}
    for m in comps:
        cx, cy = centroid(m)
        if cy < 330: res['bow'] = m
        else: res['collar'] = m & ~box(470, 803, 585, 920)        # кулон рисуется отдельно (сердечко), у ошейника его выступ срезан
    return res
def pink(m, hi=False):
    """Силуэт области + заливка: путь по центру обводки (эрозия на её полутолщину), цвет заливки — самый частый розовый"""
    sil = fill_holes(m); core = morph(sil, 6, 'e')
    fill = hexc(im[m & morph(sil, 12, 'e')].mean(0)) if (m & morph(sil, 12, 'e')).sum() > 50 else '#ee5186'
    return region_path(core, F, 1.6, 7), fill
def pink_details(m):
    """Блики и складки внутри розовой области: светлые (G > 125) и тёмные (lum < 100) пятна"""
    sil = fill_holes(m); inner = morph(sil, 11, 'e'); res = []
    light = opening(inner & (G > 120) & (R > 235), 1)
    for x in components(light, 40): res.append((region_path(x, F, 0.8, 2), color(x, 1)))
    dk = opening(inner & (G < 70), 1)
    for x in components(dk, 200):
        cx, cy = centroid(x)
        if abs(cx - 635) > 45 or abs(cy - 212) > 45: res.append((region_path(fill_holes(x), F, 1.0, 4), color(x, 1)))
    return res

def heart(cx, cy, w, h, f=F):
    """Сердечко (кулон) по центру обводки: cx cy — центр, w h — размеры в пикселях рисунка"""
    P = lambda dx, dy: '%.1f %.1f' % f(cx + dx * w, cy + dy * h)
    return (f'M{P(0, .5)}C{P(-.1, .38)} {P(-.5, .2)} {P(-.5, -.12)}C{P(-.5, -.42)} {P(-.16, -.5)} {P(0, -.24)}'
            f'C{P(.16, -.5)} {P(.5, -.42)} {P(.5, -.12)}C{P(.5, .2)} {P(.1, .38)} {P(0, .5)}Z')

def edge_blobs():
    """Бугорки шерсти у основания ушей на прежнем рисунке (обводка там толще и ломаная): точная тёмная область поверх обводки головы"""
    res = []
    for x0, y0, x1, y1 in ((148, 362, 250, 460), (782, 362, 886, 460)):
        dark = blur(LUM, 1) < 85
        for m in components(dark & box(x0, y0, x1, y1), 200): res.append(region_path(m, F, 1.0, 2, 40))
    return res
