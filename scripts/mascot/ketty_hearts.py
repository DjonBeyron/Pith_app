# Кетти (прежняя Мия, скин mia): серьги — без колечка в левом ухе, а звёздочки-камешки заменены нежно-розовыми сердечками.
# Правит готовый sprites/mascot/mia.json (разметка головы, группа girl-deco): конвейер .ai → спрайт для этого не нужен. Идемпотентно (повторный запуск ничего не меняет).
# Использование: python3 ketty_hearts.py   (из любой папки). Те же сердечки рисует earrings() в build_girl.py — при пересборке рига получится то же самое.
import json, os, re
HERE = os.path.dirname(os.path.abspath(__file__)); PATH = f'{HERE}/../../src/features/scene/v2/sprites/mascot/mia.json'
FILL, EDGE, SHINE = '#ffc9db', '#e58aa8', '#ffffff'      # нежно-розовая заливка, чуть темнее обводка (тоньше, чем у звёздочек), блик

def heart(cx, cy, w=27, h=25):
    P = lambda dx, dy: '%.1f %.1f' % (cx + dx * w, cy + dy * h)
    d = (f'M{P(0, .5)}C{P(-.1, .38)} {P(-.5, .2)} {P(-.5, -.12)}C{P(-.5, -.42)} {P(-.16, -.5)} {P(0, -.24)}C{P(.16, -.5)} {P(.5, -.42)} {P(.5, -.12)}C{P(.5, .2)} {P(.1, .38)} {P(0, .5)}Z')
    sh = f'M{cx - w * .3:.1f} {cy - h * .02:.1f}C{cx - w * .32:.1f} {cy - h * .2:.1f} {cx - w * .2:.1f} {cy - h * .3:.1f} {cx - w * .08:.1f} {cy - h * .26:.1f}'
    return (f'<path d="{d}" fill="{FILL}" stroke="{EDGE}" stroke-width="3.4" stroke-linejoin="round"/>'
            f'<path d="{sh}" fill="none" stroke="{SHINE}" stroke-width="2.6" stroke-linecap="round" opacity="0.9"/>')

def patch(head):
    i = head.index('<g class="girl-deco">'); j = head.index('<g class="brows">', i); deco = head[i:j]
    items = re.findall(r'<(?:path|ellipse|circle)[^>]*/>', deco)
    if len(items) != 11: return head                                             # уже переделано (или другая структура)
    centers = []
    for k in (5, 8):                                                              # звёздочки: считаем центр по вершинам обводки
        pts = [float(v) for v in re.findall(r'-?\d*\.?\d+', re.search(r' d="([^"]*)"', items[k]).group(1))]
        xs, ys = pts[0::2], pts[1::2]; centers.append(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2))
    new = '<g class="girl-deco">' + ''.join(heart(cx, cy) for cx, cy in centers)
    return head[:i] + new + head[j:]

m = json.load(open(PATH, encoding='utf8')); h2 = patch(m['head'])
print('изменено' if h2 != m['head'] else 'уже готово (ничего не менял)')
m['head'] = h2; json.dump(m, open(PATH, 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
