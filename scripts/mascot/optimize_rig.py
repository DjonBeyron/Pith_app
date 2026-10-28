# Оптимизация геометрии кота (rig.json → rig_opt.json): то, что в рисунке дизайнера лишнее для экрана, а не то, что видно глазу.
#  1) координаты «запекаются»: у каждого пути была своя matrix(1,0,0,-1,…) — теперь все пути сразу в координатах рига (без transform);
#  2) клипы: «обрезка по странице» — пустышка (убираем); обрезка по форме тела/головы — запекается булевой операцией (пересечение);
#  3) заливка + обводка одного контура (два узла) → один узел с fill и stroke;
#  4) соседние пути одного цвета склеиваются в один (объединением контуров);
#  5) координаты округляются до 0.1 (при масштабе спрайта ~0.3 это 0.03 px);
#  6) рот: 9 групп форм (30 путей) → 4 постоянных узла, формы — таблицей d (меняются из JS, а не показом/скрытием групп).
import json, re, sys
import xml.etree.ElementTree as ET
import pathops
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform
from fontTools.svgLib.path import parse_path

work = sys.argv[1]
SVGNS = 'http://www.w3.org/2000/svg'; SVG = '{%s}' % SVGNS
ET.register_namespace('', SVGNS)
CAP = {'butt': pathops.LineCap.BUTT_CAP, 'round': pathops.LineCap.ROUND_CAP, 'square': pathops.LineCap.SQUARE_CAP}
JOIN = {'miter': pathops.LineJoin.MITER_JOIN, 'round': pathops.LineJoin.ROUND_JOIN, 'bevel': pathops.LineJoin.BEVEL_JOIN}
PAGE_CLIP = 'M0 841.89H595.276V0H0Z'

def num(v):
    s = ('%.1f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s
def to_d(path):
    pen = SVGPathPen(None, ntos=num); path.draw(pen); return pen.getCommands()

def parse_transform(s):
    t = Transform()
    for name, args in re.findall(r'(\w+)\(([^)]*)\)', s or ''):
        a = [float(x) for x in re.split(r'[\s,]+', args.strip()) if x]
        if name == 'matrix': t = t.transform(a)
        elif name == 'translate': t = t.translate(a[0], a[1] if len(a) > 1 else 0)
        elif name == 'scale': t = t.scale(a[0], a[-1])
        else: raise ValueError(name)
    return t

def path_from_d(d, t):
    p = pathops.Path(); parse_path(d, TransformPen(p.getPen(), t)); return p
def ellipse_d(cx, cy, rx, ry):
    k = 0.5522847498
    return (f'M{cx+rx} {cy}C{cx+rx} {cy+k*ry} {cx+k*rx} {cy+ry} {cx} {cy+ry}C{cx-k*rx} {cy+ry} {cx-rx} {cy+k*ry} {cx-rx} {cy}'
            f'C{cx-rx} {cy-k*ry} {cx-k*rx} {cy-ry} {cx} {cy-ry}C{cx+k*rx} {cy-ry} {cx+rx} {cy-k*ry} {cx+rx} {cy}Z')

def stroke_outline(path, el, scale=1.0):
    w = float(el.get('stroke-width', '1')) * scale
    o = pathops.Path(path)
    o.stroke(w, CAP[el.get('stroke-linecap', 'butt')], JOIN[el.get('stroke-linejoin', 'miter')], float(el.get('stroke-miterlimit', '10')))
    return o

def union(paths):
    r = pathops.Path()
    for p in paths: r.addPath(p)
    r.simplify(fix_winding=True); return r
def intersect(a, b):
    return pathops.op(a, b, pathops.PathOp.INTERSECTION, fix_winding=True)

def clips_of(defs_xml):
    out = {}
    for m in re.finditer(r'<clipPath id="([^"]+)">\s*<path transform="([^"]+)" d="([^"]+)"\s*/>', defs_xml):
        cid, tr, d = m.groups()
        out[cid] = None if d.strip() == PAGE_CLIP else path_from_d(d, parse_transform(tr))
    return out

def walk(el, clip=None):
    for c in el:
        if c.tag == SVG + 'g':
            cp = c.get('clip-path'); yield from walk(c, re.search(r'#([^)]+)', cp).group(1) if cp else clip)
        elif c.tag == SVG + 'path': yield c, clip

def items_of(part_xml, clips, skip_classes=()):
    """Список {kind:'fill'|'stroke', geom:Path, color, sw?, ...} в порядке рисования, всё в координатах рига и уже без клипов"""
    root = ET.fromstring(f'<g xmlns="{SVGNS}">{part_xml}</g>')
    items = []
    for p, clip in walk(root):
        t = parse_transform(p.get('transform'))
        g = path_from_d(p.get('d'), t)
        fill, stroke = p.get('fill'), p.get('stroke')
        if fill is None and stroke is None: fill = '#000000'   # SVG по умолчанию красит чёрным (закрытые глаза)
        cp = clips.get(clip) if clip else None
        if fill and fill != 'none':
            geom = g if cp is None else intersect(g, cp)
            if geom.area or len(list(geom.segments)): items.append({'fill': fill, 'geom': geom, 'src': g, 'clipped': cp is not None})
        if stroke and stroke != 'none':
            o = stroke_outline(g, p)
            if cp is not None:
                o = intersect(o, cp)
                if not len(list(o.segments)): continue
                items.append({'fill': stroke, 'geom': o, 'clipped': True})   # обрезанная обводка → заливка контура
            else:
                items.append({'stroke': stroke, 'geom': g, 'sw': p.get('stroke-width'), 'cap': p.get('stroke-linecap', 'butt'), 'join': p.get('stroke-linejoin', 'miter'), 'src': g})
    return items

def merge_twins(items):
    """Заливка + обводка одного и того же контура → один узел (fill и stroke); порядок рисования сохраняется"""
    out = []; i = 0
    while i < len(items):
        a = items[i]; b = items[i + 1] if i + 1 < len(items) else None
        if b and 'fill' in a and 'stroke' in b and not a['clipped'] and to_d(a['src']) == to_d(b['src']):
            out.append({'fill': a['fill'], 'stroke': b['stroke'], 'sw': b['sw'], 'cap': 'round', 'join': 'round', 'geom': a['geom']}); i += 2
        else: out.append(a); i += 1
    return out

def merge_runs(items):
    """Соседние узлы одного стиля → один (заливки объединяются булевой операцией, обводки — просто в один d)"""
    out = []
    for it in items:
        p = out[-1] if out else None
        same_fill = p and 'fill' in it and 'stroke' not in it and 'fill' in p and 'stroke' not in p and p['fill'] == it['fill']
        same_stroke = p and 'stroke' in it and 'fill' not in it and 'stroke' in p and 'fill' not in p and all(p[k] == it[k] for k in ('stroke', 'sw', 'cap', 'join'))
        if same_fill: p['geom'] = union([p['geom'], it['geom']])
        elif same_stroke:
            r = pathops.Path(); r.addPath(p['geom']); r.addPath(it['geom']); p['geom'] = r   # обводки не объединяем (не склеиваем контуры), просто в один d
        else: out.append(dict(it))
    return out

def emit(items):
    out = []
    for it in items:
        d = to_d(it['geom'])
        if 'stroke' in it:
            fillattr = f' fill="{it["fill"]}"' if 'fill' in it else ' fill="none"'
            out.append(f'<path d="{d}"{fillattr} stroke="{it["stroke"]}" stroke-width="{it["sw"]}" stroke-linecap="{it["cap"]}" stroke-linejoin="{it["join"]}"/>')
        else: out.append(f'<path d="{d}" fill="{it["fill"]}"/>')
    return ''.join(out)

def optimize(part_xml, clips):
    return emit(merge_runs(merge_twins(items_of(part_xml, clips))))

# ── рот: девять форм → таблица для четырёх постоянных узлов ──
def mouth_table(mouth_xml):
    root = ET.fromstring(f'<g xmlns="{SVGNS}">{mouth_xml}</g>')[0]
    base = parse_transform(root.get('transform'))
    table = {}
    for vg in root:
        key = vg.get('data-v'); parts = {'m': None, 't': [], 'f': [], 'l': []}; strokes = []
        def visit(el, tr):
            for c in el:
                t2 = tr.transform(parse_transform(c.get('transform')))   # внешнее ∘ внутреннее, как в SVG
                if c.tag == SVG + 'g': visit(c, t2); continue
                if c.tag == SVG + 'ellipse': d = ellipse_d(float(c.get('cx')), float(c.get('cy')), float(c.get('rx')), float(c.get('ry')))
                else: d = c.get('d')
                geom = path_from_d(d, t2); sc = t2[0]   # масштаб (равномерный)
                fill, stroke = c.get('fill'), c.get('stroke')
                if fill == '#2a1033': parts['m'] = {'g': geom, 'fill': fill, 'sw': float(c.get('stroke-width')) * sc}
                elif fill == '#ff8db5': parts['t'].append(geom)
                elif fill == '#ffffff': parts['f'].append(geom)
                else: strokes.append((geom, float(c.get('stroke-width')) * sc))
        visit(vg, base)
        add = lambda ps: to_d(union(ps)) if ps else ''
        if parts['m']: l = strokes     # линия верхней губы поверх клыков
        else: parts['m'] = {'g': None}; l = []
        entry = {'t': add(parts['t']), 'f': add(parts['f'])}
        if parts['m'].get('g') is not None: entry['m'] = {'d': to_d(parts['m']['g']), 'fill': '#2a1033', 'sw': round(parts['m']['sw'], 2)}
        else:   # X и A: линии рта без заливки
            r = pathops.Path()
            for g, _ in strokes: r.addPath(g)
            entry['m'] = {'d': to_d(r), 'fill': 'none', 'sw': round(strokes[0][1], 2)}
        if l:
            r = pathops.Path()
            for g, _ in l: r.addPath(g)
            entry['l'] = {'d': to_d(r), 'sw': round(l[0][1], 2)}
        table[key] = entry
    return table

if __name__ == '__main__':
    rig = json.load(open(f'{work}/rig.json', encoding='utf8'))
    out = {k: v for k, v in rig.items()}
    # клипы: id с префиксами b_/h_/o_/c_ — берём из общего defs
    clips = clips_of(rig['defs'])
    parts = {}
    for name, xml in rig['parts'].items():
        if name == 'body':
            m = re.match(r'(<g class="tail">.*?</g>)(.*)$', xml, re.S)   # хвост рисует tail.mjs — не трогаем
            parts[name] = m.group(1) + optimize(m.group(2), clips)
        elif name == 'head':
            i = xml.index('<g class="mouth"')
            # рот — в конце головы: находим его закрывающий </g> по балансу тегов
            depth = 0; j = i
            for mo in re.finditer(r'<g\b|</g>', xml[i:]):
                depth += 1 if mo.group().startswith('<g') else -1
                if depth == 0: j = i + mo.end(); break
            mouth_xml, rest = xml[i:j], xml[:i] + '<path d="M0 0L1 0L0 1Z" fill="#MOUTH"/>' + xml[j:]   # метка места рта в порядке рисования
            table = mouth_table(mouth_xml); out['mouthTable'] = table
            x = table['X']
            node = (f'<g class="mouth"><path class="mm" d="{x["m"]["d"]}" fill="{x["m"]["fill"]}" stroke="#000" stroke-width="{x["m"]["sw"]}" stroke-linecap="round" stroke-linejoin="round"/>'
                    f'<path class="mt" d="" fill="#ff8db5"/><path class="mf" d="" fill="#ffffff"/>'
                    f'<path class="ml" d="" fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round"/></g>')
            parts[name] = re.sub(r'<path d="[^"]*" fill="#MOUTH"/>', lambda _: node, optimize(rest, clips))
        else: parts[name] = optimize(xml, clips)
    out['parts'] = parts; out['defs'] = ''
    cx, cy = rig['mouth']['cx'], rig['mouth']['cy']
    json.dump(out, open(f'{work}/rig_opt.json', 'w', encoding='utf8'), ensure_ascii=False)
    for k, v in parts.items(): print(k, 'путей:', v.count('<path'), 'символов:', len(v), '(было', rig['parts'][k].count('<path'), 'путей,', len(rig['parts'][k]), 'символов)')
    print('форм рта:', len(out['mouthTable']), 'клипов:', 0)
