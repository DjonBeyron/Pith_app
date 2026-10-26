# Пакеты персонажей для конструктора: слои (хвост/тело/лицо), таблица рта и СОСТОЯНИЯ мимики. Состояние = глаза + брови + декор (румянец, пот, сердечки) + рот в покое +
# наклон головы + реакция зрачка. Рантайм подставляет разметку состояния в контейнеры (.ey, .brows, .dc), поэтому в DOM всегда один набор глаз.
import json, re, sys, math
sys.path.insert(0, __file__.rsplit('/', 1)[0])
import pathops
from fontTools.misc.transform import Transform
from optimize_rig import to_d, path_from_d, intersect
work = sys.argv[1]
STUB = 'M296 349V361'
load = lambda f: json.load(open(f'{work}/{f}', encoding='utf8'))

# ───────── девочка: состояния собраны из сборок build_girl (EXPR=…) ─────────
def girl_pack():
    st = {}
    base = load('rig_girl_grey_st_base.json')
    PUP = {'base': [1, 1], 'roll': [1, 1], 'smirk': [1.05, 1], 'pathos': [1.2, 1], 'sneer': [0.8, 1], 'interest': [1.9, 1.04]}
    TILT = {}
    for s in ('base', 'roll', 'smirk', 'pathos', 'sneer', 'interest'):
        r = load(f'rig_girl_grey_st_{s}.json'); h = r['parts']['head']
        m = re.search(r'<g class="brows">(.*?)</g>', h, re.S)
        mm = re.search(r'<path class="mm" d="([^"]*)"', h).group(1)
        st[s] = {'eyes': r['parts']['eyes_open'], 'brows': m.group(1), 'deco': '', 'mouth': (mm if mm.startswith(STUB) else None) if s != 'base' else None,
                 'pupil': PUP[s], 'tilt': r.get('exprRot', 0)}
    head = re.sub(r'<g class="brows">.*?</g>', '<g class="brows"></g>', base['parts']['head'], 1, re.S) + '<g class="dc"></g>'
    return {'id': 'girl', 'viewBox': base['viewBox'], 'tailProfile': 'girl', 'mouthTable': base['mouthTable'],
            'parts': {'body': base['parts']['body'], 'head': head, 'eyes_closed': base['parts']['eyes_closed']}, 'states': st}

# ───────── кот: глаза и декор строим здесь ─────────
def boy_pack():
    rig = load('rig_opt.json')
    eo = re.findall(r'<path d="([^"]*)" fill="([^"]*)"/>', rig['parts']['eyes_open']); assert len(eo) == 8
    FUR = '#bc82fa'
    def heart_path(cx, cy, w, h):
        U = [(0, .32), [(0, .05), (-.35, -.1), (-.52, .08)], [(-.72, .3), (-.5, .65), (0, 1.0)], [(.5, .65), (.72, .3), (.52, .08)], [(.35, -.1), (0, .05), (0, .32)]]
        T = lambda p: f'{cx + p[0] * w:.1f} {cy + (p[1] - .5) * h:.1f}'
        d = f'M{T(U[0])}'
        for seg in U[1:]: d += 'C' + ' '.join(T(q) for q in seg)
        return d + 'Z'
    center = lambda d: ((lambda b: ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2))(path_from_d(d, Transform()).bounds))
    def scaled(d, k, ox, oy, dx=0, dy=0):
        return to_d(path_from_d(d, Transform().translate(ox + dx, oy + dy).scale(k).translate(-ox, -oy)))
    def eyes(k=.8, gaze=(0, 0), heart_hl=False, hearts=None, hk=62):
        out = ''
        for e in (0, 1):
            iris, rim, pupil, hl = eo[e * 4:e * 4 + 4]
            cx, cy = center(pupil[0]); gx, gy = gaze
            out += f'<path d="{iris[0]}" fill="{iris[1]}"/><path d="{rim[0]}" fill="{rim[1]}"/>'
            if hearts: out += f'<path class="pu" data-x="{cx:.1f}" data-y="{cy + 3:.1f}" d="{heart_path(cx, cy + 3, hk, hk * .92)}" fill="{hearts}"/>'
            else: out += f'<path class="pu" data-x="{cx + gx:.1f}" data-y="{cy + gy:.1f}" d="{scaled(pupil[0], k, cx, cy, gx, gy)}" fill="{pupil[1]}"/>'
            hx, hy = center(hl[0])
            if heart_hl: out += f'<path d="{heart_path(hx + gx, hy + gy, 26, 24)}" fill="#ffffff"/>'
            else: out += f'<path d="{scaled(hl[0], 1, hx, hy, gx, gy)}" fill="{hl[1]}"/>'
            if hearts: out += f'<circle cx="{cx + 17:.1f}" cy="{cy + 24:.1f}" r="6" fill="#ffffff" opacity=".9"/>'
        return out
    def closed_happy():
        return ''.join(f'<path d="M{cx - 52} 318Q{cx} 250 {cx + 52} 318" fill="none" stroke="#0a0606" stroke-width="13" stroke-linecap="round"/>' for cx in (209, 383))
    blush = lambda op: ''.join(f'<ellipse cx="{x}" cy="390" rx="26" ry="13" fill="#ff8fb3" opacity="{op}"/>' for x in (148, 444))
    floating = (f'<path d="{heart_path(522, 140, 34, 31)}" fill="#ff5b8e" transform="rotate(12 522 140)"/><path d="{heart_path(548, 205, 22, 20)}" fill="#ff93b4" transform="rotate(18 548 205)"/>'
                f'<path d="{heart_path(470, 82, 20, 18)}" fill="#ff93b4" transform="rotate(-12 470 82)"/><path d="{heart_path(70, 150, 26, 24)}" fill="#ff93b4" transform="rotate(-16 70 150)"/>')
    S = lambda eyes_, deco, mouth, pupil=(1, 1), tilt=0: {'eyes': eyes_, 'brows': '', 'deco': deco, 'mouth': STUB + mouth if mouth else None, 'pupil': list(pupil), 'tilt': tilt}
    st = {
        'base': S(eyes(.8), '', None),
        'pretend': S(eyes(.8, (-6, 0)), blush(.45), 'M276 366Q296 369 316 362'),                 # делает вид, что всё нормально
        'shy': S(eyes(.8, (-16, -12)), blush(.8), 'M278 364Q296 375 314 364', tilt=-2),                   # отводит взгляд (выбранный вариант)
        'love': S(eyes(hearts='#ff4d86'), blush(.65) + floating, 'M274 363Q296 380 318 363', pupil=(1.0, 1.0)),    # сердечки в зрачках (пульсируют)
        'bliss': S(closed_happy(), blush(.65) + floating, 'M268 362Q296 386 324 362'),                            # блаженные закрытые глаза
    }
    head = rig['parts']['head'] + '<g class="brows"></g><g class="dc"></g>'
    return {'id': 'boy', 'viewBox': rig['viewBox'], 'tailProfile': 'boy', 'mouthTable': rig['mouthTable'],
            'parts': {'body': rig['parts']['body'], 'head': head, 'eyes_closed': rig['parts']['eyes_closed']}, 'states': st}

from merge_markup import merge_markup, count
def lighten(pk):
    """Облегчение: запечь transform и склеить одинаковые по стилю фигуры (см. merge_markup.py) — в разметке частей и во всех состояниях"""
    pk = json.loads(json.dumps(pk))
    for k in pk['parts']: pk['parts'][k] = merge_markup(pk['parts'][k])
    for st in pk['states'].values():
        for f in ('eyes', 'brows', 'deco'): st[f] = merge_markup(st[f]) if st[f] else st[f]
    return pk
for name, pk in (('girl', girl_pack()), ('boy', boy_pack())):
    json.dump(pk, open(f'{work}/pack_{name}_raw.json', 'w', encoding='utf8'), ensure_ascii=False)
    lt = lighten(pk); json.dump(lt, open(f'{work}/pack_{name}.json', 'w', encoding='utf8'), ensure_ascii=False)
    n0 = sum(count(v) for v in pk['parts'].values()) + count(pk['states']['base']['eyes']); n1 = sum(count(v) for v in lt['parts'].values()) + count(lt['states']['base']['eyes'])
    print(name, 'узлов (части + глаза обычного состояния):', n0, '→', n1)
