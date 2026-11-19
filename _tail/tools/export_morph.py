import sys, pickle, json, numpy as np
sys.path.append('/tmp/claude-0/-home-user/13d7a56f-a728-5d74-b9ff-ec01809c14cd/scratchpad')
from vec_tail import *
import export_vec as X   # loc, bez_path, poly_path, f1
d = pickle.load(open('/tmp/morph.pkl', 'rb')); cuts = set(d['cuts'])
frames = []; slot = 0
for f in d['frames']:
    n = 4 if (f['a'] == 0.0 and f['pose'] in cuts) else 1
    frames.append({'d': X.bez_path(f['segs']), 's': slot, 'n': n}); slot += n
assert slot == 36, slot
marks = []
for k in range(9):
    sp = d['spans'][k]
    if not sp: continue
    parts = []
    for m in d['marks'][k]:
        m = np.asarray(m, float)
        if len(m) > 12 and not np.allclose(m[0], m[-1]): m = simplify_closed(np.vstack([m, m[:1]]), 0.2)
        parts.append(X.poly_path(m))
    # старт позы k в слотах: сумма слотов кадров до её ключевого
    s0 = next(fr['s'] for fr, src in zip(frames, d['frames']) if src['pose'] == k and src['a'] == 0.0)
    marks.append({'s': s0, 'n': sp, 'd': ''.join(parts)})
js = ("// Кадры хвоста Мии (владелец, v3.3.292): девять утверждённых кадров «психованного» хвоста (по гифке владельца, векторные силуэты) + промежуточные между ними — то же движение, но 25 кадров/с вместо 6.\n"
      "// Цикл 36 слотов по 40 мс = 1,44 с. Промежуточные кадры (n = 1 слот) получены смешением соседних силуэтов (по знаковому расстоянию); между кадрами 4→5, 5→6 и 7→8 смесь рассыпается — там, как в гифке, резкая смена (ключевой кадр держится 4 слота).\n"
      "// MIA_TAIL_FRAMES: d — контур силуэта (заливка + обводка), s — стартовый слот, n — сколько слотов держится. MIA_TAIL_MARKS: белые штрихи позы (s, n — окно, пока они не ближе 3,5 px к хвосту). Координаты — в системе группы хвоста mia2.\n"
      "// Данные: _tail/tools/morph_frames.py → export_morph.py, руками не правят.\n"
      "export const TAIL_SLOTS = 36\nexport const TAIL_SLOT_MS = 40\nexport const MIA_TAIL_FRAMES = [\n")
for f in frames: js += "  { s: %d, n: %d, d: '%s' },\n" % (f['s'], f['n'], f['d'])
js += "]\nexport const MIA_TAIL_MARKS = [\n"
for m in marks: js += "  { s: %d, n: %d, d: '%s' },\n" % (m['s'], m['n'], m['d'])
js += "]\n"
open('/tmp/miaTailData_morph.js', 'w').write(js); print(len(js), 'байт', len(frames), 'кадров', len(marks), 'штрихов', [m['s'] for m in marks], [m['n'] for m in marks])
