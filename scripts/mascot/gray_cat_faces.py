# Лица (состояния мимики) серой кошки — те же, что у Мии: обычное, «закатила глаза», ухмылка, пафос, презрение, увлечена.
# Состояние = глаза (веко и взгляд) + брови + рот в покое + наклон головы + реакция зрачка. Наклон, реакцию зрачка и рот в покое берём из mia.json как есть
# (рот сдвинут под рот этой кошки), а веки, взгляд и брови подобраны под её глаза: круглые, янтарные, зрачок-щель.
# Бровей у кошки на рисунке нет — их роль играют три светлых волоска над каждым глазом: в разных лицах они поднимаются, опускаются и наклоняются.
import re
from gray_cat_details import *

DX, DY = F(521, 592)[0] - 296.4, F(521, 592)[1] - 348.9           # сдвиг формул рта Мии под рот этой кошки (так же сдвинута таблица форм)
# lid — доля высоты радужки под веком; gaze — сдвиг взгляда (px рисунка); brows — (сдвиг по y в единицах спрайта, поворот °) для левой и правой стороны
FACES = {
    'base':     dict(lid=0.00, gaze=(0, 0),    brows=((0, 0), (0, 0))),
    'roll':     dict(lid=0.12, gaze=(0, -30),  brows=((-10, 0), (-10, 0))),                 # зрачки вверх под веки, брови высоко
    'smirk':    dict(lid=0.30, gaze=(22, 0),   brows=((-13, -4), (3, 0))),                  # взгляд искоса, левая бровь высоко, правая ниже
    'pathos':   dict(lid=0.47, gaze=(0, 14),   brows=((-9, 0), (-9, 0))),                   # полуприкрытые веки, взгляд сверху вниз
    'sneer':    dict(lid=0.62, gaze=(24, 10),  brows=((6, 12), (6, -12))),                  # прищур, брови сдвинуты книзу к носу
    'interest': dict(lid=0.00, gaze=(10, 0),   brows=((-6, -3), (-6, 3))),                  # любопытный взгляд, брови чуть вверх (зрачок расширяет движок)
}

def eye_markup(side, lid, gaze, fur, ol):
    e = eye(side, lid, gaze); px, py = e['pc']; fill = lambda p: f'<path d="{p[0]}" fill="{p[1]}"/>'
    out = (fill(e['sil']) + fill(e['amber']) + fill(e['core']) + f'<path class="pu" data-x="{px:.1f}" data-y="{py:.1f}" d="{e["pupil"][0]}" fill="{e["pupil"][1]}"/>'
           + ''.join(fill(h) for h in e['hl']))
    if e['lid']:
        out += f'<path d="{e["lid"][0]}" fill="{fur}"/><path d="{e["lid"][1]}" fill="none" stroke="{ol}" stroke-width="5.2" stroke-linecap="round"/>'
    return out

def brows_markup(hairs, params):
    """Волоски-брови: каждая сторона поворачивается вокруг своего центра и сдвигается; сторона — по средней x пути относительно оси морды (296)"""
    sides = {'l': [], 'r': []}
    for d, c in hairs:
        xs = [float(v) for v in re.findall(r'-?\d*\.?\d+', d)][0::2]
        sides['l' if sum(xs) / len(xs) < 296 else 'r'].append((d, c))
    out = ''
    for side, (dy, rot) in zip('lr', params):
        pts = [float(v) for d, _ in sides[side] for v in re.findall(r'-?\d*\.?\d+', d)]
        cx, cy = sum(pts[0::2]) / len(pts[0::2]), sum(pts[1::2]) / len(pts[1::2])
        for d, c in sides[side]: out += f'<path d="{rot_move(d, rot, cx, cy, 0, dy) if (dy or rot) else d}" fill="{c}"/>'
    return out

def build_states(mia_states, fur='#646774', ol='#262432'):
    hairs = brow_hairs(); res = {}
    for name, f in FACES.items():
        m = mia_states[name]
        res[name] = dict(eyes=eye_markup('l', f['lid'], f['gaze'], fur, ol) + eye_markup('r', f['lid'], (-f['gaze'][0] if name == 'sneer' else f['gaze'][0], f['gaze'][1]), fur, ol),
                         brows=brows_markup(hairs, f['brows']), deco='', mouth=shift_path(m['mouth'], DX, DY) if m['mouth'] else None,
                         pupil=m['pupil'], tilt=m['tilt'])
    return res
