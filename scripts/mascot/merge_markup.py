# Облегчение разметки (узлов DOM): запекает transform в контуры, превращает ellipse/circle в пути и склеивает одноимённые фигуры одного стиля (заливки — объединением
# контуров, обводки — в один d). Склеиваются не только соседние, но и «через» фигуры, чьи габариты не пересекаются с переносимой (порядок рисования не нарушается).
import re, math
import pathops
from fontTools.misc.transform import Transform
from optimize_rig import to_d, path_from_d, ellipse_d

TOK = re.compile(r'<[^>]+>|[^<]+')
ATTR = re.compile(r'([\w:-]+)="([^"]*)"')

def parse_transform(s):
    t = Transform()
    for name, args in re.findall(r'(\w+)\(([^)]*)\)', s or ''):
        a = [float(x) for x in re.split(r'[\s,]+', args.strip()) if x]
        if name == 'matrix': t = t.transform(a)
        elif name == 'translate': t = t.translate(a[0], a[1] if len(a) > 1 else 0)
        elif name == 'scale': t = t.scale(a[0], a[-1])
        elif name == 'rotate': t = t.translate(a[1], a[2]).rotate(math.radians(a[0])).translate(-a[1], -a[2]) if len(a) == 3 else t.rotate(math.radians(a[0]))
        else: raise ValueError(name)
    return t

def tree(xml):
    root = {'tag': None, 'kids': []}; stack = [root]
    for t in TOK.findall(xml):
        if t.startswith('</'): stack.pop(); continue
        if t.startswith('<'):
            m = re.match(r'<([\w:-]+)([^>]*?)(/?)>$', t); tag, attrs, selfc = m.groups()
            node = {'tag': tag, 'a': dict(ATTR.findall(attrs)), 'kids': []}
            stack[-1]['kids'].append(node)
            if not selfc: stack.append(node)
        else: stack[-1]['kids'].append({'tag': '#text', 'text': t})
    return root

def as_path(n, T):
    """Элемент → ('path', attrs, Path) с применённым преобразованием T; None, если форма не поддерживается"""
    a = dict(n['a']); tag = n['tag']
    if tag == 'ellipse': d = ellipse_d(float(a['cx']), float(a['cy']), float(a['rx']), float(a['ry'])); [a.pop(k) for k in ('cx', 'cy', 'rx', 'ry')]
    elif tag == 'circle': d = ellipse_d(float(a['cx']), float(a['cy']), float(a['r']), float(a['r'])); [a.pop(k) for k in ('cx', 'cy', 'r')]
    elif tag == 'path': d = a.pop('d')
    else: return None
    own = parse_transform(a.pop('transform', ''))
    TT = T.transform(own)
    if 'stroke-width' in a: a['stroke-width'] = '%g' % round(float(a['stroke-width']) * math.sqrt(abs(TT[0] * TT[3] - TT[1] * TT[2])), 2)
    if 'data-x' in a:
        a['data-x'], a['data-y'] = ['%.1f' % v for v in TT.transformPoint((float(a['data-x']), float(a['data-y'])))]
    return a, path_from_d(d, TT)

def flatten(kids, T=Transform()):
    """Запекает transform у <g> без класса и у отдельных фигур; остальные группы (с классом) остаются барьерами"""
    out = []
    for n in kids:
        if n['tag'] == '#text': out.append(n); continue
        if n['tag'] == 'g' and 'class' not in n['a']:
            out += flatten(n['kids'], T.transform(parse_transform(n['a'].get('transform', ''))))
        elif n['tag'] == 'g': n['kids'] = flatten(n['kids']); out.append(n)
        elif n['tag'] in ('path', 'ellipse', 'circle') and ('class' not in n['a'] or T != Transform() or 'transform' in n['a']):
            a, p = as_path(n, T); out.append({'tag': 'path', 'a': a, 'path': p, 'kids': []})   # (класс, например pu, сохраняется — такая фигура не склеивается)
        else: out.append(n)
    return out

def bbox(n):
    b = n['path'].bounds; m = float(n['a'].get('stroke-width', 0)) / 2 + (3 if 'stroke' in n['a'] and n['a'].get('stroke') != 'none' else 0)
    return (b[0] - m, b[1] - m, b[2] + m, b[3] + m)
def hit(a, b): return not (a[2] < b[0] or b[2] < a[0] or a[3] < b[1] or b[3] < a[1])

def mergeable(n):
    a = n['a']
    return n['tag'] == 'path' and 'path' in n and 'class' not in a and not any(k.startswith('data-') for k in a) and 'transform' not in a and (
        ('stroke' not in a or a['stroke'] == 'none') or a.get('fill', 'none') == 'none')

def merge_sibs(kids):
    out = []
    for n in kids:
        if n['tag'] == 'g' and 'path' not in n: n['kids'] = merge_sibs(n['kids']); out.append(n); continue
        if not (n['tag'] == 'path' and 'path' in n): out.append(n); continue
        n['bb'] = bbox(n)
        if not mergeable(n): out.append(n); continue    # (класс/данные: не склеивается, но служит препятствием по габаритам)
        key = tuple(sorted(n['a'].items()))
        j = len(out) - 1; target = None
        while j >= 0:
            y = out[j]
            if y['tag'] == 'path' and 'path' in y and 'bb' in y:
                if 'key' in y and y.get('key') == key and not (float(n['a'].get('opacity', 1)) < 1 and hit(y['bb'], n['bb'])): target = j; break
                if hit(y['bb'], n['bb']): break           # мешает перенести: перекрывается
                j -= 1
            else: break                                   # барьер (группа/текст)
        if target is None: n['key'] = key; out.append(n); continue
        y = out[target]; pa, pb = y['path'], n['path']
        if 'stroke' in y['a'] and y['a'].get('stroke') != 'none':
            r = pathops.Path(); r.addPath(pa); r.addPath(pb); y['path'] = r
        else:
            r = pathops.Path(); r.addPath(pa); r.addPath(pb); r.simplify(fix_winding=True); y['path'] = r
        y['bb'] = (min(y['bb'][0], n['bb'][0]), min(y['bb'][1], n['bb'][1]), max(y['bb'][2], n['bb'][2]), max(y['bb'][3], n['bb'][3]))
    return out

def emit(kids):
    s = ''
    for n in kids:
        if n['tag'] == '#text': s += n['text']
        elif 'path' in n:
            a = ' '.join(f'{k}="{v}"' for k, v in n['a'].items())
            s += f'<path d="{to_d(n["path"])}" {a}/>'
        elif n['tag'] == 'g': s += '<g' + ''.join(f' {k}="{v}"' for k, v in n['a'].items()) + '>' + emit(n['kids']) + '</g>'
        else: s += '<' + n['tag'] + ''.join(f' {k}="{v}"' for k, v in n['a'].items()) + '/>'
    return s

def merge_markup(xml):
    if not xml: return xml
    root = tree(xml)
    return emit(merge_sibs(flatten(root['kids'])))

def count(xml): return len(re.findall(r'<(?:path|ellipse|circle|g|rect)\b', xml or ''))
