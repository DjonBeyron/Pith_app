# Девочка Мия из рига кота дизайнера (work/rig_opt.json): серая шерсть, белая мордочка и капля на лбу, бантик, кольцо и звёздочки в ушах, миндалевидные зелёные глаза
# со зрачком-щелью, форма головы «пушистые щёчки», женственный хвост, меньшие лапки. Состояния мимики — переменная окружения EXPR (base, roll, smirk, pathos, sneer, interest),
# высота щели — PUPIL_H. Использование: build_girl.py <work> [суффикс_имени_файла] → work/rig_girl_grey<суффикс>.json (дальше их собирает make_packs.py)
import json, re, sys, math, subprocess, os
sys.path.insert(0, __file__.rsplit('/', 1)[0])
import pathops
from fontTools.misc.transform import Transform
from optimize_rig import to_d, path_from_d, intersect, ellipse_d, CAP as _CAP, JOIN as _JOIN
work = sys.argv[1]
SUFFIX = sys.argv[2] if len(sys.argv) > 2 else ''
CHIN_KEY = 'D3'
TILT = 0.0       # наклон глаз, градусы: + наружный уголок выше (выбран прямой, 0°)

# палитры: fur — основной мех, sh — тёмные пятна/полоски, ol — обводка, lt — светлые лапки, ear — внутри ушей,
# acc/acc2/accD — бантик и ошейник (основной / светлее / обводка), spot — пятнышко на лице
PAL = {
    'grey': dict(name='Серая с белой мордочкой + малиновый бантик', fur='#b7bfcc', sh='#98a1b3', ol='#575164', lt='#ffffff', lt2='#e6e9f0', ear='#ffcfd8', acc='#e2457c', acc2='#f58aaa', accD='#8f1f4a', spot='#98a1b3'),
}
BOY = {'#bc82fa': 'fur', '#bb81f9': 'fur', '#9353dd': 'sh', '#9656e0': 'sh', '#582e99': 'ol', '#decefb': 'lt2', '#ddcdfa': 'lt2', '#d5bdf7': 'lt2', '#ffadd1': 'ear'}

def recolor(s, P):
    return re.sub(r'#[0-9a-fA-F]{6}\b', lambda m: P[BOY[m.group().lower()]] if m.group().lower() in BOY else m.group(), s)

from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.svgLib.path import parse_path as _parse
# три формы подбородка: A «сердечко» (скулы шире, подбородок резко сужается), B вытянутый овал (лицо длиннее, мягкий подбородок), C заострённый «V»
CHINS = {'D3': dict(y0=305, y1=455, squeeze=.28, drop=-6, w=200, shape='par', ear=True, bulge=.075, by=330, bw=70)}   # форма головы «пушистые щёчки» (выбрана)
CHIN = dict(CHINS[CHIN_KEY], cx=296)
# морда чуть уже, глаза и брови чуть ближе друг к другу (выбранный вариант)
NARROW = True
# ── выражения лица (статичные референсы, без анимации): веко, взгляд, брови, рот, наклон головы ──
STUB = 'M296 349V361'    # короткая ножка от носа ко рту
EXPRS = {
    'base': {},
    'pathos': dict(lid=26, gaze=(0, 10), rot=-5,   # «пафос»: полуприкрытые веки, взгляд сверху вниз, подбородок вздёрнут, брови дугой, сжатый ротик
                   brows=('M258 210Q222 190 184 212', 'M335 210Q371 190 409 212'), mouth='M272 367Q296 373 322 364'),
    'smirk': dict(lid=16, gaze=(16, 0), rot=6,     # «стерва-ухмылка»: одна бровь высоко, взгляд искоса, ухмылка в одну сторону
                  brows=('M258 196Q222 164 186 192', 'M335 232Q371 214 407 214'), mouth='M266 368Q288 372 306 364Q322 358 332 346'),
    'roll': dict(lid=6, gaze=(0, -22), rot=-3,     # «закатила глаза»: зрачки вверх под веки, брови высоко, ротик «пфф»
                 brows=('M258 198Q222 176 184 196', 'M335 198Q371 176 409 196'), mouth='M270 368Q296 362 322 368'),
    'interest': dict(lid=0, gaze=(6, 0), rot=2,     # «увлечена»: любопытный взгляд, брови чуть вверх, лёгкая улыбка (зрачок расширяется рантаймом)
                     brows=('M258 206Q222 188 184 206', 'M335 206Q371 188 409 206'), mouth='M276 364Q296 377 318 364'),
    'sneer': dict(lid=34, gaze=(18, 6), rot=8,     # «презрение»: глаза прищурены, брови сдвинуты книзу к носу, уголок рта вниз
                  brows=('M258 228Q222 214 186 204', 'M335 228Q371 214 407 204'), mouth='M268 358Q284 368 300 368Q318 366 330 376'),
}
EXPR = EXPRS[os.environ.get('EXPR', 'base')]
LID = EXPR.get('lid', 0); GAZE = EXPR.get('gaze', (0, 0)); GY = GAZE[1]
PUPIL = 'slit'      # форма зрачка: slit — натуральный кошачий (вертикальная щель), round — круглый
EYE_SCALE = 0.92      # глаза чуть меньше (глаз целиком: радужка, веко, ресницы)
if NARROW: CHIN['narrow'] = .07
EYES = ((207, -1), (376, 1)) if NARROW else ((200, -1), (383, 1))
BROW_SHIFT = 7 if NARROW else 0
def warp_pt(x, y):
    """Лёгкая деформация лица под референс: щёки сужаются к подбородку, подбородок чуть вытягивается вниз и заостряется"""
    t = max(0.0, min(1.0, (y - CHIN['y0']) / (CHIN['y1'] - CHIN['y0']))); g = t * t * (3 - 2 * t)
    dx = x - CHIN['cx']
    if CHIN.get('ear'):   # уши тянутся вверх и чуть расходятся наружу (только по бокам от лба)
        e = max(0.0, min(1.0, (225 - y) / 125)); h = max(0.0, min(1.0, (abs(dx) - 70) / 60))
        y -= 34 * e * h * (0.6 + 0.4 * e); dx += (1 if dx > 0 else -1) * 12 * e * e * h
        x = CHIN['cx'] + dx
    if CHIN.get('narrow'):   # утончение: лицо уже по всей высоте от скул
        n = max(0.0, min(1.0, (y - 200) / 120)); dx *= 1 - CHIN['narrow'] * n * n * (3 - 2 * n)
    if CHIN.get('bulge'): dx *= 1 + CHIN['bulge'] * math.exp(-((y - CHIN['by']) / CHIN['bw']) ** 2)   # пушистые щёчки
    fall = max(0.0, 1 - (dx / CHIN['w']) ** 2) if CHIN['shape'] == 'par' else max(0.0, 1 - abs(dx) / CHIN['w']) ** 1.4
    return CHIN['cx'] + dx * (1 - CHIN['squeeze'] * g), y + CHIN['drop'] * g * fall
PAW_C = (189, 248, 342, 406); PAW = dict(y0=672, yb=742, k=.86)
def warp_paw(x, y):
    """Лапки меньше: всё ниже y0 сжимается к центру ближайшей лапы и к полу (плавно, выше y0 ничего не двигается)"""
    t = max(0.0, min(1.0, (y - PAW['y0']) / (PAW['yb'] - PAW['y0']))); g = t * t * (3 - 2 * t)
    if g == 0: return x, y
    w = [math.exp(-((x - c_) / 38) ** 2) + 1e-9 for c_ in PAW_C]                      # плавные веса вместо «ближайшего центра»: на стыке лап сдвиг → 0 (без разрывов и клиньев)
    c = sum(wi * ci for wi, ci in zip(w, PAW_C)) / sum(w); k = 1 - (1 - PAW['k']) * g
    return c + (x - c) * k, PAW['yb'] + (y - PAW['yb']) * (1 - (1 - .93) * g)
def warp_d(d, fn=None):
    fn = fn or warp_pt
    rec = RecordingPen(); _parse(d, rec); pen = SVGPathPen(None, ntos=lambda v: ('%.1f' % v).rstrip('0').rstrip('.'))
    for op, args in rec.value: getattr(pen, op)(*[fn(*a) if a is not None else None for a in args])
    return pen.getCommands()
def warp_item(item):
    if 'class=' in item or 'fill="#ff8db5"' in item: return item        # рот и нос — на своих местах
    m = re.search(r'<ellipse cx="([\d.]+)" cy="([\d.]+)"', item)
    if m:
        x, y = warp_pt(float(m.group(1)), float(m.group(2))); return item.replace(m.group(0), f'<ellipse cx="{x:.1f}" cy="{y:.1f}"')
    return re.sub(r' d="([^"]*)"', lambda mo: f' d="{warp_d(mo.group(1))}"', item, 1)

def split_paths(xml): return re.findall(r'<path [^>]*/>', xml)

def bow(cx, cy, rot, sc, P):
    """Бантик: две петли и узелок (координаты в единицах рига)"""
    loop = 'M0 0C-14-32-64-42-72-6C-77 28-26 30 0 0Z'
    fold = 'M-10 0C-26-12-46-14-58-6'
    return (f'<g transform="translate({cx} {cy}) rotate({rot}) scale({sc})">'
            f'<path d="{loop}" fill="{P["acc"]}" stroke="{P["accD"]}" stroke-width="5.5" stroke-linejoin="round"/>'
            f'<path d="{loop}" transform="scale(-1 1)" fill="{P["acc"]}" stroke="{P["accD"]}" stroke-width="5.5" stroke-linejoin="round"/>'
            f'<path d="{fold}" fill="none" stroke="{P["accD"]}" stroke-width="3.5" stroke-linecap="round" opacity=".55"/>'
            f'<path d="{fold}" transform="scale(-1 1)" fill="none" stroke="{P["accD"]}" stroke-width="3.5" stroke-linecap="round" opacity=".55"/>'
            f'<path d="M-50-18C-40-26-26-24-18-15" fill="none" stroke="{P["acc2"]}" stroke-width="4.5" stroke-linecap="round"/>'
            f'<path d="M50-18C40-26 26-24 18-15" fill="none" stroke="{P["acc2"]}" stroke-width="4.5" stroke-linecap="round"/>'
            f'<ellipse cx="0" cy="0" rx="12" ry="13" fill="{P["acc"]}" stroke="{P["accD"]}" stroke-width="5.5"/>'
            f'<path d="M-5-6C-2-9 3-9 5-6" fill="none" stroke="{P["acc2"]}" stroke-width="3.5" stroke-linecap="round"/></g>')

GOLD, GOLD_D = '#ffd34d', '#a8741a'
def outline_pts(d):
    """Точки контура (кривые Безье → ломаная) — чтобы кольцо сидело ровно на краю уха после деформаций"""
    p = path_from_d(d, Transform()); pts = []; cur = None
    for verb, args in p.segments:
        if verb == 'moveTo': cur = args[0]; pts.append(cur)
        elif verb == 'lineTo':
            for i in range(1, 7): pts.append((cur[0] + (args[0][0] - cur[0]) * i / 6, cur[1] + (args[0][1] - cur[1]) * i / 6))
            cur = args[0]
        elif verb == 'curveTo':
            a_, b_, c_ = args
            for i in range(1, 13):
                t = i / 12
                pts.append(((1 - t) ** 3 * cur[0] + 3 * (1 - t) ** 2 * t * a_[0] + 3 * (1 - t) * t * t * b_[0] + t ** 3 * c_[0], (1 - t) ** 3 * cur[1] + 3 * (1 - t) ** 2 * t * a_[1] + 3 * (1 - t) * t * t * b_[1] + t ** 3 * c_[1]))
            cur = c_
    return pts
def edge_at(pts, y, side):
    """Точка внешнего края уха на высоте y (side=-1 — левое ухо, +1 — правое) и направление края вниз"""
    xs = []
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        if (y1 - y) * (y2 - y) <= 0 and y1 != y2: xs.append(x1 + (x2 - x1) * (y - y1) / (y2 - y1))
    x = min(xs) if side < 0 else max(xs)
    return x
def _stroke(d, w):
    o = path_from_d(d, Transform()); o.stroke(w, _CAP['round'], _JOIN['round'], 4); o.convertConicsToQuads(); return o
def _cr(Q):
    """Плавная кривая через точки (Catmull-Rom → кубические Безье): список строк-сегментов 'C…' для последовательных пар точек"""
    segs = []
    for i in range(len(Q) - 1):
        p0, p1, p2, p3 = Q[max(i - 1, 0)], Q[i], Q[i + 1], Q[min(i + 2, len(Q) - 1)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6); c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        segs.append((c1, c2, p2))
    return segs
def ear_ring(pts, y, side, P, ear, k=0.9, rot=0.0, kind='round'):
    """Кольцо как у исходного кота, продетое через край уха: нижний конец уходит ЗА ухо (в силуэте уха он скрыт, обводка края идёт поверх),
    дужка огибает край снаружи, поднимается, переходит через край сверху и ЗАХОДИТ НА ПЕРЕДНЮЮ СТОРОНУ уха — конец смотрит вниз и закруглён
    (полукруг — круглый торец ленты). Кольцо ориентировано по краю уха и повёрнуто на rot°"""
    x = edge_at(pts, y, side); x2 = edge_at(pts, y + 16, side); x1 = edge_at(pts, y - 16, side)
    tx, ty = x2 - x1, 32.0; n_ = math.hypot(tx, ty); tx, ty = tx / n_, ty / n_       # направление края вниз
    nx, ny = (-ty, tx) if side < 0 else (ty, -tx)                                       # наружу от уха
    c_, s_ = math.cos(math.radians(rot)), math.sin(math.radians(rot))                   # колечко висит чуть под своим углом
    tx, ty, nx, ny = tx * c_ - ty * s_, tx * s_ + ty * c_, nx * c_ - ny * s_, nx * s_ + ny * c_
    F = lambda q: (x + nx * q[0] * k + tx * q[1] * k, y + ny * q[0] * k + ty * q[1] * k)   # локальные (наружу, вниз) → рисунок
    fs = lambda q: '%.1f %.1f' % F(q)
    # дужка — настоящая дуга окружности (round) или сплюснутого эллипса (flat, колечко «лежит» почти плашмя): никаких углов. Идём от низа (за ухом)
    # наружу, вверх и поверх края внутрь уха; конец смотрит вниз
    cx_, cy_, rx_, ry_, a0, a1 = {'round': (3, -15, 17, 17, 100, -195), 'flat': (-2, -4, 18, 7, 105, -165), 'mid': (-1, -11, 21, 12, 102, -192)}[kind]   # mid — между круглым и плоским, заходит глубже в ухо
    ph = [a0 - i * 15 for i in range(int((a0 - a1) / 15) + 1)]
    if ph[-1] != a1: ph.append(a1)
    Q = [(cx_ + rx_ * math.cos(math.radians(a)), cy_ + ry_ * math.sin(math.radians(a))) for a in ph]
    i0 = min(range(len(ph)), key=lambda i: abs(ph[i]))                                      # самая дальняя точка снаружи (φ = 0)
    segs = _cr(Q)
    low = f'M{fs(Q[0])}' + ''.join(f'C{fs(c1)} {fs(c2)} {fs(e)}' for c1, c2, e in segs[:i0])      # нижняя часть: за ухом → наружу
    up = f'M{fs(Q[i0])}' + ''.join(f'C{fs(c1)} {fs(c2)} {fs(e)}' for c1, c2, e in segs[i0:])      # верхняя часть: вверх и поверх края на ухо
    rim = [(edge_at(pts, yy, side), yy) for yy in range(int(y) - 4, int(y) + 17, 3)]
    rim_d = 'M' + 'L'.join(f'{a:.1f} {b:.1f}' for a, b in rim)
    ol, WO, WW = P['ol'], 6, 3
    lo_ol = pathops.op(_stroke(low, WO), ear, pathops.PathOp.DIFFERENCE, fix_winding=True)
    lo_wh = pathops.op(_stroke(low, WW), ear, pathops.PathOp.DIFFERENCE, fix_winding=True)
    return (f'<path d="{up}" fill="none" stroke="{ol}" stroke-width="{WO}" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<path d="{to_d(lo_ol)}" fill="{ol}"/>'
            f'<path d="{up}" fill="none" stroke="#ffffff" stroke-width="{WW}" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<path d="{to_d(lo_wh)}" fill="#ffffff"/>'
            f'<path d="{rim_d}" fill="none" stroke="{ol}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>')
def star_stud(pts, y, side, P, r=12.5, rot=0.0, inset=14):
    """Камешек-звёздочка (гвоздик): огранённая звёздочка на передней стороне уха у самого края, чуть внутрь от контура"""
    x = edge_at(pts, y, side); x2 = edge_at(pts, y + 16, side); x1 = edge_at(pts, y - 16, side)
    tx, ty = x2 - x1, 32.0; n_ = math.hypot(tx, ty); tx, ty = tx / n_, ty / n_
    nx, ny = (-ty, tx) if side < 0 else (ty, -tx)
    cx, cy = x - nx * inset, y - ny * inset                                    # внутрь уха от края
    pp = []
    for i in range(10):
        a_ = math.radians(-90 + rot + i * 36); rr = r if i % 2 == 0 else r * .58          # пухленькая звёздочка: впадины неглубокие
        pp.append(f'{cx + rr * math.cos(a_):.1f} {cy + rr * math.sin(a_):.1f}')
    ol = P['ol']
    # скруглённые лучи: толстая обводка с круглыми соединениями и заливка той же линией (углы оплывают)
    return (f'<path d="M{"L".join(pp)}Z" fill="#bddcab" stroke="{ol}" stroke-width="5.5" stroke-linejoin="round"/>'
            f'<path d="M{"L".join(pp)}Z" fill="#bddcab" stroke="#bddcab" stroke-width="2.2" stroke-linejoin="round"/>'
            f'<ellipse cx="{cx - r * .22:.1f}" cy="{cy - r * .24:.1f}" rx="{r * .22:.1f}" ry="{r * .3:.1f}" fill="#f0fae8" transform="rotate(-25 {cx:.1f} {cy:.1f})"/>')   # зеленоватый камешек с бликом
def earrings(P, fill_d):
    pts = outline_pts(fill_d); ear = path_from_d(fill_d, Transform())
    # левое ухо: только верхнее (плоское) колечко + звёздочка ниже; правое ухо: звёздочка на уровне колечка. Звёздочки — камешки-проколы
    return (ear_ring(pts, 114, -1, P, ear, rot=-4, kind='flat') + star_stud(pts, 158, -1, P, rot=8)
            + star_stud(pts, 162, 1, P, rot=-6))

# ── миндалевидные глаза (по референсу): вытянутая форма, наружный уголок выше и острее, плотная линия верхнего века со «стрелкой», радужка прикрыта веками ──
K = 0.86                                            # общий масштаб глаза относительно рисунка выше
def coords(cx, s):
    return (lambda u: cx + s * u * K), (lambda y: 300 + (y - 300) * K)

def almond(cx, s):
    """Контур глаза (миндаль) для глаза с центром cx; s = -1 слева (наружу — влево), +1 справа. u — смещение наружу"""
    X, Y = coords(cx, s)
    L = LID   # опускание верхнего века (выражения): середина — полностью, к уголкам — слабее
    return (f'M{X(-60):.1f} {Y(316):.1f}C{X(-48):.1f} {Y(282 + L * .45):.1f} {X(-20):.1f} {Y(262 + L):.1f} {X(8):.1f} {Y(262 + L):.1f}C{X(34):.1f} {Y(262 + L):.1f} {X(52):.1f} {Y(274 + L * .55):.1f} {X(64):.1f} {Y(288):.1f}'
            f'C{X(50):.1f} {Y(314):.1f} {X(20):.1f} {Y(335):.1f} {X(-12):.1f} {Y(335):.1f}C{X(-36):.1f} {Y(335):.1f} {X(-52):.1f} {Y(327):.1f} {X(-60):.1f} {Y(316):.1f}Z')

def pupil_d(x, y):
    """Контур зрачка (до обрезки веками)"""
    if PUPIL == 'slit':       # натуральный кошачий: вертикальная щель с заострёнными концами (тянется от века до века)
        H, W = float(os.environ.get('PUPIL_H', 40)), 7.5
        return f'M{x} {y - H}C{x + W * 1.7:.1f} {y - H * .5:.1f} {x + W * 1.7:.1f} {y + H * .5:.1f} {x} {y + H}C{x - W * 1.7:.1f} {y + H * .5:.1f} {x - W * 1.7:.1f} {y - H * .5:.1f} {x} {y - H}Z'
    if PUPIL == 'heart':      # сердечко
        return heart_path(x, y + 1, 36, 33)
    if PUPIL == 'star':       # пухлая звёздочка (перекликается с камешками в ушах)
        pts = []
        for i in range(10):
            a_ = math.radians(-90 + i * 36); rr = 21 if i % 2 == 0 else 12
            pts.append(f'{x + rr * math.cos(a_):.1f} {y + 1 + rr * math.sin(a_):.1f}')
        return 'M' + 'L'.join(pts) + 'Z'
    return ellipse_d(x, y, 14, 14)

def almond_open(cx, s, P):
    X, Y = coords(cx, s)
    shape = path_from_d(almond(cx, s), Transform())
    gx = cx + 8 + GAZE[0]                                      # взгляд чуть вбок
    def put(d, fill, op=None, clip=None, pu=None):
        g = intersect(path_from_d(d, Transform()), clip or shape)
        return f'<path' + (f' class="pu" data-x="{pu[0]:.1f}" data-y="{pu[1]:.1f}"' if pu else '') + f' d="{to_d(g)}" fill="{fill}"' + (f' opacity="{op}"' if op else '') + '/>'
    topband = lambda r: path_from_d(f'M{cx - 90} {Y(240):.1f}H{cx + 90}V{Y(278):.1f}C{cx + 30} {Y(268):.1f} {cx - 30} {Y(268):.1f} {cx - 90} {Y(278):.1f}Z', Transform())
    # «по фото»: зеленовато-ореховая радужка, тёмное лимбальное кольцо, янтарь у зрачка, светлый белок с тенями у уголков, тень века и мелкий блик
    R = 41
    out = put(ellipse_d(cx, Y(300), 70, 44), '#f5f0ea')                                             # белок
    out += put(f'M{X(-70):.1f} {Y(300):.1f}h{s * 22:.1f}v60h{-s * 22:.1f}Z', '#e9c9c4', .75)       # внутренний уголок (розоватая тень)
    out += put(f'M{X(70):.1f} {Y(300):.1f}h{-s * 24:.1f}v60h{s * 24:.1f}Z', '#cfc9c4', .6)          # наружный уголок (серая тень)
    out += put(ellipse_d(gx, Y(299) + GY, R + 3, R + 3), '#6f7f63')                                       # лимбальное кольцо (серо-зелёное)
    out += put(ellipse_d(gx, Y(299) + GY, R, R), '#b5c9a0')                                               # радужка (зелёная)
    out += put(ellipse_d(gx, Y(300) + GY, R * .74, R * .74), '#cddcb3')                                   # светлая зелёная зона
    out += put(ellipse_d(gx, Y(301) + GY, R * .5, R * .5), '#e8e1b8')                                     # золотисто-ореховое кольцо у зрачка
    out += put(pupil_d(gx, Y(301) + GY), '#1e261d', pu=(gx, Y(301) + GY))                                             # зрачок (круглый)
    out += put(ellipse_d(gx, Y(299) + GY, R + 3, R + 3), '#5a6a52', .35, intersect(shape, topband(R)))     # тень верхнего века
    out += f'<ellipse cx="{gx - 11}" cy="{Y(288) + GY:.1f}" rx="8" ry="6.5" fill="#ffffff" opacity=".95"/><circle cx="{gx + 12}" cy="{Y(312) + GY:.1f}" r="3.2" fill="#ffffff" opacity=".7"/>'
    return out

def almond_lid(cx, s, P, closed=False):
    """Линия верхнего века: плотная, утолщается к наружному уголку и заканчивается «стрелкой»; ресницы"""
    X, Y = coords(cx, s)
    ol = P['ol']
    if not closed:
        L = LID
        line = f'M{X(-57):.1f} {Y(312):.1f}C{X(-48):.1f} {Y(280 + L * .45):.1f} {X(-20):.1f} {Y(259 + L):.1f} {X(8):.1f} {Y(259 + L):.1f}C{X(34):.1f} {Y(259 + L):.1f} {X(54):.1f} {Y(272 + L * .55):.1f} {X(66):.1f} {Y(286):.1f}'
        wing = f'M{X(60):.1f} {Y(280):.1f}C{X(68):.1f} {Y(280):.1f} {X(76):.1f} {Y(274):.1f} {X(78):.1f} {Y(266):.1f}C{X(74):.1f} {Y(278):.1f} {X(74):.1f} {Y(289):.1f} {X(62):.1f} {Y(295):.1f}Z'
        crease = f'M{X(-30):.1f} {Y(260 + L):.1f}C{X(-12):.1f} {Y(243 + L):.1f} {X(24):.1f} {Y(242 + L):.1f} {X(50):.1f} {Y(254 + L * .6):.1f}'
        low = f'M{X(60):.1f} {Y(292):.1f}C{X(48):.1f} {Y(316):.1f} {X(20):.1f} {Y(336):.1f} {X(-12):.1f} {Y(336):.1f}C{X(-34):.1f} {Y(336):.1f} {X(-48):.1f} {Y(328):.1f} {X(-56):.1f} {Y(320):.1f}'
        ox, oy = X(52), Y(276)
    else:   # закрытый глаз: линия века — плавная дуга «улыбкой» (наружный уголок выше)
        line = f'M{X(-58):.1f} {Y(312):.1f}C{X(-38):.1f} {Y(330):.1f} {X(10):.1f} {Y(334):.1f} {X(40):.1f} {Y(322):.1f}C{X(52):.1f} {Y(316):.1f} {X(60):.1f} {Y(308):.1f} {X(66):.1f} {Y(298):.1f}'
        wing = f'M{X(60):.1f} {Y(302):.1f}C{X(68):.1f} {Y(300):.1f} {X(76):.1f} {Y(292):.1f} {X(78):.1f} {Y(284):.1f}C{X(74):.1f} {Y(296):.1f} {X(74):.1f} {Y(306):.1f} {X(62):.1f} {Y(312):.1f}Z'
        low = ''; crease = ''; ox, oy = X(52), Y(298)
    out = f'<path d="{line}" fill="none" stroke="{ol}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="{wing}" fill="{ol}"/>'
    if crease: out += f'<path d="{crease}" fill="none" stroke="{ol}" stroke-width="3.5" stroke-linecap="round" opacity=".4"/>'
    if low: out += f'<path d="{low}" fill="none" stroke="{ol}" stroke-width="3.5" stroke-linecap="round" opacity=".55"/>'
    # две ресницы растут прямо из линии века (основания — точки последнего изгиба века), веером вверх и наружу
    seg = ((8, 259 + LID), (34, 259 + LID), (54, 272 + LID * .55), (66, 286)) if not closed else ((40, 322), (52, 316), (60, 308), (66, 298))
    cub = lambda t: tuple((1 - t) ** 3 * seg[0][k] + 3 * (1 - t) ** 2 * t * seg[1][k] + 3 * (1 - t) * t * t * seg[2][k] + t ** 3 * seg[3][k] for k in (0, 1))
    for t, L in ((0.80, 22), (0.96, 19)):
        u, y = cub(t); bx, by = X(u), Y(y)
        n = math.hypot(s * .5, -.9); dx, dy = s * .5 / n, -.9 / n
        tx, ty = bx + dx * L, by + dy * L
        out += f'<path d="M{bx:.1f} {by:.1f}Q{bx + dx * L * .5 + s * 4:.1f} {by + dy * L * .5:.1f} {tx:.1f} {ty:.1f}" fill="none" stroke="{ol}" stroke-width="3.6" stroke-linecap="round"/>'
    return out

def brows(P, override=None):
    # обе брови на одном уровне — по нижней правой; левая — зеркальное отражение правой
    d_r = f'M{342 - BROW_SHIFT} 222Q{376 - BROW_SHIFT} 207 {414 - BROW_SHIFT} 218'
    d_l = f'M{251 + BROW_SHIFT} 222Q{217 + BROW_SHIFT} 207 {179 + BROW_SHIFT} 218'
    if 'brows' in EXPR: d_l, d_r = EXPR['brows']
    if override: d_l, d_r = override
    return (f'<path d="{d_l}" fill="none" stroke="{P["ol"]}" stroke-width="8" stroke-linecap="round"/>'
            f'<path d="{d_r}" fill="none" stroke="{P["ol"]}" stroke-width="8" stroke-linecap="round"/>')

def blush_clipped(fill_d, P):
    """Румянец: эллипсы у щёк, обрезанные по силуэту лица (при узком подбородке не вылезают за контур)"""
    base = path_from_d(fill_d, Transform()); out = ''
    for x, y, dx in ((150, 366, 12), (444, 366, -12)):
        cx, cy = warp_pt(x, y)
        out += f'<path d="{to_d(intersect(path_from_d(ellipse_d(cx + dx, cy, 30, 17), Transform()), base))}" fill="{P["acc2"]}" opacity=".55"/>'
    return out

# пятна калико (в координатах рига до деформаций): режутся по силуэту булевой операцией, поэтому не выходят за контур
# белые пятна на лице серой девочки (в координатах рига до деформаций)
GREY_BODY = ['M112 556C152 526 234 560 242 640C248 702 206 726 150 726C100 726 88 606 112 556Z',      # мягкие тени бёдер (не пятна): объём вместо полосок
             'M481 556C441 526 359 560 351 640C345 702 387 726 443 726C493 726 505 606 481 556Z']
DROP1 = 'M296.0 192.0C311.2 192.0 316.0 233.6 308.0 264.8C303.2 283.5 296.0 296.0 296.0 296.0C296.0 296.0 288.8 283.5 284.0 264.8C276.0 233.6 280.8 192.0 296.0 192.0Z'   # белая «узкая вытянутая капля» на лбу
MUZZLE = [DROP1, 'M296 348C286 330 250 324 238 352C226 382 246 426 296 442C346 426 366 382 354 352C342 324 306 330 296 348Z']   # + мягкий «сердечный» верх мордочки
def patches(paths, base_d, P, fn=None):
    base = path_from_d(base_d, Transform()); out = ''
    for d in paths:
        g = intersect(path_from_d(warp_d(d, fn) if fn else d, Transform()), base)
        out += f'<path d="{to_d(g)}" fill="{P["spot"]}"/>'
    return out

def build(key):
    global LID, GAZE, GY
    P = PAL[key]; rig = json.load(open(f'{work}/rig_opt.json', encoding='utf8')); out = dict(rig)
    head = split_paths(rig['parts']['head'])
    assert len(head) == 23 and 'stroke="#000000"' in head[22] and 'fill="#000000"' in head[21], 'структура головы изменилась'
    keep = [p for i, p in enumerate(head) if i not in (1, 8, 9, 10, 11, 12, 13, 14, 21, 22)]   # полоски табби, прежние кольца в ухе, брови и очки убраны
    keep = [warp_item(p) for p in keep]
    # порядок: голова, белая мордочка, пятна калико (по силуэту головы), румянец, обводка…
    fill_d = re.search(r' d="([^"]*)"', keep[0]).group(1)
    keep[1] = patches(MUZZLE, fill_d, dict(P, spot='#ffffff'), warp_pt)   # своя белая мордочка вместо маски исходного кота
    keep.insert(3, blush_clipped(fill_d, P))
    studs = earrings(P, fill_d)
    brows_w = '<g class="brows">' + re.sub(r' d="([^"]*)"', lambda mo: f' d="{warp_d(mo.group(1))}"', brows(P)) + '</g>'
    bx, by = warp_pt(368, 142)
    head_xml = recolor(''.join(keep), P) + f'<g class="girl-deco">{studs}{brows_w}{bow(bx, by, -20, 1.2, P)}</g>'
    # глаза: те же + ресницы (глаза открыты/закрыты)
    lash_col = P['ol']
    rot = lambda cx, s_, inner: f'<g transform="translate({cx} 300) scale({EYE_SCALE}) rotate({-s_ * TILT}) translate({-cx} -300)">{inner}</g>' if (TILT or EYE_SCALE != 1) else inner   # наружный уголок выше при TILT > 0; глаз целиком масштабируется от своего центра
    eo = ''.join(rot(cx, s_, almond_open(cx, s_, P) + almond_lid(cx, s_, P)) for cx, s_ in EYES)
    ec = ''.join(rot(cx, s_, almond_lid(cx, s_, P, True)) for cx, s_ in EYES)   # моргание: дуга закрытого века с той же «стрелкой»
    body_xml = rig['parts']['body']
    tail_new = subprocess.run(['node', '-e', "import('./tail.mjs').then(a=>{a.useTailProfile('girl');process.stdout.write(a.tailMarkup())})"], cwd=__file__.rsplit('/', 1)[0], capture_output=True, text=True, check=True).stdout
    body_xml = re.sub(r'<g class="tail">.*?</g>', lambda _: tail_new, body_xml, 1, re.S)   # хвост девочки: длиннее, S-изгиб, без полосок
    head_t, rest_t = body_xml.split('</g>', 1)
    rest_t = re.sub(r' d="([^"]*)"', lambda mo: f' d="{warp_d(mo.group(1), warp_paw)}"', rest_t)   # лапки меньше и аккуратнее
    bp = split_paths(rest_t)
    bp = [p for p in bp if not re.search(r'fill="#(?:9656e0|9353dd)"', p)]                          # тёмные полосы и тени бёдер табби убраны
    bfill = re.search(r' d="([^"]*)"', bp[0]).group(1)                                               # силуэт тела (первая заливка)
    bp.insert(1, patches(GREY_BODY, bfill, P, warp_paw))
    rest_t = ''.join(bp)
    body = recolor(head_t + '</g>' + rest_t, P)
    # ошейник: жёлтый → ленточка цвета бантика; серый жетон → сердечко
    body = re.sub(r'(<path class="tl-s"[^>]*fill=")#[0-9a-fA-F]{6}', r'\1#ffffff', body)   # белый кончик хвоста
    body = body.replace('#fcde64', P['acc']).replace('#ceb341', P['accD'])
    body = re.sub(r'<path d="[^"]*" fill="#(?:e2e2e2|b7b7b7)"/>|<path d="[^"]*" fill="none" stroke="#(?:7f7f7f|686868|ffffff)"[^>]*/>', '', body)
    heart = (f'<path d="M303 506C281 490 280 470 295 470C300 470 303 474 303 478C303 474 306 470 311 470C326 470 325 490 303 506Z" fill="{P["acc2"]}" stroke="{P["accD"]}" stroke-width="5" stroke-linejoin="round"/>'
             f'<path d="M293 478C293 475 296 474 298 475" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" opacity=".85"/>')
    body += f'<g transform="translate(0 6)">{heart}</g>'   # жетон ниже: подбородок теперь закрывает ошейник
    if 'mouth' in EXPR:   # рот выражения: ножка от носа + линия
        head_xml = re.sub(r'(<path class="mm" d=")[^"]*(" fill=")[^"]*(" stroke="#000" stroke-width=")[^"]*(")', lambda m: m.group(1) + STUB + EXPR['mouth'] + m.group(2) + 'none' + m.group(3) + '6' + m.group(4), head_xml, 1)
    out['exprRot'] = EXPR.get('rot', 0)
    out['tailProfile'] = 'girl'
    out['parts'] = {'body': body, 'head': head_xml, 'eyes_open': eo, 'eyes_closed': ec, }
    json.dump(out, open(f'{work}/rig_girl_{key}{SUFFIX}.json', 'w', encoding='utf8'), ensure_ascii=False)
    print(key, P['name'], '| узлов в голове:', head_xml.count('<path') + head_xml.count('<circle') + head_xml.count('<ellipse'))

build('grey')
