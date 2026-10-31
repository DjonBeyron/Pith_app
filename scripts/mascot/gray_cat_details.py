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
def eye(side):
    c = classes(); x0, y0, x1, y1 = EYE_BOX[side]; bx = box(x0, y0, x1, y1)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2 + 8
    union = fill_holes(component(bx & (c['dark'] | c['amber'] | (LUM > 190)), (cx, cy)))
    amber = fill_holes(component(bx & c['amber'], (cx - 40, cy + 30)))
    core = morph(amber, 22, 'e')
    pup = component(bx & c['dark'] & amber & morph(amber, 3, 'e'), (cx, cy))
    hl = [m for m in components(bx & (LUM > 205) & amber, 20)]
    px, py = centroid(pup)
    edge = hexc(im[amber & ~morph(amber, 22, 'e') & c['amber']].mean(0)); mid = hexc(im[core & c['amber']].mean(0))
    out = dict(sil=(region_path(union, F, 1.0, 6), color(union & c['dark'], 0)), amber=(region_path(amber, F, 1.0, 6), edge),
               core=(region_path(core, F, 1.0, 8), mid), pupil=(region_path(pup, F, 0.8, 2), '#1e1c22'),
               hl=[(region_path(m, F, 0.6, 1), '#ffffff') for m in hl], pc=F(px, py))
    return out

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
def brow_hairs():
    c = classes(); res = []
    for x0, x1 in ((220, 420), (610, 810)):
        m = (blur(LUM, 1) > 128) & (B > R + 8) & box(x0, 335, x1, 425)
        res += [(region_path(x, F, 0.8, 2), color(x, 1)) for x in components(m, 70)]
    return res

# ── усы: четыре светлых штриха; у левых корень справа, у правых слева (так их качает scene-v2-pit.css) ──
def whiskers():
    m = classes()['whisk'] & ~opening(silhouette(), 1) | (classes()['whisk'] & box(150, 500, 300, 690)) | (classes()['whisk'] & box(730, 500, 880, 690))
    res = []
    for x in components(m & box(60, 500, 1000, 700), 120):
        cx, cy = centroid(x); side = 'l' if cx < OX else 'r'
        res.append((cy, side, region_path(x, F, 0.7, 2, 70), color(x, 1)))
    out = []
    for side in 'lr':
        s = sorted([r for r in res if r[1] == side])
        for k, r in enumerate(s): out.append((side, 'u' if k == 0 else 'd', r[2], r[3]))
    return out

# ── серёжки: колечко и звёздочки (по рисунку) ──
def star(cx, cy, r, ol, fill):
    P = [F(cx + (r if i % 2 == 0 else r * 0.6) * math.cos(math.radians(-90 + i * 36)), cy + (r if i % 2 == 0 else r * 0.6) * math.sin(math.radians(-90 + i * 36))) for i in range(10)]
    d = 'M' + 'L'.join('%.1f %.1f' % p for p in P) + 'Z'
    return (f'<path d="{d}" fill="{fill}" stroke="{ol}" stroke-width="3.2" stroke-linejoin="round"/>'
            f'<ellipse cx="{F(cx - r * .3, cy - r * .25)[0]:.1f}" cy="{F(cx - r * .3, cy - r * .25)[1]:.1f}" rx="2.4" ry="3.2" fill="#ffffff" opacity=".9"/>')
def ring():
    """Колечко в левом ухе: белая трубка + тёмный ободок, как на рисунке. Верхний отрезок трубки лежит поверх края уха, нижний уходит ЗА ухо.
    Поэтому возвращается две части: верх (только то, что над ухом, x ≥ 162 и выше нижнего отрезка — рисуется поверх головы) и всё колечко целиком (под головой: край и заливка уха закрывают то, что за ухом)"""
    bx = box(105, 115, 300, 205); bright = (LUM > 190) & bx
    tube = [c for c in components(bright, 60) if not (c[115, :].any() or c[204, :].any() or c[:, 105].any() or c[:, 299].any())]
    whole = np.zeros((H, W), bool)
    for c in tube: whole |= c
    low = whole & box(0, 172, W, H)
    for k in range(1, 11): whole |= shift(low, 0, k)               # нижний отрезок продолжается под обводку уха — его конец прячется за ухом, без «колпачка»
    outl = morph(whole, 3, 'd'); cut = 170
    part = lambda ro, rw: (region_path(outl & ro, F, 0.8, 3), region_path(whole & rw, F, 0.6, 2))
    return part(box(166, 0, W, cut + 3), box(160, 0, W, cut + 3)), part(box(0, 0, W, H), box(0, 0, W, H))   # белая трубка начинается левее ободка — на стыке слоёв нет тёмной черты

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

# ── тело: тени бёдер, пальчики, внутренние тёмные линии (ноги, лапы) ──
def body_shade():
    c = classes(); m = opening(c['shade'] & morph(silhouette(), 2, 'e') & box(150, 880, 900, 1260), 3)
    big_, small = [], []
    for x in components(m, 40): (big_ if x.sum() > 1500 else small).append(x)
    return [(region_path(x, F, 1.4, 4, 70, 4), color(x)) for x in big_], [(region_path(x, F, 0.8, 2), color(x, 1)) for x in small]
def body_lines():
    dark = classes()['dark'] & box(150, 775, 900, 1260); inner = morph(silhouette(), 9, 'e')
    res = []
    for x in components(dark & inner, 150):
        for _ in range(6): x = morph(x, 1, 'd') & dark                 # дотянуть до внешней обводки (под неё)
        res.append((region_path(x, F, 1.0, 5), '#262432'))
    return res

def heart(cx, cy, w, h, f=F):
    """Сердечко (кулон) по центру обводки: cx cy — центр, w h — размеры в пикселях рисунка"""
    P = lambda dx, dy: '%.1f %.1f' % f(cx + dx * w, cy + dy * h)
    return (f'M{P(0, .5)}C{P(-.1, .38)} {P(-.5, .2)} {P(-.5, -.12)}C{P(-.5, -.42)} {P(-.16, -.5)} {P(0, -.24)}'
            f'C{P(.16, -.5)} {P(.5, -.42)} {P(.5, -.12)}C{P(.5, .2)} {P(.1, .38)} {P(0, .5)}Z')

def edge_blobs():
    """Места, где обводка на рисунке толще или ломаная (бугорки шерсти у основания ушей): точная тёмная область поверх обводки"""
    dark = blur(LUM, 1) < 85; res = []
    for b in ((148, 362, 250, 460), (782, 362, 886, 460), (286, 752, 338, 797), (688, 752, 742, 797)):
        for m in components(dark & box(*b), 200): res.append(region_path(m, F, 0.7, 2, 40))
    return res
