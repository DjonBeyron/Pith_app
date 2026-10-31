# Серая кошка по эталонному рисунку (source/gray_ref.webp) как маскот того же устройства, что Пит и Мия: слои хвост / тело / голова, глаза в состоянии base,
# рот из четырёх узлов (mm mt mf ml) с таблицей форм Мии, усы с классами wh wh-l|wh-r wh-u|wh-d, контейнеры brows и dc для мимики, зрачки с классом pu.
# Этап 1 — только форма: рисунок повторяет эталон, анимаций нет. Использование: python3 build_gray_cat.py <папка_результата>
#   → gray_cat.json (спрайт) и gray_cat.svg (превью); дальше gray.json можно положить в src/features/scene/v2/sprites/mascot/ и подключить в mascots.js.
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gray_cat_regions import *
from gray_cat_details import *
from gray_cat_faces import build_states

out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/gray-cat'; os.makedirs(out, exist_ok=True)
mia = json.load(open(f'{HERE}/../../src/features/scene/v2/sprites/mascot/mia.json', encoding='utf8'))
OL, FURC, SW = '#262432', '#646774', 7.5             # обводка, мех, толщина обводки (6.5 px рисунка × масштаб ≈ 7.5)
fill = lambda p: f'<path d="{p[0]}" fill="{p[1]}"/>'
stroke = lambda d, w=SW, c=OL: f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>'

# ── части силуэта ──
head_P, body_P, tail_P = parts()
head_d, body_d = outline_path(head_P, F), outline_path(body_P, F)
tail_d = outline_path(tail_P, FT)

# ── хвост (в начале координат основания, как у Мии) ──
tail = f'<path class="tl-fill" d="{tail_d}" fill="{FURC}" stroke="{OL}" stroke-width="{SW}" stroke-linejoin="round"/>'

# ── тело: заливка, тени бёдер, обводка, пальчики, линии ног и лап, ошейник с сердечком ──
shade_big, toes = body_shade()
pk = pink_parts(); CRIM = hexc(im[pk['collar'] & (blur(LUM, 1) < 95)].mean(0))
def pink_group(m):
    d, f = pink(m)
    return f'<path d="{d}" fill="{f}" stroke="{CRIM}" stroke-width="7" stroke-linejoin="round"/>' + ''.join(fill(x) for x in pink_details(m))
def knot():   # узелок бантика: кружок с обводкой и бликом
    x, y = F(635, 212)
    return (f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="15" ry="16" fill="{pink(pk["bow"])[1]}" stroke="{CRIM}" stroke-width="{SW}"/>'
            f'<path d="M{x - 6:.1f} {y - 5:.1f}C{x - 3:.1f} {y - 9:.1f} {x + 3:.1f} {y - 9:.1f} {x + 6:.1f} {y - 5:.1f}" fill="none" stroke="#fe96b8" stroke-width="3.5" stroke-linecap="round"/>')
PINK, PINK_L = '#ee5186', '#fe96b8'
def ring_markup():
    (top_o, top_w), full = ring_paths()
    line = lambda d, w, c, cap: f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{w:.1f}" stroke-linecap="{cap}" stroke-linejoin="round"/>'
    return line(top_o, RING_O, OL, 'round') + line(top_w, RING_W, '#ffffff', 'round'), line(full, RING_O, OL, 'round') + line(full, RING_W, '#ffffff', 'round')   # (поверх головы, за ухом)
RING_TOP, RING_BEHIND = ring_markup()
def collar():   # лента ошейника: верх уходит под подбородок головы, края и низ — как на рисунке
    P = lambda x, y: '%.1f %.1f' % F(x, y)
    d = f'M{P(380, 715)}C{P(368, 742)} {P(376, 765)} {P(412, 776)}C{P(450, 792)} {P(490, 796)} {P(520, 796)}C{P(550, 796)} {P(590, 792)} {P(628, 776)}C{P(664, 765)} {P(672, 742)} {P(660, 715)}Z'
    return f'<path d="{d}" fill="{PINK}" stroke="{CRIM}" stroke-width="7" stroke-linejoin="round"/>'
def pendant():
    hd = heart(521, 837, 64, 68); x, y = F(500, 822)
    return (f'<path d="{hd}" fill="{PINK_L}" stroke="{CRIM}" stroke-width="6.4" stroke-linejoin="round"/>'
            f'<path d="M{x:.1f} {y + 4:.1f}C{x - 1:.1f} {y - 1:.1f} {x + 2:.1f} {y - 4:.1f} {x + 7:.1f} {y - 4:.1f}" fill="none" stroke="#ffffff" stroke-width="3.2" stroke-linecap="round" opacity=".95"/>')
body = (f'<path d="{body_d}" fill="{FURC}"/>' + ''.join(fill(x) for x in shade_big) + stroke(body_d) + ''.join(fill(x) for x in toes)
        + ''.join(f'<path d="{d}" fill="{c}"/>' for d, c in body_lines()) + collar() + pendant())

# ── голова ──
mouth = {k: mia['head'][mia['head'].index(f'<path class="{k}"'):].split('/>', 1)[0] + '/>' for k in ('mm', 'mt', 'mf', 'ml')}
import re
# Рот: девять форм (X A B C D E F G H — коды Rhubarb), те же и в том же виде, что у Пита и Мии, включая язык (mt) и зубы (mf). Формы лежат в координатах рига,
# где ножка рта начинается в (296.4, 348.9); у этой кошки рот чуть ниже и правее (по рисунку), поэтому вся таблица сдвигается на (DX, DY).
# Закрытая форма X — по рисунку («:3»). Линии рта тоньше (×0.72), как у кошки с рисунка.
DX, DY = F(521, 592)[0] - 296.4, F(521, 592)[1] - 348.9
MT = json.loads(json.dumps(mia['mouthTable']))
for code, e in MT.items():
    e['t'] = shift_path(e['t'], DX, DY) if e['t'] else ''
    e['f'] = shift_path(e['f'], DX, DY) if e['f'] else ''
    e['m']['d'] = shift_path(e['m']['d'], DX, DY); e['m']['sw'] = round(e['m']['sw'] * 0.72, 1)
    if e.get('l'): e['l']['d'] = shift_path(e['l']['d'], DX, DY); e['l']['sw'] = round(e['l']['sw'] * 0.72, 1)
LIP = (F(521, 592)[0], 370.0)                                        # центр верхней губы открытого рта (x ножки, y линии губ)
def adjust(code, e):
    """Подгонка форм под размер этой кошки (рот на рисунке мелкий): D и E меньше, у G короче зубы и без лишней нижней дуги, у H язык не торчит.
    Сначала масштабируется всё сразу, потом отдельные части (зубы, язык)"""
    k = dict(D=(0.72, 0.72), E=(0.85, 0.85), G=(1.0, 0.8)).get(code)
    if k:
        for key in ('t', 'f'):
            if e[key]: e[key] = scale_path(e[key], *k, *LIP)
        e['m']['d'] = scale_path(e['m']['d'], *k, *LIP)
        if e.get('l'): e['l']['d'] = scale_path(e['l']['d'], *k, *LIP)
    if code == 'G':
        e['l']['d'] = re.split(r'(?=M)', e['l']['d'])[-1]                     # остаётся только линия верхней губы; нижняя дуга выглядела вторым ртом
        e['f'] = scale_path(e['f'], 0.95, 0.8, LIP[0], 366.4)                 # зубы короче и не торчат за губу
    if code == 'H':
        e['t'] = scale_path(e['t'], 0.82, 0.82, LIP[0], 391.0)                # язык меньше, сидит в глубине рта
for code, e in MT.items(): adjust(code, e)
MT['X'] = dict(t='', f='', m=dict(d=mouth_closed(), fill='none', sw=5.6))
mouth['mm'] = re.sub(r' d="[^"]*"', f' d="{MT["X"]["m"]["d"]}"', mouth["mm"].replace("#000", OL), count=1).replace('stroke-width="6"', 'stroke-width="5.6"')
mouth['ml'] = mouth['ml'].replace('#000', OL)
wh = ''.join(f'<path class="wh wh-{s} wh-{r}" d="{d}" fill="{c}"/>' for s, r, d, c in whiskers())
nose_d, nose_c = nose()
head = (RING_BEHIND + f'<path d="{head_d}" fill="{FURC}"/>' + ''.join(fill(x) for x in face_light()) + stroke(head_d) + ''.join(f'<path d="{p}" fill="{OL}"/>' for p in edge_blobs())
        + ''.join(fill(x) for x in ear_inner()) + ''.join(fill(x) for x in ear_lines())
        + '<g class="brows"></g>' + '<g class="mouth">' + ''.join(mouth[k] for k in ('mm', 'mt', 'mf', 'ml')) + '</g>' + f'<path d="{nose_d}" fill="{nose_c}"/>' + wh
        + RING_TOP + star(208, 262, 28, OL, '#cdedbe') + star(835, 262, 28, OL, '#cdedbe') + pink_group(pk['bow']) + knot() + '<g class="dc"></g>')

# ── глаза (состояние base) ──
STATES = build_states(mia['states'], FURC, OL)                              # шесть лиц Мии (веки, взгляд, брови — под глаза этой кошки)
eyes = STATES['base']['eyes']

# ── вписывание в коробку 200×240 (как export_sprites.mjs) ──
x0, x1, y0, y1 = F(95, 0)[0], F(1070, 0)[0], F(0, 62)[1], F(0, 1240)[1]
vx, vy, vw, vh = x0 - 10, y0 - 8, x1 - x0 + 20, y1 - y0 + 16
k = min(200 / vw, 240 / vh)
sprite = dict(id='gray', title='Серая кошка', gender='female', native='left',
              fit=dict(k=round(k, 5), tx=round(-vx * k, 3), ty=round(240 - (vy + vh) * k, 3)), tailBase=[round(TBX), round(TBY)],
              tail=tail, body=body, head=head, mouthTable=MT, neck=[297, 445],
              states=STATES)
json.dump(sprite, open(f'{out}/gray_cat.json', 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vx:.0f} {vy:.0f} {vw:.0f} {vh:.0f}" width="{vw:.0f}" height="{vh:.0f}"><rect x="{vx:.0f}" y="{vy:.0f}" width="{vw:.0f}" height="{vh:.0f}" fill="#f5f3ef"/>'
       f'<g transform="translate({TBX:.1f} {TBY:.1f})">{tail}</g>{body}{head}{eyes}</svg>')
open(f'{out}/gray_cat.svg', 'w', encoding='utf8').write(svg)
print('готово', out, 'размер', len(json.dumps(sprite)) // 1024, 'КБ; узлов', svg.count('<path') + svg.count('<ellipse'))
