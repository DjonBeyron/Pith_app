# Лица (состояния мимики) серой кошки — те же, что у Мии: обычное, «закатила глаза», ухмылка, пафос, презрение, увлечена.
# Состояние = глаза (веко и взгляд) + брови + рот в покое + наклон головы + реакция зрачка. Наклон, реакцию зрачка и рот в покое берём из mia.json как есть
# (рот сдвинут под рот этой кошки), а веки, взгляд и брови подобраны под её глаза: круглые, янтарные, зрачок-щель.
# Бровей у кошки на рисунке нет — их роль играют три светлых волоска над каждым глазом: в разных лицах они поднимаются, опускаются и наклоняются.
import re
from gray_cat_details import *

DX, DY = F(521, 592)[0] - 296.4, F(521, 592)[1] - 348.9           # сдвиг формул рта Мии под рот этой кошки (так же сдвинута таблица форм)
# lid — какая доля верхней половины глаза закрыта веком; slant — скос века к носу; gaze — сдвиг взгляда (px рисунка); brows — (сдвиг по y в единицах спрайта, поворот °)
# для левой и правой стороны. pupil — свой масштаб зрачка, если не брать из Мии (у этой кошки зрачок-щель шире, поэтому «увлечена» мягче: круглый, не «монета»)
FACES = {
    'base':     dict(lid=0.00, gaze=(0, 0),    brows=((0, 0), (0, 0))),
    'roll':     dict(lid=0.10, gaze=(0, -30),  brows=((-1, 0), (-1, 0))),                   # зрачки вверх под веки, брови высоко
    'smirk':    dict(lid=0.30, gaze=(22, 0),   brows=((-4, -4), (12, 0))),                  # взгляд искоса, левая бровь высоко, правая ниже
    'pathos':   dict(lid=0.40, gaze=(0, 10),   brows=((0, 0), (0, 0))),                     # полуприкрытые веки, взгляд сверху вниз (брови уже высоко, как в обычном лице)
    'sneer':    dict(lid=0.30, slant=0.30, gaze=(24, 8), brows=((15, 12), (15, -12))),      # прищур со скосом к носу, брови сдвинуты книзу
    'grump':    dict(lid=0.46, slant=0.22, half_moon=True, gaze=(0, 7), brows=((17, 12), (17, -12)), pupil=[1.0, 1.0], tilt=0,       # «недовольство» (по фото хмурого кота): тяжёлые веки, внутренние уголки ниже, брови сдвинуты к носу,
                       mouth='M296 349V361M272 373Q296 361 320 373'),                                            # маленький рот уголками вниз; взгляд прямо и чуть вниз
    'interest': dict(lid=0.00, gaze=(0, 0),    brows=((3, -3), (3, 3)), pupil=[1.55, 1.0]),   # внимательный взгляд прямо, зрачок круглеет
}

def eye_markup(side, lid, gaze, slant, fur, ol, half_moon=False):
    e = eye(side, lid, gaze, slant, half_moon); px, py = e['pc']; fill = lambda p: f'<path d="{p[0]}" fill="{p[1]}"/>'
    out = (fill(e['sil']) + fill(e['amber']) + fill(e['core']) + f'<path class="pu" data-x="{px:.1f}" data-y="{py:.1f}" d="{e["pupil"][0]}" fill="{e["pupil"][1]}"/>'
           + ''.join(fill(h) for h in e['hl']))
    if e['lid']:
        out += f'<path d="{e["lid"][0]}" fill="{fur}"/><path d="{e["lid"][1]}" fill="none" stroke="{ol}" stroke-width="5.2" stroke-linecap="round"/>'
    return out

def _brow_path(d, c, w):
    """Бровь — линия (w > 0) или залитое пятно осветлённой шерсти под ней (w = 0)"""
    return f'<path d="{d}" fill="{c}"/>' if not w else f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{w}" stroke-linecap="round"/>'

def brows_markup(hairs, params):
    """Волоски-брови: каждая сторона поворачивается вокруг своего центра и сдвигается; сторона — по средней x пути относительно оси морды (296)"""
    sides = {'l': [], 'r': []}
    for d, c, w in hairs:
        xs = [float(v) for v in re.findall(r'-?\d*\.?\d+', d)][0::2]
        sides['l' if sum(xs) / len(xs) < 296 else 'r'].append((d, c, w))
    out = ''
    for side, (dy, rot) in zip('lr', params):
        pts = [float(v) for d, _, _ in sides[side] for v in re.findall(r'-?\d*\.?\d+', d)]
        cx, cy = sum(pts[0::2]) / len(pts[0::2]), sum(pts[1::2]) / len(pts[1::2])
        for d, c, w in sides[side]: out += _brow_path(rot_move(d, rot, cx, cy, 0, dy) if (dy or rot) else d, c, w)
    return out

def brow_pack(hairs):
    """Брови для плавной анимации в странице-плеере: волоски по сторонам (разметка без поворота) и центр поворота каждой стороны. Состояния хранят только параметры
    (сдвиг, поворот) в поле brow — страница сама переходит между ними плавно"""
    sides = {'l': [], 'r': []}
    for d, c, w in hairs:
        xs = [float(v) for v in re.findall(r'-?\d*\.?\d+', d)][0::2]; sides['l' if sum(xs) / len(xs) < 296 else 'r'].append((d, c, w))
    pack = {}; piv = {}
    for s, items in sides.items():
        pts = [float(v) for d, _, _ in items for v in re.findall(r'-?\d*\.?\d+', d)]
        piv[s] = [sum(pts[0::2]) / len(pts[0::2]), sum(pts[1::2]) / len(pts[1::2])]
        pack[s] = ''.join(_brow_path(d, c, w) for d, c, w in items)
    return pack, piv

def build_states(mia_states, fur='#646774', ol='#262432'):
    hairs = brow_hairs(); res = {}
    for name, f in FACES.items():
        m = mia_states.get(name, {})                                                    # у нового лица (grump) нет прототипа у Кетти — рот, зрачок и наклон заданы в FACES
        mouth = f.get('mouth', m.get('mouth'))
        res[name] = dict(eyes=eye_markup('l', f['lid'], f['gaze'], f.get('slant', 0), fur, ol, f.get('half_moon', False)) + eye_markup('r', f['lid'], (-f['gaze'][0] if name == 'sneer' else f['gaze'][0], f['gaze'][1]), f.get('slant', 0), fur, ol, f.get('half_moon', False)),
                         brows=brows_markup(hairs, f['brows']), deco='', mouth=shift_path(mouth, DX, DY) if mouth else None,
                         pupil=f.get('pupil', m.get('pupil', [1, 1])), tilt=f.get('tilt', m.get('tilt', 0)), brow=[list(p) for p in f['brows']])
    return res
