import sys, pickle, json
import numpy as np
sys.path.append('/tmp/claude-0/-home-user/13d7a56f-a728-5d74-b9ff-ec01809c14cd/scratchpad')
import export_spine as E
from export_vec import loc, f1, poly_path
from vec_tail import simplify_closed
res = pickle.load(open('/tmp/marks_anchor.pkl', 'rb'))
K = 1 / (4 * E.s * 0.33014)
js = ("// Хвост Мии (владелец, v3.3.289: «мало кадров, хвост зависает, будто подрезан»): 9 ключевых поз «психованного» хвоста по гифке владельца. Каждая поза — хребет (осевая линия хвоста от основания, спрятанного под телом,\n"
      "// до центра круглого кончика: 48 точек, x y подряд, в системе группы хвоста mia2) и внешняя толщина w (с обводкой). Между позами хвост считает miaTailDrive.js на каждом кадре экрана (плавно), а не CSS-переключение.\n"
      "// marks — белые «штрихи движения» и треугольники позы (в позах 1 и 9 их нет): d — контур в тех же координатах, j — номер точки хребта, к которой штрих «приклеен» и вместе с которой движется (поэтому не касается хвоста).\n"
      "// Данные: _tail/tools/spine.py → export_spine2.py, руками не правят.\n"
      "export const MIA_TAIL = [\n")
for k, s_ in enumerate(E.sp):
    q = loc(s_['q']).reshape(-1); marks = []
    for poly, j, p0, t0 in res[k]:
        m = np.asarray(poly, float)
        if len(m) > 12 and not np.allclose(m[0], m[-1]): m = simplify_closed(np.vstack([m, m[:1]]), 0.2)
        marks.append("{ j: %d, d: '%s' }" % (j, poly_path(m)))
    js += "  { w: %s,\n    q: [%s],\n    marks: [%s] },\n" % (round(float(s_['w'] * K), 1), ','.join(f1(x) for x in q), ',\n      '.join(marks))
js += "]\n"
open('/tmp/miaTailData_new.js', 'w').write(js); print(len(js), 'байт')
