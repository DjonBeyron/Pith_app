# Кетти (прежняя Мия, скин mia): украшения после правок владельца (2026-11-01). Правит готовый sprites/mascot/mia.json (конвейер .ai → спрайт для этого не нужен):
#   • голова: колечко и звёздочки в ушах убраны, вместо них нежно-розовые пентаграммы (пятиконечные звёздочки, нарисованные линией) на обоих ушах;
#   • тело: ошейник менее массивный (ниже на 28% и уже на 10%, обводка тоньше), кулон-сердечко заменён жетоном-пятиугольником.
# Идемпотентно: повторный запуск ничего не меняет (ошейник и кулон узнаются по исходным координатам). Использование: python3 ketty_accessories.py (из любой папки).
import json, math, os, re
HERE = os.path.dirname(os.path.abspath(__file__)); PATH = f'{HERE}/../../src/features/scene/v2/sprites/mascot/mia.json'
PENT_FILL, PENT_EDGE = '#ffd3e2', '#e0709a'                   # пентаграммы: нежно-розовая заливка и розовая линия
EARS = ((123.9, 156.0), (470.0, 160.2))                        # центры прежних звёздочек
COLLAR_K = (0.90, 0.72); COLLAR_ORIGIN = (303.0, 442.0)         # ошейник: масштаб по x и по y вокруг точки у верха ленты
BADGE = dict(cx=303.0, cy=481.0, r=16.0)                       # жетон: правильный пятиугольник вершиной вниз, верхняя грань касается ленты

def pentagram(cx, cy, r=16.0):
    v = [(cx + r * math.cos(math.radians(-90 + 72 * k)), cy + r * math.sin(math.radians(-90 + 72 * k))) for k in range(5)]
    d = 'M' + 'L'.join('%.1f %.1f' % v[i] for i in (0, 2, 4, 1, 3)) + 'Z'
    return f'<path d="{d}" fill="{PENT_FILL}" stroke="{PENT_EDGE}" stroke-width="3" stroke-linejoin="round"/>'

def badge(cx, cy, r):
    v = [(cx + r * math.cos(math.radians(90 + 72 * k)), cy + r * math.sin(math.radians(90 + 72 * k))) for k in range(5)]
    d = 'M' + 'L'.join('%.1f %.1f' % p for p in v) + 'Z'
    return (f'<path d="{d}" fill="#f58aaa" stroke="#8f1f4a" stroke-width="3.5" stroke-linejoin="round"/>'
            f'<path d="M{cx - r * .55:.1f} {cy - r * .3:.1f}L{cx - r * .2:.1f} {cy - r * .55:.1f}" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.85"/>')

def scale_abs(d, kx, ky, ox, oy):
    nums = re.findall(r'[A-Za-z]|-?\d*\.?\d+', d); out = []; i = 0
    for t in nums:
        if t.isalpha(): out.append(t); i = 0; continue
        v = float(t); v = ox + (v - ox) * kx if i % 2 == 0 else oy + (v - oy) * ky; out.append('%.1f' % v); i += 1
    return ' '.join(out)

def patch_head(head):
    i = head.index('<g class="girl-deco">'); j = head.index('<g class="brows">', i)
    return head[:i] + '<g class="girl-deco">' + ''.join(pentagram(*c) for c in EARS) + head[j:]

def patch_body(body):
    if 'd="M216.7 442.2C213.8' not in body: return body           # уже переделано
    body = re.sub(r'(<path d=")(M216\.7 442\.2[^"]*)("( fill="#e2457c"/>| fill="none" stroke="#8f1f4a" stroke-width=")7?)',
                  lambda m: m.group(1) + scale_abs(m.group(2), *COLLAR_K, *COLLAR_ORIGIN) + m.group(3), body)
    body = body.replace('fill="none" stroke="#8f1f4a" stroke-width="7" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M303 512', 'fill="none" stroke="#8f1f4a" stroke-width="5" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M303 512', 1)
    # кулон: сердечко и его блик → жетон
    body = re.sub(r'<path d="M303 512C[^>]*/><path d="M293 484C[^>]*/>', badge(**BADGE), body, count=1)
    return body

m = json.load(open(PATH, encoding='utf8')); h, b = patch_head(m['head']), patch_body(m['body'])
print('изменено' if (h, b) != (m['head'], m['body']) else 'ничего не менял')
m['head'], m['body'] = h, b; json.dump(m, open(PATH, 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
