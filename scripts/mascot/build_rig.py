# Собирает «кота-конструктор» из SVG, выгруженного из .ai: слои, девять форм рта на месте прежнего рта, id клипов с префиксом.
import re, json, sys
import xml.etree.ElementTree as ET
SVGNS = 'http://www.w3.org/2000/svg'
SVG, INK = '{%s}' % SVGNS, '{http://www.inkscape.org/namespaces/inkscape}'
ET.register_namespace('', SVGNS)
work = sys.argv[1]

def load(name):
    return ET.parse(f'{work}/{name}').getroot()

def layer(root, label):
    return [g for g in root if g.tag == SVG + 'g' and g.get(INK + 'label') == label][0]

def clean(el):
    for e in el.iter():
        for k in list(e.attrib):
            if k.startswith(INK) or k.startswith('{'): del e.attrib[k]
    return el

def ser(el):
    return ET.tostring(el, encoding='unicode').replace(' xmlns="%s"' % SVGNS, '')

def inner(el):
    return ''.join(ser(c) for c in el)

def clips_for(root, markup, pre):
    out = {}
    for cid in set(re.findall(r'url\(#(clip_\d+)\)', markup)):
        for cp in root.iter(SVG + 'clipPath'):
            if cp.get('id') == cid: out[cid] = ser(cp)
    return out

default = load('svg_default.svg'); closed = load('svg_closed.svg')

# ── голова: заменить прежний рот (два чёрных штриха, пути 27 и 28) группой «рот» ──
head = clean(layer(default, 'ГОЛОВА'))
parents = {c: p for p in head.iter() for c in p}
paths = list(head.iter(SVG + 'path'))
mouth_old = [p for p in paths if p.get('stroke') == '#000000' and p.get('stroke-width') == '6']
assert len(mouth_old) == 2, len(mouth_old)
CX, CY = 296.4, 358.7          # центр рта в координатах страницы
old_markup = ''.join(ser(p) for p in mouth_old)


def FANG(x, y, h=7, w=4.2):
    """Кошачий клык: маленькая круглая «капля» остриём вниз — кончик скруглён, торчит недалеко (не вампирский)."""
    return (f'<path d="M{x-w:.1f} {y:.1f} L{x+w:.1f} {y:.1f} C{x+w*0.95:.1f} {y+h*0.5:.1f} {x+w*0.5:.1f} {y+h:.1f} {x:.1f} {y+h:.1f} '
            f'C{x-w*0.5:.1f} {y+h:.1f} {x-w*0.95:.1f} {y+h*0.5:.1f} {x-w:.1f} {y:.1f} Z" fill="#ffffff"/>')

K = 'stroke="#000" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"'
KK = 'stroke="#000" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"'
DARK, TONGUE = '#2a1033', '#ff8db5'
VIS = {
 # X — покой: прежний «ω» дизайнера как есть
 'X': f'<g transform="translate({-CX} {-CY})">{old_markup}</g>',
 # A — губы сомкнуты (П, Б, М)
 'A': f'<path d="M-14 1.5 Q0 4.5 14 1.5" fill="none" {K}/>',
 # B — чуть приоткрыт, видны клыки (К, С, Т, и)
 'B': f'<path d="M-16 -3 Q0 -7.5 16 -3 Q14 8.5 0 10.5 Q-14 8.5 -16 -3 Z" fill="{DARK}" {KK}/>' + FANG(-8.4, -5.4, 7) + FANG(8.4, -5.4, 7) + f'<path d="M-16 -3 Q0 -7.5 16 -3" fill="none" {KK}/>',
 # C — открыт (э, а в «cat»)
 'C': f'<path d="M-17 -4 Q0 -9 17 -4 Q19 12 0 14 Q-19 12 -17 -4 Z" fill="{DARK}" {KK}/><path d="M-9 11.5 Q0 5.5 9 11.5 Q0 15.5 -9 11.5 Z" fill="{TONGUE}"/>',
 # D — широко открыт (а в «father»), клыки по краям верхней губы
 'D': f'<path d="M-18 -6 Q0 -12 18 -6 Q22 18 0 22 Q-22 18 -18 -6 Z" fill="{DARK}" {KK}/><ellipse cx="0" cy="15.5" rx="10" ry="5" fill="{TONGUE}"/>' + FANG(-10, -9.2, 8, 4.6) + FANG(10, -9.2, 8, 4.6) + f'<path d="M-18 -6 Q0 -12 18 -6" fill="none" {KK}/>',
 # E — округлый (о, р)
 'E': f'<ellipse cx="0" cy="1" rx="10.5" ry="11.5" fill="{DARK}" {KK}/><ellipse cx="0" cy="7" rx="6" ry="3.6" fill="{TONGUE}"/>',
 # F — вытянутые губы (у, w)
 'F': f'<ellipse cx="0" cy="1" rx="6.5" ry="7.5" fill="{DARK}" {KK}/>',
 # G — клыки опираются на нижнюю губу (Ф, В)
 'G': f'<path d="M-15 -3 Q0 -7.5 15 -3 Q13 6 0 9 Q-13 6 -15 -3 Z" fill="{DARK}" {KK}/><path d="M-12 6 Q0 12.5 12 6" fill="none" {K}/>' + FANG(-7.2, -5.4, 8.5) + FANG(7.2, -5.4, 8.5) + f'<path d="M-15 -3 Q0 -7.5 15 -3" fill="none" {KK}/>',
 # H — язык вверх (л)
 'H': f'<path d="M-15 -4 Q0 -8.5 15 -4 Q17 10 0 12 Q-17 10 -15 -4 Z" fill="{DARK}" {KK}/><path d="M-9.5 -2 Q0 -5 9.5 -2 Q8.5 6.5 0 7.5 Q-8.5 6.5 -9.5 -2 Z" fill="{TONGUE}"/>',
}
# мультяшное преувеличение: в масштабе сцены рот ~10 px, открытие иначе не видно (X — рот дизайнера, не трогаем)
SCALE = 1.5
NOSE_BOTTOM = 349.5                # нижний край носа на странице (pt)
GAP = 5                            # отступ рта от носа, pt
# верх каждой формы вместе с половиной обводки, в локальных единицах до увеличения
TOP = {'A': -1.5, 'B': -8.0, 'C': -9.25, 'D': -11.75, 'E': -13.25, 'F': -9.25, 'G': -8.0, 'H': -9.0}
def wrap(k, v):
    if k == 'X': return v
    # открытый рот «опускается» (как нижняя челюсть), пока верх формы не отойдёт от носа на GAP
    dy = max(0.0, (NOSE_BOTTOM + GAP - CY) - (TOP[k] * SCALE + 3))
    return f'<g transform="translate(0 {3 + dy:.2f}) scale({SCALE})">{v}</g>'
mouth_xml = f'<g class="mouth" transform="translate({CX} {CY})">' + ''.join(
    f'<g class="v" data-v="{k}">{wrap(k, v)}</g>' for k, v in VIS.items()) + '</g>'
m_el = ET.fromstring(f'<g xmlns="{SVGNS}">{mouth_xml}</g>')[0]
p0 = parents[mouth_old[0]]
idx = list(p0).index(mouth_old[0])
p0.remove(mouth_old[1]) if parents[mouth_old[1]] is p0 else parents[mouth_old[1]].remove(mouth_old[1])
p0.remove(mouth_old[0]); p0.insert(idx, m_el)

body = clean(layer(default, 'ТУЛОВИЩЕ'))
_bp = {c: p for p in body.iter() for c in p}
_paths = list(body.iter(SVG + 'path'))
old_tail = _paths[47:54]                          # прежний хвост дизайнера: жёсткая «улитка» вокруг лапы — заменяется новым гибким
assert old_tail[0].get('fill') == '#bb81f9' and old_tail[-1].get('stroke') == '#582e99', 'хвост не там'
for t in old_tail: _bp[t].remove(t)
# рюкзак (оранжевые лямки и сам рюкзак за спиной) — без него; в риге можно вернуть как отдельный слой
PACK = {'#c45110', '#ff6e1d', '#8e2800'}
for t in _paths:
    if t in old_tail: continue
    if t.get('fill') in PACK or t.get('stroke') in PACK: _bp[t].remove(t)
body.insert(0, ET.Element(SVG + 'g', {'class': 'tail'}))   # новый хвост (его рисует tail.mjs) — под всем телом, основание закрыто бедром
eyes_open = clean(layer(default, 'ГЛАЗА ОТКРЫТЫ'))
eyes_closed = clean(layer(closed, 'ГЛАЗА ЗАКРЫТЫ'))

def pack(root, el, tag, pre):
    m = inner(el)
    defs = {pre + k: v.replace(f'id="{k}"', f'id="{pre}{k}"') for k, v in clips_for(root, m, pre).items()}
    m = re.sub(r'url\(#(clip_\d+)\)', lambda mo: f'url(#{pre}{mo.group(1)})', m)
    return m, defs

parts = {}; defs = {}
for name, root, el, pre in [('body', default, body, 'b_'), ('head', default, head, 'h_'), ('eyes_open', default, eyes_open, 'o_'), ('eyes_closed', closed, eyes_closed, 'c_')]:
    parts[name], d = pack(root, el, name, pre); defs.update(d)
out = {'viewBox': [-36, 44, 615, 715], 'mouth': {'cx': CX, 'cy': CY},  'parts': parts, 'defs': ''.join(defs.values()), 'visemes': list(VIS)}
json.dump(out, open(f'{work}/rig.json', 'w', encoding='utf8'), ensure_ascii=False)
print('части:', {k: len(v) for k, v in parts.items()}, 'клипов:', len(defs))
