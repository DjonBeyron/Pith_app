# Правая задняя лапа (справа на экране) в рисунке дизайнера без чёрточки-пальца, как у левой: добавляем зеркальную, но запечённую точно по форме лапы
# (штрих → контур, пересечение с заливкой лапы), чтобы линия не выходила за границы; лежит под обводкой лапы (идемпотентно)
import json, re, sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
import pathops
from fontTools.misc.transform import Transform
from optimize_rig import to_d, path_from_d, intersect
f = sys.argv[1] + '/rig_opt.json'
r = json.load(open(f, encoding='utf8')); b = r['parts']['body']
if 'class="toe-r"' in b: print('уже есть'); sys.exit()
ps = re.findall(r'<path [^>]*/>', b)
fill, outline = ps[11], ps[12]
assert 'M442.3 699.6C443.4 716.1' in fill and 'fill="#decefb"' in fill and 'stroke="#582e99"' in outline
paw = path_from_d(re.search(r' d="([^"]*)"', fill).group(1), Transform())
line = path_from_d('M413.5 708C413.5 708 417.2 717 413.2 723', Transform())
line.stroke(5, pathops.LineCap.ROUND_CAP, pathops.LineJoin.ROUND_JOIN, 4); line.convertConicsToQuads()
toe = intersect(line, paw)
tag = f'<path class="toe-r" d="{to_d(toe)}" fill="#bb81f9"/>'
r['parts']['body'] = b.replace(fill, fill + tag, 1)      # между заливкой лапы и её обводкой
json.dump(r, open(f, 'w', encoding='utf8'), ensure_ascii=False); print('добавлена линия пальца на правой задней лапе (внутри формы лапы)')
