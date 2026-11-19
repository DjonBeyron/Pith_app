# Экспорт девяти ключевых кадров хвоста Мии в src/features/pitrace/mia/miaTailData.js (v3.3.293: без промежуточных, только ускорение).
# Запуск из _tail:  python3 -I tools/morph_frames.py  (делает /tmp/morph.pkl)  →  python3 -I tools/export_keys.py   (пути к vec_tail / export_vec — рядом, в tools/)
import sys, os, pickle
import numpy as np
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from vec_tail import *
import export_vec as X
d = pickle.load(open('/tmp/morph.pkl', 'rb'))
keys = [f for f in d['frames'] if f['a'] == 0.0]; assert len(keys) == 9
marks = []
for k in range(9):
    if not d['spans'][k]: continue
    parts = []
    for m in d['marks'][k]:
        m = np.asarray(m, float)
        if len(m) > 12 and not np.allclose(m[0], m[-1]): m = simplify_closed(np.vstack([m, m[:1]]), 0.2)
        parts.append(X.poly_path(m))
    marks.append((k, ''.join(parts)))
js = ("// Кадры хвоста Мии: девять утверждённых кадров «психованного» хвоста по гифке владельца (векторные силуэты), без промежуточных — рисунок не менялся (владелец v3.3.293: «не перерисовывай, просто попробуй ускорить»).\n"
      "// Ускорение — длительность слота в CSS (race-mia.css, --tail-ms). s — номер кадра в цикле, n — сколько слотов виден (1). MIA_TAIL_MARKS: белые штрихи позы (в кадрах 1 и 9 их нет; не ближе 3,5 px к хвосту). Координаты — в системе группы хвоста mia2.\n"
      "// Данные: _tail/tools/morph_frames.py → export_keys.py, руками не правят.\n"
      "export const TAIL_SLOTS = 9\nexport const MIA_TAIL_FRAMES = [\n")
for i, f in enumerate(keys): js += "  { s: %d, n: 1, d: '%s' },\n" % (i, X.bez_path(f['segs']))
js += "]\nexport const MIA_TAIL_MARKS = [\n"
for k, dd in marks: js += "  { s: %d, n: 1, d: '%s' },\n" % (k, dd)
js += "]\n"
open('../src/features/pitrace/mia/miaTailData.js', 'w').write(js)
